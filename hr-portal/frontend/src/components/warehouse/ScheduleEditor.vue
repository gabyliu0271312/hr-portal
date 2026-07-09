<script setup lang="ts">
/** 调度配置编辑器。复用现有 ScheduleSelector 组件，增加事件触发模式。 */
import { ref, watch } from 'vue'
import ScheduleSelector from '@/components/common/ScheduleSelector.vue'

const props = defineProps<{
  modelValue: { frequency: string; cron_expr?: string }
}>()

const emit = defineEmits<{ 'update:modelValue': [v: any] }>()

const frequency = ref(props.modelValue?.frequency || 'manual')
const cronExpr = ref(props.modelValue?.cron_expr || '')

const FREQ_OPTIONS = [
  { label: '手动触发', value: 'manual' },
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
  { label: '每月', value: 'monthly' },
  { label: '事件触发', value: 'event' },
]

function emitChange() {
  emit('update:modelValue', {
    frequency: frequency.value,
    ...(frequency.value !== 'manual' && frequency.value !== 'event' ? { cron_expr: cronExpr.value } : {}),
  })
}

watch(frequency, emitChange)
watch(cronExpr, emitChange)
</script>

<template>
  <div class="schedule-editor">
    <el-select v-model="frequency" placeholder="调度频率" style="width: 140px">
      <el-option v-for="f in FREQ_OPTIONS" :key="f.value" :label="f.label" :value="f.value" />
    </el-select>
    <ScheduleSelector
      v-if="frequency !== 'manual' && frequency !== 'event'"
      v-model="cronExpr"
      style="margin-left: 8px; flex: 1"
    />
  </div>
</template>

<style scoped>
.schedule-editor { display: flex; align-items: center; }
</style>
