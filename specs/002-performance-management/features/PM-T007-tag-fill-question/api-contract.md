# PM-T007 API 契约

```text
completion_status: incomplete
pixel_restore_status: blocked
contract_status: draft-blocked
```

> 2026-09-20 最小接入契约已由用户在 PM-T004-T14 明确授权并落地。采集确认了 `question_type=tag_text` 的列表和选择器参数，但未保存响应体/写入 body，因此 HR Portal 冻结独立资源而不复制目标租户 payload。本文后续早期 BLOCKED 表格仅作为历史缺口；以下最小契约为当前实现真源：
>
> - `GET /api/v1/performance/tagged-fill-in-questions?offset=&limit=&question_type=tag_text&keyword=`；
> - `GET /api/v1/performance/tagged-fill-in-questions/options?question_type=tag_text`；
> - `GET/PUT/DELETE /api/v1/performance/tagged-fill-in-questions/{id}` 与 `POST /api/v1/performance/tagged-fill-in-questions`；
> - DTO：`language/name/description/remark/tags[]`，标签项为 `id/name/description/prompt`；
> - 权限：`performance.configuration.manage`；模板引用中删除返回 409。
>
> 未冻结项仍包括乐观锁版本、完整审计事件、周期启动后的配置快照策略和跨租户兼容。

## 1. 资源边界

标签型填写题是独立管理资源，不应直接复用 PM-T005 的 `review-questions` 资源，也不应使用 PM-T004 的模板内容 fixture 作为持久化协议。

## 2. 待冻结接口

| URL | Method | 状态 | 说明 |
|---|---|---|---|
| `/api/v1/performance/tagged-fill-in-questions` | GET | BLOCKED | 列表、分页、搜索和排序参数未确认 |
| `/api/v1/performance/tagged-fill-in-questions/{id}` | GET | BLOCKED | 详情和标签项结构未确认 |
| `/api/v1/performance/tagged-fill-in-questions` | POST | BLOCKED | 新建请求未采集，禁止猜测字段 |
| `/api/v1/performance/tagged-fill-in-questions/{id}` | PATCH/PUT | BLOCKED | 编辑字段和乐观锁未确认 |
| `/api/v1/performance/tagged-fill-in-questions/{id}` | DELETE | BLOCKED | 删除、引用和审计语义未确认 |

最终 URL 必须与项目现有 `/api/v1/performance/*` 约定、路由实现和后端评审一致。

## 3. 需要冻结的响应字段

列表至少需要从真实接口确认：

- 稳定 ID；
- 题目名称；
- 创建人展示字段；
- 创建时间；
- 备注；
- 标签项摘要；
- 是否被模板/周期使用；
- 是否可编辑；
- 是否可删除；
- 分页总数和当前页信息。

不得从截图中的展示文案反推字段名或类型。

## 4. 需要冻结的写入规则

- 题目名称是否必填、唯一和大小写敏感；
- 标签名称是否必填、是否在同一题内唯一；
- 标签项最小/最大数量；
- 标签项排序和删除语义；
- 描述、说明、提示、备注的长度限制；
- 编辑并发控制；
- 已被模板或周期引用时的编辑/删除限制；
- 保存失败是否幂等；
- 审计事件和操作者记录。

## 5. 错误和安全

待冻结错误码至少覆盖：未授权、资源不存在、重复名称、重复标签、校验失败、资源已使用、并发冲突和服务暂时不可用。接口必须参数化查询，禁止把搜索文本拼接到 SQL；所有真实写入必须有服务端权限检查和审计。

## 6. 当前阻塞

真实保存/更新/删除请求尚未授权采集；当前不得生成实现 DTO、迁移或前端写入逻辑。
