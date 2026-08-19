<template>
  <div class="workflow-basic-fields">
    <div class="form-row"><div class="form-label"><span>环节名称</span><span class="required-mark">*</span></div><input v-model="node.name" class="form-control" :disabled="locked('name')" /></div>
    <div class="form-row"><div class="form-label">环节描述</div><textarea v-model="node.description" class="form-control form-textarea" :disabled="locked('description')" /></div>
  </div>
</template>

<script setup lang="ts">
import type { PerformanceWorkflowNode } from '@/api/performance'
defineProps<{ node: PerformanceWorkflowNode; locked: (field: string) => boolean }>()
</script>

<style scoped>
.workflow-basic-fields{width:100%;max-width:263.333px}.form-row{margin:0 0 20px}.form-label{display:flex;align-items:baseline;min-height:22px;color:#1f2329;font:600 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.required-mark{margin-left:2px;color:#f54a45;font-family:SimSun,sans-serif;font-weight:400}.form-control{display:block;width:263.333px;max-width:100%;height:32px;margin-top:8px;padding:4px 11px;box-sizing:border-box;border:.666667px solid #d0d3d6;border-radius:6px;outline:none;background:#fff;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.form-textarea{height:97.333px;min-height:97.333px;resize:vertical}.form-control:focus{border-color:#1456f0}
</style>
