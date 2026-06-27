---
name: hr-portal-time-display-beijing
description: HR提效工具前端时间显示统一规范——一律走 utils/datetime.ts，锁死北京时间，禁止裸用 toLocaleString
metadata:
  type: project
---

HR 提效工具(`hr-portal`)前端**所有时间显示**必须统一为北京时间,且不依赖浏览器/服务器本地时区。

**根因**:后端时间统一为 UTC(`datetime.now(UTC)` / Postgres `func.now()`,列均 `timestamptz`),序列化带 `+00:00`。前端旧代码用 `new Date(x).toLocaleString('zh-CN')`——`'zh-CN'` 只控制格式不锁时区,时区取决于运行环境,环境非北京时区就显示成 UTC(差 8 小时);系统日志页更是直接原样渲染原始 ISO 串。

**唯一入口**:`frontend/src/utils/datetime.ts`
- `formatDateTime(v)` — 日期+时间,显式 `timeZone: 'Asia/Shanghai'`,兼容无偏移 ISO 串(按 UTC 补 `Z`)
- `formatDateOnly(v)` — 纯日期字段(如入职日期 `2024-01-01`),**只取日期不做时区偏移**,否则会变成前一天

**How to apply**:今后任何新页面/新字段显示时间,一律 `import { formatDateTime } from '@/utils/datetime'`,**禁止**再裸写 `new Date().toLocaleString` / `toLocaleDateString`。判断字段是时间点还是纯日期:时间点用 `formatDateTime`,纯日期用 `formatDateOnly`。

**Why**:这是显示层问题,锁 `Asia/Shanghai` 是充分条件,不动后端 UTC 语义(标准做法)。项目无 ESLint,靠此约定 + 唯一工具函数保证一致。

注意:`frontend/src/views/data/DataTableView.vue.js` 是误提交的编译产物(被 git 跟踪但无任何引用),不要去改它。部署见 [[hr_portal_server_deploy]]。
