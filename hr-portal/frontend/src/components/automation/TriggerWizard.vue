<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  Clock, Timer, CircleCheck, CircleClose, Finished, DocumentChecked,
  ArrowLeft, ArrowRight, Close, Check
} from '@element-plus/icons-vue'
import ScheduleSelector from '@/components/common/ScheduleSelector.vue'

// ── RRULE → 文本描述（用于回填）────────────────────
function rruleToText(rrule?: string): string {
  const map: Record<string, string> = {
    'FREQ=DAILY;INTERVAL=1': '每日 06:00',
    'FREQ=WEEKLY;BYDAY=MO': '每周一 06:00',
    'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR': '每周一至周五 06:00',
    'FREQ=MONTHLY;BYMONTHDAY=1': '每月 1 日 06:00',
    'FREQ=MONTHLY;BYMONTHDAY=5': '每月 5 日 06:00',
    'FREQ=HOURLY;INTERVAL=1': '每小时整点',
  }
  return rrule ? (map[rrule] || '') : ''
}

// ── 触发器类型定义 ────────────────────────────────────
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
    desc: '定时任务执行成功时触发',
    icon: CircleCheck,
    category: '门户继承',
  },
  {
    value: 'scheduled_job_failed',
    label: '定时任务执行失败',
    desc: '定时任务执行失败时触发',
    icon: CircleClose,
    category: '门户继承',
  },
  {
    value: 'scheduled_job_finished',
    label: '定时任务执行完成',
    desc: '定时任务执行完成时触发（无论成功/失败）',
    icon: Finished,
    category: '门户继承',
  },
  {
    value: 'report_run_success',
    label: '报表运行成功',
    desc: '报表运行成功时触发通知',
    icon: CircleCheck,
    category: '报表系统',
  },
  {
    value: 'report_run_failed',
    label: '报表运行失败',
    desc: '报表运行失败时触发通知',
    icon: CircleClose,
    category: '报表系统',
  },
  {
    value: 'scheduled_report_success',
    label: '定时报表生成成功',
    desc: '定时报表生成成功时触发通知',
    icon: DocumentChecked,
    category: '报表系统',
  },
  {
    value: 'scheduled_report_failed',
    label: '定时报表生成失败',
    desc: '定时报表生成失败时触发通知',
    icon: Timer,
    category: '报表系统',
  },
]

const categories = ['系统内置', '门户继承', '报表系统']

// ── Props / Emits ─────────────────────────────────────
const props = defineProps<{
  modelValue: boolean       // 是否显示向导
  triggerType: string       // 当前已选触发器类型（编辑模式）
  triggerConfig: Record<string, any> // 当前已选触发器配置
  bizId?: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'confirm': [payload: { triggerType: string; triggerConfig: Record<string, any>; bizId: number | null }]
}>()

// ── 向导步骤 ─────────────────────────────────────────
type Step = 'select' | 'configure'

const currentStep = ref<Step>('select')
const selectedType = ref<string>(props.triggerType || '')
const selectedDef = computed(() => triggerDefs.find(t => t.value === selectedType.value))

// ── 配置表单 ─────────────────────────────────────────
// 定时配置（使用 ScheduleSelector 双向绑定）
const scheduleValue = ref<string>('每日 06:00')  // 简单模式
const scheduleRRule = ref<string>('FREQ=DAILY;INTERVAL=1')  // 高级模式
const scheduleStartDate = ref<string>('')

// 事件配置
const localBizId = ref<string>('')

// ── 向导状态管理 ─────────────────────────────────────
const isVisible = ref(false)
const isClosing = ref(false)

watch(() => props.modelValue, (val) => {
  if (val) {
    // 打开向导
    isVisible.value = true
    isClosing.value = false
    // 回填已有数据
    if (props.triggerType) {
      selectedType.value = props.triggerType
      currentStep.value = 'configure'
      // 回填配置
      if (props.triggerType === 'schedule') {
        const cfg = props.triggerConfig || {}
        scheduleStartDate.value = cfg.start_time?.slice(0, 16) || ''
        scheduleRRule.value = cfg.rrule || 'FREQ=DAILY;INTERVAL=1'
        // 根据 rrule 反推 schedule 文本
        scheduleValue.value = rruleToText(cfg.rrule) || '每日 06:00'
      } else {
        localBizId.value = props.triggerConfig?.biz_id || ''
      }
    } else {
      selectedType.value = ''
      currentStep.value = 'select'
      resetConfig()
    }
    // 动画入场
    nextTick(() => { isVisible.value = true })
  } else {
    closeWizard()
  }
})

