<script lang="ts">
let nextDialogId = 0
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  width?: string
  loading?: boolean
  fullscreen?: boolean
  overlayClass?: string
  dialogClass?: string
  titleId?: string
  teleport?: boolean
}>(), {
  width: 'var(--ui-dialog-width)', loading: false, fullscreen: false,
  overlayClass: '', dialogClass: '', titleId: undefined, teleport: true,
})
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; close: [] }>()
const titleId = props.titleId || `ui-dialog-title-${++nextDialogId}`
const panel = ref<HTMLElement>()
let previousFocus: HTMLElement | null = null
function close() {
  if (props.loading) return
  emit('close')
  emit('update:modelValue', false)
}
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !panel.value) return
  const controls = [...panel.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
    .filter(node => node.getClientRects().length)
  const first = controls[0], last = controls[controls.length - 1]
  if (!first) { event.preventDefault(); panel.value.focus(); return }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
watch(() => props.modelValue, async visible => {
  if (visible) {
    previousFocus = document.activeElement as HTMLElement | null
    await nextTick()
    panel.value?.focus()
  } else previousFocus?.focus()
}, { immediate: true })
onBeforeUnmount(() => { if (props.modelValue) previousFocus?.focus() })
</script>

<template>
  <Teleport to="body" :disabled="!teleport">
    <div v-if="modelValue" class="performance-dialog-overlay" :class="[overlayClass, { 'performance-dialog-overlay--fullscreen': fullscreen }]" @mousedown.self="close">
      <section ref="panel" class="performance-dialog" :class="[dialogClass, { 'performance-dialog--fullscreen': fullscreen }]" :style="{ width: fullscreen ? '100vw' : width }" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @keydown.esc.stop.prevent="close" @keydown="trapFocus">
        <header class="performance-dialog__header">
          <slot name="header-start" />
          <h2 :id="titleId">{{ title }}</h2>
          <div v-if="$slots.description" class="performance-dialog__description"><slot name="description" /></div>
          <button class="performance-dialog__close" type="button" aria-label="关闭" :disabled="loading" @click="close">
            <svg viewBox="0 0 24 24" fill="none" data-icon="CloseOutlined" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </header>
        <div class="performance-dialog__body"><slot /></div>
        <footer class="performance-dialog__footer"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.performance-dialog-overlay { position: fixed; inset: 0; z-index: var(--ui-dialog-z-index); display: grid; place-items: center; padding: var(--spacing-4); box-sizing: border-box; background: var(--ui-dialog-overlay); }
.performance-dialog { position: relative; display: flex; max-width: calc(100vw - var(--ui-dialog-viewport-inset)); max-height: calc(100dvh - var(--ui-dialog-viewport-inset) * 2); flex-direction: column; overflow: hidden; box-sizing: border-box; border-radius: var(--ui-dialog-radius); background: var(--color-bg-card); color: var(--color-text-primary); font: var(--font-weight-normal) var(--font-size-md)/var(--ui-dialog-line-height) var(--font-sans); box-shadow: var(--ui-dialog-shadow); outline: none; }
.performance-dialog__header { position: relative; flex: 0 0 auto; min-height: var(--ui-dialog-header-height); padding: var(--ui-dialog-header-padding-y) var(--ui-dialog-header-padding-right) var(--ui-dialog-header-padding-y) var(--ui-dialog-padding); box-sizing: border-box; }
.performance-dialog--auto-header .performance-dialog__header { min-height: 0; }
.performance-dialog__header h2 { margin: 0; color: var(--color-text-primary); font-size: var(--ui-dialog-title-size); font-weight: var(--ui-dialog-title-weight); line-height: var(--ui-dialog-title-line-height); }
.performance-dialog__description { min-width: 0; margin-top: var(--performance-dialog-header-desc-gap); color: var(--color-text-secondary); font-size: var(--performance-dialog-header-desc-size); font-weight: var(--performance-dialog-header-desc-weight); line-height: var(--performance-dialog-header-desc-line-height); }
.performance-dialog__close { position: absolute; top: var(--ui-dialog-padding); right: var(--ui-dialog-padding); display: grid; place-items: center; width: var(--ui-dialog-close-size); height: var(--ui-dialog-close-size); margin: var(--ui-dialog-close-margin); padding: var(--spacing-1); border: 0; border-radius: var(--button-radius); background: transparent; color: var(--performance-icon-button-color); cursor: pointer; }
.performance-dialog__close svg { width: var(--ui-dialog-close-icon-size); height: var(--ui-dialog-close-icon-size); }
.performance-dialog__close:hover:not(:disabled), .performance-dialog__close:focus-visible { background: var(--performance-icon-button-hover-background); }
.performance-dialog__close:focus-visible { outline: 0; box-shadow: var(--performance-button-focus-ring); }
.performance-dialog__close:disabled { cursor: not-allowed; opacity: var(--ui-control-disabled-opacity); }
.performance-dialog__body { min-height: var(--performance-dialog-body-min-height); overflow: auto; margin-bottom: var(--ui-dialog-content-gap); padding: 0 var(--ui-dialog-padding); box-sizing: border-box; }
.performance-dialog__footer { flex: 0 0 auto; padding: 0 var(--ui-dialog-padding) var(--ui-dialog-padding); box-sizing: border-box; }
.performance-dialog-overlay--fullscreen { padding: 0; }
.performance-dialog--fullscreen { width: 100vw; height: 100vh; max-width: none; max-height: none; border-radius: 0; box-shadow: none; }
.performance-dialog--fullscreen .performance-dialog__header { display: flex; align-items: center; gap: var(--spacing-5); flex: 0 0 var(--ui-dialog-fullscreen-header-height); height: var(--ui-dialog-fullscreen-header-height); min-height: var(--ui-dialog-fullscreen-header-height); padding: 0 var(--ui-dialog-padding); border-bottom: var(--ui-control-border-width) solid var(--color-surface-disabled); }
.performance-dialog--fullscreen .performance-dialog__header h2 { font-size: var(--font-size-lg); font-weight: var(--ui-dialog-title-weight); line-height: var(--ui-dialog-line-height); }
.performance-dialog--fullscreen .performance-dialog__close { top: var(--spacing-4); right: var(--spacing-5); }
.performance-dialog--fullscreen .performance-dialog__body { flex: 1; min-height: 0; margin: 0; padding: 0; display: flex; flex-direction: column; overflow: hidden; }
.performance-dialog--fullscreen .performance-dialog__body > * { flex: 1; min-height: 0; }
.performance-dialog--fullscreen .performance-dialog__footer { display: none; }
</style>
