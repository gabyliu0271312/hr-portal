<script setup lang="ts">
import { computed, watch } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'

export type IngestionMode = 'current_snapshot' | 'incremental_upsert' | 'append' | 'period_full_snapshot'

const props = withDefaults(defineProps<{
  modelValue?: IngestionMode | null
  isPeriod?: boolean
  periodLabel?: string | null
  keyLabels?: string[]
  disabled?: boolean
}>(), { modelValue: null, isPeriod: false, periodLabel: null, keyLabels: () => [], disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: IngestionMode | null] }>()

const options = [
  { value: 'current_snapshot', label: '全量同步', description: '每次输入代表当前完整状态：同一业务主键更新或新增；未出现的历史记录按资产规则处理。适用于员工花名册、组织等当前状态数据。' },
  { value: 'incremental_upsert', label: '增量变更', description: '每次仅输入新增或变更记录：同一业务主键更新或新增，不清理未出现的旧记录。' },
  { value: 'append', label: '流水追加', description: '每次只新增记录，不更新或删除已有历史数据。适用于日志、审批和事件流水。' },
  { value: 'period_full_snapshot', label: '期间覆盖', description: '仅覆盖本次期间：按完整业务主键更新或新增，并清理该期间未出现的记录；历史期间保持不变。适用于薪资、社保、考勤、月度分摊等。' },
] as const
const isLockedPeriodMode = computed(() => props.isPeriod)
const selected = computed(() => options.find(option => option.value === props.modelValue))
const visibleOptions = computed(() => props.isPeriod ? options.filter(option => option.value === 'period_full_snapshot') : options.filter(option => option.value !== 'period_full_snapshot'))

watch(() => props.isPeriod, (isPeriod) => {
  if (isPeriod && props.modelValue !== 'period_full_snapshot') emit('update:modelValue', 'period_full_snapshot')
}, { immediate: true })
</script>

<template>
  <el-form-item label="入仓方式">
    <div class="ingestion-mode-row">
      <el-select :model-value="modelValue" placeholder="选择入仓方式" :disabled="disabled || isLockedPeriodMode" style="width:100%" @update:model-value="emit('update:modelValue', $event)">
        <el-option v-for="option in visibleOptions" :key="option.value" :label="option.label" :value="option.value">
          <span>{{ option.label }}</span>
        </el-option>
      </el-select>
      <el-tooltip v-if="selected" :content="selected.description" placement="top" :show-after="200">
        <el-icon class="mode-info"><InfoFilled /></el-icon>
      </el-tooltip>
    </div>
    <div v-if="modelValue === 'period_full_snapshot'" class="mode-meta">
      <div>期间字段：{{ periodLabel || '待配置' }}</div>
      <div>业务主键：{{ keyLabels.length ? keyLabels.join(' + ') : '请先在字段管理中标记' }}</div>
      <div>期间字段与业务主键来自资产字段定义；月度资产固定使用期间覆盖。</div>
    </div>
  </el-form-item>
</template>

<style scoped>
.ingestion-mode-row { display:flex; align-items:center; gap:8px; width:100%; }
.mode-info { color:#909399; cursor:help; flex:none; font-size:16px; }
.mode-meta { margin-top:6px; color:#909399; font-size:12px; line-height:1.7; }
.option-note { float:right; color:#909399; font-size:12px; }
</style>
