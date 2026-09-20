<script setup lang="ts">
import AddOutlinedIcon from './AddOutlinedIcon.vue'

withDefaults(defineProps<{
  variant?: 'icon' | 'text'
  label?: string
  disabled?: boolean
}>(), {
  variant: 'text',
  label: '新建',
  disabled: false,
})

defineEmits<{ click: [] }>()
</script>

<template>
  <button
    class="performance-create-button"
    :class="`is-${variant}`"
    type="button"
    :aria-label="variant === 'icon' ? `新建${label}` : undefined"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <AddOutlinedIcon class="create-icon" />
    <span v-if="variant === 'text'">{{ label }}</span>
  </button>
</template>

<style scoped>
.performance-create-button { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; height: 32px; padding: 4px 11px; border: 1px solid #3370ff; border-radius: 6px; background: #3370ff; color: #fff; font: inherit; font-size: 14px; line-height: 22px; cursor: pointer; }
.performance-create-button:hover { background: #245bdb; border-color: #245bdb; }
.performance-create-button:disabled { background: #f2f3f5; border-color: #f2f3f5; color: #bbbfc4; cursor: not-allowed; }
.performance-create-button.is-icon { width: 32px; padding: 0; border-color: #d0d3d6; background: #fff; color: #1f2329; }
.performance-create-button.is-icon:hover { background: #f5f6f7; border-color: #8f959e; }
.create-icon { width: 14px; height: 14px; }
</style>
