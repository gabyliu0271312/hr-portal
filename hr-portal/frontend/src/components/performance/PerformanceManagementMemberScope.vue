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
  if (!checked && !(kind === 'period' ? current.value : period.value)) return
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
async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    panel.value?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus()
  }
}
function outside(event: MouseEvent) {
  if (!trigger.value?.contains(event.target as Node) && !panel.value?.contains(event.target as Node)) close()
}
onMounted(() => document.addEventListener('mousedown', outside))
onBeforeUnmount(() => document.removeEventListener('mousedown', outside))
</script>

<template>
  <button ref="trigger" type="button" class="management-member-scope-trigger" aria-haspopup="dialog" :aria-expanded="open" @click="toggle" @keydown.down.prevent="open || toggle()">成员范围：{{ label }} <span aria-hidden="true">⌄</span></button>
  <PerformancePopover :visible="open" :anchor="trigger" width="auto" role="dialog" name="management-member-scope" aria-label="成员范围" @close="close(true)">
    <div ref="panel" class="management-member-scope-options" @keydown.esc.stop.prevent="close(true)">
      <PerformanceCheckbox :model-value="period" label="本周期我负责的人员" :disabled="period && !current" @update:model-value="change('period', $event)" />
      <PerformanceCheckbox :model-value="current" label="当前我负责的人员" :disabled="current && !period" @update:model-value="change('current', $event)" />
      <div class="management-member-scope-all"><PerformanceCheckbox :model-value="all" :indeterminate="!all" label="全选" @update:model-value="selectAll" /></div>
    </div>
  </PerformancePopover>
</template>

<style scoped>
.management-member-scope-trigger { display: inline-flex; align-items: center; gap: var(--spacing-2); padding: var(--spacing-2); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-secondary); font: inherit; cursor: pointer; }
.management-member-scope-trigger:hover { background: var(--color-bg-hover); }
.management-member-scope-trigger:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.management-member-scope-options { display: grid; gap: var(--spacing-3); }
.management-member-scope-all { padding-top: var(--spacing-3); border-top: 1px solid var(--color-border); }
</style>
