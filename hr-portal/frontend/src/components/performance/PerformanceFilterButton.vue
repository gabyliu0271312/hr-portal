<template>
  <button class="filter-button" type="button" @click="emit('click')">
    <span class="filter-icon" aria-hidden="true"><FilterOutlinedIcon /></span>
    <span>筛选</span>
  </button>
</template>

<script setup lang="ts">
import FilterOutlinedIcon from './FilterOutlinedIcon.vue'

const emit = defineEmits<{
  click: []
}>()
</script>

<style scoped>
.filter-button { display: flex; position: relative; justify-content: center; align-items: center; min-width: 80px; padding: 4px 11px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 400; line-height: 22px; text-align: center; white-space: nowrap; transition: color 0.1s ease-in, background-color 0.1s ease-in, border-color 0.1s ease-in; }
.filter-button:hover { background: #f2f3f5; border-color: #d0d3d6; color: #1f2329; }
.filter-button:active { background: #eff0f1; border-color: #d0d3d6; color: #1f2329; }
.filter-icon { display: block; flex: 0 0 14px; width: 14px; height: 14px; margin-right: 4px; }
.filter-icon svg { width: 100%; height: 100%; }
</style>
