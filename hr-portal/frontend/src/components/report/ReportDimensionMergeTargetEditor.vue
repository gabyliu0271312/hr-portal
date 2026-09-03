<script setup lang="ts">
import { computed, watch } from 'vue'
import type { ColumnInfo } from '@/api/data'
import type {
  DimensionMergeTarget,
  DimensionMergeTargetMode,
  DimensionMergeTuple,
  DimensionMergeValue,
} from '@/api/reports'

type DimensionColumn = ColumnInfo & { _instance_id?: string }

const props = defineProps<{
  modelValue: DimensionMergeTarget
  dimensions: DimensionColumn[]
  sources: DimensionMergeTuple[]
  expandBy?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DimensionMergeTarget]
}>()

function idOf(column: DimensionColumn) {
  return column._instance_id || column.code
}

function valueKey(value: DimensionMergeValue) {
  return `${value === null ? 'null' : typeof value}:${String(value)}`
}

function valueLabel(value: DimensionMergeValue) {
  if (value === null) return '（NULL）'
  if (value === '') return '（空字符串）'
  if (typeof value === 'string' && value.trim() === '') return '（空白文本）'
  if (typeof value === 'string' && value === '0') return '"0"'
  return String(value)
}

function sourceValues(field: string) {
  const values = props.sources.map((item) => item.values[field] ?? null)
  return values.filter((value, index) => values.findIndex((item) => valueKey(item) === valueKey(value)) === index)
}

function patch(field: string, changes: { mode?: DimensionMergeTargetMode; value?: DimensionMergeValue }) {
  const next: DimensionMergeTarget = {
    values: { ...props.modelValue.values },
    modes: { ...props.modelValue.modes },
  }
  if (changes.mode) next.modes[field] = changes.mode
  if ('value' in changes) next.values[field] = changes.value ?? null
  emit('update:modelValue', next)
}

function changeMode(field: string, mode: DimensionMergeTargetMode) {
  if (props.expandBy?.includes(field)) {
    patch(field, { mode: 'preserve' })
    return
  }
  const values = sourceValues(field)
  if (mode === 'auto' && values.length === 1) patch(field, { mode, value: values[0] })
  else if (mode === 'source') patch(field, { mode, value: values[0] ?? null })
  else patch(field, { mode, value: props.modelValue.values[field] ?? '' })
}

const invalidFields = computed(() => props.dimensions
  .map(idOf)
  .filter((field) => {
    const mode = props.modelValue.modes[field]
    const value = props.modelValue.values[field]
    if (mode === 'auto') return sourceValues(field).length !== 1
    if (mode === 'source') return !sourceValues(field).some((item) => valueKey(item) === valueKey(value))
    if (mode === 'preserve') return false
    return value === null || (typeof value === 'string' && !value.trim())
  }))

watch(
  () => props.sources,
  () => {
    const next: DimensionMergeTarget = {
      values: { ...props.modelValue.values },
      modes: { ...props.modelValue.modes },
    }
    let changed = false
    for (const column of props.dimensions) {
      const field = idOf(column)
      const values = sourceValues(field)
      const currentValue = next.values[field]
      if (props.expandBy?.includes(field)) {
        if (next.modes[field] !== 'preserve') {
          next.modes[field] = 'preserve'
          delete next.values[field]
          changed = true
        }
        continue
      }
      const emptyCustom = next.modes[field] === 'custom'
        && (currentValue === null || (typeof currentValue === 'string' && !currentValue.trim()))
      if ((!next.modes[field] || emptyCustom) && values.length === 1) {
        next.modes[field] = 'auto'
        next.values[field] = values[0]
        changed = true
      }
    }
    if (changed) emit('update:modelValue', next)
  },
  { deep: true, immediate: true },
)

defineExpose({ invalidFields })
</script>

<template>
  <section class="target-editor">
    <div class="target-head">
      <strong>归并后完整组合</strong>
      <span>所有维度都必须产生明确且同类型的结果值</span>
    </div>
    <div v-for="column in dimensions" :key="idOf(column)" class="target-row">
      <div class="dimension-label">
        <strong>{{ column.label || column.code }}</strong>
        <small>{{ column.data_type }}</small>
      </div>
      <el-select
        :model-value="modelValue.modes[idOf(column)]"
        style="width: 150px"
        @update:model-value="changeMode(idOf(column), $event)"
      >
        <el-option v-if="expandBy?.includes(idOf(column))" label="保留每月值" value="preserve" />
        <template v-else>
          <el-option label="自动带出" value="auto" :disabled="sourceValues(idOf(column)).length !== 1" />
          <el-option label="选择来源值" value="source" />
          <el-option label="自定义值" value="custom" />
        </template>
      </el-select>

      <span v-if="modelValue.modes[idOf(column)] === 'preserve'" class="preserve-value">按来源值保留</span>
      <el-select
        v-else-if="modelValue.modes[idOf(column)] !== 'custom'"
        :model-value="valueKey(modelValue.values[idOf(column)] ?? null)"
        :disabled="modelValue.modes[idOf(column)] === 'auto'"
        style="min-width: 220px; flex: 1"
        @update:model-value="patch(idOf(column), { value: sourceValues(idOf(column)).find((item) => valueKey(item) === $event) ?? null })"
      >
        <el-option
          v-for="value in sourceValues(idOf(column))"
          :key="valueKey(value)"
          :label="valueLabel(value)"
          :value="valueKey(value)"
        />
      </el-select>
      <el-input-number
        v-else-if="['number', 'integer', 'decimal', 'float', 'double', 'numeric'].includes(column.data_type)"
        :model-value="modelValue.values[idOf(column)] as number"
        style="min-width: 220px; flex: 1"
        @update:model-value="patch(idOf(column), { value: $event })"
      />
      <el-date-picker
        v-else-if="['date', 'datetime', 'timestamp', 'timestamptz'].includes(column.data_type)"
        :model-value="modelValue.values[idOf(column)] as string"
        :type="column.data_type === 'date' ? 'date' : 'datetime'"
        :value-format="column.data_type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ssZ'"
        style="min-width: 220px; flex: 1"
        @update:model-value="patch(idOf(column), { value: $event })"
      />
      <el-select
        v-else-if="['boolean', 'bool'].includes(column.data_type)"
        :model-value="modelValue.values[idOf(column)]"
        style="min-width: 220px; flex: 1"
        @update:model-value="patch(idOf(column), { value: $event })"
      >
        <el-option label="是" :value="true" />
        <el-option label="否" :value="false" />
      </el-select>
      <el-input
        v-else
        :model-value="modelValue.values[idOf(column)] as string"
        placeholder="输入同类型的新值"
        style="min-width: 220px; flex: 1"
        @update:model-value="patch(idOf(column), { value: $event })"
      />
      <span v-if="invalidFields.includes(idOf(column))" class="field-error" role="alert">请设置有效结果值</span>
    </div>
  </section>
</template>

<style scoped>
.target-editor { box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%; padding: 14px; border: 1px solid var(--color-border-light); border-radius: 6px; background: #fff; overflow-x: auto; }
.target-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
.target-head span, .dimension-label small { color: var(--color-text-secondary); font-size: 12px; }
.target-row { display: flex; align-items: center; gap: 10px; min-width: 720px; margin-bottom: 10px; }
.dimension-label { width: 150px; display: grid; gap: 2px; }
.field-error { color: var(--color-danger); font-size: 12px; white-space: nowrap; }
.preserve-value { min-width: 220px; flex: 1; color: var(--color-text-secondary); font-size: 13px; }
@media (max-width: 900px) { .target-editor { overflow-x: auto; } }
</style>
