<template>
  <div v-if="railOnly" class="performance-condition-logic-group__rail" aria-hidden="true"><span></span><span>{{ operator }}</span><span></span></div>
  <div v-else class="performance-condition-logic-group">
    <div v-if="count > 1" class="performance-condition-logic-group__rail" aria-hidden="true"><span></span><span>{{ operator }}</span><span></span></div>
    <div class="performance-condition-logic-group__rows">
      <template v-for="index in count" :key="index"><slot :index="index - 1" /></template>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ count: number; operator: '且' | '或'; railOnly?: boolean }>()
</script>

<style scoped>
.performance-condition-logic-group{display:flex;align-items:stretch;min-width:0}.performance-condition-logic-group__rows{flex:1;min-width:0}.performance-condition-logic-group__rail{display:flex;width:20px;flex:0 0 20px;flex-direction:column;align-items:center;align-self:stretch;margin-right:8px;padding:6px 0;box-sizing:border-box;color:var(--color-text-primary,#1f2329);font:400 14px/22px var(--font-sans)}.performance-condition-logic-group__rail span:first-child,.performance-condition-logic-group__rail span:last-child{width:7px;min-height:0;flex:1;margin-left:7px;border-left:1px solid var(--color-border,#d0d3d6)}.performance-condition-logic-group__rail span:nth-child(2){margin:2px 0}.performance-condition-logic-group__rail span:first-child{border-top:1px solid var(--color-border,#d0d3d6);border-radius:4px 0 0}.performance-condition-logic-group__rail span:last-child{border-bottom:1px solid var(--color-border,#d0d3d6);border-radius:0 0 0 4px}
</style>
