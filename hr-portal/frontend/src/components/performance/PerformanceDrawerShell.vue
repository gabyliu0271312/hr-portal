<template>
  <Teleport to="body">
    <div class="performance-drawer" role="presentation">
      <div v-if="modelValue && mask" class="performance-drawer__mask" @click="close" />
      <Transition name="performance-drawer-slide" appear @after-leave="emit('closed')">
      <section v-if="modelValue" class="performance-drawer__panel" :class="`performance-drawer__panel--${variant}`" :style="{ width: panelWidth, '--drawer-slide-width': panelWidth }" role="dialog" :aria-modal="mask" :aria-label="ariaLabel || title" @keydown="onPanelKeydown">
        <div v-if="resizable" class="performance-drawer__dragger" :class="{ 'is-resizing': resizing }" role="separator" aria-label="调整抽屉宽度" aria-orientation="vertical" :aria-valuemin="effectiveMinWidth" :aria-valuemax="effectiveMaxWidth" :aria-valuenow="Math.round(clampWidth(widthValue))" tabindex="0" @keydown="onDraggerKeydown" @mousedown="startResize">
          <svg class="performance-drawer__dragger-grip" width="20" height="20" viewBox="0 0 24 24" fill="none" data-icon="MoreVerticalOutlined" aria-hidden="true"><circle cx="12" cy="3.75" r="1.75" fill="currentColor" /><circle cx="12" cy="11.975" r="1.75" fill="currentColor" /><circle cx="12" cy="20.25" r="1.75" fill="currentColor" /></svg>
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
      </Transition>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePerformanceDrawerResize } from '@/composables/usePerformanceDrawerResize'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  ariaLabel?: string
  width?: string
  initialWidth?: number
  variant?: 'default' | 'captured' | 'captured-invite' | 'evaluation'
  bodyClass?: string
  resizable?: boolean
  minWidth?: number
  maxWidth?: number
  oppositeLimitDistance?: number
  cacheKey?: string
  lang?: string
  mask?: boolean
  keyboard?: boolean
}>(), { title: '', ariaLabel: '', width: '480px', variant: 'default', bodyClass: '', resizable: false, minWidth: 420, maxWidth: Number.POSITIVE_INFINITY, oppositeLimitDistance: 148, cacheKey: '', lang: 'zh-CN', mask: true, keyboard: true })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; close: []; closed: []; resize: [width: number] }>()
const { resizing, effectiveMinWidth, effectiveMaxWidth, widthValue, panelWidth, clampWidth, startResize, stopResize, onDraggerKeydown } = usePerformanceDrawerResize(props, value => emit('resize', value))
const closeIconSize = computed(() => props.variant === 'default' || props.variant === 'evaluation' ? 16 : 20)
const closePath = computed(() => props.variant === 'default' ? 'm6 6 12 12M18 6 6 18' : 'M20.207 20.207a.99.99 0 0 0 .003-1.403L13.406 12l6.804-6.804a.99.99 0 0 0-.003-1.403.99.99 0 0 0-1.403-.003L12 10.594 5.196 3.79a.99.99 0 0 0-1.403.003.99.99 0 0 0 .003 1.403L10.594 12 3.79 18.804a.99.99 0 0 0 .003 1.403.99.99 0 0 0 1.403.003L12 13.406l6.804 6.804a.99.99 0 0 0 1.403-.003Z')
function close() { stopResize(); emit('close'); emit('update:modelValue', false) }
function onPanelKeydown(event: KeyboardEvent) {
  if (!props.keyboard || event.defaultPrevented || event.key !== 'Escape') return
  event.preventDefault()
  close()
}
</script>

