<script setup lang="ts">
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'

withDefaults(defineProps<{ showDelete?: boolean }>(), { showDelete: false })
</script>

<template>
  <div class="interval-header" :class="{ 'has-delete': showDelete }" aria-label="分数子区间字段标题">
    <PerformanceRequiredLabel class="interval-header__bounds" label="分数子区间" />
    <PerformanceRequiredLabel class="interval-header__code" label="等级代号" />
    <span class="interval-header__name">等级名称</span>
    <span v-if="showDelete" class="interval-header__delete" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.interval-header { display: grid; grid-template-columns: 276px 8px minmax(0, 1fr) 8px minmax(0, 1fr); align-items: center; width: 100%; margin-bottom: 8px; color: #646a73; font-size: 14px; line-height: 22px; }
.interval-header.has-delete { grid-template-columns: 276px 8px minmax(0, 1fr) 8px minmax(0, 1fr) 4px 24px; }
.interval-header__bounds { grid-column: 1; }
.interval-header__code { grid-column: 3; min-width: 0; white-space: nowrap; }
.interval-header__name { grid-column: 5; min-width: 0; white-space: nowrap; }
.interval-header__delete { grid-column: 7; }
</style>
