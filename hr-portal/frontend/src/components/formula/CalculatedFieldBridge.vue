<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { ColumnInfo } from '@/api/data'
import { dataApi } from '@/api/data'
import { datasetsApi, type DatasetCalculatedField, type DatasetItem } from '@/api/datasets'
import { useUserStore } from '@/stores/user'
import FormulaFieldEditor from './FormulaFieldEditor.vue'

const props = defineProps<{
  datasetId: number | null
  datasets: DatasetItem[]
  tables: { value: string; label: string }[]
}>()

const emit = defineEmits<{
  columnsChange: [columns: ColumnInfo[]]
  datasetChange: [dataset: DatasetItem | null]
  saved: [field: DatasetCalculatedField]
}>()

const userStore = useUserStore()

const columns = ref<ColumnInfo[]>([])
const currentDataset = ref<DatasetItem | null>(null)
const loading = ref(false)
const formulaEditorOpen = ref(false)

const canCreateField = computed(() => userStore.hasOp('datasource.datasets', 'C'))

function datasetTableName(table: DatasetItem['tables'][number]): string {
  return table.table_label || props.tables.find((t) => t.value === table.table_name)?.label || table.table_name
}

const sourceGroups = computed(() => {
  const groups = (currentDataset.value?.tables || []).map((item) => ({
    key: item.alias,
    label: datasetTableName(item),
  }))
  groups.push({ key: 'calc', label: '计算字段' })
  return groups
})

const formulaEditorFields = computed(() =>
  columns.value.filter((item) => !item.code.startsWith('calc.'))
)

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

async function refresh() {
  loading.value = true
  try {
    if (!props.datasetId) {
      currentDataset.value = null
      columns.value = []
      emit('datasetChange', null)
      emit('columnsChange', [])
      return
    }

    const ds = await datasetsApi.get(props.datasetId)
    currentDataset.value = ds
    emit('datasetChange', ds)

    const nextColumns: ColumnInfo[] = []
    for (const table of ds.tables) {
      const tableColumns = await dataApi.columns(table.table_name)
      const tableName = datasetTableName(table)
      for (const col of tableColumns) {
        nextColumns.push({
          ...col,
          code: `${table.alias}.${col.code}`,
          label: `${tableName}.${col.label}`,
        })
      }
    }

    const calcFields = await datasetsApi.calculatedFields(props.datasetId)
    nextColumns.push(...calcFields.map(calcColumn))
    columns.value = nextColumns
    emit('columnsChange', nextColumns)
  } catch {
    currentDataset.value = null
    columns.value = []
    emit('datasetChange', null)
    emit('columnsChange', [])
  } finally {
    loading.value = false
  }
}

function openEditor() {
  if (!canCreateField.value) return
  if (!props.datasetId) {
    ElMessage.warning('请先选择数据集')
    return
  }
  formulaEditorOpen.value = true
}

async function onSaved(field: DatasetCalculatedField) {
  await refresh()
  emit('saved', field)
}

watch(
  () => [props.datasetId, props.datasets.length],
  () => { refresh() },
  { immediate: true },
)

defineExpose({ refresh, openEditor })
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
    :dataset-id="datasetId"
    :fields="formulaEditorFields"
    @saved="onSaved"
  />
</template>
