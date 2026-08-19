<template>
  <span
    class="performance-executor-tag ud__tag ud__tag-md ud__tag-rect ud__tag-neutral-option"
    :data-executor-type="executor.type"
  >
    <span class="performance-executor-tag__content ud__tag__content">{{ executor.label }}</span>
  </span>
</template>

<script setup lang="ts">
import type { PerformanceExecutorOption } from './performanceExecutorOptions'

defineProps<{ executor: PerformanceExecutorOption }>()
</script>

<style scoped>
.performance-executor-tag{display:inline-flex;align-items:center;overflow:hidden;min-width:0;min-height:24px;max-width:100%;padding:0 6px;box-sizing:border-box;border-radius:4px;background:rgba(31,35,41,.1);color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;white-space:nowrap;transition:.2s cubic-bezier(.34,.69,.1,1);cursor:text}
.performance-executor-tag__content{display:block;overflow:hidden;min-width:0;box-sizing:border-box;color:inherit;font:inherit;line-height:22px;text-overflow:ellipsis;white-space:nowrap;word-break:keep-all}
</style>
