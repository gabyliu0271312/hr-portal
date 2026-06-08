<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { ColumnInfo } from '@/api/data'
import { dataApi } from '@/api/data'
import { datasetsApi, type DatasetCalculatedField, type DatasetItem } from '@/api/datasets'
import { useUserStore } from '@/stores/user'
import FormulaFieldEditor from './FormulaFieldEditor.vue'

const props = defineProps<{
  sourceType: 'single' | 'dataset'
  tableName: string
  datasetId: number | null
  datasets: DatasetItem[]
  tables: { value: string; label: string }[]
  singleTableDatasetId?: number | null
}>()

const emit = defineEmits<{
  'update:singleTableDatasetId': [value: number | null]
  'columnsChange': [columns: ColumnInfo[]]
  'datasetChange': [dataset: DatasetItem | null]
  saved: [field: DatasetCalculatedField]
}>()

const userStore = useUserStore()

const columns = ref<ColumnInfo[]>([])
const currentDataset = ref<DatasetItem | null>(null)
const loading = ref(false)
const formulaEditorOpen = ref(false)
const resolvedSingleTableDatasetId = ref<number | null>(props.singleTableDatasetId || null)

const isDataset = computed(() => props.sourceType === 'dataset')
const canCreateField = computed(() => userStore.hasOp('datasource.datasets', 'C'))
const formulaDatasetId = computed(() => (
  isDataset.value ? props.datasetId : resolvedSingleTableDatasetId.value
))

const sourceName = computed(() => {
  if (isDataset.value) return currentDataset.value?.name || '数据集'
  return props.tables.find((item) => item.value === props.tableName)?.label || props.tableName
})

const sourceGroups = computed(() => {
  if (isDataset.value) {
    const groups = (currentDataset.value?.tables || []).map((item) => ({
      key: item.alias,
      label: `${item.alias} · ${props.tables.find((t) => t.value === item.table_name)?.label || item.table_name}`,
    }))
    groups.push({ key: 'calc', label: '计算字段' })
    return groups
  }
  return [{ key: sourceName.value, label: sourceName.value }]
})

const formulaEditorFields = computed(() => {
  const base = columns.value.filter((item) => !item.code.startsWith('calc.'))
  if (isDataset.value) return base
  return base.map((item) => ({
    ...item,
    code: `current.${item.code}`,
    label: `current.${item.label}`,
  }))
})

function singleTableDatasetName(tableName: string) {
  const label = props.tables.find((item) => item.value === tableName)?.label || tableName
  return `单表字段库 · ${label}`
}

function findSingleTableDataset(tableName: string) {
  return props.datasets.find((item) =>
    item.name.startsWith('单表字段库 ·')
    && item.tables.length === 1
    && item.tables[0]?.table_name === tableName
    && item.tables[0]?.alias === 'current'
  ) || props.datasets.find((item) => item.name === singleTableDatasetName(tableName))
}

function setSingleTableDatasetId(value: number | null) {
  resolvedSingleTableDatasetId.value = value
  emit('update:singleTableDatasetId', value)
}

function calcColumn(field: DatasetCalculatedField): ColumnInfo {
  return {
    code: `calc.${field.code}`,
    label: field.label,
    data_type: field.data_type,
    is_pk_part: false,
    is_sensitive: field.is_sensitive,
    is_visible: field.is_active,
    display_order: 999,
    auto_discovered: false,
    enum_options: null,
    agg_role: field.agg_role,
    is_computed: true,
  }
}

async function ensureSingleTableDataset() {
  if (isDataset.value) return props.datasetId
  if (resolvedSingleTableDatasetId.value) return resolvedSingleTableDatasetId.value

  const existing = findSingleTableDataset(props.tableName)
  if (existing) {
    setSingleTableDatasetId(existing.id)
    return existing.id
  }

  const ds = await datasetsApi.ensureSingleTableDataset(props.tableName)
  setSingleTableDatasetId(ds.id)
  return ds.id
}

async function refresh() {
  loading.value = true
  try {
    if (props.sourceType === 'single') {
      currentDataset.value = null
      emit('datasetChange', null)

      const baseColumns = await dataApi.columns(props.tableName)
      const singleDsId = resolvedSingleTableDatasetId.value || findSingleTableDataset(props.tableName)?.id || null
      setSingleTableDatasetId(singleDsId)

      const nextColumns = [...baseColumns]
      if (singleDsId) {
        const calcFields = await datasetsApi.calculatedFields(singleDsId)
        nextColumns.push(...calcFields.map(calcColumn))
      }
      columns.value = nextColumns
      emit('columnsChange', nextColumns)
    } else if (props.datasetId) {
      const ds = await datasetsApi.get(props.datasetId)
      currentDataset.value = ds
      emit('datasetChange', ds)

      const nextColumns: ColumnInfo[] = []
      for (const t of ds.tables) {
        const tcols = await dataApi.columns(t.table_name)
        for (const c of tcols) {
          nextColumns.push({ ...c, code: `${t.alias}.${c.code}`, label: `${t.alias}.${c.label}` })
        }
      }
      const calcFields = await datasetsApi.calculatedFields(props.datasetId)
      nextColumns.push(...calcFields.map(calcColumn))
      columns.value = nextColumns
      emit('columnsChange', nextColumns)
    } else {
      currentDataset.value = null
      columns.value = []
      emit('datasetChange', null)
      emit('columnsChange', [])
    }
  } catch {
    currentDataset.value = null
    columns.value = []
    emit('datasetChange', null)
    emit('columnsChange', [])
  } finally {
    loading.value = false
  }
}

async function openEditor() {
  if (!canCreateField.value) return
  if (!isDataset.value) {
    try {
      await ensureSingleTableDataset()
      await refresh()
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.detail || '创建单表字段库失败')
      return
    }
  }
  formulaEditorOpen.value = true
}

async function onSaved(field: DatasetCalculatedField) {
  await refresh()
  emit('saved', field)
}

watch(
  () => props.singleTableDatasetId,
  (value) => {
    resolvedSingleTableDatasetId.value = value || null
  }
)

watch(
  () => [props.sourceType, props.tableName, props.datasetId, props.singleTableDatasetId, props.datasets.length],
  () => { refresh() },
  { immediate: true }
)

defineExpose({ refresh, openEditor, ensureSingleTableDataset })
</script>

<template>
  <slot
    :columns="columns"
    :loading="loading"
    :source-groups="sourceGroups"
    :current-dataset="currentDataset"
    :can-create-field="canCreateField"
    :create-field="openEditor"
    :refresh="refresh"
  />

  <FormulaFieldEditor
    v-model:visible="formulaEditorOpen"
    :dataset-id="formulaDatasetId"
    :fields="formulaEditorFields"
    @saved="onSaved"
  />
</template>
