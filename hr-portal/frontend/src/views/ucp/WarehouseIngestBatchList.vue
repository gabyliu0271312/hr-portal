<template>
  <div class="batch-list">
    <div class="batch-toolbar">
      <el-select v-model="filters.system_id" clearable placeholder="业务系统" @change="load"><el-option v-for="item in systems" :key="item.id" :label="item.system_name" :value="item.id" /></el-select>
      <el-select v-model="filters.status" clearable placeholder="状态" @change="load"><el-option v-for="item in statuses" :key="item" :label="item" :value="item" /></el-select>
      <el-input v-model="filters.target_asset" clearable placeholder="目标资产" @keyup.enter="load" />
      <el-input v-model="filters.period_value" clearable placeholder="期间" @keyup.enter="load" />
      <el-button type="primary" @click="load">查询</el-button>
    </div>
    <el-table :data="items" v-loading="loading" stripe border>
      <el-table-column prop="batch_id" label="批次" min-width="220" show-overflow-tooltip />
      <el-table-column prop="target_asset" label="目标资产" min-width="170" />
      <el-table-column prop="period_value" label="期间" width="100" />
      <el-table-column prop="status" label="状态" width="140"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template></el-table-column>
      <el-table-column label="行数" width="120"> <template #default="{ row }">{{ row.written_rows }}/{{ row.received_rows }}</template></el-table-column>
      <el-table-column prop="trace_id" label="Trace" min-width="120" show-overflow-tooltip />
      <el-table-column label="操作" width="150"><template #default="{ row }"><el-button link type="primary" @click="view(row)">详情</el-button><el-button v-if="['FAILED', 'DEAD_LETTER'].includes(row.status)" link type="warning" @click="replay(row)">重放</el-button></template></el-table-column>
    </el-table>
    <el-drawer v-model="detailVisible" title="入仓批次详情" size="480px"><el-descriptions v-if="detail" :column="1" border><el-descriptions-item v-for="key in detailKeys" :key="key" :label="key">{{ detail[key] || '—' }}</el-descriptions-item></el-descriptions><el-alert v-if="detail?.error_summary" type="error" :closable="false" :title="detail.error_summary" style="margin-top:16px" /></el-drawer>
  </div>
</template>
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ucpApi } from '@/api/ucp'

const props = defineProps<{ resourceId?: number | null }>()
const systems = ref<any[]>([])
const items = ref<any[]>([]), loading = ref(false), detailVisible = ref(false), detail = ref<any>(null)
const filters = reactive({ system_id: undefined as number | undefined, status: '', target_asset: '', period_value: '' })
const statuses = ['RECEIVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER']
const detailKeys = ['batch_id', 'event_id', 'target_asset', 'period_value', 'status', 'received_rows', 'written_rows', 'pipeline_run_id', 'trace_id', 'received_at', 'processed_at']
function statusType(s: string) { return s === 'SUCCEEDED' ? 'success' : ['FAILED', 'DEAD_LETTER'].includes(s) ? 'danger' : s === 'PROCESSING' ? 'warning' : 'info' }
async function load() { loading.value = true; try { const res = await ucpApi.ingestBatches({ ...filters, resource_id: props.resourceId || undefined }); items.value = res.items || [] } finally { loading.value = false } }
async function view(row: any) { detail.value = await ucpApi.ingestBatchDetail(String(row.resource_code || row.resource_id), row.batch_id).catch(() => row); detailVisible.value = true }
async function replay(row: any) { try { await ElMessageBox.confirm(`确认重放批次「${row.batch_id}」？系统将只重放原始事件，不允许编辑内容。`, '重放确认', { type: 'warning' }); await ucpApi.ingestBatchReplay(String(row.resource_code || row.resource_id), row.batch_id); ElMessage.success('批次已提交重放'); await load() } catch (error: any) { if (error !== 'cancel') ElMessage.error(error?.response?.data?.detail || '重放失败') } }
onMounted(async () => { systems.value = (await ucpApi.systems()).items || []; await load() })
</script>
<style scoped>.batch-toolbar { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap }.batch-toolbar .el-input { width:180px }.batch-toolbar .el-select { width:160px }</style>
