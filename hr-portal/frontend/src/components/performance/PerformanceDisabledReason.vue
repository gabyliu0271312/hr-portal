<script setup lang="ts">
withDefaults(defineProps<{
  disabled?: boolean
  reason?: string
}>(), {
  disabled: false,
  reason: '',
})
</script>

<template>
  <el-tooltip v-if="disabled && reason" :content="reason" placement="top">
    <span class="performance-disabled-reason" data-disabled-reason><slot /></span>
  </el-tooltip>
  <span v-else class="performance-disabled-reason is-enabled"><slot /></span>
</template>

<style scoped>
.performance-disabled-reason { display: inline-flex; align-items: center; cursor: not-allowed; }
.performance-disabled-reason.is-enabled { cursor: inherit; }
</style>
