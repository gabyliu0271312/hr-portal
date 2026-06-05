<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Delete, ArrowLeft, View, Check } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { reportsApi, type FilterCond, type SortCond } from '@/api/reports'
import { dataApi, type ColumnInfo } from '@/api/data'
import { datasetsApi, type DatasetItem } from '@/api/datasets'

const route = useRoute()
const router = useRouter()

const TABLES = [
  { value: 'emp_realtime_roster', label: '员工实时花名册' },
  { value: 'emp_monthly_roster', label: '员工月度花名册' },
  { value: 'emp_monthly_salary', label: '员工月度工资表' },
  { value: 'emp_monthly_allocation', label: '员工月度成本分摊表' },
  { value: 'cost_center_monthly', label: '成本中心月度维护表' },
  { value: 'emp_monthly_cost_class', label: '员工月度成本归集分类表' },
]

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

const reportId = computed(() => {
  const id = route.params.id as string
  return id === 'new' ? null : Number(id)
})

const isNew = computed(() => reportId.value === null)

const form = reactive({
  name: '',
  description: '',
  source_type: 'single' as 'single' | 'dataset',
  table_name: 'emp_realtime_roster',
  dataset_id: null as number | null,
  is_published: false,
  selected_codes: [] as string[],
  filters: [] as FilterCond[],
  sorts: [] as SortCond[],
  value_rules: [] as { target: string; factor: string }[],
  aggregate: false,
  aggregations: {} as Record<string, string>,
  transpose: {
    enabled: false,
    drop_zero_measures: true,
    rules: [] as { source_col: string; dims: { dim: string; value: string }[]; target_cols: string[] }[],
  },
  rounding_corrections: [] as { group_by: string; target_cols: string[] }[],
})

const AGG_FUNCS = [
  { value: 'sum', label: '求和' },
  { value: 'avg', label: '平均' },
  { value: 'min', label: '最小' },
  { value: 'max', label: '最大' },
  { value: 'count', label: '计数' },
]

const allColumns = ref<ColumnInfo[]>([])  // 单表模式 / 数据集模式合并字段池（数据集模式 code 自带 alias.）
const datasets = ref<DatasetItem[]>([])
const currentDataset = ref<DatasetItem | null>(null)
const loadingCols = ref(false)
const saving = ref(false)
const previewing = ref(false)

const previewColumns = ref<{ code: string; label: string; data_type: string; is_sensitive: boolean }[]>([])
const previewItems = ref<Record<string, any>[]>([])
const previewTotal = ref(0)
const previewPage = ref(1)
const previewPageSize = ref(20)

async function loadDatasets() {
  try {
    datasets.value = await datasetsApi.list()
  } catch {
    datasets.value = []
  }
}

async function loadColumnsSingleTable(table: string) {
  loadingCols.value = true
  try {
    allColumns.value = await dataApi.columns(table)
  } catch {
    allColumns.value = []
  } finally {
    loadingCols.value = false
  }
}

async function loadColumnsForDataset(datasetId: number) {
  loadingCols.value = true
  try {
    const ds = await datasetsApi.get(datasetId)
    currentDataset.value = ds
    const cols: ColumnInfo[] = []
    for (const t of ds.tables) {
      const tcols = await dataApi.columns(t.table_name)
      for (const c of tcols) {
        cols.push({
          ...c,
          code: `${t.alias}.${c.code}`,
          label: `${t.alias}.${c.label}`,
        })
      }
    }
    allColumns.value = cols
  } catch {
    allColumns.value = []
  } finally {
    loadingCols.value = false
  }
}

async function loadColumns() {
  if (form.source_type === 'single') {
    await loadColumnsSingleTable(form.table_name)
  } else if (form.dataset_id) {
    await loadColumnsForDataset(form.dataset_id)
  } else {
    allColumns.value = []
  }
}

