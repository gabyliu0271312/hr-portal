<template>
  <footer class="performance-drawer-footer">
    <button class="performance-drawer-footer__confirm" type="button" @click="$emit('confirm')">{{ confirmText }}</button>
    <button class="performance-drawer-footer__cancel" type="button" @click="$emit('cancel')">{{ cancelText }}</button>
  </footer>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ confirmText?: string; cancelText?: string }>(), { confirmText: '确定', cancelText: '取消' })
defineEmits<{ confirm: []; cancel: [] }>()
</script>

<style scoped>
.performance-drawer-footer{display:flex;align-items:center;flex:0 0 61px;padding:12px 20px;box-sizing:border-box;border-top:1px solid rgba(31,35,41,.15);background:#fff;box-shadow:0 1px 6px rgba(31,35,41,.12);z-index:1}.performance-drawer-footer button{display:inline-flex;align-items:center;justify-content:center;min-width:80px;height:32px;padding:4px 11px;border-radius:6px;cursor:pointer;font:400 14px/22px inherit}.performance-drawer-footer__confirm{border:1px solid #1456f0;background:#1456f0;color:#fff}.performance-drawer-footer__confirm:active{border-color:#0442d2;background:#0442d2}.performance-drawer-footer__cancel{margin-left:12px;border:1px solid #d0d3d6;background:#fff;color:#1f2329}.performance-drawer-footer__cancel:hover{background:#eff0f1}
</style>
