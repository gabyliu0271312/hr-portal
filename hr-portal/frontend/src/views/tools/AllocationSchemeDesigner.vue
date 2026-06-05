<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, View, Check } from '@element-plus/icons-vue'
import AllocationBasicInfo from '@/components/allocation/AllocationBasicInfo.vue'
import ReportFieldPicker from '@/components/report/ReportFieldPicker.vue'
import ReportFilterList from '@/components/report/ReportFilterList.vue'
import ReportSortList from '@/components/report/ReportSortList.vue'
import ReportValueRules from '@/components/report/ReportValueRules.vue'
import ReportTransposeConfig from '@/components/report/ReportTransposeConfig.vue'
import ReportAggregateConfig from '@/components/report/ReportAggregateConfig.vue'
import ReportRoundingConfig from '@/components/report/ReportRoundingConfig.vue'
import ReportPreviewTable from '@/components/report/ReportPreviewTable.vue'
import { allocationApi, type AllocationSchemeIn } from '@/api/allocation'
import { dataApi, type ColumnInfo } from '@/api/data'
import { datasetsApi, type DatasetItem } from '@/api/datasets'
import { reportsApi, type RunResult } from '@/api/reports'
import { useTableOptions } from '@/composables/useTableOptions'

const { tables: TABLES } = useTableOptions()

const route = useRoute()
const router = useRouter()

const schemeId = computed(() => {
  const id = route.params.id as string
  return id === 'new' ? null : Number(id)
})
const isNew = computed(() => schemeId.value === null)

const form = reactive({
  name: '',
  description: '',
  source_type: 'single' as 'single' | 'dataset',
  table_name: 'emp_realtime_roster',
  dataset_id: null as number | null,
  result_table: 'emp_monthly_cost_result',
  selected_codes: [] as string[],
  filters: [] as any[],
  sorts: [] as any[],
  value_rules: [] as { target: string; factor: string }[],
  aggregate: false,
  aggregations: {} as Record<string, string>,
  transpose: { enabled: false, drop_zero_measures: true, rules: [] as any[] },
  rounding_corrections: [] as { group_by: string; target_cols: string[] }[],
})

const allColumns = ref<ColumnInfo[]>([])
const datasets = ref<DatasetItem[]>([])
const currentDataset = ref<DatasetItem | null>(null)
const resultTables = ref<{ table_name: string; label: string }[]>([])
const loadingCols = ref(false)
const saving = ref(false)
const previewing = ref(false)
const previewColumns = ref<RunResult['columns']>([])
const previewItems = ref<RunResult['items']>([])
const previewTotal = ref(0)
const previewPage = ref(1)
const previewPageSize = ref(20)

const transposeRef = ref<InstanceType<typeof ReportTransposeConfig> | null>(null)
const filterRef = ref<InstanceType<typeof ReportFilterList> | null>(null)

const selectedColsDetail = computed(() =>
  form.selected_codes.map((c) => allColumns.value.find((x) => x.code === c)).filter(Boolean) as ColumnInfo[]
)
const selectedDimensions = computed(() => selectedColsDetail.value.filter((c) => c.agg_role !== 'measure'))
const selectedMeasures = computed(() => selectedColsDetail.value.filter((c) => c.agg_role === 'measure'))
const isDataset = computed(() => form.source_type === 'dataset')

async function loadDatasets() {
  try { datasets.value = await datasetsApi.list() } catch { datasets.value = [] }
}

async function loadResultTables() {
  try { resultTables.value = await allocationApi.listResultTables() } catch { resultTables.value = [] }
}

async function loadColumns() {
  loadingCols.value = true
  try {
    if (form.source_type === 'single') {
      allColumns.value = await dataApi.columns(form.table_name)
    } else if (form.dataset_id) {
      const ds = await datasetsApi.get(form.dataset_id)
      currentDataset.value = ds
      const cols: ColumnInfo[] = []
      for (const t of ds.tables) {
        const tcols = await dataApi.columns(t.table_name)
        for (const c of tcols) cols.push({ ...c, code: `${t.alias}.${c.code}`, label: `${t.alias}.${c.label}` })
      }
      allColumns.value = cols
    } else {
      allColumns.value = []
    }
  } catch { allColumns.value = [] } finally { loadingCols.value = false }
}

