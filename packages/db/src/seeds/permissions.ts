import { db, permissions, roles, rolePermissions } from '../index.js';
import { eq } from 'drizzle-orm';

/**
 * Seed: all system permission codes + default system roles.
 *
 * Run once after initial migration:
 *   npx tsx packages/db/src/seeds/permissions.ts
 *
 * Safe to re-run — uses upsert logic (insert on conflict do nothing).
 */

// ─── Permission definitions ──────────────────────────────────────────────────

const PERMISSIONS = [
  // ── Auth & user management ─────────────────────────────────────────────────
  { code: 'auth.users.view',         module: 'auth',         documentType: 'users',    action: 'view',        label: 'View users' },
  { code: 'auth.users.create',       module: 'auth',         documentType: 'users',    action: 'create',      label: 'Create users' },
  { code: 'auth.users.edit',         module: 'auth',         documentType: 'users',    action: 'edit',        label: 'Edit users' },
  { code: 'auth.users.deactivate',   module: 'auth',         documentType: 'users',    action: 'deactivate',  label: 'Deactivate users' },
  { code: 'auth.roles.view',         module: 'auth',         documentType: 'roles',    action: 'view',        label: 'View roles' },
  { code: 'auth.roles.manage',       module: 'auth',         documentType: 'roles',    action: 'manage',      label: 'Create / edit roles' },
  { code: 'auth.permissions.manage', module: 'auth',         documentType: null,       action: 'manage',      label: 'Assign permissions' },

  // ── Settings ───────────────────────────────────────────────────────────────
  { code: 'settings.company.view',       module: 'settings', documentType: 'company',   action: 'view',   label: 'View company settings' },
  { code: 'settings.company.edit',       module: 'settings', documentType: 'company',   action: 'edit',   label: 'Edit company settings' },
  { code: 'settings.plant.create',       module: 'settings', documentType: 'plant',     action: 'create', label: 'Create plants' },
  { code: 'settings.plant.edit',         module: 'settings', documentType: 'plant',     action: 'edit',   label: 'Edit plants' },
  { code: 'settings.warehouse.create',   module: 'settings', documentType: 'warehouse', action: 'create', label: 'Create warehouses' },
  { code: 'settings.warehouse.edit',     module: 'settings', documentType: 'warehouse', action: 'edit',   label: 'Edit warehouses' },
  { code: 'settings.approvalworkflow.view',   module: 'settings', documentType: 'approvalworkflow', action: 'view',   label: 'View approval workflows' },
  { code: 'settings.approvalworkflow.manage', module: 'settings', documentType: 'approvalworkflow', action: 'manage', label: 'Manage approval workflows' },
  { code: 'settings.license.view',       module: 'settings', documentType: 'license',   action: 'view',   label: 'View modules & license' },
  { code: 'settings.license.manage',     module: 'settings', documentType: 'license',   action: 'manage', label: 'Manage module activation & license' },

  // ── Purchase (Phase 6) ─────────────────────────────────────────────────────
  { code: 'purchase.requisition.view',    module: 'purchase', documentType: 'requisition', action: 'view',    label: 'View purchase requisitions' },
  { code: 'purchase.requisition.create',  module: 'purchase', documentType: 'requisition', action: 'create',  label: 'Create purchase requisitions' },
  { code: 'purchase.requisition.submit',  module: 'purchase', documentType: 'requisition', action: 'submit',  label: 'Submit purchase requisitions' },
  { code: 'purchase.requisition.approve', module: 'purchase', documentType: 'requisition', action: 'approve', label: 'Approve purchase requisitions' },
  { code: 'purchase.requisition.cancel',  module: 'purchase', documentType: 'requisition', action: 'cancel',  label: 'Cancel purchase requisitions' },
  { code: 'purchase.po.view',             module: 'purchase', documentType: 'po',           action: 'view',    label: 'View purchase orders' },
  { code: 'purchase.po.create',           module: 'purchase', documentType: 'po',           action: 'create',  label: 'Create purchase orders' },
  { code: 'purchase.po.edit',             module: 'purchase', documentType: 'po',           action: 'edit',    label: 'Edit purchase orders' },
  { code: 'purchase.po.submit',           module: 'purchase', documentType: 'po',           action: 'submit',  label: 'Submit purchase orders' },
  { code: 'purchase.po.approve',          module: 'purchase', documentType: 'po',           action: 'approve', label: 'Approve purchase orders' },
  { code: 'purchase.po.cancel',           module: 'purchase', documentType: 'po',           action: 'cancel',  label: 'Cancel purchase orders' },
  { code: 'purchase.grn.view',            module: 'purchase', documentType: 'grn',          action: 'view',    label: 'View goods receipt notes' },
  { code: 'purchase.grn.create',          module: 'purchase', documentType: 'grn',          action: 'create',  label: 'Create goods receipt notes' },
  { code: 'purchase.grn.submit',          module: 'purchase', documentType: 'grn',          action: 'submit',  label: 'Submit goods receipt notes' },
  { code: 'purchase.invoice.view',        module: 'purchase', documentType: 'invoice',      action: 'view',    label: 'View purchase invoices' },
  { code: 'purchase.invoice.create',      module: 'purchase', documentType: 'invoice',      action: 'create',  label: 'Create purchase invoices' },
  { code: 'purchase.invoice.approve',     module: 'purchase', documentType: 'invoice',      action: 'approve', label: 'Approve purchase invoices' },
  { code: 'purchase.payment.create',      module: 'purchase', documentType: 'payment',      action: 'create',  label: 'Create purchase payments' },
  { code: 'purchase.payment.approve',     module: 'purchase', documentType: 'payment',      action: 'approve', label: 'Approve purchase payments' },
  { code: 'purchase.return.view',         module: 'purchase', documentType: 'return',       action: 'view',    label: 'View purchase returns' },
  { code: 'purchase.return.create',       module: 'purchase', documentType: 'return',       action: 'create',  label: 'Create purchase returns' },
  { code: 'purchase.return.approve',      module: 'purchase', documentType: 'return',       action: 'approve', label: 'Approve purchase returns' },
  { code: 'purchase.debitnote.create',    module: 'purchase', documentType: 'debitnote',    action: 'create',  label: 'Create debit notes' },
  { code: 'purchase.reports.view',        module: 'purchase', documentType: null,           action: 'view',    label: 'View purchase reports' },

  // ── Inventory (Phase 5) ────────────────────────────────────────────────────
  { code: 'inventory.items.view',         module: 'inventory', documentType: 'items',   action: 'view',     label: 'View items' },
  { code: 'inventory.items.create',       module: 'inventory', documentType: 'items',   action: 'create',   label: 'Create items' },
  { code: 'inventory.items.edit',         module: 'inventory', documentType: 'items',   action: 'edit',     label: 'Edit items' },
  { code: 'inventory.stock.view',         module: 'inventory', documentType: 'stock',   action: 'view',     label: 'View stock levels' },
  { code: 'inventory.stock.transfer',     module: 'inventory', documentType: 'stock',   action: 'transfer', label: 'Transfer stock between warehouses' },
  { code: 'inventory.stock.adjust',       module: 'inventory', documentType: 'stock',   action: 'adjust',   label: 'Adjust stock (write-off, correction)' },
  { code: 'inventory.stock.count',        module: 'inventory', documentType: 'stock',   action: 'count',    label: 'Run physical stock count' },
  { code: 'inventory.reports.view',       module: 'inventory', documentType: null,       action: 'view',     label: 'View inventory reports' },

  // ── Accounting (Phase 3) ───────────────────────────────────────────────────
  { code: 'accounting.jv.view',           module: 'accounting', documentType: 'jv',     action: 'view',    label: 'View journal vouchers' },
  { code: 'accounting.jv.create',         module: 'accounting', documentType: 'jv',     action: 'create',  label: 'Create journal vouchers' },
  { code: 'accounting.jv.submit',         module: 'accounting', documentType: 'jv',     action: 'submit',  label: 'Submit journal vouchers' },
  { code: 'accounting.jv.approve',        module: 'accounting', documentType: 'jv',     action: 'approve', label: 'Approve journal vouchers' },
  { code: 'accounting.coa.view',          module: 'accounting', documentType: 'coa',    action: 'view',    label: 'View chart of accounts' },
  { code: 'accounting.coa.manage',        module: 'accounting', documentType: 'coa',    action: 'manage',  label: 'Manage chart of accounts' },
  { code: 'accounting.reports.view',      module: 'accounting', documentType: null,      action: 'view',    label: 'View accounting reports' },
  { code: 'accounting.reports.financial', module: 'accounting', documentType: null,      action: 'financial','label': 'View financial statements (P&L, BS)' },
  { code: 'accounting.period.close',      module: 'accounting', documentType: 'period',  action: 'close',   label: 'Close accounting period' },
  { code: 'accounting.bankrecon.view',    module: 'accounting', documentType: 'bankrecon', action: 'view',  label: 'View bank reconciliations' },
  { code: 'accounting.bankrecon.manage',  module: 'accounting', documentType: 'bankrecon', action: 'manage', label: 'Manage bank reconciliations' },
  { code: 'accounting.bankaccount.view',  module: 'accounting', documentType: 'bankaccount', action: 'view',  label: 'View bank accounts' },
  { code: 'accounting.bankaccount.manage', module: 'accounting', documentType: 'bankaccount', action: 'manage', label: 'Manage bank accounts' },

  // ── Fixed Assets ───────────────────────────────────────────────────────────
  { code: 'accounting.asset.view',          module: 'accounting', documentType: 'asset',        action: 'view',    label: 'View fixed assets' },
  { code: 'accounting.asset.create',        module: 'accounting', documentType: 'asset',        action: 'create',  label: 'Create fixed assets' },
  { code: 'accounting.asset.edit',          module: 'accounting', documentType: 'asset',        action: 'edit',    label: 'Edit fixed assets' },
  { code: 'accounting.asset.dispose',       module: 'accounting', documentType: 'asset',        action: 'dispose', label: 'Dispose / write-off fixed assets' },
  { code: 'accounting.assetcategory.view',  module: 'accounting', documentType: 'assetcategory', action: 'view',   label: 'View asset categories' },
  { code: 'accounting.assetcategory.manage', module: 'accounting', documentType: 'assetcategory', action: 'manage', label: 'Manage asset categories' },
  { code: 'accounting.depreciation.run',    module: 'accounting', documentType: 'depreciation', action: 'run',     label: 'Run depreciation' },
  { code: 'accounting.depreciation.view',   module: 'accounting', documentType: 'depreciation', action: 'view',    label: 'View depreciation schedules' },

  // ── Sales (Phase 7) ────────────────────────────────────────────────────────
  { code: 'sales.quotation.view',         module: 'sales', documentType: 'quotation',   action: 'view',    label: 'View quotations' },
  { code: 'sales.quotation.create',       module: 'sales', documentType: 'quotation',   action: 'create',  label: 'Create quotations' },
  { code: 'sales.quotation.submit',       module: 'sales', documentType: 'quotation',   action: 'submit',  label: 'Submit quotations' },
  { code: 'sales.quotation.approve',      module: 'sales', documentType: 'quotation',   action: 'approve', label: 'Approve quotations' },
  { code: 'sales.so.view',                module: 'sales', documentType: 'so',           action: 'view',    label: 'View sales orders' },
  { code: 'sales.so.create',              module: 'sales', documentType: 'so',           action: 'create',  label: 'Create sales orders' },
  { code: 'sales.so.submit',              module: 'sales', documentType: 'so',           action: 'submit',  label: 'Submit sales orders' },
  { code: 'sales.so.approve',             module: 'sales', documentType: 'so',           action: 'approve', label: 'Approve sales orders' },
  { code: 'sales.so.cancel',              module: 'sales', documentType: 'so',           action: 'cancel',  label: 'Cancel sales orders' },
  { code: 'sales.delivery.view',          module: 'sales', documentType: 'delivery',     action: 'view',    label: 'View delivery challans' },
  { code: 'sales.delivery.create',        module: 'sales', documentType: 'delivery',     action: 'create',  label: 'Create delivery challans' },
  { code: 'sales.delivery.submit',        module: 'sales', documentType: 'delivery',     action: 'submit',  label: 'Submit delivery challans' },
  { code: 'sales.delivery.approve',       module: 'sales', documentType: 'delivery',     action: 'approve', label: 'Approve delivery challans (dispatch)' },
  { code: 'sales.invoice.view',           module: 'sales', documentType: 'invoice',      action: 'view',    label: 'View sales invoices' },
  { code: 'sales.invoice.create',         module: 'sales', documentType: 'invoice',      action: 'create',  label: 'Create sales invoices' },
  { code: 'sales.invoice.submit',         module: 'sales', documentType: 'invoice',      action: 'submit',  label: 'Submit sales invoices' },
  { code: 'sales.invoice.approve',        module: 'sales', documentType: 'invoice',      action: 'approve', label: 'Approve sales invoices' },
  { code: 'sales.receipt.view',           module: 'sales', documentType: 'receipt',      action: 'view',    label: 'View customer receipts' },
  { code: 'sales.receipt.create',         module: 'sales', documentType: 'receipt',      action: 'create',  label: 'Create customer receipts' },
  { code: 'sales.receipt.approve',        module: 'sales', documentType: 'receipt',      action: 'approve', label: 'Approve customer receipts' },
  { code: 'sales.reports.view',           module: 'sales', documentType: null,            action: 'view',    label: 'View sales reports' },

  // ── Manufacturing (Phase 8) ────────────────────────────────────────────────
  { code: 'manufacturing.bom.view',       module: 'manufacturing', documentType: 'bom',    action: 'view',    label: 'View bills of material' },
  { code: 'manufacturing.bom.create',     module: 'manufacturing', documentType: 'bom',    action: 'create',  label: 'Create bills of material' },
  { code: 'manufacturing.bom.approve',    module: 'manufacturing', documentType: 'bom',    action: 'approve', label: 'Approve bills of material' },
  { code: 'manufacturing.order.view',     module: 'manufacturing', documentType: 'order',  action: 'view',    label: 'View production orders' },
  { code: 'manufacturing.order.create',   module: 'manufacturing', documentType: 'order',  action: 'create',  label: 'Create production orders' },
  { code: 'manufacturing.order.approve',  module: 'manufacturing', documentType: 'order',  action: 'approve', label: 'Approve production orders' },
  { code: 'manufacturing.order.issue',    module: 'manufacturing', documentType: 'order',  action: 'issue',   label: 'Issue material to production' },
  { code: 'manufacturing.mrp.run',        module: 'manufacturing', documentType: null,      action: 'run',     label: 'Run MRP' },
  { code: 'manufacturing.eco.view',       module: 'manufacturing', documentType: 'eco',     action: 'view',    label: 'View ECOs' },
  { code: 'manufacturing.eco.create',     module: 'manufacturing', documentType: 'eco',     action: 'create',  label: 'Create ECOs' },
  { code: 'manufacturing.eco.approve',    module: 'manufacturing', documentType: 'eco',     action: 'approve', label: 'Approve ECOs' },
  { code: 'manufacturing.reports.view',   module: 'manufacturing', documentType: null,      action: 'view',    label: 'View manufacturing reports' },

  // ── Payroll (Phase 9) ──────────────────────────────────────────────────────
  { code: 'payroll.employee.view',        module: 'payroll', documentType: 'employee',      action: 'view',    label: 'View employees' },
  { code: 'payroll.employee.manage',      module: 'payroll', documentType: 'employee',      action: 'manage',  label: 'Manage employees' },
  { code: 'payroll.salary.view',          module: 'payroll', documentType: 'salary',        action: 'view',    label: 'View salary structures' },
  { code: 'payroll.salary.manage',        module: 'payroll', documentType: 'salary',        action: 'manage',  label: 'Manage salary structures' },
  { code: 'payroll.payslip.view',         module: 'payroll', documentType: 'payslip',       action: 'view',    label: 'View payslips' },
  { code: 'payroll.payslip.create',       module: 'payroll', documentType: 'payslip',       action: 'create',  label: 'Create payslips' },
  { code: 'payroll.payslip.approve',      module: 'payroll', documentType: 'payslip',       action: 'approve', label: 'Approve payslips' },
  { code: 'payroll.reports.view',         module: 'payroll', documentType: null,            action: 'view',    label: 'View payroll reports' },

  // ── HR (Phase 10) ──────────────────────────────────────────────────────────
  { code: 'hr.department.view',           module: 'hr', documentType: 'department',       action: 'view',    label: 'View departments' },
  { code: 'hr.department.manage',         module: 'hr', documentType: 'department',       action: 'manage',  label: 'Manage departments' },
  { code: 'hr.attendance.view',           module: 'hr', documentType: 'attendance',       action: 'view',    label: 'View attendance' },
  { code: 'hr.attendance.manage',         module: 'hr', documentType: 'attendance',       action: 'manage',  label: 'Mark / edit attendance' },
  { code: 'hr.leave.view',               module: 'hr', documentType: 'leave',            action: 'view',    label: 'View leave requests' },
  { code: 'hr.leave.apply',              module: 'hr', documentType: 'leave',            action: 'apply',   label: 'Apply for leave' },
  { code: 'hr.leave.approve',            module: 'hr', documentType: 'leave',            action: 'approve', label: 'Approve / reject leave' },
  { code: 'hr.leavetype.view',           module: 'hr', documentType: 'leavetype',        action: 'view',    label: 'View leave types' },
  { code: 'hr.leavetype.manage',         module: 'hr', documentType: 'leavetype',        action: 'manage',  label: 'Manage leave types' },
  { code: 'hr.reports.view',             module: 'hr', documentType: null,               action: 'view',    label: 'View HR reports' },
  
  // ── Admin (Phase 9) ────────────────────────────────────────────────────────
  { code: 'admin.system.manage',          module: 'admin',   documentType: 'system',        action: 'manage',  label: 'Manage global system settings' },
];

