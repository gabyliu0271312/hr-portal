<template>
  <div class="ingest-batches-page">
    <div class="page-header"><div><h2>入仓批次</h2><p>查看外部 Webhook 接收后的最终入仓状态；重放仅使用原始事件。</p></div><el-button @click="load">刷新</el-button></div>
    <el-form class="filters" inline>
      <el-form-item label="资源"><el-input v-model="filters.resource_code" clearable placeholder="资源编码" /></el-form-item>
      <el-form-item label="资产"><el-input v-model="filters.target_asset" clearable placeholder="目标资产" /></el-form-item>
      <el-form-item label="期间"><el-input v-model="filters.period_value" clearable placeholder="YYYYMM" /></el-form-item>
      <el-form-item label="状态"><el-select v-model="filters.status" clearable placeholder="全部"><el-option v-for="item in statuses" :key="item" :label="item" :value="item" /></el-select></el-form-item>
      <el-form-item><el-button type="primary" @click="load">查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
    </el-form>
    <el-table v-loading="loading" :data="items" border>
      <el-table-column prop="batch_id" label="批次" min-width="180" show-overflow-tooltip />
      <el-table-column prop="target_asset" label="资产" min-width="150" />
      <el-table-column prop="period_value" label="期间" width="100" />
      <el-table-column label="状态" width="130"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template></el-table-column>
      <el-table-column label="行数" width="120"><template #default="{ row }">{{ row.written_rows }}/{{ row.received_rows }}</template></el-table-column>
      <el-table-column prop="trace_id" label="Trace ID" min-width="140" show-overflow-tooltip />
      <el-table-column label="操作" width="150"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button><el-button v-if="canReplay && ['FAILED','DEAD_LETTER'].includes(row.status)" link type="warning" @click="replay(row)">重放</el-button></template></el-table-column>
    </el-table>
    <el-empty v-if="!loading && !items.length" description="暂无符合条件的入仓批次" />
    <el-pagination v-if="total" class="pagination" layout="total, prev, pager, next" :total="total" :page-size="limit" :current-page="page" @current-change="changePage" />
    <el-drawer v-model="detailVisible" title="入仓批次详情" size="440px"><el-descriptions v-if="detail" :column="1" border><el-descriptions-item label="批次">{{ detail.batch_id }}</el-descriptions-item><el-descriptions-item label="状态">{{ detail.status }}</el-descriptions-item><el-descriptions-item label="资产">{{ detail.target_asset }}</el-descriptions-item><el-descriptions-item label="期间">{{ detail.period_value || '-' }}</el-descriptions-item><el-descriptions-item label="接收/写入">{{ detail.received_rows }} / {{ detail.written_rows }}</el-descriptions-item><el-descriptions-item label="Trace ID">{{ detail.trace_id || '-' }}</el-descriptions-item><el-descriptions-item label="错误摘要">{{ detail.error_summary || '-' }}</el-descriptions-item></el-descriptions></el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { ucpApi } from '@/api/ucp'

const userStore = useUserStore()
const canReplay = userStore.hasOp('ucp.dead_letters', 'C')
const statuses = ['RECEIVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER']
const filters = reactive({ resource_code: '', target_asset: '', period_value: '', status: '' })
const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const limit = 20
const detail = ref<any>(null)
const detailVisible = ref(false)
const statusType = (status: string) => status === 'SUCCEEDED' ? 'success' : status === 'DEAD_LETTER' ? 'danger' : status === 'FAILED' ? 'warning' : 'info'
async function load(): Promise<void> { loading.value = true; try { const result = await ucpApi.warehouseIngestBatches({ ...filters, limit, offset: (page.value - 1) * limit }); items.value = result.items; total.value = result.total } catch (error: any) { ElMessage.error(error?.message || '加载入仓批次失败') } finally { loading.value = false } }
function reset(): void { Object.assign(filters, { resource_code: '', target_asset: '', period_value: '', status: '' }); page.value = 1; void load() }
function changePage(value: number): void { page.value = value; void load() }
async function openDetail(row: any): Promise<void> { try { detail.value = await ucpApi.warehouseIngestBatch(filters.resource_code || row.resource_code, row.batch_id); detailVisible.value = true } catch (error: any) { ElMessage.error(error?.message || '加载批次详情失败') } }
async function replay(row: any): Promise<void> { try { await ElMessageBox.confirm('将基于原始事件重新执行，不能编辑 payload。确认重放？', '确认重放', { type: 'warning' }); await ucpApi.replayWarehouseIngestBatch(row.resource_code, row.batch_id); ElMessage.success('已提交重放，请刷新查看最新状态'); await load() } catch (error: any) { if (error !== 'cancel') ElMessage.error(error?.message || '重放失败') } }
onMounted(load)
</script>

<style scoped>
.ingest-batches-page { padding: 20px; }.page-header { display:flex; justify-content:space-between; align-items:start; margin-bottom:16px }.page-header h2 { margin:0 0 6px }.page-header p { margin:0; color:#64748b }.filters { padding:12px 16px; background:var(--color-bg-card); margin-bottom:16px }.pagination { margin-top:16px; justify-content:flex-end }
@media (max-width: 768px) { .page-header { gap:12px; flex-direction:column }.filters :deep(.el-form-item) { display:flex; margin-right:0; width:100% }.filters :deep(.el-form-item__content) { flex:1 }.ingest-batches-page { overflow-x:auto; padding:12px } }
</style>