async function loadScheme() {
  if (isNew.value) return
  try {
    const s = await allocationApi.getScheme(schemeId.value!)
    form.name = s.name
    form.description = s.description ?? ''
    form.source_type = s.dataset_id ? 'dataset' : 'single'
    form.table_name = s.table_name || 'emp_realtime_roster'
    form.dataset_id = s.dataset_id
    form.result_table = s.result_table
    const cfg = s.config
    form.selected_codes = [...(cfg.columns ?? [])]
    form.filters = (cfg.filters ?? []).map((f: any) => ({ ...f }))
    form.sorts = (cfg.sorts ?? []).map((s: any) => ({ ...s }))
    form.value_rules = (cfg.value_rules ?? []).map((v: any) => ({ ...v }))
    form.aggregate = cfg.aggregate ?? false
    form.aggregations = { ...(cfg.aggregations ?? {}) }
    const tp = cfg.transpose
    form.transpose = {
      enabled: tp?.enabled ?? false,
      drop_zero_measures: tp?.drop_zero_measures ?? true,
      rules: (tp?.rules ?? []).map((r: any) => ({
        source_col: r.source_col,
        target_cols: [...(r.target_cols ?? [])],
        dims: Object.entries(r.dim_updates ?? {}).map(([dim, value]) => ({ dim, value })),
      })),
    }
    form.rounding_corrections = (cfg.rounding_corrections ?? []).map((rc: any) => ({
      group_by: rc.group_by ?? '',
      target_cols: [...(rc.target_cols ?? [])],
    }))
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载方案失败')
  }
}

function resetForm() {
  form.selected_codes = []
  form.filters = []
  form.sorts = []
  form.value_rules = []
  form.aggregate = false
  form.aggregations = {}
  form.transpose = { enabled: false, drop_zero_measures: true, rules: [] }
  form.rounding_corrections = []
  filterRef.value?.clearCache()
  previewColumns.value = []
  previewItems.value = []
  previewTotal.value = 0
}

