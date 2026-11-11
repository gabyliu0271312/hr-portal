# REA 抓包分析报告 · HRBP不可见范围 · 编辑弹窗

> 路径：绩效管理后台 → 其他权限设置 → 特定范围（HRBP不可见）→ 编辑
> 页面 URL：`https://idreamsky.feishu.cn/perf/admin/selection`
> 抓取日期：2026-11-05，真实登录态（Playwright + 持久化 profile），视口 1680×950，DPR 1
> 证据目录：`rea-extract/out/hrbp-invisible/`（01~14 共 13 轮抓包）
> 本轮目标：**组件还原 + 设计 token 还原 + 接口/权限真实接入**的参数来源，不做代码改动

---

## 1. 页面定位与整体结构

### 1.1 入口路径（实测）

```
绩效管理后台（/perf/admin/selection）
└─ 左侧导航「权限管理」
   └─ 其他权限设置（选中态）        ← 侧栏项 232×41，文字 50,399 起
      └─ 内容区顶部卡片「特定范围」   ← HRBP 不可见范围配置
         └─ 「编辑」按钮（80×32）    ← 点击打开「设置范围」弹窗
```

### 1.2 页面骨架（1680×950 实测）

| 区域 | 几何 / 样式 |
|---|---|
| 顶部导航 | 高 56，含「飞书绩效设置」返回链 + 用户区 |
| 左侧导航 | 宽 232；「其他权限设置」`StyledSideItem--active` |
| 内容区 | x280.7 起，右侧「编辑」按钮 x1559.3（80×32，`ud__button--outlined`） |
| 页面标题 | 无独立大标题（以左侧导航高亮代替） |

### 1.3 内容区卡片（文本地图实测）

| 卡片区块 | 标题 | 描述 | 当前配置 | 编辑按钮 |
|---|---|---|---|---|
| 授权校准设置 | 通用规则：不可查看对应部门负责人的绩效详情 | 打开后，将向 HRBP 隐藏对应部门负责人的绩效详情，但下级部门负责人的绩效详情依然对 HRBP 可见 | — | — |
| **特定范围** | 特定范围 | 设置后，将向 HRBP 隐藏实时满足该范围的人的绩效详情 | 员工 包含 jenna.zhang张娜 | ✅ 编辑 |
| 可催办的环节类型 | 可催办的环节类型 | — | — | ✅ 编辑 |

> 注：本次抓包聚焦「特定范围」编辑弹窗；「授权校准设置」的开关描述已在文本地图记录，后续如需还原可复用。

---

## 2. 「设置范围」弹窗（ud__dialog）

### 2.1 弹窗容器规格（实测）

| 元素 | 几何 | 样式 |
|---|---|---|
| 遮罩 `ud__dialog__mask` | 0,0 1680×950 | 半透明黑 |
| 内容 `ud__dialog__content ud__modal ud__dialog__content-md` | x420 y32 **840 宽** | 白底，居中（y 依内容高度变化） |
| 内部 `ud__modal__content` | 420,306 840×338（单条件态） | padding 左右 24，标题区 96 |
| 标题区 `ud__modal__header` | 高 96 | — |
| 标题 `ud__modal__title` | 444,330 760×48 | `ud-typography-title-4` 16/24 600 `#1F2329` |
| 副标题 | 444,354 760×24 | 14/22 400 `#646A73`：「设置后，将向 HRBP 隐藏实时满足该范围的人的绩效详情。」 |
| 关闭按钮 `ud__modal__close` | 1212,328 28×28.8 | icon md，20×20 图标，hover 变背景 |
| 主体 `ud__modal__body` | 420,402 840×162（单条件） | 内 padding 0 24 |
| 页脚 `ud__modal__footer` | 高 56 | 按钮右对齐 |
| 页脚按钮区 | 444,588 792×44 | gap 12，右对齐 |

### 2.2 弹窗标题与文案（像素级还原文案）

- 主标题：**设置范围**
- 副标题：**设置后，将向 HRBP 隐藏实时满足该范围的人的绩效详情。**

---

## 3. 条件组编辑器（EmployeeScopeEditor，核心组件）

### 3.1 整体结构（DOM class 命名空间）

```
EmployeeScopeEditor w-full                        (792 宽)
└─ people-material-rule-condition
   └─ people-material-rule-condition-condition-group   (条件组容器)
      ├─ condition-group__list                         (组列表，可多个)
      │  └─ condition-group__group                     (单个条件组)
      │     ├─ condition-group__condition-wrap
      │     │  ├─ condition-group__group-title         (「条件组 1」22 高)
      │     │  └─ condition-list                       (条件行列表)
      │     │     ├─ logic-group__logic                (逻辑词「且」)
      │     │     └─ logic-group__content
      │     │        └─ condition-list__row            (单条条件行)
      │     │           ├─ condition-item               (字段选择器 128 宽)
      │     │           ├─ condition-item               (操作符 88 宽)
      │     │           └─ condition-item               (值选择器 476 宽)
      │     │              └─ 删除按钮 (condition-delete-btn, 24×24)
      │     └─ 添加条件 (condition-list__add-btn)
      ├─ condition-group__separator                    (组间「或」分隔 22 高)
      └─ 添加人员范围 (condition-group__add-btn)
```

