<template>
  <button type="button" class="performance-sort-header" :aria-label="`${label}，${orderLabel}，点击切换排序`" @click.stop="emit('click')">
    <span class="sort-header-label"><slot>{{ label }}</slot></span>
    <span class="sort-header-icons" aria-hidden="true">
      <svg viewBox="0 0 24 24" data-icon="ExpandUpFilled" :class="{ active: order === 'ascending' }"><path d="M11.228 5.376a1 1 0 0 1 1.559 0l8.305 10.334a1 1 0 0 1-.78 1.626H3.703a1 1 0 0 1-.78-1.626l8.306-10.334Z" fill="currentColor" /></svg>
      <svg viewBox="0 0 24 24" data-icon="ExpandDownFilled" :class="{ active: order === 'descending' }"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" /></svg>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ label: string; order?: 'ascending' | 'descending' | null }>()
const emit = defineEmits<{ click: [] }>()
const orderLabel = computed(() => props.order === 'ascending' ? '升序' : props.order === 'descending' ? '降序' : '未排序')
</script>

<style scoped>
.performance-sort-header { display: flex; align-items: center; justify-content: space-between; width: 100%; min-width: 0; height: 30px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; font-size: 14px; font-weight: 500; line-height: 22px; text-align: right; cursor: pointer; }
.sort-header-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sort-header-icons { display: flex; flex: 0 0 10px; flex-direction: column; width: 10px; height: 17px; margin-left: 8px; color: #646a73; }
.sort-header-icons svg { display: block; flex: 0 0 10px; width: 10px; height: 10px; }
.sort-header-icons svg + svg { margin-top: -3px; }
.sort-header-icons .active { color: var(--color-primary, #3370ff); }
.performance-sort-header:focus-visible { outline: 2px solid var(--color-primary, #3370ff); outline-offset: 2px; }
</style>
