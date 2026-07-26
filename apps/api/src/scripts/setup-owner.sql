-- Insert system.bypass_sod permission
INSERT INTO permissions (id, code, module, action, label, description)
VALUES (
  gen_random_uuid(),
  'system.bypass_sod',
  'system',
  'bypass_sod',
  'Bypass Segregation of Duties',
  'Allows the user to approve documents they created or submitted.'
) ON CONFLICT (code) DO NOTHING;

-- Create Owner role if it doesn't exist (company null means system role, but let's just make it a company role for company 0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519)
WITH owner_role AS (
  INSERT INTO roles (id, company_id, name, description, is_system_role)
  SELECT gen_random_uuid(), '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519', 'Owner', 'Company Owner', true
  WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE name = 'Owner' AND company_id = '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519'
  )
  RETURNING id
)
-- If it already existed, we need its ID. Let's do it in a plpgsql block.
DO $$
DECLARE
  v_role_id uuid;
  v_perm_id uuid;
  v_user_id uuid := 'a978a835-e449-4580-80fc-b7f0bb54e9d2'; -- User 1
  v_company_id uuid := '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519';
BEGIN
  SELECT id INTO v_perm_id FROM permissions WHERE code = 'system.bypass_sod';

  SELECT id INTO v_role_id FROM roles WHERE name = 'Owner' AND company_id = v_company_id;
  IF v_role_id IS NULL THEN
    INSERT INTO roles (id, company_id, name, description, is_system_role)
    VALUES (gen_random_uuid(), v_company_id, 'Owner', 'Company Owner', false)
    RETURNING id INTO v_role_id;
  END IF;

  -- Assign permission to role
  INSERT INTO role_permissions (role_id, permission_id)
  VALUES (v_role_id, v_perm_id)
  ON CONFLICT DO NOTHING;

  -- Assign role to User 1
  INSERT INTO user_roles (id, user_id, role_id, company_id)
  VALUES (gen_random_uuid(), v_user_id, v_role_id, v_company_id)
  ON CONFLICT DO NOTHING;
END $$;
