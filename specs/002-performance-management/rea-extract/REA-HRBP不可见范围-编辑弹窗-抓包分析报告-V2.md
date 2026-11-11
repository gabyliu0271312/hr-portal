# REA 抓包分析报告 V2 · HRBP 不可见范围「设置范围」弹窗 · 组件还原与现状差异评估

> 任务：通过 REA 抓取 DOM 包做像素级还原分析。本轮仅**抓包、分析、评估现状差异，不改代码**。
> 目标：① 组件还原 + 设计 token 还原（不硬编码）；② 像素级一致；③ 接口与权限真实接入；④ 人员/部门选择后端底框。
> 页面：`https://idreamsky.feishu.cn/perf/admin/selection`
> 路径：绩效管理后台 → 其他权限设置 → 特定范围（HRBP 不可见）→ 编辑弹窗「设置范围」
> 抓包时间：2026-11-05（上午 01~14 轮 + 本轮 15/16 两轮补充验证），真实登录态，视口 1680×950，DPR 1
> 证据目录：`rea-extract/out/hrbp-invisible/15-combo/`、`16-tag/`（本轮新增），历史证据 `01~14/`

---

## 1. 本轮抓包执行情况

| 轮次 | 脚本 | 捕获内容 |
|---|---|---|
| 15-combo | `capture-hrbp-invisible-15-combo.js` | 弹窗全量 DOM（60 节点）、员工搜索 gaby 面板（449×114）、字段级联（162×242）、部门树打开、全量接口 77 条 |
| 16-tag | `capture-hrbp-invisible-16-tag.js` | 已选员工后值选择器内部 DOM（含 overflow 计数 tag 样式）、`/user/query`+`/user/gets` 请求/响应 |

登录态沿用 `profile-hrbp-06`（真实账号 gaby.liu 刘琦，tenantId 6732051441411884552）。

---

## 2. 页面与弹窗定位（像素级实测）

### 2.1 入口
```
绩效管理后台（/perf/admin/selection）
└─ 左侧导航「权限管理」→「其他权限设置」（选中态）
   └─ 内容区卡片「特定范围」（HRBP 不可见）→「编辑」（80×32）
      └─ 打开「设置范围」弹窗
```

### 2.2 弹窗容器规格（实测 rect）
| 元素 | 几何 | 说明 |
|---|---|---|
| 遮罩 `ud__dialog__mask` | 全屏 | 半透明黑 |
| 内容 `ud__dialog__content ud__modal ud__dialog__content-md` | **840 宽** × 886 高（y32 起） | 白底 |
| `ud__modal__content` | 840×338（单条件态） | 三段式：header 96 / body 162 / footer 56 |
| 标题 `ud__modal__title` | 444,330 760×48 | `ud-typography-title-4` 16/24/600 `#1F2329`，文本「设置范围」 |
| 副标题 | 444,354 760×24 | `text-14 font-normal text-N-600` 14/22/400 `#646A73`：「设置后，将向 HRBP 隐藏实时满足该范围的人的绩效详情。」 |
| 关闭按钮 `ud__modal__close` | 1212,328 28×28.8 | icon 20×20 |
| 主体 `ud__modal__body` | 420,402 840×162 | 内含条件编辑器 792 宽 |
| 页脚 `ud__modal__footer` | 420,588 840×56 | 按钮右对齐 |

### 2.3 页脚按钮（实测）
| 按钮 | 几何 | 样式 |
|---|---|---|
| 确定 | 1156,588 **80×32** | `ud__button--filled` 蓝底白字 |
| 取消 | 1064,588 **80×32** | `ud__button--outlined` 白底描边 |

> 两按钮 gap 12，右对齐（btn 区 444,588 792×44）。

---

## 3. 条件组编辑器（EmployeeScopeEditor 核心组件）

