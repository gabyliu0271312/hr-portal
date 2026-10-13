<template>
  <div class="performance-template-section" :data-section-id="section.id">
    <header class="template-section-header section-header repeatable-content-header" :class="{ 'template-section-header--readonly': mode === 'readonly' }">
      <div v-if="mode === 'readonly'" class="template-section-title"><span class="template-section-title-line" aria-hidden="true"></span><h2>{{ section.name }}</h2></div>
      <h2 v-else>{{ section.name }}</h2>
      <p v-if="section.description">{{ section.description }}</p>
    </header>
    <div v-for="(instanceKey, index) in instanceKeys" :key="instanceKey" class="template-section-instance repeatable-content-instance" :data-instance-index="index">
      <PerformanceIconButton v-if="section.allow_multiple && editable && instanceKeys.length > 1" class="template-section-remove repeatable-instance-remove" icon="DeleteTrashOutlined" :label="`删除${section.name}${index + 1}`" @click="$emit('remove', index)" />
      <slot :index="index" />
    </div>
    <PerformanceAddAnotherButton v-if="section.allow_multiple && editable" class="template-section-add" @click="$emit('add')" />
  </div>
</template>
<script setup lang="ts">
import type { PerformanceTemplateSection as TemplateSection } from '@/api/performance'
import PerformanceAddAnotherButton from './PerformanceAddAnotherButton.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'

defineProps<{ section: TemplateSection; instanceKeys: string[]; editable: boolean; mode?: 'edit' | 'readonly' }>()
defineEmits<{ add: []; remove: [index: number] }>()
</script>
<style scoped>
.performance-template-section{margin:0 0 32px}.performance-template-section:last-child{margin-bottom:0}.template-section-header{margin-bottom:16px}.template-section-title{display:flex;align-items:flex-start;min-width:0}.template-section-title-line{width:2px;height:14px;flex:0 0 2px;margin:5px 8px 0 0;background:var(--color-primary)}.template-section-header h2{margin:0;color:#1f2329;font-size:16px;font-weight:600;line-height:24px}.template-section-header p{margin:0;color:#646a73;font-size:14px;line-height:22px}.template-section-instance{position:relative}.template-section-instance+.template-section-instance{margin-top:16px}.template-section-remove{position:absolute;top:-1px;right:0;z-index:2;--performance-icon-button-size:24px}.template-section-add{margin-top:4px}
</style>
