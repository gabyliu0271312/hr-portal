# Configured Card Action Toolbar Contract

completion_status: incomplete
pixel_restore_status: blocked
uncovered_reasons:
- 四按钮人工 hover 轨迹已采集；删除未执行，拖拽 drop 和自定义卡片最终联动仍缺完整 after 证据。
- 实现侧 rendered contract、截图 diff、完整 focus/active/disabled 状态未运行。

Status: evidence-driven implementation contract; not pixel-accepted

## Source states

`C20-CARD-HEADER-HOVER`, `C20-TOOLBAR-MOVE-UP-HOVER`, `C20-TOOLBAR-MOVE-DOWN-HOVER`, `C20-TOOLBAR-EDIT-HOVER`, `C20-TOOLBAR-DELETE-HOVER`

## Component

`ConfiguredCardActionToolbar` is the single toolbar for configured-content cards. It is visible
when the whole card receives hover/focus and must not change the card's layout or width.

DOM ownership:

```text
configured-content-card
  -> card-hover-surface
    -> action-toolbar
      -> action-button (24x24, padding 4px)
        -> svg (16x16, viewBox 0 0 24 24)
```

Toolbar order is fixed: `SpaceUpOutlined`, `SpaceDownOutlined`, `EditOutlined`,
`DeleteTrashOutlined`.

## State contract

| State | Evidence requirement |
|---|---|
| default | toolbar hidden; card geometry captured |
| card-hover | toolbar visible; card geometry unchanged |
| button-hover | only the pointed button background/color changes |
| disabled | boundary move action remains in layout with captured opacity |
| active | button pressed style captured before action completes |
| after-click | edit opens modal; delete removes card; move changes array order |

Each state must have HTML, computed style, layout, target contract, screenshot and interaction
evidence. Missing evidence blocks pixel acceptance.

## SVG contract

Implementations must use the exact `data-icon`, `viewBox`, dimensions and path from the captured
`target_contract`. No library replacement, text glyph or approximate path is permitted.

## Acceptance

Given a configured card, when the pointer enters any point on the card hover surface, the toolbar
is visible with four 24x24 controls in the fixed order. Moving over one control changes only that
control. First-card move-up and last-card move-down retain layout and captured disabled opacity.
The card bbox must remain unchanged between default and card-hover states.
