<template>
  <div ref="root" class="performance-write-mode-switch">
    <button ref="trigger" class="write-mode-trigger" type="button" :disabled="disabled" aria-haspopup="dialog" :aria-expanded="open" @click="toggle">
      <svg v-if="modelValue === 'basicWriteMode'" width="14" height="15" fill="none" aria-hidden="true"><path d="M1.75 1.826c-.644 0-1.167.522-1.167 1.167v9.333c0 .644.523 1.166 1.167 1.166h10.5c.645 0 1.167-.522 1.167-1.166V2.993c0-.645-.522-1.167-1.167-1.167H1.75zm10.5 1.167v9.333H7.8V2.993h4.45zm-10.5 0H6.5v9.333H1.75V2.993z" fill="currentColor" /></svg>
      <svg v-else width="14" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 2a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Zm4.5 11v1.692a.7.7 0 0 1-1.088.582l-4.038-2.691a.7.7 0 0 1 0-1.165l4.038-2.692a.7.7 0 0 1 1.088.582V11h9V9.308a.7.7 0 0 1 1.088-.582l4.038 2.692a.7.7 0 0 1 0 1.165l-4.038 2.691a.7.7 0 0 1-1.088-.582V13h-9ZM2 21a1 1 0 0 1 1-1h18a1 1 0 0 1 0 2H3a1 1 0 0 1-1-1Z" fill="currentColor" /></svg>
      <span>{{ modelValue === 'fullScreenMode' ? '全屏填写' : '双屏填写' }}</span>
      <svg class="write-mode-chevron" :class="{ 'is-open': open }" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.293 7.707a1 1 0 0 1 1.414 0L12 16l8.293-8.293a1 1 0 1 1 1.414 1.414l-8.293 8.293a2 2 0 0 1-2.828 0L2.293 9.121a1 1 0 0 1 0-1.414Z" fill="currentColor" /></svg>
    </button>
    <Teleport to="body">
      <Transition name="write-mode-popup">
        <section v-if="open" ref="panel" class="write-mode-menu" :style="position" role="dialog" aria-label="为当前窗口选择合适的填写模式" @keydown="onPanelKeydown">
          <h2>为当前窗口选择合适的填写模式</h2>
          <div class="write-mode-options" role="radiogroup" aria-label="填写模式">
            <button v-for="option in options" :key="option.mode" type="button" class="write-mode-option" role="radio" :aria-label="option.label" :aria-checked="modelValue === option.mode" :disabled="option.mode === 'basicWriteMode' && !splitAvailable" :class="{ 'is-selected': modelValue === option.mode }" @click="select(option.mode)">
              <img :src="option.mode === 'basicWriteMode' ? modelValue === option.mode ? dualSelected : dualDefault : modelValue === option.mode ? fullSelected : fullDefault" alt="" width="124" height="106" />
            </button>
          </div>
          <p v-if="!splitAvailable" class="write-mode-hint">窗口过窄，暂用全屏填写；扩大窗口后恢复双屏偏好。</p>
        </section>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue'
import type { PerformanceWriteMode } from '@/composables/usePerformanceWriteMode'
import dualDefault from './write-mode-assets/dual-default.svg'
import dualSelected from './write-mode-assets/dual-selected.svg'
import fullDefault from './write-mode-assets/full-default.svg'
import fullSelected from './write-mode-assets/full-selected.svg'

const props = withDefaults(defineProps<{ modelValue: PerformanceWriteMode; disabled?: boolean; splitAvailable?: boolean }>(), { disabled: false, splitAvailable: true })
const emit = defineEmits<{ 'update:modelValue': [value: PerformanceWriteMode] }>()
const options: { mode: PerformanceWriteMode; label: string }[] = [{ mode: 'basicWriteMode', label: '双屏填写' }, { mode: 'fullScreenMode', label: '全屏填写' }]
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)
const position = ref<CSSProperties>({})
function updatePosition() {
  if (!trigger.value || !panel.value) return
  const rect = trigger.value.getBoundingClientRect()
  const width = Math.min(293.333, window.innerWidth - 32)
  const height = panel.value.getBoundingClientRect().height
  position.value = { width: `${width}px`, left: `${Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16))}px`, top: `${Math.max(16, Math.min(rect.bottom + 4, window.innerHeight - height - 16))}px`, maxHeight: `${window.innerHeight - 32}px` }
}
function close(restoreFocus = true) { open.value = false; if (restoreFocus) trigger.value?.focus({ preventScroll: true }) }
function onOutside(event: MouseEvent) { if (!root.value?.contains(event.target as Node) && !panel.value?.contains(event.target as Node)) close(false) }
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); close() } }
function cleanup() {
  document.removeEventListener('mousedown', onOutside)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
}
async function toggle() {
  if (props.disabled) return
  if (open.value) { close(); return }
  open.value = true
  await nextTick()
  if (!open.value || !panel.value || !trigger.value?.isConnected) return
  updatePosition()
  panel.value?.querySelector<HTMLButtonElement>('[aria-checked="true"]:not(:disabled)')?.focus({ preventScroll: true })
  if (!panel.value?.contains(document.activeElement)) panel.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  document.addEventListener('mousedown', onOutside)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
}
function select(mode: PerformanceWriteMode) { if (mode !== props.modelValue && (mode !== 'basicWriteMode' || props.splitAvailable)) emit('update:modelValue', mode) }
function onPanelKeydown(event: KeyboardEvent) {
  const buttons = Array.from(panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }
  if (event.key === 'Tab' && buttons.length) {
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if ((event.shiftKey && index === 0) || (!event.shiftKey && index === buttons.length - 1)) { event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0].focus() }
  }
}
watch(open, value => { if (!value) cleanup() })
watch(() => props.disabled, value => { if (value) close(false) })
onBeforeUnmount(cleanup)
</script>

