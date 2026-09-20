# CR-005 验证快速路径

## 前置条件

- Docker 服务已启动：`docker compose -f hr-portal/docker-compose.yml up -d`
- 已存在一个启动项目和工作总结任务。
- 使用当前 HR Portal 账号登录；不将 Token、Cookie 或 storage state 写入仓库。

## 自动化验证

```bash
cd hr-portal/frontend
npx vitest run \
  src/views/performance/Review.spec.ts \
  src/views/performance/Review.spec.js \
  src/views/performance/SelfSummaryTask.spec.js
npx vite build

cd ../backend
pytest -q tests/test_performance_projects.py
```

## 真实链路验证

1. 打开“绩效评估”，选择工作总结节点并点击“去完成”。
2. 填写 rich text、rating、tag-with-followup，触发草稿保存并提交。
3. 返回概览，确认仍绑定相同 `task_id`。
4. 截止期内：确认成功提示和“编辑”入口；点击后重开同一任务并回填答案。
5. 截止期后：确认只读展示，不显示编辑入口。
6. 切换至 pending、not_started、overdue 节点，确认大白卡左右边界与完成态一致；仅内部内容和时间信息不同。
7. 记录 UI→API→持久化→重开证据；没有同视口截图与 rendered contract 时，P2 状态保持 `not-run`/`blocked`。

## 非法/兼容场景

- `entry_mode=template_task` 缺少 `task_id`。
- 未注册 `task_kind` 或 field type。
- 标签 note 含脚本或 `javascript:` 链接。
- 重复 section 删除第一条后仍至少保留一条。
- 并发 version 冲突返回 `VERSION_CONFLICT`。
