---
name: hr-portal-menu-actions-upgrade
description: HR 提效工具 Phase 6 启动前必须做的权限模型升级 — 从固定 V/C/U/D/E 五件套改造成 menu_actions 自定义动作字典
metadata: 
  node_type: memory
  type: project
  originSessionId: c8cd5960-c3b5-4d9d-8617-32a919aaf2a4
---

# HR 提效工具：menu_actions 升级（Phase 6 前必做）

**触发条件**：Phase 6（分摊工作流）启动前，或者更早遇到 ≥3 个塞不进 V/C/U/D/E 的工作流按钮。

**Why**：当前 `role_menus` 表把操作权限写死成 5 个布尔字段（can_view/create/update/delete/export），无法承载 submit/recall/transfer/approve/reject 这类工作流动作。用户已确认希望"按角色配自定义动作"（不是按用户、不是按按钮 × 用户的 ACL）。Phase 6 会一次性冒出大量工作流动作，是改造的最佳时机——届时需求最清晰，避免现在拍脑袋设计 action 字典。

**How to apply**：

启动 Phase 6 前**必须主动提醒用户**：
> "Phase 6 涉及工作流动作（submit/recall/transfer/approve/reject 等），按之前约定，启动前先做 menu_actions 权限模型升级。要不要现在开始？"

### 升级方案要点
- 新增 `menu_actions(id, menu_id, action_code, label, display_order)` 表
- 新增 `role_menu_actions(role_id, menu_id, action_id)` 表
- 废弃 `role_menus` 的 5 个布尔字段（保留过渡期，迁移完成后删除）
- 前端 `<PermissionButton>` 从 `op="C"` 改成 `action="submit"`
- 角色配置页从「4 个固定圆点」改成「按菜单展开动作清单」树形结构
- 改造耗时预估：2-3 天

### 驳回过的替代方案（不要再讨论）
- ❌ **按钮 × 用户 ACL**：维护成本指数级爆炸，违背 RBAC 主流实践
- ❌ **菜单 CRUD 管理页（让管理员动态加菜单）**：场景错位，HR 工具是公司内部��具，不是 SaaS 多租户平台
- ❌ **Phase 3 现在就升级**：过早抽象，目前所有按钮都能用 CRUD 五件套兜底

### 过渡期约定（Phase 4-5）
- 遇到工作流类按钮（如分摊填写页"提交"），先用 `op="U"` 兜底
- 把这些"勉强用 U 兜底的按钮"记到 Phase 6 待办，便于届时盘点

关联：[[hr_portal_add_menu_sop]] [[hr_portal_system]]
