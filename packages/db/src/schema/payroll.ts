import {
  pgTable, uuid, varchar, text, integer, bigint, boolean,
  timestamp, date, numeric, index, unique, pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies, plants } from './company.js';
import { users } from './auth.js';
import { chartOfAccounts, journalEntries } from './accounting.js';

// ─── Phase 10 — HR & Payroll module ────────────────────────────────────────
//
// HR covers: departments, employees, attendance, leave management.
// Payroll covers: salary components, structures, pay periods, payslips.
//
// Conventions:
//   • Money in PAISE (bigint mode: 'number'). 1 INR = 100 paise. Never float.
//   • Payroll finalization posts to GL via PostingEngine (payrollTemplate):
//     DR Salary Expense / CR Salary Payable + PF Payable + ESI Payable + TDS Payable.
//   • Leave balances are derived from leave_requests history.
//   • Attendance drives LOP (Loss of Pay) deductions during payslip generation.
//   • PII fields (Aadhaar, PAN, bank details) require hr_manager or payroll_manager permissions.

// ─── Helpers ───────────────────────────────────────────────────────────────

/** A monetary column in paise. bigint avoids the integer paise overflow ceiling. */
const money = (name: string) => bigint(name, { mode: 'number' });

// ─── Enums ───────────────────────────────────────────────────────────────────

export const genderEnum = pgEnum('employee_gender', ['male', 'female', 'other']);

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'absent',
  'half_day',
  'leave',
  'holiday',
  'week_off',
]);

export const leaveRequestStatusEnum = pgEnum('leave_request_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'cancelled',
]);

// ─── Table: departments ──────────────────────────────────────────────────────
//
// Proper master table for organizational departments.
// Replaces the varchar `department` field on employees.

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    /** Head of department (self-referencing employees would be circular, use userId) */
    headUserId: uuid('head_user_id').references(() => users.id),

    isActive: boolean('is_active').default(true).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('departments_company_code_uq').on(t.companyId, t.code),
    companyIdx: index('departments_company_idx').on(t.companyId),
  })
);

// ─── Table: employees ────────────────────────────────────────────────────────

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    plantId: uuid('plant_id').references(() => plants.id),
    userId: uuid('user_id').references(() => users.id), // Optional link to app user

    employeeNumber: varchar('employee_number', { length: 50 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 20 }),

    // ── Organization ──────────────────────────────────────────────────────
    designation: varchar('designation', { length: 100 }),
    /** FK to departments master (replaces old varchar department) */
    departmentId: uuid('department_id').references(() => departments.id),
    /** Kept for backward compat / free-text override; prefer departmentId */
    department: varchar('department', { length: 100 }),

    // ── Personal details (HR) ─────────────────────────────────────────────
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),
    maritalStatus: varchar('marital_status', { length: 20 }),
    bloodGroup: varchar('blood_group', { length: 5 }),
    currentAddress: text('current_address'),
    permanentAddress: text('permanent_address'),
    emergencyContactName: varchar('emergency_contact_name', { length: 255 }),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),

    // ── Employment ────────────────────────────────────────────────────────
    dateOfJoining: date('date_of_joining').notNull(),
    dateOfExit: date('date_of_exit'),
    exitReason: text('exit_reason'),
    isActive: boolean('is_active').default(true).notNull(),

    // ── Payroll info ──────────────────────────────────────────────────────
    baseSalaryPaise: money('base_salary_paise').default(0).notNull(),
    bankAccountName: varchar('bank_account_name', { length: 255 }),
    bankAccountNumber: varchar('bank_account_number', { length: 50 }),
    ifscCode: varchar('ifsc_code', { length: 20 }),
    bankName: varchar('bank_name', { length: 255 }),
    pan: varchar('pan', { length: 10 }),

    // ── Statutory (Indian compliance) ─────────────────────────────────────
    /** 12-digit Aadhaar for PF/ESI enrollment */
    aadhaarNumber: varchar('aadhaar_number', { length: 12 }),
    /** Universal Account Number for EPF */
    uanNumber: varchar('uan_number', { length: 22 }),
    /** Employee State Insurance number */
    esiNumber: varchar('esi_number', { length: 17 }),
    /** PF member number (establishment + member) */
    pfNumber: varchar('pf_number', { length: 30 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueEmpNum: unique('employees_number_uq').on(t.companyId, t.employeeNumber),
    companyIdx: index('employees_company_idx').on(t.companyId),
    departmentIdx: index('employees_department_idx').on(t.departmentId),
    userIdx: index('employees_user_idx').on(t.userId),
  })
);

