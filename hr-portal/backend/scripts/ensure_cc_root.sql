-- 成本中心固定根迁移（幂等，可重复执行）
-- 对齐组织树 RootOrg 模式：code='root costcenter'，level=0，名称可改，编码锁定。
--
-- 执行说明：
--   1) 先备份：pg_dump -t cost_center_tree 成本中心树表
--   2) 在 hr_portal 库执行本脚本（幂等，缺根才插入，已存在则跳过）
--   3) 前端/后端代码发布后再核对：树顶应出现 root costcenter，原业务根挂其下
--
-- 注意：正常发布流程下 seed 会在后端重启时自动执行同等逻辑（ensure_cc_root）；
--       本脚本用于不想重启后端、或需要人工先行验证数据的场景。

BEGIN;

INSERT INTO cost_center_tree (code, name, parent_id, level, is_leaf, is_active, path, source_mode, synced_at)
SELECT 'root costcenter', '成本中心', NULL, 0, FALSE, TRUE, '/成本中心/', 'local', NOW()
WHERE NOT EXISTS (SELECT 1 FROM cost_center_tree WHERE code = 'root costcenter');

-- 把现有业务根（parent_id 为空且非固定根）挂到固定根下
UPDATE cost_center_tree
SET parent_id = root.id
FROM (SELECT id FROM cost_center_tree WHERE code = 'root costcenter') AS root
WHERE cost_center_tree.parent_id IS NULL
  AND cost_center_tree.code <> 'root costcenter';

COMMIT;