<style scoped>
.performance-write-mode-switch{flex:none}
.write-mode-trigger{display:flex;align-items:center;justify-content:center;gap:4px;width:100px;height:26px;padding:2px 4px;border:0;border-radius:6px;background:transparent;color:var(--color-text-primary);font:400 14px/22px var(--font-sans);white-space:nowrap;cursor:pointer;transition:color .1s ease-in,background-color .1s ease-in,border-color .1s ease-in,width .2s ease-in}
.write-mode-trigger svg{flex:none}
.write-mode-trigger:hover,.write-mode-trigger[aria-expanded="true"]{background:rgba(31,35,41,.1)}
.write-mode-trigger:active{background:rgba(31,35,41,.2)}
.write-mode-trigger:disabled{cursor:not-allowed;opacity:.55;background:transparent}
.write-mode-trigger:focus-visible,.write-mode-option:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.write-mode-chevron{color:var(--color-text-secondary);transition:transform .2s cubic-bezier(.34,.69,.1,1)}
.write-mode-chevron.is-open{transform:rotate(180deg)}
.write-mode-menu{position:fixed;z-index:var(--performance-popover-z-index,2201);padding:20px 16px;box-sizing:border-box;border:1px solid var(--color-border,#dee0e3);border-radius:8px;background:var(--color-bg-card);color:var(--color-text-primary);font:400 16px/24px var(--font-sans);box-shadow:rgba(31,35,41,.03) 0 6px 18px 6px,rgba(31,35,41,.05) 0 3px 6px -6px,rgba(31,35,41,.03) 0 4px 8px;overflow:auto}
.write-mode-menu h2{margin:0 0 12px;font:400 16px/24px var(--font-sans);color:var(--color-text-secondary);white-space:nowrap}
.write-mode-options{display:flex;gap:12px}
.write-mode-option{display:block;flex:0 0 124px;width:124px;height:106px;padding:0;border:0;background:transparent;cursor:pointer}
.write-mode-option img{display:block;width:124px;height:106px}
.write-mode-option:not(.is-selected):not(:disabled):hover img{box-shadow:rgba(31,35,41,.03) 0 6px 18px 6px,rgba(31,35,41,.05) 0 3px 6px -6px,rgba(31,35,41,.03) 0 4px 8px}
.write-mode-option:disabled{opacity:.45;cursor:not-allowed}
.write-mode-hint{margin:12px 0 0;font:400 12px/18px var(--font-sans);color:var(--color-text-secondary);white-space:normal}
.write-mode-popup-enter-active{transition:opacity .3s cubic-bezier(.34,.69,.1,1),transform .3s cubic-bezier(.34,.69,.1,1)}
.write-mode-popup-leave-active{transition:opacity .2s cubic-bezier(.34,.69,.1,1),transform .2s cubic-bezier(.34,.69,.1,1);pointer-events:none}
.write-mode-popup-enter-from,.write-mode-popup-leave-to{opacity:0;transform:translateY(-8px)}
@media(prefers-reduced-motion:reduce){.write-mode-popup-enter-active,.write-mode-popup-leave-active,.write-mode-chevron,.write-mode-trigger{transition:none}}
@media(max-width:340px){.write-mode-options{gap:8px}.write-mode-option{flex:1;min-width:0;height:auto}.write-mode-option img{width:100%;height:auto}.write-mode-menu h2{white-space:normal}}
</style>
