# B20.a 组织目录页 · 飞书像素级还原规格（2026-11-03）

> 来源：飞书前端代码包（`.tmp_021/feishu-bundle/`：`ud.css`、`index.css`、`people_components.css`）+ 已登录飞书真实 DOM 计算样式（CDP 连接 `127.0.0.1:9333`，`Runtime.evaluate` 采集，视口 1280×639）。
> 实测证据文件：`C:\Users\gaby.liu\Desktop\feishu_detail.json`、`feishu_pixel.json`、`feishu_body.html`。
> 本规格仅描述还原参数，**不含代码改动**；实施时另按 021 流程推进。

---

## 1. 实测总览（视口 1280×639）

| 区块 | 关键值 |
|---|---|
| 页面背景 | `#f5f6f7` |
| 顶栏（应用菜单） | 高 56px、白底、`box-shadow: rgba(31,35,41,.05) 0 2px 16px 0` |
| 内容滚动容器 | `padding: 20px 20px 0`、`overflow: auto` |
| 白色主卡片 | 1005×660、`border-radius: 8px 8px 0 0`、`padding: 20px` |
| 表格 | 可视 965×572，表总宽 1114（横向滚动），表头高 51px，行高 51px |

层级链（自表向上）：`ud__table`(白) ← `ud__loading__container` ← `ud__loading-nested-loading` ← `ud__table-wrapper` ← `pro-table-wrapper`(flex column) ← **白色卡片 `gHB7b5qVDiJc9r8c0HeC`** ← 滚动容器 `q5GjYf9w0ZynxHmu298E`(padding 20px 20px 0) ← `MB6wKYTnqiKl06L__HQs`(padding-top 56px)。

---

## 2. 白色主卡片（核心差异点 2）

实测计算样式（类 `gHB7b5qVDiJc9r8c0HeC`）：

```css
.white-card {
  background: #fff;
  border-radius: 8px 8px 0 0;   /* 顶部圆角 8px，底部直角，视觉上与灰底融合 */
  display: flex;
  flex-direction: column;
  padding: 20px;
}
.white-card > :not(:first-child) { margin-top: 16px; }  /* 卡片内区块间垂直间隔 */
```

- 实测 rect：`x=240, y=144, w=1005, h=660`（滚动容器 padding 20px 之后 + 顶栏 56px 之上）。
- 卡片高度随内容撑开；`h=660` 为当前视口下的渲染高度，实现时用 `min-height` 而非写死。

---

## 3. 顶部菜单 / “人员、组织” tab（核心差异点 1）

飞书为**应用级顶部菜单**（人员 / 组织 / 报表 / 假勤 / 更多），非页面内 tab。实测：

| 属性 | 未选中 | 选中 |
|---|---|---|
| 高度 | 56px | 56px |
| padding | `0 16px` | `0 16px` |
| 字号 | 16px | 16px |
| 字重 | 400 | 500 |
| 颜色 | `#1f2329` | `#3370ff` |

- 选中项加下划线样式（CSS 包：`ud__menu-item-selected` 主色下划线/`#3370ff`）。
- 顶栏整体：白底、高 56、阴影 `rgba(31,35,41,.05) 0 2px 16px 0`。

---

## 4. 搜索工具栏（卡片内第一区块）

实测（x=260 起，两控件同排）：

| 元素 | 实测值 |
|---|---|
| 搜索框 | 310×32，白底，`border: 1px solid #d0d3d4`，`border-radius: 6px`，前缀图标 16px、色 `#646a73`，placeholder“搜索” |
| 右侧按钮 | 32×32（outlined），同款 border/radius，图标 14px |
| 两控件间距 | 12px（`260+310+12=582`，与按钮 x 对齐） |

搜索框内部：`ud__input` 高度 32、输入区 `#646a73` 图标 + 14px 文本。

---

## 5. 数据表（核心差异点 3）

### 5.1 列宽与内容

