<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'
import UiButton from '../ui/UiButton.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'

const props = withDefaults(defineProps<{
  allowed: boolean
  op?: 'V' | 'C' | 'U' | 'D' | 'E'
  disabled?: boolean
  danger?: boolean
  variant?: 'primary' | 'secondary' | 'text' | 'danger'
  ariaLabel?: string
  icon?: string
  iconVariant?: 'default' | 'outlined' | 'contextual' | 'menu'
}>(), {
  op: 'U',
  disabled: false,
  danger: false,
  variant: 'text',
  ariaLabel: undefined,
})

const userStore = useUserStore()
const hasPermission = computed(() => props.op === 'V'
  ? userStore.menus.some(menu => menu.code === 'performance.admin')
  : userStore.hasOp('performance.admin', props.op))
const visible = computed(() => props.allowed && hasPermission.value)
const internalDisabled = computed(() => props.disabled || !hasPermission.value)
const buttonVariant = computed(() => props.danger ? 'danger' : props.variant)
</script>

<template>
  <PerformanceIconButton v-if="visible && icon" :icon="icon" :label="ariaLabel || ''" :variant="iconVariant" :disabled="internalDisabled" />
  <UiButton
    v-else-if="visible"
    :variant="buttonVariant"
    :disabled="internalDisabled"
    :aria-label="ariaLabel"
    :title="!hasPermission ? '无权限' : undefined"
  >
    <slot />
  </UiButton>
</template>
