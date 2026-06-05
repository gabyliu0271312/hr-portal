# Phase 1 — API Contract Skeleton

**Feature**: 001-hr-permission-portal · **Date**: 2026-05-22

REST + JSON。所有路径以 `/api/v1` 为前缀。所有受保护接口要求 `Authorization: Bearer <jwt>`。FastAPI 启动时会自动产出完整 OpenAPI 文档（`/docs`），本文件仅给**核心 endpoint 列表**便于 task 拆分时引用。

---

## 1. 鉴权 (auth)

| Method | Path                          | 说明                                                |
| ------ | ----------------------------- | --------------------------------------------------- |
| POST   | `/auth/login`                 | 账密登录，返回 JWT                                  |
| POST   | `/auth/logout`                | 服务端将该 JWT 加入 revocation list（可选）         |
| GET    | `/auth/me`                    | 当前用户信息 + 可访问菜单 + 可见数据类型分类        |
| POST   | `/auth/change-password`       | 用户自助改密码                                      |
| POST   | `/auth/feishu/sso`            | **本期占位 501 Not Implemented**                    |

## 2. 用户管理 (users)

| Method | Path                                  | 说明                       |
| ------ | ------------------------------------- | -------------------------- |
| GET    | `/users`                              | 列表（分页、搜索、启停过滤）|
| POST   | `/users`                              | 新建                       |
| GET    | `/users/{id}`                         | 详情                       |
| PUT    | `/users/{id}`                         | 更新基础信息               |
| POST   | `/users/{id}/reset-password`          | 管理员重置密码             |
| POST   | `/users/{id}/activate` / `/deactivate`| 启用 / 禁用                |
| GET    | `/users/{id}/permissions`             | 角色 + 数据类型 + 标签集    |
| PUT    | `/users/{id}/permissions`             | 一次性设置全部权限          |
| POST   | `/users/{id}/feishu/bind`             | **本期占位 501**            |
| DELETE | `/users/{id}/feishu/bind`             | **本期占位 501**            |

## 3. 角色 (roles)

| Method | Path                              | 说明                            |
| ------ | --------------------------------- | ------------------------------- |
| GET    | `/roles`                          |                                 |
| POST   | `/roles`                          |                                 |
| GET    | `/roles/{id}`                     | 含菜单矩阵（含操作权限四件套）  |
| PUT    | `/roles/{id}`                     |                                 |
| POST   | `/roles/{id}/deactivate`          | 停用，不允许真删                |

## 4. 菜单 (menus)

| Method | Path        | 说明                       |
| ------ | ----------- | -------------------------- |
| GET    | `/menus`    | 全量菜单清单（管理员视角） |

## 5. 数据范围标签 (scopes)

| Method | Path                                      | 说明                                      |
| ------ | ----------------------------------------- | ----------------------------------------- |
| GET    | `/scopes/cost-center-tags`                | 成本中心标签列表                          |
| POST   | `/scopes/cost-center-tags`                |                                           |
| GET    | `/scopes/org-tags`                        | 组织架构标签列表                          |
| POST   | `/scopes/org-tags`                        |                                           |
| GET    | `/scopes/{id}`                            | 通用详情                                  |
| PUT    | `/scopes/{id}`                            |                                           |
| DELETE | `/scopes/{id}`                            | 仍被引用时 409                            |

`POST` body 示例（成本中心标签）：

```json
{
  "name": "华东成本中心",
  "selections": [
    { "node_path": "/总部/华东/CC001/", "include_descendants": true },
    { "node_path": "/总部/华东/CC003/", "include_descendants": false }
  ]
}
```

`POST` body 示例（组织架构标签，三子维度）：

```json
{
  "name": "研发组织",
  "org_selections": [
    { "node_path": "/创梦天地/X 公司/研发中心/", "include_descendants": true }
  ],
  "employment_types": ["正式员工"],
  "employers": ["主体公司A"]
}
```

## 6. 字段分类 (field-categories)

| Method | Path                                       | 说明                            |
| ------ | ------------------------------------------ | ------------------------------- |
| GET    | `/field-categories`                        |                                 |
| POST   | `/field-categories`                        |                                 |
| GET    | `/field-categories/{id}/assignments`       | 该分类下的 (table, column) 清单 |
| PUT    | `/field-categories/{id}/assignments`       | 替换式更新                      |

## 7. 接口配置 (datasources)

