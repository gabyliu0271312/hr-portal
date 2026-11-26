# CR-016 周期成员高级筛选

- 日期：2026-11-26。
- 状态：实施中，未验收。用户在逐项 REA 采集后明确要求“直接整理后完成开发”；本记录整理已有交互和安全实施边界，不把未实现字段或未运行验收写成完成。
- 关联：CR-007-F17 原成员筛选预留；PM-001 快照、具名管理角色与字段可见规则。

## 范围与来源

入口：绩效前端 → 项目管理 → 周期概览 → 成员列表 → 筛选。只接周期成员，项目/评估/校准/自定义 provider 不扩展本次合同。
复用 _cycle_member_rows / _authorized_member_rows / _project_member_rows 的授权与最新项目成员快照，不新建查询权限链。无迁移、无业务写入、无通知、无外部数据请求；飞书采集数据不导入本地业务库。

REA 已确认：锚定筛选浮层、所有/任意、增删条件、清除、取消、确定；人员搜索后出候选，姓名及部门副标题；部门含子与所属部门精确；序列分别含子/精确；职级和评级支持多选全选；日期区间；当前雇佣状态等于/不等于，其余已采条件包含/不包含；环节及评级来自配置而非固定名称。
参考字段清单：直属上级、上级、HRBP、部门、所属部门、职级、序列含子、序列精确、管理者、人员、人员组、入职日期、当前雇佣状态、人员类型、当前周期结果、历史结果、校准结果变更、所属项目、环节状态。
该清单不是本地已有数据能力的证明。无安全来源的字段不通过静态菜单暴露，必须记录缺口。实时身份仅用于身份展示，不能覆盖人员/组织历史快照；“当前雇佣状态”如缺独立实时安全查询则不开放。

## 冻结跨层合同

- GET /api/v1/performance/project-management/cycles/{cycle_id}/members/filter-options，query 可选 key / keyword。
- 返回 {fields:[{key,label,kind,operators:[{value,label}],options:[{value,label,subLabel?,color?,children?}]}]}。
- kind 为 person / organization / select / date；人员无搜索词时不返回候选，搜索候选限定授权数据。字段和选项由后端提供；前端不拼19项静态列表。
- 原 members / members/export 新增可选 filters JSON 字符串：{logic:"and"|"or",conditions:[{key,op:"in"|"not_in"|"eq"|"ne",values:string[]}]}。
- 无条件与旧请求一致；最多30条件、每条100值；未知字段/操作符/无权字段/非法日期或值统一422 INVALID_MEMBER_FILTER。日期区间两项 YYYY-MM-DD，包含端点，空值不命中正向与反向条件，避免推断隐藏值。
- 筛选只缩小原权限结果；行字段不可见不参与该条件，无论正反向；AND/OR均不得反推隐藏字段。
- 必须先授权、再过滤、再计数排序分页；列表和导出使用相同条件，但导出仍额外校验原导出权限。
- 评级 key 沿本地 rating:* 配置，值为本地真实option ID。环节 key 为 stage:*，名称来自项目流程快照，禁止使用参考站ID及硬编码节点列表。
- UI只提交有值的条件；半填日期明确阻止应用；取消不应用草稿；重开复制已应用值；应用/清空后回第一页并清理勾选。
- 不持久化保存条件（参考入口本轮初始禁用）；换周期/角色/身份清除筛选，未完成旧请求不可回填。

## UI 交互基准 v1

沿现有页面与已逐项确认的飞书浮层交互，不改页面信息架构。PerformancePopover 作壳，PerformanceSearchSelect / OrganizationTreeSelect / DateTimeField 作值控件；UiButton 作操作。新增条件行独立组件。
界面布局：顶部“符合以下 [所有/任意] 条件”；中部多行“字段 / 操作符 / 值 / 删除”；底部添加条件、清除已选内容、取消、确定。加载/失败可重试/无可用字段/禁止状态有可见反馈；禁用状态不得显示假成功。
DOM+computedStyle原始本地证据：临时 rea-rating-network-1795689749280.json。评级候选14字号/22行高/400字重，标签与说明并列、全选7；浮层实测280 CSS px，但坐标采样存在浏览器缩放，不能据整页截图换算硬编码。UI尺寸优先已有同语义token，缺失按业务token命名增补。
独立实现PNG预期：ui-blueprints/CR-016-T02-cycle-member-filters.png；未生成前不宣称真实UI或像素一致验收。

## 原子任务

- [ ] CR-016-T01 安全候选与服务端过滤。
  - 前置：上述DTO、已有权限与快照边界；必读002基线/PM-001/执行契约。
  - 允许：backend/app/performance/projects_router.py、member_filters_service.py、schemas.py（仅必要内部字段），backend/tests/test_performance_member_filters.py及必要既有测试。
  - 输出：候选API，列表/导出filters；安全动态选项与ID；支持字段/缺口明确。
  - Given授权项目/成员及字段；When include/exclude AND/OR 查询；Then分页计数导出一致且隐藏字段不泄露，非法422、无权403/404沿原路径。
  - 测试：pytest定向纯规则/真实HTTP/授权范围；无迁移upgrade/downgrade不适用。禁止改历史数据和生产。