function resetConfig() {
  scheduleValue.value = '每日 06:00'
  scheduleRRule.value = 'FREQ=DAILY;INTERVAL=1'
  scheduleStartDate.value = ''
  localBizId.value = ''
}

function closeWizard() {
  isClosing.value = true
  setTimeout(() => {
    isVisible.value = false
    isClosing.value = false
    emit('update:modelValue', false)
  }, 280)
}

// ── 步骤导航 ─────────────────────────────────────────
function goToConfigure() {
  if (!selectedType.value) return
  currentStep.value = 'configure'
  // 如果之前有配置则回填
  if (props.triggerType === selectedType.value && props.triggerConfig) {
    if (selectedType.value === 'schedule') {
      const cfg = props.triggerConfig
      scheduleStartDate.value = cfg.start_time?.slice(0, 16) || scheduleStartDate.value
      scheduleRRule.value = cfg.rrule || scheduleRRule.value
    } else {
      localBizId.value = props.triggerConfig?.biz_id || ''
    }
  } else {
    resetConfig()
  }
}

function goBackToSelect() {
  currentStep.value = 'select'
}

function handleConfirm() {
  const triggerConfig: Record<string, any> = {}
  let bizId: number | null = null

  if (selectedType.value === 'schedule') {
    triggerConfig.schedule_type = 'recurring'
    triggerConfig.start_time = scheduleStartDate.value ? scheduleStartDate.value + ':00' : null
    triggerConfig.rrule = scheduleRRule.value
  } else {
    bizId = localBizId.value ? Number(localBizId.value) : null
    triggerConfig.biz_id = localBizId.value || null
  }

  emit('confirm', { triggerType: selectedType.value, triggerConfig, bizId })
  closeWizard()
}

// ── 步骤指示器 ───────────────────────────────────────
const steps = [
  { key: 'select' as Step, label: '选择触发器类型' },
  { key: 'configure' as Step, label: '配置触发器' },
]

const currentStepIndex = computed(() => steps.findIndex(s => s.key === currentStep.value))
</script>

