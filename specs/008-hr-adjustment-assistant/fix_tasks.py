import re

with open('tasks.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix T011 duplicate
content = content.replace('T011 **会话 API 路由**', 'T012 **会话 API 路由**')
content = content.replace('T012 **调整条目 API 路由**', 'T013 **调整条目 API 路由**')
content = content.replace('T013 **歧义记录 API 路由**', 'T014 **歧义记录 API 路由**')
content = content.replace('T014 **待办管理模块**', 'T015 **待办管理模块**')
content = content.replace('T015 **确认执行逻辑**', 'T016 **确认执行逻辑**')
content = content.replace('T016 **注册 4 个新 Capability**', 'T017 **注册 4 个新 Capability**')
content = content.replace('T017 **ChatRoute + Extractor 实现**', 'T018 **ChatRoute + Extractor 实现**')
content = content.replace('T018 [P] **Seed 数据初始化**', 'T019 [P] **Seed 数据初始化**')

# Tests
content = content.replace('T019 [P] [US1] **`tests/test_dag_sorter.py`**', 'T020 [P] [US1] **`tests/test_dag_sorter.py`**')
content = content.replace('T020 [P] [US1] **`tests/test_schedule_checker.py`**', 'T021 [P] [US1] **`tests/test_schedule_checker.py`**')
content = content.replace('T021 [P] [US1-5] **`tests/test_hr_adjustment_api.py`**', 'T022 [P] [US1-5] **`tests/test_hr_adjustment_api.py`**')
content = content.replace('T022 [P] [US1-3] **`tests/test_ai_capability_routing.py`**', 'T023 [P] [US1-3] **`tests/test_ai_capability_routing.py`**')
content = content.replace('T023 **Phase 1 端到端验收**', 'T024 **Phase 1 端到端验收**')

# Phase 2
content = content.replace('T024 **前端路由 + 菜单配置**', 'T025 **前端路由 + 菜单配置**')
content = content.replace('T025 [P] **调整对话页面**', 'T026 [P] **调整对话页面**')
content = content.replace('T026 [P] **确认卡片组件**', 'T027 [P] **确认卡片组件**')
content = content.replace('T027 [P] **调整清单页面**', 'T028 [P] **调整清单页面**')
content = content.replace('T028 [P] **待办看板页面**', 'T029 [P] **待办看板页面**')
content = content.replace('T029 **AI 侧边栏集成**', 'T030 **AI 侧边栏集成**')
content = content.replace('T030 **前后端全链路联调**', 'T031 **前后端全链路联调**')
content = content.replace('T031 [P] [US1-8] **`tests/frontend/hr-adjustment/`', 'T032 [P] [US1-8] **`tests/frontend/hr-adjustment/`')
content = content.replace('T032 [P] [US1-8] **E2E 测试**', 'T033 [P] [US1-8] **E2E 测试**')
content = content.replace('T033 **Phase 2 端到端验收**', 'T034 **Phase 2 端到端验收**')

# Phase 3
content = content.replace('T034 **飞书 SDK 基础封装**', 'T035 **飞书 SDK 基础封装**')
content = content.replace('T035 [P] **飞书消息服务**', 'T036 [P] **飞书消息服务**')
content = content.replace('T036 [P] **飞书事件订阅**', 'T037 [P] **飞书事件订阅**')
content = content.replace('T037 [P] **飞书文档组件**', 'T038 [P] **飞书文档组件**')
content = content.replace('T038 **群聊提醒 + 采集集成**', 'T039 **群聊提醒 + 采集集成**')
content = content.replace('T039 **飞书私聊确认卡片**', 'T040 **飞书私聊确认卡片**')
content = content.replace('T040 [P] [US6-7] **`tests/integrations/test_feishu_client.py`**', 'T041 [P] [US6-7] **`tests/integrations/test_feishu_client.py`**')
content = content.replace('T041 [P] [US6-7] **`tests/integrations/test_feishu_events.py`**', 'T042 [P] [US6-7] **`tests/integrations/test_feishu_events.py`**')
content = content.replace('T042 **Phase 3 端到端验收**', 'T043 **Phase 3 端到端验收**')

# Phase 4
content = content.replace('T043 **北森写 API 网关封装**', 'T044 **北森写 API 网关封装**')
content = content.replace('T044 [P] **OriginalId 管理模块**', 'T045 [P] **OriginalId 管理模块**')
content = content.replace('T045 [P] **执行前反查校验**', 'T046 [P] **执行前反查校验**')
content = content.replace('T046 [P] **批量执行引擎**', 'T047 [P] **批量执行引擎**')
content = content.replace('T047 **执行结果回写**', 'T048 **执行结果回写**')
content = content.replace('T047 **执行安全加强**', 'T049 **执行安全加强**')
content = content.replace('T049 [P] [US6] **`tests/integrations/test_beisen_gateway.py`**', 'T050 [P] [US6] **`tests/integrations/test_beisen_gateway.py`**')
content = content.replace('T050 [P] [US6] **`tests/test_executor.py`**', 'T051 [P] [US6] **`tests/test_executor.py`**')
content = content.replace('T051 **Phase 4 端到端验收**', 'T052 **Phase 4 端到端验收**')

# Phase 5
content = content.replace('T052 **灰度配置**', 'T053 **灰度配置**')
content = content.replace('T053 **监控与告警**', 'T054 **监控与告警**')
content = content.replace('T054 **用户文档**', 'T055 **用户文档**')
content = content.replace('T055 **生产验收与上线**', 'T056 **生产验收与上线**')

# Dependency graph
content = content.replace('T006 + T007 + T010', 'T006 + T007 + T010')
content = content.replace('T008 + T009', 'T008 + T009')
content = content.replace('T012/T013 ——→ T016', 'T012/T013 ——→ T016')
content = content.replace('[验收闸] T020-T024 ——→ 阻塞 Phase 2', '[验收闸] T020-T024 ——→ 阻塞 Phase 2')
content = content.replace('T025 ——→ T026/T027/T028/T029', 'T025 ——→ T026/T027/T028/T029')
content = content.replace('[验收闸] T032-T034 ——→ 阻塞 Phase 3', '[验收闸] T032-T034 ——→ 阻塞 Phase 3')
content = content.replace('T035 ——→ T036/T037/T038', 'T035 ——→ T036/T037/T038')
content = content.replace('[验收闸] T050-T052', '[验收闸] T050-T052')
content = content.replace('T053 ——→ T054/T055 ——→ T056', 'T053 ——→ T054/T055 ——→ T056')

# Update totals
content = content.replace('| **合计** | **55** |', '| **合计** | **56** |')

with open('tasks.md', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done - renumbered tasks.md')
