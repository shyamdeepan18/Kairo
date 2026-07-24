import { eq, and } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { db, documentTypeConfig } from '@erp/db';
import type { L1Config, L1FieldConfig, L2FieldDef, L2Fields } from '@erp/db';

export type { L1Config, L1FieldConfig, L2FieldDef };

// ─── Public shapes ─────────────────────────────────────────────────────────

export interface ResolvedConfig {
  /** Header field configs keyed by fieldName (system defaults merged with company overrides) */
  l1: Record<string, L1FieldConfig>;
  /** Line item field configs */
  l1Line: Record<string, L1FieldConfig>;
  /** Custom header field definitions */
  l2Header: L2FieldDef[];
  /** Custom line-item field definitions */
  l2Line: L2FieldDef[];
}

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

// ─── System defaults ────────────────────────────────────────────────────────
//
// Applied when a company has not created a document_type_config row yet.
// All fields are visible and none are required beyond what the module itself
// enforces at the DB level.
//
// Module-specific defaults can be added here as needed in Phase 6+.

const SYSTEM_DEFAULTS: Record<string, L1Config> = {
  'purchase.po': {
    fields: {
      deliveryDate: { visible: true, required: false },
      referenceNumber: { visible: true, required: false },
      remarks: { visible: true, required: false },
    },
    lineFields: {
      lotNumber: { visible: false, required: false },
      remarks: { visible: true, required: false },
    },
  },
};

// ─── DocumentConfigService ─────────────────────────────────────────────────

export class DocumentConfigService {
  private readonly TTL_SECONDS = 5 * 60; // 5 minutes
  private readonly CACHE_PREFIX = 'doc_cfg:';

  constructor(private redis: Redis) {}

  // ── Resolve config ────────────────────────────────────────────────────────

