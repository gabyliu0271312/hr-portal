# REA 飞书绩效「模板预览」页 架构提炼报告

> 路径：绩效管理后台 → 绩效模板 → 编辑绩效模板（4 步向导）→ 模板预览（step 4）
> 样本模板：`全量测试模板`（template_group_id = `7699791798989900738`，scenes = `review`，status=2 草稿，version v4）
> 抓取方式：真实登录态浏览器，落盘 DOM/网络/CSS 截图，证据目录 `rea-extract/out/`
> 本报告全部结论基于实际接口响应与 DOM，无猜测部分已明确标注。

---

## 1. 整体架构

### 1.1 技术栈（从产物指纹确认）

| 层 | 事实 | 证据 |
|---|---|---|
| 框架 | React SPA（非 SSR），路由 `/perf/admin/templates/:id/:step(1~4)` | page.html 单一根节点 `.App`，侧栏 `<a href="/perf/admin/...">` |
| 样式 | Tailwind 风格原子类 + styled-components（`indexstyled__StyledPage-hOdlce`） | DOM class |
| 组件库 | 飞书 Universe UI：`ud__card` / `ud__button` / `ud__modal`、`universe-icon` | DOM class |
| 部署 | 静态资源 `sf3-cn.feishucdn.com/obj/people-performance/prod/`，`manifest.json` + 分片 chunk（js/css 按编号分包） | 网络记录 |
| 监控 | Slardar（`slardar-bd.feishu.cn/monitor_browser/collect/batch/?biz_id=performance_x_fe`） | 网络记录 |
| i18n | Starling 文案服务 `starling.snssdk.com/check_and_get_text/...` | 网络记录 |
| 配置中心 | TCC（`lf3-config.bytetcc.com/.../performance.*_prod-default`） | 网络记录 |

### 1.2 核心：模板数据是「引用图（Ref-Graph）」而非嵌套树

整个模板编辑器（流程设置/内容设置/模板预览/前端填写页）共用**一份** schema，来自唯一核心接口：

```
GET /perf/api/review/v2/template_groups/{id}/detail
```

响应（约 298KB，本样本）结构：

```
data
├─ id / name / langs / template_version / specific_group_config
├─ questions[]              # 问答型指标配置（本样本 1 条：价值贡献 tag_text）
└─ frontend                  # ★ 前端渲染专用 schema
   ├─ version: "3"
   ├─ data                   # 流程树（只存引用）
   │   ├─ id / name / description / finalResult / keyIndicator / computationRule
   │   └─ stages: [{id, type:"stage", _type:"ref"} × 12]
   ├─ entities               # ★ 实体表（全部真实定义都在这里）
   │   ├─ flow(1)            # 流程 = name + stages 引用列表
   │   ├─ stage(12)          # 环节定义
   │   ├─ template(36)       # 每环节的「填写模板」与「展示模板」
   │   ├─ templateItem(18)   # 填写内容项（表单题）
   │   ├─ entry(17)          # 内容项内的子条目（题/指标/评语）
   │   ├─ subEntry(1) / subIndicator(1) / subField(1)
   │   └─ scoreRule(0) / scoreOption(0) / specificGroup(0) / stageGroup(0) / customEntry(0)
   ├─ behaviors              # ★ 行为矩阵（权限/交互开关）
   │   ├─ permission: { <behaviorId>: {flow, stage, template, mode:"read"|"write"} ... }
   │   └─ entrySetting / allowUnknown / hideRating / okrSetting / allowManual ...
   └─ usedEntities           # 引用计数（本样本仅 templateItem）
```

**引用图链路**（实测样本）：

```
flow 769...9161「全量测试模板」
 └─ stages[12] ──ref──▶ entities.stage
      例：769...9152「填写工作总结」 type=keywork_and_invitation, stageModel=goal_setting,
          executors=[{type:"reviewee"}]
          ├─ writeTemplates: [ref → template 769...9162「填写工作总结」]
          └─ readTemplates:  [ref → template 769...9169/9170/9171...(工作总结/自评/360°反馈/OKR...)]
template ──▶ templateItems: [ref → templateItem]
      例：template 9162 → [prompt 705152「111」, evaluatedContent 9206「工作总结」, unit 9208「综合评级」]
templateItem ──▶ entries: [ref → entry]
      例：templateItem 9206「工作总结」type=evaluatedContent
          → entry 9215 type=multiple_texts（重点工作，多条文本）
      例：templateItem 9208「综合评级」type=unit → entry 9218「绩效评级」type=indicator
          entry.extra.indicator = 7655170451575966923 ──▶ GET /perf/api/review/v2/stage_indicators
          返回 level 型指标：1星(不合格)~5星(卓越)，含 value(1~10)、color、option_style
```

### 1.3 12 个环节实体（预览页左栏数据源）