| Method | Path                                  | 说明                                |
| ------ | ------------------------------------- | ----------------------------------- |
| GET    | `/datasources/endpoints`              |                                     |
| POST   | `/datasources/endpoints`              |                                     |
| GET    | `/datasources/endpoints/{id}`         |                                     |
| PUT    | `/datasources/endpoints/{id}`         |                                     |
| POST   | `/datasources/endpoints/{id}/run`     | 手动触发拉取                        |
| GET    | `/datasources/endpoints/{id}/logs`   | 拉取日志列表                        |

## 8. 业务数据表（首期 5 张）

| Method | Path                                  | 说明                              |
| ------ | ------------------------------------- | --------------------------------- |
| GET    | `/data/emp-realtime-roster`           | 员工实时花名册（含权限过滤）      |
| GET    | `/data/emp-monthly-roster`            | 员工月度花名册                    |
| GET    | `/data/emp-monthly-salary`            | 员工月度工资                      |
| GET    | `/data/emp-monthly-allocation`        | 员工月度成本分摊                  |
| GET    | `/data/cost-center-monthly`           | 成本中心月度维护                  |
| POST   | `/data/{table}/refresh`               | 手动刷新（前端按钮调用，等价于触发对应 endpoint） |

Query 参数：`page`、`page_size`、`period_ym`（月度表）、`q`（关键词搜索）。

响应自动叠加：

1. 数据范围权限过滤
2. 字段分类脱敏

## 9. 组织 / 成本中心树 (trees)

| Method | Path                                   | 说明                                                |
| ------ | -------------------------------------- | --------------------------------------------------- |
| GET    | `/trees/org?include_inactive=false`    | 默认 仅在职员工 树                                  |
| GET    | `/trees/cost-center?include_inactive=false` | 默认 仅生效 树                                  |
| POST   | `/trees/org/refresh`                   | 手动触发重算（也会在数据拉取后自动调用）             |
| POST   | `/trees/cost-center/refresh`           |                                                      |

## 10. 数据集 (datasets)

| Method | Path                                          | 说明                              |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/datasets`                                   | 当前用户可见的数据集（按 ACL 过滤） |
| POST   | `/datasets`                                   |                                   |
| GET    | `/datasets/{id}`                              | 含 tables、relations、acl         |
| PUT    | `/datasets/{id}`                              |                                   |
| DELETE | `/datasets/{id}`                              | 仍被报表引用 → 409                |
| GET    | `/datasets/{id}/integrity`                    | 关联完整性校验（FR-REPORT-005）   |

## 11. 报表 (reports)

| Method | Path                                  | 说明                                       |
| ------ | ------------------------------------- | ------------------------------------------ |
| GET    | `/reports`                            | 当前用户可见的报表                         |
| POST   | `/reports`                            | 创建（必须先指定 `dataset_id`）            |
| GET    | `/reports/{id}`                       |                                            |
| PUT    | `/reports/{id}`                       |                                            |
| POST   | `/reports/{id}/run`                   | 执行查询，返回结果集（带分页）             |
| POST   | `/reports/{id}/export?format=xlsx     | csv`                                | 导出 |

`POST /reports` body 示例：

```json
{
  "name": "华东 5 月工资汇总",
  "dataset_id": 12,
  "definition": {
    "dimensions": ["cost_center_monthly.cc_code", "emp_monthly_roster.employment_type"],
    "measures":   [{"expr": "SUM(emp_monthly_salary.base_salary)", "alias": "工资合计"}],
    "filters":    [{"col": "emp_monthly_salary.period_ym", "op": "=", "val": "2026-05"}]
  }
}
```

## 12. 通用错误码

| Code | 含义                                         |
| ---- | -------------------------------------------- |
| 401  | 未登录或 JWT 失效                            |
| 403  | 无权限（角色/数据/操作 任一不满足）          |
| 409  | 资源被引用（标签/数据集/角色 删除冲突）       |
| 422  | 参数校验失败（Pydantic）                     |
| 423  | 账号被锁（登录失败 ≥5 次）                   |
| 501  | 本期占位（飞书 SSO 相关）                     |

---

## 性能约束（来自 spec SC）

- `/data/*` 与 `/reports/*/run`：典型万级行数 < 1s，十万级 < 3s
- `/auth/me`：< 100ms（每次请求都会调）
- `/datasources/endpoints/{id}/run`：异步执行，立即返回 202 + log_id；日志通过 `/logs` 轮询