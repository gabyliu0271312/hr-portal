# PM-T004 Assessment Content Drawer and Configured Card Contract

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- 2026-09-01 统一 manifest 已替代本文件的旧 2026-08-22 单 session 作为内容设置主证据索引。
- 本文件保留抽屉/配置卡片的历史精细交互契约；自定义内容最终中栏 root/item 和新分支状态仍缺证据。

Version: `v2-realtime-capture-20260901`

Status: `contract projection; not an implementation authorization`

## 1. Purpose and evidence boundary

This document preserves the reusable drawer/card interaction rules and projects the 2026-09-01 unified capture into the current feature contract. The authoritative manifest is:

`C:\Users\gaby.liu\ClonedSites\realtime_sessions\manifests\PM-T004-content-settings-20260901-50f0f4d0.json`

The historical single-session evidence below remains valid only for the states it names; it cannot be used to close the newly identified blockers.

Authoritative local evidence roots:

- `C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260901_183638_272038`
- `C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260901_164618_262168`
- `C:\Users\gaby.liu\ClonedSites\idreamsky.feishu.cn_20260901_194710_752022`

Raw HTML, screenshots, logs, cookies, and authentication data must not be copied into Git, Specs,
or product fixtures. Implementations must reference the `source_state_ids` in
`extracted-ui-contract.json`.

## 2. Scope

- The right-side "Select assessment content" drawer under an assessment workflow step.
- Drawer row checkbox, edit, expand/collapse, and expand-all/collapse-all behavior.
- The middle configured-content cards after drawer confirmation.
- Card reorder, whole-header drag hit area, collapse/expand, edit, delete, and deleted-item recovery.

Out of scope: template persistence APIs, database migrations, tenant assessment APIs, cross-session
persistence, permissions, and UCP integration. Tenant labels such as `1111`, `111111111`, and `112`
are evidence values, not product constants. Delete is a user-authorized action and must never be
auto-clicked by the collector.

## 3. Evidence index

| Captured state | source_state_ids | Required implementation assertion |
| --- | --- | --- |
| Drawer open with three rows | `39`, `41` | `role=dialog`, `aria-modal=true`, about 680px wide, labels and checkboxes present |
| Row expand hover | `42` | `DownBoldOutlined`, about 24x25px, transparent background, pointer cursor |
| Row expanded | `48`, `49` | `UpBoldOutlined`, rating details visible, header text becomes collapse-all (Chinese UI: "全部收起") |
| Collapse-all hover/active/click | `50`, `53`, `54`, `55` | `MinimizeOutlined`, about 82x32px, focus and active backgrounds captured |
| Drawer confirm to configured list | `62`-`65` | Drawer closes after transition and middle cards appear |
| Whole card drag hit area | `66`, `68`, `108`, `109` | about 600x24px, `role=button`, `grab -> grabbing`, any header position is hittable |
| Move-up disabled / move-down enabled | `71`, `72`, `93`, `94` | `SpaceUpOutlined` remains with opacity 0.5; down action remains clickable |
| Edit/delete hover | `75`, `76`, `78`, `79` | `EditOutlined` and `DeleteTrashOutlined`, about 24x24px, pointer cursor |
| Edit click and modal | `85`, `86` | Corresponding `role=dialog` edit-rating modal opens and stabilizes |
| Move down and move up | `94`, `100`, `101` | Order swaps; enabled state is recalculated from the real array index |
| Drag completion | `102`-`111` | `grabbing` sequence is recorded and final order is actually changed |
| Card collapse | `123`-`127` | Preview leaves visible layout, card becomes shorter, collapse control changes |
| Card expand recovery | `128`-`131` | Preview returns and active/icon state is restored |
| Delete card | `133`-`136` | Deleted card leaves middle list without a confirmation modal |
| Deleted item returned to drawer | `137`-`141` | `1111` is unchecked/enabled; `111111111` remains checked/disabled |
| Drawer cancel | `143`-`147` | Drawer closes and confirmed middle-card array is unchanged |

The session contains 148 recording events. An implementation must not claim pixel-level completion
for a state without its corresponding evidence ID.

## 4. Component tree and ownership

