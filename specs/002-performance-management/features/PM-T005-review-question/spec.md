# PM-T005 评估题管理（Review Question）

> 状态：规格已确认；评估规则来源、`rule_id` 关联和最新规则读取语义已确认；像素级验收仍受证据门禁阻塞
> 来源：Perfect-Web-Clone-IDE 采集 `idreamsky.feishu.cn/perf/admin/review-questions/review-indicators`
> 模式：像素级还原前端结构，评估规则选项由正式环境规则接口提供，保存接口按本目录契约设计；本次修复涉及普通评估题评级长代号表格，不修改后端真实保存实现

## 1. 背景与目标

还原飞书绩效「评估题」管理页面的前端结构。页面是数据驱动的多状态界面，核心是列表页 + 新建/编辑页面 + 筛选。本次只做前端结构还原，数据内容由后端/运行时提供。新建评估题的独立页面形态以 `implementation-gap-analysis.md` 中的真实采集证据为准。

## 2. 范围与非范围

- **范围**：评估题列表页、新建/编辑页面（含 6 字段）、筛选面板、预览、评估规则下拉动态数据来源、普通评估题/子评估题的 `rule_id` 关联和新建评估题保存请求契约。
- **非范围**：
  - 评估规则新建/编辑/删除业务实现（本次只消费已经建立的评估规则）；
  - 普通评估题与子评估题的评估规则差异化过滤逻辑（后续单独开发）；
  - 规则版本号、评估题规则配置快照和迁移；
  - 周期业务、权限模型扩展和真实后端实现（本次只冻结接口设计）；
  - mock 数据数量和正式环境数据清理。

## 3. 结构提炼清单（全部来自采集数据，禁止编造）

### 3.1 表格列（6 列，精确像素宽度）

| 列 | 宽度 |
|---|---|
| 名称 | 237.66px |
| 类型 | 237.66px |
| 创建人 | 316.63px |
| 创建时间 | 316.88px |
| 备注 | 237.66px |
| 操作 | 253.53px |

评估题列表的实现方式与评估规则列表保持一致：两者共用 `PerformanceManagementTable` 表格外壳、六列比例、空/加载态和分页；评估题第二列使用现有接口返回的题目 `type`，通过 `questionTypeLabel(type)` 显示「常规评估项 / OKR 评估项 / 加分项 / 减分项」，不使用评估规则的 `method` 或新增接口字段。

### 3.2 新建/编辑页面字段（6 个，按顺序）

> 旧版本曾将此区域描述为 640px 弹窗；真实采集显示“新建评估题”为独立页面，详见 [implementation-gap-analysis.md](implementation-gap-analysis.md)。字段契约保留，页面容器契约以后者为准。

| 字段 | label | placeholder | 限长 | 控件类型 |
|---|---|---|---|---|
| 语言 | 语言 | - | - | radio 组：中文 / 英文 |
| 名称 | 名称 | 请输入名称 | - | `ud__input` 单行输入 |
| 描述 | 描述 | 描述将展示给评估人，以帮助其进行评估 | /1000 | `ud__textarea` 多行 + 字数统计 |
| 类型 | 类型 | - | - | radio 组（solid 横向） |
| 评估规则 | 评估规则 | 请选择 | - | select，选项由评估规则接口提供；`label=name`、`value=rule_id`，选择后按 `rule_id` 读取最新配置 |
| 备注 | 备注 | - | /2000 | `ud__textarea` 多行 + 字数统计 |

### 3.3 类型字段的控件结构（radio 组，采集完整）

```html
<div class="ud__radio-group --mode-solid --direction-horizontal --size-md">
  <label class="ud__radio__wrapper ud__radio__wrapper--checked">   <!-- 选中态 -->
    <span class="ud__radio">
      <input type="radio" role="radio" aria-checked="true">        <!-- 原生 radio（隐藏） -->
      <span class="ud__radio__wallpaper"></span>                    <!-- 单击框外圈 -->
      <span class="ud__radio__checked-ink"></span>                  <!-- 选中填充墨迹 -->
    </span>
    <span>常规评估项
      <svg data-icon="InfoOutlined" viewBox="0 0 24 24">…</svg>    <!-- 每项后的信息图标 -->
    </span>
  </label>
  …
</div>
```

- 选项（4 种，完整）：**常规评估项 / OKR 评估项 / 加分项 / 减分项**；
- 每项后有 `InfoOutlined` 信息图标（完整 SVG path，viewBox 24×24）。

