import re

with open('apps/web/src/pages/admin/AdminPortal.tsx', 'r') as f:
    content = f.read()

# Add useThemeStore import if not exists
if 'useThemeStore' not in content:
    content = content.replace("import { useAuthStore } from '../../store/auth';", "import { useAuthStore } from '../../store/auth';\nimport { useThemeStore } from '../../store/theme';")

# Add icons for dark/light mode
if 'BulbOutlined' not in content:
    content = content.replace("LockOutlined,", "LockOutlined, BulbOutlined, BulbFilled,")

# Add useThemeStore call in component
if 'const { isDark, toggle } = useThemeStore()' not in content:
    content = content.replace("const { user, logout } = useAuthStore();", "const { user, logout } = useAuthStore();\n  const { isDark, toggle } = useThemeStore();")

# Add the button in the Header Space
button_code = """          <Button size="small" type="text" icon={isDark ? <BulbFilled /> : <BulbOutlined />}
            style={{ color: 'var(--ant-color-text-secondary)' }} onClick={toggle}>
            Theme
          </Button>
          <Button size="small" type="text" icon={<KeyOutlined />}"""
content = content.replace("""          <Button size="small" type="text" icon={<KeyOutlined />}""", button_code)

with open('apps/web/src/pages/admin/AdminPortal.tsx', 'w') as f:
    f.write(content)