- [ ] CR-016-T02 筛选浮层与真实接入。
  - 前置：T01合同；本次采集交互与用户“直接完成开发”指令。UI基准为本记录v1，尚无独立新HTML蓝图确认，不把参考截图冒充本地实现。
  - 允许：frontend/src/api/performance.ts，components/performance/ProjectMemberListPanel.vue、PerformanceMemberFilter*.vue及必要测试；styles/tokens.css仅精确新增本卡token，保留已有变更。
  - 输出：动态条件/搜索/树/日期/评级、多选全选、应用/取消/清除、错误/空/加载态，列表导出filters；具名角色范围不变。
  - Given已应用条件；When草稿取消/重开/确定/切身份；Then取消不查询、重开原值、确定回第一页、导出同条件、旧响应无效。
  - 测试：Vitest组件/API/ProjectManagement回归，build，UI规则扫描；真实Vue页面验证与独立PNG。012 N00读取/复用/状态检查，仓库菜单/UCP检查不适用。
- [ ] CR-016-T03 联合验收与证据。
  - 主线程检查diff、测试、构建、真实UI、未实现字段；本地合成API/真实API/数据库/生产分别记录。只在证据闭环后勾选。

## 停止及回滚

仅撤销本卡精确增量，保留所有用户已有未提交文件；不执行git reset、不改权限配置、数据库、任务答案或审计。无自动commit/push/deploy。

## 实施与验收证据

### 已实现范围（2026-11-26）

- 后端：projects_router.py 与 member_filters_service.py 接通周期候选、列表与导出；有筛选时对完整授权结果过滤后计数分页，无筛选保留原SQL分页；内部真实评级/上级ID不进入公共DTO。
- 实际支持：人员、直属上级、所属部门精确、部门全路径含子、职族/职类/序列精确、职级/上期职级、入职日期闭区间、人员类型、所属项目，以及按已有配置产生的rating:*、stage:*。
- 明确缺口：祖先上级、HRBP、管理者、人员组、历史周期评级、校准变更、序列含子尚无完整安全数据链，本轮不暴露。当前雇佣状态的live_employment_status存在live or frozen回退，不能权威区分实时与历史，本轮也不暴露；不把缺失能力记作完成。
- 字段options公开in/not_in，服务端保留eq/ne单值兼容；日期in/not_in必须两项起止日期，闭区间含端点；空值及不可见字段均不命中正反向条件。UI字段/候选来自filter-options响应，没有静态19项假功能。
- 前端：PerformanceMemberFilter / PerformanceMemberFilterValue 复用Popover/SearchSelect/OrganizationSelect/DateTimeField/RatingTag/Checkbox/UiButton；周期成员面板持有已应用条件，应用回第一页、清勾选、列表及导出同参，换身份/周期清空。UI扫描所改三Vue 0违规。已有表面板存量样式本轮同值token化，测试的源码断言相应改为token引用。
- 独立真实组件验收：本地Vite5178、隔离页面挂载真实Vue组件和受控候选API，选项ID应用事件{logic:and,conditions:[{key:rating:demo,op:in,values:[a]}]}已观察；DOM浮层宽708 CSS px。实现PNG `ui-blueprints/CR-016-T02-cycle-member-filters.png` 已生成并读取。这是局部组件合成数据证据，不是整页真实登录、真实API或像素完全一致证明；整页路由实际访问重定向到登录，未绕过登录验收。
- 自动化：最终Vitest筛选7项+项目管理81项共 **88 passed**（22.92s，exit0），覆盖列表与导出条件一致。完整构建 **vue-tsc+Vite通过**（3887模块，53.48s，exit0），仅既有VueUse PURE提示。首轮build曾缺OrganizationNode.level，已修复；同值token化后原两条硬编码源码断言失败，按token语义修正后最终整组重跑通过。
- 后端主线程独立复跑：`PYTHONPATH=hr-portal/backend DB_HOST=127.0.0.1 DB_PORT=1 hr-portal/backend/.venv/Scripts/python.exe -m pytest hr-portal/backend/tests/test_performance_member_filters.py hr-portal/backend/tests/test_performance_management_scope.py hr-portal/backend/tests/test_performance_projects.py -q --tb=short` → **1295 passed / 5 skipped / 1 warning（44.91s，exit0）**。新增筛选文件47项；警告为既有python_multipart弃用，跳过不计通过。非人员候选取消100截断，人员搜索保留100上限。本地替身/SQLite/HTTP测试不替代真实PostgreSQL和生产验收。
- 未验收：真实JWT登录→真实后端→PostgreSQL、生产部署、大周期性能、19字段完整功能、全浮层像素差、UI完整蓝图版本独立确认。无迁移/通知/业务数据改写/commit/push/deploy。

任务保持未勾选；本地有限字段闭环不等于原需求全部字段交付。
