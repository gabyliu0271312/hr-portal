<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { performanceCycleApi, type PerformanceCycle } from '@/api/performance'
import { utcToShanghaiLocal } from '@/utils/datetime'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import UiButton from '../ui/UiButton.vue'

const props = defineProps<{ modelValue: boolean; sourceCycle: PerformanceCycle | null; loading?: boolean; loadError?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; confirm: [cycle: PerformanceCycle]; 'create-cycle': [] }>()
const cycles = ref<PerformanceCycle[]>([])
const selectedId = ref<string | null>(null)
const loadingCycles = ref(false)
const error = ref('')
let requestVersion = 0
const options = computed(() => cycles.value.map(cycle => ({ value: String(cycle.id), label: cycle.name, subLabel: `${utcToShanghaiLocal(cycle.start_at)?.slice(0, 10) || ''} - ${utcToShanghaiLocal(cycle.end_at)?.slice(0, 10) || ''}` })))
const selected = computed(() => cycles.value.find(cycle => String(cycle.id) === selectedId.value))
async function loadCycles() {
  const version = ++requestVersion
  loadingCycles.value = true
  error.value = ''
  try {
    const items: PerformanceCycle[] = []
    let page = 1
    let total = 0
    do {
      const result = await performanceCycleApi.list('', page, 100)
      if (version !== requestVersion) return
      items.push(...result.items)
      total = result.total
      if (!result.items.length) break
      page += 1
    } while (items.length < total)
    cycles.value = items
    if (!selected.value) selectedId.value = null
  } catch {
    if (version === requestVersion) error.value = '周期加载失败，请重试'
  } finally {
    if (version === requestVersion) loadingCycles.value = false
  }
}
watch(() => props.modelValue, open => {
  requestVersion += 1
  if (!open) return
  cycles.value = props.sourceCycle ? [props.sourceCycle] : []
  selectedId.value = props.sourceCycle ? String(props.sourceCycle.id) : null
  void loadCycles()
}, { immediate: true })
</script>

<template>
  <PerformanceDialogShell :model-value="modelValue" title="复制项目" dialog-class="project-copy-dialog" :loading="loading" @update:model-value="emit('update:modelValue', $event)">
    <PerformanceSearchSelect v-model="selectedId" :options="options" selection-style="plain" option-layout="detailed" aria-label="目标周期" :disabled="loadingCycles || loading" :empty-text="loadingCycles ? '正在加载周期...' : '暂无可选周期'">
      <template #footer="{ close }"><UiButton variant="text" :disabled="loading" @click="close(); emit('create-cycle')">＋ 新建</UiButton></template>
    </PerformanceSearchSelect>
    <p v-if="loadingCycles" class="project-copy-dialog__status" role="status">正在加载周期...</p>
    <p v-if="loadError" class="project-copy-dialog__error" role="alert">{{ loadError }}</p>
    <p v-if="error" class="project-copy-dialog__error" role="alert">{{ error }} <UiButton variant="link" @click="loadCycles">重试</UiButton></p>
    <template #footer>
      <div class="project-copy-dialog__actions">
        <UiButton :disabled="loading" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" :loading="loading" :disabled="loadingCycles || Boolean(error) || !selected" @click="selected && emit('confirm', selected)">确定</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.project-copy-dialog__actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-button-gap); }
.project-copy-dialog__status, .project-copy-dialog__error { margin: var(--performance-field-error-gap) 0 0; font-size: var(--font-size-md); line-height: var(--performance-input-line-height); color: var(--color-text-secondary); }
.project-copy-dialog__error { color: var(--performance-field-error-color); }
</style>
