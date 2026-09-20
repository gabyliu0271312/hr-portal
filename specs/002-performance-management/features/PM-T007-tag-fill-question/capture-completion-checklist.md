# PM-T007 采集完成清单

```text
completion_status: incomplete
pixel_restore_status: blocked
```

## 导航

- [ ] 评估题管理默认态及左侧图标
- [ ] 父菜单 hover 底色、图标和文字变化
- [ ] 展开态及展开图标
- [ ] 收起态及收起图标
- [ ] `aria-expanded` 前后值
- [ ] 子菜单“评估题”默认/hover/selected
- [ ] 子菜单“标签型填写题”默认/hover/selected（selected after 已生成，默认/hover仍缺）
- [ ] 选中态左侧底色和最边缘竖线的独立差分

## 列表

- [x] 页面标题、工具栏和列表默认截图
- [x] 新建按钮默认 bbox 和 AddOutlined SVG
- [x] 表头文字和列表记录已从默认证据观察
- [ ] 与 PM-T006 列表组件的共用/差异契约
- [x] 行 hover
- [x] 编辑按钮 hover
- [ ] 搜索 focus、筛选展开和空态
- [ ] 分页状态和列表增长/滚动

## 新建

- [x] 新建按钮 hover 事件已记录
- [x] 新建页面 after HTML、layout、computed、overlay、interaction、target contract、screenshot 已落盘
- [x] 页面头部、主体、标签配置和 Footer 的可见结构已观察
- [ ] Header/主体/Footer 的语义上下文完整绑定
- [ ] 控件 focus/hover/disabled 状态（已补描述/备注 focus，其他状态仍待补）
- [x] 标签新增后的行增长
- [x] 校验错误状态
- [x] 预览成功/关闭状态
- [x] 文本域 resize 状态（本期复用既有多行文本框垂直 resize；不新增专项 dragging 契约）

## 编辑

- [x] 从已有记录进入编辑
- [x] 编辑页面标题和回填值
- [x] 编辑字段 disabled/readonly 差异（默认态已观察，交互态仍待补采）
- [ ] 编辑与新建共享组件树证据
- [ ] 编辑 Footer 操作差异

## 门禁

- [ ] 所有必需状态有 before/after HTML
- [ ] 所有必需状态有 layout/computed/screenshot
- [ ] 所有交互有 interaction evidence 和 action log
- [x] `capture_model.json` 完成分析且 `capture_completeness=passed`
- [ ] `implementation_brief.status` 可用
- [ ] `variant_contracts` 完整
- [ ] `missing_terminal_anchors=[]`
- [ ] rendered contract 已生成
- [ ] 截图 diff 已运行
- [ ] UI 蓝图已创建并确认

当前不得将本清单标记为完成，也不得开始正式 UI 实现。
