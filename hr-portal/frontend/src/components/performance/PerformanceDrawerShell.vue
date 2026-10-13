<template>
  <Teleport to="body">
    <div v-if="modelValue" class="performance-drawer" role="presentation">
      <div class="performance-drawer__mask" @click="close" />
      <section class="performance-drawer__panel" :class="`performance-drawer__panel--${variant}`" :style="{ width: panelWidth }" role="dialog" aria-modal="true" :aria-label="ariaLabel || title">
        <div v-if="resizable" class="performance-drawer__dragger" :class="{ 'is-resizing': resizing }" role="separator" aria-label="调整抽屉宽度" aria-orientation="vertical" tabindex="0" @keydown="onDraggerKeydown" @pointerdown="startResize">
          <span aria-hidden="true">⋮</span>
        </div>
        <header class="performance-drawer__header">
          <div class="performance-drawer__header-slot"><slot name="header"><h2>{{ title }}</h2></slot></div>
          <button class="performance-drawer__close" type="button" aria-label="关闭" @click="close">
            <svg :width="closeIconSize" :height="closeIconSize" viewBox="0 0 24 24" fill="none" data-icon="CloseOutlined" aria-hidden="true"><path :d="closePath" :stroke="variant === 'default' ? 'currentColor' : undefined" :stroke-width="variant === 'default' ? 2 : undefined" :stroke-linecap="variant === 'default' ? 'round' : undefined" :fill="variant === 'default' ? 'none' : 'currentColor'" /></svg>
          </button>
        </header>
        <div class="performance-drawer__body" :class="bodyClass"><slot /></div>
        <slot name="footer" />
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  ariaLabel?: string
  width?: string
  variant?: 'default' | 'captured' | 'evaluation'
  bodyClass?: string
  resizable?: boolean
  minWidth?: number
  maxWidth?: number
}>(), { title: '', ariaLabel: '', width: '480px', variant: 'default', bodyClass: '', resizable: false, minWidth: 420, maxWidth: 1084 })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; close: []; resize: [width: number] }>()
const widthValue = ref(parseWidth(props.width))
const resizing = ref(false)
let pointerId: number | null = null
let startX = 0
let startWidth = 0

function parseWidth(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 480
}
function clampWidth(value: number) {
  const viewportMax = typeof window === 'undefined' ? props.maxWidth : Math.max(props.minWidth, window.innerWidth - 240)
  return Math.round(Math.min(Math.max(value, props.minWidth), Math.min(props.maxWidth, viewportMax)))
}
const panelWidth = computed(() => props.resizable ? `${clampWidth(widthValue.value)}px` : props.width)
const closeIconSize = computed(() => props.variant === 'default' ? 16 : 20)
const closePath = computed(() => props.variant === 'default' ? 'm6 6 12 12M18 6 6 18' : 'M20.207 20.207a.99.99 0 0 0 .003-1.403L13.406 12l6.804-6.804a.99.99 0 0 0-.003-1.403.99.99 0 0 0-1.403-.003L12 10.594 5.196 3.79a.99.99 0 0 0-1.403.003.99.99 0 0 0 .003 1.403L10.594 12 3.79 18.804a.99.99 0 0 0 .003 1.403.99.99 0 0 0 1.403.003L12 13.406l6.804 6.804a.99.99 0 0 0 1.403-.003Z')
watch(() => props.width, value => { if (!resizing.value) widthValue.value = parseWidth(value) })
function close() { emit('close'); emit('update:modelValue', false) }
function updateWidth(value: number) { widthValue.value = clampWidth(value); emit('resize', widthValue.value) }
function startResize(event: PointerEvent) {
  if (!props.resizable) return
  event.preventDefault()
  pointerId = event.pointerId
  startX = event.clientX
  startWidth = clampWidth(widthValue.value)
  resizing.value = true
  window.addEventListener('pointermove', moveResize)
  window.addEventListener('pointerup', stopResize)
  window.addEventListener('pointercancel', stopResize)
}
function moveResize(event: PointerEvent) {
  if (!resizing.value || pointerId !== event.pointerId) return
  updateWidth(startWidth + startX - event.clientX)
}
function stopResize(event?: PointerEvent) {
  if (event && pointerId !== null && event.pointerId !== pointerId) return
  resizing.value = false
  pointerId = null
  window.removeEventListener('pointermove', moveResize)
  window.removeEventListener('pointerup', stopResize)
  window.removeEventListener('pointercancel', stopResize)
}
function onDraggerKeydown(event: KeyboardEvent) {
  if (!props.resizable) return
  if (event.key === 'ArrowLeft') { event.preventDefault(); updateWidth(widthValue.value + 16) }
  if (event.key === 'ArrowRight') { event.preventDefault(); updateWidth(widthValue.value - 16) }
}
onBeforeUnmount(() => stopResize())
</script>