| 环节 | type | stageModel | 执行人 |
|---|---|---|---|
| 填写工作总结 | keywork_and_invitation | goal_setting | 被评估人 |
| 自评 | leader_review | review | 被评估人 |
| 360°邀请环节 | invite_review | invitation | 被评估人 |
| 360°反馈（自愿评估） | leader_review | review | 360°评估人 |
| 评估型环节 | leader_review | review | 360°评估人（自定义空组） |
| 虚线上级评估 | leader_review | review | 虚线上级 |
| 直接上级评估 | leader_review | review | 直接上级 |
| 绩效校准 | adjust_review | adjust_review | 校准人 |
| 绩效沟通并开通结果 | leader_review | review | 直接上级 |
| 查看绩效结果 | view_result | view_result | 被评估人 |
| 结果复议处理 | appeal | appeal | 复议处理人 |
| 我的团队 | my_business_team | virtual | HRBP |

stage 级配置（`stageConfigs`）还含：`executors[].type`（reviewee/360_reviewer/leader/dotted_leader/pdt_manager/custom_review/metric_reviewer）、`dataWriteMode:"independent"`、`availableExecutors` 等。

### 1.4 预览页组件架构（DOM 实证）

页面骨架 `data-ui-flow-id` 标识（step4 实测分布）：

```
TemplateHeader                    # 顶栏：← 返回 | 编辑绩效模板 | 面包屑 4 步 | 上一步 | 保存
TemplateBuilderTitle ×4           # 面包屑步骤（基本信息>流程设置>内容设置>模板预览）
TemplatePreviewLayout             # 预览三栏布局（step3 编辑页为 TemplateBuilderLayout）
├─ StagesPanelContent             # 左栏 评估流程（w-160 = 160px，p-10）
│    └─ StageContent ×11          # 11 张环节卡（icon+名称+执行人，选中蓝框）
└─ TemplatePreviewContainer       # 右侧双面板（min-w-440）
     ├─ 面板A flex-1              # 「配置参考内容」（中栏）
     │    └─ TemplatePreviewTitleWrapper + bg-N-200 标签「配置参考内容」
     └─ 面板B flex-1 border-l-N-300 # 「配置填写内容」（右栏）
          └─ TemplatePreviewTitleWrapper + bg-N-200 标签「配置填写内容」
```

**关键行为（网络实证）**：点击左栏切换环节**不发起任何模板数据请求**（仅 okr/features 轮询）——12 个环节的全部预览内容都在 `detail` 一份响应里，切换是纯前端按 `stage → template → templateItem → entry` 引用图重新渲染。

---

## 2. 与「内容设置」(step 3) 的关联

**同一数据源、同一组件树，编辑态 vs 只读态**：

| 维度 | 内容设置 (step3) | 模板预览 (step4) |
|---|---|---|
| 路由 | `/perf/admin/templates/{id}/3` | `/perf/admin/templates/{id}/4` |
| 布局组件 | `TemplateBuilderLayout` | `TemplatePreviewLayout` |
| 左栏 | `StagesPanelContent` + `StageContent×11`（完全相同） | 同左 |
| 右区 | 「配置填写内容」**可编辑表单** + 最右「内容设置」属性面板（未选中时显示"暂未选择内容"） | 「配置参考内容」+「配置填写内容」**只读镜像** |
| 数据 | 同一个 `template_groups/{id}/detail`（step3 加载时同样拉取，见 capture2 时间戳 1793757471xxx 组） | 同左 |

具体关联链（实证）：

1. step3 主区编辑的每个卡片 = 一个 **templateItem**。例：「填写工作总结」环节的编辑卡内含：
   - 蓝色提示条「111 / 222」= templateItem `705152` type=`prompt`（`usage` 控制展示场景）
   - 「工作总结 + 描述 + 重点工作(富文本条目 + 添加)」= templateItem `9206` type=`evaluatedContent` → entry `9215` type=`multiple_texts`
   - 「综合评级 + 绩效评级 1星~5星」= templateItem `9208` type=`unit` → entry `9218` type=`indicator` → `stage_indicators` 接口的 level 指标
2. 底部「+ 添加内容 / + 添加提示」= 向 `template.templateItems` 追加 templateItem 引用。
3. entry 分型（17 个 entry 实测类型）：`text`（做得好的/待改进的/评语）、`multiple_texts`（重点工作）、`indicator`（绩效评级/价值贡献/投入度/价值观，`extra.indicator` 指向指标库）、`tag_text`（标签填写题）。
4. step4 预览把这些 templateItem 用**同一渲染器**以示例数据只读呈现——所以「内容设置里配什么、预览页右栏就长什么样」，二者是 save 后同一 schema 的两种状态。

## 3. 与「前端填写页面」的关联

填写页（员工/评估人在活动发布后访问，`/perf/review` 侧）与预览页**复用同一套 schema 与渲染组件**，关联机制全部来自 detail 响应（以下均有字段实证）：

