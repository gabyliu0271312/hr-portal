# 仓库工作规则

## 021：报表权限整合与HR主数据

涉及021规格、报表权限/D/S、平行执行器整合退役或其主数据A/B任务时，先读取：

1. [021开发入口](specs/021-standard-field-permission-governance/README.md)：当前事实、生产边界与下一步。
2. [021规格](specs/021-standard-field-permission-governance/spec.md)：用户场景、FR需求、AC验收条件及关键规则。
3. [021任务](specs/021-standard-field-permission-governance/mvp-tasks.md)：当前唯一MVP、依赖、需求追踪、状态与证据。

只做用户本次要求的一张卡/模板实例；开工核对代码和git status，声明目标卡/FR/AC、角色入口、复用点、不做事项、成功/拒绝验收、影响面与停止方式。只整理文档的请求不授权自动开发或操作生产。

保留原报表业务能力，将有效增强直接整合原功能，最终一条正式计算链；不做永久兼容壳、不扩建平行引擎、不全部舍弃新增能力。代码已部署生产，不能整包回滚、批量改legacy、降级数据库或删审批证据；具体生产操作须批准。

需求权威为用户最新明确决定与spec；任务仅拆分实施，历史记录/测试结果不是新需求。冲突先指出，不能自行改变业务口径或授权范围。收尾更新当前卡及对应AC证据，代码/真实SQL或API/PC/部署/生产验收分别记录；不另造并行规格或交接流水账。

修改HR Portal代码前还须读取 [hr-portal/CLAUDE.md](hr-portal/CLAUDE.md)；其他项目规则与安全要求保持适用。
