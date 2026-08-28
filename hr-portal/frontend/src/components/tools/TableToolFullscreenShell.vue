<script setup lang="ts">
import FullscreenWorkspaceShell, { type WorkspaceStep } from '@/components/layout/FullscreenWorkspaceShell.vue'

export type WorkflowStep = WorkspaceStep

withDefaults(defineProps<{
  title: string
  description?: string
  steps?: WorkflowStep[]
  activeStep?: string
  busy?: boolean
}>(), {
  steps: () => [],
  activeStep: '',
  busy: false,
})

const emit = defineEmits<{
  back: []
  stepChange: [key: string]
}>()
</script>

<template>
  <FullscreenWorkspaceShell
    :title="title"
    :description="description"
    :steps="steps"
    :active-step="activeStep"
    :busy="busy"
    @back="emit('back')"
    @step-change="emit('stepChange', $event)"
  >
    <template #actions><slot name="actions" /></template>
    <slot />
  </FullscreenWorkspaceShell>
</template>
