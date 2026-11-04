# REA 周期-人员与部门（info-list）架构提炼报告
## ——「查看更新记录 / 更新人员信息」两按钮功能像素级还原规格

> 路径：绩效管理后台 → 周期 → 点击人员跳转「人员与部门」页
> URL：`/perf/admin/semester-activities/7702053437998894368/info-list?activeKey=employee&showDepartment=true`
> 样本周期：`2026年全年`（semester_id=7702053437998894368，type=customized，empTotal=601，deptTotal=933）
> 抓取方式：真实登录态浏览器（Playwright），落盘 DOM/网络/CSS/截图，证据目录 `rea-extract/out/capture3b/`
> 全部结论基于实际接口响应、DOM 与前端 bundle（webpack chunk）逆向，无猜测部分已明确标注。

---

## 1. 页面结构与前端架构

### 1.1 技术栈（产物指纹确认）

| 层 | 事实 | 证据 |
|---|---|---|
| 框架 | React SPA，路由 `/perf/admin/semester-activities/:id/info-list` | page.html 单一根节点、webpack main.8d341ea7.js |
| 页面组件 | chunk `8113.fb46b926.chunk.js`（人员 Tab 表格 + 两弹窗） | bundle 逆向 |
| API 层 | chunk `7255.02afdc6e.chunk.js`（/perf/api 封装，axios `a.Em`） | bundle 逆向 |
| 组件库 | 飞书 Universe UI：`ud__table` / `ud__button` / `ud__modal` / `ud__checkbox` / `ud__notice` / `ud__tag` | DOM class |
| 表格 | 虚拟滚动表格（`virtual-grid`）+ 右侧固定列（`ud__table-cell-fix-right`，sticky right:0） | DOM |
| i18n | Starling 文案（key 例：`Cycle.查看更新记录`、`EmployeeList.update_staff_information`） | i18n.6395ad88.js |

### 1.2 页面骨架（DOM 实测）

```
TopBar (h=56px, 白底)
└─ ← 返回 | 人员与部门
ListBody (bg #f5f6f7, padding 8px 20px 20px)
├─ Tab 栏: 人员 (601) ｜ 部门 (933)     ← activeKey=employee
└─ ContentList (白卡, radius 8, padding 20, shadow rgba(31,35,41,.05) 0 1px 4px)
   ├─ 工具行: 搜索成员 | 筛选 | 批量更新(主按钮)
   └─ ud__table (change-list-table)
      ├─ thead: 姓名 直属上级 虚线上级 一级部门 末级部门 序列 子序列 职务 … 操作(固定右)
      └─ tbody: 行高 52px, 单元格 padding 12px
         操作列 (w=204px, sticky right): [查看更新记录] [更新人员信息]
```

## 2. 操作列两个按钮（行为与禁用逻辑，bundle 逆向）

```jsx
// chunk 8113 — 人员 Tab 操作列（列定义 dataIndex:"actions", width:204, fixed:"right"）
render: (e, { id, hasChange = false, userName }) => (
  <>
    <Button type="link" color="primary"
      disabled={!hasChange}                        // ★ 无变更记录则禁用
      onClick={() => { h(id); P(userName); }}>     // 打开「人员变更记录」弹窗
      {t("Cycle.查看更新记录")}
    </Button>
    {!Y && Q ?                                     // Y=部门Tab/特殊视角, Q=can_update_snapshot
      <Tooltip disabled={!O} content={t("Notice.updatingDisable")}>
        <Button className="ml-6" type="link" color="primary"
          disabled={O}                             // O = 周期不允许快照更新
          onClick={() => { ke(id); Ie(true); }}>   // 打开「更新人员信息」弹窗
          {t("EmployeeList.update_staff_information")}
        </Button>
      </Tooltip> : null}
  </>
)
```

- **查看更新记录**：行数据字段 `hasChange`（来自 `GET /user/event/{semesterId}/employee?user_ids=...`）为 false 时禁用。**本周期 601 人全部 hasChange=false**（无人做过更新），实测 10/10 行按钮均带 `disabled` 属性。
- **更新人员信息**：`GET /review/semester/can_update_snapshot` 返回 `{ok:false}` 时禁用并悬浮提示 `Notice.updatingDisable`；本次抓取该周期返回可更新（按钮蓝色可点）。

## 3. 弹窗 A：更新人员信息（UpdateFieldModal，实测 DOM）

| 属性 | 实测值 |
|---|---|
| Modal 宽度 | **600px**（`ud__dialog__content-md`），圆角 8px，白底，遮罩黑色半透明 |
| Header | padding `24px 56px 24px 24px`，h=72；标题 16px/24px w600 `#1f2329`；右上角 × 图标按钮 |
| Body | padding `0 24px` |
| Footer | padding `0 24px 24px`，按钮右对齐：[取消 次按钮] [确定 主按钮]，高 32px、min-width 80px、radius 6px |

内容结构（自上而下）：

