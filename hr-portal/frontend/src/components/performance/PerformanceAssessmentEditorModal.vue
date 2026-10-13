<template>
  <Teleport to="body">
    <div v-if="open" class="performance-editor-modal-layer modal-layer" :class="{ 'is-sorting': sorting }" @mousedown.self.prevent>
      <section ref="modalRef" class="performance-editor-modal content-modal" :class="[`performance-editor-modal--${type}`, `content-modal--${type}`]" role="dialog" aria-modal="true" :aria-labelledby="`${type}-title`" @keydown="$emit('keydown', $event)">
        <header v-if="chrome" class="performance-editor-modal__header modal-header">
          <h2 :id="`${type}-title`">{{ mode === 'edit' ? '&#x7F16;&#x8F91;' : '&#x65B0;&#x5EFA;' }}{{ label }}</h2>
          <button ref="closeRef" class="performance-editor-modal__close icon-button" type="button" aria-label="Close editor" @click="$emit('close')"><span aria-hidden="true">×</span></button>
        </header>
        <slot />
        <footer v-if="chrome" class="performance-editor-modal__footer modal-footer">
          <PerformanceButton variant="secondary" @click="$emit('close')">取消</PerformanceButton>
          <PerformanceButton variant="primary" @click="$emit('confirm')">确定</PerformanceButton>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PerformanceButton from './PerformanceButton.vue'
withDefaults(defineProps<{ open: boolean; type: string; label: string; mode?: 'create' | 'edit'; sorting?: boolean; chrome?: boolean }>(), { chrome: true })
defineEmits<{ close: []; confirm: []; keydown: [event: KeyboardEvent] }>()
const modalRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLButtonElement | null>(null)
defineExpose({ modalRef, closeRef })
</script>

<style scoped>
.performance-editor-modal-layer { position: fixed; inset: 0; z-index: var(--performance-confirm-z-index); display: flex; align-items: center; justify-content: center; padding: 32px 180px; box-sizing: border-box; background: var(--performance-dialog-overlay); }
.performance-editor-modal { display: flex; flex-direction: column; width: min(1080px,calc(100vw - 360px)); max-height: calc(100vh - 64px); overflow: hidden; border-radius: var(--performance-dialog-radius); background: var(--color-bg-card); box-shadow: var(--performance-dialog-shadow); }
.performance-editor-modal--work_summary { height: 650px; }.performance-editor-modal--rating { height: 559px; }.performance-editor-modal--custom { height: 722px; }
.performance-editor-modal__header { display: flex; align-items: center; justify-content: space-between; height: var(--performance-dialog-header-height); min-height: var(--performance-dialog-header-height); padding: 0 var(--performance-dialog-padding); border-bottom: 1px solid var(--color-border-light); }
.performance-editor-modal__header h2 { margin: 0; font-size: var(--font-size-lg); }.performance-editor-modal__close { width: var(--performance-dialog-close-size); height: var(--performance-dialog-close-size); border: 0; border-radius: var(--performance-button-radius); background: transparent; color: var(--color-text-secondary); font-size: 22px; cursor: pointer; }.performance-editor-modal__close:hover,.performance-editor-modal__close:focus-visible { background: var(--color-surface-disabled); color: var(--color-action-primary-hover); outline: 0; box-shadow: var(--performance-button-focus-ring); }
.performance-editor-modal__body { display: grid; grid-template-columns: 1fr 1fr; flex: 1; min-height: 0; }.performance-editor-modal__footer { display: flex; justify-content: flex-end; gap: var(--performance-button-gap); height: 81px; min-height: 81px; padding: var(--spacing-6); box-sizing: border-box; border-top: 1px solid var(--color-border-light); }
@media(max-width:1440px){.performance-editor-modal{width:calc(100vw - 360px);height:calc(100vh - 64px)}}
</style>
