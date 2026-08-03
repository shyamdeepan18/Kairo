import { eq } from 'drizzle-orm';
import { db, journalEntries, journalEntryLines } from '@erp/db';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@erp/db';
import type { PostingCategory } from '@erp/db';
import type { AccountMap } from './account-map.js';
import type { NumberSeriesService } from './number-series.js';

type DB = PostgresJsDatabase<typeof schema>;

// ─── Posting context ───────────────────────────────────────────────────────
//
// Passed from the module route handler into PostingEngine.post().
// Contains everything a posting template needs to generate GL lines.

export interface PostingContext {
  companyId: string;
  plantId?: string;
  documentType: string;
  documentId: string;
  documentNumber: string;
  postingDate: Date;
  fiscalYear: string;
  /** 1–12. April = 1 for Indian FY. Use fiscalPeriod() helper. */
  period: number;
  currency?: string;

  /** Document header fields (amounts in paise) */
  header: Record<string, unknown>;
  /** Document line items (amounts in paise) */
  lines: Array<Record<string, unknown>>;
  /** Pre-computed tax breakdown (populated by Tax Engine in Phase 4) */
  taxLines?: TaxLine[];
}

export interface TaxLine {
  taxCode: string;
  taxType: 'cgst' | 'sgst' | 'igst' | 'cess';
  baseAmountPaise: number;
  taxAmountPaise: number;
}

// ─── Raw journal line ──────────────────────────────────────────────────────
//
// Emitted by posting templates. Uses PostingCategory (not raw account UUIDs)
// so templates stay portable across companies.

export interface RawJournalLine {
  accountCategory: PostingCategory;
  /** Paise. Set one of debitPaise / creditPaise; leave the other 0. */
  debitPaise: number;
  creditPaise: number;
  partyType?: 'supplier' | 'customer';
  partyId?: string;
  narration?: string;
  taxCode?: string;
}

// ─── Posting template function type ───────────────────────────────────────
//
// Each document type registers a function of this signature.
// It reads PostingContext, resolves accounts from accountMap, and returns
// the lines to post. It must NOT interact with the database.

export type PostingTemplateFn = (
  ctx: PostingContext,
  accountMap: AccountMap
) => RawJournalLine[];

// ─── PostingImbalanceError ─────────────────────────────────────────────────

export class PostingImbalanceError extends Error {
  constructor(
    documentType: string,
    totalDebitPaise: number,
    totalCreditPaise: number
  ) {
    super(
      `Posting imbalance for ${documentType}: ` +
      `DR ${totalDebitPaise} paise ≠ CR ${totalCreditPaise} paise ` +
      `(diff = ${totalDebitPaise - totalCreditPaise} paise = ₹${
        ((totalDebitPaise - totalCreditPaise) / 100).toFixed(2)
      })`
    );
    this.name = 'PostingImbalanceError';
  }
}

// ─── Fiscal period helper ──────────────────────────────────────────────────
//
// Indian FY: April 1 – March 31.
// April = period 1, May = 2, … March = 12.

export function fiscalPeriod(date: Date): { fiscalYear: string; period: number } {
  const month = date.getMonth() + 1; // 1-indexed
  const year = date.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  const fiscalYear = `${String(fyStart).slice(-2)}${String(fyEnd).slice(-2)}`;
  const period = month >= 4 ? month - 3 : month + 9;
  return { fiscalYear, period };
}

// ─── PostingEngine ─────────────────────────────────────────────────────────

export class PostingEngine {
  private templates = new Map<string, PostingTemplateFn>();

  constructor(
    private readonly accountMapService: import('./account-map.js').AccountMapService,
    private readonly numberSeriesService: NumberSeriesService
  ) {}

  // ── Template registry ────────────────────────────────────────────────────

  /**
   * Register a posting template for a document type.
   * Call this once at startup (in the accounting plugin or module initialiser).
   *
   * @example
   *   postingEngine.register('purchase.grn', purchaseGrnTemplate);
   */
  register(documentType: string, template: PostingTemplateFn): void {
    this.templates.set(documentType, template);
  }

  isRegistered(documentType: string): boolean {
    return this.templates.has(documentType);
  }

  // ── Post ─────────────────────────────────────────────────────────────────

