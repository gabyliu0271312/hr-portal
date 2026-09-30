# Ardot 画布写入执行计划（新会话接手用）

> 背景：用户要求把绩效管理已完成的前端设计 token 与组件**反向整理进 Ardot**。
> MCP 已配置并完成 OAuth 授权（本对话无法热加载，新会话首次 ToolSearch 即可见工具）。
> 所有素材已基于真实代码生成并校验过，**不要重新解析代码，直接使用清单**。

## 1. 资源位置

| 文件 | 说明 |
|---|---|
| `specs/002-performance-management/ardot-import/design-tokens.json` | 219 个 token，17 分组，含 base/semantic/component 三层标注 + `colors` 快视图 |
| `specs/002-performance-management/ardot-import/components.json` | 218 个组件，15 分类（评估题/评估规则与评分/内容与模板/弹层与容器/基础表单控件/图标…） |
| 源代码（仅核对用） | `D:\AI项目\HR提效工具搭建\hr-portal\frontend\src\styles\tokens.css` 与 `src\components\performance\` |

## 2. 执行步骤

1. ToolSearch 加载 ardot-remote 工具（如 `create_design` / `fetch_editor_state` / `fetch_variables` / `batch_read` 等，以实际列表为准）。
2. 创建设计文件，命名：**「HR Portal 绩效管理 · 设计系统」**。
3. 建**变量集「Performance Tokens」**，按 design-tokens.json 写入：
   - 颜色类 token → 颜色变量（`--color-*` 全部 + `--performance-*` 中的色值，如 `--performance-line-tabs-ink: #1456f0`）；
   - 字号/字重/行高 → 文本样式（12/13/14/16/18/20/24px，正文 14px/400，标题 600）；
   - 间距 `--spacing-*`、圆角 `--radius-*`、阴影 `--shadow-*` → 数值变量/效果；
   - `var()` 引用型语义 token：按其指向的基础值落值，命名保留原语义（如 `color-surface-page`）。
4. 建**组件目录页**，按 components.json 的 15 个分类各建一个分区 Frame，组件以「名称卡片」形式列出（组件名 + 分类 + 来源文件名），作为后续逐个落高保真组件的目录骨架。
5. 完成后 `fetch_variables`/`batch_read` 回读校验数量（颜色变量数、组件卡片数），把画布链接（`https://ardot.tencent.com/file/<id>?_fid=<file_id>` 格式，按工具实际返回为准）交给用户。

## 3. 边界与原则

- 值一律来自清单，**禁止编造**；`--performance-textarea-min-height: 49.3333px` 等奇值原样保留（这是像素级测量结果）。
- 页面一次性布局值不进变量集（与 tokens.css 分层原则一致）。
- 若工具数量/能力与计划不匹配（如不支持变量集），降级为：把 token 建成画布上的色板/样式表 Frame，组件目录照建，并在回复中说明差异。