### 3.4 名称与描述字段的控件结构（两个不同组件）

**名称 = `ud__input`（单行输入框）**：
```html
<div class="ud__input --size-md">
  <label class="ud__input-input-wrap">
    <div class="ud__input-input__placeholder">请输入名称</div>  <!-- 飞书自定义 placeholder -->
    <input class="ud__native-input" placeholder="请输入名称">
    <span class="ud__input__suffix"></span>                       <!-- 后缀插槽 -->
  </label>
</div>
```

**描述/备注 = `ud__textarea`（多行 + 字数统计）**：
```html
<div class="ud__textarea --show-count">
  <textarea placeholder="…" style="height:50px"></textarea>
  <span class="ud__textarea-suffix">
    <span class="ud__tag ud__input__count">…</span>              <!-- 字数统计 /1000、/2000 -->
  </span>
</div>
```

### 3.5 按钮

| 按钮 | bbox | 文字色 | 背景色 |
|---|---|---|---|
| 新建 | 80×32 @(280,182) | rgb(255,255,255) | rgb(51,112,255) |
| 筛选 | 80×32 @(1800,182) | rgb(31,35,41) | rgb(255,255,255) |
| 操作·编辑 | 文字按钮 | rgb(36,91,219) | 透明 |
| 操作·删除 | 文字按钮 | rgb(187,191,196) | 透明 |
| 页面底部固定操作栏 | 提交 / 预览 / 取消 | - | - |

### 3.6 页面级最外层框架（采集精确值）

| 层 | 采集值 |
|---|---|
| 顶部 header | 56px 高，背景 `#3c4a73`，白字品牌「飞书绩效设置」+ logo SVG |
| 左侧导航 | 240px 宽，白底，菜单项 41px 高，选中项背景 `#e1eaff` |
| 内容区背景 | 灰底 `#f5f6f7`，白色表格卡片 |
| 内容区标题 | 「评估题」18px / 600 / `rgb(31,35,41)` |
| 内容区 tab | 选中「评估题」16px/600/`rgb(20,86,240)`；未选中 14px/400/`rgba(0,0,0,0.65)`；**底部分隔线 1px `rgba(31,35,41,0.15)`；选中指示线 3px 主色** |
| 工具栏 | 新建（左 x=280，80×32 蓝底白字圆角 6px）+ 搜索（中）+ 筛选（右 x=1800，80×32 白底深字圆角 6px） |

评估题与评估规则列表共用同一个 `PerformanceListToolbar` 搜索/筛选入口；点击筛选不在工具栏下方重复渲染第二个搜索框或筛选按钮。

### 3.7 评分上下限规则的选择后展示

当评估类型为「评分」且评分方式为「在分数上下限内输入评分」时，普通评估题与子评估题必须共同调用独立的 `ScoreRangeSummary`，以子评估题已实现的只读紧凑摘要为唯一实现真源，不渲染评估规则配置表单：

- 评估规则卡内显示字段标签「评分上下限」；
- 分数下限、连接符 `-`、分数上限和小数位规则在同一行展示，例如 `1 - 10，不保留小数`；
- 评估规则卡内不得额外显示「评分配置」标题、独立「评分方式」行或独立「精度」行；
- 普通评估题与子评估题必须渲染同一个 `ScoreRangeSummary` 组件；组件不接收 `entryMode` 或题目类型决定内部结构；
- 子评估题不显示额外的「评估方式」卡；
- 普通评估题保留采集目标中的独立「评估方式」卡，但不得在评估规则卡内重复展示评分方式和精度；
- 固定分值和评分映射等级型继续使用各自的配置展示变体。

该展示由 `entry_mode + review_type + config` 驱动，不由规则名称、类型顺序或选项索引驱动。

### 3.8 固定分值规则的共享选择后展示

当评估类型为「评分」、评分方式为「在固定分值选项内选择评分」时，普通评估题与子评估题必须共同调用独立的 `FixedScoreOptionsSummary`，以子评估题已实现的「分值选项」标签结构为唯一实现真源：

- 共享组件不展示「评分配置」「评分方式」「精度」；
- 普通评估题仍在共享组件之外保留适用的「评估方式」和「展示方式」附加卡；子评估题不展示这些附加卡；
- 分值列表以规则卡内容区约 `758.67px` 为最大宽度，超出当前行后自动换行；
- 每个标签按自身分值文本自适应宽度，最小宽度 `46px`，高度 `21px`，水平 padding `8px`；
- 标签无边框、圆角 `1000px`，背景 `rgb(225,234,255)`，文字 `rgb(12,41,110)`；
- 规则卡高度随标签换行后的实际内容增长，标签不得溢出白色卡片。

