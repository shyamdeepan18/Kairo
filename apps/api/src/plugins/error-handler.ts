import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';

export interface DbError extends Error {
  code?: string;
  constraint_name?: string;
  table_name?: string;
  detail?: string;
  column_name?: string;
  schema_name?: string;
}

const CONSTRAINT_MESSAGES: Record<string, (val: string) => string> = {
  // Purchasing & Master Data
  suppliers_company_code_uq: (val) =>
    `Vendor / Supplier code ${val ? `'${val}' ` : ''}already exists for this company. Please choose a different vendor code.`,
  customers_company_code_uq: (val) =>
    `Customer code ${val ? `'${val}' ` : ''}already exists for this company. Please choose a different customer code.`,
  items_code_company_uq: (val) =>
    `Item code ${val ? `'${val}' ` : ''}already exists for this company. Please choose a different item code.`,
  item_groups_code_uq: (val) =>
    `Item group code ${val ? `'${val}' ` : ''}already exists for this company.`,
  uom_company_code_uq: (val) =>
    `Unit of measure code ${val ? `'${val}' ` : ''}already exists.`,
  uom_conversions_uq: () =>
    `A conversion between these units of measure already exists for this item.`,
  item_batches_number_uq: (val) =>
    `Batch number ${val ? `'${val}' ` : ''}already exists for this item.`,
  item_serials_number_uq: (val) =>
    `Serial number ${val ? `'${val}' ` : ''}already exists for this item.`,
  warehouses_company_code_uq: (val) =>
    `Warehouse code ${val ? `'${val}' ` : ''}already exists for this plant.`,
  plants_company_code_uq: (val) =>
    `Plant code ${val ? `'${val}' ` : ''}already exists for this company.`,
  chart_of_accounts_code_company_uq: (val) =>
    `Chart of Accounts code ${val ? `'${val}' ` : ''}already exists for this company.`,
  tax_codes_company_code_uq: (val) =>
    `Tax code ${val ? `'${val}' ` : ''}already exists for this company.`,
  bank_accounts_company_accno_uq: (val) =>
    `Bank account number ${val ? `'${val}' ` : ''}already exists for this company.`,
  projects_company_code_uq: (val) =>
    `Project code ${val ? `'${val}' ` : ''}already exists for this company.`,
  cost_groups_company_code_uq: (val) =>
    `Cost group code ${val ? `'${val}' ` : ''}already exists for this company.`,
  work_centers_company_code_uq: (val) =>
    `Work center code ${val ? `'${val}' ` : ''}already exists for this company.`,
  production_formulas_code_version_uq: (val) =>
    `Production formula code ${val ? `'${val}' ` : ''}already exists for this company.`,
  price_lists_company_code_uq: (val) =>
    `Price list code ${val ? `'${val}' ` : ''}already exists for this company.`,
  users_email_uq: (val) =>
    `A user with email ${val ? `'${val}' ` : ''}already exists.`,
  users_email_unique: (val) =>
    `A user with email ${val ? `'${val}' ` : ''}already exists.`,
  departments_company_code_uq: (val) =>
    `Department code ${val ? `'${val}' ` : ''}already exists for this company.`,
  employees_number_uq: (val) =>
    `Employee number ${val ? `'${val}' ` : ''}already exists for this company.`,
  document_number_series_uq: () =>
    `A number series with this prefix or configuration already exists.`,
  company_modules_company_module_uq: () =>
    `This module is already configured for this company.`,
};

