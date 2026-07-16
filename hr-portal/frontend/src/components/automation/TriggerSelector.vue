<script setup lang="ts">
import { toLocalNaive, toUtcNaive } from '@/utils/datetime'
import { computed, ref, watch } from 'vue'
import { Clock, Timer, CircleCheck, CircleClose, Finished, DocumentChecked, CaretTop } from '@element-plus/icons-vue'

const props = defineProps<{
  modelValue: string
  triggerConfig: Record<string, any>
  bizId?: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:triggerConfig': [value: Record<string, any>]
  'update:bizId': [value: number | null]
}>()

// ── 触发器分组定义 ──────────────────────────────────────
interface TriggerDef {
  value: string
  label: string
  desc: string
  icon: any
  category: string
}
const triggerDefs: TriggerDef[] = [
  {
    value: 'schedule',
    label: '定时通知',
    desc: '按设定的时间周期自动发送通知，无需依赖业务事件触发',
    icon: Clock,
    category: '系统内置',
  },
  {
    value: 'scheduled_job_success',
    label: '定时任务执行成功',
    desc: '定时任务执行成功时触发通知',
    icon: CircleCheck,
    category: '门户继承',
  },
  {
    value: 'scheduled_job_failed',
    label: '定时任务执行失败',
    desc: '定时任务执行失败时触发通知',
    icon: CircleClose,
    category: '门户继承',
  },
  {
    value: 'scheduled_job_finished',
    label: '定时任务执行完成',
    desc: '定时任务执行完成时触发通知（无论成功/失败）',
    icon: Finished,
    category: '门户继承',
  },
  {
    value: 'report_run_success',
    label: '报表运行成功',
    desc: '当报表运行成功时触发通知',
    icon: CircleCheck,
    category: '报表系统',
  },
  {
    value: 'report_run_failed',
    label: '报表运行失败',
    desc: '当报表运行失败时触发通知',
    icon: CircleClose,
    category: '报表系统',
  },
  {
    value: 'scheduled_report_success',
    label: '定时报表生成成功',
    desc: '当定时报表生成成功时触发通知',
    icon: DocumentChecked,
    category: '报表系统',
  },
  {
    value: 'scheduled_report_failed',
    label: '定时报表生成失败',
    desc: '当定时报表生成失败时触发通知',
    icon: Timer,
    category: '报表系统',
  },
]

const categories = ['系统内置', '门户继承', '报表系统']

// ── 选择状态 ────────────────────────────────────────────
const selectedTrigger = computed(() =>
  triggerDefs.find(t => t.value === props.modelValue)
)

function selectTrigger(value: string) {
  emit('update:modelValue', value)
}

// ── 定时配置 (trigger_type = 'schedule') ────────────────
const scheduleType = ref<string>(props.triggerConfig?.schedule_type || 'recurring')
const scheduleStartDate = ref<string>(toLocalNaive(props.triggerConfig?.start_time?.slice(0, 16)) || '')
const scheduleRRule = ref<string>(props.triggerConfig?.rrule || 'FREQ=DAILY;INTERVAL=1')
const scheduleTimezone = ref<string>(props.triggerConfig?.timezone || 'Asia/Shanghai')

