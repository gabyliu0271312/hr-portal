"""薪酬 Tab → 分摊结果页：只读列表 + 字段后台可配。

- GET /allocation-result/fields : 分摊结果分组的标准字段清单（驱动前端列渲染）
- GET /allocation-result/rows   : 分摊表行（人员 D 过滤 + 字段脱敏 + 成本中心树编码校验）

主数据一致性：
- 工号/姓名语义 = 人员信息页标准字段（employee_no/full_name）
- 编码/名称语义 = 成本中心树权威（cost_center_tree.code/name）
- 分摊表 code 必须在成本中心树中存在，否则行标记 _cc_valid=false
"""