<style scoped>
.performance-drawer__mask{position:fixed;inset:0;z-index:calc(var(--performance-drawer-z-index) - 1);background:var(--performance-overlay)}.performance-drawer__panel{position:fixed;top:0;right:0;bottom:0;z-index:var(--performance-drawer-z-index);display:flex;flex-direction:column;max-width:100vw;background:var(--color-bg-card);box-shadow:-8px 0 24px rgba(31,35,41,.16)}.performance-drawer__dragger{position:absolute;top:0;bottom:0;left:0;z-index:100;width:1px;background:transparent;color:#8f959e;cursor:col-resize;touch-action:none;user-select:none}.performance-drawer__dragger::before{position:absolute;inset:0 -20px;content:''}.performance-drawer__dragger:hover,.performance-drawer__dragger:focus-visible,.performance-drawer__dragger.is-resizing{background:var(--color-primary);color:var(--color-primary);outline:0}.performance-drawer__dragger-grip{display:block;position:absolute;top:50%;left:0;z-index:1;width:20px;height:20px;margin-left:-4px;transform:translate(.5px,-50%);pointer-events:none}.performance-drawer__header{display:flex;align-items:center;justify-content:space-between;flex:0 0 var(--performance-drawer-header-height);height:var(--performance-drawer-header-height);padding:16px var(--spacing-6);box-sizing:border-box;border-bottom:1px solid var(--color-border-light);background:var(--color-bg-card);color:var(--color-text-primary)}.performance-drawer__header-slot{display:flex;min-width:0;flex:1;align-items:center}.performance-drawer__header h2{margin:0;font:var(--performance-drawer-title-weight) var(--font-size-lg)/24px inherit}.performance-drawer__close{display:grid;place-items:center;width:var(--performance-dialog-close-size);height:var(--performance-dialog-close-size);margin:-2px -4px;padding:4px;border:0;border-radius:var(--performance-button-radius);background:transparent;color:var(--performance-icon-button-color);cursor:pointer;transition:color var(--duration-instant) var(--ease-in),background-color var(--duration-instant) var(--ease-in)}.performance-drawer__close:hover:not(:disabled),.performance-drawer__close:focus-visible{background:var(--performance-icon-button-hover-background)}.performance-drawer__close:focus-visible{outline:0;box-shadow:var(--performance-button-focus-ring)}.performance-drawer__close svg{display:block}.performance-drawer__panel--captured-invite .performance-drawer__header{flex-basis:81px;height:81px;padding:16px var(--spacing-6)}.performance-drawer__panel--captured .performance-drawer__close{width:var(--performance-dialog-close-size);height:var(--performance-dialog-close-size);margin:-2px -4px;padding:4px}.performance-drawer__panel--evaluation{box-shadow:-12px 0 36px 10px rgba(31,35,41,.1),-8px 0 24px rgba(31,35,41,.04),-6px 0 12px -10px rgba(31,35,41,.06)}.performance-drawer__panel--evaluation .performance-drawer__header{height:auto;min-height:69.5px;flex:0 0 auto;align-items:flex-start;padding:16px 20px 4px;border-bottom:0}.performance-drawer__panel--evaluation .performance-drawer__close{width:24px;height:24px;flex:0 0 24px;margin:0;padding:4px}.performance-drawer__body{display:flex;flex:1;min-height:0;overflow:hidden}.performance-drawer__panel--captured .performance-drawer__body,.performance-drawer__panel--captured-invite .performance-drawer__body{overflow:auto;padding:var(--spacing-5) var(--spacing-6);box-sizing:border-box}.performance-drawer__body--invite{padding:var(--spacing-6) var(--spacing-6) var(--spacing-8)!important}.performance-drawer__body--flush{padding:0!important;overflow:hidden!important}
@media(max-width:640px){.performance-drawer__panel--evaluation .performance-drawer__header{height:auto;min-height:70px;flex-basis:auto;align-items:flex-start;padding:16px 20px 8px}}
.performance-drawer-slide-enter-active{transition:transform 300ms cubic-bezier(.34,.69,.1,1),opacity 300ms cubic-bezier(.34,.69,.1,1)}.performance-drawer-slide-leave-active{transition:transform 200ms cubic-bezier(.34,.69,.1,1),opacity 200ms cubic-bezier(.34,.69,.1,1)}.performance-drawer-slide-enter-from,.performance-drawer-slide-leave-to{transform:translateX(var(--drawer-slide-width));opacity:0}
</style>
