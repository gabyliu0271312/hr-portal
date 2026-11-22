<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import type { PerformanceHrbpOrganizationNode, PerformanceProjectFlowRule } from '@/api/performance'
import PerformanceConditionLogicGroup from './PerformanceConditionLogicGroup.vue'
import PerformancePopover from './PerformancePopover.vue'
import PerformanceSelectTag from './PerformanceSelectTag.vue'
import { parseCalibrationRule, summarizeCalibrationRule, type CalibrationSummaryPersonOption } from './performanceCalibrationRuleSummary'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  rule: PerformanceProjectFlowRule | null
  triggerLabel?: string
  scopeTitle?: string
  scopeNote?: string
  historyAmbiguous?: boolean
  subject?: boolean
  peopleOptions?: CalibrationSummaryPersonOption[]
  organizationTree?: PerformanceHrbpOrganizationNode[]
}>(), { subject: false, peopleOptions: () => [], organizationTree: () => [] })
const emit = defineEmits<{ 'open-options': [] }>()
const options = computed(() => ({ subject: props.subject, peopleOptions: props.peopleOptions, organizationTree: props.organizationTree }))
const summary = computed(() => props.rule && !props.historyAmbiguous ? parseCalibrationRule(props.rule, options.value) : { kind: 'empty', label: '历史校准范围来源不明', groups: [] })
const text = computed(() => props.triggerLabel || (props.rule ? summarizeCalibrationRule(props.rule, options.value) : summary.value.label))
const canOpen = computed(() => Boolean(props.scopeTitle) || summary.value.kind === 'conditions')
const scopeVariant = computed(() => Boolean(props.scopeTitle || props.triggerLabel))
const first = computed(() => summary.value.groups[0]?.conditions[0])
const more = computed(() => summary.value.groups.length > 1 || (summary.value.groups[0]?.conditions.length || 0) > 1)
const trigger = ref<HTMLElement | null>(null)
const popup = ref<HTMLElement | null>(null)
const measuring = ref<HTMLElement | null>(null)
const overflow = ref(false)
const opened = ref(false)
let observer: ResizeObserver | undefined
let frame: number | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined
let triggerHovered = false
let popupHovered = false
let focused = false

function clearClose() { clearTimeout(closeTimer); closeTimer = undefined }
function open() { clearClose(); opened.value = true; emit('open-options') }
function close() { clearClose(); opened.value = false; triggerHovered = false; popupHovered = false; focused = false }
function scheduleClose() {
  clearClose()
  closeTimer = setTimeout(() => { if (!triggerHovered && !popupHovered && !focused) close() }, 100)
}
function focusIn() { focused = true; open() }
function focusOut(event: FocusEvent) {
  const target = event.relatedTarget
  if (target instanceof Node && (trigger.value?.contains(target) || popup.value?.contains(target))) return
  focused = false
  scheduleClose()
}
function measure() {
  if (!trigger.value || !measuring.value) { overflow.value = false; return }
  const clipped = measuring.value.getBoundingClientRect().width > trigger.value.getBoundingClientRect().width
  if (overflow.value !== clipped) overflow.value = clipped
}
function scheduleMeasure() {
  if (frame !== undefined) return
  frame = requestAnimationFrame(() => { frame = undefined; measure() })
}
function setMeasuring(element: Element | ComponentPublicInstance | null) {
  const next = element instanceof HTMLElement ? element : null
  if (next === measuring.value) return
  if (measuring.value) observer?.unobserve(measuring.value)
  measuring.value = next
  if (next) observer?.observe(next)
}
watch(summary, () => nextTick(scheduleMeasure), { deep: true, flush: 'post' })
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(scheduleMeasure)
    if (trigger.value) observer.observe(trigger.value)
    if (measuring.value) observer.observe(measuring.value)
  }
  window.addEventListener('resize', scheduleMeasure)
  scheduleMeasure()
})
onBeforeUnmount(() => {
  clearClose()
  observer?.disconnect()
  if (frame !== undefined) cancelAnimationFrame(frame)
  window.removeEventListener('resize', scheduleMeasure)
})
</script>

