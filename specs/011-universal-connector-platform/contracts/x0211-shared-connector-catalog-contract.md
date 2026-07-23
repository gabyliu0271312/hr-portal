# X0211 共享接入类型目录合同（前置基础）

## 目录职责

`app.connectors.catalog.CONNECTOR_TYPES` 是数据仓库和 UCP 共用的接入类型事实来源。

- `connection_kind=DATA_OBJECT`：用户创建一个连接，并在连接下维护多个数据对象；适用于飞书在线表格、飞书多维表格、北森报表。
- `connection_kind=STANDARD_SAAS`：用户只绑定凭证并启用业务能力；不在普通资源界面暴露 Adapter 或接口地址。
- Adapter Registry 仅为后台技术注册表，不得作为普通用户的接入类型下拉来源。

## 北森边界

- `beisen_report` 表示北森报表，不代表全部北森 API。
- 北森其他已标准化 API 进入标准 SaaS 业务能力；企业特殊 API 按受控自定义 API 流程处理。
- 一个 `beisen_report` 连接可配置多个报表数据对象；每个对象保存报表标识、请求参数、字段映射与增量策略。

## 北森报表分层（确认版）

数据仓库和数据连接共用北森报表连接器运行契约，但保留不同的产品填写粒度，不能强行复用为一张表单。

| 配置项 | 数据仓库：独立入仓来源 | 数据连接：北森报表连接 |
| --- | --- | --- |
| AppKey / AppSecret | 每个来源填写并保存 | 作为北森系统凭证一次填写、多个连接和对象复用 |
| Token / GridHeader / GridData 接口 | 每个来源完整展示、允许填写 | 平台内置默认值；普通用户不展示，仅受控高级配置可覆盖 |
| Report ID | 每个来源填写 | 每个数据对象填写；一个连接可建多个对象 |
| 字段映射 / 增量策略 | 入仓来源自身配置 | 数据对象自身配置 |

UCP 普通用户不可填写 URL、请求方式、请求体或 JSON。北森报表对象的必填业务参数仅为 `Report ID`。

## 兼容规则

- 既有 `DataSource.source_type=beisen_api` 兼容投影为 `beisen_report`。
- 既有飞书在线表格和多维表格连接不迁移、不改写凭证；只通过目录补齐展示和后续对象配置入口。
- 目录 DTO 不包含密钥、URL 明文或 Adapter Code。

## 实施记录（2026-07-23）

- [x] 目录 DTO 按产品/内部两种视图输出；普通入口不再得到 Adapter Code。
- [x] UCP 资源持久化 `connector_type`，旧资源按 Adapter Code 只读兼容投影。
- [x] 新建通用 `ucp_resource_data_object`，飞书在线表格、飞书多维表格、北森报表均可在一个连接下维护多个数据对象。
- [x] 北森报表改为“凭证一次配置 + 平台内置报表接口 + 数据对象只填 Report ID”；数据仓库保留完整独立来源表单。
- [x] 数据连接资源 UI 改为“接入类型”，标准 SaaS 不出现在普通资源下拉；Adapter Registry 继续保留后台技术入口。
- [x] 已验证目录单测、Python 编译、前端生产构建和 Alembic 迁移链（`0115`）。
