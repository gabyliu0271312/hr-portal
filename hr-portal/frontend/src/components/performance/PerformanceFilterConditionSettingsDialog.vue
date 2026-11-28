<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    title="筛选条件顺序和默认条件设置"
    width="var(--performance-dialog-wide-width)"
    :loading="saving"
    dialog-class="filter-condition-dialog"
    overlay-class="filter-condition-dialog-overlay"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="filter-condition-dialog__content">
      <div class="filter-condition-dialog__sticky">
        <div class="filter-condition-dialog__header">
          <div class="filter-condition-dialog__name">名称</div>
          <div class="filter-condition-dialog__default">默认条件（{{ defaultCount }}）</div>
        </div>
      </div>
      <p v-if="error" class="filter-condition-dialog__error" role="alert">{{ error }}</p>
      <UiSortableList :items="draft" item-key="filter_key" :disabled="saving" @reorder="reorder">
        <template #default="{ item, index, dragging, itemStyle }">
          <PerformanceFilterConditionRow
            :item="item"
            :index="index"
            :dragging="dragging"
            :disabled="saving"
            :item-style="itemStyle"
            @toggle="toggle(index, $event)"
          />
        </template>
      </UiSortableList>
    </div>
    <template #footer>
      <div class="filter-condition-dialog__actions">
        <UiButton :disabled="saving" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" :loading="saving" @click="submit">确定</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFilterConditionRow from './PerformanceFilterConditionRow.vue'
import UiButton from '../ui/UiButton.vue'
import UiSortableList from '../ui/UiSortableList.vue'
import type { PerformanceFilterCondition } from './performanceFieldSettings'
import type { PerformanceFilterConditionUpdate } from '@/api/performanceFieldSettings'

const props = defineProps<{
  modelValue: boolean
  value: PerformanceFilterCondition[]
  saving: boolean
  error?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [items: PerformanceFilterConditionUpdate[]]
}>()

const draft = ref<PerformanceFilterCondition[]>([])
const defaultCount = computed(() => draft.value.filter(item => item.default).length)

watch(() => props.modelValue, open => {
  if (open) draft.value = props.value.map(item => ({ ...item }))
}, { immediate: true })

function toggle(index: number, value: boolean) {
  const item = draft.value[index]
  if (!item || props.saving || item.disable_set_default) return
  item.default = value
}

function reorder(from: number, to: number) {
  if (props.saving || from === to) return
  const next = draft.value.slice()
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(to, 0, moved)
  draft.value = next
}

function submit() {
  if (props.saving) return
  emit('save', draft.value.map(({ filter_key, default: isDefault }) => ({ filter_key, default: isDefault })))
}
</script>

<style scoped>
.filter-condition-dialog__sticky { position: sticky; top: 0; z-index: 100; padding-top: var(--performance-settings-list-header-padding-top); background: var(--color-bg-card); }
.filter-condition-dialog__header { display: flex; padding-bottom: var(--spacing-2); color: var(--performance-settings-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.filter-condition-dialog__name { flex: 1; min-width: 0; padding-left: var(--performance-settings-list-header-indent); }
.filter-condition-dialog__default { flex: 0 0 var(--performance-settings-list-default-header-width); width: var(--performance-settings-list-default-header-width); }
.filter-condition-dialog__error { margin: 0 0 var(--spacing-2); color: var(--performance-field-error-color); font-size: var(--performance-field-error-font-size); line-height: var(--performance-field-error-line-height); }
.filter-condition-dialog__actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-button-gap); }
.filter-condition-dialog__actions :deep(.performance-button) { min-width: var(--performance-dialog-footer-button-min-width); }
</style>

<style>
.filter-condition-dialog-overlay { width: 100vw; }
.filter-condition-dialog .performance-dialog__body { box-shadow: 0 1px 0 0 var(--performance-settings-list-divider); }
.filter-condition-dialog .performance-dialog__body::-webkit-scrollbar { width: var(--performance-settings-list-scrollbar-size); height: var(--performance-settings-list-scrollbar-size); }
</style>
