<template>
  <button class="preview-close-button" type="button" aria-label="关闭预览" @click="$emit('close')">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" data-icon="CloseOutlined" aria-hidden="true">
      <path d="M20.778 20.778a1 1 0 0 0 0-1.414L13.414 12l7.364-7.364a1 1 0 0 0-1.414-1.414L12 10.586 4.636 3.222a1 1 0 0 0-1.414 1.414L10.586 12l-7.364 7.364a1 1 0 1 0 1.414 1.414L12 13.414l7.364 7.364a1 1 0 0 0 1.414 0Z" fill="currentColor" />
    </svg>
  </button>
</template>

<script setup lang="ts">
defineEmits<{ close: [] }>()
</script>

<style scoped>
.preview-close-button { position: absolute; top: 22px; right: 20px; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 4px; box-sizing: border-box; border: 0; border-radius: 6px; background: transparent; color: #646a73; cursor: pointer; }
.preview-close-button:hover,.preview-close-button:focus-visible { background: #eff0f1; color: #3370ff; outline: 0; }
.preview-close-button svg { display: block; flex: 0 0 20px; width: 20px; height: 20px; }
</style>
