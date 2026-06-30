<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ArrowDown, Lock, RefreshLeft, Search, Setting } from '@element-plus/icons-vue'
import type { FilterCond, FilterLogic } from '@/api/reports'
import { dataApi } from '@/api/data'

const props = defineProps<{
  filters: FilterCond[]
  filterLogic?: FilterLogic | null
  columnLabels?: Record<string, string>
  currentDatasetTables?: { table_name: string; alias: string; table_label?: string | null }[]
}>()

const emit = defineEmits<{
  apply: [filters: FilterCond[]]
}>()

const runtimeValues = reactive<Record<number, any>>({})
const barRef = ref<HTMLElement | null>(null)
const availableWidth = ref(0)
const advancedVisible = ref(false)

type DistinctOpt = { value: string; label: string }
const distinctCache = ref<Map<string, DistinctOpt[]>>(new Map())
const distinctLoading = ref<Set<string>>(new Set())

const visibleFilters = computed(() =>
  props.filters
    .map((filter, index) => ({ filter, index }))
    .filter(({ filter }) => filter.visible !== false),
)

const customLogicActive = computed(() =>
  props.filterLogic?.mode === 'custom' && !!props.filterLogic.expression?.trim(),
)

const maxInlineCount = computed(() => {
  if (!availableWidth.value) return Math.min(visibleFilters.value.length, 4)
  const reserved = 150
  const itemWidth = 170
  return Math.max(1, Math.floor((availableWidth.value - reserved) / itemWidth))
})

const inlineFilters = computed(() => visibleFilters.value.slice(0, maxInlineCount.value))
const overflowFilters = computed(() => visibleFilters.value.slice(maxInlineCount.value))

let observer: ResizeObserver | null = null

function opLabel(op: string): string {
  const labels: Record<string, string> = {
    eq: '等于', neq: '不等于', contains: '包含', gt: '大于', gte: '大于等于',
    lt: '小于', lte: '小于等于', between: '介于', in: '属于', is_null: '为空', is_not_null: '非空',
  }
  return labels[op] || op
}

function fieldLabel(column: string): string {
  return props.columnLabels?.[column] || column
}

function resolveTableColumn(qual: string): { table: string; column: string } | null {
  if (!props.currentDatasetTables) return null
  const dot = qual.indexOf('.')
  if (dot < 0) return null
  const alias = qual.slice(0, dot)
  const column = qual.slice(dot + 1)
  const t = props.currentDatasetTables.find((x) => x.alias === alias)
  return t ? { table: t.table_name, column } : null
}

function useValueDropdown(filter: FilterCond): boolean {
  return ['eq', 'neq', 'in'].includes(filter.op) && !!resolveTableColumn(filter.column)
}

async function ensureOptions(qual: string) {
  if (!qual || distinctCache.value.has(qual) || distinctLoading.value.has(qual)) return
  const rc = resolveTableColumn(qual)
  if (!rc) return
  distinctLoading.value.add(qual)
  try {
    const rows = await dataApi.distinct(rc.table, rc.column)
    distinctCache.value.set(qual, rows.map((r) => ({ value: r.value, label: r.value })))
  } catch {
    distinctCache.value.set(qual, [])
  } finally {
    distinctLoading.value.delete(qual)
  }
}

function optionsFor(qual: string): DistinctOpt[] {
  return distinctCache.value.get(qual) || []
}

function stringifyValue(value: any): string {
  if (Array.isArray(value)) return value.join(',')
  return value ?? ''
}

function resetValues() {
  for (const key of Object.keys(runtimeValues)) delete runtimeValues[Number(key)]
  for (const { filter, index } of visibleFilters.value) {
    runtimeValues[index] = filter.op === 'in' && !Array.isArray(filter.value)
      ? String(filter.value || '').split(',').map((s) => s.trim()).filter(Boolean)
      : stringifyValue(filter.value)
  }
}

function normalizeValue(filter: FilterCond, value: any) {
  if (filter.op === 'is_null' || filter.op === 'is_not_null') return null
  if (filter.op === 'between' || filter.op === 'in') {
    if (Array.isArray(value)) return value
    return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
  }
  return value
}

function buildOverrides(): FilterCond[] {
  return visibleFilters.value
    .filter(({ filter }) => !filter.locked)
    .map(({ filter, index }) => ({
      __index: index,
      column: filter.column,
      op: filter.op,
      value: normalizeValue(filter, runtimeValues[index]),
    }))
}

function apply() {
  advancedVisible.value = false
  emit('apply', buildOverrides())
}

function resetAndApply() {
  resetValues()
  apply()
}

