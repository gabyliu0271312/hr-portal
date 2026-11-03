<script setup lang="ts">
import SearchInput from '@/components/common/SearchInput.vue'

defineProps<{
  modelValue: string
  placeholder: string
  width?: string
  variant?: 'default' | 'compact'
  ariaLabel?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: []
  clear: []
}>()
</script>

<template>
  <SearchInput
    :model-value="modelValue"
    :placeholder="placeholder"
    :width="width"
    :variant="variant"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', $event)"
    @search="emit('search')"
    @clear="emit('clear')"
  />
</template>
