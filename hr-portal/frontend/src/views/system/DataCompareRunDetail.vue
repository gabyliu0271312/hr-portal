<template>
  <div class="run-detail">
    <el-page-header @back="$router.back()" :content="`执行记录 #${runId}`" />

    <el-card v-loading="loading" class="mt-16">
      <template v-if="run">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="任务ID">{{ run.task_id }}</el-descriptions-item>
          <el-descriptions-item label="执行ID">{{ run.id }}</el-descriptions-item>
          <el-descriptions-item label="触发方式">
            <el-tag :type="triggerTypeTag(run.trigger_type)">{{ triggerTypeLabel(run.trigger_type) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTag(run.status)">{{ statusLabel(run.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="差异数量">{{ run.diff_count }}</el-descriptions-item>
          <el-descriptions-item label="执行时长">{{ run.duration_ms ? `${run.duration_ms}ms` : '-' }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ run.started_at }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">{{ run.finished_at || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-divider v-if="run.error_message" />
        <el-alert
          v-if="run.error_message"
          :title="'执行错误'"
          type="error"
          :description="run.error_message"
          :closable="false"
          show-icon
        />

        <el-divider v-if="run.summary" content-position="left">对比摘要</el-divider>
        <el-descriptions v-if="run.summary" :column="2" border>
          <el-descriptions-item label="总对比数">{{ run.summary.total_compared ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="一致数">{{ run.summary.matched_count ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="差异数">{{ run.summary.diff_count ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="仅A侧">{{ run.summary.only_in_a_count ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="仅B侧">{{ run.summary.only_in_b_count ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ run.summary.status ?? '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-divider v-if="run.detail?.details?.length" content-position="left">
          差异明细 ({{ run.detail.details.length }} 条)
        </el-divider>
        <el-table
          v-if="run.detail?.details?.length"
          :data="run.detail.details"
          border
          max-height="400"
          size="small"
        >
          <el-table-column
            v-for="col in detailColumns"
            :key="col"
            :prop="col"
            :label="col"
            min-width="120"
          />
        </el-table>
      </template>
      <el-empty v-else-if="!loading" description="未找到执行记录" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { dataCompareApi, type RunDetail } from '@/api/data-compare'

const route = useRoute()
const runId = computed(() => Number(route.params.runId))

const loading = ref(false)
const run = ref<RunDetail | null>(null)

const detailColumns = computed(() => {
  if (!run.value?.detail?.details?.length) return []
  return Object.keys(run.value.detail.details[0])
})

function triggerTypeLabel(t: string) {
  const map: Record<string, string> = { manual: '手动', scheduled: '定时', ai_chat: 'AI对话' }
  return map[t] || t
}
function triggerTypeTag(t: string): '' | 'success' | 'warning' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'info'> = {
    manual: '', scheduled: 'success', ai_chat: 'info',
  }
  return map[t] || 'info'
}
function statusLabel(s: string) {
  const map: Record<string, string> = { success: '成功', partial_diff: '有差异', failed: '失败' }
  return map[s] || s
}
function statusTag(s: string): '' | 'success' | 'warning' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger'> = {
    success: 'success', partial_diff: 'warning', failed: 'danger',
  }
  return map[s] || ''
}

async function loadRun() {
  loading.value = true
  try {
    run.value = await dataCompareApi.getRun(runId.value)
  } finally {
    loading.value = false
  }
}

onMounted(loadRun)
</script>

<style scoped>
.run-detail { padding: 16px; }
.mt-16 { margin-top: 16px; }
</style>
