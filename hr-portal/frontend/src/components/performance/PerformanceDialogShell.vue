<template>
  <Teleport to="body" :disabled="!teleport">
    <div v-if="modelValue" class="performance-dialog-overlay" :class="overlayClass" @mousedown.self="close">
      <section
        class="performance-dialog"
        :class="dialogClass"
        :style="{ width }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @keydown.esc.prevent="close"
      >
        <header class="performance-dialog__header">
          <h2 :id="titleId">{{ title }}</h2>
          <div v-if="$slots.description" class="performance-dialog__description"><slot name="description" /></div>
          <button class="performance-dialog__close" type="button" aria-label="关闭" :disabled="loading" @click="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" data-icon="CloseOutlined" aria-hidden="true">
              <path d="M20.207 20.207a.99.99 0 0 0 .003-1.403L13.406 12l6.804-6.804a.99.99 0 0 0-.003-1.403.99.99 0 0 0-1.403-.003L12 10.594 5.196 3.79a.99.99 0 0 0-1.403.003.99.99 0 0 0-.003 1.403L10.594 12 3.79 18.804a.99.99 0 0 0 .003 1.403L12 13.406l6.804 6.804a.99.99 0 0 0 1.403-.003Z" fill="currentColor" />
            </svg>
          </button>
        </header>
        <div class="performance-dialog__body"><slot /></div>
        <footer class="performance-dialog__footer"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
let nextDialogId = 0

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  width?: string
  loading?: boolean
  overlayClass?: string
  dialogClass?: string
  titleId?: string
  teleport?: boolean
}>(), {
  width: '600px',
  loading: false,
  overlayClass: '',
  dialogClass: '',
  titleId: undefined,
  teleport: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>()

const titleId = props.titleId || `performance-dialog-title-${++nextDialogId}`

function close() {
  if (props.loading) return
  emit('close')
  emit('update:modelValue', false)
}
</script>

<style scoped>
.performance-dialog-overlay { position: fixed; inset: 0; z-index: var(--performance-confirm-z-index); display: grid; place-items: center; padding: var(--spacing-4); box-sizing: border-box; background: var(--performance-dialog-overlay); }
.performance-dialog { position: relative; display: flex; max-width: calc(100vw - 32px); max-height: calc(100vh - 28px); flex-direction: column; overflow: hidden; box-sizing: border-box; border-radius: var(--performance-dialog-radius); background: var(--color-bg-card); color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); box-shadow: var(--performance-dialog-shadow); }
.performance-dialog__header { position: relative; flex: 0 0 var(--performance-dialog-header-height); min-height: var(--performance-dialog-header-height); padding: var(--spacing-6) var(--performance-dialog-header-padding-right) var(--spacing-6) var(--performance-dialog-padding); box-sizing: border-box; }
.performance-dialog--auto-header .performance-dialog__header { flex: 0 0 auto; min-height: 0; }
.performance-dialog__header h2 { margin: 0; color: var(--color-text-primary); font-size: var(--font-size-lg); font-weight: 600; line-height: 24px; }
.performance-dialog__description { min-width: 0; margin-top: 4px; color: var(--color-text-secondary); font-size: var(--font-size-md); font-weight: 400; line-height: 22px; }
.performance-dialog__close { position: absolute; top: var(--spacing-6); right: var(--spacing-6); display: grid; place-items: center; width: var(--performance-dialog-close-size); height: var(--performance-dialog-close-size); margin: -2px -4px; padding: 4px; border: 0; border-radius: var(--performance-button-radius); background: transparent; color: var(--color-text-secondary); cursor: pointer; }
.performance-dialog__close:hover, .performance-dialog__close:focus-visible { outline: 0; background: var(--color-surface-disabled); color: var(--color-action-primary-hover); box-shadow: var(--performance-button-focus-ring); }
.performance-dialog__close:disabled { cursor: not-allowed; opacity: .6; }
.performance-dialog__body { min-height: 62px; overflow: auto; margin-bottom: var(--performance-dialog-content-gap); padding: 0 var(--performance-dialog-padding); box-sizing: border-box; }
.performance-dialog__footer { flex: 0 0 auto; padding: 0 var(--performance-dialog-padding) var(--performance-dialog-padding); box-sizing: border-box; }
</style>
