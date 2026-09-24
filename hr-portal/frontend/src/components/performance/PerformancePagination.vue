<template>
  <nav class="performance-pagination" :aria-label="ariaLabel">
    <button type="button" aria-label="上一页" :disabled="page <= 1" @click="changePage(page - 1)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16.314 3.515-.707-.707a1 1 0 0 0-1.414 0l-7.779 7.778a2 2 0 0 0 0 2.829l7.779 7.778a1 1 0 0 0 1.414 0l.707-.707a1 1 0 0 0 0-1.414L9.243 12l7.07-7.072a1 1 0 0 0 0-1.414Z" fill="currentColor" /></svg>
    </button>
    <button class="current-page" type="button" aria-current="page">{{ page }}</button>
    <button type="button" aria-label="下一页" :disabled="page >= pageCount" @click="changePage(page + 1)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7.586 20.486.707.707a1 1 0 0 0 1.414 0l7.778-7.778a2 2 0 0 0 0-2.829L9.707 2.808a1 1 0 0 0-1.414 0l-.707.707a1 1 0 0 0 0 1.414l7.07 7.072-7.07 7.07a1 1 0 0 0 0 1.415Z" fill="currentColor" /></svg>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ page: number; pageSize: number; total: number; ariaLabel?: string }>(), { ariaLabel: '分页' })
const emit = defineEmits<{ 'page-change': [page: number] }>()
const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

function changePage(page: number) {
  if (page >= 1 && page <= pageCount.value && page !== props.page) emit('page-change', page)
}
</script>

<style scoped>
.performance-pagination{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-height:28px;margin-top:10px;color:#1f2329;font-size:14px}.performance-pagination button{display:inline-grid;place-items:center;width:28px;height:28px;padding:0;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;cursor:pointer}.performance-pagination button:disabled{color:#bbbfc4;cursor:not-allowed}.performance-pagination svg{width:12px;height:12px}.performance-pagination .current-page{border-color:#1456f0;color:#1456f0;cursor:default}
</style>