1. **谁看/谁写什么**：`stage.writeTemplates`（该环节执行人要填的表单 = 右栏内容）与 `stage.readTemplates`（该环节可见的参考内容 = 中栏内容）。
2. **读写权限矩阵**：`behaviors.permission`，每条为 `{flow, stage, template, mode:"read"|"write"}`——填写页据此渲染可编辑项；预览页右栏即 `mode:"write"` 模板的样例渲染，中栏即 `mode:"read"` 模板样例。
3. **参考内容数据**：中栏 OKR 标签页来自 `readTemplates` 中 `type:"okr"` 的模板项（实际数据由填写页调 OKR 接口）；「更多参考」的 绩效信息/异动信息/补充信息 由 `GET /perf/api/review/template/references/settings` 提供配置（表头、viewable 开关均在响应中）。
4. **表单控件**：entry 类型映射填写控件——`text→富文本输入`、`multiple_texts→多条目+添加按钮`、`indicator(level)→评分等级选择（1星~5星，含颜色/分值）`、`tag_text→标签选择`。预览页用示例文案（"重点工作 1: 在上半年负责***…"）占位，填写页换成真实数据。
5. **差异**：预览页是**单角色静态样例**（固定「被评估人」视角示例 + 每个环节切换）；填写页按登录人 `auth`（`GET /perf/api/review/auth`、`v2/auth`）+ `operators` 决定实际可见环节与表单。此差异部分为机制推断（样本模板未发布，无活动填写页 URL 可抓），已尽量以字段证据为限。

## 4. 接口清单（预览页加载顺序，实测）

| # | 接口 | 作用 |
|---|---|---|
| 1 | `GET /perf/api/review/csrf` | CSRF |
| 2 | `GET /perf/api/user/settings` `user/custom_settings(POST)` `user/mark` `user/licenses(POST)` `user/license_status` | 用户/租户上下文 |
| 3 | `GET /perf/api/review/auth` + `v2/auth` + `user/manager/isManager` | 权限 |
| 4 | `GET /perf/api/review/release` + `business_line_release/0` | 模板发布状态 |
| 5 | `GET /perf/api/review/v2/template_groups/{id}` | 模板组元信息（450B） |
| 6 | **`GET /perf/api/review/v2/template_groups/{id}/detail`** | ★ 全量 schema（数据唯一来源） |
| 7 | `GET /perf/api/review/v2/stage_indicators` | 指标库（评级等级/颜色/分值） |
| 8 | `GET /perf/api/review/template/indicators` `coefficients` `custom_text_setting` | 指标/系数/文案 |
| 9 | `GET /perf/api/review/template/references/settings` | 「更多参考」配置 |
| 10 | `GET /perf/api/review/okr/basic/tenant` `okr/custom_setting` `okr/features` | OKR 中栏 |
| 11 | `GET /perf/api/review/questions_select` `custom_review_roles` `user/pdt/get_all_type_roles` | 题库/自定义角色（step3 编辑用） |

## 5. 像素级还原规格（CSS 实测值）

| 令牌 | 值 | 用途 |
|---|---|---|
| 主文字 N-900 | `#1f2329` | 标题/正文 |
| 次要文字 N-600 | `#646a73` | 执行人/描述 |
| 标签底 N-200 | `#eff0f1` | 「配置xx内容」角标 |
| 边框 N-300 | `#dee0e3` | 中右栏分隔线/卡片描边 |
| 主色 | `#3370ff`（飞书蓝） | 选中卡描边/按钮/进度条 |
| 顶栏 | `rgb(60,74,115)` 高 28(=112px@2x) | 全局导航 |
| 字号/行高 | 14/22 正文，16/24 卡题，18/26 页题，20/28 顶栏 | text-14/16/18/20 |
| 左栏宽 | 160px（w-160），内边距 10*4=40px 四向（p-10） | 评估流程 |
| 中栏最小宽 | min-w-440 = 1760px@2x？实际 440px | 参考内容 |
| 卡片 | `ud__card--shadow-md` + `rounded-8` + 白底 | 环节卡/内容卡 |
| 间距体系 | 原子类按 4px 栅格（p-10=40px? 注意该体系 1 单位=4px，p-10=40px、mb-8=32px） | — |
| 评分条 | 进度条 100%/0% 双行 + 权重 50.0% 右对齐，状态「正常」绿色 tag | OKR KR 行 |
| 评级控件 | 圆角胶囊 1星~5星 横排，选项间连线 | 综合评级 |

> ⚠️ 原子类数值以 CSS 文件实际规则为准（例：`.text-14{font-size:14px!important}`、`.leading-22{line-height:22px!important}`），完整 CSS 已落盘可直接比对。

## 6. 证据产物索引

```
rea-extract/
├─ dump.js / interact.js            # 抓取脚本（可重跑，登录态在 profile/）
├─ out/preview1/                    # 第 1 轮：预览页全量
│   ├─ page.html(1.1MB) page.png viewport.png outline.json
│   ├─ network.json(226 条)  scripts.txt  css-index.json
│   ├─ api/ (95 个响应体，关键: 0063 detail / 0064 组信息 / 0084 references / 0030 stage_indicators)
│   └─ css/ (16 个样式表)
└─ out/capture2/                    # 第 2 轮：step3 内容设置 + 11 环节切换
    ├─ step3-content/ step4-preview/ (page.html + page.png)
    ├─ stages/ (11 环节 × html+png)
    └─ network.json(352 条) + 74 个 API 响应体
```