| 列 | 宽 | 锁定 | 表头示例 | 数据示例 |
|---|---|---|---|---|
| 名称 | 220 | fix-left | 名称 | 深圳市创梦天地科技有限公司（树形） |
| 部门负责人 | 150 | — | 部门负责人 | `--` |
| 部门 HRBP | 150 | — | 部门 HRBP | `--` |
| 人数 | 100 | — | 人数 | 602 |
| 更新人 | 150 | — | 更新人 | sputin.wang王… |
| 更新时间 | 150 | — | 更新时间 | 2024-07-04 … |
| 操作 | 194 | fix-right | 操作 | 编辑 / 添加子部门 / 删除 |

表总宽 1114 > 可视 965 → **表容器横向滚动**。

### 5.2 表头

实测（`ud__table-sticky-holder` + `ud__table-thead`）：

```css
.ud__table-thead { height: 51px; }
.ud__table-thead > tr > th {
  padding: 12px;
  font: 400 14px;            /* 非加粗 */
  color: #646a73;            /* 次级文本色 */
  border-bottom: 1px solid rgba(31,35,41,.15);
  background-color: #f2f3f5; /* 高亮表头变体，整行浅灰 */
  white-space: nowrap;
}
```

- 表头整行背景 `#f2f3f5`（灰），数据行背景 `#fff`。
- 锁定表头格（左/右列）同为 `#f2f3f5`、`z-index: 2`。

### 5.3 数据行

实测（`ud__table-body tr`）：

```css
.ud__table-body > tr { height: 51px; }
.ud__table-body > tr > td {
  padding: 12px;
  font: 400 14px;
  color: #1f2329;                          /* 正文色 */
  border-bottom: 1px solid rgba(31,35,41,.15); /* 行分隔线 */
}
```

- 行分隔线为 1px `rgba(31,35,41,.15)`（CSS 包值与实测 `0.666667px` 同源，1.5 倍 dpr 归一后按 1px）。
- 名称列文本单行省略（实测 `clamp-tooltip-inner` 174×22，ellipsis）。

---

## 6. 双向锁定（核心差异点 3，滚动行为）

实测三组 sticky（均在滚动容器 `q5GjYf9w0ZynxHmu298E` 内）：

| 元素 | position | top/left | z-index | 背景 |
|---|---|---|---|---|
| 表头 `ud__table-sticky-holder` | sticky | `top: -20px`（抵消容器 20px padding，贴顶） | 3 | `#fff` |
| 左列 `ud__table-cell-fix-left(-last)` | sticky | `left: 0` | 2 | 表头 `#f2f3f5` / 数据 `#fff` |
| 右列 `ud__table-cell-fix-right(-first)` | sticky | `right: 0` | 2 | 同上 |

行为验证：
- 表头纵向滚动时**贴住滚动容器顶部不动**（`top:-20px` 使 sticky 生效于容器 padding 边界内）。
- 名称列 + 操作列横向滚动时**始终钉在左右两侧**，其余列随滚动。
- 层级要求：表头 z=3 浮于列 z=2 之上（表头含左右锁定格，保证交叉点正确覆盖）。

实现要义（按 ud 组件语义）：
1. 表容器为横向滚动容器（`overflow-x: auto`）。
2. 表头行套 `position: sticky; top: -20px; z-index: 3`（父滚动容器 padding-top 20px 时）。
3. 首列 / 末列分别 `position: sticky; left:0 / right:0; z-index: 2`，末列加左侧分隔线（CSS 包 `fix-right-first` 阴影/边框线）。

---

## 7. 树形展开策略（核心差异点 5）

实测 DOM（根组织 + 9 个 level-1 部门）：

```
level-0  深圳市创梦天地科技有限公司   [箭头] （根组织，显示）
level-1  ST / 游戏发行事业部 / 游戏研发事业部 / 业务中台 / 技术中台 / 战略发展部 / 后台 / 独立运营公司 / 顾问组  [箭头]  ← 均展开态
（level-1 以下收起，无 level-2+ 渲染）
```

