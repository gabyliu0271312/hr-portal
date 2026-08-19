<template>
  <div class="template-operate" data-ui-flow-id="TemplateOperate">
    <div v-for="action in actions" :key="action.key" class="template-operate__item">
      <button class="template-operate__button" type="button" :aria-label="action.label" @click="$emit('action', action.key)">
        <span class="template-operate__icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a1 1 0 0 0-1 1v8H3a1 1 0 0 0 0 2h8v8a1 1 0 0 0 2 0v-8h8a1 1 0 0 0 0-2h-8V3a1 1 0 0 0-1-1Z" fill="currentColor" /></svg></span>
        <span>{{ action.label }}</span>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
defineProps<{ actions: Array<{ key: string; label: string }> }>()
defineEmits<{ action: [key: string] }>()
</script>
<style scoped>
.template-operate{display:flex;align-items:center;height:54px;background:#fff}.template-operate__item{display:flex;position:relative;flex:1;align-items:center;justify-content:center;height:54px}.template-operate__item+ .template-operate__item::before{position:absolute;top:16px;bottom:16px;left:0;width:1px;background:rgba(187,191,196,.5);content:''}.template-operate__button{display:inline-flex;align-items:center;justify-content:center;min-width:0;min-height:0;padding:2px 4px;border:0;border-radius:6px;background:transparent;color:#3370ff;font:400 14px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;white-space:nowrap;cursor:pointer;transition:color .1s ease-in}.template-operate__button:hover{background:transparent;color:#245bdb}.template-operate__icon{display:inline-flex;width:14px;height:14px;margin-right:4px;align-items:center;justify-content:center;line-height:0}.template-operate__icon svg{display:block;width:14px;height:14px}
</style>
