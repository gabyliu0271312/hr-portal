<template>
  <PerformanceTemplateRenderer mode="edit" :title="title" :sections="sections" :answers="answers" :errors="errors" :editable="editable" @update-answer="(id, value) => $emit('update-answer', id, value)" @queue-save="$emit('queue-save')" @submit="$emit('submit')" />
</template>
<script setup lang="ts">
import type { PerformanceTemplateSection } from '@/api/performance'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'

defineProps<{ title: string; sections: PerformanceTemplateSection[]; answers: Record<string, unknown>; errors: Record<string, string>; editable: boolean }>()
defineEmits<{ 'update-answer': [id: string, value: unknown]; 'queue-save': []; submit: [] }>()
</script>
