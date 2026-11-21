<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import UiButton from '../ui/UiButton.vue'
import PerformancePopover from './PerformancePopover.vue'

defineProps<{ modelValue: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const anchor = ref<HTMLElement | null>(null)
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function show() { clearTimeout(timer); visible.value = true }
function hide() {
  clearTimeout(timer)
  const delay = anchor.value ? parseFloat(getComputedStyle(anchor.value).getPropertyValue('--performance-people-group-hover-delay')) : 100
  timer = setTimeout(() => { visible.value = false }, delay)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <span ref="anchor" class="people-grouping" @mouseenter="show" @mouseleave="hide" @focusin="show" @focusout="hide">
    <UiButton variant="text" class="people-grouping__button" :class="{ 'is-active': modelValue }" :disabled="disabled" :aria-expanded="visible" aria-label="分组" @click="show">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="ArrangeOutlined"><path d="M2.467 11.5a1 1 0 0 1 1.366-.366L12 15.846l8.167-4.712a1 1 0 0 1 1 1.732l-8.534 4.923a1.267 1.267 0 0 1-1.266 0l-8.534-4.923a1 1 0 0 1-.366-1.366ZM2.453 16.193a1 1 0 0 1 1.354-.407L12 20.198l8.192-4.412a1 1 0 1 1 .949 1.761l-8.54 4.599a1.267 1.267 0 0 1-1.202 0l-8.54-4.599a1 1 0 0 1-.406-1.354ZM12 4.267l5.942 3.169L12 11 6.058 7.436 12 4.266Zm.502-2a1.067 1.067 0 0 0-1.004 0L2.83 6.89a.533.533 0 0 0-.023.928l8.643 5.186c.338.203.76.203 1.098 0l8.643-5.186a.533.533 0 0 0-.023-.928l-8.667-4.622Z" fill="currentColor" /></svg>
      <span>分组</span>
    </UiButton>
    <PerformancePopover :visible="visible && !disabled" :anchor="anchor" width="auto" side="bottom" align="end" role="dialog" name="people-grouping-menu" @mouseenter="show" @mouseleave="hide" @close="visible = false">
      <UiButton variant="text" class="people-grouping__button" :class="{ 'is-active': modelValue }" :aria-pressed="modelValue" @click="emit('update:modelValue', !modelValue)">按上级分组</UiButton>
    </PerformancePopover>
  </span>
</template>

<style scoped>
.people-grouping { display: inline-flex; }
.people-grouping__button { height: auto; padding-block: var(--performance-people-group-button-padding-y); color: var(--color-text-primary); }
.people-grouping__button:hover:not(:disabled), .people-grouping__button:active:not(:disabled) { background: var(--performance-icon-button-hover-background); }
.people-grouping__button.is-active { color: var(--color-primary); }
.people-grouping__button :deep(.performance-button__content) { gap: var(--spacing-1); }
.people-grouping__button svg { width: var(--font-size-md); height: var(--font-size-md); }
</style>
