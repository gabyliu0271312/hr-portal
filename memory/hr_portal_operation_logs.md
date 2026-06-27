---
name: hr-portal-operation-logs
description: HR提效工具操作日志——复用 system_logs 表按 category 多路复用，加新日志类型零建表；补偿金计算已埋点
metadata:
  type: project
---

HR 提效工具(`hr-portal`)的**操作日志**：日志管理 → 操作日志(`system.logs.operation`)。2026-06-23 上线，首期记补偿金计算的使用(谁/何时/查了谁)。

**核心架构决策**：不为每类日志建表，统一复用 `system_logs` 表的 `category` 字段多路复用。
- AI 调用 = `category="ai_call"`(原有)，补偿金 = `category="compensation_calc"`
- 查询接口 `GET /system-logs?category=xxx`：**category 必填**，权限按 category 动态映射菜单码(`_CATEGORY_MENU` 字典：ai_call→system.logs.ai，compensation_calc→system.logs.operation)，再用 `get_user_menus` 判权限——**不能用 `require_op` 装饰器绑死单一菜单**，否则两类日志没法共用一个接口
- 接口 join users 返回 `user_display_name`(操作人姓名)；被查员工等专属信息存 `metadata_json`
- 前端 `OperationLogs.vue`：顶部日志类型下拉(`LOG_TYPES`)，补偿金类型下显示「被查员工/工号/公司/计算结果」专属列(B2 动态列方案)

**How to apply — 加一种新日志类型(如登录日志)的最低成本**(不建表、不走完整加菜单 SOP)：
1. 业务代码埋点：`db.add(SystemLog(category="login", action=..., user_id=..., metadata_json={...}))`
2. `system/router.py` 的 `_CATEGORY_MENU` 加一行 `"login": "system.logs.xxx"`
3. 前端 `OperationLogs.vue` 的 `LOG_TYPES` 加一项 + 按需加该类型专属列
4. 若要独立菜单权限，才走 [[hr-portal-add-menu-sop]] 加菜单

**Why**：`system_logs` 表字段(category/action/user_id/request_summary/metadata_json/created_at)本就为通用日志��计，category 多路复用是它的预期用法；统一一个「操作日志」入口 + 类型下拉，业务用户认知成本最低，符合用户"后续还会加其他日志"的诉求。

注意：补偿金埋点在 `tools/router.py` 的 `calculate_compensation` 里调 `_record_compensation_calc`，只记「计算」动作(不记搜索)。时间显示走 [[hr-portal-time-display-beijing]]。
