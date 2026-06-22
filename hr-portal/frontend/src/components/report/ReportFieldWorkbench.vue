<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowRight, Close, Edit, Hide, Plus, Rank, View } from '@element-plus/icons-vue'
import type { ColumnInfo } from '@/api/data'
import type { AggregationFunc, ColumnSetting, DefaultSplitRule, SortCond } from '@/api/reports'
import { REPORT_AGG_FUNCS, reportAggLabel } from '@/constants/reportAggregation'

const props = defineProps<{
  selectedCodes: string[]
  allColumns: ColumnInfo[]
  sourceGroups?: { key: string; label: string }[]
  columnSettings: Record<string, ColumnSetting>
  defaultSplitRule: DefaultSplitRule
  defaultAggregation?: AggregationFunc
  aggregate: boolean
  roundingGroupBy: string[]
  sorts?: SortCond[]
  lookupEnabled?: boolean
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

const selectedDimensions = computed(() => selectedCols.value.filter((item) => item.agg_role !== 'measure'))
const selectedMeasures = computed(() => selectedCols.value.filter((item) => item.agg_role === 'measure'))
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
const collapsedSourceKeys = ref<Set<string>>(new Set())
const advancedOpen = ref(false)
const advancedTab = ref<'rules' | 'reshape' | 'lookup'>('rules')
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
  }
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

function resetDisplayName(code: string) {
  updateSetting(code, { display_name: '' })
}

function toggleHidden(code: string) {
  updateSetting(code, { hidden: !colSetting(code).hidden })
}

function setSplitMode(code: string, value: string) {
  const patch: ColumnSetting = { split_mode: value as ColumnSetting['split_mode'] }
  if (value !== 'custom') patch.split_factor = ''
  updateSetting(code, patch)
}

function setSplitFactor(code: string, value: string) {
  updateSetting(code, { split_mode: 'custom', split_factor: value })
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

function openAdvanced(tab: 'rules' | 'reshape' | 'lookup') {
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
                    'is-dimension': col.agg_role !== 'measure',
                    'is-measure': col.agg_role === 'measure',
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
                  <span v-if="aggregate" class="field-agg-badge" :class="{ 'is-dimension': col.agg_role !== 'measure' }">
                    {{ fieldAggregationLabel(col) }}
                  </span>
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
                        <div v-else class="menu-note">维度字段在汇总模式下作为分组维度，等同于不汇总。</div>
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
                        <el-select
                          v-if="colSetting(col.code).split_mode === 'custom'"
                          :model-value="colSetting(col.code).split_factor || ''"
                          size="small"
                          filterable
                          clearable
                          placeholder="选择系数字段"
                          style="width: 180px; margin-top: 8px"
                          @update:model-value="(v: string) => setSplitFactor(col.code, v)"
                        >
                          <el-option v-for="item in numericAllCols" :key="item.code" :label="item.label" :value="item.code" />
                        </el-select>
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

    <el-drawer
      v-model="advancedOpen"
      title="高级配置"
      size="min(1120px, 92vw)"
      append-to-body
      class="workbench-drawer"
    >
      <div class="advanced-shell">
        <section class="advanced-intro">
          <div>
            <span>当前配置</span>
            <strong>{{ advancedMeta.title }}</strong>
            <p>{{ advancedMeta.desc }}</p>
          </div>
        </section>

        <el-tabs v-model="advancedTab" class="advanced-tabs">
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
                  <el-select
                    :model-value="defaultSplitRule.factor || ''"
                    :disabled="!defaultSplitRule.enabled"
                    filterable
                    clearable
                    placeholder="选择统一系数字段"
                    style="width: min(320px, 100%)"
                    @update:model-value="(v: string) => emit('update:defaultSplitRule', { ...defaultSplitRule, factor: v })"
                  >
                    <el-option v-for="item in numericAllCols" :key="item.code" :label="item.label" :value="item.code" />
                  </el-select>
                  <p>适合需要按统一比例分摊指标的场景，单个字段仍可覆盖默认规则。</p>
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
.advanced-intro {
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--color-border-light);
  background:
    radial-gradient(circle at 0 0, rgba(20, 86, 240, 0.12), transparent 28%),
    linear-gradient(135deg, #fff 0%, var(--color-bg-soft) 100%);
}
.advanced-intro > div {
  display: grid;
  gap: 4px;
}
.advanced-intro span {
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.advanced-intro strong {
  color: var(--color-text-primary);
  font-size: 18px;
  line-height: 1.3;
}
.advanced-intro p {
  max-width: 760px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.advanced-tabs {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  padding: 0 22px 22px;
}
.advanced-tabs :deep(.el-tabs__header) {
  position: sticky;
  top: 0;
  z-index: 2;
  margin: 0 0 16px;
  padding-top: 10px;
  background: var(--color-bg-page);
}
.advanced-tabs :deep(.el-tabs__content) {
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
  .advanced-intro {
    padding: 16px;
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