function chipText(filter: FilterCond, index: number) {
  const raw = runtimeValues[index]
  const value = Array.isArray(raw) ? raw.join(',') : stringifyValue(raw)
  if (filter.op === 'is_null' || filter.op === 'is_not_null') return `${fieldLabel(filter.column)}：${opLabel(filter.op)}`
  return `${fieldLabel(filter.column)}：${value || '全部'}`
}

watch(
  () => props.filters,
  resetValues,
  { immediate: true, deep: true },
)

onMounted(() => {
  if (!barRef.value) return
  observer = new ResizeObserver((entries) => {
    availableWidth.value = entries[0]?.contentRect.width || 0
  })
  observer.observe(barRef.value)
})

onUnmounted(() => {
  observer?.disconnect()
})

defineExpose({ buildOverrides, resetValues })
</script>

<template>
  <div v-if="visibleFilters.length" ref="barRef" class="runtime-filter-bar">
    <div class="filter-strip">
      <el-popover
        v-for="{ filter, index } in inlineFilters"
        :key="`${filter.column}-${index}`"
        trigger="click"
        placement="bottom-start"
        :width="280"
        :disabled="filter.locked"
      >
        <template #reference>
          <button class="filter-chip" :class="{ 'is-locked': filter.locked }" type="button">
            <span class="chip-text">{{ chipText(filter, index) }}</span>
            <el-icon v-if="filter.locked"><Lock /></el-icon>
            <el-icon v-else><ArrowDown /></el-icon>
          </button>
        </template>
        <div class="filter-popover">
          <div class="popover-title">{{ fieldLabel(filter.column) }}</div>
          <div class="popover-op">{{ opLabel(filter.op) }}</div>
          <el-select
            v-if="useValueDropdown(filter)"
            v-model="runtimeValues[index]"
            :multiple="filter.op === 'in'"
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            :loading="distinctLoading.has(filter.column)"
            placeholder="选择或输入值"
            size="small"
            style="width: 100%"
            @visible-change="(v: boolean) => v && ensureOptions(filter.column)"
            @keyup.enter="apply"
          >
            <el-option v-for="o in optionsFor(filter.column)" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <el-input
            v-else
            v-model="runtimeValues[index]"
            :disabled="filter.op === 'is_null' || filter.op === 'is_not_null'"
            :placeholder="filter.op === 'between' || filter.op === 'in' ? '多个值用逗号分隔' : '值'"
            size="small"
            @keyup.enter="apply"
          />
          <div class="popover-actions">
            <el-button size="small" type="primary" @click="apply">应用</el-button>
          </div>
        </div>
      </el-popover>

      <el-button
        v-if="overflowFilters.length || customLogicActive"
        link
        type="primary"
        class="advanced-link"
        @click="advancedVisible = true"
      >
        高级筛选
        <el-tag v-if="overflowFilters.length" size="small" effect="plain">{{ overflowFilters.length }}</el-tag>
        <el-tag v-if="customLogicActive" size="small" type="warning" effect="plain">逻辑</el-tag>
      </el-button>

      <el-button link class="reset-link" @click="resetAndApply">
        <el-icon><RefreshLeft /></el-icon>
        重置
      </el-button>
    </div>

    <el-dialog v-model="advancedVisible" title="高级筛选" width="680px">
      <div class="advanced-list">
        <div
          v-for="{ filter, index } in visibleFilters"
          :key="`${filter.column}-${index}`"
          class="advanced-row"
        >
          <div class="advanced-label">
            <span>{{ fieldLabel(filter.column) }}</span>
            <el-tag size="small" effect="plain">{{ opLabel(filter.op) }}</el-tag>
            <el-tag v-if="filter.locked" size="small" type="info" effect="plain">锁定</el-tag>
          </div>
          <el-select
            v-if="useValueDropdown(filter)"
            v-model="runtimeValues[index]"
            :multiple="filter.op === 'in'"
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            :loading="distinctLoading.has(filter.column)"
            :disabled="filter.locked"
            placeholder="选择或输入值"
            size="small"
            style="width: 100%"
            @visible-change="(v: boolean) => v && ensureOptions(filter.column)"
          >
            <el-option v-for="o in optionsFor(filter.column)" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <el-input
            v-else
            v-model="runtimeValues[index]"
            :disabled="filter.locked || filter.op === 'is_null' || filter.op === 'is_not_null'"
            :placeholder="filter.op === 'between' || filter.op === 'in' ? '多个值用逗号分隔' : '值'"
            size="small"
          />
        </div>
      </div>
      <div v-if="customLogicActive" class="logic-note">
        <el-icon><Setting /></el-icon>
        已启用高级逻辑：{{ filterLogic?.expression }}
      </div>
      <template #footer>
        <el-button @click="resetValues">重置</el-button>
        <el-button type="primary" @click="apply">
          <el-icon><Search /></el-icon>
          应用
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.runtime-filter-bar {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-bg-page);
}
.filter-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 210px;
  max-width: 240px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(20, 86, 240, 0.2);
  border-radius: 4px;
  background: var(--color-primary-light);
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: 12px;
}
.filter-chip.is-locked {
  border-color: var(--color-border-light);
  background: #fff;
  color: var(--color-text-secondary);
  cursor: default;
}
.chip-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.advanced-link,
.reset-link {
  flex: none;
}
.filter-popover {
  display: grid;
  gap: 8px;
}
.popover-title {
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 700;
}
.popover-op {
  color: var(--color-text-placeholder);
  font-size: 12px;
}
.popover-actions {
  display: flex;
  justify-content: flex-end;
}
.advanced-list {
  display: grid;
  gap: 10px;
}
.advanced-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 10px;
  align-items: center;
}
.advanced-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.advanced-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.logic-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--color-warning-light);
  color: var(--color-warning);
  font-size: 12px;
}
@media (max-width: 720px) {
  .runtime-filter-bar {
    padding: 8px;
  }
  .filter-strip {
    gap: 6px;
  }
  .filter-chip {
    flex-basis: 160px;
    max-width: 180px;
  }
  .advanced-row {
    grid-template-columns: 1fr;
  }
}
</style>

