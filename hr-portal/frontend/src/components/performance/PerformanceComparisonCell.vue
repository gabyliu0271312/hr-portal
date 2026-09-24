<template>
  <div
    class="performance-comparison-cell"
    :class="{ clickable: count > 0, [`heat-${heatLevel}`]: count > 0 && heatLevel }"
    :tabindex="count > 0 ? 0 : undefined"
    :aria-label="label"
  >
    <template v-if="count > 0">
      <span>{{ percent }}%</span>
      <span>{{ count }}</span>
    </template>
    <span v-else class="performance-comparison-cell__zero">--</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  count: number
  percent: string
  heatLevel?: 1 | 2 | 3
  label: string
}>()
</script>

<style scoped>
.performance-comparison-cell { position: relative; z-index: 0; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; height: 55px; padding: 5px 12px; border-bottom: 1px solid #eff0f1; box-sizing: border-box; color: #133c9a; font-variant-numeric: tabular-nums; line-height: 22px; text-align: right; }
.performance-comparison-cell.clickable { cursor: pointer; }
.performance-comparison-cell.clickable:focus-visible { z-index: 3; outline: 2px solid #3370ff; outline-offset: -2px; }
.performance-comparison-cell.heat-1 { background: #e1eaff; }
.performance-comparison-cell.heat-2 { background: #bacefd; }
.performance-comparison-cell.heat-3 { background: #82a7fc; color: #fff; }
.performance-comparison-cell__zero { color: #8f959e; }
</style>
