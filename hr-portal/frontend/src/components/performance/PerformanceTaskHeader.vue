<template>
  <UiPageHeader :title="title" @back="emit('back')">
    <template #subtitle><span v-if="description" class="performance-task-header-description" :title="description">{{ description }}</span></template>
    <template #actions><slot name="actions" /></template>
  </UiPageHeader>
</template>

<script setup lang="ts">
import UiPageHeader from '../ui/UiPageHeader.vue'

defineProps<{ title: string; description?: string }>()
const emit = defineEmits<{ back: [] }>()
</script>

<style scoped>
.performance-task-header-description { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--performance-settings-text-secondary); font: 400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans); }
</style>
