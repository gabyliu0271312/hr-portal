---
name: hr-portal-feishu-sso
description: HR提效工具飞书单点登录实现——邮箱匹配为主、首次回写绑定、匹配不到拒绝登录；启用前需填凭证+开关+飞书白名单
metadata:
  type: project
---

HR 提效工具(`hr-portal`)的**飞书单点登录**(用飞书账号登录 Portal 本身,非 [[specs-003]] 那种跳外部成本分摊系统)。2026-06-23 实现。

**身份匹配策略**(已和用户确认):
- 优先认已绑定的 `users.feishu_user_id`(= 飞书 open_id)
- 否则按邮箱匹配 `users.email`:飞书 `enterprise_email`(企业邮箱) 优先,再 `email`
- 首次邮箱匹配成功 → 回写 `feishu_user_id` 完成绑定
- 匹配不到 → **拒绝登录**并提示联系管理员(不自动建用户)

**关键文件**:
- 后端 `app/auth/feishu_client.py`(OAuth 客户端,app_access_token 30 分钟内存缓存)+ `app/auth/router.py` 的 `GET /auth/feishu/url`(带 state 防 CSRF) 和 `GET /auth/feishu/callback`
- 前端 `views/auth/FeishuCallback.vue`(public 路由 `/auth/feishu/callback`,校验 sessionStorage 里的 state)、`Login.vue` 飞书按钮、`stores/user.ts` 的 `loginByFeishu`
- `User.feishu_user_id` 字段早就存在(脚手架预留),**无需 alembic 迁移**

**How to apply — 启用前必做两件事**(默认 `FEISHU_SSO_ENABLED=false` 关闭):
1. `.env` 填 `FEISHU_APP_ID`/`FEISHU_APP_SECRET`、设 `FEISHU_SSO_ENABLED=true`、`FEISHU_REDIRECT_URI`(生产应为 `http://192.168.10.13:37801/auth/feishu/callback`)。配置三处同步:`.env`/`.env.example`/`docker-compose.yml` 的 `environment:` 都要列出变量,漏 compose 则容器读不到
2. 飞书开放平台「安全设置-重定向 URL」白名单加**完全一致**的回调地址,并开通获取用户邮箱权限

**Why**:这是 Portal 自己的登录链路,签发自己的 JWT(复用 `create_access_token` + `is_active`/锁定逻辑);与 [[hr_portal_server_deploy]] 的生产端口(前端 37801 对外)对齐。
