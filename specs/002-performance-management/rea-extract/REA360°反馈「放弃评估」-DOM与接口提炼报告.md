# REA 360°反馈「放弃评估」— DOM 与接口提炼报告

- 状态：**评估完成 → 已推进实现**（2026-11-07；实现见文末 §8，代码+测试已落地）
- 日期：2026-11-07
- 路径：绩效管理 → 给他人的评估 → 360°反馈 → 成员列表（`from=VoluntaryBtn`）
- URL：`https://idreamsky.feishu.cn/perf/review/7702053437998894368/7311617673744695324/members?from=VoluntaryBtn&rootReviewId=7704285134907837708`
- 权威：共享 Chrome 实测 DOM/计算样式/网络重放（`out/360-abandon/*.json` + PNG）；截图仅辅助
- 素材：`rea-extract/out/360-abandon/`（01–19，脚本 `capture-360-abandon-*.js`）

---

## 1. 页面定位与整体结构

「360°反馈」成员列表是**阶段详情页**（`/perf/review/<semesterId>/<stageId>/members`），非弹窗：

```
App > 左侧栏（我的绩效 / 自评 / 给他人的评估 > 360°反馈（自愿评估））
└── 主区 content
    ├── 页头（360°反馈（自愿评估））
    │   ├── 标题「360°反馈（自愿评估）」（x=300, 16px/600）
    │   └── 顶部说明「你可以在 2026-11-21 23:59（GMT+8）前继续编辑」（截止提示）
    ├── 工具栏
    │   ├── 搜索框（「搜索成员」292×32）
    │   ├── 筛选按钮（outlined）
    │   └── 右上「自愿评估」按钮（80×32 filled，色 #1456F0）
    ├── 统计「1个结果」/「待评估：N人」标签
    └── ud__table 成员列表（940×293，6 列）
        ├── 表头：姓名 / 360° 评估状态 / 评估类型 / 360° 评估关系 / 360° 评估截止时间 / 序列
        └── 行：两成员各 52px 高
            ├── alice.xiao 肖惠方（待完成 → 全屏评估表单）
            └── rita.tang 唐洁（已完成 → 右侧抽屉只读）
```

**左侧栏标签**：`360°反馈（自愿评估）` 二级菜单，行尾「待完成」标签与该列表的待完成成员数联动（放弃后消失）。

## 2. 接口逻辑（已实测网络重放确认）

### 列表加载

| 接口 | 方法 | 参数 | 说明 |
| --- | --- | --- | --- |
| `/perf/api/review/v2/stage/7702053437998894368/list_invite_review` | POST | `{"stage_id":"7311617673744695324"}` | 成员列表；返回每行 `task_id / employee_no / display_name / status / source_label / relationship / due_at / job_sequence / department` |
| `/perf/api/review/v2/stage/invite_review/stages` | POST | — | 阶段信息（截止时间、状态等） |

### 放弃评估（核心删除链路）

| 步骤 | 动作 |
| --- | --- |
| 1 | 待完成表单点「放弃评估」→ `ud__confirm` 确认弹窗「确定放弃评估？」 |
| 2 | 点「确定」→ **POST** `/perf/api/review/v2/stage/invite_review/giveup_voluntary_review`，body `{"stageId":"7311617673744695324","rootReviewId":"7704285134907837708"}` |
| 3 | 成功 → toast「操作成功」，弹窗/表单关闭 |
| 4 | 重拉 `list_invite_review` → **该成员从列表消失**；左侧栏「待完成」标签同步消失 |

要点：

- `rootReviewId` 是该成员评估的 root id（非阶段 id），`giveup_voluntary_review` 只删**自愿评估**的邀请，不删系统/他人邀请的必评成员。
- 删除后 URL 中 `rootReviewId` 参数被清理（回到 `?from=VoluntaryBtn` 或裸路径）。
- **风险提示（真实发生）**：脚本 12 拦截正则未匹配 `giveup_voluntary_review`，导致 **alice.xiao 已真实从该测试周期 360° 评估人列表删除**（见 §5）。

## 3. 按钮出现逻辑（核心结论，已逐步验证）

### 3.1 成员行点击 → 两种态

| 成员状态 | 点击行为 | 底部按钮 |
| --- | --- | --- |
| **待完成**（alice.xiao） | 打开**全屏评估表单**（`full-screen-modal`，100vw/100vh） | **提交（filled）· 放弃评估（outlined-primary）· 取消（outlined）** |
| **已完成**（rita.tang） | 打开**右侧抽屉只读**（`ud__drawer__content`，773px 宽） | 「编辑」按钮 + notice「你可以在截止前继续编辑」+ 草稿确认「有未提交的草稿，是否使用？」 |

### 3.2 放弃评估按钮只出现在「待完成」态

