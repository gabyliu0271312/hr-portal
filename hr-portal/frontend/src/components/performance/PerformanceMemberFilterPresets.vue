<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { projectManagementApi, type PerformanceMemberFilters, type PerformanceMemberFilterPreset } from '@/api/performance'
import PerformancePopover from './PerformancePopover.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceSymbol from './PerformanceSymbol.vue'
import DownOutlinedIcon from './DownOutlinedIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{ cycleId: number; contextKey: string; visible: boolean; filters: PerformanceMemberFilters; disabled?: boolean }>()
const emit = defineEmits<{ select: [filters: PerformanceMemberFilters] }>()
const items = ref<PerformanceMemberFilterPreset[]>([])
const mode = ref<'list' | 'save' | null>(null)
const anchor = ref<HTMLElement | null>(null)
const name = ref('')
const error = ref('')
const loading = ref(false)
const saving = ref(false)
const removing = ref<number | null>(null)
let sequence = 0
async function load() {
  const request = ++sequence
  loading.value = true
  error.value = ''
  try {
    const result = await projectManagementApi.cycleMemberFilterPresets(props.cycleId)
    if (request === sequence) items.value = result.items
  } catch { if (request === sequence) error.value = '已存条件加载失败，请重试' }
  finally { if (request === sequence) loading.value = false }
}
watch(() => [props.cycleId, props.contextKey], () => { items.value = []; mode.value = null; saving.value = false; void load() }, { immediate: true })
watch(() => props.visible, visible => { if (!visible) { mode.value = null; removing.value = null; name.value = '' } })
onBeforeUnmount(() => { ++sequence })
function open(next: 'list' | 'save', event: MouseEvent) {
  anchor.value = event.currentTarget as HTMLElement
  mode.value = mode.value === next ? null : next
  removing.value = null
  name.value = ''
  error.value = ''
}
async function save() {
  if (saving.value) return
  if (!name.value.trim()) { error.value = '此项为必填'; return }
  if (name.value.length > 500) { error.value = '最多输入500个字符'; return }
  const request = sequence
  saving.value = true
  error.value = ''
  try {
    const item = await projectManagementApi.saveCycleMemberFilterPreset(props.cycleId, name.value, props.filters)
    if (request !== sequence) return
    items.value = [item, ...items.value.filter(existing => existing.id !== item.id)]
    mode.value = null
    name.value = ''
  } catch (cause: any) {
    if (request === sequence) error.value = cause?.response?.status === 409 ? '名称已存在' : '保存失败，请重试'
  } finally { if (request === sequence) saving.value = false }
}
async function remove(id: number) {
  const request = sequence
  saving.value = true
  error.value = ''
  try {
    await projectManagementApi.deleteCycleMemberFilterPreset(props.cycleId, id)
    if (request !== sequence) return
    items.value = items.value.filter(item => item.id !== id)
    removing.value = null
    if (!items.value.length) mode.value = null
  } catch { if (request === sequence) error.value = '删除失败，请重试' }
  finally { if (request === sequence) saving.value = false }
}
function select(item: PerformanceMemberFilterPreset) {
  emit('select', { logic: item.filters.logic, conditions: item.filters.conditions.map(condition => ({ ...condition, values: [...condition.values] })) })
  mode.value = null
}
</script>

