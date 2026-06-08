# 绩效管理权限模型

## 1. 权限设计原则

绩效管理权限不直接复用现有 HR Portal 的菜单权限体系。

推荐采用三层权限：

1. HR Portal 入口权限
2. 绩效系统配置权限
3. 绩效流程身份权限

三层权限职责不同，不能混在一套菜单 CRUD 权限里。

## 2. HR Portal 入口权限

该层权限接入现有 HR Portal 权限系统。

建议新增：

```text
performance.app
performance.admin
```

### performance.app

允许用户进入绩效管理应用。

### performance.admin

允许用户进入绩效后台设置。

注意：拥有 `performance.admin` 仅表示可以进入后台入口。进入后具体能配置什么，仍由绩效系统内部权限判断。

## 3. 绩效系统配置权限

绩效系统内部维护自己的角色和权限。

典型权限：

```text
cycle.manage
workflow.manage
template.manage
grade.manage
distribution.manage
project.manage
project.rule.manage
calibration.manage
appeal.handle
appeal.config
people.sync
permission.manage
```

### 配置权限的来源

绩效配置权限可以有两种来源：

1. 系统配置
   管理员在绩效后台配置角色和权限。

2. 自动赋予
   系统根据组织关系、项目关系、绩效周期规则自动赋予。

## 4. 绩效流程身份权限

流程身份权限不是静态角色，而是针对具体周期、具体员工、具体节点动态计算出来的权限。

核心判断问题是：

```text
某个用户在某个绩效周期的某个节点，能否对某个员工或项目执行某个动作？
```

典型流程身份：

- 本人
- 直属上级
- 项目负责人
- 部门/组织校准人
- 公司级校准人
- 申诉处理人

## 5. 角色权限与流程身份权限的区别

角色权限表示“这个人整体是什么身份”。

流程身份权限表示“这个人在这件具体事情里扮演什么角色”。

示例：

| 场景 | 角色权限 | 流程身份权限 |
| --- | --- | --- |
| 查看自己的绩效 | 普通员工可进入绩效评估 | 只能查看自己的绩效记录 |
| 给下属评分 | 管理者可进入上级评价 | 只能评价自己的直属下属 |
| 项目评价 | 项目负责人可进入项目评价 | 只能评价自己负责项目中的成员 |
| 部门校准 | 校准人可进入校准页面 | 只能校准自己负责组织范围内员工 |
| 申诉处理 | 申诉处理人可进入申诉处理 | 只能处理规则匹配到的申诉 |

## 6. 权限判断建议

每次访问绩效 API 时，建议同时判断：

1. 用户是否已经认证
2. 是否能映射到绩效人员
3. 是否具备应用入口权限
4. 是否具备当前功能权限
5. 是否具备当前数据或节点的流程身份权限
6. 当前时间是否在节点允许操作范围内
7. 当前记录状态是否允许操作

## 7. 可见性控制

员工可见：

- 最终等级
- 最终分数
- 工作内容总结
- 自评内容
- 上级评价内容
- 申诉反馈说明

员工不可见：

- 校准说明
- 校准调整过程
- 强制分布调整说明
- 内部复核说明

上级、项目负责人、HR、绩效管理员根据权限看到不同范围的过程信息。

例如直属上级可以看到：

- 自己提交的评价
- 后续最终等级是否被调整
- 调整前后等级，例如从 A 调整为 B

HR 和绩效管理员可以看到完整过程。

## 8. 建议的数据结构方向

绩效权限可拆分为：

```text
performance_roles
performance_permissions
performance_role_permissions
performance_person_roles
performance_dynamic_assignments
```

其中 `performance_dynamic_assignments` 用于保存周期启动后自动计算出的关键身份，如校准人、申诉处理人等，也可以部分实时计算。

## 9. 与现有用户体系的关系

绩效人员主数据来自员工实时花名册。

当前 HR Portal 用户、飞书用户、花名册人员之间需要通过身份映射关联。

建议建立：

```text
performance_people
performance_identity_links
```

`performance_identity_links` 可记录：

- HR Portal user_id
- 飞书 user_id
- 手机号
- 邮箱
- 员工编号

认证和人员主档解耦，便于后续飞书 SSO 和人员同步扩展。

## 10. 绩效管理系统管理员角色

“绩效管理系统管理员”建议拆成两层：

```text
HR Portal 侧角色：绩效管理系统管理员
绩效系统侧角色：绩效系统管理员
```

HR Portal 侧角色用于授予入口权限：

```text
performance.app
performance.admin
```

拥有该角色的用户可以：

- 在 HR Portal 中看到“绩效管理”一级应用入口
- 进入绩效管理应用
- 进入绩效后台设置入口

但进入绩效后台后，具体能配置什么，仍由绩效系统内部权限控制。

绩效系统内部权限示例：

```text
cycle.manage
workflow.manage
grade.manage
distribution.manage
project.rule.manage
appeal.config
permission.manage
```

第一期为了降低复杂度，可以将拥有 `performance.admin` 的用户默认视为绩效系统超级管理员。

后续当绩效后台权限变复杂后，再细分绩效系统内部角色和权限。

## 11. 未来独立应用通用权限模式

绩效管理的接入模式应作为未来大型独立应用的通用模式。

统一命名：

```text
<app_code>.app
<app_code>.admin
```

示例：

```text
performance.app
performance.admin

recruitment.app
recruitment.admin

training.app
training.admin
```

HR Portal 负责应用级入口授权。

各业务应用负责内部业务权限、流程身份权限和数据权限。

该原则详见：

```text
specs/001-hr-permission-portal/application-access-model.md
```
