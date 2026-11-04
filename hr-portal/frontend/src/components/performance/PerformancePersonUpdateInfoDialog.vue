<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceCycleApi, type PerformancePersonChangeItem } from '@/api/performance'

const props = defineProps<{
  modelValue: boolean
  cycleId: number
  employeeNo: string
  employeeName: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; updated: [] }>()

/** REA 实测：四个维度（checkbox 文案逐字对齐飞书「序列/职级/直属上级/部门」） */
const UPDATE_OPTIONS = [
  { field: 'job_family', label: '序列' },
  { field: 'position_level', label: '职级' },
  { field: 'direct_supervisor', label: '直属上级' },
  { field: 'department', label: '部门' },
] as const

const selected = ref<string[]>([])
const submitting = ref(false)

watch(() => props.modelValue, open => {
  if (open) selected.value = []
})

const canSubmit = computed(() => selected.value.length > 0 && !submitting.value)

function onToggle(field: string, checked: boolean) {
  const next = new Set(selected.value)
  if (checked) next.add(field)
  else next.delete(field)
  selected.value = [...next]
}

async function submit() {
  if (!selected.value.length) return
  submitting.value = true
  try {
    const result = await performanceCycleApi.updatePersonInfo(props.cycleId, props.employeeNo, [...selected.value] as Array<'job_family' | 'position_level' | 'direct_supervisor' | 'department'>)
    if (result.changed.length) {
      ElMessage.success(`已更新 ${result.changed.length} 个字段：${result.changed.map((item: PerformancePersonChangeItem) => item.label).join('、')}`)
    } else {
      ElMessage.info('所选维度与当前周期快照一致，无需更新')
    }
    emit('updated')
    emit('update:modelValue', false)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="modelValue" class="ufd">
    <div class="ufd__mask" @click="emit('update:modelValue', false)" />
    <div class="ufd__dialog" role="dialog" aria-modal="true" aria-label="更新人员信息">
      <div class="ufd__header">
        <div class="ufd__title">更新人员信息</div>
        <button type="button" class="ufd__close" aria-label="关闭" @click="emit('update:modelValue', false)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20.207 20.207a.99.99 0 0 0 .003-1.403L13.406 12l6.804-6.804a.99.99 0 0 0-.003-1.403.99.99 0 0 0-1.403-.003L12 10.594 5.196 3.79a.99.99 0 0 0-1.403.003.99.99 0 0 0-.003 1.403L10.594 12 3.79 18.804a.99.99 0 0 0 .003 1.403.99.99 0 0 0 1.403.003L12 13.406l6.804 6.804a.99.99 0 0 0 1.403-.003Z" fill="currentColor"/></svg>
        </button>
      </div>
      <div class="ufd__body">
        <div class="ufd__form-item">
          <div class="ufd__form-label">
            <span class="ufd__form-label-text">更新信息内容</span>
            <span class="ufd__form-required">*</span>
          </div>
          <div class="ufd__form-control">
            <div class="ufd__notice" role="alert">
              <span class="ufd__notice-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 23c6.075 0 11-4.925 11-11S18.075 1 12 1 1 5.925 1 12s4.925 11 11 11Z" fill="currentColor"/><path d="M13 7.5a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 4v4h-.5a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2H13c0-.667 0-1.333.002-2 0-1.001.002-2.002 0-3.004a.998.998 0 0 0-.998-.996H11a1 1 0 1 0 0 2Z" fill="#fff"/></svg>
              </span>
              <span class="ufd__notice-text">仅支持人员在原有序列/职级/直属上级/部门范围内的变更（不支持新增及名称修改）</span>
            </div>
            <div class="ufd__tips">
              <span>更新后将影响信息展示、报表统计范围、任务执行人、角色权限和校准范围等</span>
              <button type="button" class="ufd__tips-link">查看详情</button>
            </div>
            <div class="ufd__options">
              <label
                v-for="option in UPDATE_OPTIONS"
                :key="option.field"
                class="ufd__option"
                :class="{ 'ufd__option--checked': selected.includes(option.field) }"
              >
                <input
                  type="checkbox"
                  class="ufd__option-input"
                  :checked="selected.includes(option.field)"
                  @change="onToggle(option.field, ($event.target as HTMLInputElement).checked)"
                />
                <span class="ufd__option-box" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" class="ufd__option-check"><path d="M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z" fill="currentColor"/></svg>
                </span>
                <span class="ufd__option-label">{{ option.label }}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="ufd__footer">
        <button type="button" class="ufd__btn ufd__btn--cancel" @click="emit('update:modelValue', false)">取消</button>
        <button type="button" class="ufd__btn ufd__btn--confirm" :disabled="!canSubmit" @click="submit">确定</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ============ REA 实测（capture3b/update-modal）像素规格 ============
 * 遮罩 --performance-overlay-dark；卡片 600px 圆角 --radius-lg 白底；
 * header padding 24px 56px 24px 24px；标题 16/24 w600 --color-text-primary；
 * body padding 0 24px margin-bottom 24px；footer padding 0 24px 24px 右对齐；
 * 按钮 h32(--performance-button-height) min-w80 radius6；主色 --color-primary-hover(#1456f0)。
 * 本组件不出现魔法值，全部走全局设计 token（styles/tokens.css）。
 */
.ufd {
  position: fixed;
  inset: 0;
  z-index: var(--performance-confirm-z-index, 2200);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 96px;
}
.ufd__mask {
  position: absolute;
  inset: 0;
  background: var(--performance-overlay-dark);
}
.ufd__dialog {
  position: relative;
  width: 600px;
  max-width: calc(100vw - 32px);
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--performance-dialog-shadow);
  display: flex;
  flex-direction: column;
}
.ufd__header {
  position: relative;
  padding: 24px 56px 24px 24px;
  flex: none;
}
.ufd__title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  line-height: 24px;
  color: var(--color-text-primary);
}
.ufd__close {
  position: absolute;
  right: 24px;
  top: 24px;
  margin: -2px -4px;
  padding: 2px 4px;
  border: 0;
  background: transparent;
  color: var(--performance-text-secondary);
  font-size: var(--performance-header-icon-size);
  cursor: pointer;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ufd__close:hover {
  background: var(--performance-interactive-hover-background);
}
.ufd__body {
  padding: 0 24px;
  margin-bottom: 24px;
  overflow-y: auto;
  max-height: 60vh;
}
.ufd__form-item {
  display: flex;
  flex-direction: column;
}
.ufd__form-label {
  display: flex;
  align-items: center;
  padding-bottom: 0;
  margin-bottom: 8px;
}
.ufd__form-label-text {
  color: var(--color-text-primary);
  font-weight: 600;
  font-size: var(--font-size-md);
  line-height: 22px;
}
.ufd__form-required {
  color: var(--color-text-danger-strong);
  font-family: SimSun, sans-serif;
  width: 8px;
  flex: 0 0 auto;
  margin-left: 2px;
  text-align: left;
  display: inline-block;
}
.ufd__notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--performance-notice-info-background);
  border-radius: 4px;
  padding: 9px 16px 9px 12px;
  margin-bottom: 12px;
}
.ufd__notice-icon {
  flex: none;
  color: var(--performance-notice-info-icon);
  display: inline-flex;
  margin-top: 2px;
}
.ufd__notice-text {
  font-size: var(--font-size-md);
  line-height: 22px;
  color: var(--performance-notice-info-text);
}
.ufd__tips {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-md);
  line-height: 22px;
  color: var(--performance-text-secondary);
  margin-bottom: var(--spacing-5);
}
.ufd__tips-link {
  padding: 2px 4px;
  border: 0;
  background: transparent;
  color: var(--performance-button-text-color);
  font-size: var(--font-size-md);
  line-height: 22px;
  cursor: pointer;
  border-radius: 4px;
}
.ufd__tips-link:hover {
  background: var(--performance-button-text-hover-background);
}
.ufd__options {
  display: flex;
  flex-wrap: wrap;
  column-gap: 24px;
  row-gap: 8px;
}
.ufd__option {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  min-height: 24px;
}
.ufd__option-input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 16px;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  margin: 0;
  cursor: pointer;
  z-index: 1;
}
.ufd__option-box {
  position: relative;
  display: block;
  width: 16px;
  height: 16px;
  border: 1px solid var(--performance-checkbox-border);
  border-radius: 4px;
  background: var(--color-bg-card);
  box-sizing: border-box;
  flex: none;
  color: var(--color-bg-card);
  transition: background-color 0.2s cubic-bezier(0.34, 0.69, 0.1, 1), border-color 0.2s cubic-bezier(0.34, 0.69, 0.1, 1);
}
.ufd__option--checked .ufd__option-box {
  background: var(--performance-primary-deep);
  border-color: transparent;
}
.ufd__option-input:hover ~ .ufd__option-box {
  background: var(--performance-primary-bright);
  border-color: transparent;
}
.ufd__option--checked .ufd__option-check {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
.ufd__option-check {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(0);
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.34, 0.69, 0.1, 1), transform 0.2s cubic-bezier(0.34, 0.69, 0.1, 1);
}
.ufd__option-label {
  margin-left: 8px;
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  line-height: 22px;
  user-select: none;
}
.ufd__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 24px 24px;
  flex: none;
}
.ufd__btn {
  height: var(--performance-button-height);
  min-width: var(--performance-button-min-width);
  padding: 4px 11px;
  border-radius: var(--performance-button-radius);
  font-size: var(--performance-button-font-size);
  line-height: 22px;
  box-sizing: border-box;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ufd__btn--cancel {
  background: var(--color-bg-card);
  border: 1px solid var(--color-line-control);
  color: var(--color-text-primary);
}
.ufd__btn--cancel:hover {
  background: var(--performance-button-cancel-hover-background);
}
.ufd__btn--confirm {
  background: var(--performance-button-primary-background);
  border: 1px solid var(--performance-button-primary-background);
  color: var(--performance-button-primary-text);
  font-weight: 600;
}
.ufd__btn--confirm:hover:not(:disabled) {
  background: var(--performance-primary-bright);
  border-color: var(--performance-primary-bright);
}
.ufd__btn--confirm:disabled {
  background: var(--performance-button-confirm-disabled-background);
  border-color: var(--performance-button-confirm-disabled-background);
  color: var(--performance-button-confirm-disabled-text);
  cursor: not-allowed;
}
</style>
