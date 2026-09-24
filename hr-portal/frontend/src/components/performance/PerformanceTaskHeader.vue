<template>
  <PageHeader :title="title" @back="emit('back')">
    <template #actions><slot name="actions" /></template>
  </PageHeader>
</template>

<script setup lang="ts">
import PageHeader from './PageHeader.vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ back: [] }>()
</script>
