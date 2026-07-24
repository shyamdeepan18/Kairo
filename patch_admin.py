import re

with open('apps/web/src/pages/admin/AdminPortal.tsx', 'r') as f:
    content = f.read()

# 1. Add editingCompany state
if 'const [editingCompany, setEditingCompany]' not in content:
    content = content.replace("const [companyDrawer, setCompanyDrawer] = useState(false);", "const [companyDrawer, setCompanyDrawer] = useState(false);\n  const [editingCompany, setEditingCompany] = useState<AdminCompany | null>(null);")

# 2. Add openEditCompany function
open_edit_func = """  const openEditCompany = (company: AdminCompany) => {
    setEditingCompany(company);
    companyForm.setFieldsValue({
      name: company.name,
      legalName: company.legalName,
      gstin: company.gstin,
      baseCurrency: company.baseCurrency,
    });
    setCompanyDrawer(true);
  };

  const handleSaveCompany"""
if 'const openEditCompany' not in content:
    content = content.replace("const handleCreateCompany", open_edit_func)

# 3. Update handleSaveCompany logic
save_logic_old = """  const handleSaveCompany = async (values: any) => {
    try {
      await adminApi.createCompany(values);
      message.success('Company created successfully');
      companyForm.resetFields();
      setCompanyDrawer(false);
      loadCompanies();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Failed to create company');
    }
  };"""
save_logic_new = """  const handleSaveCompany = async (values: any) => {
    try {
      if (editingCompany) {
        await adminApi.updateCompany(editingCompany.id, values);
        message.success('Company updated successfully');
      } else {
        await adminApi.createCompany(values);
        message.success('Company created successfully');
      }
      companyForm.resetFields();
      setEditingCompany(null);
      setCompanyDrawer(false);
      loadCompanies();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Failed to save company');
    }
  };"""
content = content.replace(save_logic_old, save_logic_new)

# 4. Update the "Create Company" button onClick to reset editingCompany
if 'setEditingCompany(null);' not in content.split("Create Company")[0][-200:]:
    content = content.replace("onClick={() => { companyForm.resetFields(); setCompanyDrawer(true); }}>\n                  Create Company", "onClick={() => { companyForm.resetFields(); setEditingCompany(null); setCompanyDrawer(true); }}>\n                  Create Company")

# 5. Add Edit button to companyColumns
if 'openEditCompany(r)' not in content:
    content = content.replace("""        <Space size={4} wrap>
          <Popconfirm""", """        <Space size={4} wrap>
          <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEditCompany(r); }}>Edit</Button>
          <Popconfirm""")

# 6. Add Users column to plantColumns
if "dataIndex: 'userCount'" not in content:
    content = content.replace("{ title: 'City', dataIndex: 'city'", "{ title: 'Users', dataIndex: 'userCount', render: (v: number) => v ?? 0 },\n    { title: 'City', dataIndex: 'city'")

# 7. Update Drawer title
content = content.replace("""title="Provision New Tenant Company\"""", """title={editingCompany ? 'Edit Company' : 'Provision New Tenant Company'}""")
# 8. Update Form onFinish
content = content.replace("onFinish={handleCreateCompany}", "onFinish={handleSaveCompany}")

with open('apps/web/src/pages/admin/AdminPortal.tsx', 'w') as f:
    f.write(content)