function formatDuplicateMessage(err: DbError): string {
  const constraint = err.constraint_name || '';
  const detail = err.detail || '';
  const table = err.table_name || '';

  let field = 'identifier';
  let value = '';

  // Extract from detail: "Key (company_id, supplier_code)=(..., SUP-001) already exists."
  const match = detail.match(/Key \((.*?)\)=\((.*?)\) already exists/i);
  if (match) {
    const cols = match[1].split(',').map((s) => s.trim());
    const vals = match[2].split(',').map((s) => s.trim());
    const targetIdx = cols.findIndex((c) => !c.includes('company_id') && !c.includes('tenant_id'));
    if (targetIdx !== -1) {
      field = cols[targetIdx].replace(/_/g, ' ');
      value = vals[targetIdx] || '';
    } else {
      field = cols[cols.length - 1].replace(/_/g, ' ');
      value = vals[vals.length - 1] || '';
    }
  }

  if (constraint && CONSTRAINT_MESSAGES[constraint]) {
    return CONSTRAINT_MESSAGES[constraint](value);
  }

  // Document number unique constraints (e.g. purchase_orders_number_uq, sales_orders_number_uq)
  if (constraint.includes('number_uq') || constraint.includes('_number_')) {
    const docName = constraint.replace(/_number_uq|_uq/g, '').replace(/_/g, ' ');
    return `Document number ${value ? `'${value}' ` : ''}already exists for this ${docName}. Please use a unique document number.`;
  }

  if (table && value) {
    return `A duplicate record already exists in ${table.replace(/_/g, ' ')} with ${field} '${value}'. Please provide a unique value.`;
  }

  return `A duplicate record already exists with this ${field}${value ? ` '${value}'` : ''}. Please provide a unique value.`;
}

export default fp(async (app: FastifyInstance) => {
  app.setErrorHandler((error: FastifyError | DbError, request: FastifyRequest, reply: FastifyReply) => {
    // 1. PostgreSQL Unique Violation (23505)
    if (error.code === '23505') {
      const msg = formatDuplicateMessage(error as DbError);
      return reply.code(409).send({
        statusCode: 409,
        error: msg,
        message: msg,
        code: 'DUPLICATE_ENTITY',
        constraint: (error as DbError).constraint_name,
        detail: (error as DbError).detail,
      });
    }

    // 2. PostgreSQL Foreign Key Violation (23503)
    if (error.code === '23503') {
      const msg = 'Cannot complete operation: the record is referenced by other documents or references an entity that does not exist.';
      return reply.code(409).send({
        statusCode: 409,
        error: msg,
        message: msg,
        code: 'FOREIGN_KEY_VIOLATION',
        detail: (error as DbError).detail,
      });
    }

    // 3. PostgreSQL Check Violation (23514)
    if (error.code === '23514') {
      const msg = 'Validation error: submitted values violate database integrity checks.';
      return reply.code(400).send({
        statusCode: 400,
        error: msg,
        message: msg,
        code: 'CHECK_VIOLATION',
        detail: (error as DbError).detail,
      });
    }

    // 4. PostgreSQL Not-Null Violation (23502)
    if (error.code === '23502') {
      const col = (error as DbError).column_name ? `field '${(error as DbError).column_name}'` : 'a required field';
      const msg = `Missing required data: ${col} cannot be empty.`;
      return reply.code(400).send({
        statusCode: 400,
        error: msg,
        message: msg,
        code: 'NOT_NULL_VIOLATION',
        detail: (error as DbError).detail,
      });
    }

    // 5. PostgreSQL Invalid UUID / Text Representation (22P02)
    if (error.code === '22P02') {
      const msg = 'Invalid identifier format: one or more provided IDs are not valid UUIDs.';
      return reply.code(400).send({
        statusCode: 400,
        error: msg,
        message: msg,
        code: 'INVALID_UUID',
        detail: (error as DbError).detail,
      });
    }

    // 6. Fastify Schema Validation Error
    if ((error as FastifyError).validation) {
      return reply.code(400).send({
        statusCode: 400,
        error: error.message,
        message: error.message,
        issues: (error as FastifyError).validation,
      });
    }

    // 7. Explicit HTTP errors with statusCode < 500
    if ((error as FastifyError).statusCode && (error as FastifyError).statusCode! < 500) {
      return reply.code((error as FastifyError).statusCode!).send({
        statusCode: (error as FastifyError).statusCode,
        error: error.message,
        message: error.message,
      });
    }

    // 8. Unhandled server errors (500)
    request.log.error(error);
    const serverMessage = process.env.NODE_ENV === 'production'
      ? 'An unexpected internal server error occurred.'
      : error.message || 'Internal Server Error';

    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: serverMessage,
    });
  });
});

