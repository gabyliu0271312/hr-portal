<script setup lang="ts">
import PermissionButton from '@/components/PermissionButton.vue'

withDefaults(defineProps<{
  allowed: boolean
  op?: 'V' | 'C' | 'U' | 'D' | 'E'
  disabled?: boolean
  danger?: boolean
  ariaLabel?: string
}>(), {
  op: 'U',
  disabled: false,
  danger: false,
  ariaLabel: undefined,
})
</script>

<template>
  <PermissionButton
    v-if="allowed"
    menu="performance.admin"
    :op="op"
    mode="disable"
    type="text"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :class="{ 'is-danger': danger }"
  >
    <slot />
  </PermissionButton>
</template>
