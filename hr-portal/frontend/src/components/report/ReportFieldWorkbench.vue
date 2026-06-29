<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowRight, Close, Delete, Edit, Filter, Hide, Plus, Rank, View } from '@element-plus/icons-vue'
import type { ColumnInfo } from '@/api/data'
import type { AggregationFunc, ColumnSetting, DefaultSplitRule, FilterCond, FilterLogic, SortCond } from '@/api/reports'
import { REPORT_AGG_FUNCS, reportAggLabel } from '@/constants/reportAggregation'
import ReportFilterList from './ReportFilterList.vue'

const props = defineProps<{
  selectedCodes: string[]
  allColumns: ColumnInfo[]
  sourceGroups?: { key: string; label: string }[]
  currentDatasetTables?: { table_name: string; alias: string; table_label?: string | null }[]
  columnSettings: Record<string, ColumnSetting>
  defaultSplitRule: DefaultSplitRule
  defaultAggregation?: AggregationFunc
  aggregate: boolean
  roundingGroupBy: string[]
  sorts?: SortCond[]
  lookupEnabled?: boolean
  pushEnabled?: boolean
  pushTargetCount?: number
  isDataset?: boolean
  loading?: boolean
  canCreateField?: boolean
}>()

const emit = defineEmits<{
  'update:selectedCodes': [v: string[]]
  'update:columnSettings': [v: Record<string, ColumnSetting>]
  'update:defaultSplitRule': [v: DefaultSplitRule]
  'update:defaultAggregation': [v: AggregationFunc]
  'update:aggregate': [v: boolean]
  'update:roundingGroupBy': [v: string[]]
  'update:sorts': [v: SortCond[]]
  createField: []
  editField: [col: ColumnInfo]
}>()

const AGG_FUNCS = REPORT_AGG_FUNCS

const selectedCols = computed(() =>
  props.selectedCodes
    .map((code) => props.allColumns.find((item) => item.code === code))
    .filter((item): item is ColumnInfo => !!item)
)

const availableCols = computed(() =>
  props.allColumns.filter((item) => !props.selectedCodes.includes(item.code))
)

const availableColumnGroups = computed(() => groupColumns(availableCols.value))

const selectedDimensions = computed(() => selectedCols.value.filter((item) => !isMeasureLike(item)))
const selectedMeasures = computed(() => selectedCols.value.filter((item) => isMeasureLike(item)))
const selectedFieldGroups = computed(() => [
  {
    key: 'dimension',
    title: '维度',
    count: selectedDimensions.value.length,
    columns: selectedDimensions.value,
    empty: '单击左侧维度字段后会加入这里',
  },
  {
    key: 'measure',
    title: '指标',
    count: selectedMeasures.value.length,
    columns: selectedMeasures.value,
    empty: '单击左侧指标字段后会加入这里',
  },
])
const numericAllCols = computed(() =>
  props.allColumns.filter((item) => item.agg_role === 'measure' || item.data_type === 'number')
)
const draggingCode = ref('')
type AdvancedTab = 'rules' | 'reshape' | 'lookup' | 'push'
const collapsedSourceKeys = ref<Set<string>>(new Set())
const advancedOpen = ref(false)
const advancedTab = ref<AdvancedTab>('rules')
const metricFilterOpen = ref(false)
const metricFilterCol = ref<ColumnInfo | null>(null)
const metricFilterDraft = ref<FilterCond[]>([])
const metricFilterLogicDraft = ref<FilterLogic | null>(null)
const advancedMeta = computed(() => {
  const map = {
    rules: {
      title: '统计规则',
      desc: '控制明细/汇总口径、默认统计方式、拆分规则和余差收口。',
    },
    reshape: {
      title: '数据重塑',
      desc: '把字段结构转换为更适合分析的形态，例如重映射、列转行、行转列。',
    },
    lookup: {
      title: '名单回查',
      desc: '先从字段值或筛选结果生成名单，再用集合运算回查完整记录。',
    },
    push: {
      title: '推送配置',
      desc: '为当前报表配置一个或多个对外推送配置，保存后可在报表列表手动推送。',
    },
  } as Record<AdvancedTab, { title: string; desc: string }>
  return map[advancedTab.value]
})

function sourceKey(code: string) {
  if (code.startsWith('calc.')) return 'calc'
  return props.isDataset && code.includes('.') ? code.slice(0, code.indexOf('.')) : 'current'
}

function sourceLabel(code: string) {
  const key = sourceKey(code)
  if (key === 'calc') return '计算字段'
  if (!props.isDataset) return '当前报表'
  return props.sourceGroups?.find((item) => item.key === key)?.label || key
}

function cleanFieldLabel(col: ColumnInfo) {
  const prefix = `${sourceKey(col.code)}.`
  if (!props.isDataset) return col.label
  if (col.label.startsWith(prefix)) return col.label.slice(prefix.length)
  const dot = col.label.lastIndexOf('.')
  return dot >= 0 ? col.label.slice(dot + 1) : col.label
}

