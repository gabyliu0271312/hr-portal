<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { api } from '@/api/client'
import { listAssets } from '@/api/warehouse'

const props = defineProps<{
  modelValue: { source_type: string; source_id: string; source_label?: string }
  allowedTypes?: string[]
  allowedLayers?: string[]
}>()

const emit = defineEmits<{ 'update:modelValue': [v: any] }>()

const allowedTypes = props.allowedTypes || ['table']
const allowedLayers = props.allowedLayers || ['DWD', 'DWS', 'ADS']

const options = ref<{ label: string; value: string; layer: string; displayLabel: string }[]>([])
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

async function loadOptions() {
  loading.value = true
  try {
    const st = selectedType.value
    if (st === 'table') {
      const res = await listAssets({ page_size: 200 })
      options.value = (res.items || [])
        .filter((a: any) => allowedLayers.includes(a.warehouse_layer))
        .map((a: any) => ({
          label: `${a.table_label || a.table_name} (${a.warehouse_layer})`,
          value: a.table_name,
          layer: a.warehouse_layer,
          displayLabel: a.table_label || a.table_name,
        }))
    } else if (st === 'dataset') {
      const { data } = await api.get('/warehouse/models', { params: { page_size: 200 } })
      options.value = (data.items || []).map((m: any) => ({
        label: `${m.name || m.label || `模型 #${m.id}`} (${m.status || ''})`,
        value: String(m.id),
        layer: m.status || '',
        displayLabel: m.name || m.label || `模型 #${m.id}`,
      }))
    } else if (st === 'metric') {
      const { data } = await api.get('/warehouse/metrics', { params: { page_size: 200 } })
      options.value = (data.items || []).map((m: any) => ({
        label: `${m.name || m.metric_name || `指标 #${m.id}`} (${m.status || ''})`,
        value: String(m.id),
        layer: m.status || '',
        displayLabel: m.name || m.metric_name || `指标 #${m.id}`,
      }))
    } else if (st === 'ads') {
      const { data } = await api.get('/warehouse/ads-definitions', { params: { page_size: 200 } })
      options.value = (Array.isArray(data) ? data : (data.items || [])).map((a: any) => ({
        label: `${a.name || `ADS #${a.id}`} (${a.status || ''})`,
        value: String(a.id),
        layer: a.status || '',
        displayLabel: a.name || `ADS #${a.id}`,
      }))
    } else if (st === 'report') {
      const { data } = await api.get('/reports', { params: { page_size: 200 } })
      const items = Array.isArray(data) ? data : (data.items || [])
      options.value = items.map((r: any) => ({
        label: `${r.name || r.title || `报表 #${r.id}`} (${r.status || ''})`,
        value: String(r.id),
        layer: r.status || '',
        displayLabel: r.name || r.title || `报表 #${r.id}`,
      }))
    } else {
      options.value = []
    }
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

// 弹窗复用场景：父组件 modelValue 变化时同步内部状态
watch(() => props.modelValue, (val) => {
  if (!val) return
  selectedType.value = val.source_type || allowedTypes[0]
  selectedId.value = val.source_id || ''
  sourceLabel.value = val.source_label || ''
  loadOptions()
}, { deep: true })

watch(selectedType, () => { selectedId.value = ''; sourceLabel.value = ''; loadOptions(); emitChange() })
watch(selectedId, (val) => {
  if (!val) return
  const opt = options.value.find(o => o.value === val)
  sourceLabel.value = opt?.displayLabel || sourceLabel.value || val
  emitChange()
})

onMounted(() => loadOptions())
</script>

<template>
  <div class="source-picker">
    <el-select v-model="selectedType" placeholder="来源类型" style="width: 130px">
      <el-option v-for="t in TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
    </el-select>
    <el-select
      v-model="selectedId"
      filterable
      :placeholder="`选择${TYPE_OPTIONS.find(t => t.value === selectedType)?.label || '来源'}`"
      :loading="loading"
      style="flex: 1; min-width: 240px"
    >
      <el-option v-for="o in options" :key="o.value" :label="o.label" :value="o.value">
        <span>{{ o.displayLabel }}</span>
        <el-tag v-if="o.layer" size="small" type="info" style="margin-left: 8px">{{ o.layer }}</el-tag>
      </el-option>
    </el-select>
  </div>
</template>

<style scoped>
.source-picker { display: flex; gap: 8px; align-items: center; }
</style>
