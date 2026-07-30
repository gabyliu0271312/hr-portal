<template>
  <div class="warehouse-sink-config">
    <el-alert v-if="config.write_mode === 'replace'" title="危险：每次运行会清空目标资产全部数据后重写。" type="error" :closable="false" style="margin-bottom:12px" />
    <el-alert v-if="config.write_mode === 'period_full_snapshot'" title="本批次会替换目标期间数据，并删除该期间未出现的业务键；历史期间保持不变。" type="warning" :closable="false" style="margin-bottom:12px" />
    <el-form-item label="目标资产"><el-select :model-value="modelValue.target_asset" filterable placeholder="选择已发布数据资产" style="width:100%" @change="selectAsset"><el-option v-for="asset in assets" :key="asset.table_name" :label="asset.table_label" :value="asset.table_name" /></el-select></el-form-item>
    <IngestionModeSelect v-model="ingestionMode" :is-period="assetIsPeriod" :period-label="periodLabel" :key-labels="businessKeyLabels" />
    <el-form-item v-if="config.write_mode === 'period_full_snapshot'" label="期间字段"><el-input :model-value="config.period_field" disabled /></el-form-item>
    <el-form-item label="业务主键"><el-tag v-for="column in columns.filter(item => item.is_pk_part)" :key="column.column_code" size="small" style="margin-right:6px">{{ column.column_label }}</el-tag></el-form-item>
    <el-form-item label="允许写入字段"><el-select v-model="config.field_whitelist" multiple filterable style="width:100%"><el-option v-for="column in columns" :key="column.column_code" :label="column.column_label" :value="column.column_code" /></el-select></el-form-item>
    <el-form-item label="事件补充字段"><el-select v-model="config.event_fields" multiple allow-create filterable default-first-option placeholder="例如 period" style="width:100%" /></el-form-item>
    <el-divider content-position="left">字段映射</el-divider>
    <div v-for="(mapping, index) in config.mapping" :key="index" class="mapping-row"><el-input v-model="mapping.source" placeholder="来源字段" /><span>→</span><el-select v-model="mapping.target" filterable placeholder="目标字段"><el-option v-for="column in columns" :key="column.column_code" :label="column.column_label" :value="column.column_code" :disabled="config.mapping.some((item: any, itemIndex: number) => itemIndex !== index && item.target === column.column_code)" /></el-select><el-select v-model="mapping.transform" placeholder="转换"><el-option label="原样" value="identity" /><el-option label="转字符串" value="string" /><el-option label="年月转 YYYYMM" value="yyyy_mm_to_yyyymm" /><el-option label="百分比 ÷100" value="decimal_divide_100" /></el-select><el-checkbox v-model="mapping.required">必填</el-checkbox><el-input-number v-model="mapping.minimum" :precision="4" placeholder="最小值" /><el-input-number v-model="mapping.maximum" :precision="4" placeholder="最大值" /><el-button link type="danger" @click="config.mapping.splice(index, 1)">删除</el-button></div>
    <el-button size="small" @click="config.mapping.push({ source: '', target: '', transform: 'identity', required: false })">添加映射</el-button>
    <el-divider content-position="left">聚合校验</el-divider>
    <div v-for="(rule, index) in config.validations" :key="index" class="mapping-row"><el-input v-model="rule.group_by_text" placeholder="分组字段，逗号分隔" @change="syncRules" /><el-select v-model="rule.sum_field" placeholder="汇总字段"><el-option v-for="column in columns" :key="column.column_code" :label="column.column_label" :value="column.column_code" /></el-select><el-input-number v-model="rule.expected" :precision="4" /><el-input-number v-model="rule.tolerance" :precision="4" :step="0.0001" /><el-button link type="danger" @click="config.validations.splice(index, 1)">删除</el-button></div>
    <el-button size="small" @click="config.validations.push({ type: 'group_sum_equals', group_by_text: '', sum_field: '', expected: 1, tolerance: 0.0001 })">添加聚合校验</el-button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getAsset, listAssets, listAssetColumns, type Asset, type AssetColumn } from '@/api/warehouse'
import IngestionModeSelect, { type IngestionMode } from '@/components/warehouse/IngestionModeSelect.vue'

const props = defineProps<{ modelValue: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, any>] }>()
const assets = ref<Asset[]>([])
const columns = ref<AssetColumn[]>([])
const assetIsPeriod = ref(false)
const periodLabel = ref<string | null>(null)
const config = computed(() => props.modelValue)
const businessKeyLabels = computed(() => columns.value.filter(column => column.is_pk_part).map(column => column.column_label))
const modeByWriteMode: Record<string, IngestionMode> = { upsert: 'incremental_upsert', append: 'append', period_full_snapshot: 'period_full_snapshot', replace: 'current_snapshot' }
const writeModeByMode: Record<IngestionMode, string> = { current_snapshot: 'upsert', incremental_upsert: 'upsert', append: 'append', period_full_snapshot: 'period_full_snapshot' }
const ingestionMode = computed<IngestionMode | null>({
  get: () => modeByWriteMode[config.value.write_mode] || 'incremental_upsert',
  set: (mode) => {
    if (!mode) return
    config.value.write_mode = writeModeByMode[mode]
    if (mode === 'period_full_snapshot') {
      config.value.period_field = periodLabel.value
      const keys = columns.value.filter(column => column.is_pk_part).map(column => column.column_code)
      config.value.field_whitelist = [...new Set([...(config.value.field_whitelist || []), ...keys])]
      delete config.value.primary_key
    }
  },
})
function ensureConfig(): void { config.value.event_fields ||= []; config.value.mapping ||= []; config.value.validations ||= []; config.value.field_whitelist ||= [] }
async function selectAsset(value: string): Promise<void> {
  columns.value = (await listAssetColumns(value)).columns
  const asset = await getAsset(value)
  assetIsPeriod.value = asset.is_period
  periodLabel.value = asset.period_col
  config.value.target_asset = value
  config.value.period_field = null
  config.value.field_whitelist = []
  config.value.mapping = []
  config.value.validations = []
  if (asset.is_period) ingestionMode.value = 'period_full_snapshot'
}
function syncRules(): void { config.value.validations.forEach((rule: any) => { rule.group_by = String(rule.group_by_text || '').split(',').map((item) => item.trim()).filter(Boolean) }) }
watch(() => props.modelValue.target_asset, async (value) => {
  ensureConfig()
  if (value) {
    columns.value = (await listAssetColumns(value)).columns
    const asset = await getAsset(value)
    assetIsPeriod.value = asset.is_period
    periodLabel.value = asset.period_col
    if (asset.is_period) ingestionMode.value = 'period_full_snapshot'
  }
}, { immediate: true })
listAssets({ asset_status: 'published', page_size: 200 }).then((result: any) => { assets.value = result.items || result }).catch(() => { assets.value = [] })
</script>

<style scoped>
.mapping-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:8px }
.mapping-row .el-input,.mapping-row .el-select { flex:1; min-width:140px }
@media (max-width: 768px) { .mapping-row > * { flex: 1 1 100% } }
</style>
