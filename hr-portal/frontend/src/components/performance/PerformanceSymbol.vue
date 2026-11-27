<script setup lang="ts">
withDefaults(defineProps<{ name: 'FilelinkSaveOutlined' | 'ListCheckBoldOutlined'; size?: number }>(), { size: 12 })
const paths = {
  FilelinkSaveOutlined: 'M6 4H4.665v15.323h14.59V8.415a1 1 0 0 0-.291-.706l-2.661-3.415A1 1 0 0 0 15.595 4H15.5v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4ZM4.665 2H16.19a2 2 0 0 1 1.416.588l3.065 3.82a2 2 0 0 1 .584 1.412v11.503c0 1.03-.805 2-2 2H4.635c-1.085 0-1.97-.951-1.97-2V4c0-1.064.835-2 2-2ZM12 10h1.5V4H8v6h2V7.67a1 1 0 0 1 2 0V10Z',
  ListCheckBoldOutlined: 'M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z',
}
</script>

<template>
  <svg class="performance-symbol" :width="size" :height="size" viewBox="0 0 24 24" fill="none" :data-icon="name" aria-hidden="true"><path :d="paths[name]" fill="currentColor" /></svg>
</template>

<style scoped>
.performance-symbol{display:inline-block;flex:none;vertical-align:middle}
</style>
