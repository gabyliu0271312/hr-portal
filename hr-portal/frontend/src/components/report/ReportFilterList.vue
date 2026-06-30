<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Delete, View, Hide } from '@element-plus/icons-vue'
import type { FilterCond, FilterLogic } from '@/api/reports'
import type { ColumnInfo } from '@/api/data'
import { dataApi } from '@/api/data'

const props = defineProps<{
  filters: FilterCond[]
  filterLogic?: FilterLogic | null
  allColumns: ColumnInfo[]
  currentDatasetTables?: { table_name: string; alias: string; table_label?: string | null }[]
  showViewControls?: boolean
  compact?: boolean
}>()

const emit = defineEmits<{
  'update:filters': [v: FilterCond[]]
  'update:filterLogic': [v: FilterLogic | null]
}>()

const FILTER_OPS = [
  { value: 'eq', label: '绛変簬' },
  { value: 'neq', label: '涓嶇瓑浜? },
  { value: 'contains', label: '鍖呭惈' },
  { value: 'gt', label: '澶т簬' },
  { value: 'gte', label: '鈮? },
  { value: 'lt', label: '灏忎簬' },
  { value: 'lte', label: '鈮? },
  { value: 'between', label: '浠嬩簬' },
  { value: 'in', label: '灞炰簬' },
  { value: 'is_null', label: '涓虹┖' },
  { value: 'is_not_null', label: '闈炵┖' },
]

type DistinctOpt = { value: string; label: string }
const NAME_FIELDS = ['dimension_value', 'name']
const distinctCache = ref<Map<string, DistinctOpt[]>>(new Map())
const distinctLoading = ref<Set<string>>(new Set())

const logicMode = computed(() => props.filterLogic?.mode || 'and')
const logicExpression = computed(() => props.filterLogic?.expression || '')

function filterLabel(index: number): string {
  let n = index
  const chars: string[] = []
  do {
    chars.unshift(String.fromCharCode(65 + (n % 26)))
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return chars.join('')
}

function colInfo(qual: string): ColumnInfo | undefined {
  return props.allColumns.find((c) => c.code === qual)
}

function resolveTableColumn(qual: string): { table: string; column: string } | null {
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
    const rows = await dataApi.distinct(rc.table, rc.column, wantExtra ? 'code' : undefined)
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

function patchFilter(index: number, patch: Partial<FilterCond>) {
  emit('update:filters', props.filters.map((item, i) => (i === index ? { ...item, ...patch } : item)))
}

function onFilterOpChange(index: number, op: string) {
  const current = props.filters[index]
  if (!current) return
  let value = current.value
  if (valueDisabled(op)) {
    value = null
  } else if (op === 'in') {
    value = Array.isArray(value)
      ? value
      : typeof value === 'string' && value
        ? value.split(',').map((part) => part.trim()).filter(Boolean)
        : []
  } else if (Array.isArray(value)) {
    value = value.join(',')
  } else if (value == null) {
    value = ''
  }
  patchFilter(index, { op, value })
}

function onFilterColumnChange(index: number, column: string) {
  const current = props.filters[index]
  if (!current) return
  const value = current.op === 'in' ? [] : valueDisabled(current.op) ? null : ''
  patchFilter(index, { column, value })
  ensureOptions(column)
}

function onFilterValueChange(index: number, value: any) {
  patchFilter(index, { value })
}

function onFilterVisibleChange(index: number, visible: boolean) {
  patchFilter(index, { visible, locked: visible ? props.filters[index]?.locked ?? false : false })
}

function onFilterLockedChange(index: number, locked: boolean) {
  patchFilter(index, { locked })
}

function addFilter() {
  emit('update:filters', [...props.filters, { column: '', op: 'eq', value: '', visible: true, locked: false }])
}

function removeFilter(i: number) {
  const next = [...props.filters]
  next.splice(i, 1)
  emit('update:filters', next)
}

function setLogicMode(mode: 'and' | 'custom') {
  emit('update:filterLogic', mode === 'custom' ? { mode, expression: logicExpression.value } : null)
}

function setLogicExpression(expression: string) {
  emit('update:filterLogic', { mode: 'custom', expression })
}

defineExpose({ clearCache: () => { distinctCache.value = new Map() } })
</script>

<template>
  <div :class="{ 'is-compact': compact }">
    <div v-for="(f, i) in filters" :key="i" class="rule-row">
      <el-tag class="rule-label" effect="plain">{{ filterLabel(i) }}</el-tag>
      <el-select
        :model-value="f.column"
        placeholder="瀛楁"
        class="filter-column-select"
        filterable
        @update:model-value="(value: string) => onFilterColumnChange(i, value)"
      >
        <el-option label="鍏ㄩ儴" value="" />
        <el-option v-for="c in allColumns" :key="c.code" :label="c.label" :value="c.code" />
      </el-select>
      <el-select
        :model-value="f.op"
        class="filter-op-select"
        @update:model-value="(op: string) => onFilterOpChange(i, op)"
      >
        <el-option v-for="o in FILTER_OPS" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-select
        v-if="useValueDropdown(f)"
        :model-value="f.value"
        :multiple="f.op === 'in'"
        filterable
        allow-create
        default-first-option
        :reserve-keyword="false"
        placeholder="閫夋嫨鎴栬緭鍏ュ€?
        class="filter-value-control"
        @update:model-value="(value: any) => onFilterValueChange(i, value)"
        @visible-change="(v: boolean) => v && ensureOptions(f.column)"
      >
        <el-option v-for="o in optionsFor(f.column)" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-input
        v-else
        :model-value="f.value"
        :placeholder="valueRequiresArray(f.op) ? '澶氫釜鍊肩敤閫楀彿鍒嗛殧' : '鍊?"
        :disabled="valueDisabled(f.op)"
        class="filter-value-control"
        @update:model-value="(value: string) => onFilterValueChange(i, value)"
      />
      <el-button link type="danger" @click="removeFilter(i)">
        <el-icon><Delete /></el-icon>
      </el-button>
      <template v-if="showViewControls !== false">
        <el-tooltip :content="f.visible === false ? '鏌ョ湅椤典笉鏄剧ず' : '鏌ョ湅椤垫樉绀?" placement="top">
          <el-button
            link
            :type="f.visible === false ? 'info' : 'primary'"
            @click="onFilterVisibleChange(i, f.visible === false)"
          >
            <el-icon>
              <component :is="f.visible === false ? Hide : View" />
            </el-icon>
          </el-button>
        </el-tooltip>
        <el-checkbox
          :model-value="f.locked ?? false"
          :disabled="f.visible === false"
          @update:model-value="(value: string | number | boolean) => onFilterLockedChange(i, !!value)"
        >閿佸畾</el-checkbox>
      </template>
    </div>
    <div v-if="filters.length > 1" class="logic-row">
      <span class="logic-label">缁勫悎閫昏緫</span>
      <el-radio-group
        :model-value="logicMode"
        @update:model-value="(v: string | number) => setLogicMode(v as 'and' | 'custom')"
      >
        <el-radio-button label="and">鍏ㄩ儴 AND</el-radio-button>
        <el-radio-button label="custom">鑷畾涔?/el-radio-button>
      </el-radio-group>
      <el-input
        v-if="logicMode === 'custom'"
        :model-value="logicExpression"
        placeholder="渚嬪锛?A AND B) OR C"
        style="max-width: 360px"
        @update:model-value="setLogicExpression"
      />
    </div>
    <el-button link type="primary" @click="addFilter">
      <el-icon style="margin-right: 4px"><Plus /></el-icon>娣诲姞绛涢€?    </el-button>
  </div>
</template>

<style scoped>
.rule-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
}
.filter-column-select {
  width: 200px;
}
.filter-op-select {
  width: 120px;
}
.filter-value-control {
  width: 160px;
  flex: none;
}
.rule-label {
  width: 34px;
  justify-content: center;
}
.is-compact .rule-row {
  align-items: flex-start;
  flex-wrap: wrap;
  padding: 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
}
.is-compact .rule-label {
  margin-top: 3px;
}
.is-compact .filter-column-select {
  width: min(100%, 220px);
}
.is-compact .filter-op-select {
  width: 104px;
}
.is-compact .filter-value-control {
  flex: 1 1 140px;
  min-width: 120px;
  width: auto;
}
.is-compact .logic-row {
  padding-left: 0;
}
.logic-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 10px 0 4px;
  padding-left: 42px;
}
.logic-label {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}
</style>
