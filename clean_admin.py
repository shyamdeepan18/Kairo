import re

with open('apps/web/src/pages/admin/AdminPortal.tsx', 'r') as f:
    content = f.read()

# Remove Layout/Content background
content = re.sub(r"background:\s*'#0F172A',?\s*", "", content)
content = re.sub(r"background:\s*'#1E1B4B',?\s*", "", content)
content = re.sub(r"background:\s*'linear-gradient[^']+',?\s*", "", content)
content = re.sub(r"background:\s*'#1E293B',?\s*", "", content)
content = re.sub(r"background:\s*'#312E81',?\s*", "", content)

# Remove hardcoded text colors
content = re.sub(r"color:\s*'#F1F5F9',?\s*", "", content)
content = re.sub(r"color:\s*'#fff',?\s*", "", content)
content = re.sub(r"color:\s*'#C7D2FE',?\s*", "", content)
# For subtext, convert color: '#64748B' to color: 'var(--ant-color-text-secondary)' (or just remove and rely on type="secondary" where possible, but CSS var is easier)
content = re.sub(r"color:\s*'#64748B',?\s*", "color: 'var(--ant-color-text-secondary)', ", content)
content = re.sub(r"color:\s*'#6B7280',?\s*", "color: 'var(--ant-color-text-secondary)', ", content)
content = re.sub(r"color:\s*'#9CA3AF',?\s*", "color: 'var(--ant-color-text-secondary)', ", content)
content = re.sub(r"color:\s*'#818CF8',?\s*", "color: 'var(--ant-color-primary)', ", content)
content = re.sub(r"color:\s*'#A5B4FC',?\s*", "color: 'var(--ant-color-primary)', ", content)

# Remove hardcoded borders
content = re.sub(r"borderRight:\s*'1px solid #3730A3',?\s*", "", content)
content = re.sub(r"borderBottom:\s*'1px solid #3730A3',?\s*", "", content)
content = re.sub(r"borderColor:\s*'#3730A3',?\s*", "", content)
content = re.sub(r"border:\s*'1px solid #4F46E5',?\s*", "", content)
content = re.sub(r"border:\s*'1px solid #334155',?\s*", "", content)
content = re.sub(r"border:\s*'1px dashed #334155',?\s*", "", content)

# Remove theme="dark" from Menu
content = re.sub(r'theme="dark"', "", content)

# Clean up empty style objects like style={{ }} or style={{  }}
content = re.sub(r"style=\{\{\s*\}\}", "", content)
content = re.sub(r"style=\{\{\s*,\s*", "style={{ ", content)

with open('apps/web/src/pages/admin/AdminPortal.tsx', 'w') as f:
    f.write(content)
print("Cleaned up AdminPortal.tsx")