```text
PerformanceTemplateContentSettings
`-- AssessmentContentLayers
    |-- AssessmentContentDrawer (role=dialog, aria-modal=true)
    |   |-- DrawerHeader + CloseOutlined
    |   |-- VisibilitySwitch
    |   |-- ExpandAllButton (AddOutlined / MinimizeOutlined)
    |   |-- AssessmentOptionList
    |   |   `-- AssessmentOptionRow[*]
    |   |       |-- Checkbox (available | checked-disabled)
    |   |       |-- Label/description
    |   |       |-- EditOutlined
    |   |       `-- DownBoldOutlined / UpBoldOutlined
    |   `-- DrawerFooter (confirm / cancel; Chinese UI: "确定" / "取消")
    `-- ConfiguredContentList
        `-- ConfiguredContentCard[*]
            |-- TopDragHitArea (whole 600x24)
            |-- OperationToolbar (hover/focus only)
            |   |-- SpaceUpOutlined
            |   |-- SpaceDownOutlined
            |   |-- EditOutlined
            |   `-- DeleteTrashOutlined
            |-- CardTitle
            |-- CollapseButton (DownOutlined; rotate-180 when expanded)
            `-- ExpandedPreview
```

Drawer and configured list share one draft selection model but must not share DOM nodes. Drawer
confirm changes only the current wizard session; it does not send a template persistence request.

## 4.1 Reuse boundaries

The drawer, editor preview and configured middle-card preview reuse the same content model and
`ContentPreviewRenderer`. Their outer containers remain separate because their layout and interaction
ownership differ:

- `editor`: `EditorPreviewPane` renders draft content and has no card toolbar.
- `configured-card`: `CardPreviewArea` renders configured session content; the card root owns
  expand/collapse, root/item selection, drag and the four-button toolbar.
- `drawer-summary`: `AssessmentContentDrawer` renders selection/re-entry summary and owns checkbox
  selection, not card settings.

The nine stage entries are rule variants of one stage renderer. A new stage adds a rule registry entry
and fixture; it must not copy the drawer, card, preview or aside component. A new content type may add
a type-specific preview renderer only after its content model and allowed contexts are registered.

## 4.2 Existing component reuse

The target feature must consume existing HR Portal performance primitives before introducing new
markup: `PerformanceTextField` for single/multi-line fields, `PerformanceCountedTextarea` for counted
textareas, `PerformanceRichTextBox`/`PerformanceRichTextToolbar` for rich text, shared checkbox/radio/
switch components, `PerformanceAssessmentEditorModal`/`FullScreenModal`, `PerformanceDragHandle` /
`PerformanceSortableList`, `PerformanceIconButton`, and `PerformanceContentRenderer` for previews.

`PerformanceAssessmentContentLayers.vue` contains local `FormField`, `RichTextBox`, `ToggleSwitch`,
`OptionSelect`, `EditorIcon`, and `CreateMenu` definitions. These are migration targets, not a reason
to rewrite the feature. Preserve existing props, emits, state transitions, drag and rich-text behavior;
replace local duplicates incrementally and verify each replacement with focused regression tests.

### Drawer

- Fixed right-aligned width about `680px`; captured realtime height was `673.33px`.
- `role=dialog`, `aria-modal=true`, white background, shadow `rgba(31,35,41,0.12) 0 0 24px`.
- Content scope marker: `data-ui-flow-id="UnitPreviewer"`.
- Row expand control about `24x25px`, color `rgb(100,106,115)`, transparent background, pointer cursor.
- Expand-all/collapse-all control about `82x32px`; default transparent, focus background about
  `rgba(31,35,41,0.1)`, active background about `rgba(31,35,41,0.118)`.

### Configured card

- `ReviewContent` is about 600px wide; expanded card height was about 164px.
- The whole top strip is the drag hit area: `600x24px`, `role=button`, `draggable=false`,
  default `cursor:grab`, `cursor:grabbing` while pressed/moving.
- The six-dot `DragOutlined` is visual guidance only (captured rotation 90 degrees); do not limit
  pointer handling to the icon.
- Collapsed cards remove the preview from visible layout and retain title, drag strip, and toggle.
- Toolbar appears only on card hover/focus. Each control is about `24x24px` with pointer cursor.
- First move-up and last move-down use opacity `0.5` to show disabled state while retaining layout;
  do not replace this with `display:none`.

### Required captured SVG data-icon values

Use the captured SVG data-icon and path. Do not substitute text glyphs, approximate SVGs, or another
icon library:

