<template>
  <div class="menu-entry">
    <div
      class="admin-menu-item has-expand"
      :aria-expanded="expanded"
      role="button"
      tabindex="0"
      @click="activate"
      @keydown.enter.prevent="activate"
      @keydown.space.prevent="activate"
    >
      <el-icon><component :is="icon" /></el-icon>
      <span class="menu-label">{{ label }}</span>
      <PerformanceExpandButton
        variant="navigation"
        icon-variant="regular"
        :label="`展开或收起${label}`"
        :expanded="expanded"
        @click.stop
        @toggle="toggle"
      />
    </div>
    <div v-if="expanded" class="admin-submenu" :aria-label="`${label}子菜单`">
      <button
        v-for="item in items"
        :key="item.key"
        class="admin-submenu-item"
        :class="{ active: activeKey === item.key }"
        :aria-current="activeKey === item.key ? 'page' : undefined"
        type="button"
        @click="selectItem(item.key)"
      >{{ item.label }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import PerformanceExpandButton from './PerformanceExpandButton.vue'
import type { PerformanceAdminSubmenuItem } from '@/utils/performanceAdminNavigation'

defineProps<{
  label: string
  icon: Component
  expanded: boolean
  activeKey: string
  items: PerformanceAdminSubmenuItem[]
}>()

const emit = defineEmits<{
  activate: []
  toggle: []
  select: [key: string]
}>()

function activate() {
  emit('activate')
}

function toggle() {
  emit('toggle')
}

function selectItem(key: string) {
  emit('select', key)
}
</script>

<style scoped>
.menu-entry { width: 232px; }
.admin-menu-item { box-sizing: border-box; display: flex; align-items: flex-start; gap: 12px; width: 100%; min-height: 41px; margin: 0; padding: 10px 0 10px 20px; border: 0; border-radius: 0; background: transparent; color: #1f2329; cursor: pointer; font: inherit; font-size: 14px; line-height: 21px; text-align: left; }
.admin-menu-item.has-expand { padding-right: 0; }
.admin-menu-item :deep(.el-icon) { width: 18px; height: 18px; margin-top: 2px; color: #646a73; }
.admin-menu-item :deep(.el-icon svg[data-icon='EvaluationQuestionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='MetricManagementOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='PermissionsOutlined']), .admin-menu-item :deep(.el-icon svg[data-icon='SystemSettingsOutlined']) { width: 18px; height: 18px; }
.admin-menu-item:hover { background: rgba(31, 35, 41, .08); color: #3370ff; }
.admin-submenu { display: grid; }
.admin-submenu-item { position: relative; width: 100%; height: 41px; padding: 10px 20px 10px 42px; border: 0; background: transparent; color: #1f2329; cursor: pointer; font: inherit; font-size: 14px; line-height: 21px; text-align: left; }
.admin-submenu-item:hover { background: rgba(31, 35, 41, .08); color: #3370ff; }
.admin-submenu-item.active { background: #e1eaff; color: #3370ff; }
.admin-submenu-item.active::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: #3370ff; }
.admin-menu-item:focus-visible, .admin-submenu-item:focus-visible { outline: 2px solid #3370ff; outline-offset: -2px; }
</style>