// ─── Table: attendance_logs ──────────────────────────────────────────────────
//
// One row per employee per day. Drives LOP deductions in payroll.

export const attendanceLogs = pgTable(
  'attendance_logs',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),

    date: date('date').notNull(),
    status: attendanceStatusEnum('status').default('present').notNull(),

    checkInTime: timestamp('check_in_time', { withTimezone: true }),
    checkOutTime: timestamp('check_out_time', { withTimezone: true }),
    workedHours: numeric('worked_hours', { precision: 5, scale: 2 }),

    remarks: text('remarks'),
    markedBy: uuid('marked_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueEmpDate: unique('attendance_logs_emp_date_uq').on(t.employeeId, t.date),
    companyDateIdx: index('attendance_logs_company_date_idx').on(t.companyId, t.date),
    employeeIdx: index('attendance_logs_employee_idx').on(t.employeeId),
  })
);

// ─── Table: leave_types ──────────────────────────────────────────────────────
//
// Master: CL (Casual Leave), SL (Sick Leave), EL (Earned Leave),
// ML (Maternity Leave), etc.

export const leaveTypes = pgTable(
  'leave_types',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 10 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),

    /** Number of days credited per year */
    annualQuota: integer('annual_quota').default(0).notNull(),
    /** Whether unused days carry forward to next FY */
    isCarryForward: boolean('is_carry_forward').default(false).notNull(),
    /** Max days that can carry forward (0 = no limit if isCarryForward) */
    maxCarryForward: integer('max_carry_forward').default(0).notNull(),
    /** If false, absence counts as LOP (loss of pay) */
    isPaidLeave: boolean('is_paid_leave').default(true).notNull(),

    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('leave_types_company_code_uq').on(t.companyId, t.code),
    companyIdx: index('leave_types_company_idx').on(t.companyId),
  })
);

// ─── Table: leave_balances ───────────────────────────────────────────────────
//
// Per-employee per-leave-type per-fiscal-year balance tracking.
// currentBalance = openingBalance + credited - used.

export const leaveBalances = pgTable(
  'leave_balances',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    leaveTypeId: uuid('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'cascade' }),

    fiscalYear: varchar('fiscal_year', { length: 5 }).notNull(),
    openingBalance: numeric('opening_balance', { precision: 5, scale: 2 }).default('0').notNull(),
    credited: numeric('credited', { precision: 5, scale: 2 }).default('0').notNull(),
    used: numeric('used', { precision: 5, scale: 2 }).default('0').notNull(),
    carriedForward: numeric('carried_forward', { precision: 5, scale: 2 }).default('0').notNull(),
    currentBalance: numeric('current_balance', { precision: 5, scale: 2 }).default('0').notNull(),
  },
  (t) => ({
    uniqueBalance: unique('leave_balances_emp_type_fy_uq').on(t.employeeId, t.leaveTypeId, t.fiscalYear),
    employeeIdx: index('leave_balances_employee_idx').on(t.employeeId),
  })
);

// ─── Table: leave_requests ───────────────────────────────────────────────────
//
// Employee leave applications. Follows standard workflow:
//   draft → submitted → approved/rejected → cancelled
// On approval, deducts from leave_balances and marks attendance as 'leave'.

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    leaveTypeId: uuid('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id),

    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    /** Calculated number of leave days (supports half-day) */
    numberOfDays: numeric('number_of_days', { precision: 5, scale: 2 }).notNull(),
    reason: text('reason'),

    status: leaveRequestStatusEnum('status').default('draft').notNull(),

    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedBy: uuid('rejected_by').references(() => users.id),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('leave_requests_company_idx').on(t.companyId),
    employeeIdx: index('leave_requests_employee_idx').on(t.employeeId),
    dateRangeIdx: index('leave_requests_date_range_idx').on(t.fromDate, t.toDate),
    statusIdx: index('leave_requests_status_idx').on(t.status),
  })
);

