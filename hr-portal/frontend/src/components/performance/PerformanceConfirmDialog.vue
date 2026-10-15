<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="performance-confirm-overlay"
      data-source-state-id="user-snapspec-20260831-template-delete-confirm"
      @mousedown.self="cancel"
    >
      <section
        class="performance-confirm-dialog"
        :class="{ 'performance-confirm-dialog--wide': requireConfirm }"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="performance-confirm-title"
        @keydown="onKeydown"
      >
        <header class="performance-confirm-dialog__header">
          <div id="performance-confirm-title" class="performance-confirm-dialog__title">
            <span class="performance-confirm-dialog__icon">
              <PerformanceWarningFilledIcon />
            </span>
            <span class="performance-confirm-dialog__title-content">{{ message }}</span>
          </div>
          <p v-if="subject || description" class="performance-confirm-dialog__body">
            <template v-if="subject">
              删除后，<span class="performance-confirm-dialog__subject">{{ subject }}</span>将失去本周期「被授权」范围的管理权限，但 Ta 仍拥有自己「当前负责」范围的管理权限。
            </template>
            <span v-else :class="{ 'performance-confirm-dialog__des': requireConfirm }">{{ description }}</span>
          </p>
          <p v-if="errorMessage" class="performance-confirm-dialog__body performance-confirm-dialog__error" role="alert">{{ errorMessage }}</p>
          <div v-if="requireConfirm" class="performance-confirm-dialog__confirm-field">
            <label class="performance-confirm-dialog__confirm-label" :for="confirmInputId">输入「确认删除」以确认当前操作<span class="performance-confirm-dialog__required-mark" aria-hidden="true">*</span></label>
            <input :id="confirmInputId" v-model="confirmInput" class="performance-confirm-dialog__confirm-input" type="text" autocomplete="off" :disabled="loading" />
          </div>
        </header>
        <footer class="performance-confirm-dialog__footer">
          <button ref="cancelRef" class="performance-confirm-dialog__button performance-confirm-dialog__button--cancel" type="button" :disabled="loading" @click="cancel">{{ cancelText }}</button>
          <button ref="confirmRef" class="performance-confirm-dialog__button performance-confirm-dialog__button--danger" type="button" :disabled="loading || !canConfirm" :aria-busy="loading" @click="$emit('confirm')">{{ confirmText }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import PerformanceWarningFilledIcon from './PerformanceWarningFilledIcon.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  message?: string
  subject?: string
  description?: string
  cancelText?: string
  confirmText?: string
  loading?: boolean
  requireConfirm?: boolean
  confirmDisabled?: boolean
  errorMessage?: string
}>(), {
  message: '后续配置项目将无法使用该模板，确定删除吗？',
  subject: '',
  description: '',
  cancelText: '保留',
  confirmText: '删除',
  loading: false,
  requireConfirm: false,
  confirmDisabled: false,
  errorMessage: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

const cancelRef = ref<HTMLButtonElement | null>(null)
const confirmRef = ref<HTMLButtonElement | null>(null)
const confirmInput = ref('')
const confirmInputId = 'performance-confirm-delete-input'
let returnFocus: HTMLElement | null = null
let previousOverflow = ''

const canConfirm = computed(() => !props.confirmDisabled && (!props.requireConfirm || confirmInput.value.trim() === '确认删除'))

function restorePage() {
  document.body.style.overflow = previousOverflow
  void nextTick(() => returnFocus?.focus())
}

function cancel() {
  if (props.loading) return
  emit('update:modelValue', false)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
    return
  }
  if (event.key !== 'Tab') return
  const controls = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'))
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) { event.preventDefault(); return }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(() => props.modelValue, (visible) => {
  if (visible) {
    returnFocus = document.activeElement as HTMLElement | null
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    confirmInput.value = ''
    void nextTick(() => cancelRef.value?.focus())
  } else {
    restorePage()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (props.modelValue) restorePage()
})
</script>

<style scoped>
.performance-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--performance-confirm-z-index);
  display: grid;
  place-items: center;
  padding: var(--spacing-4);
  box-sizing: border-box;
  background: var(--performance-overlay);
}

.performance-confirm-dialog {
  width: min(var(--performance-dialog-width), calc(100vw - 32px));
  overflow: hidden;
  border-radius: var(--performance-dialog-radius);
  background: var(--color-surface-card);
  box-shadow: var(--performance-dialog-shadow);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}