目标来源：`20260830_211313_909144:score-fixed`，具体几何与计算样式以 `pixel-contract.md` 及对应 `target_contract.json` 为准。

### 3.9 评级规则开关与附加展示

新建评估题选择 `review_type=评级` 的评估规则后，页面只读取所选规则详情中的评级配置，不在评估题表单内复制或编辑规则配置：

- `grade_participates_in_calculation` / `gradeParticipatesInCalculation` 是「评级可参与计算」的唯一显示依据；
- 关闭时不显示「量化分」列，也不显示「隐藏等级量化分」；
- 开启时显示「量化分」列，并以规则详情中的 `hide_grade_quantified_score` / `hideGradeQuantifiedScore` 初始化「隐藏等级量化分」开关；
- 「隐藏等级量化分」不是评估题字段，不进入评估题保存请求，也不反向写回评估规则；用户可在当前页面切换本地状态，本次作为后续其他业务区域消费的预留状态；
- 评级方式卡的 label 与单选组上下排列；目标单选组宽度约 `434px`、高度 `22px`，选项间距按采集状态保持；
- 展示方式卡的两个选项均为 `368×125px` 上下分区卡片，包含选项说明和对应预览；评级关闭时卡片高度约 `263px`，评级开启时因显示量化分附加项高度约 `325px`。

规则配置读取和附加模块均由 `rule_id` 对应的最新规则详情驱动，不由规则名称、类型顺序或选项索引驱动。

### 3.10 评级附加卡片的采集布局

普通评估题选择评级规则后，评级规则详情和附加卡片必须按 `rating-off` / `rating-on` 变体渲染：

- 「评级可参与计算」来自所选评估规则详情；关闭时不显示「量化分」列和「隐藏等级量化分」，开启时才显示；
- 「隐藏等级量化分」以评估规则详情中的当前配置初始化，允许用户操作本地开关状态；该状态不属于评估题字段，不进入评估题保存请求，不写回评估规则，本次仅为后续其他业务区域消费预留；
- 「评估方式」卡中，字段 label「评级方式」与三个选项上下排列；单选组目标宽度 `434px`、高度 `22px`；
- 「展示方式」卡中，标签样式和下拉样式由唯一共享组件 `ReviewQuestionDisplayMethodCard` 渲染；评级与固定分值评分均复用同一组件树、同一固定 `C/B/A/S` SVG 和同一下拉预览，不得在父组件内按规则类型维护两套预览实现；
- 选择结果以题目级 `display_mode` 持久化；编辑加载规则详情不得把已保存的下拉样式重置为标签样式。该字段沿评估题→模板内容→项目快照→实际填写传递。
- 评级关闭时展示方式卡约 `800×263px`，评级开启时因隐藏量化分配置项约 `800×325px`；
- 选项卡片的预览内容来自采集目标，标签样式固定显示 `C/B/A/S` 示例并与实际等级无关，下拉样式显示等级下拉预览。

### 3.11 普通评估题评级长代号表格

普通评估题选择 `review_type=评级` 的规则后，「配置等级描述」必须同时支持短代号和长代号：

- 表头和所有等级行共享同一组列轨道；等级代号列以 `70px` 为最小宽度，按当前规则中最宽代号增长，最大为 `132px`；代号列增长时，等级名称、量化分（如有）和等级描述列必须整体同步右移；
- 等级代号底框按自身文本宽度增长，最大宽度 `132px`，高度 `22px`，水平 padding `8px`，圆角 `11px`；超过最大宽度后在底框内部以 `...` 省略，不得让文字越过底框或覆盖等级名称；
- 底框背景使用评估规则色板中当前 `levels[].color` 对应的 `trigger` 展示色，不直接使用色板原始值；颜色映射以 `performanceColorOptions.ts` 为唯一前端真源；
- 等级名称为空、`null` 或 `undefined` 时显示两个半角横杠 `--`，不得显示 Unicode 长横线 `—`；
- `rating-off` 和 `rating-on` 共用以上规则；`rating-on` 仅额外插入量化分列，等级描述输入框继续占据剩余宽度。

本约束来源于 2026-08-31 用户提供的普通评估题长代号截图及问题确认。该截图支持结构和实现参数冻结，但没有完整采集 session、rendered contract 和截图 diff，因此像素验收继续保持 `not-run/blocked`。

