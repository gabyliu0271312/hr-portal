# HR Portal 应用接入与入口权限模型

## 1. 定位

HR Portal 是应用门户和入口授权中心。

对于体量较小的功能页面，可以继续作为 HR Portal 的普通菜单页接入。

对于绩效管理这类大型业务应用，应作为独立应用接入 HR Portal。HR Portal 只负责展示入口和控制入口权限，不承接业务应用内部的细粒度权限、流程权限和数据权限。

## 2. 大型独立应用的判断标准

满足以下任一条件时，建议按独立应用接入，而不是作为普通菜单页接入：

- 有自己的顶部导航或复杂页面布局
- 有独立后台设置
- 有独立角色或权限体系
- 有流程、节点、任务、审批或评价等业务身份权限
- 需要从飞书等外部入口独立访问
- 后续可能独立演进为单独应用或子系统

绩效管理属于大型独立应用。

## 3. 接入原则

### 3.1 一级应用入口

大型独立应用应作为 HR Portal 顶部一级应用入口展示。

示例：

```text
首页
提效工具
绩效管理
系统设置
```

不建议将大型独立应用放在“提效工具”或“系统设置”下。

### 3.2 独立应用壳

进入大型独立应用后，应使用应用自己的布局、导航和权限判断。

例如绩效管理进入 `/performance` 后，由绩效系统自己的布局展示：

```text
工作台
绩效评估
项目管理
```

### 3.3 HR Portal 只管入口

HR Portal 控制：

- 用户能否看到应用入口
- 用户能否进入应用
- 用户能否进入应用后台

业务应用自己控制：

- 应用内部角色
- 应用内部菜单
- 应用内部数据范围
- 应用内部流程节点
- 应用内部操作权限

## 4. 统一权限命名

大型独立应用统一采用以下入口权限：

```text
<app_code>.app
<app_code>.admin
```

含义：

- `<app_code>.app`：允许进入应用
- `<app_code>.admin`：允许进入应用后台

示例：

```text
performance.app
performance.admin

cost_allocation.app
cost_allocation.admin

recruitment.app
recruitment.admin

training.app
training.admin
```

## 5. 绩效管理示例

HR Portal 中新增绩效管理一级入口：

```text
应用编码：performance
应用名称：绩效管理
入口路由：/performance
后台路由：/performance/settings
```

入口权限：

```text
performance.app
performance.admin
```

角色示例：

```text
角色名称：绩效管理系统管理员
HR Portal 权限：
- performance.app
- performance.admin
```

拥有该角色的用户可以进入绩效管理，也可以进入绩效后台。

进入绩效后台后，具体能配置周期、流程、等级、强制分布、项目规则、申诉规则等，由绩效系统内部权限继续判断。

## 6. 成本分摊已上线系统示例

成本分摊系统已经是独立上线应用，应作为独立应用入口接入 HR Portal，而不是并入“提效工具 → 成本分摊”页面。

```text
应用编码：cost_allocation
应用名称：成本分摊
入口路由：/cost-allocation-system
后台路由：/cost-allocation-system/admin
```

入口权限：

```text
cost_allocation.app
cost_allocation.admin
```

HR Portal 侧只控制用户能否看到并打开成本分摊系统入口。成本分摊系统内部已有 `admin`、`cost_admin`、`hrbp`、`manager` 等角色，进入系统后的页面、流程和数据权限继续由成本分摊系统自身判断。

与现有 HR Portal 普通工具区分：

```text
tools.cost_allocation     -> HR Portal 内部“提效工具”下的成本分摊/报表能力
cost_allocation.app       -> 已上线独立成本分摊系统入口
cost_allocation.admin     -> 已上线独立成本分摊系统后台入口
```

前端跳转地址由构建环境变量提供：

```text
VITE_COST_ALLOCATION_APP_URL
VITE_COST_ALLOCATION_ADMIN_URL
```

后台入口变量未配置时，可默认拼接为：

