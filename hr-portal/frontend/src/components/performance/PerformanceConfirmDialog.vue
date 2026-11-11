<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="performance-confirm-overlay"
      :data-source-state-id="appearance === 'submit' ? 'rea-overdue-submit-confirm' : 'user-snapspec-20260831-template-delete-confirm'"
      @mousedown.self="appearance !== 'submit' && cancel()"
    >
      <section
        class="performance-confirm-dialog"
        :class="{ 'performance-confirm-dialog--calibration-completion': appearance === 'calibration-completion', 'performance-confirm-dialog--wide': requireConfirm, 'performance-confirm-dialog--primary': confirmVariant === 'primary', 'performance-confirm-dialog--submit': appearance === 'submit', 'performance-confirm-dialog--delegation': appearance === 'delegation', 'performance-confirm-dialog--result-opening': appearance === 'result-opening' }"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="performance-confirm-title"
        :aria-describedby="subject || description ? 'performance-confirm-description' : undefined"
        @keydown="onKeydown"
      >
        <header class="performance-confirm-dialog__header">
          <div id="performance-confirm-title" class="performance-confirm-dialog__title">
            <span class="performance-confirm-dialog__icon">
              <slot name="icon"><PerformanceWarningFilledIcon /></slot>
            </span>
            <span class="performance-confirm-dialog__title-content">{{ message }}</span>
          </div>
          <p v-if="subject || description" id="performance-confirm-description" class="performance-confirm-dialog__body">
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
          <div v-if="$slots.check" class="performance-confirm-dialog__check-field"><slot name="check" /></div>
        </header>
        <footer class="performance-confirm-dialog__footer">
          <div v-if="$slots['footer-left']" class="performance-confirm-dialog__footer-left"><slot name="footer-left" /></div>
          <div class="performance-confirm-dialog__footer-actions">
            <button v-if="showCancel" ref="cancelRef" class="performance-confirm-dialog__button performance-confirm-dialog__button--cancel" type="button" :disabled="loading" @click="cancel">{{ cancelText }}</button>
            <UiButton v-if="appearance === 'calibration-completion'" ref="confirmRef" class="performance-confirm-dialog__button--danger" :variant="confirmVariant === 'primary' ? 'primary' : 'danger'" :disabled="!canConfirm" :loading="loading" @click="$emit('confirm')">{{ confirmText }}</UiButton>
            <button v-else ref="confirmRef" class="performance-confirm-dialog__button performance-confirm-dialog__button--danger" type="button" :disabled="loading || !canConfirm" :aria-busy="loading" @click="$emit('confirm')">{{ confirmText }}</button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import UiButton from '../ui/UiButton.vue'
import PerformanceWarningFilledIcon from './PerformanceWarningFilledIcon.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  message?: string
  subject?: string
  description?: string
  cancelText?: string
  showCancel?: boolean
  confirmText?: string
  loading?: boolean
  requireConfirm?: boolean
  confirmDisabled?: boolean
  confirmVariant?: 'danger' | 'primary'
  errorMessage?: string
  appearance?: 'default' | 'submit' | 'delegation' | 'result-opening' | 'calibration-completion'
}>(), {
  message: '后续配置项目将无法使用该模板，确定删除吗？',
  subject: '',
  description: '',
  cancelText: '保留',
  showCancel: true,
  confirmText: '删除',
  loading: false,
  requireConfirm: false,
  confirmDisabled: false,
  confirmVariant: 'danger',
  errorMessage: '',
  appearance: 'default',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

const cancelRef = ref<HTMLButtonElement | null>(null)
const confirmRef = ref<HTMLButtonElement | { $el: HTMLButtonElement } | null>(null)
const confirmInput = ref('')
const confirmInputId = 'performance-confirm-delete-input'
let returnFocus: HTMLElement | null = null
let previousOverflow = ''
let pageLocked = false

const canConfirm = computed(() => !props.confirmDisabled && (!props.requireConfirm || confirmInput.value.trim() === '确认删除'))

function restorePage() {
  if (!pageLocked) return
  pageLocked = false
  document.body.style.overflow = previousOverflow
  const target = returnFocus
  void nextTick(() => { if (!pageLocked) target?.focus() })
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
    pageLocked = true
    document.body.style.overflow = 'hidden'
    confirmInput.value = ''
    void nextTick(() => { if (pageLocked) { const target = props.appearance === 'submit' || !props.showCancel ? confirmRef.value : cancelRef.value; (target && '$el' in target ? target.$el : target)?.focus() } })
  } else {
    restorePage()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (props.modelValue) restorePage()
})
</script>

<style scoped>
.performance-confirm-dialog--primary .performance-confirm-dialog__button--danger{border-color:var(--color-action-primary);background:var(--color-action-primary);color:var(--color-surface-card)}
.performance-confirm-dialog--primary .performance-confirm-dialog__button--danger:hover:not(:disabled){border-color:var(--color-action-primary-hover);background:var(--color-action-primary-hover);color:var(--color-surface-card)}
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
  --performance-confirm-width: var(--performance-dialog-width);
  width: min(var(--performance-confirm-width), calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--performance-dialog-radius);
  background: var(--color-surface-card);
  box-shadow: var(--performance-dialog-shadow);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}

.performance-confirm-dialog--wide {
  --performance-confirm-width: var(--performance-dialog-wide-width);
}

.performance-confirm-dialog__header {
  display: flex;
  flex-direction: column;
  min-height: var(--performance-dialog-header-min-height);
  max-height: calc(100vh - var(--performance-dialog-footer-height) - 32px);
  overflow: auto;
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
  width: var(--performance-dialog-icon-size);
  height: var(--performance-dialog-icon-size);
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
  margin: var(--performance-dialog-body-gap) 0 0 var(--performance-dialog-body-indent);
  font-size: var(--font-size-md);
  font-weight: 400;
  line-height: 22px;
  color: var(--color-text-primary);
}