### 3.12 评分映射等级型选择后展示

普通评估题选择 `review_type=评分映射等级型` 时，评估规则卡必须调用独立的 `ScoreMappingSummary`，不得使用通用键值行拼接：

- 卡片显示「按分数子区间匹配等级」，随后按四列渲染「评分上下限 / 等级代号 / 等级名称 / 等级描述」；
- 每行区间表达式由 `mapping.min`、前一行 `upper`、当前行 `upper`、`mapping.max` 和 `mapping.rule` 派生；目标样例为 `1 ≤ 分数 < 2`，最后一行右边界闭合为 `6 ≤ 分数 ≤ 10`；
- 等级代号使用独立彩色胶囊，等级名称为空时显示 `--`，等级描述使用目标32px输入框；不得把代号和名称合并为 `code - name`；
- 映射表后显示共享 `ScoreRangeSummary`：`minimum - maximum，precision`；
- 不显示独立「区间关系」行，不显示通用 `.score-config-row` 或带白底灰框的 `.mapping-interval-row`；
- 目标 `ReviewRuleCard` 为 `800×466.67px`，映射字段和评分上下限摘要按内容自然收口。

权威状态：`20260830_220116_685650:score-mapping`，几何与 token 见 `pixel-contract.md`。

## 4. 组件拆解清单（高组件开发）

### 4.1 布局层（共用，不重复实现）

| 组件 | 说明 |
|---|---|
| `PerformanceAdminLayout` | header + 侧栏 + 内容区，绩效后台所有页面共用。评估题页与绩效模板页 head 共用，仅内容区标题不同 |

### 4.2 基础组件（跨页面复用，对齐 Element Plus）

| 飞书组件 | 对齐方式 |
|---|---|
| Radio 单选组（`ud__radio-group`） | `el-radio-group` + 样式覆盖（wallpaper 外圈 + checked-ink 选中态） |
| Input 输入框（`ud__input`） | `el-input` + 样式覆盖（placeholder/圆角/高度） |
| Textarea 多行（`ud__textarea`） | `el-input type="textarea"` + `show-word-limit` + `maxlength`（/1000、/2000） |
| 图标（iconfont SVG symbol） | iconfont + `InfoOutlined` 等 |
| 用户卡片（`ee-user-card`） | 新建 `PerformanceUserCard` |
| 表格 / 弹窗 / 下拉 / 分页 | Element Plus（五件套规范） |

### 4.3 业务组件（本模块复用，放 `src/components/performance/`）

| 组件 | 职责 |
|---|---|
| `ReviewQuestionTable` | 表格 + 分页 + 行操作 |
| `ReviewQuestionEditModal` | 历史弹窗实现；后续应由独立新建/编辑页面容器替代，字段仍通过 `v-model` 分发 |
| `ReviewQuestionFilterPanel` | 筛选面板 |

### 4.4 页面层（组装，放 `src/views/`）

| 组件 | 职责 |
|---|---|
| `ReviewQuestionManagement.vue` | 只做组装：持有状态、组合上述组件 |

## 5. 评估规则动态来源与关系

正式环境采集确认评估规则下拉实际包含 6 项：

| 页面展示名称 | 规则类型 | 页面稳定标识 | 本次用途 |
|---|---|---:|---|
| 测试评级--评级可参与计算开关关闭 | 评级 | 7679656987218430963 | 普通题、子题 |
| 测试评级--评级可参与计算开关打开 | 评级 | 7679657243473612055 | 普通题、子题 |
| 测试评分--在分数上线限内输入评分 | 评分 | 7679657422717193452 | 普通题、子题 |
| 测试评分--在固定分值选项内选择评分 | 评分 | 7679657498671860954 | 普通题、子题 |
| 测试--评分映射等级型 | 评分映射等级型 | 7679657700988308727 | 普通题专项 |
| 评分映射等级型 | 评分映射等级型 | 7678536081905617856 | 本次非目标，保留为额外选项 |

以上名称与数字标识是采集夹具，只用于证据追踪和重放；生产实现不得硬编码名称或用名称判断模块。开发接口正式字段统一设计为 `rule_id`，模块由 `entry_mode + review_type + config` 驱动。页面不得使用规则名称、类型顺序或 option index 作为关联键。

普通评估题和子评估题本次均消费同一通用评估规则列表，不设计差异化过滤参数。规则过滤逻辑作为后续独立任务，不得在本任务中由前端自行筛选。

## 6. 规则更新与读取

