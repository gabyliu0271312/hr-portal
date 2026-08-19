# PM-T004-T05 内容设置整体架构蓝图

状态：`confirmed / implementation scope frozen`。

来源：用户提供的 `screenshot-20260819-112335.png`（2026-08-19）及 `Div.text-normal`、`Div.ud__tabs` SnapSpec。

## 范围

- 路由：`/performance/settings/templates/create?step=content`。
- 共享向导 Header 保持现有 56px 结构、步骤导航和上一步/下一步按钮。
- 主体固定为三栏：左侧流程节点列表、中间内容配置区、右侧内容设置面板。
- 右侧未选择节点时显示 SnapSpec 的“内容设置 / 暂未选择内容”空态。
- 本任务不实现内容编辑表单、添加终评内容弹层、添加提示弹层、其他参考内容弹层和后端内容 DTO。

## 几何与视觉基线

- 左栏：白色背景，约 `465px`，右边界 `x=465`。
- 中栏：`#f5f6f7` 背景，约 `960px`，顶部 Tab 与内容卡片。
- 右栏：`320px`，白色背景，`padding:24px 20px`，纵向可滚动。
- 右栏标题：`14px / 600 / 22px`，`#1F2329`，左右内边距 `24px`，底部分隔线 `rgba(187,191,196,.5)`。
- 右栏空态：距分隔线顶部 `212px`，居中，`14px / 400 / 22px`，`#8F959E`。
- 左栏流程卡片遵循 SnapSpec：宽度 `280px`、高度 `64px`、左右 `16px`、上下 `12px`、边框 `#DEE0E3`、圆角 `8px`、卡片间距 `20px`；标题 `14px/21px`，执行人 `12px/18px`，图标 `18×18px`。
- 中栏 Tab 当前项使用 `#3370FF` 和底部 2px 指示线；内容卡片白底、圆角 `8px`。

## 交互边界

- 左侧节点列表由 `GET /api/v1/performance/templates/{template_id}/workflow` 返回的 `nodes` 按 `order` 驱动，不得静态写死；名称和执行人使用节点 API 字段，图标按节点类型映射，几何统一按 SnapSpec。
- 中间按钮保留视觉入口，但本任务不打开编辑器。
- 上一步返回流程设置；下一步进入后续模板步骤，由父级向导控制。

## 验收证据

- 目标参考图：`D:/乐逗/Desktop/screenshot-20260819-112335.png`。
- 目标参考图归档：`PM-T004-T05-content-settings-reference.png`。
- 实现截图：`PM-T004-T05-content-settings-implemented.png`（待具备浏览器截图工具后生成；当前不可将目标参考图冒充实现证据）。
