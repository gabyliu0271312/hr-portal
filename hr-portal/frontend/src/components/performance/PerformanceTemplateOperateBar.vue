<template>
  <div class="template-operate" data-ui-flow-id="TemplateOperate">
    <div v-for="action in actions" :key="action.key" class="template-operate__item">
      <PerformanceButton variant="text" class="template-operate__button" :aria-label="action.label" @click="$emit('action', action.key)">
        <span class="template-operate__icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a1 1 0 0 0-1 1v8H3a1 1 0 0 0 0 2h8v8a1 1 0 0 0 2 0v-8h8a1 1 0 0 0 0-2h-8V3a1 1 0 0 0-1-1Z" fill="currentColor" /></svg></span>
        <span>{{ action.label }}</span>
      </PerformanceButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import PerformanceButton from './PerformanceButton.vue'

defineProps<{ actions: Array<{ key: string; label: string }> }>()
defineEmits<{ action: [key: string] }>()
</script>

<style scoped>
.template-operate{display:flex;align-items:center;height:54px;background:var(--color-bg-card)}.template-operate__item{display:flex;position:relative;flex:1;align-items:center;justify-content:center;height:54px}.template-operate__item+ .template-operate__item::before{position:absolute;top:16px;bottom:16px;left:0;width:1px;background:var(--color-line-control);content:'';opacity:.5}.template-operate__button{min-width:0;min-height:0;padding:2px var(--spacing-1)}.template-operate__icon{display:inline-flex;width:14px;height:14px;margin-right:var(--spacing-1);align-items:center;justify-content:center;line-height:0}.template-operate__icon svg{display:block;width:14px;height:14px}
</style>