评估题只保存 `rule_id`，不保存规则版本号，不保存规则配置快照。规则变更后重新打开或读取评估题时，按同一 `rule_id` 获取最新规则名称、类型和配置，并重新渲染评估规则模块。

若规则不可用或无法读取，页面显示明确不可用状态，不自动切换规则、不回退静态选项、不静默清空 `rule_id`。完整接口契约见 [api-contract.md](api-contract.md)。

## 7. 评估题保存请求

新建评估题保存请求必须提交 `rule_id`，同时明确普通题/子题关系：

- 普通评估题：`is_sub_question=false`、`parent_question_id=null`；
- 子评估题：`is_sub_question=true`；当前从评估题库“新建子评估题”入口创建时 `parent_question_id=null`，未来从父题上下文进入时可传父题 ID；
- `rule_id` 必填，后端校验规则存在、可用且可读取；
- 不提交评估规则名称作为关联字段。

本次只冻结请求/响应设计，不执行真实保存请求，不以现有 mock 行为替代接口验收。

## 8. 采集与像素开发边界

本次正式环境采集覆盖新建子评估题的 3 个规则变体（评级、评分上线限、评分固定分值）和新建评估题的 4 个规则变体（评级、评分上线限、评分固定分值、评分映射等级型）。每个目标规则均保留真实菜单入口、下拉首屏、滚动后下拉、选择后模块、截图、HTML、layout、computed、target contract 和 interaction evidence。当前采集状态和外部证据路径见 [capture-manifest.md](capture-manifest.md)。

像素实现必须将评估规则选择卡和选择后动态配置模块作为有证据的组件变体；不得把所有规则压平为一个静态 select，也不得用旧的 `REVIEW_RULE_OPTIONS` 替代接口选项。

## 9. 采集缺口与门禁

| 缺口 | 影响 |
|---|---|
| 新接口真实保存请求尚未执行 | API payload 验收为 not-run；本文件设计契约先行 |
| 规则列表/详情 GET 请求未被本轮写请求采集器观察 | 页面关系已由列表 row-key 与下拉 data-cy 交叉确认，接口字段映射仍需实现测试确认 |
| 普通题/子题差异化过滤未开发 | 本次两入口使用通用列表，不阻塞当前像素开发文档 |
| 规则不保存版本或快照 | 规则更新后读取最新配置，需补充重开读取测试 |
| textarea 垂直 resize 的 after-drag 高度证据不足 | `pixel_restore_status` 保持 `blocked` |
| 真实 disabled 状态和 `ErrorFilled` SVG 仍未观察 | 继续保持 `blocked`，禁止猜测 |

## 10. 假设与待决

- 已确认：五条目标评估规则已在正式环境建立；评估规则下拉由规则数据提供；正式关联字段设计为 `rule_id`。
- 已确认：普通题/子题过滤逻辑后续单独开发，本次不增加过滤参数。
- 已确认：规则更新后评估题读取最新规则，不保存版本号或配置快照。
- 待实现验证：后端实际路由、DTO 命名、数据库实体字段和错误码需按 [api-contract.md](api-contract.md) 落地并测试。
- 待实现验证：普通评估题和子评估题的 `is_sub_question`、`parent_question_id` 请求关系需在接口测试中确认。
- 待实现验证：规则不可用时的 404/409 错误码和页面恢复状态需补充验收证据。

## 11. 子评估题评级档位只读溢出变体（2026-08-31）

适用范围严格限定为 `entry_mode=sub_question + review_type=评级`，同时覆盖新建与编辑子评估题。普通评估题继续使用「配置等级描述」结构，不得被本变体替换。

目标结构为 `RatingTierField -> viewport -> clip_layer -> scroll_layer -> track -> pill/connector -> overflow_mask/right_arrow`。该结构复用评估规则评级预览的胶囊、连接线、遮罩和 `RightOutlined` 视觉基础，但属于只读变体：不翻页、不横向滚动、不发送导航事件，溢出右箭头仅表示后续仍有内容。

机器参数真源为 [rating-tier-overflow-capture-contract.json](rating-tier-overflow-capture-contract.json)，补充状态 `20260831-manual:sub-question-rating-overflow` 的关键约束如下：