function groupColumns(cols: ColumnInfo[]) {
  const grouped = new Map<string, { key: string; label: string; columns: ColumnInfo[] }>()
  for (const col of cols) {
    const key = sourceKey(col.code)
    if (!grouped.has(key)) {
      grouped.set(key, { key, label: sourceLabel(col.code), columns: [] })
    }
    grouped.get(key)!.columns.push(col)
  }
  return [...grouped.values()]
}

function colSetting(code: string): ColumnSetting {
  return props.columnSettings[code] || {}
}

function isCountAggregation(value?: string) {
  return value === 'count' || value === 'count_distinct'
}

function isCountMetric(col: ColumnInfo) {
  return col.agg_role !== 'measure' && isCountAggregation(colSetting(col.code).aggregation)
}

function isMeasureLike(col: ColumnInfo) {
  return col.agg_role === 'measure' || isCountMetric(col)
}

function countAggOptions() {
  return AGG_FUNCS.filter((item) => isCountAggregation(item.value))
}

function updateSetting(code: string, patch: ColumnSetting) {
  emit('update:columnSettings', {
    ...props.columnSettings,
    [code]: { ...colSetting(code), ...patch },
  })
}

function clearSettingKey(code: string, key: keyof ColumnSetting) {
  const current = { ...colSetting(code) }
  delete current[key]
  emit('update:columnSettings', {
    ...props.columnSettings,
    [code]: current,
  })
}

function displayLabel(col: ColumnInfo) {
  return colSetting(col.code).display_name || cleanFieldLabel(col)
}

function aggRoleOf(code: string) {
  return props.allColumns.find((item) => item.code === code)?.agg_role
}

function addColumn(code: string) {
  if (props.selectedCodes.includes(code)) return
  const next = [...props.selectedCodes]
  if (aggRoleOf(code) === 'measure') {
    next.push(code)
  } else {
    const firstMeasureIndex = next.findIndex((item) => aggRoleOf(item) === 'measure')
    next.splice(firstMeasureIndex >= 0 ? firstMeasureIndex : next.length, 0, code)
  }
  emit('update:selectedCodes', next)
}

function removeColumn(code: string) {
  emit('update:selectedCodes', props.selectedCodes.filter((item) => item !== code))
}

function reorderColumn(code: string, targetCode: string) {
  if (!code || !targetCode || code === targetCode) return
  const next = [...props.selectedCodes]
  const from = next.indexOf(code)
  const to = next.indexOf(targetCode)
  if (from < 0 || to < 0) return
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  emit('update:selectedCodes', next)
}

function sourceTableLabel(code: string) {
  const label = sourceLabel(code)
  const alias = sourceKey(code)
  if (alias === 'calc') return label
  return label
}

function fieldSource(col: ColumnInfo) {
  return `${sourceTableLabel(col.code)}.${cleanFieldLabel(col)}`
}

function defaultAggregationValue() {
  return (props.defaultAggregation || 'sum') as AggregationFunc
}

function effectiveAggregation(col: ColumnInfo) {
  return (colSetting(col.code).aggregation || defaultAggregationValue()) as AggregationFunc
}

function fieldAggregationLabel(col: ColumnInfo) {
  if (isCountMetric(col)) return reportAggLabel(colSetting(col.code).aggregation)
  if (col.agg_role !== 'measure') return '分组'
  return reportAggLabel(effectiveAggregation(col))
}

function setDefaultAggregation(value: string) {
  emit('update:defaultAggregation', value as AggregationFunc)
}

function setAggregate(value: boolean) {
  emit('update:aggregate', value)
  if (!value && props.roundingGroupBy.length) {
    emit('update:roundingGroupBy', [])
  }
}

function setOutputMode(value: string | number | boolean) {
  setAggregate(value === true || value === 'true' || value === 1 || value === '1')
}

function setAggregation(code: string, value: string) {
  updateSetting(code, { aggregation: value as ColumnSetting['aggregation'] })
}

function resetAggregation(code: string) {
  clearSettingKey(code, 'aggregation')
}

function metricFilters(col: ColumnInfo): FilterCond[] {
  return colSetting(col.code).metric_filters || []
}

function metricFilterLogic(col: ColumnInfo): FilterLogic | null {
  return colSetting(col.code).metric_filter_logic || null
}

function metricFilterSummary(col: ColumnInfo) {
  const count = metricFilters(col).filter((item) => item.column).length
  return count ? `指标筛选 ${count} 条` : ''
}

function metricFilterCount(col: ColumnInfo) {
  return metricFilters(col).filter((item) => item.column).length
}

function cloneMetricFilters(filters: FilterCond[] = []): FilterCond[] {
  return filters.map((item) => ({ ...item }))
}

function openMetricFilterDialog(col: ColumnInfo) {
  metricFilterCol.value = col
  metricFilterDraft.value = cloneMetricFilters(metricFilters(col))
  metricFilterLogicDraft.value = metricFilterLogic(col)
    ? { ...metricFilterLogic(col)! }
    : null
  metricFilterOpen.value = true
}

function clearMetricFilterDraft() {
  metricFilterDraft.value = []
  metricFilterLogicDraft.value = null
}

function setMetricFilterDraft(filters: FilterCond[]) {
  metricFilterDraft.value = filters
}