```text
${VITE_COST_ALLOCATION_APP_URL}/admin/workbench
```

当前成本分摊生产系统有自己的飞书登录和系统 session，因此 HR Portal 不应直接打开生产首页并假设已经登录。已落地方式是由 HR Portal 后端获取成本分摊系统的飞书 OAuth 地址，再由浏览器跳转到飞书登录链路。

专项文档：

```text
specs/003-cost-allocation-integration/sso-integration.md
```

通用边界：

- HR Portal 入口权限不等于目标系统内部角色。
- HR Portal token 不直接作为目标系统 token 使用。
- 目标系统仍负责自己的登录回调、身份匹配、session 和内部权限。
- 如果用户拥有 HR Portal 入口权限但无法进入目标系统，应优先排查目标系统中的飞书身份、邮箱或手机号匹配关系。

成本分摊后续优化保留两条路线：

```text
方案一：保持外部独立系统，升级为无感 ticket 登录 + return_url 返回 HR Portal。
方案三：迁入 HR Portal，成为类似绩效管理的内部应用。
```

本阶段不考虑“内部入口壳 + iframe/反向代理承载外部系统”的方案，避免跨域、登录态、文件下载、弹窗、路由和样式隔离问题。

平台统一原则是：用户从 HR Portal 点击任何大型应用时，都应获得一致的启动体验。内部应用可以直接返回内部路由，外部应用可以返回一次性 SSO ticket 地址，但入口权限、审计、返回 HR Portal 的能力应保持一致。

## 7. 短期落地方式

第一期可以继续复用现有 HR Portal 菜单权限体系，将应用入口权限作为特殊菜单权限承载。

例如：

```text
performance
performance.app
performance.admin
```

前端展示逻辑：

```text
拥有 performance.app 或 performance.entry -> 展示绩效管理一级入口
拥有 performance.admin -> 绩效应用内展示绩效后台入口
```

后端接口逻辑：

```text
访问 /performance 或绩效前台 API -> 校验 performance.app
访问 /performance/settings 或绩效后台 API -> 校验 performance.admin
```

该方式改造成本低，适合作为绩效管理第一期接入方式。

## 8. 后续优化方向

随着类似独立应用增加，建议将“菜单权限”和“应用入口权限”分开。

可新增应用注册与授权模型：

```text
portal_applications
portal_application_permissions
role_application_permissions
```

示例字段：

```text
portal_applications
- code
- name
- entry_path
- admin_path
- icon
- display_order
- is_active
```

登录接口 `/auth/me` 后续可增加：

```json
{
  "apps": [
    {
      "code": "performance",
      "name": "绩效管理",
      "entry_path": "/performance",
      "can_access": true,
      "can_admin": true
    }
  ]
}
```

届时 HR Portal 顶部大型应用入口从 `apps` 渲染，普通页面继续从 `menus` 渲染。

## 9. 与普通菜单 SOP 的关系

普通页面仍按现有菜单 SOP 接入。

大型独立应用不应简单按普通三级菜单 leaf 页面处理，而应先判断是否符合独立应用标准。符合时，按本文档的应用接入模型处理。

## 10. 关键原则摘要

```text
HR Portal 决定用户能不能进入某个应用。
业务应用决定用户进入后能做什么。
```
## 11. 大型应用视觉继承原则

大型独立应用必须继承 HR Portal 统一设计系统。

主设计规范：

```text
hr-portal/frontend/docs/design-system.md
```

统一原则：

- HR Portal 的平台级主色为飞书蓝 `#3370ff`。
- 大型独立应用可以有独立布局和业务组件，但基础视觉风格应与 HR Portal 一致。
- 页面背景、字体、按钮、表单、表格、卡片、弹窗、导航、状态标签等基础组件规则应继承平台规范。
- 业务应用可以增加业务语义色，例如绩效等级、流程节点、申诉状态，但不能形成独立主题。

目标是让用户在切换大型应用时仍感觉处于同一个 HR Portal 平台中。
