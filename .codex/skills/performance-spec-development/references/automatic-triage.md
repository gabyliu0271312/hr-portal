# Automatic triage reference

## Minimal user input

Accept a short request such as “我想做绩效周期创建” or “修复员工自评提交后无法重新打开”. Infer the intent, search the existing Spec, then create or update only the smallest necessary artifact.

## Safety default

- Discussion and specification requests never modify business code.
- Implementation requests require a confirmed atomic task and must follow the development-start confirmation.
- Blueprint-required UI work stops after the blueprint and confirmation record until the user explicitly confirms the blueprint.
- Ambiguous requests become discussion work, not guessed implementation.

## Artifact choice

| Situation | Artifact |
|---|---|
| New independent business capability | `features/PM-xxx-name/` |
| Small or cross-feature adjustment | `changes/CR-xxx-name/` |
| Long-term architectural choice | `decisions/ADR-xxx-name.md` |
| Small bug under a known feature | Update the related feature task/change record |
## Clarification gate

For a new feature with unresolved roles, data scope, state behavior, source-of-truth, or UI workflow decisions, ask focused questions before creating formal specification files. Do not turn assumptions into requirements. A user can explicitly authorize documented assumptions when fast progress is preferable.