// ─── System role definitions ─────────────────────────────────────────────────

const SYSTEM_ROLES: {
  name: string;
  description: string;
  permissionCodes: string[];
}[] = [
  {
    name: 'Company Admin',
    description: 'Full access to all modules within a company',
    permissionCodes: PERMISSIONS.map((p) => p.code),
  },
  {
    name: 'Purchase Manager',
    description: 'Full purchase cycle including approval',
    permissionCodes: PERMISSIONS
      .filter((p) => p.module === 'purchase' || p.code.startsWith('inventory.items.view') || p.code.startsWith('inventory.stock.view'))
      .map((p) => p.code),
  },
  {
    name: 'Purchase User',
    description: 'Create and submit purchase documents, no approval',
    permissionCodes: PERMISSIONS
      .filter((p) => p.module === 'purchase' && !['approve', 'cancel'].includes(p.action))
      .map((p) => p.code),
  },
  {
    name: 'Inventory Manager',
    description: 'Full inventory access',
    permissionCodes: PERMISSIONS
      .filter((p) => p.module === 'inventory')
      .map((p) => p.code),
  },
  {
    name: 'Store Keeper',
    description: 'Receive and issue stock only',
    permissionCodes: ['inventory.stock.view', 'inventory.stock.transfer', 'inventory.items.view'],
  },
  {
    name: 'Accounts Manager',
    description: 'Full accounting access',
    permissionCodes: PERMISSIONS
      .filter((p) => p.module === 'accounting')
      .map((p) => p.code),
  },
  {
    name: 'Accounts User',
    description: 'Create and submit journal vouchers only',
    permissionCodes: ['accounting.jv.view', 'accounting.jv.create', 'accounting.jv.submit', 'accounting.coa.view'],
  },
  {
    name: 'Sales Manager',
    description: 'Full sales cycle including approval',
    permissionCodes: PERMISSIONS
      .filter((p) => p.module === 'sales')
      .map((p) => p.code),
  },
  {
    name: 'Sales User',
    description: 'Create and submit sales documents, no approval',
    permissionCodes: PERMISSIONS
      .filter((p) => p.module === 'sales' && p.action !== 'approve')
      .map((p) => p.code),
  },
  {
    name: 'Manufacturing Manager',
    description: 'Full manufacturing access including MRP',
    permissionCodes: PERMISSIONS
      .filter((p) => p.module === 'manufacturing')
      .map((p) => p.code),
  },
  {
    name: 'Payroll Manager',
    description: 'Full payroll access',
    permissionCodes: PERMISSIONS
      .filter((p) => p.module === 'payroll')
      .map((p) => p.code),
  },
  {
    name: 'HR Manager',
    description: 'Full HR + payroll access including attendance, leave, and employee management',
    permissionCodes: PERMISSIONS
      .filter((p) => p.module === 'hr' || p.module === 'payroll')
      .map((p) => p.code),
  },
  {
    name: 'Report Viewer',
    description: 'Read-only access to all reports',
    permissionCodes: PERMISSIONS
      .filter((p) => p.action === 'view')
      .map((p) => p.code),
  },
];

