-- =====================================================
-- 自动化规则菜单种子数据
-- 用于将"自动化规则"添加到系统菜单中
-- =====================================================

-- 说明：
-- 1. 需要先查看现有的菜单结构（通过查询 menu 表）
-- 2. 根据实际情况调整 parent_id 和 sort_order
-- 3. 需要在有权限管理的页面分配权限给角色

-- =====================================================
-- Step 1: 查看现有菜单结构（参考）
-- =====================================================

-- 查看顶级菜单（一级菜单）
-- SELECT * FROM menus WHERE parent_id IS NULL ORDER BY sort_order;

-- 查看"系统管理"下的子菜单（二级菜单）
-- SELECT * FROM menus WHERE parent_id = (SELECT id FROM menus WHERE code = 'system') ORDER BY sort_order;

-- =====================================================
-- Step 2: 添加自动化规则菜单
-- =====================================================

-- 假设：
-- - 顶级菜单"系统管理"的 code = 'system', id = 1（需要根据实际情况调整）
-- - 二级菜单是在顶级菜单下，parent_id = 顶级菜单的 id

-- 2.1 添加顶级菜单"自动化"（可选，也可以放在"系统管理"下）
-- 如果已经有合适的顶级菜单，可以跳过此步骤，直接添加到子菜单

INSERT INTO menus (code, label, parent_id, route_path, sort_order, created_by, created_at)
VALUES 
  ('automation', '自动化规则', NULL, '/automation/rules', 100, 1, NOW())
ON CONFLICT (code) DO NOTHING;

-- 2.2 添加子菜单"规则管理"
-- 假设刚刚插入的顶级菜单 id 为 100（需要替换为实际 id）
INSERT INTO menus (code, label, parent_id, route_path, sort_order, created_by, created_at)
VALUES 
  ('automation.rules', '规则管理', (SELECT id FROM menus WHERE code = 'automation'), '/automation/rules', 1, 1, NOW())
ON CONFLICT (code) DO NOTHING;

-- 2.3 添加子菜单"执行记录"
INSERT INTO menus (code, label, parent_id, route_path, sort_order, created_by, created_at)
VALUES 
  ('automation.executions', '执行记录', (SELECT id FROM menus WHERE code = 'automation'), '/automation/executions', 2, 1, NOW())
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- Step 3: 添加权限配置
-- =====================================================

-- 3.1 添加权限：查看规则列表
INSERT INTO permissions (code, label, description, created_by, created_at)
VALUES 
  ('automation.rule.list', '查看自动化规则', '查看自动化规则列表', 1, NOW())
ON CONFLICT (code) DO NOTHING;

-- 3.2 添加权限：创建规则
INSERT INTO permissions (code, label, description, created_by, created_at)
VALUES 
  ('automation.rule.create', '创建自动化规则', '创建新的自动化规则', 1, NOW())
ON CONFLICT (code) DO NOTHING;

-- 3.3 添加权限：编辑规则
INSERT INTO permissions (code, label, description, created_by, created_at)
VALUES 
  ('automation.rule.update', '编辑自动化规则', '编辑 existing 自动化规则', 1, NOW())
ON CONFLICT (code) DO NOTHING;

-- 3.4 添加权限：删除规则
INSERT INTO permissions (code, label, description, created_by, created_at)
VALUES 
  ('automation.rule.delete', '删除自动化规则', '删除 automation 规则', 1, NOW())
ON CONFLICT (code) DO NOTHING;

-- 3.5 添加权限：启用/禁用规则
INSERT INTO permissions (code, label, description, created_by, created_at)
VALUES 
  ('automation.rule.toggle', '启用/禁用自动化规则', '启用或禁用 automation 规则', 1, NOW())
ON CONFLICT (code) DO NOTHING;

-- 3.6 添加权限：查看执行记录
INSERT INTO permissions (code, label, description, created_by, created_at)
VALUES 
  ('automation.execution.list', '查看执行记录', '查看 automation 执行记录', 1, NOW())
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- Step 4: 分配权限给角色（示例）
-- =====================================================

-- 假设：
-- - 超级管理员角色 code = 'super_admin', id = 1
-- - 需要根据实际情况调整角色 id

-- 4.1 分配所有权限给超级管理员
INSERT INTO role_permissions (role_id, permission_id, created_by, created_at)
SELECT 
  1 as role_id,  -- 替换为实际角色 id
  p.id as permission_id,
  1 as created_by,
  NOW() as created_at
FROM permissions p
WHERE p.code LIKE 'automation.%'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4.2 分配查看权限给普通用户（可选）
-- INSERT INTO role_permissions (role_id, permission_id, created_by, created_at)
-- SELECT 
--   2 as role_id,  -- 替换为实际角色 id（如 'hr_user'）
--   p.id as permission_id,
--   1 as created_by,
--   NOW() as created_at
-- FROM permissions p
-- WHERE p.code IN ('automation.rule.list', 'automation.execution.list')
-- ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- 验证数据
-- =====================================================

-- 查看插入的菜单
-- SELECT * FROM menus WHERE code LIKE 'automation%';

-- 查看插入的权限
-- SELECT * FROM permissions WHERE code LIKE 'automation%';

-- 查看权限分配
-- SELECT r.code as role_code, p.code as permission_code
-- FROM role_permissions rp
-- JOIN roles r ON rp.role_id = r.id
-- JOIN permissions p ON rp.permission_id = p.id
-- WHERE p.code LIKE 'automation%';

-- =====================================================
-- 回滚 SQL（如果需要删除）
-- =====================================================

-- 删除权限分配
-- DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code LIKE 'automation.%');

-- 删除权限
-- DELETE FROM permissions WHERE code LIKE 'automation.%';

-- 删除菜单
-- DELETE FROM menus WHERE code LIKE 'automation.%';
