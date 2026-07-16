<template>
  <div class="dead-letter-list">
    <div class="page-header">
      <h2>死信队列（Dead Letters）</h2>
      <p class="desc">事件派发失败重试耗尽后进入死信队列。可手动重放或丢弃。</p>
    </div>

    <div class="toolbar">
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      <PermissionButton menu="ucp.events" op="U" type="warning" :icon="VideoPlay" @click="onScanRetries">
        扫描到期重试
      </PermissionButton>
    </div>

    <el-table :data="items" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="event_uuid" label="Event UUID" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          <el-link type="primary" @click="goEvent(row)">{{ row.event_uuid }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="trigger_code" label="触发器" min-width="160">
        <template #default="{ row }">
          <code v-if="row.trigger_code">{{ row.trigger_code }}</code>
          <span v-else class="empty">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="attempt" label="已重试" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" type="danger">{{ row.attempt }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="error_code" label="错误码" width="140">
        <template #default="{ row }">
          <code v-if="row.error_code">{{ row.error_code }}</code>
          <span v-else class="empty">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="error_message" label="错误信息" min-width="240" show-overflow-tooltip />
      <el-table-column prop="last_retry_at" label="最后重试" width="170">
        <template #default="{ row }">{{ formatTime(row.last_retry_at) }}</template>
      </el-table-column>
      <el-table-column prop="updated_at" label="进入死信" width="170">
        <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="goEvent(row)">查看事件</el-button>
          <PermissionButton menu="ucp.events" op="C" size="small" link type="warning" @click="onReplay(row)">
            重放
          </PermissionButton>
          <PermissionButton menu="ucp.events" op="C" size="small" link type="danger" @click="onDiscard(row)">
            丢弃
          </PermissionButton>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      @current-change="loadList"
      @size-change="loadList"
    />
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, VideoPlay } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'
import PermissionButton from '@/components/PermissionButton.vue'

const router = useRouter()

const items = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

async function loadList() {
  loading.value = true
  try {
    const res = await ucpApi.listDeadLetters({
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    })
    items.value = res.items || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

async function onReplay(row: any) {
  await ElMessageBox.confirm(
    `确认重放死信 #${row.id}（事件 ${row.event_uuid}）？\n重置 attempt 并重新派发到 pipeline。`,
    '重放死信',
    { type: 'warning' },
  )
  try {
    const res = await ucpApi.replayDeadLetter(row.id)
    ElMessage.success(`已重放：${res.status}（attempt=${res.attempt}）`)
    loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail?.message || '重放失败')
  }
}

async function onDiscard(row: any) {
  await ElMessageBox.confirm(
    `确认丢弃死信 #${row.id}？\n此操作不可恢复。`,
    '丢弃死信',
    { type: 'error' },
  )
  try {
    await ucpApi.discardDeadLetter(row.id)
    ElMessage.success('已丢弃')
    loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail?.message || '丢弃失败')
  }
}

async function onScanRetries() {
  try {
    const res = await ucpApi.scanDueRetries()
    if (res.scanned === 0) {
      ElMessage.info('没有到期的重试')
    } else {
      ElMessage.success(`扫描完成，触发 ${res.scanned} 条重派发`)
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '扫描失败')
  }
}

function goEvent(row: any) {
  router.push({ name: 'UcpEventDetail', params: { eventId: String(row.event_id) } })
}

function formatTime(t: string | null) {
  if (!t) return '-'
  return formatDateTime(t)
}

onMounted(loadList)
</script>

<style scoped>
.dead-letter-list { padding: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header .desc { color: #909399; margin: 0 0 16px; font-size: 13px; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.pager { margin-top: 16px; text-align: right; }
.empty { color: #c0c4cc; }
code { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 12px; }
</style>
