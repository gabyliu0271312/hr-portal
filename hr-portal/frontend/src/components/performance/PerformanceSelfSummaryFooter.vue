<template>
  <footer class="self-summary-footer">
    <button class="primary" type="button" :disabled="submitting || !submitAllowed || !editable" @click="$emit('submit')">{{ submitting ? '提交中…' : '提交' }}</button>
    <button type="button" :disabled="submitting" @click="$emit('cancel')">取消</button>
    <span role="status">{{ message }}</span>
  </footer>
</template>

<script setup lang="ts">
defineProps<{ submitting: boolean; submitAllowed: boolean; editable: boolean; message: string }>()
defineEmits<{ submit: []; cancel: [] }>()
</script>

<style scoped>
.self-summary-footer{position:fixed;right:0;bottom:0;left:0;z-index:99;display:flex;width:100%;height:63px;min-height:63px;flex:none;align-items:center;padding:0 20px;box-sizing:border-box;background:#fff;box-shadow:0 -1px 0 rgba(31,35,41,.08)}.self-summary-footer button{display:inline-flex;min-width:80px;height:32px;align-items:center;justify-content:center;margin-right:12px;padding:4px 11px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;cursor:pointer}.self-summary-footer button.primary{border-color:#3370ff;background:#3370ff;color:#fff}.self-summary-footer button:disabled{cursor:not-allowed;opacity:.5}.self-summary-footer span{color:#8f959e;font-size:14px;line-height:21px}
</style>