// ─── Table: salary_components ────────────────────────────────────────────────

export const salaryComponents = pgTable(
  'salary_components',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    /** earning | deduction */
    type: varchar('type', { length: 20 }).notNull(),
    
    // GL Account mapping
    accountId: uuid('account_id').notNull().references(() => chartOfAccounts.id),

    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('salary_components_code_uq').on(t.companyId, t.code),
  })
);

// ─── Table: employee_salary_structures ───────────────────────────────────────

export const employeeSalaryStructures = pgTable(
  'employee_salary_structures',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id').notNull().references(() => salaryComponents.id),
    amountPaise: money('amount_paise').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    empIdx: index('ess_emp_idx').on(t.employeeId),
  })
);

// ─── Table: pay_periods ──────────────────────────────────────────────────────

export const payPeriods = pgTable(
  'pay_periods',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(), // e.g., 'October 2026'
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    /** draft | processed | paid | closed */
    status: varchar('status', { length: 20 }).default('draft').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  }
);

// ─── Table: payslips ─────────────────────────────────────────────────────────

export const payslips = pgTable(
  'payslips',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    payPeriodId: uuid('pay_period_id').notNull().references(() => payPeriods.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull().references(() => employees.id),
    
    // ── Attendance-driven ─────────────────────────────────────────────────
    totalWorkingDays: integer('total_working_days').default(0).notNull(),
    daysPresent: integer('days_present').default(0).notNull(),
    daysAbsent: integer('days_absent').default(0).notNull(),
    leaveDays: integer('leave_days').default(0).notNull(),
    lopDays: integer('lop_days').default(0).notNull(),

    // ── Amounts ───────────────────────────────────────────────────────────
    totalEarningsPaise: money('total_earnings_paise').default(0).notNull(),
    totalDeductionsPaise: money('total_deductions_paise').default(0).notNull(),
    netPayPaise: money('net_pay_paise').default(0).notNull(),

    // ── Statutory deductions (broken out for reporting) ────────────────────
    employeePfPaise: money('employee_pf_paise').default(0).notNull(),
    employerPfPaise: money('employer_pf_paise').default(0).notNull(),
    employeeEsiPaise: money('employee_esi_paise').default(0).notNull(),
    employerEsiPaise: money('employer_esi_paise').default(0).notNull(),
    professionalTaxPaise: money('professional_tax_paise').default(0).notNull(),
    tdsPaise: money('tds_paise').default(0).notNull(),

    /** GL entry created when payslip is processed */
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),

    /** draft | processed | paid */
    status: varchar('status', { length: 20 }).default('draft').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    periodEmpIdx: index('payslips_period_emp_idx').on(t.payPeriodId, t.employeeId),
  })
);

export const payslipLines = pgTable(
  'payslip_lines',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    payslipId: uuid('payslip_id').notNull().references(() => payslips.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id').notNull().references(() => salaryComponents.id),
    amountPaise: money('amount_paise').notNull(),
  },
  (t) => ({ payslipIdx: index('payslip_lines_payslip_idx').on(t.payslipId) })
);

// ─── Drizzle inference types ───────────────────────────────────────────────

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type AttendanceLog = typeof attendanceLogs.$inferSelect;
export type NewAttendanceLog = typeof attendanceLogs.$inferInsert;
export type LeaveType = typeof leaveTypes.$inferSelect;
export type NewLeaveType = typeof leaveTypes.$inferInsert;
export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type NewLeaveBalance = typeof leaveBalances.$inferInsert;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;
export type SalaryComponent = typeof salaryComponents.$inferSelect;
export type NewSalaryComponent = typeof salaryComponents.$inferInsert;
export type EmployeeSalaryStructure = typeof employeeSalaryStructures.$inferSelect;
export type PayPeriod = typeof payPeriods.$inferSelect;
export type Payslip = typeof payslips.$inferSelect;
export type NewPayslip = typeof payslips.$inferInsert;
export type PayslipLine = typeof payslipLines.$inferSelect;
