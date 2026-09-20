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
          <button class="button button--secondary" type="button" @click="$emit('close')">&#x53D6;&#x6D88;</button>
          <button class="button button--primary" type="button" @click="$emit('confirm')">&#x786E;&#x5B9A;</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
withDefaults(defineProps<{ open: boolean; type: string; label: string; mode?: 'create' | 'edit'; sorting?: boolean; chrome?: boolean }>(), { chrome: true })
defineEmits<{ close: []; confirm: []; keydown: [event: KeyboardEvent] }>()
const modalRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLButtonElement | null>(null)
defineExpose({ modalRef, closeRef })
</script>

<style scoped>
.performance-editor-modal-layer { position: fixed; inset: 0; z-index: 2200; display: flex; align-items: center; justify-content: center; padding: 32px 180px; box-sizing: border-box; background: rgba(31,35,41,.55); }
.performance-editor-modal { display: flex; flex-direction: column; width: min(1080px,calc(100vw - 360px)); max-height: calc(100vh - 64px); overflow: hidden; border-radius: 8px; background: #fff; box-shadow: 0 12px 32px rgba(31,35,41,.2); }
.performance-editor-modal--work_summary { height: 650px; }.performance-editor-modal--rating { height: 559px; }.performance-editor-modal--custom { height: 722px; }
.performance-editor-modal__header { display: flex; align-items: center; justify-content: space-between; height: 72px; min-height: 72px; padding: 0 24px; border-bottom: 1px solid #dee0e3; }
.performance-editor-modal__header h2 { margin: 0; font-size: 18px; }.performance-editor-modal__close { width: 32px; height: 32px; border: 0; border-radius: 6px; background: transparent; color: #646a73; font-size: 22px; cursor: pointer; }.performance-editor-modal__close:hover { background: #eff0f1; }
.performance-editor-modal__body { display: grid; grid-template-columns: 1fr 1fr; flex: 1; min-height: 0; }.performance-editor-modal__footer { display: flex; justify-content: flex-end; gap: 12px; height: 81px; min-height: 81px; padding: 24px; box-sizing: border-box; border-top: 1px solid #dee0e3; }
@media(max-width:1440px){.performance-editor-modal{width:calc(100vw - 360px);height:calc(100vh - 64px)}}
</style>
