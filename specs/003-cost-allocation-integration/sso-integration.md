# 成本分摊系统与 HR Portal 跳转登录集成方案

## 1. 背景与目标

成本分摊系统已经作为独立生产系统上线，生产地址为：

```text
http://192.168.10.13:37800/
```

HR Portal 需要为成本分摊系统提供统一入口和入口权限控制。用户在 HR Portal 中点击“成本分摊”后，应进入成本分摊系统的登录链路，而不是简单打开生产首页导致停留在成本分摊系统自己的登录页。

本方案记录当前已落地的跳转登录方式，并为后续进一步打通真 SSO、身份映射、深链跳转和统一审计保留设计依据。

## 2. 当前定位

成本分摊系统按大型独立应用接入 HR Portal。

HR Portal 负责：

- 展示成本分摊一级应用入口
- 判断当前 HR Portal 用户是否拥有成本分摊入口权限
- 判断当前 HR Portal 用户是否拥有成本分摊后台入口权限
- 发起成本分摊系统的飞书登录地址获取请求

成本分摊系统负责：

- 自己的登录回调
- 自己的用户身份匹配
- 自己的系统 token / session
- 自己的内部角色、页面、流程和数据权限

关键原则：

```text
HR Portal 决定用户能不能打开成本分摊入口。
成本分摊系统决定用户登录后能不能进入、进入后能做什么。
```

## 3. HR Portal 接入信息

HR Portal 路由：

```text
/cost-allocation-system
/cost-allocation-system/admin
```

HR Portal 入口权限：

```text
cost_allocation.app
cost_allocation.admin
```

权限含义：

- `cost_allocation.app`：允许看到并打开成本分摊系统入口
- `cost_allocation.admin`：允许看到并打开成本分摊系统后台入口

需要与 HR Portal 内部普通工具权限区分：

```text
tools.cost_allocation     -> HR Portal 内部“提效工具”下的成本分摊/报表能力
cost_allocation.app       -> 已上线独立成本分摊系统入口权限
cost_allocation.admin     -> 已上线独立成本分摊系统后台入口权限
```

## 4. 当前已落地链路

当前采用“HR Portal 触发目标系统飞书 SSO”的方式，不做 HR Portal token 与成本分摊 token 的共享。

```text
用户点击 HR Portal 顶部“成本分摊”
  -> HR Portal 前端路由守卫校验 cost_allocation.app / cost_allocation.admin
  -> HR Portal 前端调用 /api/v1/cost-allocation/external-sso-url
  -> HR Portal 后端请求成本分摊系统 /api/v1/auth/feishu/url
  -> 成本分摊系统返回飞书 OAuth 授权地址
  -> 浏览器跳转到飞书 OAuth
  -> 飞书回调成本分摊系统 /login?code=...
  -> 成本分摊系统换取飞书用户信息
  -> 成本分摊系统按 feishu_open_id / 邮箱等身份字段匹配内部用户
  -> 成本分摊系统创建自己的 token / session
  -> 成本分摊系统按内部角色跳转到对应页面
```

HR Portal 后端接口：

```text
GET /api/v1/cost-allocation/external-sso-url?entry_type=app
GET /api/v1/cost-allocation/external-sso-url?entry_type=admin
```

HR Portal 后端请求成本分摊系统：

```text
GET http://192.168.10.13:37800/api/v1/auth/feishu/url?redirect_uri=http://192.168.10.13:37800/login
```

成本分摊系统返回示例：

```json
{
  "url": "https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=cli_a949f7d4787b9cb5&redirect_uri=http%3A%2F%2F192.168.10.13%3A37800%2Flogin&response_type=code",
  "target_url": "http://192.168.10.13:37800/"
}
```

## 5. 当前边界与限制

当前方案不是完全意义上的统一 SSO，而是从 HR Portal 发起目标系统已有飞书 SSO。

边界如下：

- HR Portal 登录 token 不会被成本分摊系统直接接受。
- HR Portal 与成本分摊系统没有共享 session。
- HR Portal 不向成本分摊系统签发业务 token。
- HR Portal 入口权限不等同于成本分摊系统内部角色。
- 用户即使拥有 `cost_allocation.app`，仍可能因为成本分摊系统内没有匹配用户或没有内部角色而无法进入目标页面。
- 后台深链是否能进入，最终仍取决于成本分摊系统内部角色和路由权限。

