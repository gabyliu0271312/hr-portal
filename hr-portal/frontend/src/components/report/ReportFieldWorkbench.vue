<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, Close, Hide, Plus, Rank, View } from '@element-plus/icons-vue'
import type { ColumnInfo } from '@/api/data'
import type { AggregationFunc, ColumnSetting, DefaultSplitRule } from '@/api/reports'
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
  isDataset?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:selectedCodes': [v: string[]]
  'update:columnSettings': [v: Record<string, ColumnSetting>]
  'update:defaultSplitRule': [v: DefaultSplitRule]
  'update:defaultAggregation': [v: AggregationFunc]
  'update:aggregate': [v: boolean]
  'update:roundingGroupBy': [v: string[]]
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
const numericAllCols = computed(() =>
  props.allColumns.filter((item) => item.agg_role === 'measure' || item.data_type === 'number')
)
const draggingCode = ref('')

function sourceKey(code: string) {
  return props.isDataset && code.includes('.') ? code.slice(0, code.indexOf('.')) : 'current'
}

function sourceLabel(code: string) {
  const key = sourceKey(code)
  if (!props.isDataset) return '当前报表'
  return props.sourceGroups?.find((item) => item.key === key)?.label || key
}

function cleanFieldLabel(col: ColumnInfo) {
  const prefix = `${sourceKey(col.code)}.`
  return props.isDataset && col.label.startsWith(prefix) ? col.label.slice(prefix.length) : col.label
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

function addColumn(code: string) {
  if (props.selectedCodes.includes(code)) return
  emit('update:selectedCodes', [...props.selectedCodes, code])
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
  return props.isDataset ? alias : label
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
</script>

<template>
  <div v-loading="loading" class="field-workbench">
    <div class="output-rules-panel">
      <div class="panel-head">
        <span>出数规则</span>
        <span>{{ aggregate ? '聚合' : '明细' }}</span>
      </div>
      <div class="rule-grid">
        <div class="rule-item">
          <span class="option-label">出数模式</span>
          <el-radio-group :model-value="aggregate" size="small" @change="setOutputMode">
            <el-radio-button :label="false">明细</el-radio-button>
            <el-radio-button :label="true">聚合</el-radio-button>
          </el-radio-group>
        </div>

        <div class="rule-item">
          <span class="option-label">默认统计</span>
          <el-select
            :model-value="defaultAggregationValue()"
            :disabled="!aggregate"
            size="small"
            style="width: 136px"
            @update:model-value="setDefaultAggregation"
          >
            <el-option v-for="item in AGG_FUNCS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
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
            style="width: min(260px, 100%)"
            @update:model-value="(v: string) => emit('update:defaultSplitRule', { ...defaultSplitRule, factor: v })"
          >
            <el-option v-for="item in numericAllCols" :key="item.code" :label="item.label" :value="item.code" />
          </el-select>
        </div>

        <div v-if="isDataset" class="rule-item rule-item-wide">
          <span class="option-label">余差收口</span>
          <el-select
            :model-value="roundingGroupBy"
            :disabled="!aggregate"
            multiple
            filterable
            clearable
            :placeholder="aggregate ? '选择一个或多个分组维度' : '聚合模式可选'"
            style="width: min(420px, 100%)"
            @update:model-value="(v: string[]) => emit('update:roundingGroupBy', v)"
          >
            <el-option v-for="item in selectedDimensions" :key="item.code" :label="item.label" :value="item.code" />
          </el-select>
        </div>
      </div>
    </div>

    <div class="selected-panel">
      <div class="panel-head">
        <span>已选字段</span>
        <span>{{ selectedCols.length }} 个</span>
      </div>
      <div v-if="selectedCols.length" class="field-grid selected-grid">
        <div
          v-for="(col, index) in selectedCols"
          :key="col.code"
          class="selected-shell"
          :class="{ 'is-dragging': draggingCode === col.code, 'is-hidden': colSetting(col.code).hidden }"
          draggable="true"
          @dragstart="draggingCode = col.code"
          @dragend="draggingCode = ''"
          @dragover.prevent
          @drop.prevent="reorderColumn(draggingCode, col.code); draggingCode = ''"
        >
          <div class="selected-field" :class="{ 'is-hidden': colSetting(col.code).hidden }">
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
                    <el-button size="small" type="danger" plain @click="removeColumn(col.code)">
                      <el-icon><Close /></el-icon>
                      移除字段
                    </el-button>
                  </div>
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
                  <div v-else class="menu-note">维度字段在聚合模式下作为分组维度，等同于不汇总。</div>
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
      <div v-else class="empty-grid">从下方单击字段加入报表</div>
    </div>

    <div class="available-panel">
      <div class="panel-head">
        <span>可选字段</span>
        <span>{{ availableCols.length }} 个</span>
      </div>
      <div v-if="availableColumnGroups.length" class="source-groups">
        <section v-for="group in availableColumnGroups" :key="group.key" class="source-group">
          <div class="source-head">
            <span>{{ group.label }}</span>
            <span>{{ group.columns.length }} 个</span>
          </div>
          <div class="field-grid">
            <button
              v-for="col in group.columns"
              :key="col.code"
              class="field-card available-field"
              @click="addColumn(col.code)"
            >
              <span class="field-main">
                <el-icon><Plus /></el-icon>
                <span class="field-name">{{ cleanFieldLabel(col) }}</span>
              </span>
              <span class="field-meta">
                <el-tag v-if="col.agg_role === 'measure'" size="small" type="success" effect="plain">度量</el-tag>
                <el-tag v-else size="small" effect="plain">维度</el-tag>
                <el-tag v-if="col.is_sensitive" size="small" type="danger" effect="plain">敏感</el-tag>
                <el-tag v-if="col.is_pk_part" size="small" type="primary" effect="plain">PK</el-tag>
              </span>
              <span class="field-code">{{ col.code }}</span>
            </button>
          </div>
        </section>
      </div>
      <div v-else class="empty-grid">所有字段已加入</div>
    </div>
  </div>
</template>

<style scoped>
.field-workbench {
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  background: var(--color-bg-elevated);
  overflow: hidden;
}
.selected-panel {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-bg-page);
}
.option-label {
  flex: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}
.empty-grid {
  color: var(--color-text-placeholder);
  font-size: 13px;
}
.output-rules-panel {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-bg-elevated);
}
.rule-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px 14px;
}
.rule-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}
.rule-item-wide {
  grid-column: span 2;
}
@media (max-width: 900px) {
  .rule-item-wide {
    grid-column: span 1;
  }
}
.available-panel {
  padding: 12px 16px 16px;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.source-groups {
  display: grid;
  gap: 14px;
}
.source-group {
  display: grid;
  gap: 8px;
}
.source-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.available-panel .source-groups {
  max-height: min(52vh, 560px);
  overflow-y: auto;
  padding-right: 2px;
}
.selected-grid {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
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
.field-card {
  display: grid;
  gap: 5px;
  min-height: 70px;
  padding: 9px 10px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.available-field:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.selected-field {
  display: flex;
  align-items: center;
  width: 100%;
  height: 42px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  background: var(--color-primary);
  color: #fff;
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
.selected-field .field-main,
.selected-field .field-code {
  color: inherit;
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
.field-arrow {
  flex: none;
  margin-left: auto;
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
</style>
