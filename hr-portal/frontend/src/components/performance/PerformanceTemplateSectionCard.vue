<template>
  <div class="template-section" data-ui-flow-id="TemplateSectionCard">
    <div class="template-section__heading"><div class="template-section__hover-border" aria-hidden="true"></div><div class="template-section__title">{{ title }}</div></div>
    <PerformanceTemplateOperateBar :actions="actions" @action="$emit('action', $event)" />
  </div>
</template>
<script setup lang="ts">
import PerformanceTemplateOperateBar from './PerformanceTemplateOperateBar.vue'
defineProps<{ title: string; actions: Array<{ key: string; label: string }> }>()
defineEmits<{ action: [key: string] }>()
</script>
<style scoped>
.template-section{position:relative;z-index:10;overflow:hidden;border-radius:4px}.template-section__heading{position:relative;height:58px;margin-bottom:12px;padding:16px 24px;box-sizing:border-box;border-radius:4px;background:#fff;color:#1f2329;font:600 18px/26px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.template-section__title{position:relative;z-index:1}.template-section__hover-border{position:absolute;inset:0;z-index:2;box-sizing:border-box;border:.666667px dashed #3370ff;border-radius:4px;opacity:0;pointer-events:none;transition:opacity .1s ease-in}.template-section__heading:hover .template-section__hover-border{opacity:1}
</style>
