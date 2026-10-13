<template>
  <section class="notification-radio-section" :aria-busy="disabled" @click.capture="blockClick" @keydown.capture="blockKeydown">
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <PerformanceRadioGroup
      :model-value="selected"
      :options="options"
      :name="name"
      :aria-label="title"
      :gap="8"
      direction="vertical"
      :aria-disabled="disabled"
      @update:model-value="updateSelected"
    />
  </section>
</template>

<script setup lang="ts">
import PerformanceRadioGroup, { type PerformanceRadioOption } from './PerformanceRadioGroup.vue'

const props = defineProps<{
  title: string
  description: string
  selected: string
  disabled?: boolean
  name: string
  options: PerformanceRadioOption[]
}>()

const emit = defineEmits<{ (event: 'update:selected', value: string): void }>()

function updateSelected(value: string) {
  if (!props.disabled) emit('update:selected', value)
}

function blockClick(event: MouseEvent) {
  if (!props.disabled) return
  event.preventDefault()
  event.stopPropagation()
}

function blockKeydown(event: KeyboardEvent) {
  if (!props.disabled || ![' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
}
</script>

<style scoped>
.notification-radio-section h3{margin:0;color:#1f2329;font-size:14px;font-weight:600;line-height:22px}
.notification-radio-section p{margin:0;color:#646a73;font-size:14px;line-height:22px}
.notification-radio-section :deep(.performance-radio-group){margin-top:8px}
.notification-radio-section :deep(.radio-label){white-space:normal}
</style>