/* 强确认变体：对应采集的已启动项目删除弹窗（600px 宽） */
.performance-confirm-dialog--wide {
  width: min(600px, calc(100vw - 32px));
}

.performance-confirm-dialog__header {
  display: flex;
  flex-direction: column;
  min-height: 96px;
  padding: var(--performance-dialog-padding);
  box-sizing: border-box;
}

.performance-confirm-dialog__title {
  display: flex;
  align-items: baseline;
  width: 100%;
  font-size: var(--font-size-lg);
  font-weight: 600;
  line-height: 24px;
}

.performance-confirm-dialog__icon {
  display: flex;
  align-items: baseline;
  margin-right: var(--spacing-4);
  box-sizing: border-box;
  color: var(--color-text-warning-strong);
  font-size: var(--font-size-lg);
  font-weight: 600;
  line-height: 24px;
}

.performance-confirm-dialog__icon svg {
  display: inline-block;
  overflow: hidden;
  width: 24px;
  height: 24px;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  line-height: 24px;
}

.performance-confirm-dialog__title-content {
  overflow: hidden auto;
  color: var(--color-text-primary);
}

.performance-confirm-dialog__body {
  margin: var(--spacing-2) 0 0 40px;
  font-size: var(--font-size-md);
  font-weight: 400;
  line-height: 22px;
  color: var(--color-text-primary);
}

.performance-confirm-dialog__subject { display: inline; white-space: nowrap; color: var(--color-action-primary); }
.performance-confirm-dialog__des { display: block; margin-top: 4px; color: var(--color-text-secondary); }

.performance-confirm-dialog__error { color: var(--performance-field-error-color); }
.performance-confirm-dialog__confirm-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  margin-top: 26px;
}

.performance-confirm-dialog__confirm-label {
  font-size: var(--font-size-md);
  font-weight: 400;
  line-height: 22px;
  color: var(--color-text-primary);
}

.performance-confirm-dialog__required-mark {
  margin-left: 2px;
  font-family: SimSun, sans-serif;
  color: var(--color-text-danger-strong);
}

.performance-confirm-dialog__confirm-input {
  width: 100%;
  height: 32px;
  padding: 4px 8px 4px 11px;
  box-sizing: border-box;
  border: 1px solid var(--color-line-control);
  border-radius: var(--performance-control-radius);
  font: 400 var(--font-size-md)/22px var(--font-sans);
  color: var(--color-text-primary);
  background: var(--color-surface-card);
  transition: border-color 0.1s linear;
}

.performance-confirm-dialog__confirm-input:focus {
  outline: none;
  border-color: var(--color-text-danger-strong);
}

.performance-confirm-dialog__footer {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: var(--performance-dialog-footer-gap);
  height: var(--performance-dialog-footer-height);
  padding: 0 var(--performance-dialog-padding) var(--spacing-3);
  box-sizing: border-box;
}

.performance-confirm-dialog__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--performance-button-min-width);
  min-width: var(--performance-button-min-width);
  height: var(--performance-button-height);
  padding: 4px var(--performance-button-padding-x);
  box-sizing: border-box;
  border: 1px solid;
  border-radius: var(--performance-button-radius);
  font: var(--performance-button-font-weight) var(--performance-button-font-size)/var(--performance-button-line-height) var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.1s ease-in, background-color 0.1s ease-in, border-color 0.1s ease-in;
}

.performance-confirm-dialog__button--cancel {
  border-color: var(--performance-button-secondary-border);
  background: var(--color-surface-card);
  color: var(--performance-button-secondary-text);
}

.performance-confirm-dialog__button--danger {
  border-color: var(--color-text-danger-strong);
  background: var(--color-surface-card);
  color: var(--color-text-danger-strong);
}

.performance-confirm-dialog__button:focus-visible {
  outline: 2px solid var(--performance-dialog-focus-ring);
  outline-offset: 2px;
}

.performance-confirm-dialog__button--cancel:hover:not(:disabled) {
  background: var(--performance-dialog-cancel-hover);
}

.performance-confirm-dialog__button--danger:hover:not(:disabled) {
  background: var(--performance-button-danger-outline-hover-background);
  color: var(--color-text-danger-strong);
}

.performance-confirm-dialog__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
