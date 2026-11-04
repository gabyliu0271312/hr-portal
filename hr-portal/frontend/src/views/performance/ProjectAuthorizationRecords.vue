<template>
  <div class="authorization-records">
    <UiPageHeader title="授权及转交记录" @back="goBack" />
    <PerformanceLineTabs v-model="activeTab" :tabs="tabs" flush class="record-tabs">
      <section class="records-surface">
        <div class="records-toolbar"><span>{{ rows.length }} 个记录</span><button class="filter-button" type="button" disabled title="筛选暂不可用">筛选</button></div>
        <PerformanceManagementTable
          :rows="pageRows"
          :columns="columns"
          :loading="loading"
          loading-text="正在加载记录…"
          :empty-text="error || '暂无记录'"
          table-aria-label="授权及转交记录"
          pagination-aria-label="授权及转交记录分页"
          :page="page"
          :page-size="10"
          :total="rows.length"
          scroll-mode="page"
          row-key="id"
          :show-pagination="true"
          @page-change="page = $event"
        >
          <template #cell="{ row, column }">
            <span v-if="column.key === 'status'"><span class="status-dot" />{{ row.status }}</span>
            <span v-else-if="column.key === 'stages'"><span v-for="stage in row.stages" :key="stage" class="stage-tag">{{ stage }}</span></span>
            <span v-else-if="column.key === 'reviewees'">{{ row.reviewees[0] || '--' }}<span v-if="row.reviewees.length > 1" class="more-count">+{{ row.reviewees.length - 1 }}</span></span>
            <button v-else-if="column.key === 'action' && row.can_revoke" class="text-action" type="button" :disabled="loading" @click="revoke(row)">撤销授权</button>
            <span v-else-if="column.key === 'action'">--</span>
            <span v-else-if="column.key === 'submitted_at'">{{ formatDate(row.submitted_at) }}</span>
            <span v-else>{{ row[column.key] || '--' }}</span>
          </template>
        </PerformanceManagementTable>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      </section>
    </PerformanceLineTabs>
    <PerformanceConfirmDialog v-model="confirmOpen" :message="`确认撤销对${revokeTarget?.authorized_person || '该人员'}的任务授权？`" description="撤销后，被授权人将失去该任务的处理资格；已保存和提交内容保留。" confirm-text="撤销授权" confirm-variant="primary" :loading="loading" @confirm="confirmRevoke" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { projectManagementApi, type ProjectAuthorizationRecord } from '@/api/performance'
import UiPageHeader from '@/components/ui/UiPageHeader.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const activeTab = ref('authorization')
const tabs = [{ key: 'authorization', label: '授权记录' }, { key: 'transfer', label: '转交记录' }]
const data = ref<{ authorization_records: ProjectAuthorizationRecord[]; transfer_records: ProjectAuthorizationRecord[] }>({ authorization_records: [], transfer_records: [] })
const loading = ref(false)
const error = ref('')
const notice = ref('')
const confirmOpen = ref(false)
const revokeTarget = ref<ProjectAuthorizationRecord | null>(null)
const page = ref(1)
let sequence = 0
const cycleId = computed(() => Number(route.query.cycle_id || 0))
const rows = computed(() => activeTab.value === 'authorization' ? data.value.authorization_records : data.value.transfer_records)
const pageRows = computed(() => rows.value.slice((page.value - 1) * 10, page.value * 10))
const columns = [
  { key: 'initiator', label: '发起人', width: 180 }, { key: 'status', label: '状态', width: 120 },
  { key: 'authorized_person', label: '被授权人', width: 180 }, { key: 'stages', label: '授权环节', width: 240 },
  { key: 'reviewees', label: '被评估人', width: 200 }, { key: 'submitted_at', label: '授权提交时间', width: 180 }, { key: 'action', label: '操作', width: 150 },
]
async function load() {
  if (!cycleId.value) { error.value = '缺少绩效周期'; return }
  const current = ++sequence
  loading.value = true; error.value = ''; page.value = 1
  data.value = { authorization_records: [], transfer_records: [] }
  try { const result = await projectManagementApi.authorizationRecords(cycleId.value); if (current === sequence) data.value = result } catch { if (current === sequence) error.value = '授权记录加载失败，请稍后重试' } finally { if (current === sequence) loading.value = false }
}
function goBack() { void router.push({ name: 'PerformanceProjectManagement', query: { cycle_id: String(cycleId.value) } }) }
function formatDate(value: string) { return value ? new Date(value).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 16) + '（GMT+8）' : '--' }
async function revoke(row: ProjectAuthorizationRecord) {
  if (!row.project_id || !row.task_id || !row.authorization_id || loading.value) return
  revokeTarget.value = row
  confirmOpen.value = true
}
async function confirmRevoke() {
  const row = revokeTarget.value
  if (!row?.project_id || !row.task_id || !row.authorization_id || loading.value) return
  confirmOpen.value = false
  loading.value = true
  try { await projectManagementApi.revokeTaskAuthorization(row.project_id, row.task_id, row.authorization_id); await load(); notice.value = '授权已撤销，已保存和提交内容保留' } catch { notice.value = '撤销失败，请刷新记录后重试' } finally { loading.value = false; revokeTarget.value = null }
}
watch(activeTab, () => { page.value = 1 })
watch(cycleId, () => void load())
onMounted(() => void load())
</script>

<style scoped>
.authorization-records :deep(thead .feishu-cell) { font-weight:400; }

:where(.project-management-page, .project-reminder-page, .authorization-records, .calibration-authorization) { font-family: 'Helvetica Neue', Tahoma, 'PingFang SC', 'Microsoft Yahei', Arial, 'Hiragino Sans GB', sans-serif; }

.authorization-records { position:relative; display:flex; width:100vw; min-width:0; height:100vh; min-height:0; flex-direction:column; background:#f5f6f7; color:#1f2329; }
.record-tabs { flex:1; min-height:0; padding:calc(var(--layout-topbar-height) + 12px) 20px 0; }
.records-surface { min-height:calc(100vh - 144px); margin-top:0; padding:0 20px 20px; border-radius:8px; background:#fff; }
.records-toolbar { display:flex; height:68px; align-items:center; justify-content:space-between; border-bottom:1px solid #dee0e3; font-size:14px; }
.filter-button { width:80px; height:32px; border:1px solid #d0d3d6; border-radius:6px; background:#fff; color:#1f2329; font:inherit; cursor:pointer; }
.status-dot { display:inline-block; width:8px; height:8px; margin-right:8px; border-radius:50%; background:#3370ff; }
.stage-tag { display:inline-block; margin-right:8px; padding:4px 8px; border-radius:4px; background:#eff0f1; white-space:nowrap; }
.more-count { display:inline-block; margin-left:8px; padding:2px 8px; border-radius:14px; background:#eff0f1; }
.text-action { border:0; background:transparent; color:#3370ff; font:inherit; cursor:pointer; }
.notice { color:#646a73; }
</style>