- **默认展开第一级**：根组织（level-0）展开 → level-1 可见；level-1 之下全部收起。
- 展开箭头：18×18 按钮，图标 12×12，色 `#646a73`；展开态箭头朝下（transform `none`），收起态旋转 `-90deg`。
- 缩进占位：`ud__table-row-indent`（indent-level-N），每级缩进 = 展开按钮区宽度（18px）+ 间距；level-0 无前置缩进，实测 `margin-left: 0`。
- 根组织没有父级；空子节点行无箭头，文本前留占位。

---

## 8. 操作列（核心差异点 3）

文本按钮样式（实测 `ud__button--text-primary`）：

```css
.action-text-btn {
  color: #3370ff;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 6px;
  background: transparent;
  border: none;
}
```

- 根组织行：`添加子部门`。
- 子部门行：`编辑 | 添加子部门 | 删除`（三个 text button）。

---

## 9. 设计 token 汇总

| Token | 值 | 用途 |
|---|---|---|
| `--bg-page` | `#f5f6f7` | 页面底 |
| `--bg-card` | `#fff` | 主卡片/表格 |
| `--bg-header` | `#f2f3f5` | 表头 |
| `--border-strong` | `#d0d3d4` | 搜索框/按钮边框 |
| `--border-row` | `rgba(31,35,41,.15)` | 表头/行分隔线 |
| `--text-primary` | `#1f2329` | 正文/名称 |
| `--text-secondary` | `#646a73` | 表头/图标/箭头 |
| `--link-primary` | `#3370ff` | 选中 tab / 操作按钮 |
| `--radius-card` | `8px 8px 0 0` | 主卡片 |
| `--radius-control` | `6px` | 搜索框/按钮 |
| 行高 | 51px 表头、51px 数据行 | 表格 |
| 卡片内间隔 | 16px | `> :not(:first-child)` |

---

## 10. HR Portal 现状差异与改动点映射（仅规格，未实施）

| # | 需求 | 现状 | 目标改动点 |
|---|---|---|---|
| 1 | 人员/组织两个 tab | `PeopleLayout` 侧栏仅“主数据概览 / 组织”；`Organization.vue` 无 tab | 组织页顶部增加“人员 / 组织”切换（建议页面内 tab 或沿用顶栏菜单语义），选中样式 `#3370ff`/500、56px 行高 |
| 2 | 白色大容器 | `.organization { padding: 20px }` 无容器 | 套白色主卡片：白底、圆角 `8px 8px 0 0`、padding 20、flex column、区块间隔 16px |
| 3 | 表头 + 双向锁定 | `OrganizationTree.vue` 纯树列表、无表头无列 | 改为表格形态：7 列（名称/部门负责人/部门HRBP/人数/更新人/更新时间/操作），表头 51px `#f2f3f5` sticky `top:-20px` z=3，名称列 left:0 / 操作列 right:0 sticky z=2，表容器横向滚动 |
| 4 | 去掉刷新按钮，同步后自动刷新 | `PermissionButton 刷新` 手动 load | 移除刷新按钮；组织同步事件后自动刷新数据（依赖现有同步链路） |
| 5 | 根组织 + 默认仅第一级展开 | 后端 `/trees/org/directory` 排除 `RootOrg`；`OrganizationTree` 默认 `expandAll` 全展开 | 后端恢复根组织节点（RootOrg 作为 level-0 返回）；前端默认展开策略改为仅展开第一级（level-0 → level-1 可见），更深层收起 |

**不做事项**：不改动同步/维护来源、不动后端数据口径、不引入平行执行链；飞书操作列“编辑/添加子部门/删除”的写操作能力不并入本页（本页为只读目录，021 B20.a 语义）。

---

## 11. 验收口径

1. 组织页出现“人员 / 组织”两个入口，选中态 `#3370ff`。
2. 白色主卡片：上圆角 8px、下直角、padding 20px，区块间隔 16px，尺寸 ≥ 现状树容器。
3. 表头 7 列可见，表头行滚屏时贴顶不动；名称列、操作列横滚时固定左右。
4. 无手动刷新按钮；组织同步完成后页面数据自动更新。
5. 根组织显示为第一行，默认仅第一级展开；更深层级收起，可手动展开。