### 3.1 结构树（DOM class 命名空间实测）
```
people-material-rule-condition w-full                        (792 宽)
└─ people-material-rule-condition-condition-group
   ├─ condition-group__list
   │  └─ condition-group__group
   │     ├─ condition-group__condition-wrap
   │     │  ├─ condition-group__group-title「条件组 1」(464,422 734×22, 14px #1F2329)
   │     │  └─ condition-list (464,452 734×62)
   │     │     ├─ logic-group__logic (「且」rail 27 宽)
   │     │     └─ logic-group__content
   │     │        └─ condition-list__row (464,452 734×32)
   │     │           ├─ condition-item 字段选择器 128×32
   │     │           ├─ condition-item 操作符 88×32
   │     │           └─ condition-item 值选择器 476×32 (ud__select employee-select-internal)
   │     │              ├─ 内容区 420×28 (overflow + tag)
   │     │              ├─ 清除按钮 selector__clear 12×28
   │     │              └─ 箭头 selector__arrow 12×28
   │     │           └─ 删除按钮 (1174,456 24×24, hover 显)
   │     └─ 添加条件 (464,492 82×22, ud__button--text 蓝 #1456F0)
   ├─ condition-group__separator (组间「或」22 高)
   └─ 添加人员范围 (444,542 110×22, ud__button--text 蓝 #1456F0)
```

### 3.2 条件行三列（本次实测精确值）
| 列 | 几何 | 选择器 class |
|---|---|---|
| 字段 | 464,452 **128×32** | `ud__select w-full`（级联 cascader） |
| 操作符 | 600,452 **88×32** | `ud__select w-full`（只读） |
| 值 | 696,452 **476×32** | `ud__select employee-select-internal custom-emp-select` |

### 3.3 字段级联下拉（本次实测 162×242）
| 元素 | 几何 | 说明 |
|---|---|---|
| 面板 `ud__cascader__dropdown` | 491,468 162×242 | 白底 shadow |
| 选项 label | 503,476 118×22/项（30 高行） | 「直 属 上 级」「员 工」「部 门」 |
| checker | 629 宽 12×18.8（选中项） | 尾部勾选 |

> 与 `scene=hrbp_blacklist` 元数据一致：**directLeader / employee / department** 三字段。

### 3.4 逻辑
| 场景 | 实测 |
|---|---|
| 组内多条件 | 逻辑词「且」（rail 27 宽），行高 32 |
| 多组 | 组间 `condition-group__separator` 22 高「或」 |
| 添加条件 | 组内新增一行 |
| 添加人员范围 | 新增「条件组 N」 |

---

## 4. 值选择器：员工搜索（真实底框）

### 4.1 展开机制（实测关键结论）
**点击空值选择器不会立即展开结果**，必须先点击搜索 input 输入关键词 → 触发 `POST /perf/api/user/query` → 响应回来才渲染列表。还原必须复刻「输入 → 请求 → 列表」流程（本地过滤无法对齐）。

### 4.2 搜索面板规格（本次实测 449×114）
| 元素 | 几何 | 说明 |
|---|---|---|
| 面板 `ud__select__dropdown` | 723,508 **449×114**（随结果高度） | 白底 shadow |
| 列表 `ud__select__list` | 449×114 | — |
| 菜单 `ud__select__list__menu` | 724,509 447×112 | — |
| 结果项 `ud__select__list__item` | 727 起 **441×52/项** | 头像 32×32 + 姓名/部门 |
| 项内容 | 735,516 405×44 | padding 内 12 |
| 头像 `ud__avatar ud__avatar-circ` | **32×32** 圆 | `ud__avatar__image`（avatar72 图源） |
| 姓名行 `name` | 775,516 349×22 | 14px `#1F2329` |
| 部门行 `department` | 775,538 349×22 | 12px `#8F959E` |
| 高亮 `ud__select__list__item__content-highlight` | 30.4×19 | **`#1456F0` 14px**（`<Highlight>gaby</Highlight>`） |
| 勾选列 `ud__select__list__item__check` | 1148,516 12×44 | 尾部 |

> 本次实测 gaby 关键词返回 2 项：`gaby.liu刘琦`（薪酬绩效组）、`测试gaby123`（人力资源行政部）。虚拟滚动容器 `rc-virtual-list`。

