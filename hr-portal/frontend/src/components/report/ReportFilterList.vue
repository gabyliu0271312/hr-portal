<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'
import type { FilterCond } from '@/api/reports'
import type { ColumnInfo } from '@/api/data'
import { dataApi } from '@/api/data'

const props = defineProps<{
  filters: FilterCond[]
  allColumns: ColumnInfo[]
  tableName: string
  sourceType: 'single' | 'dataset'
  currentDatasetTables?: { table_name: string; alias: string }[]
}>()

const emit = defineEmits<{
  'update:filters': [v: FilterCond[]]
}>()

const FILTER_OPS = [
  { value: 'eq', label: '等于' },
  { value: 'neq', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '≤' },
  { value: 'between', label: '介于' },
  { value: 'in', label: '属于' },
  { value: 'is_null', label: '为空' },
  { value: 'is_not_null', label: '非空' },
]

type DistinctOpt = { value: string; label: string }
const NAME_FIELDS = ['维度值', '名称']
const distinctCache = ref<Map<string, DistinctOpt[]>>(new Map())
const distinctLoading = ref<Set<string>>(new Set())

function colInfo(qual: string): ColumnInfo | undefined {
  return props.allColumns.find((c) => c.code === qual)
}

function resolveTableColumn(qual: string): { table: string; column: string } | null {
  if (props.sourceType === 'single') {
    return props.tableName ? { table: props.tableName, column: qual } : null
  }
  const dot = qual.indexOf('.')
  if (dot < 0 || !props.currentDatasetTables) return null
  const alias = qual.slice(0, dot)
  const column = qual.slice(dot + 1)
  const t = props.currentDatasetTables.find((x) => x.alias === alias)
  return t ? { table: t.table_name, column } : null
}

function useValueDropdown(f: FilterCond): boolean {
  if (!['eq', 'neq', 'in'].includes(f.op)) return false
  const ci = colInfo(f.column)
  return !!ci && ci.agg_role !== 'measure'
}

function tailCode(qual: string): string {
  const i = qual.indexOf('.')
  return i < 0 ? qual : qual.slice(i + 1)
}

async function ensureOptions(qual: string) {
  if (!qual || distinctCache.value.has(qual) || distinctLoading.value.has(qual)) return
  const rc = resolveTableColumn(qual)
  if (!rc) return
  distinctLoading.value.add(qual)
  try {
    const wantExtra = NAME_FIELDS.includes(tailCode(qual))
    const rows = await dataApi.distinct(rc.table, rc.column, wantExtra ? '编码' : undefined)
    const opts = rows.map((r) => ({
      value: r.value,
      label: wantExtra && r.extra ? `${r.value} (${r.extra})` : r.value,
    }))
    distinctCache.value.set(qual, opts)
  } catch {
    distinctCache.value.set(qual, [])
  } finally {
    distinctLoading.value.delete(qual)
  }
}

function optionsFor(qual: string): DistinctOpt[] {
  return distinctCache.value.get(qual) || []
}

function valueRequiresArray(op: string): boolean {
  return op === 'between' || op === 'in'
}
function valueDisabled(op: string): boolean {
  return op === 'is_null' || op === 'is_not_null'
}

function onFilterOpChange(f: FilterCond, op: string) {
  const wasArray = Array.isArray(f.value)
  const willArray = op === 'in'
  if (wasArray !== willArray) f.value = willArray ? [] : ''
}

function onFilterColumnChange(f: FilterCond) {
  f.value = f.op === 'in' ? [] : ''
  ensureOptions(f.column)
}

function addFilter() {
  emit('update:filters', [...props.filters, { column: '', op: 'eq', value: '' }])
}

function removeFilter(i: number) {
  const next = [...props.filters]
  next.splice(i, 1)
  emit('update:filters', next)
}

defineExpose({ clearCache: () => { distinctCache.value = new Map() } })
</script>

<template>
  <div>
    <div v-for="(f, i) in filters" :key="i" class="rule-row">
      <el-select
        v-model="f.column"
        placeholder="字段"
        style="width: 200px"
        filterable
        @change="onFilterColumnChange(f)"
      >
        <el-option v-for="c in allColumns" :key="c.code" :label="c.label" :value="c.code" />
      </el-select>
      <el-select v-model="f.op" style="width: 120px" @change="(op: string) => onFilterOpChange(f, op)">
        <el-option v-for="o in FILTER_OPS" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-select
        v-if="useValueDropdown(f)"
        v-model="f.value"
        :multiple="f.op === 'in'"
        filterable
        allow-create
        default-first-option
        :reserve-keyword="false"
        placeholder="选择或输入值"
        style="flex: 1"
        @visible-change="(v: boolean) => v && ensureOptions(f.column)"
      >
        <el-option v-for="o in optionsFor(f.column)" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-input
        v-else
        v-model="f.value"
        :placeholder="valueRequiresArray(f.op) ? '多个值用逗号分隔' : '值'"
        :disabled="valueDisabled(f.op)"
        style="flex: 1"
      />
      <el-button link type="danger" @click="removeFilter(i)">
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>
    <el-button link type="primary" @click="addFilter">
      <el-icon style="margin-right: 4px"><Plus /></el-icon>添加筛选
    </el-button>
  </div>
</template>

<style scoped>
.rule-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
</style>