- 规则卡宽 `800px`，内容区宽 `758.667px`，卡片高度按内容自然收口；
- 字段高 `68px`，label 高 `22px`，label 与 viewport 间距 `8px`；
- viewport 为父内容宽 `758.667px × 38px`，负责横向裁切；
- track 高 `32px`、不换行，10 个档位时内容宽 `2442px`、溢出量 `1683px`；
- 档位宽度按文本自然增长，最小 `42px`、高 `32px`、padding `6px 12px`、白底灰边、圆角 `9999px`；
- 连接线数量等于档位数减一，宽度范围 `12–88px`，溢出态收缩为 `12px`；
- 溢出时显示灰色 `RightOutlined`，不得显示左箭头，整个变体不可操作且不得改变 track 位置；
- 裁切必须发生在内部 viewport，禁止通过裁切整个 `ReviewRuleCard` 影响普通评估题内容。

本补采为用户在目标环境执行的只读 computed-style/geometry 提取，足以冻结组件实现参数；它不包含完整浏览器 session 证据包和实现后截图 diff，因此功能级实现可以进行，但 `pixel_restore_status` 继续保持 `blocked`，直到 rendered contract 与截图 diff 完成。

## 12. 类型变更后的规则重置

在新建评估题和新建子评估题页面中，用户修改基本信息的「类型」选项后，当前已选择的评估规则关系必须立即失效：清空 `rule_id`，移除当前规则详情及所有依赖规则详情渲染的动态内容，并将评估规则选择器恢复为未选择状态。用户必须重新选择评估规则，页面才可按新的 `rule_id` 加载最新规则配置。

该行为同时适用于 create 页面；编辑页面在加载已有题目时的初始数据回填不得被误判为用户切换。类型切换期间，旧规则详情的异步响应不得重新写回页面。该行为不改变新建评估题与新建子评估题重新选规则后的既有变体契约。

## 13. 2026-08-31 新建评估题评级动态模块增量契约

本节只补充本次专项采集的普通评估题评级动态分支，不改写前述已完成规则变体。

固定条件：

```text
entry_mode = regular_question
type = 常规评估项
review_type = 评级
grade_participates_in_calculation = true
rule = 测试评级--评级可参与计算开关打开
```

新增确定性分支：

```text
评级方式 = 直接评级
  -> 显示评级方式和展示方式
  -> 不显示计算规则和子评估题列表

评级方式 = 通过子评估项评级
  -> 显示计算规则、子评估题列表、展示方式和填写/查看顺序
  -> 计算规则 = 不设置规则 / 按条件计算

评级方式 = 作为总分项计算评级
  -> 显示评级方式和评级开启相关展示
  -> 不显示计算规则和子评估题列表
```

`ReviewQuestionRatingMethodSection`、`ReviewQuestionCalculationRuleSection` 和 `ReviewQuestionSubQuestionList` 的 source state、可见/禁止元素和 artifacts 以 `extracted-ui-contract.json#/variant_contracts` 为机器真源。展示方式及填写/查看顺序的专项点击后状态尚未采集，不在本节新增猜测性契约。

### 13.1 评估项填写和查看顺序默认结构

`rating_method=sub_items` 的默认状态已从 `idreamsky.feishu.cn_20260831_194405_608420:rating-method-sub-items` 提取出确定结构：

- 区域总标题为「评估项的填写和查看顺序」，`14px/600/22px`；
- 左右子标题为「填写顺序」「查看顺序」，均为 `14px/400/22px`，不得加粗；
- 子标题底部到卡片顶部保持 `8px`；
- 左右两列各宽约 `371px`，列间距 `16px`；每列两张卡片均为 `180×134px`，卡片间距 `8px`；
- 卡片标题栏为 `180×40px`；预览区内使用固定 `138×56px` SVG；
- 「总项」主灰条为 `138×20px`、圆角 `4px`、填充 `#F5F6F7`，文字使用采集 SVG path，必须完整落在主灰条内；
- 两条次级灰条为 `100×12px`、圆角 `3px`、填充 `#F5F6F7`；
- 本节只冻结默认选中态的结构和几何，不声明尚未采集的 hover、active 或四种组合点击后差异。
- 用户确认的顺序卡片视觉覆盖旧采集 DOM：未选中 seam=`#DEE0E3`，选中 seam=`#F0F4FF` 并与标题区背景融合；选中态只保留蓝色 outer border，不显示独立横线。该调整不得改变卡片、SVG、标题、字重和顺序交互。

### 13.2 评级方式卡收口与计算规则列表变体

评级方式卡在三个已采集状态中均以 terminal visible child 收口，目标为：

```text
direct: card.bottom - rating-method-form-item.bottom = 21px
sub_items + none: card.bottom - add-sub-question.bottom = 21px
sub_items + condition: card.bottom - condition-list.bottom = 21px
```