<template>
  <!-- ══════════════════════════════════════════════════════════
       全屏向导弹窗
  ══════════════════════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition name="wizard-fade">
      <div v-if="isVisible" class="wizard-overlay" :class="{ closing: isClosing }">
        <!-- ── 侧边抽屉面板 ────────────────────────────────── -->
        <Transition name="wizard-slide">
          <div v-if="isVisible && !isClosing" class="wizard-panel">
            <!-- 顶部栏 -->
            <div class="wizard-header">
              <div class="wizard-header-left">
                <button class="wizard-back-btn" @click="closeWizard">
                  <el-icon :size="20"><Close /></el-icon>
                </button>
                <div class="wizard-title">选择触发器</div>
              </div>

              <!-- 步骤指示器 -->
              <div class="step-indicator">
                <div
                  v-for="(step, i) in steps"
                  :key="step.key"
                  class="step-dot"
                  :class="{
                    active: i <= currentStepIndex,
                    current: i === currentStepIndex,
                  }"
                >
                  <span v-if="i < currentStepIndex" class="step-check">
                    <el-icon :size="12"><Check /></el-icon>
                  </span>
                  <span v-else class="step-num">{{ i + 1 }}</span>
                </div>
                <div
                  v-for="i in steps.length - 1"
                  :key="'line-' + i"
                  class="step-line"
                  :class="{ filled: i <= currentStepIndex }"
                ></div>
              </div>
            </div>

            <!-- ── 第1步：选择触发器类型 ────────────────────── -->
            <div v-if="currentStep === 'select'" class="wizard-body">
              <p class="wizard-desc">选择一种触发器来确定通知的发送时机</p>

              <div v-for="cat in categories" :key="cat" class="wiz-category">
                <div class="wiz-cat-label">{{ cat }}</div>
                <div class="wiz-cards">
                  <button
                    v-for="t in triggerDefs.filter(d => d.category === cat)"
                    :key="t.value"
                    class="wiz-card"
                    :class="{ active: selectedType === t.value }"
                    @click="selectedType = t.value; goToConfigure()"
                  >
                    <div class="wiz-card-icon" :class="{ highlight: selectedType === t.value }">
                      <el-icon :size="22"><component :is="t.icon" /></el-icon>
                    </div>
                    <div class="wiz-card-body">
                      <div class="wiz-card-title">{{ t.label }}</div>
                      <div class="wiz-card-desc">{{ t.desc }}</div>
                    </div>
                    <div v-if="selectedType === t.value" class="wiz-card-check">
                      <el-icon :size="14"><Check /></el-icon>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <!-- ── 第2步：配置触发器 ────────────────────────── -->
            <div v-if="currentStep === 'configure'" class="wizard-body">
              <div class="config-summary">
                <span class="config-summary-badge">
                  <el-icon :size="16"><component :is="selectedDef?.icon" /></el-icon>
                </span>
                <span class="config-summary-text">正在配置：{{ selectedDef?.label }}</span>
              </div>

              <!-- 定时配置 -->
              <div v-if="selectedType === 'schedule'" class="schedule-form">
                <ScheduleSelector
                  v-model:schedule="scheduleValue"
                  v-model:rrule="scheduleRRule"
                  v-model:start-time="scheduleStartDate"
                  :allow-advanced="true"
                />
              </div>

              <!-- 事件触发器配置 -->
              <div v-else class="event-form">
                <div class="wiz-field">
                  <label class="wiz-label">关联业务 ID（可选）</label>
                  <el-input
                    v-model="localBizId"
                    placeholder="如：报表 ID、任务 ID，留空则匹配该类型所有事件"
                    style="max-width: 420px"
                  />
                  <span class="wiz-hint">仅此业务对象触发时执行通知，留空则任何该类型事件都触发</span>
                </div>
              </div>
            </div>

            <!-- ── 底部操作栏 ────────────────────────────────── -->
            <div class="wizard-footer">
              <template v-if="currentStep === 'select'">
                <div></div>
                <el-button type="primary" :disabled="!selectedType" @click="goToConfigure">
                  下一步
                  <el-icon class="btn-icon-right"><ArrowRight /></el-icon>
                </el-button>
              </template>
              <template v-if="currentStep === 'configure'">
                <el-button :icon="ArrowLeft" @click="goBackToSelect">上一步</el-button>
                <el-button type="primary" :icon="Check" @click="handleConfirm">
                  确认选择
                </el-button>
              </template>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════
   全屏遮罩
═══════════════════════════════════════════════════════════ */
.wizard-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