如果用户点击 HR Portal 入口后仍停留在成本分摊登录页，需要优先排查：

- 成本分摊系统飞书 SSO 配置是否可用
- 飞书 OAuth 回调地址是否正确
- 成本分摊系统用户表是否有对应 `feishu_open_id`
- 如果没有 `feishu_open_id`，是否能用邮箱或手机号匹配
- 匹配到用户后，该用户是否有成本分摊系统内部角色

## 6. 后续优化路线

成本分摊后续有两条可选优化路线：

```text
方案一：保持外部独立系统，升级为无感 ticket 登录 + return_url 返回
方案三：将成本分摊迁入 HR Portal，成为内部应用
```

本阶段不考虑“内部入口壳 + iframe/反向代理承载外部系统”的方案。该方式容易引入跨域、登录态、文件下载、弹窗、路由和样式隔离问题，且长期维护边界不清晰。

### 6.1 方案一：外部系统无感登录

方案一保留成本分摊系统作为独立生产系统，只优化 HR Portal 到成本分摊的进入体验。

目标体验：

```text
用户在 HR Portal 点击“成本分摊”
  -> 无需再次点击飞书确认或登录按钮
  -> 直接进入成本分摊系统首页或后台页
  -> 成本分摊系统页面提供“返回 HR Portal”
```

推荐链路：

```text
用户点击 HR Portal 成本分摊入口
  -> HR Portal 校验 cost_allocation.app / cost_allocation.admin
  -> HR Portal 生成一次性登录 ticket
  -> HR Portal 拼接目标地址和 return_url
  -> 浏览器跳转成本分摊系统 /sso/consume?ticket=...&return_url=...
  -> 成本分摊系统向 HR Portal 后端校验 ticket
  -> HR Portal 返回用户身份、入口类型、有效期和签名校验结果
  -> 成本分摊系统匹配自己的内部用户
  -> 成本分摊系统创建自己的 session / token
  -> 成本分摊系统跳转目标页面
```

建议新增 HR Portal 接口：

```text
POST /api/v1/app-launch/cost_allocation
GET  /api/v1/sso/tickets/{ticket}/verify
```

建议新增成本分摊接口：

```text
GET /sso/consume?ticket=...&return_url=...&target_path=...
```

ticket 建议规则：

- 一次性使用
- 短有效期，例如 60 秒
- 服务端存储或可校验签名
- 绑定 HR Portal 用户、目标应用、入口类型和目标路径
- 消费后立即失效
- 记录审计日志

`return_url` 建议规则：

- 只允许 HR Portal 白名单域名或固定路径
- 默认返回 HR Portal 首页
- 可支持返回用户点击成本分摊前所在页面

该方案的优点：

- 不需要迁移成本分摊系统代码和数据库
- 对当前生产系统影响相对小
- 可以实现 HR Portal 到成本分摊的无感进入
- 可以实现成本分摊返回 HR Portal
- 成本分摊仍可保留自己的飞书独立入口

该方案的限制：

- 成本分摊仍是独立部署、独立 session
- 成本分摊系统需要新增 ticket 消费能力
- 用户在成本分摊内部能做什么，仍由成本分摊自己的角色判断
- HR Portal 无法天然接管成本分摊内部页面状态

### 6.2 方案三：迁入 HR Portal 内部应用

方案三是将成本分摊从外部独立系统迁入 HR Portal，成为类似绩效管理的内部应用。

目标体验：

```text
用户在 HR Portal 点击“成本分摊”
  -> 直接进入 /cost-allocation-system
  -> 使用 HR Portal 当前登录态
  -> 成本分摊应用内可返回 HR Portal
```

推荐形态：

```text
前端：
frontend/src/layouts/CostAllocationLayout.vue
frontend/src/views/costAllocationSystem/

后端：
backend/app/cost_allocation_system/

路由：
/cost-allocation-system
/cost-allocation-system/admin

API：
/api/v1/cost-allocation-system/*
```

迁入时需要评估：

- 成本分摊前端页面迁移成本
- 成本分摊后端 API 迁移成本
- 当前生产数据是否迁入 HR Portal 数据库，或短期跨库读取
- 成本分摊内部角色如何与 HR Portal 用户、角色、数据范围衔接
- 成本分摊现有生产地址是否保留
- 是否继续支持飞书工作台独立入口
- 原系统链接、书签、通知链接如何兼容
- 上线切换和回滚方案