const props = defineProps<{
  filters: FilterCond[]
  filterLogic?: FilterLogic | null
  columnLabels?: Record<string, string>
}>()

const emit = defineEmits<{
  apply: [filters: FilterCond[]]
}>()

const runtimeValues = reactive<Record<number, any>>({})
const barRef = ref<HTMLElement | null>(null)
const availableWidth = ref(0)
const advancedVisible = ref(false)

const visibleFilters = computed(() =>
  props.filters
    .map((filter, index) => ({ filter, index }))
    .filter(({ filter }) => filter.visible !== false),
)

const customLogicActive = computed(() =>
  props.filterLogic?.mode === 'custom' && !!props.filterLogic.expression?.trim(),
)

const maxInlineCount = computed(() => {
  if (!availableWidth.value) return Math.min(visibleFilters.value.length, 4)
  const reserved = 150
  const itemWidth = 170
  return Math.max(1, Math.floor((availableWidth.value - reserved) / itemWidth))
})

const inlineFilters = computed(() => visibleFilters.value.slice(0, maxInlineCount.value))
const overflowFilters = computed(() => visibleFilters.value.slice(maxInlineCount.value))

let observer: ResizeObserver | null = null

function opLabel(op: string): string {
  const labels: Record<string, string> = {
    eq: '等于',
    neq: '不等于',
    contains: '包含',
    gt: '大于',
    gte: '大于等于',
    lt: '小于',
    lte: '小于等于',
    between: '介于',
    in: '属于',
    is_null: '为空',
    is_not_null: '非空',
  }
  return labels[op] || op
}

function fieldLabel(column: string): string {
  return props.columnLabels?.[column] || column
}

function stringifyValue(value: any): string {
  if (Array.isArray(value)) return value.join(',')
  return value ?? ''
}

function resetValues() {
  for (const key of Object.keys(runtimeValues)) delete runtimeValues[Number(key)]
  for (const { filter, index } of visibleFilters.value) {
    runtimeValues[index] = stringifyValue(filter.value)
  }
}