/* ═══════════════════════════════════════════════════════════
   侧边抽屉面板
═══════════════════════════════════════════════════════════ */
.wizard-panel {
  width: 620px;
  max-width: 100vw;
  height: 100vh;
  background: var(--color-bg-page, #f5f7fa);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.12);
}

/* ── 头部 ────────────────────────────────────────────── */
.wizard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  background: var(--color-bg-card, #fff);
  border-bottom: 1px solid var(--color-border, #e4e7ed);
  flex-shrink: 0;
}
.wizard-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.wizard-back-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: var(--color-bg-subtle, #f0f2f5);
  color: var(--color-text-secondary, #909399);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.wizard-back-btn:hover {
  background: var(--color-primary-light, #ecf5ff);
  color: var(--color-primary, #409eff);
}
.wizard-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary, #303133);
}

/* ── 步骤指示器 ──────────────────────────────────────── */
.step-indicator {
  display: flex;
  align-items: center;
  gap: 0;
}
.step-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--color-border, #dcdfe6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.25s ease;
  z-index: 1;
  position: relative;
}
.step-dot.active {
  border-color: var(--color-primary, #409eff);
  background: var(--color-primary, #409eff);
}
.step-dot.current {
  border-color: var(--color-primary, #409eff);
  background: var(--color-bg-card, #fff);
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.15);
}
.step-num {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-placeholder, #c0c4cc);
}
.step-dot.active .step-num { color: #fff; }
.step-dot.current .step-num { color: var(--color-primary, #409eff); }
.step-check { color: #fff; display: flex; }
.step-line {
  width: 40px;
  height: 2px;
  background: var(--color-border, #dcdfe6);
  transition: background 0.3s ease;
  margin: 0 -2px;
}
.step-line.filled {
  background: var(--color-primary, #409eff);
}

/* ── 内容区 ──────────────────────────────────────────── */
.wizard-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.wizard-desc {
  font-size: 13px;
  color: var(--color-text-secondary, #909399);
  margin: 0 0 4px;
  line-height: 1.5;
}

/* ── 分类标题 ────────────────────────────────────────── */
.wiz-category { display: flex; flex-direction: column; gap: 8px; }
.wiz-cat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-placeholder, #c0c4cc);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-left: 2px;
}

/* ── 触发器卡片 ──────────────────────────────────────── */
.wiz-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wiz-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1.5px solid var(--color-border, #e4e7ed);
  border-radius: 12px;
  background: var(--color-bg-card, #fff);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  width: 100%;
  font: inherit;
  color: inherit;
}
.wiz-card:hover {
  border-color: var(--color-primary-light, #a0cfff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.wiz-card.active {
  border-color: var(--color-primary, #409eff);
  background: var(--color-primary-subtle, #ecf5ff);
  box-shadow: 0 1px 6px rgba(64, 158, 255, 0.12);
}
.wiz-card-icon {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: var(--color-bg-subtle, #f0f2f5);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, #909399);
  transition: all 0.2s ease;
}
.wiz-card-icon.highlight {
  background: var(--color-primary, #409eff);
  color: #fff;
}
.wiz-card-body {
  flex: 1;
  min-width: 0;
}
.wiz-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #303133);
  margin-bottom: 2px;
}
.wiz-card-desc {
  font-size: 12px;
  color: var(--color-text-placeholder, #c0c4cc);
  line-height: 1.4;
}
.wiz-card-check {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary, #409eff);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── 配置区域 ────────────────────────────────────────── */
.config-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--color-bg-subtle, #f0f2f5);
  border-radius: 10px;
  margin-bottom: 4px;
}
.config-summary-badge {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--color-primary, #409eff);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.config-summary-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary, #303133);
}

/* ── 表单字段 ────────────────────────────────────────── */
.wiz-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wiz-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-regular, #606266);
}
.wiz-label.required::after {
  content: ' *';
  color: var(--color-danger, #f56c6c);
}
.wiz-hint {
  font-size: 11px;
  color: var(--color-text-placeholder, #c0c4cc);
  line-height: 1.4;
}

/* ── 预设芯片 ────────────────────────────────────────── */
.preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preset-chip {
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
.preset-chip:hover {
  border-color: var(--color-primary-light, #a0cfff);
  color: var(--color-primary, #409eff);
}
.preset-chip.active {
  border-color: var(--color-primary, #409eff);
  background: var(--color-primary-subtle, #ecf5ff);
  color: var(--color-primary, #409eff);
  font-weight: 500;
}
.custom-rrule {
  margin-top: 4px;
}

/* 配置表单容器 */
.schedule-form,
.event-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── 底部操作栏 ──────────────────────────────────────── */
.wizard-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--color-bg-card, #fff);
  border-top: 1px solid var(--color-border, #e4e7ed);
  flex-shrink: 0;
}
.btn-icon-right {
  margin-left: 4px;
}

/* ═══════════════════════════════════════════════════════════
   过渡动画
═══════════════════════════════════════════════════════════ */
.wizard-fade-enter-active,
.wizard-fade-leave-active {
  transition: opacity 0.28s ease;
}
.wizard-fade-enter-from,
.wizard-fade-leave-to {
  opacity: 0;
}

.wizard-slide-enter-active {
  transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}
.wizard-slide-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 1, 1);
}
.wizard-slide-enter-from {
  transform: translateX(100%);
}
.wizard-slide-leave-to {
  transform: translateX(100%);
}
</style>
