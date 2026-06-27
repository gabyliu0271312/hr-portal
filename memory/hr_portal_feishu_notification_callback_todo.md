# 飞书事件订阅/卡片回调公网化待办

日期：2026-06-27

## 当前状态

- 生产服务器本机已验证 `/api/v1/feishu/callbacks/card-action` 正常。
- 本机 curl：

```bash
TOKEN=$(grep '^FEISHU_VERIFICATION_TOKEN=' .env | tail -1 | cut -d= -f2-)

curl -s -X POST 'http://localhost:37801/api/v1/feishu/callbacks/card-action' \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"url_verification\",\"token\":\"$TOKEN\",\"challenge\":\"test_challenge\"}"
```

- 返回成功：

```json
{"challenge":"test_challenge"}
```

- `FEISHU_VERIFICATION_TOKEN` 已配置到 `.env`。
- `docker-compose.yml` 已透传：

```yaml
FEISHU_VERIFICATION_TOKEN: ${FEISHU_VERIFICATION_TOKEN:-}
FEISHU_CALLBACK_MAX_TIMESTAMP_DIFF: ${FEISHU_CALLBACK_MAX_TIMESTAMP_DIFF:-300}
```

## 飞书开放平台现象

- 在飞书开放平台配置事件/回调请求地址时仍提示：返回数据不是合法的 JSON 格式。

## 判断

- 后端接口、token 校验、JSON 返回均正常。
- 问题大概率不是应用代码问题，而是飞书开放平台云端访问不到公司内网地址，或访问时被网关/防火墙返回了 HTML/错误页。
- 当前内网地址：

```text
http://192.168.10.13:37801/api/v1/feishu/callbacks/card-action
```

## 待办

需要 IT 提供飞书开放平台可访问的公网 HTTPS 域名或反向代理，例如：

```text
https://hr.xxx.com/api/v1/feishu/callbacks/card-action
```

反向代理到：

```text
http://192.168.10.13:37801/api/v1/feishu/callbacks/card-action
```

## 当前功能策略

- 主动发送飞书通知不依赖事件订阅/回调配置。
- 可先继续验收：消息配置、消息预览、测试发送、自动化规则触发发送消息。
- 事件/回调仅在以下场景必须启用：
  1. 飞书卡片按钮点击后回调系统。
  2. 接收用户发给机器人的消息。
  3. 接收群聊、通讯录、审批等飞书事件。