### 4.3 已选呈现（本次实测修正项）
选中员工后值选择器内部为 **overflow 模式**：
| 元素 | 几何 | 样式 |
|---|---|---|
| 容器 `ud__overflow` | 727,474 393×28 | — |
| 已选项 `ud__overflow__item` | 130.1×28 | 含头像+姓名 tag |
| 计数 tag `ud__tag ud__select__selector__tag ud__tag-md ud__tag-rect ud__tag-neutral-option` | 29.1×24 | **灰底 `rgba(31,35,41,.1)`、字 `#1F2329`、radius 999999px**（`+0` 溢出计数） |
| 清除按钮 `selector__clear` | 1128,474 12×28 | 12×28 |
| 箭头 `selector__arrow` | 1148,474 12×28 | `#646A73` |

> **⚠️ 与上午报告 §4.3 的差异**：上午报告写「已选 tag `#F0F4FF` 底 `#3370FF` 字」——实测这是**页面卡片预览区**的样式（`permission-range-preview__person`，浅蓝底），**不是弹窗内选择器的 tag**。弹窗选择器内已选/计数 tag 均为 **灰底 `rgba(31,35,41,.1)` + 深字**。还原时两个场景要分开：页面预览用蓝底，弹窗选择器用灰底。

### 4.4 搜索底框接口（实测）
| 接口 | 方法 | 请求体 | 响应要点 |
|---|---|---|---|
| `/perf/api/user/query` | POST | `{"keyword":"gaby","excludeDismissed":false}` | `[{userId,email,i18nName{zh-CN含<Highlight>},avatar,avatar72/240/640,status,dimissionStatus,department[{id,zh-CN}],employeeTypeId,i18nEmployeeTypeName,directLeaderId,i18nLeaderName}]` |
| `/perf/api/user/gets` | POST | `{"userIds":["6947882013990946312"]}` | 按 userId 批量查用户（已选值回显用），同 query 结构 |

---

## 5. 值选择器：部门树（真实底框）

### 5.1 面板规格（上午 13 轮实测 476×230）
| 元素 | 几何 | 说明 |
|---|---|---|
| 面板 `ud__select__dropdown department-tree-select-dropdown-common` | 696,488 **476×230** | 白底 shadow |
| 树 `ud__tree` | 697,489 474×228 | — |
| 节点 `ud__tree__node` | 700 起 **468×30/项** | 行高 30 |
| 展开按钮 `ud__expandButton` | **16×16**（图标 10×10.4） | — |
| 缩进 `ud__tree__node__indent` | **16/级** | 一级 16、二级 32、三级 48 |
| 标签 `ud__tree__node__label` | 414~382.8 宽 ×22 高 | 14px |
| checker `ud__tree__node__checker` | 10.6~11 宽 ×18.8 | 勾选 |

### 5.2 部门树底框接口（实测）
| 接口 | 方法 | 说明 | 响应结构 |
|---|---|---|---|
| `/perf/api/review/realtime/department/tree` | GET | 全量组织树（**142KB**，虚拟滚动） | `[{id,i18nName{zh-CN,en-US},parentId,disable,deleted,children[]}]`（平铺+children 混合，前端拼树） |

---

## 6. 接口契约与权限（真实接入依据）

### 6.1 读取
| 接口 | 方法 | 用途 | 实测响应 |
|---|---|---|---|
| `/perf/api/user/hrbp/blacklist?tenantId={tid}` | GET | 读当前不可见范围 | `{code:0,data:{scopes:[[{index:0,key:"employee",condition:"eq",value:["6947882013990946312"],fe_extra:"",include_empty:null}]]}}`（**二维数组=多个条件组**） |
| `/perf/api/user/scopes/resolve-scope/meta?scene=hrbp_blacklist` | GET | 弹窗可用字段+操作符 | `[{key:"directLeader",operators:["eq","neq"]},{key:"employee",...},{key:"department",...}]` |
| `/perf/api/user/scopes/resolve-scope/meta?scene=all` | GET | 全量字段元数据（21 类） | 含 department/employee/superior/level/joinDate/employeeType 等 |
| `/perf/api/user/settings` | GET | 当前登录用户+租户 | user(id/avatar/email/department/name)、tenant(id=6732051441411884552)、admin:true |