function buildPayload(): AllocationSchemeIn {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    table_name: form.source_type === 'single' ? form.table_name : '',
    dataset_id: form.source_type === 'dataset' ? form.dataset_id : null,
    result_table: form.result_table,
    is_active: true,
    config: {
      columns: form.selected_codes,
      filters: form.filters.filter((f) => f.column).map((f) => {
        const op = f.op
        let value = f.value
        if (op === 'is_null' || op === 'is_not_null') value = null
        else if ((op === 'between' || op === 'in') && typeof value === 'string')
          value = value.split(',').map((s: string) => s.trim()).filter(Boolean)
        return { column: f.column, op, value }
      }),
      sorts: form.sorts.filter((s) => s.column),
      value_rules: form.value_rules.filter((v) => v.target && v.factor),
      aggregate: form.aggregate,
      aggregations: form.aggregate
        ? Object.fromEntries(selectedMeasures.value.map((c) => [c.code, form.aggregations[c.code] || 'sum']))
        : {},
      transpose: {
        enabled: form.transpose.enabled,
        drop_zero_measures: form.transpose.drop_zero_measures,
        rules: form.transpose.rules
          .filter((r: any) => r.source_col && r.target_cols.length)
          .map((r: any) => {
            const du: Record<string, string> = {}
            for (const d of r.dims) if (d.dim && d.value !== '') du[d.dim] = d.value
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
  if (!form.name.trim()) { ElMessage.warning('请填写方案名'); return }
  if (!form.selected_codes.length) { ElMessage.warning('至少选择一个字段'); return }
  saving.value = true
  try {
    if (form.transpose.enabled) await transposeRef.value?.ensureCcMaster()
    const payload = buildPayload()
    if (isNew.value) {
      const s = await allocationApi.createScheme(payload)
      ElMessage.success('已创建')
      router.replace(`/tools/allocation-designer/${s.id}`)
    } else {
      await allocationApi.updateScheme(schemeId.value!, payload)
      ElMessage.success('已保存')
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally { saving.value = false }
}

async function preview() {
  if (!form.selected_codes.length) { ElMessage.warning('至少选择一个字段才能预览'); return }
  if (isNew.value) { ElMessage.info('请先保存后再预览'); return }
  previewing.value = true
  try {
    if (form.transpose.enabled) await transposeRef.value?.ensureCcMaster()
    await allocationApi.updateScheme(schemeId.value!, buildPayload())
    // 复用 report run 接口预览——创建一个临时 report 或直接调 scheme run preview
    // 此处简化：通过 scheme 的 dataset_id 直接查询（待后续优化）
    ElMessage.info('预览功能需绑定报表，请先保存后在列表点击"计算"验证数据')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '预览失败')
  } finally { previewing.value = false }
}

onMounted(async () => {
  await Promise.all([loadDatasets(), loadResultTables()])
  if (!isNew.value) await loadScheme()
  await loadColumns()
})

watch(() => route.params.id, async (v) => {
  if (!v) return
  if (v === 'new') {
    Object.assign(form, {
      name: '', description: '', source_type: 'single',
      table_name: 'emp_realtime_roster', dataset_id: null,
      result_table: 'emp_monthly_cost_result',
      selected_codes: [], filters: [], sorts: [], value_rules: [],
      aggregate: false, aggregations: {},
      transpose: { enabled: false, drop_zero_measures: true, rules: [] },
      rounding_corrections: [],
    })
    previewItems.value = []
    previewColumns.value = []
    await loadColumns()
  } else {
    await loadScheme()
    await loadColumns()
  }
})
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <el-button link @click="router.push('/tools/cost-allocation')">
              <el-icon><ArrowLeft /></el-icon>返回方案列表
            </el-button>
            <span style="font-size: 16px; font-weight: 600; margin-left: 8px">
              {{ isNew ? '新建分摊方案' : `编辑方案 · ${form.name || '(未命名)'}` }}
            </span>
          </div>
          <div>
            <el-button type="primary" :loading="saving" @click="save">
              <el-icon style="margin-right: 4px"><Check /></el-icon>保存
            </el-button>
          </div>
        </div>
      </template>

      <el-form label-position="top">
        <div class="section-title">基本信息</div>
        <AllocationBasicInfo
          v-model:name="form.name"
          v-model:description="form.description"
          v-model:source-type="form.source_type"
          v-model:table-name="form.table_name"
          v-model:dataset-id="form.dataset_id"
          v-model:result-table="form.result_table"
          :tables="TABLES"
          :datasets="datasets"
          :current-dataset="currentDataset"
          :result-tables="resultTables"
          @source-change="resetForm(); loadColumns()"
          @table-change="resetForm(); loadColumns()"
          @dataset-change="resetForm(); loadColumns()"
        />

        <div class="section-title">选择字段（{{ form.selected_codes.length }} 个）</div>
        <ReportFieldPicker
          v-model:selected-codes="form.selected_codes"
          :all-columns="allColumns"
          :loading="loadingCols"
        />

        <div class="section-title">筛选条件（{{ form.filters.length }} 个）</div>
        <ReportFilterList
          ref="filterRef"
          v-model:filters="form.filters"
          :all-columns="allColumns"
          :table-name="form.table_name"
          :source-type="form.source_type"
          :current-dataset-tables="currentDataset?.tables"
        />

        <div class="section-title">排序（{{ form.sorts.length }} 个）</div>
        <ReportSortList v-model:sorts="form.sorts" :all-columns="allColumns" />

        <template v-if="isDataset">
          <div class="section-title">数值拆分（{{ form.value_rules.length }} 个）</div>
          <ReportValueRules
            v-model:value-rules="form.value_rules"
            :selected-codes="form.selected_codes"
            :all-columns="allColumns"
          />

          <div class="section-title">转置 / 重映射</div>
          <ReportTransposeConfig
            ref="transposeRef"
            v-model:transpose="form.transpose"
            :selected-dimensions="selectedDimensions"
            :selected-measures="selectedMeasures"
          />

          <div class="section-title">聚合汇总</div>
          <ReportAggregateConfig
            v-model:aggregate="form.aggregate"
            v-model:aggregations="form.aggregations"
            :selected-dimensions="selectedDimensions"
            :selected-measures="selectedMeasures"
          />

          <div class="section-title">余差收口</div>
          <ReportRoundingConfig
            v-model:rounding-corrections="form.rounding_corrections"
            :selected-dimensions="selectedDimensions"
            :selected-measures="selectedMeasures"
            :aggregate="form.aggregate"
          />
        </template>
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
</style>