function normalizeValue(filter: FilterCond, value: any) {
  if (filter.op === 'is_null' || filter.op === 'is_not_null') return null
  if (filter.op === 'between' || filter.op === 'in') {
    if (Array.isArray(value)) return value
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return value
}

function buildOverrides(): FilterCond[] {
  return visibleFilters.value
    .filter(({ filter }) => !filter.locked)
    .map(({ filter, index }) => ({
      __index: index,
      column: filter.column,
      op: filter.op,
      value: normalizeValue(filter, runtimeValues[index]),
    }))
}

function apply() {
  advancedVisible.value = false
  emit('apply', buildOverrides())
}

function resetAndApply() {
  resetValues()
  apply()
}

function chipText(filter: FilterCond, index: number) {
  const value = stringifyValue(runtimeValues[index])
  if (filter.op === 'is_null' || filter.op === 'is_not_null') return `${fieldLabel(filter.column)}：${opLabel(filter.op)}`
  return `${fieldLabel(filter.column)}：${value || '全部'}`
}

watch(
  () => props.filters,
  resetValues,
  { immediate: true, deep: true },
)

onMounted(() => {
  if (!barRef.value) return
  observer = new ResizeObserver((entries) => {
    availableWidth.value = entries[0]?.contentRect.width || 0
  })
  observer.observe(barRef.value)
})

onUnmounted(() => {
  observer?.disconnect()
})

defineExpose({ buildOverrides, resetValues })
</script>

<template>
  <div v-if="visibleFilters.length" ref="barRef" class="runtime-filter-bar">
    <div class="filter-strip">
      <el-popover
        v-for="{ filter, index } in inlineFilters"
        :key="`${filter.column}-${index}`"
        trigger="click"
        placement="bottom-start"
        :width="260"
        :disabled="filter.locked"
      >
        <template #reference>
          <button class="filter-chip" :class="{ 'is-locked': filter.locked }" type="button">
            <span class="chip-text">{{ chipText(filter, index) }}</span>
            <el-icon v-if="filter.locked"><Lock /></el-icon>
            <el-icon v-else><ArrowDown /></el-icon>
          </button>
        </template>
        <div class="filter-popover">
          <div class="popover-title">{{ fieldLabel(filter.column) }}</div>
          <div class="popover-op">{{ opLabel(filter.op) }}</div>
          <el-input
            v-model="runtimeValues[index]"
            :disabled="filter.op === 'is_null' || filter.op === 'is_not_null'"
            :placeholder="filter.op === 'between' || filter.op === 'in' ? '多个值用逗号分隔' : '值'"
            size="small"
            @keyup.enter="apply"
          />
          <div class="popover-actions">
            <el-button size="small" type="primary" @click="apply">应用</el-button>
          </div>
        </div>
      </el-popover>

      <el-button
        v-if="overflowFilters.length || customLogicActive"
        link
        type="primary"
        class="advanced-link"
        @click="advancedVisible = true"
      >
        高级筛选
        <el-tag v-if="overflowFilters.length" size="small" effect="plain">{{ overflowFilters.length }}</el-tag>
        <el-tag v-if="customLogicActive" size="small" type="warning" effect="plain">逻辑</el-tag>
      </el-button>

      <el-button link class="reset-link" @click="resetAndApply">
        <el-icon><RefreshLeft /></el-icon>
        重置
      </el-button>
    </div>

    <el-dialog v-model="advancedVisible" title="高级筛选" width="680px">
      <div class="advanced-list">
        <div
          v-for="{ filter, index } in visibleFilters"
          :key="`${filter.column}-${index}`"
          class="advanced-row"
        >
          <div class="advanced-label">
            <span>{{ fieldLabel(filter.column) }}</span>
            <el-tag size="small" effect="plain">{{ opLabel(filter.op) }}</el-tag>
            <el-tag v-if="filter.locked" size="small" type="info" effect="plain">锁定</el-tag>
          </div>
          <el-input
            v-model="runtimeValues[index]"
            :disabled="filter.locked || filter.op === 'is_null' || filter.op === 'is_not_null'"
            :placeholder="filter.op === 'between' || filter.op === 'in' ? '多个值用逗号分隔' : '值'"
            size="small"
          />
        </div>
      </div>
      <div v-if="customLogicActive" class="logic-note">
        <el-icon><Setting /></el-icon>
        已启用高级逻辑：{{ filterLogic?.expression }}
      </div>
      <template #footer>
        <el-button @click="resetValues">重置</el-button>
        <el-button type="primary" @click="apply">
          <el-icon><Search /></el-icon>
          应用
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.runtime-filter-bar {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-bg-page);
}
.filter-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 210px;
  max-width: 240px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(20, 86, 240, 0.2);
  border-radius: 4px;
  background: var(--color-primary-light);
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: 12px;
}
.filter-chip.is-locked {
  border-color: var(--color-border-light);
  background: #fff;
  color: var(--color-text-secondary);
  cursor: default;
}
.chip-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.advanced-link,
.reset-link {
  flex: none;
}
.filter-popover {
  display: grid;
  gap: 8px;
}
.popover-title {
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 700;
}
.popover-op {
  color: var(--color-text-placeholder);
  font-size: 12px;
}
.popover-actions {
  display: flex;
  justify-content: flex-end;
}
.advanced-list {
  display: grid;
  gap: 10px;
}
.advanced-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 10px;
  align-items: center;
}
.advanced-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.advanced-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.logic-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--color-warning-light);
  color: var(--color-warning);
  font-size: 12px;
}
@media (max-width: 720px) {
  .runtime-filter-bar {
    padding: 8px;
  }
  .filter-strip {
    gap: 6px;
  }
  .filter-chip {
    flex-basis: 160px;
    max-width: 180px;
  }
  .advanced-row {
    grid-template-columns: 1fr;
  }
}
</style>
