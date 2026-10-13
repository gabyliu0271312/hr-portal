<template>
  <PerformanceDrawerShell v-model="open" title="自定义列" @close="cancel">
    <div class="column-drawer__side column-drawer__available">
      <h3>列表项</h3>
      <label v-for="column in columns" :key="column.key" class="column-option" :class="{ locked: column.locked }">
        <input type="checkbox" :checked="draftKeys.includes(column.key)" :disabled="column.locked" @change="toggle(column.key)" />
        <span class="column-option__checkbox" aria-hidden="true"><svg v-if="draftKeys.includes(column.key)" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z" fill="currentColor" /></svg></span>
        <span>{{ column.label }}</span>
      </label>
    </div>
    <div class="column-drawer__side column-drawer__selected">
      <h3>已选：{{ draftKeys.length }}</h3>
      <div v-if="lockedColumn" class="selected-column locked"><div class="selected-column__text"><PerformanceIconButton icon="LockOutlined" label="锁定列" static /><span>{{ lockedColumn.label }}</span></div></div>
      <PerformanceSortableList :items="draftColumns.filter(column => !column.locked)" item-key="key" :disabled="false" @reorder="reorder">
        <template #default="{ item, index, dragging, itemStyle }">
          <div class="selected-column" :data-sortable-index="index" :style="itemStyle">
            <div class="selected-column__text"><PerformanceDragHandle :label="`拖拽排序${item.label}`" :dragging="dragging" variant="compact" /><span>{{ item.label }}</span></div>
            <PerformanceRemoveButton :label="`移除${item.label}`" @click="toggle(item.key)" />
          </div>
        </template>
      </PerformanceSortableList>
    </div>
    <template #footer><PerformanceDrawerFooter @confirm="confirm" @cancel="cancel" /></template>
  </PerformanceDrawerShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PerformanceDrawerFooter from './PerformanceDrawerFooter.vue'
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'
import PerformanceDragHandle from './PerformanceDragHandle.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceRemoveButton from './PerformanceRemoveButton.vue'
import PerformanceSortableList from './PerformanceSortableList.vue'

export type PerformanceColumnOption = { key: string; label: string; locked?: boolean }
const props = defineProps<{ modelValue: boolean; columns: PerformanceColumnOption[]; selectedKeys: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; confirm: [keys: string[]] }>()
const draftKeys = ref<string[]>([])
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
watch(() => props.modelValue, value => { if (value) draftKeys.value = [...props.selectedKeys] })
const columnByKey = (key: string) => props.columns.find(column => column.key === key)
const lockedColumn = computed(() => props.columns.find(column => column.locked) || null)
const draftColumns = computed(() => draftKeys.value.map(key => columnByKey(key)).filter((column): column is PerformanceColumnOption => Boolean(column)))
function toggle(key: string) { const column = columnByKey(key); if (!column || column.locked) return; draftKeys.value = draftKeys.value.includes(key) ? draftKeys.value.filter(item => item !== key) : [...draftKeys.value, key] }
function reorder(from: number, to: number) { const movable = draftKeys.value.filter(key => !columnByKey(key)?.locked); const [moved] = movable.splice(from, 1); movable.splice(to, 0, moved); draftKeys.value = [...draftKeys.value.filter(key => columnByKey(key)?.locked), ...movable] }
function cancel() { emit('update:modelValue', false) }
function confirm() { emit('confirm', [...draftKeys.value]); emit('update:modelValue', false) }
</script>

<style scoped>
.column-drawer__side{flex:0 0 50%;min-width:0;padding:16px 24px;box-sizing:border-box;overflow:auto}.column-drawer__available{border-right:1px solid #dee0e3}.column-drawer__side h3{margin:0 0 8px;color:#8f959e;font:600 14px/22px inherit}.column-option{display:flex;position:relative;align-items:center;min-height:38px;padding:8px 0;box-sizing:border-box;color:#1f2329;cursor:pointer;font:400 14px/22px inherit}.column-option input{position:absolute;width:16px;height:16px;margin:0;opacity:0}.column-option__checkbox{display:grid;place-items:center;flex:0 0 16px;width:16px;height:16px;box-sizing:border-box;border:1px solid #8f959e;border-radius:4px;background:#fff;color:#fff}.column-option input:checked + .column-option__checkbox{border-color:#1456f0;background:#1456f0}.column-option span:last-child{min-width:0;margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.column-option.locked{color:#bbbfc4;cursor:not-allowed}.column-option.locked .column-option__checkbox{border-color:#bbbfc4;background:#bbbfc4;color:#eff0f1}.selected-column{display:flex;align-items:center;justify-content:space-between;min-height:38px;color:#1f2329;cursor:grab;font:400 14px/21px inherit}.selected-column__text{display:flex;align-items:center;min-width:0;overflow:hidden}.selected-column__text span:last-child{margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.selected-column__text :deep(.performance-icon-button){flex:0 0 16px;width:16px;height:24px;padding:0;color:#646a73}.selected-column__text :deep(.performance-drag-handle){margin-right:0}.selected-column__text > span:last-child{margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.selected-column.locked{cursor:default}
</style>