### 3.2 几何参数（单条件态实测）

| 元素 | 几何 | 关键样式 |
|---|---|---|
| 条件组容器 | 444,402 792×162 | — |
| 组标题「条件组 1」 | 464,422 734×22 | 14/22 400 `#1F2329` |
| 条件行（list__row） | 464,452 734×32 | — |
| 字段选择器（condition-item） | 464,452 **128×32** | `ud__select` 满宽 |
| 操作符选择器 | 600,452 **88×32** | `ud__select` 满宽 |
| 值选择器 | 696,452 **476×32** | 多选 + 清空 + 箭头 |
| 删除按钮 | 1212,402 24×24（组顶右） | icon sm 16×16，**hover 才显示** |
| 添加条件 | 464,492 82×22 | `ud__button--text-primary` 14px `#1456F0` |
| 添加人员范围 | 444,542 110×22 | 同上 |

### 3.3 条件组逻辑

| 场景 | 实测行为 |
|---|---|
| 组内多条条件 | 逻辑词「且」（`logic-group__logic` 27 宽），行间无分隔线，行距 32+ |
| 多个条件组 | 组间 `condition-group__separator` 22 高居中「或」 |
| 添加条件 | 组内新增一行，默认「直属上级 包含 [搜索成员]」 |
| 添加人员范围 | 新增条件组 2（默认单行「直属上级 包含 [搜索成员]」） |

---

## 4. 三类选择器（ud__select 家族）

### 4.1 字段选择器（级联 cascader）

| 元素 | 几何 / 样式 |
|---|---|
| 触发器 | 128×32，边框 `#d0d3d4` 1px，radius 4，左侧文本 14/28，右侧箭头 12×28 |
| 下拉 `ud__cascader__dropdown` | 464,488 **162×242**，shadow，白底 |
| 选项 `ud__cascader__menu__option` | 468 起 **154×30/项**，文本 14/22，左侧留白 8 |
| 选中项 | `ud__cascader__menu__option-selected` + checker 12×18.8（尾部） |
| 可用字段（scene=hrbp_blacklist） | **直属上级(directLeader) / 员工(employee) / 部门(department)** |

### 4.2 操作符选择器（ud__select）

| 元素 | 几何 / 样式 |
|---|---|
| 触发器 | 88×32，只读（`selector-readOnly`） |
| 可用操作符 | **eq（包含）/ neq（不包含）**（与 meta 接口 `operators` 一致） |

### 4.3 值选择器：员工（多选）

| 元素 | 几何 / 样式 |
|---|---|
| 容器 | 476×32，多选模式（`selector-multiple`），边框 `#d0d3d4` |
| 已选 tag | `ud__tag` 24 高，`#f0f4ff` 底 `#3370ff` 字 12px，含头像+姓名 |
| 清空按钮 | 12×28（`selector__clear`） |
| 箭头 | 12×28 |
| 搜索面板 `ud__select__dropdown` | 723,508 **449×114**（随结果高度） |
| 列表项 `ud__select__list__item` | 727 起 **441×52/项**，padding 内 12 |
| 项内结构 | 头像 `ud__avatar` 32×32 圆 + 姓名行 22 高（14px `#1F2329`）+ 部门行 22 高（12px `#8F959E`）+ 选中勾 12×44 |
| 关键词高亮 | `<Highlight>gaby</Highlight>` → 蓝 `#1456F0` 14px |
| 虚拟滚动 | `rc-virtual-list`，holder 高度按条目数 |

### 4.4 值选择器：部门（树形）

| 元素 | 几何 / 样式 |
|---|---|
| 容器 | 476×32，同员工选择器外壳 |
| 树面板 `ud__treeSelect__overlay` | 696,488 **476×230**，白底 shadow |
| 树节点 `ud__tree__node` | 700 起 **468×30/项**，行距 2 |
| 节点结构 | 展开按钮 `ud__expandButton` 16×16（10px 图标）+ 缩进 `ud__tree__node__indent` 16/级 + 标签 22 高 + checker |
| 一级/二级/三级 | 缩进 16 / 32 / 48px 起 |
| 勾选 | 树节点选中 `ud__tree__node__checker` |

---

## 5. 接口契约（真实接入依据）

### 5.1 读取接口