<template>
  <div class="member-filter-presets">
    <UiButton size="small" :disabled="loading || !items.length" :aria-expanded="mode === 'list'" @click="open('list', $event)">已存条件 ({{ items.length }})<DownOutlinedIcon class="member-filter-presets__arrow" :class="{ 'is-expanded': mode === 'list' }" /></UiButton>
    <UiButton size="small" :disabled="disabled || !filters.conditions.length" @click="open('save', $event)"><PerformanceSymbol name="FilelinkSaveOutlined" class="member-filter-presets__save-icon" />保存条件</UiButton>
    <UiButton v-if="error && !mode" size="small" variant="text" @click="load">重试已存条件</UiButton>
    <PerformancePopover :visible="visible && mode !== null" :anchor="anchor" :width="mode === 'save' ? 'var(--performance-member-filter-save-width)' : 'var(--performance-member-filter-value-width)'" align="end" side="bottom" role="dialog" name="member-filter-presets-layer" data-member-filter-layer :show-arrow="false" @close="mode = null">
      <div v-if="mode === 'save'" class="member-filter-presets__save">
        <label for="member-filter-preset-name">筛选条件名称<span class="member-filter-presets__required" aria-hidden="true"> *</span></label>
        <input id="member-filter-preset-name" v-model="name" class="member-filter-presets__input" aria-label="筛选条件名称" :aria-invalid="!!error" maxlength="500" @input="error = ''" @keydown.enter.prevent="save" />
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="member-filter-presets__actions"><UiButton size="small" :disabled="saving" @click="mode = null">取消</UiButton><UiButton size="small" variant="primary" :loading="saving" @click="save">保存</UiButton></div>
      </div>
      <div v-else class="member-filter-presets__list">
        <div v-for="item in items" :key="item.id" class="member-filter-presets__item">
          <UiButton variant="text" :disabled="saving" class="member-filter-presets__name" @click="select(item)">{{ item.name }}</UiButton>
          <PerformanceIconButton icon="DeleteTrashOutlined" :label="`删除已存条件${item.name}`" :disabled="saving" @click="removing = item.id" />
          <div v-if="removing === item.id" class="member-filter-presets__confirm" role="alertdialog" aria-label="确认删除筛选条件">
            <span>确认删除该筛选条件吗？</span>
            <div class="member-filter-presets__actions"><UiButton size="small" :disabled="saving" @click="removing = null">保留</UiButton><UiButton size="small" variant="primary" :loading="saving" @click="remove(item.id)">删除</UiButton></div>
          </div>
        </div>
        <p v-if="error" role="alert">{{ error }}</p>
      </div>
    </PerformancePopover>
  </div>
</template>

<style scoped>
.member-filter-presets{display:flex;align-items:center;gap:var(--spacing-2);margin-left:auto}
.member-filter-presets__save-icon{margin-right:var(--spacing-2)}
.member-filter-presets__arrow{width:var(--font-size-xs);height:var(--font-size-xs);margin-left:var(--spacing-2);transition:transform var(--duration-base) var(--ease-standard)}
.member-filter-presets__arrow.is-expanded{transform:rotate(180deg)}
.member-filter-presets__save{display:flex;flex-direction:column;gap:var(--spacing-2)}
.member-filter-presets__required,.member-filter-presets p{color:var(--color-danger)}
.member-filter-presets p{margin:0}
.member-filter-presets__input{box-sizing:border-box;width:100%;height:var(--performance-member-filter-control-height);border:var(--performance-popover-border-width) solid var(--performance-field-border);border-radius:var(--performance-control-radius);padding:0 var(--spacing-3);background:var(--color-bg-card);color:var(--color-text-primary);font:inherit}
.member-filter-presets__input:focus{outline:none;border-color:var(--performance-field-border-focus)}
.member-filter-presets__actions{display:flex;justify-content:flex-end;gap:var(--spacing-2)}
.member-filter-presets__list{display:flex;flex-direction:column}
.member-filter-presets__item{display:flex;align-items:center;flex-wrap:wrap;gap:var(--spacing-2)}
.member-filter-presets__name{flex:1;justify-content:flex-start;min-width:0;white-space:normal;text-align:left;overflow-wrap:anywhere}
.member-filter-presets__confirm{display:flex;flex-direction:column;width:100%;gap:var(--spacing-3);padding:var(--spacing-3);border:var(--performance-popover-border-width) solid var(--performance-popover-border);border-radius:var(--performance-control-radius)}
</style>