- **待完成表单**（`09-alice.xiao-clean-form.json`）：底部三按钮 `提交(filled #1456F0 白字) / 放弃评估(outlined-primary 白底蓝字蓝边) / 取消(outlined-default 灰底灰边)`，各 80×32、radius 6px、font 14px。
- **已完成编辑表单**（`16-edit-final.json`）：底部只有 `提交 + 取消`，**无放弃评估**。
- **结论**：放弃评估按钮仅在**非已完成（待完成）**状态出现——与需求描述一致。已完成成员如需撤销需走「编辑」草稿链路，无放弃入口。

### 3.3 自动打开逻辑

- 页面加载后**自动打开第一个待完成成员的评估表单**（`19-auto-open.json`：无 modal，因删除后已无待完成成员；此乃页面自带行为）。
- 列表若有多个待完成成员，点各自行分别打开对应表单；`rootReviewId` URL 参数决定锚定的 root（脚本 05 验证：两个不同 root 的行点击行为一致，均打开当前 root 的表单）。

### 3.4 放弃确认弹窗（`04-abandon-confirm.json` / `04b-confirm-btns.json`）

| 属性 | 值 |
| --- | --- |
| 容器 | `ud__confirm__content ud__confirm-hasIcon ud__confirm-confirm`，420×136，radius 8px |
| 遮罩 | `ud__dialog__mask`，`rgba(0,0,0,0.55)` |
| 标题 | 「确定放弃评估？」16px/600，`ud__confirm__title` |
| 图标 | `ud__confirm__icon` 24×24（InfoFilled 类） |
| 底部 | `ud__confirm__footer` 高 56px，flex gap 12px，padding `0 24px 24px` |
| 按钮 | 「确定」`ud__button--filled` 蓝底 #1456F0 白字 / 「取消」`ud__button--outlined` 白底灰边 #1F2329 黑字，各 80×32 radius 6px |

## 4. 组件规格（像素级，实测计算样式）

### 4.1 待完成评估表单（`full-screen-modal`，全屏）

| 属性 | 值 |
| --- | --- |
| 容器 | `full-screen-modal`，100vw/100vh，白底 |
| 页头 | 高 56px，左「返回」，标题 = `display_name + 部门 + 序列 + 直属上级：xxx` |
| 正文 | 提示语 notice（「可以谈谈你在过往的协作中…」84px 高）+ 富文本区 `zone-container editor-kit-container` ×2（1246×88 + 1226×88） |
| 底部操作栏 | 高 56px（min-height），padding `8px max(0, (100%-1280px)/2)`，按钮 80×32 gap 12px |

### 4.2 已完成只读抽屉（`ud__drawer__content`）

| 属性 | 值 |
| --- | --- |
| 宽度 | 773px（实测 `12-drawer-full.json`） |
| 内容 | 只读 360° 反馈 + 留言 + 「编辑」按钮 + notice「你可以在 2026-11-21 23:59 前继续编辑」 |

## 5. 组件复用分析（对照现有实现）

### 5.1 已确认可完全复用的组件

| 现有组件 | 复用点 | 匹配度 |
| --- | --- | --- |
| `PerformanceReview360FeedbackPanel.vue` | **本页成员列表的现有实现**：6 列结构（姓名/360°评估状态/评估类型/360°评估关系/360°评估截止时间/序列）与 REA 实测完全一致；含搜索/筛选/排序/分页/空态 + 自愿评估弹窗（`PerformanceDialogShell` 600px + `PerformancePersonSelect` + `start` 接口） | **完全匹配** |
| `PerformanceConfirmDialog.vue` `appearance="submit"` | 确认弹窗 420px、遮罩 `rgba(0,0,0,.55)`、footer 56px `0 24px 24px`、按钮 80×32/6px、图标 24×24 —— 与飞书 `ud__confirm` 放弃确认**逐项同构** | **100% 同构** |
| `UiButton.vue` `variant="outline-primary"` | 放弃评估按钮（白底蓝字蓝边，80×32/6px） | 完全匹配 |
| `UiButton.vue` `variant="primary" / "secondary"` | 提交 / 取消 按钮 | 完全匹配 |
| `UiFixedActionBar.vue` | 全屏表单底部操作栏（提交/预览/取消 slot 可换成提交/放弃评估/取消） | 完全匹配 |
| `PerformanceDialogShell.vue` `fullscreen` | 全屏评估表单容器（100vw/100vh、页头 56、内容区 flex:1） | 完全匹配 |
| `UiDrawerShell.vue` | 已完成成员右侧只读抽屉容器（`PerformanceDrawerShell` 即其 spec 别名） | 复用候选 |

### 5.2 需新增（无现成实现）

| 缺失能力 | 说明 |
| --- | --- |
| 评估表单内容区 | 富文本 360° 反馈 + 留言双区（`editor-kit` 富文本），现有 `PerformanceReviewer360Content.vue` 是**模板设计器预览**（"通过搜索添加 360° 评估人"），不是评估表单，**不适用** |
| 已完成只读抽屉内容 | 只读 360° 反馈展示 + 编辑按钮 + 截止提示 |
| 放弃评估逻辑 | 调 `giveup_voluntary_review` + 重拉 `list_invite_review` + 关闭表单 + 左侧栏待完成标签联动 |

