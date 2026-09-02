# 019 验收证据

日期：2026-09-01

## 自动化测试

- 后端报表归并、实体列查询、配置校验、导出/余差、操作日志：42 tests passed。
- 后端归并核心、SQL 集成、审计复跑：35 tests passed。
- 前端 `ReportDimensionMergeConfig.spec.ts`、`OperationLogs.spec.ts`：4 tests passed。
- `git diff --check`：通过，仅出现仓库既有 LF/CRLF 提示。
- Alembic：`0216_report_merge_audit_details (head)`，数据库已存在 `system_log_details`。

## Docker 构建与运行

- `docker compose build backend`：成功。
- `docker compose build frontend`：成功，Vite 转换 2818 modules。
- backend/frontend/db/gotenberg 容器均运行；db healthy；后端 startup complete。
- 宿主机 `http://127.0.0.1:8080/` 返回前端 HTML。

## API 实测

- `POST /reports/_dimension-merge/combinations/search`：真实数据集返回 12 个完整维度组合，包含真实 `NULL`。
- `POST /reports/_dimension-merge/preview`：来源 1、命中 1、返回 typed target 和碰撞状态。
- 临时报表端到端：
  - 来源 `(三级部门=NULL)` 映射为 `三级部门=MERGED`；
  - 运行结果得到 `MERGED / count(employee_no)=29`；
  - 独立导出验收将同一来源映射为 `MERGED-EXPORT`，在线运行和 CSV 均包含该最终值（CSV 13 行）；推送复用同一 `_collect_export_rows` 主链；
  - 修改目标为 `MERGED2` 后生成一条 `report_access/update` 父日志；
  - `GET /system-logs/{id}/details` 返回一条 `target_changed` 差异；
  - 临时报表已删除。

## 浏览器实测

- [入口截图](01-dimension-merge-entry.png)：字段编排标题栏入口和高级配置一级页签正常。
- [规则编辑器截图](02-dimension-merge-rule-editor.png)：左右分栏、候选分页、`NULL`、操作固定列、结果编辑器正常。
- 浏览器 CDP 断言：候选 12 行；选择来源后规则来源数变为 1；单一来源相同维度值自动切换为“自动带出”。
- 1440px 视口：操作按钮右边界 1284px；body scrollWidth 1430px，不产生页面级横向滚动。

## 已知环境事项

- 完整 `npm run build` 的 `vue-tsc --noEmit` 被需求前已存在的 `src/components/performance/ReviewQuestionTable.spec.ts:48` 类型错误阻断：`Property 'exists' does not exist...`。
- 本需求新增文件通过 Vite production build 和目标 Vitest；未修改该无关绩效测试文件。
