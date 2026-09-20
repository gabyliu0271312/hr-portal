<script setup lang="ts">
withDefaults(defineProps<{ submitting?: boolean }>(), { submitting: false })

const emit = defineEmits<{
  submit: []
  preview: []
  cancel: []
}>()
</script>

<template>
  <footer class="full-screen-modal-footer">
    <slot>
      <el-button type="primary" class="full-screen-modal-footer-button" :loading="submitting" @click="emit('submit')">提交</el-button>
      <el-button class="full-screen-modal-footer-button preview-button" @click="emit('preview')">预览</el-button>
      <el-button class="full-screen-modal-footer-button cancel-button" @click="emit('cancel')">取消</el-button>
    </slot>
  </footer>
</template>

<style scoped>
.full-screen-modal-footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
  height: 48px;
  display: flex;
  align-items: center;
  padding: 8px 0 8px max(0px, calc((100% - 800px) / 2));
  box-sizing: border-box;
  background: #fff;
}
.full-screen-modal-footer-button {
  width: 80px;
  min-width: 80px;
  height: 32px;
  margin: 0 12px 0 0;
  padding: 4px 11px;
  box-sizing: border-box;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
.full-screen-modal-footer :deep(.el-button + .el-button) {
  margin-left: 0;
}
.preview-button {
  color: #3370ff;
  border-color: #3370ff;
}
.cancel-button {
  color: #1f2329;
  border-color: #d0d3d6;
}
</style>