| 接口 | 方法 | 用途 | 响应结构 |
|---|---|---|---|
| `/perf/api/user/hrbp/blacklist?tenantId={tenantId}` | GET | 读取当前 HRBP 不可见范围 | `{code, data:{scopes:[[{index,key,condition,value[],fe_extra,include_empty}]]}}` |
| `/perf/api/user/scopes/resolve-scope/meta?scene=hrbp_blacklist` | GET | 弹窗可用字段+操作符 | `[{key:"directLeader"/"employee"/"department", operators:["eq","neq"]}]` |
| `/perf/api/user/scopes/resolve-scope/meta?scene=all` | GET | 全量字段元数据（21 类） | 含 department/employee/level/joinDate 等 |
| `/perf/api/review/realtime/department/tree` | GET | 部门树（值选择器数据源） | `[{id,i18nName{zh-CN,en-US},parentId,disable,deleted,children[]}]` |
| `/perf/api/user/gets` | POST | 按 userIds 查用户 | body `{"userIds":["6947882013990946312"]}` |

### 5.2 搜索接口

| 接口 | 方法 | 用途 | 请求体 |
|---|---|---|---|
| `/perf/api/user/query` | POST | 员工搜索 | `{"keyword":"gaby","excludeDismissed":false}` |
| 响应 | — | 用户列表 | `[{userId,email,i18nName{zh-CN含<Highlight>},avatar,avatar72/240/640,status,dimissionStatus,department[{id,zh-CN}],employeeTypeId,i18nEmployeeTypeName,directLeaderId,i18nLeaderName}]` |

### 5.3 权限（实测响应）

- 所有接口返回 `{code:0, success:true}`，未登录 401、无权 403（沿飞书统一网关）
- 页面/弹窗入口无独立权限码，复用「其他权限设置」导航的既有权限
- 保存写操作本轮**未触发**（未在真实环境改动配置），保存接口形态待开发联调时确认（推测为 PUT/POST `/perf/api/user/hrbp/blacklist`，body 为 scopes 数组）

---

## 6. 设计 Token 提炼（还原时使用，禁止硬编码）

### 6.1 色板

| Token | 值 | 用途 |
|---|---|---|
| 主文本 | `#1F2329` | 标题/条件名/按钮文字 |
| 次文本 | `#646A73` | 副标题/说明 |
| 弱文本 | `#8F959E` | 部门行/表头 |
| 已选 tag 底 | `#F0F4FF` | 已选 tag |
| 主操作 | `#1456F0` | 确定/添加/高亮 |
| 选中态 | `#3370FF` | 选中项/链接 |
| 选择器边框 | `#D0D3D4` | 选择器边框 |
| 遮罩 | `rgba(0,0,0,.4)` 起 | 弹窗遮罩 |

### 6.2 字号/字重

| Token | 值 | 用途 |
|---|---|---|
| 弹窗标题 | 16/24/600 | ud-typography-title-4 |
| 正文/条件名 | 14/22/400 | ud-typography-body-0 |
| 已选 tag | 12/18 | ud__tag 内容 |
| 部门行 | 12/22 | — |
| 操作符/字段 | 14/28（垂直居中） | select 内容 |

### 6.3 几何

| Token | 值 | 用途 |
|---|---|---|
| 弹窗宽 | 840 | ud__dialog__content-md |
| 选择器高 | 32 | ud__select md |
| 字段宽 | 128 | condition-item |
| 操作符宽 | 88 | condition-item |
| 值宽 | 476 | condition-item（自适应剩余） |
| 圆角 | 4/6/8 | select / button / card |
| 按钮 | 80×32 | 确定/取消 |
| 关闭按钮 | 28×28.8 | icon md |
| 树节点高 | 30 | ud__tree__node |
| 列表项高 | 52 | ud__select__list__item |
| 搜索面板宽 | 449 | = 值选择器宽 - 27 |

---

## 7. 还原注意事项（本轮实测结论）

1. **员工选择器展开依赖搜索输入**：点击空值选择器不会立即展开面板，必须先在 search input 输入关键词，触发 `POST /user/query` 后才渲染结果列表。还原交互时需复刻该「输入 → 请求 → 列表」流程。
2. **字段/操作符/值三列宽度固定**：128 / 88 / 476（条件行内），值列用 `flex:1` 自适应剩余，但基准是 476。
3. **级联下拉只有 3 项**：`scene=hrbp_blacklist` 限制为 directLeader/employee/department，与 meta 接口一致；不要按 `scene=all` 的 21 类字段渲染。
4. **删除按钮 hover 可见**：条件组顶部右侧删除按钮（24×24）默认隐藏，hover 条件组时出现；还原时用 CSS 控制显隐。
5. **「或」分隔符**：条件组之间为 22 高「或」，条件组内条件之间为「且」（27 宽逻辑列），勿混用。
6. **部门树数据**：`/department/tree` 返回全量组织树（142KB），前端虚拟滚动渲染；节点行高 30，缩进每级 16px。
7. **弹窗高度自适应**：`ud__dialog__content` y 依内容动态（单条件 338 高内容 → 886 高整窗含居中偏移）；内容增长时弹窗整体上移居中，不是固定高度。
8. **头像**：搜索结果项头像 32×32 圆角 50%，`ud__avatar__image` 加载 avatar72 尺寸。
