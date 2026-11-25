<template>
  <h3 v-if="items.length === 1" class="matrix-bu-title">{{ items[0].label }} ({{ completed }}/{{ total }})</h3>
  <div v-else class="matrix-bu-tabs" role="tablist" aria-label="BU范围">
    <button v-for="item in tabs" :key="item.value ?? 'all'" type="button" role="tab" :aria-selected="modelValue === item.value" :class="{ active: modelValue === item.value }" @click="emit('update:modelValue', item.value)">
      <span>{{ item.label }}</span><span>({{ item.completed }}/{{ item.total }})</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ modelValue: string | null; items: Array<{ value: string; label: string; completed: number; total: number }>; completed: number; total: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
const tabs = computed(() => [{ value: null, label: '全部', completed: props.completed, total: props.total }, ...props.items])
</script>

<style scoped>
.matrix-bu-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.matrix-bu-tabs { display: flex; min-width: 0; overflow-x: auto; padding: 2px; }
.matrix-bu-tabs button { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 16px; margin-left: -1px; border: 1px solid #d0d3d6; background: #fff; color: #1f2329; font: inherit; font-size: 14px; white-space: nowrap; cursor: pointer; }
.matrix-bu-tabs button:first-child { margin-left: 0; border-radius: 6px 0 0 6px; }
.matrix-bu-tabs button:last-child { border-radius: 0 6px 6px 0; }
.matrix-bu-tabs button.active { position: relative; border-color: #3370ff; color: #3370ff; font-weight: 500; background: #e1eaff; }
.matrix-bu-tabs button:hover { color: #3370ff; }
.matrix-bu-tabs button:focus-visible { position: relative; outline: 2px solid #3370ff; outline-offset: -3px; }
</style>