async function loadReport() {
  if (isNew.value) return
  try {
    const r = await reportsApi.get(reportId.value!)
    form.name = r.name
    form.description = r.description ?? ''
    form.source_type = r.dataset_id ? 'dataset' : 'single'
    form.table_name = r.table_name || 'emp_realtime_roster'
    form.dataset_id = r.dataset_id
    form.is_published = r.is_published
    form.selected_codes = [...(r.config.columns ?? [])]
    form.filters = (r.config.filters ?? []).map((f) => ({ ...f }))
    form.sorts = (r.config.sorts ?? []).map((s) => ({ ...s }))
    form.value_rules = (r.config.value_rules ?? []).map((v) => ({ ...v }))
    form.aggregate = r.config.aggregate ?? false
    form.aggregations = { ...(r.config.aggregations ?? {}) }
    const tp = r.config.transpose
    form.transpose = {
      enabled: tp?.enabled ?? false,
      drop_zero_measures: tp?.drop_zero_measures ?? true,
      rules: (tp?.rules ?? []).map((rule) => ({
        source_col: rule.source_col,
        target_cols: [...(rule.target_cols ?? [])],
        dims: Object.entries(rule.dim_updates ?? {}).map(([dim, value]) => ({ dim, value })),
      })),
    }
    form.rounding_corrections = (r.config.rounding_corrections ?? []).map((rc: any) => ({
      group_by: rc.group_by ?? '',
      target_cols: [...(rc.target_cols ?? [])],
    }))
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载报表失败')
  }
}

async function onSourceChange() {
  // 切换源类型时清空配置（字段空间不一致）
  form.selected_codes = []
  form.filters = []
  form.sorts = []
  form.value_rules = []
  form.aggregate = false
  form.aggregations = {}
  resetTranspose()
  clearDistinctCache()
  previewColumns.value = []
  previewItems.value = []
  previewTotal.value = 0
  await loadColumns()
}

async function onTableChange() {
  form.selected_codes = []
  form.filters = []
  form.sorts = []
  form.aggregate = false
  form.aggregations = {}
  resetTranspose()
  clearDistinctCache()
  previewColumns.value = []
  previewItems.value = []
  previewTotal.value = 0
  await loadColumns()
}

async function onDatasetChange() {
  form.selected_codes = []
  form.filters = []
  form.sorts = []
  form.aggregate = false
  form.aggregations = {}
  resetTranspose()
  clearDistinctCache()
  previewColumns.value = []
  previewItems.value = []
  previewTotal.value = 0
  await loadColumns()
}

function resetTranspose() {
  form.transpose = { enabled: false, drop_zero_measures: true, rules: [] }
}

function toggleColumn(code: string) {
  const i = form.selected_codes.indexOf(code)
  if (i >= 0) form.selected_codes.splice(i, 1)
  else form.selected_codes.push(code)
}

function moveColumn(code: string, dir: -1 | 1) {
  const i = form.selected_codes.indexOf(code)
  if (i < 0) return
  const j = i + dir
  if (j < 0 || j >= form.selected_codes.length) return
  const tmp = form.selected_codes[i]
  form.selected_codes[i] = form.selected_codes[j]
  form.selected_codes[j] = tmp
}

function selectAll() {
  form.selected_codes = allColumns.value.filter((c) => c.is_visible).map((c) => c.code)
}

function clearAll() {
  form.selected_codes = []
}

function addFilter() {
  form.filters.push({ column: '', op: 'eq', value: '' })
}
function removeFilter(i: number) {
  form.filters.splice(i, 1)
}

function addSort() {
  form.sorts.push({ column: '', order: 'asc' })
}
function removeSort(i: number) {
  form.sorts.splice(i, 1)
}

function valueRequiresArray(op: string): boolean {
  return op === 'between' || op === 'in'
}
function valueDisabled(op: string): boolean {
  return op === 'is_null' || op === 'is_not_null'
}

// ===== 筛选值下拉：从数据列取值（维度列 + eq/neq/in），名称带编码后缀 =====
type DistinctOpt = { value: string; label: string }
const NAME_FIELDS = ['维度值', '名称']
const distinctCache = ref<Map<string, DistinctOpt[]>>(new Map())
const distinctLoading = ref<Set<string>>(new Set())

// f.column → 该列的 ColumnInfo
function colInfo(qual: string): ColumnInfo | undefined {
  return allColumns.value.find((c) => c.code === qual)
}
// 解析 alias.col → { table, column }
function resolveTableColumn(qual: string): { table: string; column: string } | null {
  if (form.source_type === 'single') {
    return form.table_name ? { table: form.table_name, column: qual } : null
  }
  const dot = qual.indexOf('.')
  if (dot < 0 || !currentDataset.value) return null
  const alias = qual.slice(0, dot)
  const column = qual.slice(dot + 1)
  const t = currentDataset.value.tables.find((x) => x.alias === alias)
  return t ? { table: t.table_name, column } : null
}
// 是否给该筛选行用下拉（维度列 + eq/neq/in）
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
// 切数据源/数据集时清缓存（取值范围变了）
function clearDistinctCache() {
  distinctCache.value = new Map()
}
// 操作符切到/离开「属于(in)」时，值在 数组↔字符串 之间切换
function onFilterOpChange(f: FilterCond, op: string) {
  const wasArray = Array.isArray(f.value)
  const willArray = op === 'in'
  if (wasArray !== willArray) f.value = willArray ? [] : ''
}
// 换筛选列：值域变了，清空当前值并预载候选
function onFilterColumnChange(f: FilterCond) {
  f.value = f.op === 'in' ? [] : ''
  ensureOptions(f.column)
}

