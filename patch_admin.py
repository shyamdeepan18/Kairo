import sys

file_path = "apps/web/src/pages/admin/AdminPortal.tsx"

with open(file_path, 'r') as f:
    content = f.read()

# 1. Update ant-design icons
content = content.replace("BulbFilled,", "BulbFilled, DashboardOutlined,")

# 2. Update admin imports
content = content.replace("type AdminPermission,", "type AdminPermission, type AdminDiagnosticsHealth, type AdminAuditLog,")

# 3. Update Section type
content = content.replace("type Section = 'companies' | 'plants' | 'users' | 'roles' | 'license';", "type Section = 'companies' | 'plants' | 'users' | 'roles' | 'license' | 'diagnostics';")

# 4. Update menu items
old_menu = """              { key: 'companies', icon: <BankOutlined />, label: 'Companies', onClick: () => { setSection('companies'); setSelectedCompany(null); } },"""
new_menu = """              { key: 'companies', icon: <BankOutlined />, label: 'Companies', onClick: () => { setSection('companies'); setSelectedCompany(null); } },
              { key: 'diagnostics', icon: <DashboardOutlined />, label: 'Diagnostics', onClick: () => { setSection('diagnostics'); setSelectedCompany(null); } },"""
content = content.replace(old_menu, new_menu)

# 5. Add renderContent case
old_render_case = """      case 'companies':
        return renderCompanies();"""
new_render_case = """      case 'companies':
        return renderCompanies();
      case 'diagnostics':
        return <DiagnosticsPanel />;"""
content = content.replace(old_render_case, new_render_case)

with open(file_path, 'w') as f:
    f.write(content)

