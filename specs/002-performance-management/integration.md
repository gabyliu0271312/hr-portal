# 绩效管理集成方案

## 1. 与 HR Portal 的关系

绩效管理第一期建议建设在现有 `hr-portal` 项目内，但保持独立业务边界。

HR Portal 提供：

- 登录态
- 入口权限
- 基础页面入口
- 员工实时花名册数据来源

绩效系统自己维护：

- 绩效角色
- 绩效权限
- 绩效流程
- 绩效周期
- 绩效结果
- 申诉反馈

## 2. HR Portal 入口权限接入

现有 HR Portal 权限体系中新增：

```text
performance.app
performance.admin
```

### performance.app

用于控制用户是否能进入绩效管理应用。

### performance.admin

用于控制用户是否能进入绩效后台设置。

注意：进入绩效后台后，具体配置权限仍由绩效系统内部权限控制。

## 3. 前端集成

建议新增独立布局：

```text
frontend/src/layouts/PerformanceLayout.vue
```

新增视图目录：

```text
frontend/src/views/performance/
```

建议路由：

```text
/performance
/performance/workbench
/performance/review
/performance/projects
/performance/settings
```

从 HR Portal 访问时，可以在现有菜单中增加绩效管理入口，跳转到 `/performance`。

飞书独立应用访问时，也进入同一套路由。

## 4. 后端集成

建议新增后端模块：

```text
backend/app/performance/
```

建议子模块：

```text
authz.py
people.py
cycles.py
workflow.py
reviews.py
projects.py
calibration.py
appeals.py
results.py
router.py
models.py
schemas.py
```

API 路径建议：

```text
/api/v1/performance/*
```

绩效 API 不直接复用现有 `require_op(menu_code, op)`，而是新增绩效专用权限依赖。

## 5. 认证集成

### HR Portal 登录进入

流程：

```text
HR Portal 登录
-> 获取现有 JWT
-> 进入 /performance
-> 后端根据当前用户查 identity link
-> 映射绩效人员
-> 判断 performance.app 或 performance.admin
-> 进入绩效系统
```

### 飞书 SSO 进入

流程：

```text
飞书应用打开绩效地址
-> 前端检测无 token
-> 跳转飞书授权
-> 后端通过 code 换取飞书用户信息
-> 获取手机号或邮箱
-> 匹配绩效人员
-> 生成系统 JWT
-> 进入 /performance
```

如后续员工实时花名册中补充飞书用户 ID，则优先用飞书用户 ID 匹配。

## 6. 人员主数据集成

绩效人员主数据来自员工实时花名册。

建议同步字段：

```text
员工编号
姓名
部门
岗位
直属上级员工编号
手机号
邮箱
在职状态
飞书用户 ID，可选
```

同步后写入：

```text
performance_people
performance_identity_links
```

## 7. 飞书身份匹配

第一期匹配优先级建议：

```text
1. feishu_user_id，如有
2. 手机号
3. 邮箱
```

需要注意：

- 手机号必须唯一
- 邮箱必须唯一
- 手机号或邮箱变更后需要同步更新
- 匹配不到时需要提示联系管理员
- 匹配到多个时需要进入异常处理

## 8. 与现有员工实时花名册的关系

绩效系统不直接依赖实时花名册查询所有业务逻辑，而是在周期启动时生成周期人员快照。

原因：

- 避免周期中组织关系变化影响历史绩效
- 保留当期上级关系
- 保留当期部门归属
- 便于审计和复盘

周期启动后应固化：

- 员工编号
- 姓名
- 部门
- 直属上级
- 岗位
- 参与状态

## 9. 数据权限集成

HR Portal 原有数据权限不直接用于绩效内部数据判断。

绩效内部数据权限由以下信息计算：

- 周期人员快照
- 直属上级关系
- 项目成员关系
- 项目负责人关系
- 校准层级配置
- 申诉处理规则
- 绩效内部角色

## 10. 后续飞书能力扩展

后续可扩展：

- 飞书消息通知
- 飞书待办提醒
- 飞书审批或卡片交互
- 飞书通讯录同步

第一期重点建议先完成飞书 SSO 和身份匹配。

## 11. 在 HR Portal 中的位置

绩效管理应作为 HR Portal 的顶部一级应用入口，而不是放在“提效工具”或“系统设置”下面。

推荐入口结构：

```text
首页
提效工具
绩效管理
系统设置
```

原因：

- 绩效管理是大型独立业务应用，不是普通小工具。
- 绩效管理有独立布局、独立后台、独立流程和独立权限体系。
- 绩效管理还需要支持飞书独立应用入口。
- 放在“系统设置”下会混淆平台设置和业务系统设置。

用户从 HR Portal 点击“绩效管理”后，进入：

```text
/performance
```

进入后由绩效系统自己的 `PerformanceLayout` 展示内部导航：

```text
工作台
绩效评估
项目管理
```

## 12. 应用级权限接入模式

绩效管理接入 HR Portal 时，应遵循 HR Portal 的大型独立应用接入模型。

主文档：

```text
specs/001-hr-permission-portal/application-access-model.md
```

核心原则：

```text
HR Portal 决定用户能不能进入绩效管理。
绩效管理决定用户进入后能做什么。
```

HR Portal 侧只控制应用入口和后台入口：

```text
performance.app
performance.admin
```

绩效系统内部继续控制：

```text
周期管理
流程模板管理
绩效等级管理
强制分布管理
项目规则管理
申诉规则管理
校准权限
流程身份权限
```

后续其他大型独立应用也应采用同一模式：

```text
<app_code>.app
<app_code>.admin
```

例如：

```text
recruitment.app
recruitment.admin

training.app
training.admin
```
## 13. 视觉风格接入

绩效管理作为大型独立应用，应继承 HR Portal 统一设计系统，而不是单独定义一套视觉主题。

主设计规范：

```text
hr-portal/frontend/docs/design-system.md
```

视觉原则：

- 平台主色统一使用飞书蓝 `#3370ff`。
- 绩效管理的页面背景、字体、按钮、表单、表格、卡片、弹窗、导航、状态标签等基础组件继承 HR Portal 规范。
- 绩效管理可以增加业务语义色，用于绩效等级、流程节点、申诉状态、项目评价图表等。
- 绩效管理不应单独换主色或形成另一套 UI 皮肤。

绩效管理的独立性体现在：

```text
独立路由
独立布局
独立权限
独立流程
独立后台
```

不应体现在：

```text
完全不同的主色
完全不同的组件风格
完全不同的页面质感
```
