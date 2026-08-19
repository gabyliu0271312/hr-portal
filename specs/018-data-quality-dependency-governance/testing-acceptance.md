# 测试与验收计划

## 1. 单元测试
- 规则 schema：基数、键数量、期间、严重级别合法性。
- 关系解析：真实dataset/relation元数据、非法标识符、关系删除。
- 算法：1:1/N:1、重复、缺失、NULL、空表、期间过滤。
- 脱敏：哈希稳定且响应/日志无明文。
- 状态聚合：block失败优先，旧批次不能覆盖新批次。
- 去重：同一`table+period+batch+relation`并发单飞。

## 2. API与权限测试
覆盖创建/编辑/运行/状态查询/影响范围/索引重建；验证资源不存在、参数错误、期间缺失、重复运行、超时、无权限和敏感字段脱敏。报表查询/导出在passed、warning、pending、failed/block下行为一致。

## 3. 集成与真实案例回归
```text
同步 dwd_annual_bonus_estimate_factor/202607
 → 生成batch → 发布成功事件 → 命中dataset=15/relation=251
 → 只生成一个质量任务 → 写关系/数据集/报表状态
```
验证`202607+001046015019`右侧重复、`001046015020`左侧缺失分别可识别；多张报表共享一次关系检查；同步失败不触发。

## 4. 性能测试
报表刷新只能查询状态表，不执行关系GROUP BY扫描。模拟一表→20数据集→100报表，校验次数按受影响关系边计算，不按报表数线性增加。验证期间索引命中、并发单飞、worker重启和任务积压恢复。

## 5. 安全/脱敏测试
拒绝前端注入任意表名字段名；无权用户不能查看诊断；响应/日志/告警不得出现员工号、客户名、金额、secret/token；只返回固定长度哈希和计数；状态不可用时导出按策略fail closed。

## 6. 兼容与上线测试
旧规则和历史运行可读；Alembic只有一个head且容器启动migration成功；既有datasource_sync、dataset_build、报表运行导出回归通过；前端构建和API类型检查通过。生产先warning观察，再经业务确认启用block，不直接删除数据或加唯一约束。


- Report gate policy: `failed+block` blocks run/export; `failed+warn` and `warning` return risk notices; `pending` allows run but blocks export; missing or unavailable state fails closed for both actions.
## 7. 验收标准
- 用户能在质量页看到同步后期间结果、重复/缺失计数和影响范围，且无敏感明细。
- 手动、定时、同步后入口共享同一运行服务并可追溯批次。
- 一条关系只检查一次，多报表共享数据集状态。
- 报表运行时只读取状态；阻断时明确禁止原因。
- 迁移、权限、并发、失败重试、脱敏和性能均有证据。