<template>
  <span
    ref="trigger" v-bind="$attrs" class="rule-summary" :class="{ 'rule-summary--scope': scopeVariant }" tabindex="0" role="button"
    :aria-label="text" :aria-expanded="opened && canOpen" aria-haspopup="dialog"
    @mouseenter="triggerHovered = true; open()" @mouseleave="triggerHovered = false; scheduleClose()"
    @focusin="focusIn" @focusout="focusOut" @keydown.esc.stop="close" @keydown.enter="open" @keydown.space.prevent="open"
  >
    <span v-if="triggerLabel" class="rule-summary__empty">{{ triggerLabel }}</span>
    <template v-else-if="first">
      <span v-for="mode in ['visible', 'measure']" :key="mode" :ref="mode === 'measure' ? setMeasuring : undefined" class="rule-summary__row" :class="{ 'rule-summary__measure': mode === 'measure' }" :aria-hidden="mode === 'measure' ? true : undefined">
        <PerformanceSelectTag class="rule-summary__field" :label="first.label" :closable="false" />
        <span class="rule-summary__operator">{{ first.operator }}</span>
        <span v-if="mode === 'measure' || !overflow" class="rule-summary__values">
          <PerformanceSelectTag v-for="(value, index) in first.values" :key="index" :label="value.label" :closable="false" :class="{ 'rule-summary__person': value.person }" :avatar-url="value.person && value.available ? value.avatarUrl : undefined" :avatar-fallback="value.person && value.available ? value.label.slice(-1) : undefined" />
          <span v-if="!first.values.length">暂未配置</span>
        </span>
        <span v-if="more || mode === 'visible' && overflow" class="rule-summary__ellipsis">…</span>
      </span>
    </template>
    <span v-else class="rule-summary__empty">{{ summary.label || '暂未配置' }}<span v-if="more">…</span></span>
  </span>
  <PerformancePopover :visible="opened && canOpen" :anchor="trigger" :width="scopeVariant && scopeNote ? 'var(--performance-calibration-scope-max-width)' : 'auto'" role="dialog" name="calibration-rule-summary-popover" class="rule-summary__popover" :class="{ 'rule-summary__popover--scope': scopeVariant }" :aria-label="scopeTitle || '完整校准条件'" @close="close" @mouseenter="popupHovered = true; clearClose()" @mouseleave="popupHovered = false; scheduleClose()">
    <div ref="popup" class="rule-summary__details" :class="{ 'rule-summary__details--scope': scopeVariant }" tabindex="0" @focusin="focused = true; clearClose()" @focusout="focusOut" @keydown.esc.stop="close">
      <strong v-if="scopeTitle" class="rule-summary__title">{{ scopeTitle }}</strong>
      <PerformanceSelectTag v-if="summary.kind !== 'conditions'" :label="summary.label" :closable="false" />
      <PerformanceConditionLogicGroup v-else :count="summary.groups.length" operator="或">
        <template #default="{ index: groupIndex }">
          <div class="rule-summary__group">
            <PerformanceConditionLogicGroup :count="summary.groups[groupIndex].conditions.length" operator="且">
              <template #default="{ index }">
                <div class="rule-summary__condition">
                  <PerformanceSelectTag class="rule-summary__field" :label="summary.groups[groupIndex].conditions[index].label" :closable="false" />
                  <span class="rule-summary__operator">{{ summary.groups[groupIndex].conditions[index].operator }}</span>
                  <PerformanceSelectTag v-for="(value, valueIndex) in summary.groups[groupIndex].conditions[index].values" :key="valueIndex" :label="value.label" :closable="false" :class="{ 'rule-summary__person': value.person }" :avatar-url="value.person && value.available ? value.avatarUrl : undefined" :avatar-fallback="value.person && value.available ? value.label.slice(-1) : undefined" :title="value.label" />
                  <span v-if="!summary.groups[groupIndex].conditions[index].values.length">暂未配置</span>
                </div>
              </template>
            </PerformanceConditionLogicGroup>
            <span v-if="!summary.groups[groupIndex].conditions.length">暂未配置</span>
          </div>
        </template>
      </PerformanceConditionLogicGroup>
      <p v-if="scopeNote" class="rule-summary__note">{{ scopeNote }}</p>
    </div>
  </PerformancePopover>
</template>