// 预设选项
const rrulePresets = [
  { label: '每天', rrule: 'FREQ=DAILY;INTERVAL=1' },
  { label: '每周一', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
  { label: '每周一至周五', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: '每月1日', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1' },
]
const selectedPreset = ref<string>('')

function applyPreset(preset: typeof rrulePresets[0]) {
  selectedPreset.value = preset.rrule
  scheduleRRule.value = preset.rrule
  syncScheduleConfig()
}

function syncScheduleConfig() {
  emit('update:triggerConfig', {
    ...props.triggerConfig,
    schedule_type: scheduleType.value,
    start_time: scheduleStartDate.value ? toUtcNaive(scheduleStartDate.value + ':00') : null,
    rrule: scheduleType.value === 'recurring' ? scheduleRRule.value : null,
    timezone: scheduleTimezone.value,
  })
}

watch([scheduleType, scheduleStartDate, scheduleRRule, scheduleTimezone], () => {
  if (props.modelValue === 'schedule') {
    syncScheduleConfig()
  }
})

// 初始化
if (props.modelValue === 'schedule') {
  syncScheduleConfig()
}

// ── 事件触发器 biz_id ───────────────────────────────────
const localBizId = ref<string>(props.bizId?.toString() || '')

function syncBizId() {
  emit('update:bizId', localBizId.value ? Number(localBizId.value) : null)
}

watch(localBizId, syncBizId)
</script>

<template>
  <div class="trig-selector">
    <!-- ═══════════════════════════════════════════════════════
         触发器选择 — 按分类卡片网格
    ════════════════════════════════════════════════════════ -->
    <div v-for="cat in categories" :key="cat" class="trig-category">
      <div class="cat-label">{{ cat }}</div>
      <div class="cat-cards">
        <label
          v-for="t in triggerDefs.filter(d => d.category === cat)"
          :key="t.value"
          class="trig-card"
          :class="{
            active: modelValue === t.value,
            selected: modelValue === t.value,
          }"
        >
          <input
            type="radio"
            name="triggerType"
            :value="t.value"
            :checked="modelValue === t.value"
            @change="selectTrigger(t.value)"
            class="trig-radio"
          />
          <div class="card-body">
            <div class="card-icon" :class="{ 'icon-active': modelValue === t.value }">
              <el-icon :size="20"><component :is="t.icon" /></el-icon>
            </div>
            <div class="card-text">
              <div class="card-title">{{ t.label }}</div>
              <div class="card-desc">{{ t.desc }}</div>
            </div>
            <div v-if="modelValue === t.value" class="card-check">
              <el-icon :size="16"><CaretTop /></el-icon>
            </div>
          </div>
        </label>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════
         配置面板：当选择了触发器后显示
    ════════════════════════════════════════════════════════ -->
    <div v-if="modelValue" class="config-panel">
      <div class="config-header">
        <el-icon :size="18" class="config-icon">
          <component :is="selectedTrigger?.icon" />
        </el-icon>
        <span class="config-title">{{ selectedTrigger?.label }} — 配置</span>
      </div>

      <!-- schedule 定时配置 -->
      <div v-if="modelValue === 'schedule'" class="schedule-config">
        <div class="config-row">
          <label class="config-label required">开始时间</label>
          <el-date-picker
            v-model="scheduleStartDate"
            type="datetime"
            placeholder="选择首次执行时间"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DDTHH:mm"
            style="width: 280px"
          />
        </div>

        <div class="config-row">
          <label class="config-label required">重复频率</label>
          <div class="preset-row">
            <template v-for="preset in rrulePresets" :key="preset.rrule">
              <button
                class="preset-chip"
                :class="{ active: selectedPreset === preset.rrule }"
                @click="applyPreset(preset)"
              >
                {{ preset.label }}
              </button>
            </template>
            <el-input
              v-if="!rrulePresets.some(p => p.rrule === selectedPreset)"
              v-model="scheduleRRule"
              placeholder="自定义 RRULE"
              style="width: 200px; margin-left: 4px"
              size="small"
              @change="selectedPreset = ''; syncScheduleConfig()"
            />
          </div>
        </div>

        <div class="config-row">
          <label class="config-label">时区</label>
          <el-select
            v-model="scheduleTimezone"
            style="width: 200px"
            size="small"
            @change="syncScheduleConfig"
          >
            <el-option label="Asia/Shanghai (UTC+8)" value="Asia/Shanghai" />
            <el-option label="Asia/Tokyo (UTC+9)" value="Asia/Tokyo" />
            <el-option label="Asia/Singapore (UTC+8)" value="Asia/Singapore" />
            <el-option label="UTC" value="UTC" />
          </el-select>
        </div>
      </div>

      <!-- 事件触发器：关联业务 ID 筛选 -->
      <div v-else class="event-config">
        <div class="config-row">
          <label class="config-label">关联业务 ID（可选）</label>
          <el-input
            v-model="localBizId"
            placeholder="如：报表 ID、任务 ID，留空表示匹配全部"
            style="width: 320px"
            size="small"
          />
          <span class="field-hint">仅此业务事件触发时执行通知，留空匹配全部</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── 根 ────────────────────────────────────────────────── */
.trig-selector {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── 分类 ──────────────────────────────────────────────── */
.trig-category {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cat-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-placeholder);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-left: 2px;
}

/* ── 卡片网格 ──────────────────────────────────────────── */
.cat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}
.trig-card {
  display: flex;
  padding: 14px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-card);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}
.trig-card:hover {
  border-color: var(--color-primary-light);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.trig-card.active {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
  box-shadow: 0 1px 6px rgba(var(--color-primary-rgb, 64, 158, 255), 0.15);
}
.trig-radio {
  display: none;
}
.card-body {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.card-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--color-bg-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
}
.card-icon.icon-active,
.trig-card.active .card-icon {
  background: var(--color-primary);
  color: #fff;
}
.card-text {
  flex: 1;
  min-width: 0;
}
.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 3px;
}
.card-desc {
  font-size: 11px;
  color: var(--color-text-placeholder);
  line-height: 1.4;
}
.card-check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
}

/* ── 配置面板 ──────────────────────────────────────────── */
.config-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-subtle);
  overflow: hidden;
}
.config-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border-light);
}
.config-icon {
  color: var(--color-primary);
}
.config-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* ── 定时配置 ──────────────────────────────────────────── */
.schedule-config {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.config-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.config-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
.config-label.required::after {
  content: ' *';
  color: var(--color-danger);
}
.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.preset-chip {
  padding: 4px 14px;
  font-size: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.preset-chip:hover {
  border-color: var(--color-primary-light);
  color: var(--color-primary);
}
.preset-chip.active {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  font-weight: 500;
}

/* ── 事件配置 ──────────────────────────────────────────── */
.event-config {
  padding: 16px;
}
.field-hint {
  font-size: 11px;
  color: var(--color-text-placeholder);
  margin-top: 4px;
}
</style>
