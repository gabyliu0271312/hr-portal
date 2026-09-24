<template>
  <Teleport to="body">
    <div v-if="modelValue" class="notification-confirm-overlay" @mousedown.self="keep">
      <section
        class="notification-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="notification-confirm-title"
        aria-describedby="notification-confirm-body"
        @keydown="onKeydown"
      >
        <div class="notification-confirm__header">
          <div class="notification-confirm__title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M23 12c0 6.075-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1s11 4.925 11 11ZM12 7a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" fill="currentColor" /></svg>
            <h2 id="notification-confirm-title">确定取消勾选吗</h2>
          </div>
          <p id="notification-confirm-body">取消后，所有人都将收不到该通知。</p>
        </div>
        <div class="notification-confirm__footer">
          <button ref="keepButton" type="button" class="notification-confirm__keep" :disabled="saving" @click="keep">保留</button>
          <button ref="confirmButton" type="button" class="notification-confirm__confirm" :disabled="saving" @click="confirm">确定</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = withDefaults(defineProps<{ modelValue: boolean; saving?: boolean }>(), { saving: false })
const emit = defineEmits<{ (event: 'keep'): void; (event: 'confirm'): void }>()
const keepButton = ref<HTMLButtonElement | null>(null)
const confirmButton = ref<HTMLButtonElement | null>(null)
let previousFocus: HTMLElement | null = null

watch(() => props.modelValue, async (open) => {
  if (open) {
    previousFocus = document.activeElement as HTMLElement | null
    await nextTick()
    keepButton.value?.focus()
  } else if (previousFocus?.isConnected) {
    previousFocus.focus()
  }
})

function keep() {
  if (!props.saving) emit('keep')
}

function confirm() {
  if (!props.saving) emit('confirm')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    keep()
  }
  if (event.key !== 'Tab' || props.saving) return
  if (event.shiftKey && document.activeElement === keepButton.value) {
    event.preventDefault()
    confirmButton.value?.focus()
  } else if (!event.shiftKey && document.activeElement === confirmButton.value) {
    event.preventDefault()
    keepButton.value?.focus()
  }
}
</script>

<style scoped>
.notification-confirm-overlay{position:fixed;inset:0;z-index:var(--performance-confirm-z-index);display:grid;place-items:center;padding:var(--spacing-4);box-sizing:border-box;background:var(--performance-dialog-overlay)}.notification-confirm{width:var(--performance-dialog-width);max-width:100%;max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;border-radius:var(--performance-dialog-radius);background:var(--color-bg-card);box-shadow:var(--performance-dialog-shadow);color:var(--color-text-primary);font:400 var(--font-size-md)/22px var(--font-sans)}.notification-confirm__header{padding:var(--performance-dialog-padding)}.notification-confirm__title{display:flex;align-items:center;gap:var(--spacing-4)}.notification-confirm__title svg{flex:none;color:var(--color-warning)}.notification-confirm__title h2{margin:0;font-size:var(--font-size-lg);font-weight:600;line-height:24px}.notification-confirm__header p{margin:var(--spacing-2) 0 0 40px;font-size:var(--font-size-md);line-height:22px}.notification-confirm__footer{display:flex;justify-content:flex-end;gap:var(--performance-dialog-footer-gap);padding:0 var(--performance-dialog-padding) var(--performance-dialog-padding)}.notification-confirm__footer button{min-width:var(--performance-button-min-width);height:var(--performance-button-height);padding:4px var(--performance-button-padding-x);border-radius:var(--performance-button-radius);font:var(--performance-button-font-weight) var(--performance-button-font-size)/var(--performance-button-line-height) var(--font-sans);cursor:pointer;transition:color var(--duration-fast) var(--ease-standard),background-color var(--duration-fast) var(--ease-standard),border-color var(--duration-fast) var(--ease-standard)}.notification-confirm__keep{border:1px solid var(--performance-button-secondary-border);background:var(--performance-button-secondary-hover-background);color:var(--performance-button-secondary-text)}.notification-confirm__keep:hover:not(:disabled){background:var(--color-border-light)}.notification-confirm__confirm{border:1px solid var(--performance-button-primary-hover-background);background:var(--performance-button-primary-hover-background);color:var(--performance-button-primary-text)}.notification-confirm__confirm:hover:not(:disabled){border-color:var(--performance-button-primary-active-background);background:var(--performance-button-primary-active-background)}.notification-confirm__footer button:disabled{cursor:not-allowed;opacity:.6}.notification-confirm__footer button:focus-visible{outline:0;box-shadow:var(--performance-button-focus-ring)}
</style>
