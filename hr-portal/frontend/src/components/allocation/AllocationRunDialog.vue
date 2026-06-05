<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { AllocationSchemeOut, AllocationRunOut } from '@/api/allocation'
import { allocationApi } from '@/api/allocation'
import { datasetsApi, type DatasetItem } from '@/api/datasets'
import { dataApi, type ColumnInfo } from '@/api/data'
import ReportFilterList from '@/components/report/ReportFilterList.vue'

const props = defineProps<{
  visible: boolean
  scheme: AllocationSchemeOut | null
}>()

const emit = defineEmits<{
  'update:visible': [v: boolean]
  'done': [run: AllocationRunOut]
}>()

const filters = ref<any[]>([])
const allColumns = ref<ColumnInfo[]>([])
const currentDataset = ref<DatasetItem | null>(null)
const loading = ref(false)
const running = ref(false)

const filterRef = ref<InstanceType<typeof ReportFilterList> | null>(null)

async function init() {
  if (!props.scheme) return
  // 初始筛选条件为空（额外筛选，不预填方案里的）
  filters.value = []

  loading.value = true
  try {
    if (props.scheme.dataset_id) {
      const ds = await datasetsApi.get(props.scheme.dataset_id)
      currentDataset.value = ds
      const cols: ColumnInfo[] = []
      for (const t of ds.tables) {
        const tcols = await dataApi.columns(t.table_name)
        for (const c of tcols) {
          cols.push({ ...c, code: `${t.alias}.${c.code}`, label: `${t.alias}.${c.label}` })
        }
      }
      allColumns.value = cols
    } else if (props.scheme.table_name) {
      currentDataset.value = null
      allColumns.value = await dataApi.columns(props.scheme.table_name)
    }
  } finally {
    loading.value = false
  }
}

watch(() => props.visible, (v) => { if (v) init() })

async function confirm() {
  if (!props.scheme) return
  running.value = true
  try {
    const run = await allocationApi.runScheme(props.scheme.id, filters.value)
    ElMessage.success(`存档成功，共写入 ${run.rows_written} 行（${run.period_ym}）`)
    emit('update:visible', false)
    emit('done', run)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '执行失败')
  } finally {
    running.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="计算存档"
    width="680px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <div v-if="scheme" style="padding: 4px 0">
      <el-descriptions :column="2" size="small" border style="margin-bottom: 20px">
        <el-descriptions-item label="方案">{{ scheme.name }}</el-descriptions-item>
        <el-descriptions-item label="写入结果表">{{ scheme.result_table_label }}</el-descriptions-item>
        <el-descriptions-item label="数据来源" :span="2">
          <span v-if="scheme.dataset_id">
            <el-tag size="small" type="warning" effect="plain">数据集</el-tag>
            <span style="margin-left: 6px">{{ scheme.dataset_name }}</span>
          </span>
          <span v-else>
            <el-tag size="small" effect="plain">单表</el-tag>
            <span style="margin-left: 6px">{{ scheme.table_name }}</span>
          </span>
        </el-descriptions-item>
      </el-descriptions>

      <div style="font-size: 12px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px">
        本次执行额外筛选条件
      </div>
      <div style="font-size: 12px; color: var(--color-text-placeholder); margin-bottom: 10px; line-height: 1.6">
        与方案配置的筛选条件合并执行，同字段时以此处为准。可在此处指定月份等动态条件，方案配置无需改动。
      </div>

      <div v-loading="loading">
        <ReportFilterList
          ref="filterRef"
          v-model:filters="filters"
          :all-columns="allColumns"
          :table-name="scheme.table_name"
          :source-type="scheme.dataset_id ? 'dataset' : 'single'"
          :current-dataset-tables="currentDataset?.tables"
        />
      </div>

      <el-alert type="warning" :closable="false" show-icon style="margin-top: 16px">
        将把当前方案数据写入「{{ scheme.result_table_label }}」，匹配主键的行将被覆盖，当期孤儿行将被删除。
      </el-alert>
    </div>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="running" @click="confirm">确认执行</el-button>
    </template>
  </el-dialog>
</template>
