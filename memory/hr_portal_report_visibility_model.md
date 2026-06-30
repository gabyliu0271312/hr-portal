---
name: hr_portal_report_visibility_model
description: 报表可见性三档模型(private/scoped/public)+ ACL 受数据集权限约束;改报表权限前必读
metadata:
  type: project
---

报表权限从"草稿/发布"二态升级为**三档可见性**(2026-06-30,migration 0055),修复三个安全/语义缺陷。

**三档语义**(`reports.Report.visibility` 列,String(16),默认 private):
- `private` 私密:仅创建者 + 超管,**不查 ACL**(根治"草稿被授权外泄")
- `scoped` 指定范围:在"有该数据集权限者"中,再由 report_acl 白名单圈定
- `public` 公开:**所有"有该数据集权限"的角色/用户**(不再是全员!语义已收窄)

**关键约束**:scoped/public 共用一道前置闸——访问者必须拥有该报表所绑**数据集**权限。
- "数据集权限"权威口径 = `datasets/router.py:_can_access`(created_by ∪ 超管 ∪ DataSetAcl 命中)
- `reports/router.py` 复用它:`_report_dataset_can_access` + `_dataset_authorized_principals(dataset_id)→(role_ids,user_ids)`
- 保存报表 ACL 时强校验:被授权角色/用户必须落在合法集合,否则 400(`_validate_acl_principals`)
- `_acl-options?dataset_id=` 候选也按此过滤;前端选不到无权对象

**其他**:`list/get/run` 补了 `require_op("report.list","V")`(原先裸 current_user,与 export 的 E 不一致)。行级 scope + 字段脱敏仍按访问者本人算(`run_dataset_query(user=user)` 未动),是第三道兜底。

**前端**:删了独立「访问授权」按钮/抽屉;授权并入「基础设置」抽屉,选"指定范围"才内联展开 AclEditor。`is_published` 字段保留为派生只读兼容(= visibility=='public'),未删 DB 列。

⚠️ 改报表权限/新增可见档位时:三档枚举 `VISIBILITY_VALUES` 在 reports/router.py;前端 `REPORT_VISIBILITY_LABELS` 在 api/reports.ts。相关:[[hr_portal_field_permission_semantics]] [[hr_portal_scopes_design]]
