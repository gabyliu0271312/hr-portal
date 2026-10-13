<script setup lang="ts">
import { ElDropdown, ElDropdownMenu, ElDropdownItem } from 'element-plus'
import PerformancePermissionButton from './PerformancePermissionButton.vue'

const props = defineProps<{
  canManage: boolean
  started: boolean
  projectName: string
}>()

const emit = defineEmits<{
  (event: 'edit'): void
  (event: 'start'): void
  (event: 'copy'): void
  (event: 'remove'): void
}>()

function run(action: 'edit' | 'start' | 'copy' | 'remove') {
  if (action === 'edit') emit('edit')
  else if (action === 'start') emit('start')
  else if (action === 'copy') emit('copy')
  else emit('remove')
}
</script>

<template>
  <div v-if="props.canManage" class="project-actions">
    <PerformancePermissionButton op="U" :allowed="props.canManage" :aria-label="`编辑${props.projectName}`" @click="run('edit')">
      编辑
    </PerformancePermissionButton>
    <PerformancePermissionButton op="U" :allowed="props.canManage" :disabled="props.started" :aria-label="`启动${props.projectName}`" @click="run('start')">
      启动
    </PerformancePermissionButton>
    <el-dropdown trigger="click" @command="run">
      <PerformancePermissionButton op="V" :allowed="props.canManage" class="more-action" aria-label="更多项目操作">
        ···
      </PerformancePermissionButton>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="copy">复制</el-dropdown-item>
          <el-dropdown-item command="remove">删除</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped>
.project-actions { display: inline-flex; align-items: center; gap: 12px; white-space: nowrap; }
.project-actions button { padding: 0; border: 0; background: transparent; color: #3370ff; font: inherit; line-height: 22px; cursor: pointer; }
.project-actions button:disabled { color: #bbbfc4; cursor: not-allowed; }
.more-action { font-size: 18px !important; letter-spacing: 1px; }
</style>