// ─── Seed runner ─────────────────────────────────────────────────────────────

async function seed() {
  console.log('Seeding permissions...');

  // Upsert all permissions
  for (const perm of PERMISSIONS) {
    await db
      .insert(permissions)
      .values({
        code: perm.code,
        module: perm.module,
        documentType: perm.documentType ?? null,
        action: perm.action,
        label: perm.label,
      })
      .onConflictDoUpdate({
        target: permissions.code,
        set: { label: perm.label, module: perm.module, action: perm.action },
      });
  }

  console.log(`  ✓ ${PERMISSIONS.length} permissions`);

  // Get all permission codes for lookup
  const allPerms = await db.select({ id: permissions.id, code: permissions.code }).from(permissions);
  const permMap = new Map(allPerms.map((p) => [p.code, p.id]));

  // Upsert system roles
  for (const roleDef of SYSTEM_ROLES) {
    const [existing] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, roleDef.name))
      .limit(1);

    let roleId: string;

    if (existing) {
      roleId = existing.id;
    } else {
      const [inserted] = await db
        .insert(roles)
        .values({
          name: roleDef.name,
          description: roleDef.description,
          isSystemRole: true,
          companyId: null,
        })
        .returning({ id: roles.id });
      roleId = inserted.id;
    }

    // Delete existing role permissions and re-insert (idempotent)
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

    const permRows = roleDef.permissionCodes
      .filter((code) => permMap.has(code))
      .map((code) => ({ roleId, permissionId: permMap.get(code)! }));

    if (permRows.length > 0) {
      await db.insert(rolePermissions).values(permRows);
    }

    console.log(`  ✓ Role "${roleDef.name}" — ${permRows.length} permissions`);
  }

  console.log('Done.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
