<template>
  <div v-if="visible" class="configured-card-action-toolbar" role="toolbar" aria-label="卡片操作" @pointerdown.stop>
    <div class="configured-card-action-toolbar__surface captured-actions">
      <PerformanceIconButton icon="SpaceUpOutlined" label="Move up" :disabled="index === 0" @click.stop="$emit('move-up')" />
      <PerformanceIconButton icon="SpaceDownOutlined" label="Move down" :disabled="index === count - 1" @click.stop="$emit('move-down')" />
      <PerformanceIconButton icon="EditOutlined" label="Edit content" @click.stop="$emit('edit')" />
      <PerformanceIconButton icon="DeleteTrashOutlined" label="Delete content" @click.stop="$emit('delete')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import PerformanceIconButton from './PerformanceIconButton.vue'

defineProps<{ visible: boolean; index: number; count: number }>()
defineEmits<{ 'move-up': []; 'move-down': []; edit: []; delete: [] }>()
</script>

<style scoped>
.configured-card-action-toolbar {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 3;
  width: 112px;
  height: 40px;
  padding-bottom: 8px;
  box-sizing: border-box;
  transform: translateY(-40px);
  background: transparent;
}

.configured-card-action-toolbar__surface {
  display: flex;
  align-items: center;
  gap: 0;
  width: 112px;
  height: 32px;
  padding: 4px 8px;
  box-sizing: border-box;
  background: rgba(31, 35, 41, 0.8);
  border-radius: 4px;
}

.configured-card-action-toolbar__surface :deep(.performance-icon-button) {
  color: #fff;
}

.configured-card-action-toolbar__surface :deep(.performance-icon-button:hover),
.configured-card-action-toolbar__surface :deep(.performance-icon-button:focus-visible),
.configured-card-action-toolbar__surface :deep(.performance-icon-button.is-active) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.configured-card-action-toolbar__surface :deep(.performance-icon-button:disabled),
.configured-card-action-toolbar__surface :deep(.performance-icon-button.is-disabled) {
  color: #fff;
}
</style>