1. 表单 Label：`更新信息内容` + 红色 `*`（14px，w500）
2. 蓝色提示条 `ud__notice--info`：bg **`#f0f4ff`**，图标 ℹ 主蓝色 **`#1456f0`**，文案 14px `#646a73`：
   「仅支持人员在原有序列/职级/直属上级/部门范围内的变更（不支持新增及名称修改）」
3. 说明行：`更新后将影响信息展示、报表统计范围、任务执行人、角色权限和校准范围等` + 蓝色链接 `查看详情`（14px `#646a73` / 链接 `#1456f0`）
4. Checkbox 组（`ud__checkbox-group`，column-gap 24px，勾选蓝 `#1456f0`）：
   `序列(category)` `职级(level)` `直属上级(direct_leader)` `部门(department)`

### 提交逻辑（bundle 逆向，chunk 8113）

```js
// 单人更新（本弹窗）
POST /perf/api/user/snapshot/update_field/{semesterId}/update
body: { update_fields: ["category"|"level"|"direct_leader"|"department", ...], user_id }
// 成功 → toast(EditInfoModal.modified_successfully) → onClose → startFetching()（刷新列表）
// 埋点: section:"cycleTable", component:"updateInformation_submit", action:"click"

// 批量更新（工具栏「批量更新」，同弹窗复用，多上传步骤）
GET  /perf/api/user/snapshot/update_field/{semesterId}/template   → {attachment_id} 下载模板
POST /perf/api/user/snapshot/update_field/{semesterId}/validate   (FormData file) → {record_id} / {error_attachment_id}
POST /perf/api/user/snapshot/update_field/{semesterId}/submit     body: {update_fields, record_id}
```

勾选/取消勾选 **不发任何网络请求**（纯前端表单态，实测 network 0 条新增）。

## 4. 弹窗 B：人员变更记录（查看更新记录，代码逆向 + 有限佐证）

> ⚠️ 佐证等级说明：本周期全员 `hasChange=false`，真实弹窗无法触发，以下规格来自
> chunk 8113 中 `he` 组件完整源码逆向（非猜测，但未跑通真实接口响应）。

| 属性 | 规格 |
|---|---|
| 容器 | 宽 **480px**，`maskStyle:{backgroundColor:"transparent"}`（透明遮罩），标题「人员变更记录」 |
| 数据源 | `GET /perf/api/user/event/{semesterId}/employee/history?employeeId={userId}` |
| 过滤 | 仅保留 `eventType==="update"` 且 `changes[].attr` ∈ 15 字段映射 |
| 布局 | Timeline（`appliedTime` 为 key），每条事件一个 Item |
| Item 标题 | 头像 32px + 姓名（14px）+ 变更时间 `YYYY-MM-DD HH:mm`（次要色）+ 状态 tag：新增(add)/变更(update)/停用(delete)，tag 类名 `add`/`change`/`end` |
| Item 描述 | 每条 change 一行：**字段名 旧值 → 新值**（箭头图标分隔；人员类字段渲染成用户 tag，日期字段格式 `YYYY-MM-DD`） |
| 空态 | 插图 250×125 + 「暂无数据」 |

**15 个变更字段映射（attr → 中文，bundle 原文）**：
`leader_id`=直属上级、`dotted_leader_ids`=虚线上级、`department_id`=所属部门、`root_category_id`=序列、`category_id`=子序列、`second_direct_leader_id`=第二直属上级、`level_id`=职级、`employee_type_id`=历史人员类型、`work_location_id`=城市、`join_date`=入职日期、`seniority_date`=司龄起算日期、`job_title`=职务、`employee_subtype_id`=人员子类型、`position_id`=岗位、`recruitment_type`=招聘类型。

相邻功能（同 chunk 9110，注意区分）：**离职员工部门修改记录**弹窗调用
`POST /perf/api/user/snapshot/update/record`，body `{semester_id, user_ids, department_ids}`，
响应 `logs[]`：`{user_id, department_name_before, department_name_after, creator_id, modify_time}`，
表格列：姓名 / 部门修改前 / 部门修改后 / 变更操作人 / 修改时间(排序，YYYY-MM-DD HH:mm)。

## 5. 真实接口清单（本页实测 + bundle 逆向）

