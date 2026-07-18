<script setup lang="ts">
import { computed, ref } from 'vue'
import { Delete, InfoFilled, Plus } from '@element-plus/icons-vue'
import type { ColumnInfo } from '@/api/data'
import { dataApi } from '@/api/data'
import { REPORT_AGG_FUNCS } from '@/constants/reportAggregation'

interface TransposeDim {
  dim: string
  value: string
}

interface TransposeRule {
  source_col: string
  dims: TransposeDim[]
  target_cols: string[]
}

interface ColumnToRowConfig {
  enabled: boolean
  source_cols: string[]
  group_by: string[]
  item_label: string
  value_label: string
  conflict_strategy: string
}

interface PivotValue {
  value: string
  label?: string
}

interface RowToColumnConfig {
  enabled: boolean
  group_by: string[]
  pivot_col: string
  value_col: string
  pivot_values: PivotValue[]
  fill_value: string
  conflict_strategy: string
}

interface TransposeConfig {
  enabled: boolean
  drop_zero_measures: boolean
  rules: TransposeRule[]
  column_to_row?: ColumnToRowConfig
  row_to_column?: RowToColumnConfig
}

type SelectedColumn = ColumnInfo & { _instance_id?: string }

const props = defineProps<{
  transpose: TransposeConfig
  selectedDimensions: SelectedColumn[]
  selectedMeasures: SelectedColumn[]
  selectedColumns?: SelectedColumn[]
}>()

const emit = defineEmits<{
  'update:transpose': [v: TransposeConfig]
}>()

const ccNameOptions = ref<{ value: string; label: string; extra: string }[]>([])
const ccCodeOptions = ref<{ value: string; label: string }[]>([])
let ccMasterLoaded = false

const allSelectedColumns = computed(() => props.selectedColumns?.length
  ? props.selectedColumns
  : [...props.selectedDimensions, ...props.selectedMeasures]
)

function instanceIdOf(column: SelectedColumn): string {
  return column._instance_id || column.code
}

