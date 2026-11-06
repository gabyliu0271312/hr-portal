<template>
  <Teleport to="body" :disabled="!teleport">
    <div
      v-if="modelValue"
      class="performance-dialog-overlay"
      :class="[overlayClass, { 'performance-dialog-overlay--fullscreen': fullscreen }]"
      @mousedown.self="close"
    >
      <section
        class="performance-dialog"
        :class="[dialogClass, { 'performance-dialog--fullscreen': fullscreen }]"
        :style="{ width: fullscreen ? '100vw' : width }"
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
  /** 全屏页形态（无遮罩留白、无圆角阴影、页头 56、内容区撑满剩余高度且自身不滚动） */
  fullscreen?: boolean
  overlayClass?: string
  dialogClass?: string
  titleId?: string
  teleport?: boolean
}>(), {
  width: 'var(--performance-dialog-wide-width)',
  loading: false,
  fullscreen: false,
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
.performance-dialog { position: relative; display: flex; max-width: calc(100vw - var(--performance-dialog-viewport-inset)); max-height: calc(100dvh - var(--performance-dialog-viewport-inset) * 2); flex-direction: column; overflow: hidden; box-sizing: border-box; border-radius: var(--performance-dialog-radius); background: var(--color-bg-card); color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); box-shadow: var(--performance-dialog-shadow); }
.performance-dialog__header { position: relative; flex: 0 0 auto; min-height: var(--performance-dialog-header-height); padding: var(--performance-dialog-header-padding-y) var(--performance-dialog-header-padding-right) var(--performance-dialog-header-padding-y) var(--performance-dialog-header-padding-x); box-sizing: border-box; }
.performance-dialog--auto-header .performance-dialog__header { flex: 0 0 auto; min-height: 0; }
.performance-dialog__header h2 { margin: 0; color: var(--color-text-primary); font-size: var(--performance-dialog-header-title-size); font-weight: var(--performance-dialog-header-title-weight); line-height: var(--performance-dialog-header-title-line-height); }
.performance-dialog__description { min-width: 0; margin-top: var(--performance-dialog-header-desc-gap); color: var(--color-text-secondary); font-size: var(--performance-dialog-header-desc-size); font-weight: var(--performance-dialog-header-desc-weight); line-height: var(--performance-dialog-header-desc-line-height); }
.performance-dialog__close { position: absolute; top: var(--spacing-6); right: var(--spacing-6); display: grid; place-items: center; width: var(--performance-dialog-close-size); height: var(--performance-dialog-close-size); margin: -2px -4px; padding: 4px; border: 0; border-radius: var(--performance-button-radius); background: transparent; color: var(--performance-icon-button-color); cursor: pointer; transition: color var(--duration-instant) var(--ease-in), background-color var(--duration-instant) var(--ease-in), border-color var(--duration-instant) var(--ease-in); }
.performance-dialog__close:hover:not(:disabled), .performance-dialog__close:focus-visible { background: var(--performance-icon-button-hover-background); }
.performance-dialog__close:focus-visible { outline: 0; box-shadow: var(--performance-button-focus-ring); }
.performance-dialog__close:disabled { cursor: not-allowed; opacity: .6; }
.performance-dialog__body { min-height: var(--performance-dialog-body-min-height); overflow: auto; margin-bottom: var(--performance-dialog-content-gap); padding: 0 var(--performance-dialog-padding); box-sizing: border-box; }
.performance-dialog__footer { flex: 0 0 auto; padding: 0 var(--performance-dialog-padding) var(--performance-dialog-padding); box-sizing: border-box; }

/* ---------- 全屏页形态：整页 100vh，页头 56，内容区 flex:1 且自身不滚动 ----------
   页面内容区（如模板预览的三栏）依赖「确定高度」才能让内部滚动条与分割线位置稳定；
   若内容区高度由内容撑开，切换内容时分割线长度会跟着变。 */
.performance-dialog-overlay--fullscreen { padding: 0; }
.performance-dialog--fullscreen { width: 100vw; height: 100vh; max-width: none; max-height: none; border-radius: 0; box-shadow: none; }
.performance-dialog--fullscreen .performance-dialog__header { display: flex; align-items: center; flex: 0 0 56px; height: 56px; min-height: 56px; padding: 0 24px; border-bottom: 1px solid #eff0f1; }
.performance-dialog--fullscreen .performance-dialog__header h2 { font-size: 16px; font-weight: 600; line-height: 22px; }
.performance-dialog--fullscreen .performance-dialog__close { top: 16px; right: 20px; }
.performance-dialog--fullscreen .performance-dialog__body { flex: 1; min-height: 0; height: auto; margin: 0; padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.performance-dialog--fullscreen .performance-dialog__body > * { flex: 1; min-height: 0; }
.performance-dialog--fullscreen .performance-dialog__footer { display: none; }
</style>