### 6.2 权限（实测）
- 全部接口返回 `{code:0,success:true}`；未登录 401、无权 403（飞书统一网关）。
- `/perf/api/review/v2/auth` 返回当前角色：当前账号含「绩效管理员」角色（authCodes 含 manage_privilege 等）+ HRBP + 项目管理员。
- 页面/弹窗入口无独立权限码，复用「其他权限设置」导航权限。

### 6.3 写操作（本轮未触发，保持只读）
- 未在真实环境改动配置。保存接口形态**待联调确认**（推测 PUT/POST `/perf/api/user/hrbp/blacklist`，body 为 scopes 二维数组）。后续如需写接口，需你明确授权后再抓。

---

## 7. 设计 Token 提炼（还原用，禁止硬编码）

### 7.1 色板
| Token | 值 | 用途 |
|---|---|---|
| 主文本 | `#1F2329` | 标题/条件名/按钮文字 |
| 次文本 | `#646A73` | 副标题/说明 |
| 弱文本 | `#8F959E` | 部门行/表头 |
| 主操作蓝 | `#1456F0` | 添加/确定/高亮 |
| 选中蓝 | `#3370FF` | 选中项/链接/预览 tag 字 |
| 预览 tag 底 | `#F0F4FF` | 页面卡片预览 tag（浅蓝） |
| 选择器 tag 底 | `rgba(31,35,41,.1)` | 弹窗内已选/计数 tag（灰） |
| 选择器边框 | `#D0D3D4` | select 边框 1px |
| 遮罩 | `rgba(0,0,0,.4)` | 弹窗遮罩 |

### 7.2 字号/字重
| Token | 值 | 用途 |
|---|---|---|
| 弹窗标题 | 16/24/600 | ud-typography-title-4 |
| 正文/条件名 | 14/22/400 | body-0 |
| 姓名行 | 14/22/400 | 搜索结果项 |
| 部门行 | 12/22 | 搜索结果项 |
| 高亮 | 14px `#1456F0` | 关键词 |
| tag 内容 | 12/18 | 已选 tag |

### 7.3 几何
| Token | 值 | 用途 |
|---|---|---|
| 弹窗宽 | 840 | content-md |
| header/body/footer | 96 / 162 / 56 | 三段式 |
| 选择器高 | 32 | select md |
| 字段/操作符/值 | 128 / 88 / 476 | 条件行三列 |
| 按钮 | 80×32 | 确定/取消 |
| 关闭按钮 | 28×28.8 | icon md |
| 级联面板 | 162×242 | 字段下拉 |
| 级联选项行 | 30 高 | 字段选项 |
| 搜索面板 | 449 宽（=值列宽-27） | 员工搜索结果 |
| 搜索项 | 441×52 | 头像32+姓名/部门 |
| 部门树面板 | 476×230 | 值选择器 |
| 树节点 | 468×30 | 行高30 |
| 展开按钮 | 16×16（图标10） | 树 |
| 缩进 | 16/级 | 树 |
| 计数 tag | 29.1×24 | overflow +N |
| 清除/箭头 | 12×28 | 值选择器 |

### 7.4 需要新增/修正的 token 清单（对照现有 tokens.css）
| 场景 | 现值 | REA 实测 | 处置 |
|---|---|---|---|
| 弹窗选择器 tag（灰底） | `--performance-select-tag-background: rgba(31,35,41,.1)` | 一致 ✅ | 复用（REA 弹窗内即灰底） |
| 弹窗选择器 tag 字 | `--performance-select-tag-text: #1F2329` | 一致 ✅ | 复用 |
| 页面预览 tag（蓝底） | 无独立 token | `#F0F4FF` / `#3370FF` | **新增** `--performance-preview-tag-background/text`（区分预览与弹窗两个场景） |
| 边框 | `--color-line-control: #d0d3d4` | `#D0D3D4` | 已一致 ✅ |
| 圆角 | `--performance-control-radius: 6px` | select radius 4 | 需核对（选择器 4，按钮 6） |
| 搜索项高 | `--performance-scope-search-item-height: 52px` | 52 | 已一致 ✅ |
| 头像 | `--performance-scope-search-avatar-size: 32px` | 32 | 已一致 ✅ |
| 高亮 | `--performance-scope-highlight-color: #1456f0` | `#1456F0` | 已一致 ✅ |