.performance-confirm-dialog__subject { display: inline; white-space: nowrap; color: var(--color-action-primary); }
.performance-confirm-dialog__des { display: block; margin-top: 4px; color: var(--color-text-secondary); }

.performance-confirm-dialog__error { color: var(--performance-field-error-color); }
.performance-confirm-dialog__check-field { display: flex; margin-top: 8px; }
.performance-confirm-dialog--submit .performance-confirm-dialog__check-field { margin: 8px 0 0 var(--performance-dialog-body-indent); }
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
  flex: 0 0 auto;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: var(--performance-dialog-footer-gap);
  min-height: var(--performance-dialog-footer-height);
  padding: 0 var(--performance-dialog-padding) var(--spacing-3);
  box-sizing: border-box;
}

.performance-confirm-dialog__footer-left {
  display: flex;
  align-items: center;
  margin-right: auto;
  font-size: var(--font-size-md);
  line-height: 22px;
}

.performance-confirm-dialog__footer-actions {
  display: flex;
  align-items: flex-end;
  gap: var(--performance-dialog-footer-gap);
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

.performance-confirm-dialog--delegation { --performance-confirm-width:var(--performance-dialog-wide-width); }
.performance-confirm-overlay:has(.performance-confirm-dialog--delegation) { background:var(--performance-overlay-dark); z-index:calc(var(--performance-confirm-z-index) + 2); }
.performance-confirm-dialog--delegation .performance-confirm-dialog__header { min-height:0; }
.performance-confirm-dialog--delegation .performance-confirm-dialog__body { margin:8px 0 20px 40px; color:var(--color-text-secondary); }
.performance-confirm-dialog--delegation .performance-confirm-dialog__footer { padding:0 24px 24px; }
.performance-confirm-dialog--delegation .performance-confirm-dialog__button { font-weight:400; }
.performance-confirm-dialog--submit{--performance-confirm-width:420px;width:min(420px,calc(100vw - 64px));max-height:calc(100vh - 64px);border-radius:8px;box-shadow:none}
.performance-confirm-overlay:has(.performance-confirm-dialog--submit){padding:32px;background:rgba(0,0,0,.55)}
.performance-confirm-dialog--submit .performance-confirm-dialog__header{flex:1 1 auto;min-height:0;max-height:calc(100vh - 120px);padding:24px}
.performance-confirm-dialog--submit .performance-confirm-dialog__title{align-items:flex-start;min-height:24px}
.performance-confirm-dialog--submit .performance-confirm-dialog__icon{height:24px;align-items:center;line-height:0}
.performance-confirm-dialog--submit .performance-confirm-dialog__body{margin:8px 0 0 40px;font-size:14px;line-height:22px}
.performance-confirm-dialog--submit .performance-confirm-dialog__icon{color:var(--color-action-primary)}
.performance-confirm-dialog--submit .performance-confirm-dialog__body{color:var(--performance-text-secondary)}
.performance-confirm-dialog--submit .performance-confirm-dialog__footer{min-height:56px;padding:0 24px 24px;gap:12px}
.performance-confirm-dialog--submit .performance-confirm-dialog__footer-left{margin-right:auto;padding-right:12px}
.performance-confirm-dialog--submit .performance-confirm-dialog__footer-actions{display:flex;align-items:flex-end;gap:12px;margin-left:auto}
.performance-confirm-dialog--submit .performance-confirm-dialog__button{height:32px;min-width:80px;padding:4px 11px;font-weight:400;font-size:14px;line-height:22px;border-radius:6px}
.performance-confirm-dialog--submit .performance-confirm-dialog__button--danger{background:#1456f0;border-color:#1456f0;color:#fff}
.performance-confirm-dialog--submit .performance-confirm-dialog__button--danger:hover:not(:disabled){background:#336df4;border-color:#336df4;color:#fff}
.performance-confirm-dialog--submit .performance-confirm-dialog__button--danger:active:not(:disabled){background:#0442d2;border-color:#0442d2;color:#fff}
.performance-confirm-dialog--submit .performance-confirm-dialog__button--cancel:active:not(:disabled){background:#eff0f1}
.performance-confirm-dialog--calibration-completion{--performance-confirm-width:var(--performance-dialog-calibration-completion-width)}
.performance-confirm-dialog--calibration-completion .performance-confirm-dialog__header{min-height:0}
.performance-confirm-dialog--calibration-completion .performance-confirm-dialog__title{align-items:flex-start;font-size:var(--performance-dialog-header-title-size);line-height:var(--performance-dialog-header-title-line-height);font-weight:var(--performance-dialog-header-title-weight)}
.performance-confirm-dialog--calibration-completion .performance-confirm-dialog__icon{align-items:center;color:var(--performance-dialog-warning-icon)}
.performance-confirm-dialog--calibration-completion .performance-confirm-dialog__footer{padding-bottom:var(--performance-dialog-padding)}
.performance-confirm-dialog--result-opening{--color-action-primary:var(--color-primary-hover)}
.performance-confirm-dialog--result-opening .performance-confirm-dialog__title{align-items:flex-start}
.performance-confirm-dialog--result-opening .performance-confirm-dialog__icon{align-items:center;color:var(--color-action-primary)}
.performance-confirm-dialog--result-opening .performance-confirm-dialog__footer{padding-bottom:var(--performance-dialog-padding)}
</style>