实现必须由当前动态分支的 terminal child 持有底部 `20px` 目标间距，不得叠加字段 margin 和父卡片 padding 形成不稳定空白。

子评估题列表按 `calculation_rule` 使用两个显式结构：

```text
calculation_rule=none
  -> PerformanceSortableList
  -> PerformanceDragHandle + 子评估题名称 + 评估规则 + 评分上下限 + 删除
  -> 新建子评估题按钮

calculation_rule=condition
  -> 子评估题名称 + 评估规则
  -> 无拖拽手柄、无评分上下限、无删除、无新建按钮
```

`none` 状态必须复用项目全局拖拽公共组件，实现手柄启动、整行拖动、pointer/keyboard reorder、placeholder 和稳定 item key；不得使用文字或近似图标模拟手柄。

卡片使用 `padding-bottom:0` 且由 terminal child 的 `margin-bottom` 收口时，卡片根必须建立独立 block formatting context（例如 `display:flow-root`），防止末尾 margin 折叠到卡片外部。验收以白色卡片内部可见 `21px±1px` 空白为准，不能只检查 CSS 中存在 `margin-bottom:20px`。

### 13.3 评分评估方式公共组件变体

评级方式当前结构保持不变：仅「作为总分项计算评级」显示 InfoOutlined，其余两个评级选项不显示提示图标。

评分相关规则统一使用评分方式公共组件：

```text
score-range
  -> 模块标题「评估方式」
  -> 字段 label「评分方式」
  -> 直接评分 / 按子评估项评分 / 作为总分项计算评分
  -> 3个选项均显示公共 InfoOutlined

score-fixed
  -> 模块标题「评估方式」
  -> 字段 label「评分方式」
  -> 仅直接评分
  -> 显示1个公共 InfoOutlined

score-mapping
  -> 模块标题「评估方式」
  -> 字段 label「评分方式」
  -> 直接评分 / 按子评估项评分 / 作为总分项计算评分
  -> 3个选项均显示公共 InfoOutlined
```

三个评分变体的卡片均为 `800×134px`，terminal bottom gap 为 `21px±1px`。评分选项必须复用 `PerformanceRadioGroup`，继承统一 checked/focus/InfoOutlined 和 `cursor:pointer` 手型；不得继续在父组件内维护私有 radio DOM。评级方式组件及其现有提示图标规则不在本次修改范围。

展示方式的「标签样式」「下拉样式」卡片必须与填写顺序卡片使用一致的 `cursor:pointer` 手型，但不得修改或重构现有填写顺序组件。展示方式选中态只允许卡片单一外框变为 `#3370FF`；上部 choice panel 与下部 preview panel 不得各自绘制蓝色边框。未选中接缝为 `#DEE0E3`，选中接缝改为与 choice 背景一致的 `#F0F4FF`，视觉上不再形成独立横线，禁止出现蓝色粗线。

下拉样式预览的箭头必须使用公共 `DownBoldOutlinedIcon`，目标尺寸 `12×12px`、`viewBox=0 0 24 24`、颜色 `#646A73`、右侧 inset `12px`，在 `336×32px` 预览框内垂直居中。禁止使用字体字符 `⌄` 或 `DownOutlined` 替代。公共组件新增可配置 size 时默认值保持10px，不能影响既有调用。

### 13.4 子评估题候选数据联动

子评估题名称是唯一可选字段；评估规则和评分上下限均由所选候选派生，只读展示。未选择时两列统一显示灰底 `--`。

候选策略读取子评估题关联规则的 `review_type` 和规则配置中的 `grade_participates_in_calculation`：

- `calculation_rule=none`：允许评分，或评级且参与计算开启；
- `calculation_rule=condition`：只允许评级且参与计算开启；
- 评分映射等级型、停用规则和普通评估题均排除。

固定分值评分的上下限按固定分值 option 的有效数值 min/max 派生。下拉 option 第一行显示子评估题名称，第二行显示关联规则的评估类型；selected trigger 只显示题目名称。计算规则切换后，已不在新候选集合中的 question_id 必须自动清空。


本节只记录已完成的四个计算规则状态，不包含提交校验和新建子评估题弹窗。固定条件为：普通「新建评估题」、类型「常规评估项」、规则 `rule_id=7680421437210954714`（「评估规则--拼分（在分数上下限内输入评分）」）、规则类型「评分」、评分方式「按子评估项评分」。

