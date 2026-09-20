# PM-T005 UI Contract Revision 2026-08-26

## Status

Confirmed implementation contract for the five UI differences reported against the captured target page. This revision supplements `component-model.md` and `pixel-contract.md`; it does not replace captured evidence.

## Contract

1. Field labels for language, name, description, review rule, and remark use `font-weight: 600`, `font-size: 14px`, `line-height: 22px`, and `color: rgb(31,35,41)`. These values come from the target computed-style capture supplied by the user. Card section headings may remain emphasized; generic Element Plus rules must not reset field labels to `400` or `500`.
2. Required markers render after the label text. Marker color is `rgb(245,74,69)` and typography is `14px/22px`.
3. In the normal create state, the description textarea uses the captured target control geometry `758.67x49.33px` at `x=580.67,y=319.33`, including stable width, padding, and `/1000` counter placement. The earlier `107px` value was a mixed-session wrapper measurement and is retired for implementation; validation messages are a separate state.
4. The remark card contains a `备注` field label, a textarea, and a `/2000` counter. The fixed action footer must not cover the remark field or its counter.
5. Basic information, review rule, and remark cards share one field geometry baseline. Independent Element Plus form defaults must not introduce per-section label or control offsets.
   The `388px` BasicInfoCard contract includes the type label and radio options. The type row must remain inside the card; nested form margins and child control heights must be normalized so the card does not overflow.
6. The target language control remains a square checkbox group, while the question type remains a horizontal radio group. This distinction is authoritative over the older prose wording in `spec.md`.

7. The name input uses the captured selected-state geometry `695x28px`; it must not reuse the description control width or default `32px` height.

8. Absolute y-coordinates sourced from different capture states are single-control constraints only. They must not be subtracted to invent cross-field spacing unless the source state and scroll coordinate are identical.

## Acceptance evidence

- Target geometry references remain `pixel-contract.md` and the source sessions listed in `capture-manifest.md`.
- Any newly measured bbox, font token, or state must be added to `pixel-contract.md` before implementation changes.
- Real disabled-state evidence remains unavailable and must stay `N/A/not observed`; no disabled style may be guessed.

## Implementation boundary

The implementation may change only the PM-T005 create/edit page and its field components. No API, persistence, permission, migration, UCP, or unrelated layout behavior is part of this revision.