| # | 接口 | 方法 | 作用 | 证据 |
|---|---|---|---|---|
| 1 | `/perf/api/review/semester?id={semesterId}` | GET | 周期元信息（name/dateRange/empTotal/template_groups…） | 实测响应 |
| 2 | `/perf/api/review/snapshot/emp-list` | GET | 全量人员 userId 列表（分页源） | 实测响应 |
| 3 | `/perf/api/review/snapshot/simple` | POST | 人员行数据（部门/序列/职务/直属上级…） | 实测响应 |
| 4 | `/perf/api/user/snapshot/simple_emp` | POST | 人员基础信息（姓名/邮箱/工号/头像多尺寸） | 实测响应 |
| 5 | `/perf/api/user/event/{semesterId}/employee?user_ids=…` | GET | 行数据 + **`hasChange`**（repeat 数组序列化） | bundle |
| 6 | `/perf/api/review/semester/can_update_snapshot` | GET | 更新能力开关 `{ok:false}` → 禁用「更新人员信息」 | 实测响应 |
| 7 | `/perf/api/user/event/{semesterId}/employee/history?employeeId=` | GET | ★ 人员变更记录（弹窗B数据源） | bundle |
| 8 | `/perf/api/user/snapshot/update_field/{semesterId}/update` | POST | ★ 单人更新提交 `{update_fields, user_id}` | bundle |
| 9 | `/perf/api/user/snapshot/update_field/{semesterId}/template` | GET | 批量更新模板 `{attachment_id}` | bundle |
| 10 | `/perf/api/user/snapshot/update_field/{semesterId}/validate` | POST | 批量上传校验 → `{record_id}` | bundle |
| 11 | `/perf/api/user/snapshot/update_field/{semesterId}/submit` | POST | 批量更新提交 `{update_fields, record_id}` | bundle |
| 12 | `/perf/api/user/snapshot/update/record` | POST | 离职员工部门修改记录 `{semester_id, user_ids, department_ids}` | bundle |
| 13 | `/perf/api/user/snapshot/department/list` | GET | 筛选部门树 | 实测响应 |

## 6. 设计 Token（实测值）

| Token | 值 | 用途 |
|---|---|---|
| B-500 主蓝 | `#1456f0` (rgb 20,86,240) | 链接按钮/勾选框/notice 图标/主按钮底色 |
| B-500 hover | `#336df4` (rgb 51,109,244) | 按钮 hover/active |
| N-900 主文字 | `#1f2329` | 标题/正文 |
| N-600 次要文字 | `#646a73` | 表头/说明文案 |
| N-400 禁用 | `#bbbfc4` (rgb 187,191,196) | 禁用链接按钮 |
| N-100 页面底 | `#f5f6f7` | 列表区背景 |
| N-200 表头底 | `#f2f3f5` (rgb 242,243,245) | 灰表头 |
| N-300 分隔线 | `rgba(31,35,41,0.15)` | 表格行分隔 |
| B-50 信息条底 | `#f0f4ff` | notice--info 背景 |
| 用户 tag 底 | `rgba(31,35,41,0.1)` | 直属上级人名 tag，圆角全圆 h24 |
| 字号体系 | 14/22 正文，16/24 弹窗标题(w600) | |
| 圆角 | 8px 卡片/弹窗，6px 按钮 | |
| 阴影 | `0 1px 4px rgba(31,35,41,0.05)` 白卡 | |
| 尺寸 | 行高 52px、单元格 padding 12px、按钮 h32 min-w80、操作列宽 204px、弹窗 600px/480px | |

## 7. 前后端架构（数据流）

```
[React SPA /perf/admin/semester-activities/:id/info-list]
  │  页面加载
  ├─ GET review/semester            → 周期信息（标题/人数/tab徽标）
  ├─ GET review/snapshot/emp-list   → userId[]（分页切片 offset/limit）
  ├─ POST snapshot/simple + POST user/snapshot/simple_emp → 行数据 + 人员基础信息
  ├─ GET user/event/{id}/employee?user_ids=… → hasChange（控制「查看更新记录」禁用）
  └─ GET review/semester/can_update_snapshot → ok（控制「更新人员信息」禁用+Tooltip）
       │
       ├─ [查看更新记录] → GET user/event/{id}/employee/history?employeeId=
       │                    → Timeline(变更事件, attr→中文字段, old→new)
       └─ [更新人员信息] → POST user/snapshot/update_field/{id}/update
                            {update_fields:[category|level|direct_leader|department], user_id}
                            → toast 成功 → startFetching() 刷新 2/3/5
后端（推断自接口命名）：semester(周期域) + user/snapshot(人员快照域) + user/event(变更事件域) 三个服务；
快照更新通过 update_field/{action} 状态机（template→validate→submit / update）实现，支持单人与批量两条链路。
```

## 8. 证据产物索引

```
rea-extract/out/capture3b/
├─ list-scrolled/          # 列表页（操作列滚入视口）html+png
├─ update-modal/           # 更新人员信息弹窗 html+png
├─ update-modal-checked/   # 勾选4个checkbox后的联动截图×4
├─ api/ (35个响应体)        # semester / emp-list / simple / simple_emp / can_update_snapshot…
├─ css/ (13份样式表)        # Universe UI 全量规则
├─ network.json (152条)     # 含 phase 标注（list / record_modal / update_modal / update_modal_checked）
└─ js/ (258个chunk)        # main + 8113(页面) + 7255(API层) + 9110(相邻功能) 全量 bundle
rea-extract/capture3-infolist.js / capture3b.js   # 抓取脚本（可重跑）
```

**未捕获项**：弹窗 B 的真实接口响应（需某员工 hasChange=true 才能触发；如需 100% 实证，
可在测试周期授权执行一次「更新人员信息」后回抓，或将历史周期 ID 提供后再抓一轮）。