  /**
   * Returns the merged L1 + L2 config for a (company, documentType) pair.
   * Checks Redis first; falls back to DB; caches the result.
   *
   * Use this in:
   *   - API route handlers to know which fields to validate
   *   - Frontend config endpoints that drive form rendering
   */
  async getConfig(companyId: string, documentType: string): Promise<ResolvedConfig> {
    const cacheKey = `${this.CACHE_PREFIX}${companyId}:${documentType}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as ResolvedConfig;

    const resolved = await this.compute(companyId, documentType);
    await this.redis.setex(cacheKey, this.TTL_SECONDS, JSON.stringify(resolved));
    return resolved;
  }

  /** Convenience: get L1 config for a single field (returns safe defaults if not found) */
  async getFieldConfig(
    companyId: string,
    documentType: string,
    fieldName: string,
    scope: 'header' | 'line' = 'header'
  ): Promise<L1FieldConfig> {
    const config = await this.getConfig(companyId, documentType);
    const map = scope === 'header' ? config.l1 : config.l1Line;
    return map[fieldName] ?? { visible: true, required: false };
  }

  /** Convenience: get all L2 custom field definitions for a scope */
  async getL2Fields(
    companyId: string,
    documentType: string,
    scope: 'header' | 'line'
  ): Promise<L2FieldDef[]> {
    const config = await this.getConfig(companyId, documentType);
    return scope === 'header' ? config.l2Header : config.l2Line;
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Validates custom_data values against the L2 field definitions.
   * Call this in route handlers before inserting / updating a document.
   *
   * @param customData  The `custom_data` JSONB value from the request body
   * @param scope       'header' | 'line'
   */
  async validateCustomData(
    companyId: string,
    documentType: string,
    customData: Record<string, unknown>,
    scope: 'header' | 'line'
  ): Promise<ValidationResult> {
    const fields = await this.getL2Fields(companyId, documentType, scope);
    const errors: Record<string, string> = {};

    for (const field of fields) {
      const value = customData?.[field.fieldName];

      // Required check
      if (field.required && (value === undefined || value === null || value === '')) {
        errors[field.fieldName] = `${field.label} is required`;
        continue;
      }

      if (value === undefined || value === null) continue;

      // Type-specific validation
      const v = field.validations;
      switch (field.fieldType) {
        case 'text':
        case 'textarea':
          if (typeof value !== 'string') {
            errors[field.fieldName] = `${field.label} must be a string`;
          } else {
            if (v?.minLength && value.length < v.minLength)
              errors[field.fieldName] = `${field.label} must be at least ${v.minLength} characters`;
            if (v?.maxLength && value.length > v.maxLength)
              errors[field.fieldName] = `${field.label} must be at most ${v.maxLength} characters`;
            if (v?.pattern && !new RegExp(v.pattern).test(value))
              errors[field.fieldName] = `${field.label} format is invalid`;
          }
          break;

        case 'number':
        case 'integer':
        case 'currency':
          if (typeof value !== 'number') {
            errors[field.fieldName] = `${field.label} must be a number`;
          } else {
            if (field.fieldType === 'integer' && !Number.isInteger(value))
              errors[field.fieldName] = `${field.label} must be an integer`;
            if (v?.min !== undefined && value < v.min)
              errors[field.fieldName] = `${field.label} must be ≥ ${v.min}`;
            if (v?.max !== undefined && value > v.max)
              errors[field.fieldName] = `${field.label} must be ≤ ${v.max}`;
          }
          break;

        case 'select':
          if (field.options && !field.options.includes(String(value)))
            errors[field.fieldName] = `${field.label} must be one of: ${field.options.join(', ')}`;
          break;

        case 'multiselect':
          if (!Array.isArray(value)) {
            errors[field.fieldName] = `${field.label} must be an array`;
          } else if (field.options) {
            const invalid = (value as string[]).filter((v) => !field.options!.includes(v));
            if (invalid.length > 0)
              errors[field.fieldName] = `${field.label}: invalid options — ${invalid.join(', ')}`;
          }
          break;

        case 'checkbox':
          if (typeof value !== 'boolean')
            errors[field.fieldName] = `${field.label} must be true or false`;
          break;
      }
    }

    return { ok: Object.keys(errors).length === 0, errors };
  }

  // ── Cache management ──────────────────────────────────────────────────────

  /**
   * Invalidate all cached configs for a company (call after admin saves config changes).
   * Invalidates all document types since we can't cheaply enumerate them.
   */
  async invalidateCompany(companyId: string): Promise<void> {
    const keys = await this.redis.keys(`${this.CACHE_PREFIX}${companyId}:*`);
    if (keys.length > 0) await this.redis.del(...keys);
  }

  /** Invalidate a single (company, documentType) pair */
  async invalidate(companyId: string, documentType: string): Promise<void> {
    await this.redis.del(`${this.CACHE_PREFIX}${companyId}:${documentType}`);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async compute(companyId: string, documentType: string): Promise<ResolvedConfig> {
    // Load company row (may not exist yet — admin hasn't customised this doc type)
    const [row] = await db
      .select()
      .from(documentTypeConfig)
      .where(
        and(
          eq(documentTypeConfig.companyId, companyId),
          eq(documentTypeConfig.documentType, documentType)
        )
      )
      .limit(1);

    // Merge: system defaults + company overrides
    const systemDefaults = SYSTEM_DEFAULTS[documentType] ?? {};
    const companyL1 = row?.l1Config ?? {};
    const companyL2 = row?.l2Fields ?? { fields: [] };

    const mergedFields: Record<string, L1FieldConfig> = {
      ...(systemDefaults.fields ?? {}),
      ...(companyL1.fields ?? {}),
    };

    const mergedLineFields: Record<string, L1FieldConfig> = {
      ...(systemDefaults.lineFields ?? {}),
      ...(companyL1.lineFields ?? {}),
    };

    const l2Header = companyL2.fields.filter((f) => f.scope === 'header');
    const l2Line = companyL2.fields.filter((f) => f.scope === 'line');

    return {
      l1: mergedFields,
      l1Line: mergedLineFields,
      l2Header,
      l2Line,
    };
  }
}