function setMetricFilterLogicDraft(logic: FilterLogic | null) {
  metricFilterLogicDraft.value = logic
}

function confirmMetricFilterDialog() {
  if (!metricFilterCol.value) return
  updateSetting(metricFilterCol.value.code, {
    metric_filters: cloneMetricFilters(metricFilterDraft.value),
    metric_filter_logic: metricFilterLogicDraft.value,
  })
  metricFilterOpen.value = false
}

function resetDisplayName(code: string) {
  updateSetting(code, { display_name: '' })
}

function toggleHidden(code: string) {
  updateSetting(code, { hidden: !colSetting(code).hidden })
}

function setSplitMode(code: string, value: string) {
  const patch: ColumnSetting = { split_mode: value as ColumnSetting['split_mode'] }
  if (value !== 'custom') patch.split_factors = []
  updateSetting(code, patch)
}

function splitFactors(code: string): string[] {
  const s = colSetting(code)
  return s.split_factors ?? (s.split_factor ? [s.split_factor] : [])
}

function setSplitFactor(code: string, i: number, value: string) {
  const next = [...splitFactors(code)]
  next[i] = value
  updateSetting(code, { split_mode: 'custom', split_factors: next, split_factor: undefined })
}

function addSplitFactor(code: string) {
  updateSetting(code, { split_mode: 'custom', split_factors: [...splitFactors(code), ''], split_factor: undefined })
}

function removeSplitFactor(code: string, i: number) {
  const next = [...splitFactors(code)]
  next.splice(i, 1)
  updateSetting(code, { split_mode: 'custom', split_factors: next, split_factor: undefined })
}

function defaultFactors(): string[] {
  return props.defaultSplitRule.factors ?? (props.defaultSplitRule.factor ? [props.defaultSplitRule.factor] : [])
}

function setDefaultFactor(i: number, value: string) {
  const next = [...defaultFactors()]
  next[i] = value
  emit('update:defaultSplitRule', { ...props.defaultSplitRule, factors: next, factor: undefined })
}

function addDefaultFactor() {
  emit('update:defaultSplitRule', { ...props.defaultSplitRule, factors: [...defaultFactors(), ''], factor: undefined })
}

function removeDefaultFactor(i: number) {
  const next = [...defaultFactors()]
  next.splice(i, 1)
  emit('update:defaultSplitRule', { ...props.defaultSplitRule, factors: next, factor: undefined })
}

function sourceCollapsed(key: string) {
  return collapsedSourceKeys.value.has(key)
}