<style scoped>
.rule-summary { position: relative; display: block; width: calc(100% - var(--spacing-3)); min-width: 0; overflow: hidden; cursor: default; }
.rule-summary:focus-visible, .rule-summary__details:focus-visible { outline: var(--performance-rule-summary-focus-width) solid var(--color-primary); outline-offset: var(--performance-rule-summary-focus-offset); }
.rule-summary__row, .rule-summary__values { display: flex; align-items: center; gap: var(--performance-rule-summary-gap); white-space: nowrap; }
.rule-summary__row { width: 100%; min-width: 0; }
.rule-summary__values, .rule-summary__operator, .rule-summary__ellipsis { flex: none; }
.rule-summary__measure { position: absolute; inset-block-start: 0; inset-inline-start: 0; width: max-content; max-width: none; visibility: hidden; pointer-events: none; }
.rule-summary__empty { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rule-summary__row :deep(.performance-select-shell__tag), .rule-summary__condition :deep(.performance-select-shell__tag) { --performance-select-tag-height: var(--performance-rule-summary-tag-height); --performance-select-tag-content-max-width: none; margin: 0; }
.rule-summary__field { --performance-select-tag-radius: var(--performance-rule-summary-field-radius); flex: none; }
.rule-summary__person { --performance-select-tag-radius: var(--performance-rule-summary-person-radius); }
.rule-summary :deep(.performance-select-shell__tag-avatar), .rule-summary__details :deep(.performance-select-shell__tag-avatar) { width: var(--performance-member-avatar-size-sm); height: var(--performance-member-avatar-size-sm); flex-basis: var(--performance-member-avatar-size-sm); border-radius: var(--performance-member-avatar-radius); font-size: var(--performance-member-avatar-font-size-sm); }
:global(.calibration-rule-summary-popover) { max-width: min(var(--performance-rule-summary-max-width), calc(100vw - var(--performance-popover-viewport-margin) * 2)) !important; }
.rule-summary__details { max-height: var(--performance-rule-summary-max-height); overflow: auto; overscroll-behavior: contain; }
.rule-summary__group + .rule-summary__group { margin-top: var(--performance-rule-summary-row-gap); }
.rule-summary__condition { display: flex; flex-wrap: wrap; align-items: center; gap: var(--performance-rule-summary-gap); margin-bottom: var(--performance-rule-summary-row-gap); }
.rule-summary__condition > :deep(.performance-select-shell__tag) { max-width: 100%; height: auto; min-height: var(--performance-rule-summary-tag-height); flex: 0 1 auto; }
.rule-summary__condition :deep(.performance-select-shell__tag-content) { white-space: normal; overflow-wrap: anywhere; }
.rule-summary__title { display: block; margin-bottom: var(--spacing-2); font-weight: var(--font-weight-medium); }
.rule-summary__note { margin: var(--spacing-4) 0 0; color: var(--color-text-secondary); white-space: normal; }
.rule-summary__condition:last-child { margin-bottom: 0; }
.rule-summary--scope { display: inline-flex; width: auto; max-width: 100%; flex: 0 1 auto; cursor: pointer; }
.rule-summary--scope > .rule-summary__empty { cursor: pointer; }
.rule-summary--scope .rule-summary__empty { min-width: 0; }
.rule-summary__popover--scope { --performance-rule-summary-max-width: var(--performance-calibration-scope-max-width); }
.rule-summary__details--scope { max-height: var(--performance-calibration-scope-max-height); }
.rule-summary__details--scope .rule-summary__title { margin: var(--performance-calibration-scope-title-margin-top) 0 var(--performance-calibration-scope-title-margin-bottom); font-size: var(--performance-calibration-scope-title-font-size); font-weight: var(--performance-calibration-scope-title-font-weight); line-height: var(--performance-calibration-scope-title-line-height); }
.rule-summary__details--scope .rule-summary__condition { gap: var(--performance-calibration-scope-condition-gap); }
.rule-summary__details--scope .rule-summary__operator { line-height: var(--performance-calibration-scope-field-height); }
.rule-summary__details--scope .rule-summary__field { box-sizing: border-box; height: var(--performance-calibration-scope-field-height); min-height: var(--performance-calibration-scope-field-height); padding: var(--performance-calibration-scope-field-padding-y) var(--performance-calibration-scope-field-padding-x); }
.rule-summary__details--scope .rule-summary__person { height: var(--performance-calibration-scope-person-height); min-height: var(--performance-calibration-scope-person-height); padding: 0 var(--performance-calibration-scope-person-padding-right) 0 var(--performance-calibration-scope-person-padding-left); }
.rule-summary__details--scope .rule-summary__person :deep(.performance-select-shell__tag-content) { max-width: var(--performance-calibration-scope-person-name-max-width); white-space: nowrap; }
.rule-summary__details--scope .rule-summary__person :deep(.performance-select-shell__tag-avatar) { width: var(--performance-calibration-scope-avatar-size); height: var(--performance-calibration-scope-avatar-size); flex-basis: var(--performance-calibration-scope-avatar-size); margin-right: var(--performance-calibration-scope-person-gap); }
</style>
