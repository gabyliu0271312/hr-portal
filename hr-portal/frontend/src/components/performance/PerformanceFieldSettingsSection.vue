<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue'
import UiSurface from '@/components/ui/UiSurface.vue'

defineProps<{ title: string; actionLabel?: string }>()
defineEmits<{ edit: [] }>()
</script>

<template>
  <UiSurface class="field-settings-section" radius="all" min-width="0" shadow>
    <section :aria-label="title">
      <div class="field-settings-section__header">
        <div class="field-settings-section__intro">
          <h2>{{ title }}</h2>
          <div class="field-settings-section__description"><slot name="description" /></div>
        </div>
        <UiButton v-if="actionLabel" :aria-label="actionLabel" @click="$emit('edit')">设置</UiButton>
      </div>
      <div class="field-settings-section__body"><slot /></div>
    </section>
  </UiSurface>
</template>

<style scoped>
.field-settings-section { color: var(--color-text-primary); }
.field-settings-section__header { display: flex; align-items: flex-start; gap: var(--spacing-3); }
.field-settings-section__intro { flex: 1; min-width: 0; }
.field-settings-section h2 { margin: 0; font-size: var(--font-size-lg); font-weight: 600; line-height: var(--spacing-6); }
.field-settings-section__description { color: var(--performance-settings-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-settings-help-line-height); overflow-wrap: anywhere; }
.field-settings-section__body { margin-top: var(--spacing-3); }
</style>
