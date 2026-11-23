<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceCycleApi, type PerformanceWorkbenchVisibilityRole } from '@/api/performance'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'

withDefaults(defineProps<{ disabled?: boolean; cycleError?: string; roleError?: string }>(), { disabled: false, cycleError: '', roleError: '' })
const cycleScope = defineModel<string>('cycleScope', { required: true })
const cycleRef = defineModel<string | null>('cycleRef', { required: true })
const visibility = defineModel<string>('visibility', { required: true })
const roles = defineModel<PerformanceWorkbenchVisibilityRole[]>('roles', { required: true })
const cycleOptions = [{ value: '所有周期', label: '所有周期' }, { value: '指定周期', label: '指定周期' }]
const visibilityOptions = [{ value: '所有人', label: '所有人' }, { value: '指定角色', label: '指定角色' }]
const roleOptions = [{ value: 'HRBP', label: '管理范围内有人参评的 HRBP' }, { value: 'REAL_LINE_MANAGER', label: '管理范围内有人参评的实线上级' }]
const cycles = ref<PerformanceSearchSelectOption[]>([])
const cycleLoading = ref(false)
async function loadCycles() {
  if (cycleLoading.value || cycles.value.length) return
  cycleLoading.value = true
  try {
    const result = await performanceCycleApi.list(undefined, 1, 100)
    cycles.value = result.items.map(cycle => ({ value: cycle.cycle_ref, label: cycle.name }))
  } catch { ElMessage.error('周期列表加载失败，请重新打开选择器重试') }
  finally { cycleLoading.value = false }
}
function updateCycle(value: string | string[] | null) { cycleRef.value = typeof value === 'string' ? value : null }
function updateRoles(value: string | string[] | null) { roles.value = (Array.isArray(value) ? value : []) as PerformanceWorkbenchVisibilityRole[] }
</script>

<template>
  <div class="announcement-scope">
    <div class="announcement-scope__label"><PerformanceRequiredLabel label="展示周期" /></div>
    <PerformanceRadioGroup v-model="cycleScope" name="workbench-cycle-scope" aria-label="展示周期" :options="cycleOptions" direction="vertical" :gap="8" :disabled="disabled" />
    <PerformanceSearchSelect v-if="cycleScope === '指定周期'" class="announcement-scope__select" :model-value="cycleRef" aria-label="指定周期" :options="cycles" :loading="cycleLoading" :disabled="disabled" @update:model-value="updateCycle" @open="loadCycles" />
    <p v-if="cycleError" role="alert">{{ cycleError }}</p>
  </div>
  <div class="announcement-scope">
    <div class="announcement-scope__label"><PerformanceRequiredLabel label="可见范围" /></div>
    <PerformanceRadioGroup v-model="visibility" name="workbench-visibility-scope" aria-label="可见范围" :options="visibilityOptions" direction="vertical" :gap="8" :disabled="disabled" />
    <PerformanceSearchSelect v-if="visibility === '指定角色'" class="announcement-scope__select" :model-value="roles" aria-label="指定角色" :options="roleOptions" multiple :disabled="disabled" @update:model-value="updateRoles" />
    <p v-if="roleError" role="alert">{{ roleError }}</p>
  </div>
</template>

<style scoped>
.announcement-scope { margin-bottom: var(--performance-workbench-editor-field-gap); }
.announcement-scope__label { margin-bottom: var(--spacing-2); font-weight: 600; line-height: 22px; }
.announcement-scope__select { --performance-select-tag-height: var(--performance-announcement-role-tag-height); margin-top: var(--spacing-1); margin-left: var(--performance-workbench-editor-select-indent); width: calc(100% - var(--performance-workbench-editor-select-indent)); }
.announcement-scope p { margin: 4px 0 0; color: var(--color-text-danger-strong); font-size: var(--font-size-sm); }
</style>
