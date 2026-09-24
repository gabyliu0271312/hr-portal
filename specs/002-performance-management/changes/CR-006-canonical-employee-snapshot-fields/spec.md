# CR-006 全局员工字段与绩效快照统一

## 目标

建立一份跨模块共享的实时花名册字段契约，并使绩效周期快照成为周期内全部人员属性的历史真源。

## 权威字段

| 业务含义 | 实时花名册列 | 周期/项目快照字段 | 展示 |
| --- | --- | --- | --- |
| 工号 | `employee_no` | `employee_no` | 原值字符串化 |
| 姓名 | `full_name` | `display_name` | 原值 |
| 组织层级 | `company_org`、`department` 至 `department_5` | 六个同名原子字段；`organization_ref` 派生路径 | 所属部门取最末非空层级 |
| 直属上级 | `direct_supervisor` | `direct_supervisor_employee_no`、`direct_supervisor_source_value` | 同快照反查姓名 |
| HRBP | `hrbp` | `hrbp_employee_no`、`hrbp_source_value` | 同快照反查姓名 |
| 人员类型 | `employee_type` | `employee_type` | 原值 |
| 在职状态 | `employment_status` | `employment_status` | 原值，可按现有离职规则更新 |
| 职位族 | `job_family` | `job_family` | 原值 |
| 职位类 | `job_category` | `job_category` | 原值 |
| 序列 | 派生 | 不单独存储 | `job_family-job_category`，空值自动省略 |
| 职级 | `position_level` | `position_level` | 原值 |
| 入职日期 | `hire_date` | `hire_date` | ISO 日期 |

## 约束

- 不接受别名列和语义兜底。
- 项目启动、统计、矩阵、任务、详情和导出不得查询实时花名册补字段。
- 周期快照锁定后，除既有在职状态受控同步外，人员属性不可被实时数据静默改写。
- 已启动项目继续读取自己的项目人员快照。
- “虚线上级”没有权威源列，退出被评估人资料字段目录，但保留流程角色能力。

## 影响范围

全局字段契约、AI 员工档案默认字段、绩效周期快照、项目快照、项目筛选、执行人解析、发布转交、矩阵、统计、工作台、填写详情和前端 DTO。

## 六级组织补充范围

- 层级由 `company_org → department → department_2 → department_3 → department_4 → department_5` 定义，逐级存档，不用叶子名称代替完整组织路径。
- `organization_ref` 用全部非空层级按 `/` 拼接；所属部门只显示最末非空层级。
- HRBP 树和范围授权使用周期快照路径，不能以叶子名称或实时花名册放宽授权。
- 新迁移 0240 只对现存开发快照执行一次回填，后续不自动改写已锁定项目。
