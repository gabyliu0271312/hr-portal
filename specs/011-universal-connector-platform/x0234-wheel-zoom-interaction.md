# X0234 Wheel-Zoom Interaction Addendum

This addendum refines the canvas-layout section of
`webhook-trigger-resource-object-componentization-development-spec.md`.

## Interaction contract

- When the pointer is inside the workflow canvas, mouse wheel is the primary
  scale control: wheel up zooms in and wheel down zooms out.
- Zoom is pointer-anchored. The workflow coordinate below the pointer remains
  at the same screen position after scaling.
- The canvas prevents wheel scrolling only for its own viewport. The palette,
  property panel, and outer-page scrolling keep their native wheel behavior.
- The bottom-right overlay contains only the current percentage,
  fit-to-canvas, and center actions. Selecting the percentage resets the
  canvas to `100%`. Visible `+` and `-` scale buttons are not allowed.
- Zoom, drag, edge creation, and palette drop must use one canvas coordinate
  system.
- The visible canvas viewport and the scrollable workflow content are separate
  layers. The controls are a sibling overlay of the scrollable content and
  remain fixed at the viewport bottom-right during zoom, scroll, and pan.
- Dragging an empty canvas area with the primary mouse button pans the viewport.
  Node drag, port-based edge creation, and control clicks always take priority.
- A short movement threshold distinguishes a blank-area click from a pan so a
  simple click can keep its existing deselect behavior.
- Automatic layout uses a left-to-right reading order only as its default. A
  manually positioned workflow may be horizontal, vertical, or mixed.
- Persisted edges use dynamic four-side anchors. The source anchor faces the
  target and the target anchor faces the source; vertical relationships use
  bottom-to-top or top-to-bottom anchors instead of forced right-to-left ports.
- Orthogonal edge routing chooses its primary axis from the selected anchors.
  The final arrow segment remains outside the target card so the SVG marker is
  never hidden behind a node.
- The toolbar exposes one `Smart layout` action only. It operates on the whole
  workflow without requiring node selection or exposing alignment controls.
- Smart layout infers the existing main direction from connected-node geometry.
  It aligns and evenly distributes a clear main chain, preserves branch order,
  removes overlap, and uses a conservative minimum-displacement repair for
  mixed layouts whose direction is ambiguous.
- A connected main path that changes axis, such as an L-shaped or U-shaped
  workflow, is an intentional mixed layout. Smart layout must preserve its
  turning geometry and only repair overlap, normalize local clearance, and
  recalculate directional edges.
- Within every same-axis path segment, smart layout aligns the secondary axis
  and evenly distributes three or more nodes on the primary axis. Two-node
  segments are aligned while retaining their existing primary-axis distance.
- When source and target anchors are collinear after layout, the edge path is a
  single straight segment instead of an unnecessary orthogonal bend.
- The visible label for the single action is `Smart layout`.
- After layout, all edge anchors and arrow paths are recalculated. The action
  reports the chosen layout strategy.

## Acceptance evidence

- Component coverage verifies pointer-anchored wheel zoom and reduced
  bottom-right controls.
- Component coverage verifies empty-canvas panning and fixed overlay controls.
- Component coverage verifies horizontal, vertical, and reverse-direction edge
  anchors with visible directional markers after manual node movement.
- Component coverage verifies horizontal and vertical smart layout inference,
  equal main-chain spacing, overlap repair, and conservative mixed-layout
  handling without node selection.
- Component coverage verifies that a U-shaped workflow remains U-shaped after
  the single smart-layout action.
- Production build, runtime container rebuild, and HTTP page check pass.
