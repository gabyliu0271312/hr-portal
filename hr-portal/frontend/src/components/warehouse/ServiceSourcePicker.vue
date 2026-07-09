<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { listAssets } from '@/api/warehouse'

const props = defineProps<{
  modelValue: { source_type: string; source_id: string; source_label?: string }
  /** 允许的来源类型，默认只允许 table */
  allowedTypes?: string[]
  /** 允许的来源层级，默认排除 ODS */
  allowedLayers?: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [v: any] }>()

const allowedTypes = props.allowedTypes || ['table']
const allowedLayers = props.allowedLayers || ['DWD', 'DWS', 'ADS']

const options = ref<{ label: string; value: string; layer: string }[]>([])
const loading = ref(false)
const selectedType = ref(props.modelValue?.source_type || allowedTypes[0])
const selectedId = ref(props.modelValue?.source_id || '')
const sourceLabel = ref(props.modelValue?.source_label || '')

const TYPE_OPTIONS = [
  { label: '数据表', value: 'table' },
  { label: '数据集', value: 'dataset' },
  { label: '指标', value: 'metric' },
  { label: '消费资产', value: 'ads' },
  { label: '报表', value: 'report' },
].filter(t => allowedTypes.includes(t.value))

async function loadAssets() {
  if (selectedType.value !== 'table') { options.value = []; return }
  loading.value = true
  try {
    const res = await listAssets({ page_size: 500 })
    options.value = (res.items || [])
      .filter((a: any) => allowedLayers.includes(a.warehouse_layer))
      .map((a: any) => ({
        label: `${a.table_label || a.table_name} (${a.warehouse_layer})`,
        value: a.table_name,
        layer: a.warehouse_layer,
      }))
  } catch { options.value = [] }
  finally { loading.value = false }
}

function emitChange() {
  emit('update:modelValue', {
    source_type: selectedType.value,
    source_id: selectedId.value,
    source_label: sourceLabel.value,
  })
}

watch(selectedType, () => { selectedId.value = ''; sourceLabel.value = ''; loadAssets(); emitChange() })
watch(selectedId, (val) => {
  const opt = options.value.find(o => o.value === val)
  sourceLabel.value = opt?.label || val
  emitChange()
})

onMounted(() => loadAssets())
</script>

<template>
  <div class="source-picker">
    <el-select v-model="selectedType" placeholder="来源类型" style="width: 130px">
      <el-option v-for="t in TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
    </el-select>
    <el-select
      v-if="selectedType === 'table'"
      v-model="selectedId"
      filterable
      placeholder="选择来源表"
      :loading="loading"
      style="flex: 1; min-width: 240px"
    >
      <el-option v-for="o in options" :key="o.value" :label="o.label" :value="o.value">
        <span>{{ o.value }}</span>
        <el-tag size="small" type="info" style="margin-left: 8px">{{ o.layer }}</el-tag>
      </el-option>
    </el-select>
    <el-input
      v-else
      v-model="selectedId"
      :placeholder="`输入 ${TYPE_OPTIONS.find(t => t.value === selectedType)?.label || ''} ID`"
      style="flex: 1; min-width: 200px"
    />
  </div>
</template>

<style scoped>
.source-picker { display: flex; gap: 8px; align-items: center; }
</style>