function sourceCode(instanceId: string): string {
  return instanceId.replace(/#\d+$/, '')
}

function columnLabel(column: SelectedColumn): string {
  const instanceId = instanceIdOf(column)
  if (instanceId === column.code) return column.label
  return `${column.label} (${instanceId.split('#').pop()})`
}

const activeTab = ref('remap')

const conflictOptions = computed(() => [
  { value: 'first', label: '取第一条' },
  { value: 'last', label: '取最后一条' },
  { value: 'join', label: '合并文本' },
  ...REPORT_AGG_FUNCS,
])

const columnToRowConflictOptions = computed(() => [
  { value: 'keep_all', label: '保留明细' },
  ...conflictOptions.value,
])

function defaultColumnToRow(): ColumnToRowConfig {
  return {
    enabled: false,
    source_cols: [],
    group_by: [],
    item_label: '项目',
    value_label: '金额',
    conflict_strategy: 'keep_all',
  }
}

function defaultRowToColumn(): RowToColumnConfig {
  return {
    enabled: false,
    group_by: [],
    pivot_col: '',
    value_col: '',
    pivot_values: [],
    fill_value: '--',
    conflict_strategy: 'first',
  }
}

const columnToRowEnabled = computed(() => (props.transpose.column_to_row || defaultColumnToRow()).enabled)
const rowToColumnEnabled = computed(() => (props.transpose.row_to_column || defaultRowToColumn()).enabled)

async function ensureCcMaster() {
  if (ccMasterLoaded) return
  ccMasterLoaded = true
  try {
    const names = await dataApi.distinct('cost_center_monthly', 'name', 'code')
    ccNameOptions.value = names.map((r) => ({
      value: r.value,
      label: r.extra ? `${r.value} (${r.extra})` : r.value,
      extra: r.extra || '',
    }))
    const codes = await dataApi.distinct('cost_center_monthly', 'code', 'name')
    ccCodeOptions.value = codes.map((r) => ({
      value: r.value,
      label: r.extra ? `${r.value} (${r.extra})` : r.value,
    }))
  } catch {
    ccMasterLoaded = false
  }
}

function tdimKind(qual: string): 'name' | 'code' | null {
  const source = sourceCode(qual)
  const t = source.includes('.') ? source.slice(source.indexOf('.') + 1) : source
  if (t === 'dimension_value' || t === 'name') return 'name'
  if (t === 'code') return 'code'
  return null
}

function onTransposeDimValue(rule: TransposeRule, d: TransposeDim) {
  if (tdimKind(d.dim) !== 'name') return
  const opt = ccNameOptions.value.find((o) => o.value === d.value)
  if (!opt || !opt.extra) return
  const codeQuals = props.selectedDimensions
    .filter((column) => tdimKind(instanceIdOf(column)) === 'code')
    .map(instanceIdOf)
  for (const cq of codeQuals) {
    const ex = rule.dims.find((x) => x.dim === cq)
    if (ex) ex.value = opt.extra
    else rule.dims.push({ dim: cq, value: opt.extra })
  }
}

function patch(changes: Partial<TransposeConfig>) {
  emit('update:transpose', { ...props.transpose, ...changes })
}

function patchColumnToRow(changes: Partial<ColumnToRowConfig>) {
  patch({ column_to_row: { ...defaultColumnToRow(), ...(props.transpose.column_to_row || {}), ...changes } })
}

function patchRowToColumn(changes: Partial<RowToColumnConfig>) {
  patch({ row_to_column: { ...defaultRowToColumn(), ...(props.transpose.row_to_column || {}), ...changes } })
}

function addRule() {
  patch({ rules: [...(props.transpose.rules || []), { source_col: '', dims: [{ dim: '', value: '' }], target_cols: [] }] })
}

function removeRule(i: number) {
  const rules = [...(props.transpose.rules || [])]
  rules.splice(i, 1)
  patch({ rules })
}

function addDimUpdate(ruleIdx: number) {
  const rules = (props.transpose.rules || []).map((r, i) =>
    i === ruleIdx ? { ...r, dims: [...r.dims, { dim: '', value: '' }] } : r
  )
  patch({ rules })
}

function removeDimUpdate(ruleIdx: number, dimIdx: number) {
  const rules = (props.transpose.rules || []).map((r, i) => {
    if (i !== ruleIdx) return r
    const dims = [...r.dims]
    dims.splice(dimIdx, 1)
    return { ...r, dims }
  })
  patch({ rules })
}

function addPivotValue() {
  const cfg = { ...defaultRowToColumn(), ...(props.transpose.row_to_column || {}) }
  patchRowToColumn({ pivot_values: [...cfg.pivot_values, { value: '', label: '' }] })
}

function removePivotValue(index: number) {
  const cfg = { ...defaultRowToColumn(), ...(props.transpose.row_to_column || {}) }
  const values = [...cfg.pivot_values]
  values.splice(index, 1)
  patchRowToColumn({ pivot_values: values })
}

function updatePivotValue(index: number, patchValue: Partial<PivotValue>) {
  const cfg = { ...defaultRowToColumn(), ...(props.transpose.row_to_column || {}) }
  const values = cfg.pivot_values.map((item, i) => (i === index ? { ...item, ...patchValue } : item))
  patchRowToColumn({ pivot_values: values })
}

defineExpose({ ensureCcMaster, ccNameOptions })
</script>

<template>
  <div class="reshape-config">
    <div class="reshape-head">
      <div>
        <div class="reshape-title">
          数据重塑
          <el-tooltip placement="right" :width="420">
            <template #content>
              <div class="tip-block">
                <p><strong>重映射：</strong>把某个度量搬到新的维度组合下，适合内推费用改挂成本中心等业务规则。</p>
                <p><strong>列转行：</strong>把多个字段名变成“项目”，字段值变成“值”。转行后未参与转行的字段可能被重复带出，汇总前要确认口径。</p>
                <p><strong>行转列：</strong>把某个字段的取值变成列头。若同一分组和列头下有多条记录，需要用取第一条、取最后一条或统计类型处理冲突。</p>
              </div>
            </template>
            <el-icon class="info-icon"><InfoFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="reshape-subtitle">顺序为先拆分，再数据重塑，最后按需要汇总或导出。</div>
      </div>
      <el-switch
        :model-value="transpose.enabled"
        active-text="启用"
        inactive-text="关闭"
        @update:model-value="(v: boolean) => patch({ enabled: v })"
      />
    </div>

    <template v-if="transpose.enabled">
      <el-tabs v-model="activeTab" class="reshape-tabs">
        <el-tab-pane name="remap">
          <template #label>
            <span class="tab-label">
              重映射
              <el-tooltip placement="top" :width="360">
                <template #content>
                  <div class="tip-block">
                    <p><strong>源度量：</strong>选择要从原行搬走的金额或数量字段。</p>
                    <p><strong>维度更新：</strong>设置搬运后新行上的维度值，例如成本中心、费用项目、归集分类。</p>
                    <p><strong>目标度量：</strong>源度量的值会写入这些目标字段；原行中的源度量会被清零。</p>
                    <p><strong>删除全零度量列：</strong>源度量被完全搬走后，可从结果中隐藏该全零列。</p>
                  </div>
                </template>
                <el-icon class="tab-info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <div class="pane-note">
            把某些度量从原维度组合搬到新维度组合下，源度量会清零；适合成本归集、费用改挂等业务场景。
          </div>
          <div class="switch-line">
            <el-switch
              :model-value="transpose.drop_zero_measures"
              active-text="删除全零度量列"
              @update:model-value="(v: boolean) => patch({ drop_zero_measures: v })"
            />
          </div>

          <div
            v-for="(rule, ri) in transpose.rules"
            :key="ri"
            class="reshape-box"
          >
            <div class="reshape-line">
              <span class="reshape-label">源度量</span>
              <el-select v-model="rule.source_col" placeholder="选要搬运的度量列" style="width: 240px" filterable>
                <el-option v-for="c in selectedMeasures" :key="instanceIdOf(c)" :label="columnLabel(c)" :value="instanceIdOf(c)" />
              </el-select>
              <el-button link type="danger" style="margin-left: auto" @click="removeRule(ri)">
                <el-icon><Delete /></el-icon>删除规则
              </el-button>
            </div>
            <div class="reshape-line align-top">
              <span class="reshape-label">维度更新</span>
              <div class="line-stack">
                <div
                  v-for="(d, di) in rule.dims"
                  :key="di"
                  class="inline-controls"
                >
                  <el-select
                    v-model="d.dim"
                    placeholder="维度列"
                    style="width: 220px"
                    filterable
                    @change="ensureCcMaster()"
                  >
                    <el-option v-for="c in selectedDimensions" :key="instanceIdOf(c)" :label="columnLabel(c)" :value="instanceIdOf(c)" />
                  </el-select>
                  <span class="arrow">→</span>
                  <el-select
                    v-if="tdimKind(d.dim) === 'name'"
                    v-model="d.value"
                    filterable
                    allow-create
                    default-first-option
                    :reserve-keyword="false"
                    placeholder="选成本中心（带编码）或手填"
                    style="width: 260px"
                    @visible-change="(v: boolean) => v && ensureCcMaster()"
                    @change="onTransposeDimValue(rule, d)"
                  >
                    <el-option v-for="o in ccNameOptions" :key="o.value" :label="o.label" :value="o.value" />
                  </el-select>
                  <el-select
                    v-else-if="tdimKind(d.dim) === 'code'"
                    v-model="d.value"
                    filterable
                    allow-create
                    default-first-option
                    :reserve-keyword="false"
                    placeholder="选编码（带名称）或手填"
                    style="width: 260px"
                    @visible-change="(v: boolean) => v && ensureCcMaster()"
                  >
                    <el-option v-for="o in ccCodeOptions" :key="o.value" :label="o.label" :value="o.value" />
                  </el-select>
                  <el-input v-else v-model="d.value" placeholder="新值，如：招聘" style="width: 260px" />
                  <el-button
                    link
                    type="danger"
                    :disabled="rule.dims.length === 1"
                    @click="removeDimUpdate(ri, di)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
                <el-button link type="primary" size="small" @click="addDimUpdate(ri)">
                  <el-icon style="margin-right: 4px"><Plus /></el-icon>添加维度更新
                </el-button>
              </div>
            </div>
            <div class="reshape-line align-top">
              <span class="reshape-label">目标度量</span>
              <el-select
                v-model="rule.target_cols"
                multiple
                placeholder="源值写入这些度量列"
                style="flex: 1"
                filterable
              >
                <el-option v-for="c in selectedMeasures" :key="instanceIdOf(c)" :label="columnLabel(c)" :value="instanceIdOf(c)" />
              </el-select>
            </div>
          </div>
          <el-button link type="primary" @click="addRule">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>添加重映射规则
          </el-button>
        </el-tab-pane>

        <el-tab-pane name="column-to-row">
          <template #label>
            <span class="tab-label">
              列转行
              <el-tooltip placement="top" :width="380">
                <template #content>
                  <div class="tip-block">
                    <p><strong>转行字段：</strong>选择要从“列”展开成“行”的字段，字段名会写入项目列，字段值会写入值列。</p>
                    <p><strong>分组维度：</strong>当不保留明细、需要合并冲突时，系统按这些维度和项目分组。</p>
                    <p><strong>生成列名：</strong>设置展开后新增的项目列和值列显示名称。</p>
                    <p><strong>冲突处理：</strong>保留明细表示不合并；其他策略会按分组维度聚合或取值。</p>
                  </div>
                </template>
                <el-icon class="tab-info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <div class="pane-note">
            选择要下钻成“项目/值”的字段。默认保留明细；如果选择其他冲突策略，则按分组维度合并。
          </div>
          <div class="reshape-box">
            <div class="reshape-line">
              <span class="reshape-label">启用</span>
              <el-switch
                :model-value="(transpose.column_to_row || defaultColumnToRow()).enabled"
                active-text="列转行"
                inactive-text="关闭"
                @update:model-value="(v: boolean) => patchColumnToRow({ enabled: v })"
              />
            </div>
            <div class="reshape-line align-top">
              <span class="reshape-label">转行字段</span>
              <el-select
                :model-value="(transpose.column_to_row || defaultColumnToRow()).source_cols"
                multiple
                filterable
                :disabled="!columnToRowEnabled"
                placeholder="选择要转成行的字段"
                style="flex: 1"
                @update:model-value="(v: string[]) => patchColumnToRow({ source_cols: v })"
              >
                <el-option v-for="c in allSelectedColumns" :key="instanceIdOf(c)" :label="columnLabel(c)" :value="instanceIdOf(c)" />
              </el-select>
            </div>
            <div class="reshape-line align-top">
              <span class="reshape-label">分组维度</span>
              <el-select
                :model-value="(transpose.column_to_row || defaultColumnToRow()).group_by"
                multiple
                filterable
                clearable
                :disabled="!columnToRowEnabled"
                placeholder="发生冲突时按这些维度合并；保留明细时可不选"
                style="flex: 1"
                @update:model-value="(v: string[]) => patchColumnToRow({ group_by: v })"
              >
                <el-option v-for="c in selectedDimensions" :key="instanceIdOf(c)" :label="columnLabel(c)" :value="instanceIdOf(c)" />
              </el-select>
            </div>
            <div class="reshape-line">
              <span class="reshape-label">生成列名</span>
              <el-input
                :model-value="(transpose.column_to_row || defaultColumnToRow()).item_label"
                :disabled="!columnToRowEnabled"
                placeholder="项目列显示名"
                style="width: 180px"
                @update:model-value="(v: string) => patchColumnToRow({ item_label: v })"
              />
              <el-input
                :model-value="(transpose.column_to_row || defaultColumnToRow()).value_label"
                :disabled="!columnToRowEnabled"
                placeholder="值列显示名"
                style="width: 180px"
                @update:model-value="(v: string) => patchColumnToRow({ value_label: v })"
              />
            </div>
            <div class="reshape-line">
              <span class="reshape-label">冲突处理</span>
              <el-select
                :model-value="(transpose.column_to_row || defaultColumnToRow()).conflict_strategy"
                :disabled="!columnToRowEnabled"
                style="width: 220px"
                @update:model-value="(v: string) => patchColumnToRow({ conflict_strategy: v })"
              >
                <el-option v-for="item in columnToRowConflictOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <span class="field-hint">非“保留明细”时，系统只输出分组维度、项目和值。</span>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane name="row-to-column">
          <template #label>
            <span class="tab-label">
              行转列
              <el-tooltip placement="top" :width="380">
                <template #content>
                  <div class="tip-block">
                    <p><strong>分组维度：</strong>决定哪些字段继续保留为行，例如员工、部门、被考核人。</p>
                    <p><strong>列头字段：</strong>该字段的不同取值会变成新列，例如季度、月份、评级项目。</p>
                    <p><strong>值字段：</strong>写入新列单元格的字段，例如评级、金额、人数。</p>
                    <p><strong>列头取值：</strong>可手工维护列头顺序和显示名；不维护时按当前数据自动发现。</p>
                    <p><strong>冲突处理：</strong>同一分组和同一列头下有多条记录时，用该策略决定单元格结果。</p>
                  </div>
                </template>
                <el-icon class="tab-info-icon"><InfoFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <div class="pane-note">
            把某个字段的取值变成列头，例如把“周期”的第一季度、第二季度展开成多列。
          </div>
          <div class="reshape-box">
            <div class="reshape-line">
              <span class="reshape-label">启用</span>
              <el-switch
                :model-value="(transpose.row_to_column || defaultRowToColumn()).enabled"
                active-text="行转列"
                inactive-text="关闭"
                @update:model-value="(v: boolean) => patchRowToColumn({ enabled: v })"
              />
            </div>
            <div class="reshape-line align-top">
              <span class="reshape-label">分组维度</span>
              <el-select
                :model-value="(transpose.row_to_column || defaultRowToColumn()).group_by"
                multiple
                filterable
                :disabled="!rowToColumnEnabled"
                placeholder="选择保留为行的维度"
                style="flex: 1"
                @update:model-value="(v: string[]) => patchRowToColumn({ group_by: v })"
              >
                <el-option v-for="c in selectedDimensions" :key="instanceIdOf(c)" :label="columnLabel(c)" :value="instanceIdOf(c)" />
              </el-select>
            </div>
            <div class="reshape-line">
              <span class="reshape-label">列头字段</span>
              <el-select
                :model-value="(transpose.row_to_column || defaultRowToColumn()).pivot_col"
                filterable
                :disabled="!rowToColumnEnabled"
                placeholder="其取值会变成列"
                style="width: 240px"
                @update:model-value="(v: string) => patchRowToColumn({ pivot_col: v })"
              >
                <el-option v-for="c in allSelectedColumns" :key="instanceIdOf(c)" :label="columnLabel(c)" :value="instanceIdOf(c)" />
              </el-select>
              <span class="reshape-label compact">值字段</span>
              <el-select
                :model-value="(transpose.row_to_column || defaultRowToColumn()).value_col"
                filterable
                :disabled="!rowToColumnEnabled"
                placeholder="写入单元格的值"
                style="width: 240px"
                @update:model-value="(v: string) => patchRowToColumn({ value_col: v })"
              >
                <el-option v-for="c in allSelectedColumns" :key="instanceIdOf(c)" :label="columnLabel(c)" :value="instanceIdOf(c)" />
              </el-select>
            </div>
            <div class="reshape-line">
              <span class="reshape-label">空值显示</span>
              <el-input
                :model-value="(transpose.row_to_column || defaultRowToColumn()).fill_value"
                :disabled="!rowToColumnEnabled"
                placeholder="如：--"
                style="width: 180px"
                @update:model-value="(v: string) => patchRowToColumn({ fill_value: v })"
              />
              <span class="reshape-label compact">冲突处理</span>
              <el-select
                :model-value="(transpose.row_to_column || defaultRowToColumn()).conflict_strategy"
                :disabled="!rowToColumnEnabled"
                style="width: 220px"
                @update:model-value="(v: string) => patchRowToColumn({ conflict_strategy: v })"
              >
                <el-option v-for="item in conflictOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </div>
            <div class="reshape-line align-top">
              <span class="reshape-label">列头取值</span>
              <div class="line-stack">
                <div
                  v-for="(item, index) in (transpose.row_to_column || defaultRowToColumn()).pivot_values"
                  :key="index"
                  class="inline-controls"
                >
                  <el-input
                    :model-value="item.value"
                    :disabled="!rowToColumnEnabled"
                    placeholder="原始取值，如：第一季度"
                    style="width: 220px"
                    @update:model-value="(v: string) => updatePivotValue(index, { value: v })"
                  />
                  <el-input
                    :model-value="item.label || ''"
                    :disabled="!rowToColumnEnabled"
                    placeholder="显示名，可不填"
                    style="width: 220px"
                    @update:model-value="(v: string) => updatePivotValue(index, { label: v })"
                  />
                  <el-button link type="danger" :disabled="!rowToColumnEnabled" @click="removePivotValue(index)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
                <el-button link type="primary" size="small" :disabled="!rowToColumnEnabled" @click="addPivotValue">
                  <el-icon style="margin-right: 4px"><Plus /></el-icon>添加列头取值
                </el-button>
                <span class="field-hint">不维护时，预览会按当前数据自动发现列头；建议正式报表手工维护顺序。</span>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <div
        v-if="!selectedMeasures.length || !selectedDimensions.length"
        class="warning-text"
      >
        数据重塑通常需要已选字段里同时有维度列和度量列（在字段管理里标注）。
      </div>
    </template>
  </div>
</template>

<style scoped>
.reshape-config {
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  background: var(--color-bg-elevated);
  overflow: hidden;
}
.reshape-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border-light);
}
.reshape-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}
.reshape-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-placeholder);
}
.info-icon {
  color: var(--color-primary);
  cursor: help;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.tab-info-icon {
  color: var(--color-primary);
  cursor: help;
  font-size: 14px;
}
.reshape-tabs {
  padding: 0 16px 16px;
}
.pane-note {
  margin-bottom: 10px;
  color: var(--color-text-placeholder);
  font-size: 12px;
  line-height: 1.6;
}
.switch-line {
  margin-bottom: 10px;
}
.reshape-box {
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: var(--color-bg-page);
}
.reshape-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.reshape-line:last-child {
  margin-bottom: 0;
}
.align-top {
  align-items: flex-start;
}
.reshape-label {
  flex: none;
  width: 76px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}
.reshape-label.compact {
  width: auto;
  margin-left: 8px;
}
.line-stack {
  display: grid;
  flex: 1;
  gap: 8px;
}
.inline-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.arrow {
  color: var(--color-text-secondary);
}
.field-hint {
  color: var(--color-text-placeholder);
  font-size: 12px;
}
.warning-text {
  margin-top: 8px;
  color: var(--color-danger);
  font-size: 12px;
}
.tip-block p {
  margin: 0 0 8px;
  line-height: 1.6;
}
.tip-block p:last-child {
  margin-bottom: 0;
}
</style>