  /**
   * Generate GL entries for an approved document and persist them.
   *
   * MUST be called inside the same db.transaction() as the document status
   * update — so both the document and the GL entries are committed atomically.
   *
   * @returns journalEntry.id of the created entry
   */
  async post(
    tx: any,
    ctx: PostingContext,
    performedBy: string
  ): Promise<string> {
    const template = this.templates.get(ctx.documentType);
    if (!template) {
      throw new Error(
        `No posting template registered for documentType="${ctx.documentType}". ` +
        `Call postingEngine.register('${ctx.documentType}', templateFn) at startup.`
      );
    }

    // Resolve posting categories → account UUIDs
    const accountMap = await this.accountMapService.getMap(ctx.companyId, ctx.plantId);

    // Run the template (pure function — no DB access)
    const rawLines = template(ctx, accountMap);

    // Validate double-entry invariant before touching the DB
    this.assertBalanced(ctx.documentType, rawLines);

    // Resolve categories to account IDs now that we know it balances
    const resolvedLines = rawLines.map((line) => ({
      accountId: accountMap.resolve(line.accountCategory),
      debitAmountPaise: line.debitPaise,
      creditAmountPaise: line.creditPaise,
      partyType: line.partyType,
      partyId: line.partyId,
      narration: line.narration,
      taxCode: line.taxCode,
    }));

    // Generate entry number atomically
    const entryNumber = await this.numberSeriesService.next(
      tx,
      ctx.companyId,
      'accounting.jv',
      { fiscalYear: ctx.fiscalYear }
    );

    const postingDate = ctx.postingDate instanceof Date
      ? ctx.postingDate.toISOString().slice(0, 10)
      : ctx.postingDate;

    // Insert journal entry header
    const [entry] = await tx.insert(journalEntries).values({
      companyId: ctx.companyId,
      plantId: ctx.plantId,
      documentType: ctx.documentType,
      documentId: ctx.documentId,
      documentNumber: ctx.documentNumber,
      entryNumber,
      postingDate: postingDate as any,
      fiscalYear: ctx.fiscalYear,
      period: ctx.period,
      currency: ctx.currency ?? 'INR',
      status: 'posted',
      createdBy: performedBy,
    }).returning({ id: journalEntries.id });

    // Insert all lines
    await tx.insert(journalEntryLines).values(
      resolvedLines.map((line, i) => ({
        journalEntryId: entry.id,
        lineNumber: i + 1,
        ...line,
      }))
    );

    return entry.id;
  }

  // ── Reverse ───────────────────────────────────────────────────────────────

  /**
   * Create a reversal entry that exactly cancels an existing journal entry.
   * Every DR↔CR is swapped; narration gets "[REVERSAL]" prefix.
   *
   * Called by document cancellation handlers.
   * Must be inside the same transaction as the document status update.
   *
   * @returns journalEntry.id of the new reversal entry
   */
  async reverse(
    tx: any,
    originalEntryId: string,
    postingDate: Date,
    performedBy: string,
    remarks: string
  ): Promise<string> {
    // Load original entry + lines
    const [original] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, originalEntryId))
      .limit(1);

    if (!original) throw new Error(`Journal entry ${originalEntryId} not found`);
    if (original.isReversed) {
      throw new Error(`Journal entry ${originalEntryId} is already reversed`);
    }

    const originalLines = await db
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, originalEntryId));

    const { fiscalYear, period } = fiscalPeriod(postingDate);
    const reversalDate = postingDate.toISOString().slice(0, 10);

    // Generate reversal entry number
    const entryNumber = await this.numberSeriesService.next(
      tx,
      original.companyId,
      'accounting.jv',
      { fiscalYear }
    );

    // Insert reversal entry header
    const [reversal] = await tx.insert(journalEntries).values({
      companyId: original.companyId,
      plantId: original.plantId,
      documentType: original.documentType,
      documentId: original.documentId,
      documentNumber: original.documentNumber,
      entryNumber,
      postingDate: reversalDate as any,
      fiscalYear,
      period,
      currency: original.currency,
      narration: `[REVERSAL] ${remarks || ''}`.trim(),
      status: 'posted',
      reversalOf: originalEntryId,
      createdBy: performedBy,
    }).returning({ id: journalEntries.id });

    // Insert swapped lines (DR↔CR)
    await tx.insert(journalEntryLines).values(
      originalLines.map((line, i) => ({
        journalEntryId: reversal.id,
        lineNumber: i + 1,
        accountId: line.accountId,
        debitAmountPaise: line.creditAmountPaise,   // swapped
        creditAmountPaise: line.debitAmountPaise,   // swapped
        partyType: line.partyType,
        partyId: line.partyId,
        taxCode: line.taxCode,
        narration: line.narration,
      }))
    );

    // Mark original as reversed
    await tx.update(journalEntries)
      .set({ isReversed: true, reversedBy: reversal.id, status: 'reversed' })
      .where(eq(journalEntries.id, originalEntryId));

    return reversal.id;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private assertBalanced(documentType: string, lines: RawJournalLine[]): void {
    const totalDebits = lines.reduce((s, l) => s + l.debitPaise, 0);
    const totalCredits = lines.reduce((s, l) => s + l.creditPaise, 0);
    if (totalDebits !== totalCredits) {
      throw new PostingImbalanceError(documentType, totalDebits, totalCredits);
    }
  }
}