<style scoped>
.performance-drawer__mask{position:fixed;inset:0;z-index:calc(var(--performance-drawer-z-index) - 1);background:var(--performance-overlay)}.performance-drawer__panel{position:fixed;top:0;right:0;bottom:0;z-index:var(--performance-drawer-z-index);display:flex;flex-direction:column;max-width:100vw;background:var(--color-bg-card);box-shadow:-8px 0 24px rgba(31,35,41,.16)}.performance-drawer__dragger{position:absolute;top:0;bottom:0;left:-1px;z-index:2;width:1px;background:transparent;color:transparent;cursor:col-resize;transition:background-color var(--duration-base) var(--ease-standard),color var(--duration-base) var(--ease-standard)}.performance-drawer__dragger:hover,.performance-drawer__dragger:focus-visible,.performance-drawer__dragger.is-resizing{background:var(--color-primary);color:var(--color-primary);outline:0}.performance-drawer__dragger span{display:grid;position:absolute;top:50%;left:-10px;width:20px;height:20px;place-items:center;opacity:0;transform:translateY(-50%);font-size:20px;line-height:20px;transition:opacity var(--duration-base) var(--ease-standard)}.performance-drawer__dragger:hover span,.performance-drawer__dragger:focus-visible span,.performance-drawer__dragger.is-resizing span{opacity:1}.performance-drawer__header{display:flex;align-items:center;justify-content:space-between;flex:0 0 var(--performance-drawer-header-height);height:var(--performance-drawer-header-height);padding:16px var(--spacing-6);box-sizing:border-box;border-bottom:1px solid var(--color-border-light);background:var(--color-bg-card);color:var(--color-text-primary)}.performance-drawer__header-slot{display:flex;min-width:0;flex:1;align-items:center}.performance-drawer__header h2{margin:0;font:600 var(--font-size-lg)/24px inherit}.performance-drawer__close{display:grid;place-items:center;width:var(--performance-dialog-close-size);height:var(--performance-dialog-close-size);margin:-2px -4px;padding:4px;border:0;border-radius:var(--performance-button-radius);background:transparent;color:var(--color-text-secondary);cursor:pointer}.performance-drawer__close:hover,.performance-drawer__close:focus-visible{background:var(--color-surface-disabled);color:var(--color-action-primary-hover);outline:0;box-shadow:var(--performance-button-focus-ring)}.performance-drawer__close svg{display:block}.performance-drawer__panel--captured .performance-drawer__close{width:var(--performance-dialog-close-size);height:var(--performance-dialog-close-size);margin:-2px -4px;padding:4px}.performance-drawer__panel--evaluation .performance-drawer__header{flex-basis:70px;height:70px;padding:16px 20px 4px}.performance-drawer__panel--evaluation .performance-drawer__close{width:var(--performance-dialog-close-size);height:var(--performance-dialog-close-size);margin:-2px -4px;padding:4px}.performance-drawer__body{display:flex;flex:1;min-height:0;overflow:hidden}.performance-drawer__panel--captured .performance-drawer__body{overflow:auto;padding:var(--spacing-5) var(--spacing-6);box-sizing:border-box}.performance-drawer__body--flush{padding:0!important;overflow:hidden!important}
</style>
