<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Clock } from '@element-plus/icons-vue'

/**
 * ScheduleSelector — 统一调度计划选择组件
 *
 * 复用自：
 *  - 系统设置 > 接口配置 > 调度计划（原 el-select + SCHEDULE_OPTIONS）
 *  - 自动通知 > 定时触发器 > 重复频率
 *
 * 双向绑定 v-model:schedule（简单模式，输出字符串如 "每日 06:00"）
 * 双向绑定 v-model:rrule（高级模式，输出 RRULE 表达式）
 * 默认使用简单模式（和接口配置保持一致）
 * 可展开"高级"模式输入自定义 RRULE
 */
export interface ScheduleOption {
  label: string
  value: string
  rrule?: string   // 对应的 RRULE 表达式（用于高级模式互通）
}

const props = defineProps<{
  /** 简单模式：选中的调度文本，如 "每日 06:00" */
  schedule: string
  /** 高级模式：RRULE 表达式 */
  rrule?: string
  /** 是否显示开始时间选择器 */
  showStartTime?: boolean
  /** 开始时间 */
  startTime?: string
  /** 是否允许高级模式（RRULE 自定义） */
  allowAdvanced?: boolean
}>()

const emit = defineEmits<{
  'update:schedule': [value: string]
  'update:rrule': [value: string]
  'update:startTime': [value: string]
}>()