function toggleSourceGroup(key: string) {
  const next = new Set(collapsedSourceKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedSourceKeys.value = next
}

function fieldSort(code: string) {
  return props.sorts?.find((item) => item.column === code)
}

function fieldSortIndex(code: string) {
  return props.sorts?.findIndex((item) => item.column === code) ?? -1
}

function fieldSortLabel(code: string) {
  const sort = fieldSort(code)
  if (!sort) return ''
  const order = sort.order === 'asc' ? '升序' : '降序'
  const index = fieldSortIndex(code)
  return index >= 0 ? `${order} ${index + 1}` : order
}

function setFieldSort(code: string, order: 'asc' | 'desc') {
  const next = [...(props.sorts || [])]
  const index = next.findIndex((item) => item.column === code)
  if (index >= 0) next[index] = { ...next[index], order }
  else next.push({ column: code, order })
  emit('update:sorts', next)
}

function clearFieldSort(code: string) {
  emit('update:sorts', (props.sorts || []).filter((item) => item.column !== code))
}

function openAdvanced(tab: AdvancedTab) {
  advancedTab.value = tab
  advancedOpen.value = true
}
</script>

<template>
  <div v-loading="loading" class="field-workbench">
    <aside class="available-panel">
      <div class="panel-head">
        <span>报表可选字段</span>
        <span class="available-head-actions">
          <el-button
            v-if="canCreateField"
            size="small"
            type="primary"
            plain
            @click="emit('createField')"
          >
            <el-icon><Plus /></el-icon>
            新建字段
          </el-button>
          <span>{{ availableCols.length }} 个</span>
        </span>
      </div>
      <div v-if="availableColumnGroups.length" class="source-groups">
        <section v-for="group in availableColumnGroups" :key="group.key" class="source-group">
          <button class="source-head" type="button" @click="toggleSourceGroup(group.key)">
            <span class="source-title">
              <el-icon>
                <component :is="sourceCollapsed(group.key) ? ArrowRight : ArrowDown" />
              </el-icon>
              {{ group.label }}
            </span>
            <span>{{ group.columns.length }} 个</span>
          </button>
            <div v-show="!sourceCollapsed(group.key)" class="available-list">
            <button
              v-for="col in group.columns"
              :key="col.code"
              class="available-field"
              type="button"
              @click="addColumn(col.code)"
            >
              <span class="field-main">
                <el-icon><Plus /></el-icon>
                <span class="field-name">{{ cleanFieldLabel(col) }}</span>
              </span>
              <span class="field-meta">
                <el-tag v-if="col.agg_role === 'measure'" size="small" type="success" effect="plain">指标</el-tag>
                <el-tag v-else size="small" effect="plain">维度</el-tag>
                <el-tag v-if="col.is_sensitive" size="small" type="danger" effect="plain">敏感</el-tag>
                <el-tag v-if="col.is_pk_part" size="small" type="primary" effect="plain">PK</el-tag>
                <el-button
                  v-if="col.code.startsWith('calc.') && canCreateField"
                  size="small"
                  type="primary"
                  link
                  @click.stop="emit('editField', col)"
                >
                  <el-icon><Edit /></el-icon>
                </el-button>
              </span>
              <span class="field-code">{{ col.code }}</span>
            </button>
          </div>
        </section>
      </div>
      <div v-else class="empty-grid">所有字段已加入</div>
    </aside>

    <main class="config-panel">
      <section class="config-section selected-panel">
        <div class="section-head">
          <div>
            <span class="section-title">字段编排</span>
            <span class="section-subtitle">{{ selectedCols.length }} 个字段</span>
          </div>
          <span class="section-actions">
            <el-tag size="small" effect="plain">{{ aggregate ? '汇总表' : '明细表' }}</el-tag>
            <el-button size="small" plain @click="openAdvanced('rules')">统计规则</el-button>
            <el-button v-if="$slots.reshape" size="small" plain @click="openAdvanced('reshape')">数据重塑</el-button>
            <el-button
              v-if="$slots.lookup"
              size="small"
              :type="lookupEnabled ? 'primary' : 'default'"
              :plain="!lookupEnabled"
              @click="openAdvanced('lookup')"
            >
              名单回查
            </el-button>
            <el-button
              v-if="$slots.push"
              size="small"
              :type="pushEnabled ? 'primary' : 'default'"
              :plain="!pushEnabled"
              @click="openAdvanced('push')"
            >
              推送配置
              <span v-if="pushTargetCount" class="menu-command-badge">{{ pushTargetCount }}</span>
            </el-button>
          </span>
        </div>

        <div class="field-rows">
          <section
            v-for="group in selectedFieldGroups"
            :key="group.key"
            class="selected-row"
            :class="`is-${group.key}`"
          >
            <div class="row-label">
              <span>{{ group.title }}</span>
              <span>{{ group.count }}</span>
            </div>
            <div v-if="group.columns.length" class="selected-grid">
              <div
                v-for="col in group.columns"
                :key="col.code"
                class="selected-shell"
                :class="{ 'is-dragging': draggingCode === col.code, 'is-hidden': colSetting(col.code).hidden }"
                draggable="true"
                @dragstart="draggingCode = col.code"
                @dragend="draggingCode = ''"
                @dragover.prevent
                @drop.prevent="reorderColumn(draggingCode, col.code); draggingCode = ''"
              >
                <div
                  class="selected-field"
                  :class="{
                    'is-hidden': colSetting(col.code).hidden,
                    'is-dimension': !isMeasureLike(col),
                    'is-measure': isMeasureLike(col),
                  }"
                >
                  <span class="drag-handle" title="拖动字段调整顺序">
                    <el-icon><Rank /></el-icon>
                  </span>
                  <el-tooltip :content="fieldSource(col)" placement="top" :show-after="350">
                    <button class="field-label-button" type="button">
                      <span class="field-name">{{ displayLabel(col) }}</span>
                    </button>
                  </el-tooltip>
                  <span v-if="aggregate" class="field-agg-badge" :class="{ 'is-dimension': !isMeasureLike(col) }">
                    {{ fieldAggregationLabel(col) }}
                  </span>
                  <button
                    v-if="aggregate && metricFilterCount(col)"
                    class="field-filter-badge"
                    type="button"
                    title="编辑指标筛选"
                    draggable="false"
                    @click.stop="openMetricFilterDialog(col)"
                    @mousedown.stop
                  >
                    <el-icon><Filter /></el-icon>
                    {{ metricFilterCount(col) }}
                  </button>
                  <span v-if="fieldSortLabel(col.code)" class="field-sort-badge">{{ fieldSortLabel(col.code) }}</span>
                  <el-popover
                    trigger="click"
                    placement="bottom-start"
                    :width="280"
                    popper-class="field-config-popper"
                  >
                    <template #reference>
                      <button
                        class="field-config-button"
                        type="button"
                        title="字段设置"
                        draggable="false"
                        @dragstart.stop.prevent
                        @mousedown.stop
                      >
                        <el-icon><ArrowDown /></el-icon>
                      </button>
                    </template>
                    <div class="field-menu">
                      <div class="menu-block">
                        <div class="menu-title">字段操作</div>
                        <div class="menu-row">
                          <el-button
                            v-if="col.code.startsWith('calc.') && canCreateField"
                            size="small"
                            type="primary"
                            plain
                            @click="emit('editField', col)"
                          >
                            <el-icon><Edit /></el-icon>
                            编辑公式
                          </el-button>
                          <el-button size="small" type="danger" plain @click="removeColumn(col.code)">
                            <el-icon><Close /></el-icon>
                            移除字段
                          </el-button>
                        </div>
                      </div>

                      <div v-if="sorts" class="menu-block">
                        <div class="menu-title">排序</div>
                        <div class="sort-actions">
                          <button
                            class="agg-option"
                            :class="{ 'is-active': fieldSort(col.code)?.order === 'asc' }"
                            @click="setFieldSort(col.code, 'asc')"
                          >
                            升序
                          </button>
                          <button
                            class="agg-option"
                            :class="{ 'is-active': fieldSort(col.code)?.order === 'desc' }"
                            @click="setFieldSort(col.code, 'desc')"
                          >
                            降序
                          </button>
                        </div>
                        <button
                          v-if="fieldSort(col.code)"
                          class="menu-link-command"
                          @click="clearFieldSort(col.code)"
                        >
                          取消排序
                        </button>
                      </div>

                      <div v-if="aggregate" class="menu-block">
                        <div class="menu-title">统计类型</div>
                        <template v-if="col.agg_role === 'measure'">
                          <div class="agg-options">
                            <button
                              v-for="item in AGG_FUNCS"
                              :key="item.value"
                              class="agg-option"
                              :class="{ 'is-active': effectiveAggregation(col) === item.value }"
                              @click="setAggregation(col.code, item.value)"
                            >
                              {{ item.label }}
                            </button>
                          </div>
                          <button
                            v-if="colSetting(col.code).aggregation"
                            class="menu-link-command"
                            @click="resetAggregation(col.code)"
                          >
                            恢复默认统计类型（{{ reportAggLabel(defaultAggregationValue()) }}）
                          </button>
                        </template>
                        <template v-else>
                          <div class="agg-options">
                            <button
                              v-for="item in countAggOptions()"
                              :key="item.value"
                              class="agg-option"
                              :class="{ 'is-active': colSetting(col.code).aggregation === item.value }"
                              @click="setAggregation(col.code, item.value)"
                            >
                              {{ item.label }}
                            </button>
                          </div>
                          <button
                            v-if="colSetting(col.code).aggregation"
                            class="menu-link-command"
                            @click="resetAggregation(col.code)"
                          >
                            恢复为分组维度
                          </button>
                          <div class="menu-note">维度字段默认作为分组；选择计数/去重计数后会作为统计指标。</div>
                        </template>
                      </div>

                      <div v-if="aggregate && isMeasureLike(col)" class="menu-block">
                        <button class="menu-command" @click="openMetricFilterDialog(col)">
                          指标筛选...
                          <span v-if="metricFilterSummary(col)" class="menu-command-badge">
                            {{ metricFilterCount(col) }}
                          </span>
                        </button>
                        <div class="menu-note">只影响当前指标，不过滤整张报表。</div>
                      </div>

                      <div class="menu-block">
                        <div class="menu-title">设置显示名</div>
                        <div class="menu-row">
                          <el-input
                            :model-value="colSetting(col.code).display_name || ''"
                            :placeholder="cleanFieldLabel(col)"
                            size="small"
                            style="width: 180px"
                            @update:model-value="(v: string) => updateSetting(col.code, { display_name: v })"
                          />
                          <el-button size="small" link @click="resetDisplayName(col.code)">恢复</el-button>
                        </div>
                      </div>

                      <div v-if="isDataset && col.agg_role === 'measure'" class="menu-block">
                        <div class="menu-title">数值拆分</div>
                        <el-select
                          :model-value="colSetting(col.code).split_mode || 'default'"
                          size="small"
                          style="width: 180px"
                          @update:model-value="(v: string) => setSplitMode(col.code, v)"
                        >
                          <el-option label="使用默认规则" value="default" />
                          <el-option label="不拆分" value="none" />
                          <el-option label="自定义系数" value="custom" />
                        </el-select>
                        <template v-if="colSetting(col.code).split_mode === 'custom'">
                          <div
                            v-for="(fac, i) in splitFactors(col.code)"
                            :key="i"
                            style="display: flex; gap: 4px; align-items: center; margin-top: 8px"
                          >
                            <span v-if="i > 0" style="color: var(--color-text-secondary); font-size: 12px">×</span>
                            <el-select
                              :model-value="fac"
                              size="small"
                              filterable
                              clearable
                              placeholder="选择系数字段"
                              style="width: 150px"
                              @update:model-value="(v: string) => setSplitFactor(col.code, i, v)"
                            >
                              <el-option v-for="item in numericAllCols" :key="item.code" :label="item.label" :value="item.code" />
                            </el-select>
                            <el-button link type="danger" size="small" @click="removeSplitFactor(col.code, i)">
                              <el-icon><Delete /></el-icon>
                            </el-button>
                          </div>
                          <el-button link type="primary" size="small" style="margin-top: 6px" @click="addSplitFactor(col.code)">
                            <el-icon style="margin-right: 2px"><Plus /></el-icon>添加系数
                          </el-button>
                        </template>
                      </div>

                      <div class="menu-block">
                        <button class="menu-command" @click="toggleHidden(col.code)">
                          <el-icon><component :is="colSetting(col.code).hidden ? View : Hide" /></el-icon>
                          {{ colSetting(col.code).hidden ? '取消隐藏' : '隐藏' }}
                        </button>
                      </div>
                    </div>
                  </el-popover>
                </div>
              </div>
            </div>
            <div v-else class="row-empty">{{ group.empty }}</div>
          </section>
        </div>
      </section>

      <section v-if="$slots.filters" class="config-section">
        <div class="section-head">
          <span class="section-title">筛选条件</span>
        </div>
        <slot name="filters" />
      </section>
    </main>

    <el-dialog
      v-model="metricFilterOpen"
      :title="`${metricFilterCol ? displayLabel(metricFilterCol) : '指标'} · 指标筛选`"
      width="760px"
      class="metric-filter-dialog"
      destroy-on-close
    >
      <div class="metric-filter-dialog-body">
        <div class="metric-filter-explain">
          <strong>只过滤当前指标参与统计的明细行</strong>
          <span>例如给“正式员工管理幅宽”设置 sub.employee_type = 正式员工，经理维度行仍会保留，没有正式下属时指标显示为 0。</span>
        </div>
        <ReportFilterList
          :filters="metricFilterDraft"
          :filter-logic="metricFilterLogicDraft"
          :all-columns="allColumns"
          :current-dataset-tables="currentDatasetTables"
          :show-view-controls="false"
          compact
          @update:filters="setMetricFilterDraft"
          @update:filter-logic="setMetricFilterLogicDraft"
        />
      </div>
      <template #footer>
        <div class="metric-filter-footer">
          <el-button text type="danger" @click="clearMetricFilterDraft">清空条件</el-button>
          <span class="footer-spacer" />
          <el-button @click="metricFilterOpen = false">取消</el-button>
          <el-button type="primary" @click="confirmMetricFilterDialog">确定</el-button>
        </div>
      </template>
    </el-dialog>

    <el-drawer
      v-model="advancedOpen"
      :with-header="false"
      size="min(1120px, 92vw)"
      append-to-body
      class="workbench-drawer advanced-config-drawer"
    >
      <div class="advanced-shell">
        <div class="advanced-topbar">
          <div class="advanced-tab-buttons">
            <button class="advanced-tab-btn" :class="{ active: advancedTab === 'rules' }" @click="advancedTab = 'rules'">统计规则</button>
            <button class="advanced-tab-btn" :class="{ active: advancedTab === 'reshape' }" @click="advancedTab = 'reshape'">数据重塑</button>
            <button v-if="$slots.lookup" class="advanced-tab-btn" :class="{ active: advancedTab === 'lookup' }" @click="advancedTab = 'lookup'">名单回查</button>
            <button v-if="$slots.push" class="advanced-tab-btn" :class="{ active: advancedTab === 'push' }" @click="advancedTab = 'push'">推送配置</button>
          </div>
          <div class="advanced-meta-inline">
            <strong>{{ advancedMeta.title }}</strong>
            <span>{{ advancedMeta.desc }}</span>
          </div>
          <el-button class="advanced-close" text circle :icon="Close" @click="advancedOpen = false" />
        </div>

        <el-tabs v-model="advancedTab" class="advanced-tabs advanced-tabs-content-only">
          <el-tab-pane label="统计规则" name="rules">
            <div class="rules-panel">
              <div class="rules-banner">
                <strong>出数口径</strong>
                <span>这些规则会影响报表结果的粒度、金额拆分和汇总后的尾差处理。</span>
              </div>
              <div class="rule-grid">
                <div class="rule-item">
                  <span class="option-label">出数类型</span>
                  <el-radio-group :model-value="aggregate" size="small" @change="setOutputMode">
                    <el-radio-button :label="false">明细表</el-radio-button>
                    <el-radio-button :label="true">汇总表</el-radio-button>
                  </el-radio-group>
                  <p>明细表保留原始行；汇总表会按维度字段分组并统计指标。</p>
                </div>

                <div class="rule-item">
                  <span class="option-label">默认统计</span>
                  <el-select
                    :model-value="defaultAggregationValue()"
                    :disabled="!aggregate"
                    size="small"
                    style="width: 160px"
                    @update:model-value="setDefaultAggregation"
                  >
                    <el-option v-for="item in AGG_FUNCS" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                  <p>没有单独设置统计方式的指标，会使用这里的默认值。</p>
                </div>

                <div v-if="isDataset" class="rule-item rule-item-wide">
                  <span class="option-label">默认拆分</span>
                  <el-switch
                    :model-value="defaultSplitRule.enabled"
                    active-text="启用"
                    inactive-text="关闭"
                    @update:model-value="(v: boolean) => emit('update:defaultSplitRule', { ...defaultSplitRule, enabled: v })"
                  />
                  <div
                    v-for="(fac, i) in defaultFactors()"
                    :key="i"
                    style="display: flex; gap: 6px; align-items: center; margin-top: 6px"
                  >
                    <span v-if="i > 0" style="color: var(--color-text-secondary); font-size: 13px">×</span>
                    <el-select
                      :model-value="fac"
                      :disabled="!defaultSplitRule.enabled"
                      filterable
                      clearable
                      placeholder="选择系数字段"
                      style="width: min(280px, 100%)"
                      @update:model-value="(v: string) => setDefaultFactor(i, v)"
                    >
                      <el-option v-for="item in numericAllCols" :key="item.code" :label="item.label" :value="item.code" />
                    </el-select>
                    <el-button link type="danger" :disabled="!defaultSplitRule.enabled" @click="removeDefaultFactor(i)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                  <el-button
                    link
                    type="primary"
                    :disabled="!defaultSplitRule.enabled"
                    style="margin-top: 6px"
                    @click="addDefaultFactor"
                  >
                    <el-icon style="margin-right: 2px"><Plus /></el-icon>添加系数
                  </el-button>
                  <p>多个系数会连乘（金额 × 系数1 × 系数2 …）；单个字段仍可覆盖默认规则。</p>
                </div>

                <div v-if="isDataset" class="rule-item rule-item-wide">
                  <span class="option-label">余差收口</span>
                  <el-select
                    :model-value="roundingGroupBy"
                    :disabled="!aggregate"
                    multiple
                    filterable
                    clearable
                    :placeholder="aggregate ? '选择一个或多个分组维度' : '汇总表可选'"
                    style="width: min(520px, 100%)"
                    @update:model-value="(v: string[]) => emit('update:roundingGroupBy', v)"
                  >
                    <el-option v-for="item in selectedDimensions" :key="item.code" :label="item.label" :value="item.code" />
                  </el-select>
                  <p>汇总后按这些维度做尾差归集，减少四舍五入造成的金额差异。</p>
                </div>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane v-if="$slots.reshape" label="数据重塑" name="reshape">
            <slot name="reshape" />
          </el-tab-pane>
          <el-tab-pane v-if="$slots.lookup" label="名单回查" name="lookup">
            <slot name="lookup" />
          </el-tab-pane>
          <el-tab-pane v-if="$slots.push" label="推送配置" name="push">
            <slot name="push" />
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.field-workbench {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  min-height: 560px;
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  background: var(--color-bg-elevated);
  overflow: hidden;
}
.available-panel {
  min-width: 0;
  padding: 10px 10px 12px;
  border-right: 1px solid var(--color-border-light);
  background: #fff;
}
.config-panel {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
  padding: 14px 16px 16px;
  background: var(--color-bg-page);
}
.config-section {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: #fff;
}
.section-head,
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.section-head > div {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.section-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: none;
}
.section-title {
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 700;
}
.section-subtitle {
  color: var(--color-text-placeholder);
  font-size: 12px;
}
.available-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.source-groups {
  display: grid;
  gap: 8px;
  max-height: min(68vh, 720px);
  overflow-y: auto;
  padding-right: 2px;
}
.source-group {
  display: grid;
  gap: 4px;
}
.source-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 6px;
  border: 0;
  border-radius: 4px;
  background: var(--color-bg-soft);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.source-head:hover {
  color: var(--color-primary);
  background: var(--color-primary-light);
}
.source-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.available-list {
  display: grid;
  gap: 0;
}
.available-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 5px 6px;
  min-height: 38px;
  padding: 7px 6px;
  border: 0;
  border-bottom: 1px solid var(--color-border-light);
  border-radius: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.available-field:hover {
  background: var(--color-primary-light);
}
.field-rows {
  display: grid;
  gap: 10px;
}
.selected-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  min-width: 0;
}
.selected-row.is-dimension {
  --selected-color: #245edb;
  --selected-bg: rgba(36, 94, 219, 0.08);
}
.selected-row.is-measure {
  --selected-color: #0f8a72;
  --selected-bg: rgba(15, 138, 114, 0.08);
}
.row-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 40px;
  padding: 10px 8px 0 0;
  color: var(--selected-color);
  font-size: 12px;
  font-weight: 700;
  border-right: 3px solid var(--selected-color);
}
.selected-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  min-width: 0;
}
.row-empty,
.empty-grid {
  min-height: 40px;
  padding: 10px 12px;
  border: 1px dashed var(--color-border-light);
  border-radius: 6px;
  color: var(--color-text-placeholder);
  font-size: 13px;
}
.option-label {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}
.workbench-drawer :deep(.el-drawer__body) {
  display: flex;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: var(--color-bg-page);
}
.advanced-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}
.advanced-topbar {
  position: sticky;
  top: 0;
  z-index: 4;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  padding: 10px 18px 8px 22px;
  border-bottom: 1px solid var(--color-border-light);
  background: rgba(247, 249, 252, 0.96);
  backdrop-filter: blur(10px);
}
.advanced-tab-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.advanced-tab-btn {
  position: relative;
  border: 0;
  border-radius: 9px;
  padding: 8px 12px;
  background: transparent;
  color: var(--color-text-regular);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  transition: all 0.18s ease;
}
.advanced-tab-btn:hover {
  color: var(--color-primary);
  background: rgba(47, 107, 255, 0.08);
}
.advanced-tab-btn.active {
  color: var(--color-primary);
  background: #fff;
  box-shadow: inset 0 -2px 0 var(--color-primary), 0 1px 4px rgba(15, 23, 42, 0.06);
}
.advanced-meta-inline {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  color: var(--color-text-secondary);
}
.advanced-meta-inline strong {
  flex: 0 0 auto;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 800;
}
.advanced-meta-inline span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.5;
}
.advanced-close {
  color: var(--color-text-secondary);
}
.advanced-tabs {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  padding: 16px 22px 22px;
}
.advanced-tabs-content-only > :deep(.el-tabs__header) {
  display: none;
}
.advanced-tabs > :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}
.rules-panel {
  display: grid;
  gap: 14px;
}
.rules-banner {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
  background: #fff;
}
.rules-banner strong {
  color: var(--color-text-primary);
  font-size: 14px;
}
.rules-banner span,
.rule-item p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(260px, 1fr));
  gap: 12px;
}
.rule-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
  background: #fff;
}
.rule-item-wide {
  grid-column: span 2;
}
.rule-item p {
  flex-basis: 100%;
}
.selected-shell {
  position: relative;
  display: flex;
  min-width: 0;
  cursor: grab;
}
.selected-shell.is-dragging {
  opacity: 0.55;
}
.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 100%;
  padding: 0;
  border: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.22);
  background: transparent;
  color: rgba(255, 255, 255, 0.84);
  pointer-events: none;
}
.selected-shell:active {
  cursor: grabbing;
}
.selected-field {
  display: flex;
  align-items: center;
  width: 100%;
  height: 40px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  background: var(--color-primary);
  color: #fff;
}
.selected-field.is-dimension {
  border-color: #245edb;
  background: #2f6bea;
}
.selected-field.is-measure {
  border-color: #0f8a72;
  background: #11967d;
}
.field-label-button {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: grab;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  user-select: none;
}
.field-agg-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  max-width: 70px;
  height: 22px;
  margin-right: 6px;
  padding: 0 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.field-agg-badge.is-dimension {
  background: rgba(255, 255, 255, 0.12);
  font-weight: 600;
}
.field-sort-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  max-width: 76px;
  height: 22px;
  margin-right: 6px;
  padding: 0 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.field-filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex: none;
  height: 22px;
  margin-right: 6px;
  padding: 0 7px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
}
.field-filter-badge:hover {
  background: rgba(255, 255, 255, 0.34);
}
.field-filter-badge .el-icon {
  font-size: 13px;
}
.field-config-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 34px;
  height: 100%;
  padding: 0;
  border: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.22);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.field-config-button:hover {
  background: rgba(255, 255, 255, 0.14);
}
.menu-command-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-left: auto;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}
.metric-filter-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
}
.metric-filter-dialog-body {
  display: grid;
  gap: 14px;
}
.metric-filter-explain {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid rgba(20, 86, 240, 0.16);
  border-radius: 12px;
  background:
    radial-gradient(circle at 0 0, rgba(20, 86, 240, 0.12), transparent 30%),
    linear-gradient(135deg, #f8fbff 0%, #fff 100%);
}
.metric-filter-explain strong {
  color: var(--color-text-primary);
  font-size: 14px;
}
.metric-filter-explain span {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.metric-filter-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.footer-spacer {
  flex: 1;
}
.selected-field:hover {
  filter: brightness(0.98);
}
.selected-field.is-hidden {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.selected-shell.is-hidden .drag-handle {
  color: var(--color-primary);
}
.selected-field.is-hidden .drag-handle,
.selected-field.is-hidden .field-config-button {
  border-color: rgba(20, 86, 240, 0.22);
}
.selected-field.is-hidden .field-agg-badge {
  background: rgba(20, 86, 240, 0.12);
  color: var(--color-primary);
}
.field-main,
.field-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.field-main {
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
}
.field-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.field-code {
  overflow: hidden;
  color: var(--color-text-placeholder);
  font-family: monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.field-menu {
  padding: 4px 0;
}
.menu-block {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border-light);
}
.menu-block:last-child {
  border-bottom: 0;
}
.menu-title {
  margin-bottom: 6px;
  color: var(--color-text-placeholder);
  font-size: 12px;
  font-weight: 700;
}
.menu-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.agg-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.sort-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.agg-option {
  height: 28px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: #fff;
  color: var(--color-text-regular);
  cursor: pointer;
  font-size: 12px;
}
.agg-option.is-active {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 700;
}
.menu-note {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.menu-link-command {
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 12px;
}
.menu-command {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--color-text-regular);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}
@media (max-width: 1180px) {
  .field-workbench {
    grid-template-columns: 1fr;
  }
  .available-panel {
    border-right: 0;
    border-bottom: 1px solid var(--color-border-light);
  }
  .source-groups {
    max-height: 360px;
  }
}
@media (max-width: 900px) {
  .advanced-tabs {
    padding: 0 14px 16px;
  }
  .advanced-topbar {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: flex-start;
    padding: 10px 12px;
  }
  .advanced-tab-buttons {
    flex-wrap: wrap;
  }
  .advanced-meta-inline {
    grid-column: 1 / -1;
    order: 2;
  }
  .advanced-meta-inline span {
    white-space: normal;
  }
  .rule-grid {
    grid-template-columns: 1fr;
  }
  .rule-item-wide {
    grid-column: span 1;
  }
  .selected-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .row-label {
    min-height: auto;
    padding-top: 0;
    justify-content: flex-start;
  }
}
</style>