function buildPayload() {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    table_name: form.source_type === 'single' ? form.table_name : '',
    dataset_id: form.source_type === 'dataset' ? form.dataset_id : null,
    is_published: form.is_published,
    config: {
      columns: form.selected_codes,
      filters: form.filters
        .filter((f) => f.column)
        .map((f) => {
          const op = f.op
          let value: any = f.value
          if (valueDisabled(op)) value = null
          else if (valueRequiresArray(op) && typeof value === 'string') {
            value = value.split(',').map((s) => s.trim()).filter(Boolean)
          }
          return { column: f.column, op, value }
        }),
      sorts: form.sorts.filter((s) => s.column),
      value_rules: form.value_rules.filter((v) => v.target && v.factor),
      aggregate: form.aggregate,
      aggregations: form.aggregate
        ? Object.fromEntries(
            selectedMeasures.value.map((c) => [c.code, form.aggregations[c.code] || 'sum'])
          )
        : {},
      transpose: {
        enabled: form.transpose.enabled,
        drop_zero_measures: form.transpose.drop_zero_measures,
        rules: form.transpose.rules
          .filter((r) => r.source_col && r.target_cols.length)
          .map((r) => {
            const du: Record<string, string> = {}
            for (const d of r.dims) {
              if (d.dim && d.value !== '') du[d.dim] = d.value
            }
            // 维度更新里选了成本中心名称 → 自动把已选的「编码」列也设为对应编码
            const codeQuals = selectedDimensions.value
              .filter((c) => tailCode(c.code) === '编码')
              .map((c) => c.code)
            if (codeQuals.length) {
              for (const [dim, val] of Object.entries({ ...du })) {
                if (tdimKind(dim) !== 'name') continue
                const opt = ccNameOptions.value.find((o) => o.value === val)
                if (!opt || !opt.extra) continue
                for (const cq of codeQuals) {
                  if (du[cq] === undefined) du[cq] = opt.extra
                }
              }
            }
            return { source_col: r.source_col, target_cols: r.target_cols, dim_updates: du }
          }),
      },
      rounding_corrections: form.rounding_corrections
        .filter((rc) => rc.group_by && rc.target_cols.length)
        .map((rc) => ({ group_by: rc.group_by, target_cols: [...rc.target_cols] })),
    },
  }
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写报表名')
    return
  }
  if (form.selected_codes.length === 0) {
    ElMessage.warning('至少选择一个字段')
    return
  }
  saving.value = true
  try {
    if (form.transpose.enabled) await ensureCcMaster()
    const payload = buildPayload()
    if (isNew.value) {
      const r = await reportsApi.create(payload)
      ElMessage.success('已创建')
      router.replace(`/report/designer/${r.id}`)
    } else {
      await reportsApi.update(reportId.value!, payload)
      ElMessage.success('已保存')
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

// ===== 转置目标：成本中心主数据（可转到任意成本中心，名称带编码并能自动联动编码列）=====
const ccNameOptions = ref<{ value: string; label: string; extra: string }[]>([])
const ccCodeOptions = ref<{ value: string; label: string }[]>([])
let ccMasterLoaded = false
async function ensureCcMaster() {
  if (ccMasterLoaded) return
  ccMasterLoaded = true
  try {
    const names = await dataApi.distinct('cost_center_monthly', '名称', '编码')
    ccNameOptions.value = names.map((r) => ({
      value: r.value,
      label: r.extra ? `${r.value} (${r.extra})` : r.value,
      extra: r.extra || '',
    }))
    const codes = await dataApi.distinct('cost_center_monthly', '编码', '名称')
    ccCodeOptions.value = codes.map((r) => ({
      value: r.value,
      label: r.extra ? `${r.value} (${r.extra})` : r.value,
    }))
  } catch {
    ccMasterLoaded = false
  }
}
// 转置维度列的种类：成本中心名称列 / 编码列 / 其它
function tdimKind(qual: string): 'name' | 'code' | null {
  const t = tailCode(qual)
  if (t === '维度值' || t === '名称') return 'name'
  if (t === '编码') return 'code'
  return null
}
// 选了成本中心名称后，自动把同规则里已选的「编码」维度也设成该成本中心编码
function onTransposeDimValue(rule: { dims: { dim: string; value: string }[] }, d: { dim: string; value: string }) {
  if (tdimKind(d.dim) !== 'name') return
  const opt = ccNameOptions.value.find((o) => o.value === d.value)
  if (!opt || !opt.extra) return
  const codeQuals = selectedDimensions.value
    .filter((c) => tailCode(c.code) === '编码')
    .map((c) => c.code)
  for (const cq of codeQuals) {
    const ex = rule.dims.find((x) => x.dim === cq)
    if (ex) ex.value = opt.extra
    else rule.dims.push({ dim: cq, value: opt.extra })
  }
}

async function preview() {
  if (form.selected_codes.length === 0) {
    ElMessage.warning('至少选择一个字段才能预览')
    return
  }
  // 预览必须先保存（因为后端 run 是按 id 跑）
  if (isNew.value) {
    ElMessage.info('请先保存草稿后再预览')
    return
  }
  previewing.value = true
  try {
    if (form.transpose.enabled) await ensureCcMaster()
    // 保存当前配置后跑
    await reportsApi.update(reportId.value!, buildPayload())
    const res = await reportsApi.run(reportId.value!, previewPage.value, previewPageSize.value)
    previewColumns.value = res.columns
    previewItems.value = res.items
    previewTotal.value = res.total
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '预览失败')
  } finally {
    previewing.value = false
  }
}

function formatCell(row: Record<string, any>, code: string): string {
  const v = row[code]
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

const selectedColsDetail = computed(() =>
  form.selected_codes
    .map((code) => allColumns.value.find((c) => c.code === code))
    .filter(Boolean) as ColumnInfo[]
)

const availableColumns = computed(() =>
  allColumns.value.filter((c) => !form.selected_codes.includes(c.code))
)

// ===== 聚合：已选字段按维度/度量分类（来自字段管理的 agg_role）=====
const selectedDimensions = computed(() =>
  selectedColsDetail.value.filter((c) => c.agg_role !== 'measure')
)
const selectedMeasures = computed(() =>
  selectedColsDetail.value.filter((c) => c.agg_role === 'measure')
)

// ===== 数值拆分规则（仅数据集模式）=====
const isDataset = computed(() => form.source_type === 'dataset')
// 数值拆分候选：按「度量」标注（agg_role）判定，兼容历史数字类型字段；与聚合/转置口径一致
const isNumericCol = (c: ColumnInfo) => c.agg_role === 'measure' || c.data_type === 'number'
// target 候选：已选的度量列；factor 候选：数据集里所有度量列
const numericSelectedCols = computed(() =>
  selectedColsDetail.value.filter(isNumericCol)
)
const numericAllCols = computed(() =>
  allColumns.value.filter(isNumericCol)
)
function addValueRule() {
  form.value_rules.push({ target: '', factor: '' })
}
function removeValueRule(i: number) {
  form.value_rules.splice(i, 1)
}

// ===== 转置规则编辑 =====
function addTransposeRule() {
  form.transpose.rules.push({ source_col: '', dims: [{ dim: '', value: '' }], target_cols: [] })
}
function removeTransposeRule(i: number) {
  form.transpose.rules.splice(i, 1)
}
function addDimUpdate(ruleIdx: number) {
  form.transpose.rules[ruleIdx].dims.push({ dim: '', value: '' })
}
function removeDimUpdate(ruleIdx: number, dimIdx: number) {
  form.transpose.rules[ruleIdx].dims.splice(dimIdx, 1)
}
function addRoundingCorrection() {
  form.rounding_corrections.push({ group_by: '', target_cols: [] })
}
function removeRoundingCorrection(i: number) {
  form.rounding_corrections.splice(i, 1)
}
function colLabel(code: string): string {
  return allColumns.value.find((c) => c.code === code)?.label ?? code
}

onMounted(async () => {
  await loadDatasets()
  if (!isNew.value) {
    await loadReport()
  }
  await loadColumns()
})

watch(
  () => route.params.id,
  async (v) => {
    if (!v) return
    if (v === 'new') {
      Object.assign(form, {
        name: '',
        description: '',
        source_type: 'single',
        table_name: 'emp_realtime_roster',
        dataset_id: null,
        is_published: false,
        selected_codes: [],
        filters: [],
        sorts: [],
        value_rules: [],
        aggregate: false,
        aggregations: {},
        transpose: { enabled: false, drop_zero_measures: true, rules: [] },
        rounding_corrections: [],
      })
      previewItems.value = []
      previewColumns.value = []
      await loadColumns()
    } else {
      await loadReport()
      await loadColumns()
    }
  }
)
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <el-button link @click="router.push('/report/list')">
              <el-icon><ArrowLeft /></el-icon>返回列表
            </el-button>
            <span style="font-size: 16px; font-weight: 600; margin-left: 8px">
              {{ isNew ? '新建报表' : `编辑报表 · ${form.name || '(未命名)'}` }}
            </span>
          </div>
          <div>
            <el-button :loading="previewing" :disabled="isNew" @click="preview">
              <el-icon style="margin-right: 4px"><View /></el-icon>预览
            </el-button>
            <el-button type="primary" :loading="saving" @click="save">
              <el-icon style="margin-right: 4px"><Check /></el-icon>保存
            </el-button>
          </div>
        </div>
      </template>

      <el-form label-position="top">
        <div class="section-title">基本信息</div>
        <el-form-item label="报表名" required>
          <el-input v-model="form.name" placeholder="例如：研发部花名册导出" maxlength="128" />
        </el-form-item>
        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 16px">
          <el-form-item label="数据来源" required>
            <el-radio-group v-model="form.source_type" @change="onSourceChange">
              <el-radio-button value="single">单表</el-radio-button>
              <el-radio-button value="dataset">数据集</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="form.source_type === 'single'" label="数据表" required>
            <el-select v-model="form.table_name" style="width: 100%" @change="onTableChange">
              <el-option v-for="t in TABLES" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
          </el-form-item>
          <el-form-item v-else label="数据集" required>
            <el-select
              v-model="form.dataset_id"
              style="width: 100%"
              placeholder="选择数据集"
              @change="onDatasetChange"
            >
              <el-option
                v-for="d in datasets"
                :key="d.id"
                :label="d.name"
                :value="d.id"
                :disabled="!d.is_active"
              />
            </el-select>
            <div v-if="form.dataset_id && currentDataset" style="margin-top: 6px; font-size: 12px; color: var(--color-text-secondary)">
              包含表：{{ currentDataset.tables.map(t => t.alias).join(', ') }} ·
              关联：{{ currentDataset.relations.length }} 个
            </div>
          </el-form-item>
        </div>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" placeholder="可选" />
        </el-form-item>
        <el-form-item label="发布状态">
          <el-switch v-model="form.is_published" active-text="已发布（其他人可见）" inactive-text="草稿（仅自己可见）" />
        </el-form-item>

        <div class="section-title">选择字段（{{ form.selected_codes.length }} 个）</div>
        <div v-loading="loadingCols" class="columns-picker">
          <div class="picker-pane">
            <div class="pane-head">
              <span>可选字段（{{ availableColumns.length }}）</span>
              <el-button link size="small" @click="selectAll">全选可见</el-button>
            </div>
            <div class="pane-body">
              <div
                v-for="c in availableColumns"
                :key="c.code"
                class="col-item"
                @click="toggleColumn(c.code)"
              >
                <span>{{ c.label }}</span>
                <el-tag v-if="c.is_pk_part" size="small" type="primary" effect="plain">PK</el-tag>
                <el-tag v-if="c.is_sensitive" size="small" type="danger" effect="plain">敏感</el-tag>
                <el-tag v-if="!c.is_visible" size="small" type="info" effect="plain">隐藏</el-tag>
                <span style="font-family: monospace; font-size: 11px; color: var(--color-text-placeholder); margin-left: auto">{{ c.code }}</span>
              </div>
              <div v-if="!availableColumns.length" class="empty-tip">所有字段已选入</div>
            </div>
          </div>
          <div class="picker-pane">
            <div class="pane-head">
              <span>已选字段（{{ selectedColsDetail.length }}）</span>
              <el-button link size="small" :disabled="!selectedColsDetail.length" @click="clearAll">清空</el-button>
            </div>
            <div class="pane-body">
              <div
                v-for="(c, i) in selectedColsDetail"
                :key="c.code"
                class="col-item col-item--selected"
              >
                <span class="order-num">{{ i + 1 }}.</span>
                <span>{{ c.label }}</span>
                <el-tag v-if="c.is_sensitive" size="small" type="danger" effect="plain">敏感</el-tag>
                <div style="margin-left: auto; display: flex; gap: 4px">
                  <el-button size="small" link :disabled="i === 0" @click="moveColumn(c.code, -1)">上移</el-button>
                  <el-button size="small" link :disabled="i === selectedColsDetail.length - 1" @click="moveColumn(c.code, 1)">下移</el-button>
                  <el-button size="small" link type="danger" @click="toggleColumn(c.code)">移除</el-button>
                </div>
              </div>
              <div v-if="!selectedColsDetail.length" class="empty-tip">从左侧点选字段加入</div>
            </div>
          </div>
        </div>

        <div class="section-title">筛选条件（{{ form.filters.length }} 个，多个之间为 AND）</div>
        <div v-for="(f, i) in form.filters" :key="i" class="rule-row">
          <el-select v-model="f.column" placeholder="字段" style="width: 200px" filterable @change="onFilterColumnChange(f)">
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

        <div class="section-title">排序（{{ form.sorts.length }} 个，按顺序应用）</div>
        <div v-for="(s, i) in form.sorts" :key="i" class="rule-row">
          <el-select v-model="s.column" placeholder="字段" style="width: 240px" filterable>
            <el-option v-for="c in allColumns" :key="c.code" :label="c.label" :value="c.code" />
          </el-select>
          <el-radio-group v-model="s.order">
            <el-radio-button value="asc">升序</el-radio-button>
            <el-radio-button value="desc">降序</el-radio-button>
          </el-radio-group>
          <el-button link type="danger" @click="removeSort(i)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
        <el-button link type="primary" @click="addSort">
          <el-icon style="margin-right: 4px"><Plus /></el-icon>添加排序
        </el-button>

        <template v-if="isDataset">
          <div class="section-title">数值拆分（{{ form.value_rules.length }} 个）</div>
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-bottom: 8px; line-height: 1.6">
            把一个金额按系数拆开。例：个税总额 × 系数 → 各成本中心分摊到的个税。<br />
            「被拆分的列」会被改写成 取整两位小数(该列值 × 系数列值)，必须是已选中的显示列；非数值/空显示为空；筛选与排序仍按原始值。
          </div>
          <div v-for="(v, i) in form.value_rules" :key="i" class="rule-row" style="align-items: center">
            <span style="color: var(--color-text-secondary); font-size: 13px">被拆分的列</span>
            <el-select v-model="v.target" placeholder="选要改写的金额列" style="width: 240px" filterable>
              <el-option v-for="c in numericSelectedCols" :key="c.code" :label="c.label" :value="c.code" />
            </el-select>
            <span style="color: var(--color-text-secondary); font-size: 13px">×　系数列</span>
            <el-select v-model="v.factor" placeholder="选系数列" style="width: 240px" filterable>
              <el-option v-for="c in numericAllCols" :key="c.code" :label="c.label" :value="c.code" />
            </el-select>
            <span v-if="v.target && v.factor" style="color: var(--color-primary); font-size: 12px">
              {{ colLabel(v.target) }} = {{ colLabel(v.target) }} × {{ colLabel(v.factor) }}
            </span>
            <el-button link type="danger" @click="removeValueRule(i)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-button link type="primary" @click="addValueRule">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>添加拆分规则
          </el-button>

          <div class="section-title">转置 / 重映射</div>
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-bottom: 8px; line-height: 1.6">
            把某些度量从原维度组合搬到新维度组合下，保留其余记录（源度量清零）。例：把「内退费用」搬到成本中心=招聘，并写入应发工资/税前成本。<br />
            维度/度量来自<strong>字段管理</strong>标注；顺序为<strong>先拆分 → 再转置 → 后聚合</strong>。<br />
            维度更新选「维度值/名称」时从<strong>成本中心主数据</strong>选（带编码）；选定后会<strong>自动把已选的「编码」列也设为该成本中心编码</strong>，报表即可带出正确编码。
          </div>
          <el-form-item>
            <el-switch v-model="form.transpose.enabled" active-text="开启转置" inactive-text="不转置" />
            <el-switch
              v-model="form.transpose.drop_zero_measures"
              style="margin-left: 16px"
              active-text="删除全零度量列"
              :disabled="!form.transpose.enabled"
            />
          </el-form-item>
          <template v-if="form.transpose.enabled">
            <div
              v-for="(rule, ri) in form.transpose.rules"
              :key="ri"
              class="agg-box"
              style="margin-bottom: 10px"
            >
              <div class="agg-line">
                <span class="agg-label">源度量</span>
                <el-select v-model="rule.source_col" placeholder="选要搬运的度量列" style="width: 220px" filterable>
                  <el-option v-for="c in selectedMeasures" :key="c.code" :label="c.label" :value="c.code" />
                </el-select>
                <el-button link type="danger" style="margin-left: auto" @click="removeTransposeRule(ri)">
                  <el-icon><Delete /></el-icon>删除规则
                </el-button>
              </div>
              <div class="agg-line" style="align-items: flex-start">
                <span class="agg-label">维度更新</span>
                <div style="flex: 1">
                  <div
                    v-for="(d, di) in rule.dims"
                    :key="di"
                    style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px"
                  >
                    <el-select v-model="d.dim" placeholder="维度列" style="width: 200px" filterable @change="ensureCcMaster()">
                      <el-option v-for="c in selectedDimensions" :key="c.code" :label="c.label" :value="c.code" />
                    </el-select>
                    <span style="color: var(--color-text-secondary)">→</span>
                    <el-select
                      v-if="tdimKind(d.dim) === 'name'"
                      v-model="d.value"
                      filterable
                      allow-create
                      default-first-option
                      :reserve-keyword="false"
                      placeholder="选成本中心（带编码）或手填"
                      style="width: 240px"
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
                      style="width: 240px"
                      @visible-change="(v: boolean) => v && ensureCcMaster()"
                    >
                      <el-option v-for="o in ccCodeOptions" :key="o.value" :label="o.label" :value="o.value" />
                    </el-select>
                    <el-input v-else v-model="d.value" placeholder="新值，如：招聘" style="width: 240px" />
                    <el-button link type="danger" :disabled="rule.dims.length === 1" @click="removeDimUpdate(ri, di)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                  <el-button link type="primary" size="small" @click="addDimUpdate(ri)">
                    <el-icon style="margin-right: 4px"><Plus /></el-icon>添加维度更新
                  </el-button>
                </div>
              </div>
              <div class="agg-line" style="align-items: flex-start">
                <span class="agg-label">目标度量</span>
                <el-select
                  v-model="rule.target_cols"
                  multiple
                  placeholder="源值写入这些度量列"
                  style="flex: 1"
                  filterable
                >
                  <el-option v-for="c in selectedMeasures" :key="c.code" :label="c.label" :value="c.code" />
                </el-select>
              </div>
            </div>
            <el-button link type="primary" @click="addTransposeRule">
              <el-icon style="margin-right: 4px"><Plus /></el-icon>添加转置规则
            </el-button>
            <div v-if="!selectedMeasures.length || !selectedDimensions.length" style="color: var(--color-danger); font-size: 12px; margin-top: 6px">
              转置需要已选字段里同时有维度列和度量列（在字段管理里标注）。
            </div>
          </template>

          <div class="section-title">聚合汇总</div>
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-bottom: 8px; line-height: 1.6">
            开启后按「维度」列分组（GROUP BY），对「度量」列按指定方式汇总。维度/度量在
            <strong>字段管理</strong> 里标注，此处只选聚合方式。<br />
            顺序为<strong>先拆分、后聚合</strong>：先按上方规则逐行拆分，再分组汇总。
          </div>
          <el-form-item>
            <el-switch v-model="form.aggregate" active-text="开启聚合" inactive-text="明细（不聚合）" />
          </el-form-item>
          <template v-if="form.aggregate">
            <div class="agg-box">
              <div class="agg-line">
                <span class="agg-label">分组维度</span>
                <template v-if="selectedDimensions.length">
                  <el-tag
                    v-for="c in selectedDimensions"
                    :key="c.code"
                    size="small"
                    effect="plain"
                    style="margin-right: 6px"
                  >{{ c.label }}</el-tag>
                </template>
                <span v-else style="color: var(--color-danger); font-size: 12px">
                  未选中任何维度列，请先在已选字段里加入维度列
                </span>
              </div>
              <div class="agg-line" style="align-items: flex-start">
                <span class="agg-label">度量汇总</span>
                <div style="flex: 1">
                  <div
                    v-for="c in selectedMeasures"
                    :key="c.code"
                    style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px"
                  >
                    <span style="width: 200px; font-size: 13px">{{ c.label }}</span>
                    <el-select
                      :model-value="form.aggregations[c.code] || 'sum'"
                      style="width: 120px"
                      size="small"
                      @update:model-value="(v: string) => (form.aggregations[c.code] = v)"
                    >
                      <el-option v-for="a in AGG_FUNCS" :key="a.value" :label="a.label" :value="a.value" />
                    </el-select>
                  </div>
                  <span v-if="!selectedMeasures.length" style="color: var(--color-danger); font-size: 12px">
                    未选中任何度量列，请先在已选字段里加入度量列
                  </span>
                </div>
              </div>
            </div>
          </template>

          <div class="section-title">余差收口</div>
          <div style="font-size: 12px; color: var(--color-text-placeholder); margin-bottom: 8px; line-height: 1.6">
            用于解决拆分取整后的 0.01 差异：按指定维度分组，自动把差额补到该组最后一行，确保合计与原始薪资列一致。
          </div>
          <template v-if="form.aggregate">
            <div
              v-for="(rc, i) in form.rounding_corrections"
              :key="i"
              class="agg-box"
              style="margin-bottom: 10px"
            >
              <div class="agg-line" style="align-items: flex-start">
                <span class="agg-label">分组维度</span>
                <el-select v-model="rc.group_by" filterable clearable style="width: 220px" placeholder="选择收口维度">
                  <el-option v-for="c in selectedDimensions" :key="c.code" :label="c.label" :value="c.code" />
                </el-select>
                <span class="agg-label" style="margin-left: 12px">收口字段</span>
                <el-select v-model="rc.target_cols" multiple filterable clearable style="width: 320px" placeholder="选择金额字段">
                  <el-option v-for="c in selectedMeasures" :key="c.code" :label="c.label" :value="c.code" />
                </el-select>
                <el-button link type="danger" @click="removeRoundingCorrection(i)">删除</el-button>
              </div>
            </div>
            <el-button link type="primary" @click="addRoundingCorrection">
              <el-icon style="margin-right: 4px"><Plus /></el-icon>添加余差收口规则
            </el-button>
          </template>
          <div v-else style="color: var(--color-text-placeholder); font-size: 12px">
            余差收口仅在开启聚合后生效。
          </div>
        </template>

        <div v-if="previewItems.length || previewTotal" class="section-title">
          预览结果（共 {{ previewTotal }} 行）
        </div>
        <div v-if="previewItems.length || previewTotal" style="overflow-x: auto">
          <el-table :data="previewItems" stripe style="width: 100%" max-height="400">
            <el-table-column
              v-for="col in previewColumns"
              :key="col.code"
              :label="col.label"
              :prop="col.code"
              min-width="140"
            >
              <template #default="{ row }">
                <span v-if="col.is_sensitive" style="color: var(--color-text-placeholder); font-family: monospace">******</span>
                <span v-else>{{ formatCell(row, col.code) }}</span>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            style="margin-top: 12px; justify-content: flex-end"
            v-model:current-page="previewPage"
            v-model:page-size="previewPageSize"
            :total="previewTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @current-change="preview"
            @size-change="preview"
          />
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 24px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border-light);
}
.columns-picker {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  min-height: 320px;
}
.picker-pane {
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-page);
}
.pane-head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border-light);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-bg-elevated, #fff);
}
.pane-body {
  flex: 1;
  overflow-y: auto;
  max-height: 320px;
  padding: 4px;
}
.col-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}
.col-item:hover {
  background: var(--color-bg-page);
}
.col-item--selected {
  cursor: default;
}
.col-item--selected:hover {
  background: transparent;
}
.order-num {
  color: var(--color-text-placeholder);
  font-family: monospace;
  font-size: 12px;
  min-width: 24px;
}
.empty-tip {
  padding: 24px;
  text-align: center;
  color: var(--color-text-placeholder);
  font-size: 13px;
}
.rule-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.agg-box {
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  padding: 12px;
  background: var(--color-bg-page);
}
.agg-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.agg-line:last-child {
  margin-bottom: 0;
}
.agg-label {
  width: 72px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}
</style>