| Purpose | data-icon |
| --- | --- |
| Drawer row expand/collapse | `DownBoldOutlined` / `UpBoldOutlined` |
| Expand-all/collapse-all | `MinimizeOutlined` |
| Card drag | `DragOutlined` |
| Move up/down | `SpaceUpOutlined` / `SpaceDownOutlined` |
| Edit/delete | `EditOutlined` / `DeleteTrashOutlined` |
| Drawer close | `CloseOutlined` |

## 6. State machine and invariants

```text
drawer.open
  -> option.hover
  -> option.edit.click -> edit.modal.open
  -> option.expand.click -> option.expanded
       -> all.collapse.click -> all.collapsed
  -> checkbox.checked
  -> drawer.confirm -> configured.list

configured.list
  -> card.hover -> operation.toolbar.visible
  -> card.drag.start/move/drop -> order.updated
  -> card.collapse.click -> card.collapsed
  -> toolbar.edit.click -> edit.modal.open
  -> toolbar.delete.click -> configured.item.removed
       -> drawer.open -> removed.item.available
```

1. An already selected drawer item is `checked-disabled` and cannot be selected again.
2. Expand-all/collapse-all label and icon derive from every row's real `expanded` state.
3. Move actions derive from the card's actual index; first up and last down are disabled.
4. Drop commits a new array order and rerenders the preview; visual-only movement is insufficient.
5. Delete removes the card and makes that item unchecked/enabled the next time the drawer opens.
6. Cancel closes the drawer without changing the confirmed configured array.

## 7. Interaction contract

- Row hover changes only that row's action visibility and must not shift other rows.
- Row edit opens the matching edit modal while preserving drawer context.
- Row expand updates row content, row icon, and the top expand-all/collapse-all control together.
- Card toolbar order is fixed: move up, move down, edit, delete.
- Drag start, move, and release each require a state snapshot; release renders the final array order.
- Collapse/expand affects only the current card; drag strip and toolbar must not disappear due to collapse.
- Delete has no automatic confirmation modal; the user explicitly decides whether it happens.
- Checkbox event order is `focusin -> click -> input -> change`; business state uses actual selection/query state.

## 8. Acceptance cases (Given / When / Then)

### AC-01 Row expansion

Given the drawer has a collapsed row; when its expand control is clicked; then rating details appear,
the icon becomes `UpBoldOutlined`, and the top control becomes collapse-all.

### AC-02 Collapse all

Given at least one row is expanded; when collapse-all is clicked; then all rows collapse, the top
control returns to expand-all, and row icons are `DownBoldOutlined`.

### AC-03 Edit

Given a card toolbar is visible; when `EditOutlined` is clicked; then the matching `role=dialog` edit
modal opens without losing drawer/card context.

### AC-04 Move boundaries

Given cards `[A,B]`; when the first card is moved down and the second is moved up; then order is
`[B,A]` and then `[A,B]`, with enabled state recalculated after each move.

### AC-05 Whole-strip drag

Given two expanded cards; when any point in the first top strip is dragged below the second and released;
then `grab -> grabbing -> drop` is recorded and order becomes `[B,A]`.

### AC-06 Collapse/expand

Given an expanded card; when its `DownOutlined` control is clicked; then preview leaves visible layout
and card height shrinks; clicking again restores preview and control state.

### AC-07 Delete recovery

Given one configured card and another drawer item that is checked-disabled; when the user clicks
`DeleteTrashOutlined`; then the card is removed and reopening the drawer makes it unchecked/enabled,
while the existing item remains checked/disabled.

### AC-08 Cancel

Given the drawer is open; when cancel is clicked; then the drawer closes and the confirmed card array is unchanged.

## 9. Verification blockers

- This realtime capture saved 148 events; representative states are indexed in Section 3.
- `replay_result.json` has not been replayed against the clone implementation. Until target/clone
  screenshots are diffed, pixel acceptance must remain `not-run`.
- Capture events include a `NaN` coordinate risk. Consumers must validate finite numeric coordinates
  before any automated pixel comparison.
- Rating/tag data must be supplied through an injected assessment adapter and test fixtures, never
  as tenant text constants.

## 10. Change log

- 2026-08-22: Added realtime capture contract for drawer, card toolbar, whole-strip drag, collapse/
  expand, edit, delete recovery, and cancel states.
