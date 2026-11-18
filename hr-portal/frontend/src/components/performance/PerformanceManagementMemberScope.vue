<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import PerformancePopover from './PerformancePopover.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'

const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)
const period = ref(true)
const current = ref(false)
const all = computed(() => period.value && current.value)
const label = computed(() => all.value ? '全部' : period.value ? '本周期我负责的人员' : '当前我负责的人员')
function change(kind: 'period' | 'current', checked: boolean) {
  if (!checked && !(kind === 'period' ? current.value : period.value)) {
    void nextTick(() => {
      const input = panel.value?.querySelectorAll<HTMLInputElement>('input')[kind === 'period' ? 0 : 1]
      if (input) input.checked = true
    })
    return
  }
  if (kind === 'period') period.value = checked
  else current.value = checked
}
function selectAll(checked: boolean) {
  period.value = true
  current.value = checked
}
function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}
async function toggle(focusOption = false) {
  open.value = !open.value
  if (open.value && focusOption) {
    await nextTick()
    panel.value?.querySelector<HTMLInputElement>('input')?.focus()
  }
}
function outside(event: MouseEvent) {
  if (!trigger.value?.contains(event.target as Node) && !panel.value?.contains(event.target as Node)) close()
}
onMounted(() => document.addEventListener('mousedown', outside))
onBeforeUnmount(() => document.removeEventListener('mousedown', outside))
</script>

<template>
  <button ref="trigger" type="button" class="management-member-scope-trigger" :class="{ 'is-open': open }" aria-haspopup="dialog" :aria-expanded="open" @click="toggle()" @keydown.down.prevent="open || toggle(true)">
    <span class="management-member-scope-text">成员范围：{{ label }}</span>
    <svg class="management-member-scope-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="DownBoldOutlined"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor" /></svg>
  </button>
  <PerformancePopover :visible="open" :anchor="trigger" width="var(--performance-member-scope-width)" :gap="4" :viewport-margin="8" align="end" side="bottom" :show-arrow="false" role="dialog" name="management-member-scope" aria-label="成员范围" @close="close(true)">
    <div ref="panel" class="management-member-scope-options" @keydown.esc.stop.prevent="close(true)">
      <div class="management-member-scope-list">
        <div class="management-member-scope-row" @click="change('period', !period)">
          <PerformanceCheckbox :model-value="period" label="本周期我负责的人员" hide-label checked-color="var(--ui-checkbox-checked)" @click.stop @update:model-value="change('period', $event)" />
          <span>本周期我负责的人员</span>
        </div>
        <div class="management-member-scope-row" @click="change('current', !current)">
          <PerformanceCheckbox :model-value="current" label="当前我负责的人员" hide-label checked-color="var(--ui-checkbox-checked)" @click.stop @update:model-value="change('current', $event)" />
          <span>当前我负责的人员</span>
        </div>
      </div>
      <div class="management-member-scope-divider" />
      <div class="management-member-scope-all" @click="selectAll(!all)">
        <PerformanceCheckbox :model-value="all" :indeterminate="!all" label="全选" hide-label checked-color="var(--ui-checkbox-checked)" @click.stop @update:model-value="selectAll" />
        <span>全选</span>
      </div>
    </div>
  </PerformancePopover>
</template>

<style scoped>
.management-member-scope-trigger { display: inline-flex; align-items: center; box-sizing: border-box; height: var(--performance-member-scope-height); max-width: 100%; padding: 0 var(--performance-member-scope-padding-inline); border: 1px solid var(--performance-member-scope-border); border-radius: var(--radius-md); background: var(--color-bg-card); color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-member-scope-line-height) var(--performance-member-scope-font); cursor: pointer; }
.management-member-scope-trigger:hover, .management-member-scope-trigger.is-open { border-color: var(--performance-member-scope-border-hover); }
.management-member-scope-trigger:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.management-member-scope-text { min-width: 0; overflow: hidden; padding-block: var(--performance-member-scope-gap); margin-right: var(--performance-member-scope-gap); text-overflow: ellipsis; white-space: nowrap; }
.management-member-scope-chevron { flex: none; width: var(--performance-member-scope-arrow-size); height: var(--performance-member-scope-arrow-size); color: var(--color-text-secondary); }
.management-member-scope-options { color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--input-line-height) var(--performance-member-scope-font); }
.management-member-scope-list { display: flex; flex-direction: column; padding-block: 2px; }
.management-member-scope-row { display: flex; align-items: center; box-sizing: border-box; height: var(--performance-member-scope-row-height); padding: var(--performance-member-scope-row-padding); margin: var(--performance-member-scope-row-margin); border-radius: var(--radius-sm); gap: var(--performance-member-scope-label-gap); cursor: pointer; white-space: nowrap; }
.management-member-scope-row:hover, .management-member-scope-row:focus-within { background: var(--performance-select-option-hover); }
.management-member-scope-row :deep(.performance-checkbox), .management-member-scope-all :deep(.performance-checkbox) { flex: 0 0 var(--performance-checkbox-size); width: var(--performance-checkbox-size); }
.management-member-scope-options :deep(.ud__checkbox__wallpaper) { border-width: 1px; }
.management-member-scope-options :deep(.ud__checkbox__indeterminate-svg) { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
.management-member-scope-options :deep(.ud__checkbox__input:focus-visible + .ud__checkbox__wallpaper) { outline: 2px solid var(--ui-checkbox-hover); outline-offset: 2px; }
.management-member-scope-divider { height: 1px; background: var(--performance-popover-border); }
.management-member-scope-all { display: flex; align-items: center; gap: var(--performance-field-label-gap); padding: var(--performance-member-scope-gap) var(--performance-member-scope-padding-inline); cursor: pointer; }
</style>

<style>
.management-member-scope { --performance-popover-padding-y: 0px; --performance-popover-padding-x: 0px; --performance-popover-shadow: var(--performance-member-scope-shadow); }
.management-member-scope:hover { --performance-popover-shadow: var(--performance-member-scope-shadow-hover); }
</style>