### 14.1 计算规则与展示区域绑定

页面实际观察到四个计算规则：

```text
不设置计算规则
加权求和
直接求和
求平均分
```

四个状态分别绑定同一页面下的：

```text
计算规则选中态
-> 子评估题区域
-> 展示方式区域
-> 评估项的填写和查看顺序
```

展示方式区域使用既有组件结构。不能因为四个状态的展示内容大部分相同，就只保留一个状态证据；实现应使用 `calculation_rule` 作为加载上下文，并复用同一展示组件。

### 14.2 已观察差异

- 「不设置计算规则」：子评估题列为子评估题、评估规则、评分上下限；没有观察到权重列。
- 「加权求和」：子评估题列表增加「权重」列；展示方式区域保持既有结构。
- 「直接求和」：没有观察到权重列；展示方式区域保持既有结构。
- 「求平均分」：没有观察到权重列；展示方式区域保持既有结构。

四个状态的证据目录和 source state 映射见 [capture-manifest.md](capture-manifest.md) 的 2026-09-01 专项章节；机器契约见 `extracted-ui-contract.json` 的四个 `regular-score-range-sub-items-calc-*` 变体。

### 14.3 状态边界

已完成的四个选择后状态可以作为局部变体实现输入，但不能升级为全功能完成。提交后的「该字段是必填字段」红色错误已在 2026-09-02 补采形成独立 validation after 证据；「新建子评估题」弹窗仍未采集；展示方式和顺序卡片点击后的新状态也不属于本次证据。当前 `completion_status=incomplete`、`pixel_restore_status=blocked`。

## 15. 2026-09-02 空子评估题提交校验补采

本次补采在同一评分上下限按子评估项评分上下文中，仅执行一次用户授权的「提交」，未执行创建、确认、保存、删除或发布。固定条件为：普通「新建评估题」、类型「常规评估项」、规则 `rule_id=7680421437210954714`（「评估规则--拼分（在分数上下限内输入评分）」）、规则类型「评分」、评分方式「按子评估项评分」、计算规则「不设置计算规则」。

### 15.1 已确认校验状态

- 提交后仍停留在当前新建评估题页面，未发生页面跳转或评估题创建；
- 「子评估题」字段下方显示红色错误文案「该字段是必填字段」；
- 该错误文案属于提交后的独立 validation after 状态，不回写正常态卡片高度或动态展示方式契约；
- 「展示方式」及「评估项的填写和查看顺序」既有结构仍保留，校验只在子评估题区域增加错误反馈；
- 本状态未观察到独立 `ErrorFilled` SVG，不能据此补造错误图标契约。

机器状态、校验前后完整 artifacts 和截图见 [capture-manifest.md](capture-manifest.md) 的 2026-09-02 补采章节，以及 `extracted-ui-contract.json` 的 `regular-score-range-sub-items-submit-validation` 变体。

### 15.2 证据边界

提交校验已从 `not_observed` 更新为 `captured`，但「新建子评估题」弹窗仍未采集；展示方式和顺序卡片的点击后新状态仍不属于本次证据。HTML 中部分中文文本存在采集编码异常，校验文案的视觉真源为 after 截图；rendered contract 与截图 diff 尚未运行，`completion_status=incomplete`、`pixel_restore_status=blocked` 保持不变。

## 16. 2026-09-02 真实子评估题选择后补采

在普通评估题、常规评估项、目标评分规则、按子评估项评分且计算规则为「不设置计算规则」的上下文中，实际从子评估题候选面板选择了一个已存在的子评估题：`子评估题--评分（在分数上下限内输入评分）`。该选择使用真实用户 click 事件完成，未创建新的子评估题。

选择后父页面显示：

- 子评估题名称为「子评估题--评分（在分数上下限内输入评分）」；
- 评估规则列派生显示「评估规则--拼分（在分数上下限内输入评分）」并按列宽截断；
- 评分上下限派生显示 `1 - 10`；
- 行右侧显示删除图标；
- 选择面板中的候选保留选中勾选态，关闭面板后选择结果仍保留；
- 展示方式及填写/查看顺序继续使用既有共享组件。

候选稳定标识为 `data-cy=data-id=7680531263614094288`。该状态机器契约为 `regular-score-range-sub-items-selected-existing` 及其稳定 after 变体；完整证据见 `capture-manifest.md` 的 2026-09-02 选择后章节。

该补采只确认前端选择后的派生展示，不确认删除、保存或创建行为；创建子评估题弹窗的字段提交仍不执行。
