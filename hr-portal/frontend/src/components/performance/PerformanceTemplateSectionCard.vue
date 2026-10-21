<template>
  <div class="template-section" data-ui-flow-id="TemplateSectionCard">
    <PerformanceContentSelectionFrame variant="root" :selected="selected" class="template-section__heading" :role="selectable ? 'button' : undefined" :tabindex="selectable ? 0 : undefined" :aria-pressed="selectable ? selected : undefined" :aria-label="selectable ? '选择页面标题' : undefined" @click="selectable && $emit('select')" @keydown.enter.prevent="selectable && $emit('select')" @keydown.space.prevent="selectable && $emit('select')"><div class="template-section__title">{{ title }}</div></PerformanceContentSelectionFrame>
    <PerformanceTemplateOperateBar v-if="actions.length" :actions="actions" @action="$emit('action', $event)" />
  </div>
</template>
<script setup lang="ts">
import PerformanceTemplateOperateBar from './PerformanceTemplateOperateBar.vue'
import PerformanceContentSelectionFrame from './PerformanceContentSelectionFrame.vue'
withDefaults(defineProps<{ title: string; actions: Array<{ key: string; label: string }>; selectable?: boolean; selected?: boolean }>(), { selectable: false, selected: false })
defineEmits<{ action: [key: string]; select: [] }>()
</script>
<style scoped>
.template-section{position:relative;z-index:10;width:var(--performance-content-width);max-width:100%;overflow:hidden;border-radius:4px}.template-section__heading{position:relative;height:58px;margin-bottom:12px;padding:16px 24px;box-sizing:border-box;border-radius:4px;background:#fff;color:#1f2329;font:600 18px/26px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.template-section__title{position:relative;z-index:1}.template-section__heading[role=button]{cursor:pointer}.template-section__heading:focus-visible:not(.is-selected){outline:var(--performance-content-hover-outline);outline-offset:var(--performance-content-hover-outline-offset)}
</style>