---

## 8. 与现状（hr-portal）差异评估

> 对比基准：`hr-portal/frontend/src/components/performance/` + `styles/tokens.css`（已核实存在 `PerformanceHrbpScopeDialog.vue`、`PerformanceAudienceRuleEditor.vue`、`performanceConditionFields.ts` 等）。

### 8.1 总体判断
现状已按上午 V1 报告落地了「设置范围」弹窗（840 宽壳 + 条件组编辑器 scope-mode + 字段裁剪）。**结构与 REA 已对齐**；本轮新增证据发现的差异主要在**员工搜索的真实性**与**tag 双场景配色**两处。

### 8.2 逐项差异表
| 维度 | REA 实测 | hr-portal 现状 | 差异级别 | 处置建议 |
|---|---|---|---|---|
| 弹窗宽/三段式 | 840 / 96/162/56 | DialogShell 840 + header 96 token | ✅ 一致 | 无需改 |
| 条件行三列 | 128/88/476 | `is-scope` grid 128/88/1fr | ✅ 一致 | 无需改 |
| 组标题「条件组 N」 | 22 高 14px | `groupTitlePattern="条件组 {index}"` | ✅ 一致 | 无需改 |
| 组间「或」 | 22 高 | `--performance-scope-or-height: 22px` | ✅ 一致 | 无需改 |
| 删除按钮 hover 显隐 | hover 才显示 | 现状恒显示（`v-if length>1`） | ⚠️ 小差异 | 改为 hover 显隐 |
| 字段列表 | directLeader/employee/department | `HRBP_BLACKLIST_FIELDS` 同序 | ✅ 一致 | 无需改 |
| 操作符 | 包含(eq)/不包含(neq) | include/exclude | ✅ 一致 | 无需改 |
| **员工搜索真实性** | 输入→`POST /user/query`→列表 | `PerformancePersonSelect` 薄封装 `PerformanceSearchSelect`，**options 本地过滤，无搜索接口** | 🔴 **高** | 接真实搜索接口（见 §9） |
| **搜索结果项** | 头像32+姓名+部门+高亮 | 扁平文本选项 | 🔴 **高** | 需新增头像/部门/高亮渲染 |
| **弹窗内已选 tag** | 灰底 `rgba(31,35,41,.1)`+`#1F2329`+计数 | 现状 `is-scope :deep(.performance-select-shell__tag){background:#f0f4ff;color:#3370ff}` **蓝底** | 🔴 **高** | 改为灰底（与 REA 弹窗一致） |
| 页面预览 tag | 蓝底 `#F0F4FF`/`#3370FF` | `permission-range-preview__person` 蓝底 | ✅ 一致 | 预览区保留蓝底 |
| 部门树 | 476×230、节点30、缩进16、展开16 | `PerformanceOrganizationTreeSelect` 30/16/16 | ✅ 一致 | 无需改 |
| 值选择器展开 | 需先输入关键词 | openOnFocus 即展开 | ⚠️ 中 | 对齐「输入→请求→列表」 |
| 数据回显 | `/user/gets` 按 id 回显 | 本地 options | 🔴 高（联动搜索） | 接 gets 回显 |
| 保存语义 | scopes 二维数组 | 现状展开为 `employeeNos` 扁平集合 | ⚠️ 中 | 结构需对齐二维数组（组/条件语义） |

