# ADR-004：统一员工字段契约与周期快照真源

- 状态：已确认
- 日期：2026-09-23
- 范围：HR Portal 员工实时花名册消费者、绩效周期快照、项目快照、人员筛选、任务、统计、详情和导出

## 决策

1. 建立全局员工字段契约，业务代码不得自行猜测列名或用语义不同的字段兜底。
2. 权威源字段固定为：`employee_no`、`full_name`、`company_org`、`direct_supervisor`、`hrbp`、`employee_type`、`employment_status`、`job_family`、`job_category`、`position_level`、`hire_date`。
3. 直属上级只读取 `direct_supervisor`；人员类型只读取 `employee_type`；序列显示由 `job_family` 与 `job_category` 用 `-` 连接。
4. 周期人员快照固化完整人员属性；项目人员快照只复制周期快照，禁止项目启动、矩阵、统计、工作台和详情再次读取实时花名册。
5. 快照保存原子字段，不保存“序列”等拼接展示值；展示值由统一格式化函数生成。
6. 系统处于开发阶段，不保留旧字段名和错误兜底。通过新迁移一次性重命名/替换开发数据，不修改历史迁移。
7. 数据一次接入后，全局消费者共享同一字段契约；页面披露仍受权限和显式白名单控制，不因字段接入自动扩大可见范围。

## 后果

- `direct_manager_*` 改为 `direct_supervisor_*`。
- 周期和项目快照新增 `employee_type`、`job_family`、`job_category`、`position_level`、`hire_date`。
- 项目快照移除 `sequence`、`level`、`entry_date` 存储列。
- 没有权威源字段的“虚线上级”不再作为可配置资料字段；虚线上级仍可作为流程执行人身份存在。

## 组织字段补充决策（2026-09-23）

六个权威原子列 `company_org`、`department`、`department_2`、`department_3`、`department_4`、`department_5` 同时进入周期与项目快照。`organization_ref` 只由原子列派生为 `/` 分隔的完整层级路径，供树值及授权范围比较；页面“所属部门”单独取最后一个非空原子列，避免同名末级跨分支误授权。周期授权树以该周期快照生成；无周期上下文时才从实时花名册生成选项。人工组织修改只能改原子列并同步重算路径。已有开发快照通过新迁移一次性回填，已启动项目后续仍不回读实时花名册。