该方案的优点：

- 用户体验与绩效管理最一致
- 可以统一视觉、导航、返回入口和基础权限
- HR Portal 可以更容易复用人员、组织、数据范围和报表能力
- 后续统一运维和统一审计更简单

该方案的限制：

- 改造成本高
- 对当前生产系统影响大
- 上线风险高于方案一
- 需要重新梳理成本分摊内部权限与 HR Portal 权限的边界

### 6.3 路线建议

短期建议优先采用方案一：

```text
外部系统保持不迁移
先做无感 ticket 登录
补 return_url 返回 HR Portal
保留成本分摊自己的内部权限和飞书入口
```

中长期如果成本分摊需要深度复用 HR Portal 的人员、组织、权限、报表和视觉体系，再评估方案三。

判断是否进入方案三的触发条件：

- 成本分摊需要频繁复用 HR Portal 报表中台能力
- 成本分摊需要与 HR Portal 数据范围权限深度一致
- 成本分摊前端需要大幅重构
- 成本分摊后续不再需要独立部署
- 用户体验统一优先级高于迁移成本和上线风险

## 7. 通用平台能力优化

### 7.1 统一应用注册

当接入更多独立应用时，建议将独立应用信息从菜单 seed 中抽离为应用注册表。

可规划：

```text
portal_applications
portal_application_permissions
role_application_permissions
```

成本分摊、绩效管理、招聘、培训等应用统一注册入口、后台入口、图标、排序、启用状态和登录方式。

### 7.2 统一身份映射

建议建立统一身份映射模型，沉淀 HR Portal 用户与各独立应用用户之间的关系。

可规划：

```text
portal_identity_mappings
- portal_user_id
- app_code
- external_user_id
- feishu_open_id
- email
- mobile
- match_status
- last_matched_at
```

这样 HR Portal 可以在用户点击入口前做更明确的提示，例如“你有入口权限，但成本分摊系统尚未完成账号绑定”。

### 7.3 真 SSO / Token Exchange

后续如果希望点击 HR Portal 后无感进入目标系统，可以设计 token exchange。

参考链路：

```text
HR Portal 校验用户入口权限
  -> HR Portal 生成一次性登录票据
  -> 浏览器跳转成本分摊系统 /sso/consume?ticket=...
  -> 成本分摊系统向 HR Portal 后端校验 ticket
  -> 成本分摊系统根据返回身份创建自己的 session
  -> 成本分摊系统跳转目标页面
```

该方式需要补充：

- 一次性 ticket
- ticket 过期时间
- 服务端对服务端验签
- replay 防护
- 目标系统信任 HR Portal 身份源
- 统一审计日志

### 7.4 登录后深链

当前 `entry_type=app/admin` 主要区分入口类型。后续可增加 `return_path` 或 `target_path`，支持用户登录后进入目标系统具体页面。

示例：

```text
/api/v1/cost-allocation/external-sso-url?entry_type=admin&target_path=/admin/workbench
```

注意：深链只能表达“希望去哪里”，最终能否进入仍由成本分摊系统内部权限判断。

### 7.5 统一审计与排障

建议 HR Portal 和成本分摊系统分别记录跳转链路日志，并通过同一个 trace id 串联。

可记录：

- HR Portal 当前用户
- 入口应用 `app_code`
- 入口类型 `app/admin`
- 目标地址
- 发起时间
- 成本分摊系统登录匹配结果
- 登录成功后的成本分摊内部用户 ID

这会显著降低后续排查“HR Portal 有权限但目标系统进不去”的成本。

## 8. 一期结论

一期保持轻量集成：

- HR Portal 增加成本分摊独立应用入口
- HR Portal 使用 `cost_allocation.app` / `cost_allocation.admin` 控制入口
- 点击入口后通过 HR Portal 后端获取成本分摊系统飞书 OAuth 地址
- 浏览器跳转飞书登录，再由成本分摊系统完成自己的身份匹配和 session 创建

该方案对已上线成本分摊系统侵入低，适合当前阶段落地；后续如果要做到无感跳转，再升级为统一身份映射 + token exchange。
