<script setup lang="ts">
import { ref, watch } from 'vue'
import { performanceCycleApi, type PerformancePersonChangeRecord } from '@/api/performance'

const props = defineProps<{
  modelValue: boolean
  cycleId: number
  employeeNo: string
  employeeName: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const records = ref<PerformancePersonChangeRecord[]>([])
const loading = ref(false)

watch(() => props.modelValue, open => {
  if (open) void load()
})

async function load() {
  loading.value = true
  records.value = []
  try {
    records.value = await performanceCycleApi.listPersonChangeRecords(props.cycleId, props.employeeNo)
  } finally {
    loading.value = false
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatValue(value: string | null): string {
  return value && value.length ? value : '（空）'
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  PERFORMANCE_CYCLE_PEOPLE_INFO_UPDATED: '更新人员信息',
  PERFORMANCE_CYCLE_PEOPLE_MANUALLY_UPDATED: '手工维护',
  PERFORMANCE_CYCLE_PEOPLE_UPDATED: '锁定人员刷新',
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="人员变更记录"
    width="480px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="subject">{{ employeeName }}（{{ employeeNo }}）在本周期内的信息变更，按时间正序排列。</p>
    <div v-loading="loading" class="records">
      <el-empty v-if="!loading && !records.length" description="暂无更新记录" :image-size="100" />
      <el-timeline v-else>
        <el-timeline-item
          v-for="record in records"
          :key="record.event_id"
          :timestamp="formatTime(record.event_at)"
          placement="top"
          type="primary"
        >
          <div class="record-head">
            <span class="record-actor">{{ EVENT_TYPE_LABELS[record.event_type] ?? record.event_type }}</span>
            <span class="record-meta">操作人 #{{ record.actor_ref }}</span>
          </div>
          <div v-for="(change, index) in record.changes" :key="index" class="change-line">
            <span class="change-label">{{ change.label }}</span>
            <span class="change-values">{{ formatValue(change.before) }} → {{ formatValue(change.after) }}</span>
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.subject {
  margin: 0 0 12px;
  color: var(--color-text-secondary, #646a73);
  font-size: 13px;
}
.records {
  max-height: 420px;
  overflow-y: auto;
  min-height: 80px;
}
.record-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.record-actor {
  font-weight: 600;
}
.record-meta {
  color: var(--color-text-secondary, #646a73);
  font-size: 12px;
}
.change-line {
  display: flex;
  gap: 8px;
  font-size: 13px;
  line-height: 22px;
}
.change-label {
  flex: 0 0 96px;
  color: var(--color-text-secondary, #646a73);
}
.change-values {
  overflow-wrap: anywhere;
}
</style>
