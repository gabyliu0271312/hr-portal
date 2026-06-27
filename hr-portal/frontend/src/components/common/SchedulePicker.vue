<script setup lang="ts">
import { ref, computed, watch } from 'vue'

/**
 * SchedulePicker — 可复用的频率选择组件
 *
 * 用于自动通知、报表定时拉取等需要配置重复执行规则的场景。
 * 默认北京时间（Asia/Shanghai），不暴露时区选项。
 *
 * 用法：
 *   <SchedulePicker v-model:rrule="rrule" v-model:start-time="startTime" />
 */
export interface RRulePreset {
  label: string
  rrule: string
  desc?: string
}

const props = defineProps<{
  /** RRULE 字符串，双向绑定 */
  rrule: string
  /** 首次执行时间 (YYYY-MM-DDTHH:mm)，双向绑定 */
  startTime: string
  /** 是否显示开始时间选择器，默认 true */
  showStartTime?: boolean
  /** 自定义预设列表（可选，默认内置常用预设） */
  customPresets?: RRulePreset[]
}>()

const emit = defineEmits<{
  'update:rrule': [value: string]
  'update:startTime': [value: string]
}>()

// ── 内置预设 ────────────────────────────────────────
const defaultPresets: RRulePreset[] = [
  { label: '每天', rrule: 'FREQ=DAILY;INTERVAL=1', desc: '每天同一时间执行' },
  { label: '每周一', rrule: 'FREQ=WEEKLY;BYDAY=MO', desc: '每周一执行' },
  { label: '每周一至周五', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', desc: '工作日执行' },
  { label: '每月1日', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', desc: '每月1号执行' },
  { label: '每周', rrule: 'FREQ=WEEKLY;INTERVAL=1', desc: '每周同一天执行' },
  { label: '每两周', rrule: 'FREQ=WEEKLY;INTERVAL=2', desc: '每隔一周执行' },
]

const presets = computed(() => props.customPresets || defaultPresets)

// ── 状态 ────────────────────────────────────────────
const localRRule = ref(props.rrule)
const localStartTime = ref(props.startTime)
const selectedPreset = ref('')

// 初始化：匹配当前 rrule 到预设
function matchPreset(rrule: string) {
  const found = presets.value.find(p => p.rrule === rrule)
  return found?.rrule || ''
}

watch(() => props.rrule, (val) => {
  localRRule.value = val
  selectedPreset.value = matchPreset(val)
}, { immediate: true })

watch(() => props.startTime, (val) => {
  localStartTime.value = val
}, { immediate: true })

// ── 操作 ────────────────────────────────────────────
function applyPreset(preset: RRulePreset) {
  selectedPreset.value = preset.rrule
  localRRule.value = preset.rrule
  emit('update:rrule', preset.rrule)
}

function onCustomRRuleChange(val: string) {
  localRRule.value = val
  // 如果输入的值匹配某个预设，自动选中；否则清除预设选中状态
  const matched = presets.value.find(p => p.rrule === val)
  selectedPreset.value = matched ? matched.rrule : ''
  emit('update:rrule', val)
}

function onStartTimeChange(val: string) {
  localStartTime.value = val
  emit('update:startTime', val)
}

function isCustomMode() {
  return selectedPreset.value === '' && localRRule.value !== ''
}
</script>

<template>
  <div class="schedule-picker">
    <!-- 开始时间 -->
    <div v-if="showStartTime !== false" class="sp-field">
      <label class="sp-label required">开始时间</label>
      <el-date-picker
        :model-value="localStartTime"
        @update:model-value="onStartTimeChange"
        type="datetime"
        placeholder="选择首次执行时间"
        format="YYYY-MM-DD HH:mm"
        value-format="YYYY-MM-DDTHH:mm"
        style="width: 100%; max-width: 420px"
      />
      <span class="sp-hint">留空则规则启用后立即开始执行</span>
    </div>

    <!-- 重复频率 -->
    <div class="sp-field">
      <label class="sp-label required">重复频率</label>
      <div class="sp-chips">
        <button
          v-for="preset in presets"
          :key="preset.rrule"
          class="sp-chip"
          :class="{ active: selectedPreset === preset.rrule }"
          :title="preset.desc"
          @click="applyPreset(preset)"
        >
          {{ preset.label }}
        </button>
      </div>
      <!-- 自定义模式：不在预设中时显示输入框 -->
      <div v-if="isCustomMode()" class="sp-custom">
        <el-input
          :model-value="localRRule"
          @update:model-value="onCustomRRuleChange"
          placeholder="自定义 RRULE 表达式，如 FREQ=HOURLY;INTERVAL=2"
          size="small"
          style="max-width: 420px"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.schedule-picker {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.sp-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sp-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-regular, #606266);
}
.sp-label.required::after {
  content: ' *';
  color: var(--color-danger, #f56c6c);
}
.sp-hint {
  font-size: 11px;
  color: var(--color-text-placeholder, #c0c4cc);
  line-height: 1.4;
}

/* ── 预设芯片 ────────────────────────────────────── */
.sp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sp-chip {
  padding: 6px 16px;
  font-size: 12px;
  border: 1px solid var(--color-border, #dcdfe6);
  border-radius: 20px;
  background: var(--color-bg-card, #fff);
  color: var(--color-text-secondary, #909399);
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}
.sp-chip:hover {
  border-color: var(--color-primary-light, #a0cfff);
  color: var(--color-primary, #409eff);
}
.sp-chip.active {
  border-color: var(--color-primary, #409eff);
  background: var(--color-primary-subtle, #ecf5ff);
  color: var(--color-primary, #409eff);
  font-weight: 500;
}

.sp-custom {
  margin-top: 4px;
}
</style>