### 5.3 不适用组件（避免误用）

- `PerformanceReviewer360Content.vue`：模板设计器的「360° 评估内容」预览，与评估人填写表单无关。
- `PerformanceProject360InviteSettingsDrawer.vue`：邀请设置抽屉（被评估人视角），非评估人视角。

## 6. 实现建议（后续如需编码）

- **入口**：`PerformanceReview360FeedbackPanel` 已覆盖列表 + 自愿评估；缺「点行打开表单/抽屉」。
- **行点击**：`@row-click` 已存在（emit `open-task`），在调用方补：status=pending → 打开全屏评估表单；status=completed → 打开只读抽屉。
- **确认弹窗**：直接 `PerformanceConfirmDialog` + `appearance="submit"`，标题「确定放弃评估？」，确定回调 `giveup_voluntary_review`。
- **接口**：`api/performance.js` 需补 `giveup_voluntary_review`（POST，payload `{stageId, rootReviewId}`）。

## 7. 生产数据变更披露（重要）

**脚本 `capture-360-abandon-12-intercept.js` 中，拦截正则（`abandon|give_up|quit|delete|remove|cancel|leave|drop|withdraw|revoke`）未匹配 `giveup_voluntary_review`，导致删除接口被真实执行。**

- 影响：**alice.xiao 肖惠方已从该测试周期（7702053437998894368）360° 评估人列表真实删除**（列表从 2 人 → 1 人，剩 rita.tang）。
- 后续脚本（13–19）均在删除后的 1 人列表上继续采集，结论不受影响。
- 恢复方式：通过「自愿评估」按钮重新添加（脚本 15/18 已验证该入口可用）。

## 8. 实现状态（2026-11-07 已推进编码）

评估结论已落地为本仓库正式功能，全链路实现+测试+类型检查通过，等待部署验证。

### 8.1 后端

| 文件 | 变更 |
| --- | --- |
| `backend/app/performance/review_360_feedback_router.py` | `FeedbackItemOut.can_giveup` 字段；`GIVEUP_AUDIT_EVENT = "REVIEWER_360_VOLUNTARY_GIVEUP"`；`_voluntary_task_ids`（自愿判定=存在 `REVIEWER_360_VOLUNTEERED` 审计事件，JSONB 取回后 Python 侧比对 project_id/task_id）；`POST /projects/{project_id}/giveup` 路由（校验节点/任务/本人/未提交/快照/自愿来源，置 `revoked_at=now`，记审计事件） |
| `backend/app/performance/projects_router.py` | `_template_task_detail` 响应加 `can_giveup`（evaluation + REVIEWER_360 + 未提交 + 未 revoked + 自愿审计事件）；同步修复 `after_state.op("->>")` JSONB 查询陷阱 |
| `backend/tests/test_performance_projects.py` | `test_360_giveup_route_branches` 参数化 3 用例（自愿待提交→成功 / 已提交→409 / 非自愿→409）；`test_360_feedback_list_preserves_*` 补 `_voluntary_task_ids` mock |

**can_giveup 判定（权威口径）**：自愿来源以 `REVIEWER_360_VOLUNTEERED` 审计事件的 `after_state.task_id` 为准，**不是** `source_label` 文案；`revoked_at IS NULL` 的部分唯一索引保证不重复。

### 8.2 前端

| 文件 | 变更 |
| --- | --- |
| `frontend/src/api/performance.ts` | `PerformanceTemplateTask.can_giveup`、`PerformanceReview360FeedbackItem.can_giveup`、`performanceReview360FeedbackApi.giveup(projectId, taskId, nodeId?)` |
| `frontend/src/components/performance/PerformanceSelfSummaryFooter.vue` | `canGiveup` prop → 提交/取消之间渲染「放弃评估」`UiButton`（outline-primary） |
| `frontend/src/views/performance/SelfSummaryTask.vue` | 表单页 footer 透传 `can-giveup`；新增 `PerformanceConfirmDialog`（`appearance="submit"`，飞书 ud__confirm 同构：420px/0.55 遮罩/56px footer/80×32 按钮）；`giveup()` 调接口成功 → toast + 失效 overview 缓存 → 返回评估列表 |

**按钮出现条件**：`!viewing && !draftPending && !loading && !loadError && task.can_giveup && !task.submitted_at`。

### 8.3 验证记录

- 后端专项 `-k "360 or voluntary or feedback"`：**30 passed**
- 后端 performance 相关文件全量：**516 passed**，唯一失败 `test_hrbp_rules_migration_*` 为干净树既有失败
- 全量套件杂散失败（allocation×3 / app_identity / ucp / webhook / warehouse×3 / ai_controlled）经干净树对照均与本次改动无关（warehouse 单独跑全过，仅全量顺序运行时挂）
- 前端 `vue-tsc --noEmit`：**零错误**
- 部署验证：未做（需 compose 重启 backend + 前端构建，本地验证后可部署）