// ── 统一预设选项（兼顾接口配置 + 自动通知需求）────────
const scheduleOptions: ScheduleOption[] = [
  { label: '每日 06:00', value: '每日 06:00', rrule: 'FREQ=DAILY;INTERVAL=1' },
  { label: '每周一 06:00', value: '每周一 06:00', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
  { label: '每周一至周五 06:00', value: '每周一至周五 06:00', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: '每月 1 日 06:00', value: '每月 1 日 06:00', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1' },
  { label: '每月 5 日 06:00', value: '每月 5 日 06:00', rrule: 'FREQ=MONTHLY;BYMONTHDAY=5' },
  { label: '每小时整点', value: '每小时整点', rrule: 'FREQ=HOURLY;INTERVAL=1' },
  { label: '手动触发', value: '手动触发', rrule: '' },
]

// ── 高级模式 ────────────────────────────────────────
const isAdvanced = ref(false)
const customRRule = ref(props.rrule || '')

// 判断当前 schedule 是否能匹配到预设
const matchedOption = computed(() => {
  return scheduleOptions.find(o => o.value === props.schedule)
})

// 初始化：如果有 rrule 且不匹配预设，自动进入高级模式
watch(() => props.rrule, (val) => {
  if (val && !scheduleOptions.some(o => o.rrule === val)) {
    isAdvanced.value = true
    customRRule.value = val
  }
}, { immediate: true })

// ── 操作 ────────────────────────────────────────────
function onSelect(val: string) {
  emit('update:schedule', val)
  // 同步更新 rrule
  const opt = scheduleOptions.find(o => o.value === val)
  if (opt) {
    emit('update:rrule', opt.rrule || '')
  }
}

function toggleAdvanced() {
  isAdvanced.value = !isAdvanced.value
  if (!isAdvanced.value) {
    // 退出高级模式，恢复为当前选中的预设
    onSelect(props.schedule || '每日 06:00')
  }
}

function onCustomRRule(val: string) {
  customRRule.value = val
  emit('update:rrule', val)
  // 清除简单模式的值（表示使用自定义）
  emit('update:schedule', '')
}

function onStartTimeChange(val: string) {
  emit('update:startTime', val)
}
</script>

<template>
  <div class="schedule-selector">
    <!-- 简单模式：和接口配置保持一致的 el-select -->
    <div class="ss-field">
      <label v-if="$slots.label" class="ss-label">
        <slot name="label">重复频率</slot>
        <span v-if="$attrs.required" class="ss-required">*</span>
      </label>
      <div class="ss-select-wrap">
        <el-select
          :model-value="schedule"
          @update:model-value="onSelect"
          placeholder="选择调度计划"
          :disabled="isAdvanced"
          style="width: 100%"
        >
          <el-option
            v-for="opt in scheduleOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <!-- 高级模式开关 -->
        <button
          v-if="allowAdvanced"
          class="ss-advanced-toggle"
          :class="{ active: isAdvanced }"
          @click="toggleAdvanced"
          title="高级模式（自定义 RRULE）"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
      <span v-if="!$attrs.required" class="ss-hint">与接口配置中的调度计划保持一致</span>
    </div>

    <!-- 开始时间 -->
    <div v-if="showStartTime !== false" class="ss-field">
      <label class="ss-label">开始时间</label>
      <el-date-picker
        :model-value="startTime"
        @update:model-value="onStartTimeChange"
        type="datetime"
        placeholder="选择首次执行时间"
        format="YYYY-MM-DD HH:mm"
        value-format="YYYY-MM-DDTHH:mm"
        style="width: 100%"
      />
      <span class="ss-hint">留空则规则启用后立即开始执行（默认北京时间 UTC+8）</span>
    </div>

    <!-- 高级模式：自定义 RRULE -->
    <div v-if="isAdvanced" class="ss-advanced">
      <div class="ss-advanced-header">
        <span>高级模式 — 自定义 RRULE 表达式</span>
        <button class="ss-advanced-close" @click="toggleAdvanced">×</button>
      </div>
      <el-input
        :model-value="customRRule"
        @update:model-value="onCustomRRule"
        placeholder="如 FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=2"
        size="small"
      />
      <div class="ss-advanced-presets">
        <span class="ss-advanced-presets-label">快速填入：</span>
        <button
          v-for="opt in scheduleOptions.filter(o => o.rrule)"
          :key="opt.rrule"
          class="ss-preset-btn"
          @click="onCustomRRule(opt.rrule!)"
        >{{ opt.label }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.schedule-selector {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ss-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ss-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-regular, #606266);
}
.ss-required { color: var(--color-danger, #f56c6c); margin-left: 2px; }
.ss-hint {
  font-size: 11px;
  color: var(--color-text-placeholder, #c0c4cc);
  line-height: 1.4;
}
.ss-select-wrap {
  display: flex;
  gap: 8px;
  align-items: center;
}
.ss-advanced-toggle {
  width: 32px; height: 32px;
  border: 1px solid var(--color-border, #dcdfe6);
  border-radius: 6px;
  background: var(--color-bg-card, #fff);
  color: var(--color-text-secondary, #909399);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.ss-advanced-toggle:hover {
  border-color: var(--color-primary, #409eff);
  color: var(--color-primary, #409eff);
}
.ss-advanced-toggle.active {
  border-color: var(--color-primary, #409eff);
  background: var(--color-primary-subtle, #ecf5ff);
  color: var(--color-primary, #409eff);
}
.ss-advanced {
  padding: 12px;
  border: 1px solid var(--color-primary-light, #a0cfff);
  border-radius: 8px;
  background: var(--color-primary-subtle, #ecf5ff);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ss-advanced-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-primary, #409eff);
}
.ss-advanced-close {
  width: 20px; height: 20px;
  border: none; border-radius: 50%;
  background: transparent;
  color: var(--color-text-secondary, #909399);
  cursor: pointer;
  font-size: 16px;
  display: flex; align-items: center; justify-content: center;
}
.ss-advanced-close:hover { color: var(--color-danger, #f56c6c); }
.ss-advanced-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.ss-advanced-presets-label {
  font-size: 11px;
  color: var(--color-text-placeholder, #c0c4cc);
}
.ss-preset-btn {
  padding: 3px 10px;
  font-size: 11px;
  border: 1px solid var(--color-border, #dcdfe6);
  border-radius: 12px;
  background: var(--color-bg-card, #fff);
  color: var(--color-text-regular, #606266);
  cursor: pointer;
  transition: all 0.15s ease;
}
.ss-preset-btn:hover {
  border-color: var(--color-primary, #409eff);
  color: var(--color-primary, #409eff);
}
</style>