### 8.3 接口接入差异（自研后端映射）
| REA 语义 | 现状自研 API | 差异 | 建议 |
|---|---|---|---|
| 读 blacklist | `GET /performance/permission-settings/other` | 模型不同（现状单条件 vs REA 条件组） | 扩展为 scopes 二维数组模型 |
| 搜索员工 | 无 | **缺失** | 新增搜索端点（关键词→用户列表，含头像/部门） |
| 回显用户 | 无 | **缺失** | 新增按 id 批量查询 |
| 部门树 | 复用 organization_tree | 结构近似 | 复用 |
| meta 字段 | 无 | 现状前端硬编码字段表 | 建议后端下发（scene 裁剪） |
| 保存 | PATCH other（扁平） | 需二维数组 | 对齐 scopes 结构 |

### 8.4 权限
- REA 侧：无独立权限码，复用「其他权限设置」导航权限（401/403 网关）。
- 现状侧：`performance.configuration.manage` + `PerformancePermissionButton op="U"`，与 REA 语义一致，无需新增权限。

---

## 9. 还原实施建议（后续开发时执行，本轮不动代码）

| 步骤 | 内容 | 依据 |
|---|---|---|
| S1 | tokens.css：新增预览 tag 蓝底 token（与弹窗灰底 tag 分离）；核对 select radius 4 | §7.4 |
| S2 | `PerformanceAudienceRuleEditor.vue`：scope-mode 下已选 tag 改灰底（移除蓝底 override） | §8.2 |
| S3 | 删除按钮 hover 显隐（scope-mode） | §8.2 |
| S4 | 新增真实员工搜索：`PerformanceEmployeeSearchSelect`（输入→请求→列表，头像/部门/高亮渲染），替换 `PerformancePersonSelect` | §4.2/§8.2 |
| S5 | 新增按 id 回显（`/user/gets` 语义） | §4.4 |
| S6 | 自研后端：员工搜索端点 + scopes 二维数组存取 | §8.3 |
| S7 | 用本次抓包截图/JSON 做像素回归基线 | §2~§5 |

---

## 10. 证据索引

| 证据 | 路径 |
|---|---|
| 弹窗全量 DOM | `out/hrbp-invisible/15-combo/dialog.json` |
| 弹窗截图 | `out/hrbp-invisible/15-combo/01-dialog-open.png` |
| 员工搜索面板 | `out/hrbp-invisible/15-combo/employee-search-panel.json`、`03-employee-search-gaby.png`、`04-employee-selected.png` |
| 已选 tag DOM | `out/hrbp-invisible/16-tag/tag.json`、`2-tag-selected.png` |
| 字段级联 | `out/hrbp-invisible/15-combo/dept-tree-panel.json`（实为字段级联）、`05-field-dept.png` |
| 部门树面板 | `out/hrbp-invisible/13-dept-save2/dept-panel.json` |
| 接口全量 | `out/hrbp-invisible/15-combo/api.json`（77 条） |
| 搜索/回显接口 | `out/hrbp-invisible/16-tag/api.json` |
| 现状代码基准 | `hr-portal/frontend/src/components/performance/` + `styles/tokens.css` |

---

## 11. 结论

1. **组件还原**：REA「设置范围」弹窗 = 840 壳 + 条件组编辑器（128/88/476 三列、组标题、且/或、添加按钮）+ 三类选择器。现状 hr-portal 结构已对齐，主要缺口是**员工搜索的真实接口接入与结果项渲染**。
2. **设计 token**：本次修正一处重要误判——**弹窗内已选/计数 tag 是灰底 `rgba(31,35,41,.1)`，蓝底 `#F0F4FF/#3370FF` 只用于页面卡片预览**，两者需分开 token。
3. **接口/权限**：读取/搜索/回显/部门树接口已全部抓到真实契约；权限沿用「其他权限设置」无独立码；保存写接口未触发（保持只读，如需写需授权）。
4. **人员/部门底框**：员工= `POST /user/query`（搜索）+ `POST /user/gets`（回显）；部门= `GET /review/realtime/department/tree`（全量树 142KB，虚拟滚动）。
5. 本轮**未改任何代码**，产出为分析报告 + 证据 JSON/截图。
