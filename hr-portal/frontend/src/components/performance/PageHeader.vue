<script setup lang="ts">
import SpaceLeftOutlinedIcon from './SpaceLeftOutlinedIcon.vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ back: [] }>()
</script>

<template>
  <header class="full-screen-modal-header">
    <div class="full-screen-modal-header-left">
      <button class="full-screen-modal-header-back" type="button" @click="emit('back')">
        <SpaceLeftOutlinedIcon class="full-screen-modal-header-back-icon" />
        <span class="full-screen-modal-header-back-text">返回</span>
      </button>
      <span class="full-screen-modal-header-gap" aria-hidden="true"></span>
      <span class="full-screen-modal-header-title">{{ title }}</span>
      <span class="full-screen-modal-header-subtitle"><slot name="subtitle" /></span>
    </div>
    <div class="full-screen-modal-header-right">
      <div class="full-screen-modal-header-actions"><slot name="actions" /></div>
    </div>
  </header>
</template>

<style scoped>
.full-screen-modal-header {
  position: absolute;
  inset: 0 0 auto;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  height: var(--layout-topbar-height);
  padding: 0 var(--spacing-5) 0 var(--spacing-4);
  box-sizing: border-box;
  background: var(--color-surface-card);
  border-bottom: .666667px solid var(--color-line-divider);
}
.full-screen-modal-header-left {
  display: flex;
  align-items: center;
  min-width: 0;
  height: var(--performance-header-inner-height);
}
.full-screen-modal-header-back {
  width: var(--performance-header-back-width);
  height: var(--performance-header-inner-height);
  display: flex;
  flex: 0 0 var(--performance-header-back-width);
  align-items: center;
  padding: 2px 4px;
  box-sizing: border-box;
  border: 0;
  border-radius: var(--performance-control-radius);
  background: transparent;
  color: var(--color-text-primary);
  font: var(--performance-header-title-weight) var(--performance-header-title-size)/var(--performance-header-title-line-height) var(--font-sans);
  cursor: pointer;
}
.full-screen-modal-header-back:hover {
  background: var(--color-line-divider);
}
.full-screen-modal-header-back:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.full-screen-modal-header-back-icon {
  width: var(--performance-header-icon-size);
  height: var(--performance-header-icon-size);
  display: block;
  flex: 0 0 var(--performance-header-icon-size);
  color: var(--color-text-primary);
}
.full-screen-modal-header-back-text {
  display: block;
  margin-left: var(--spacing-2);
  line-height: var(--performance-header-title-line-height);
}
.full-screen-modal-header-gap {
  width: 1px;
  height: var(--performance-header-divider-height);
  flex: 0 0 1px;
  margin: 0 var(--spacing-4) 0 var(--spacing-3);
  background: var(--color-line-divider);
}
.full-screen-modal-header-title {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-primary);
  font: var(--performance-header-title-weight) var(--performance-header-title-size)/var(--performance-header-title-line-height) var(--font-sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.full-screen-modal-header-subtitle {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}
.full-screen-modal-header-subtitle:empty {
  display: none;
}
.full-screen-modal-header-right {
  height: var(--performance-control-height);
  display: flex;
  flex: 1;
  align-items: center;
}
.full-screen-modal-header-actions {
  height: var(--performance-control-height);
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: flex-end;
  gap: var(--performance-header-action-gap);
}
</style>

