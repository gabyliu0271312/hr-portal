<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElDropdown, ElDropdownMenu, ElDropdownItem } from 'element-plus'
import PerformancePermissionButton from './PerformancePermissionButton.vue'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'

const props = withDefaults(defineProps<{
  canManage: boolean
  canCopy?: boolean
  started: boolean
  projectName: string
  status?: string
  configurationCompleted?: boolean
  startBlockedReason?: string
}>(), { canCopy: true, status: 'DRAFT', configurationCompleted: false, startBlockedReason: '' })

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

const startDisabledReason = computed(() => {
  if (props.status === 'DRAFT' && !props.configurationCompleted) return '项目未配置完成，无法启动'
  if (props.status === 'DRAFT' && props.startBlockedReason) return props.startBlockedReason.split('\n').filter(Boolean)
  return ''
})
const showStartButton = computed(() => props.status === 'DRAFT')
const moreOpen = ref(false)
</script>

<template>
  <div v-if="props.canManage" class="project-actions">
    <PerformancePermissionButton op="U" :allowed="props.canManage" :aria-label="`编辑${props.projectName}`" @click="run('edit')">
      编辑
    </PerformancePermissionButton>
    <PerformanceDisabledReason v-if="showStartButton" :disabled="Boolean(startDisabledReason)" :reason="startDisabledReason">
      <PerformancePermissionButton op="U" :allowed="props.canManage" :disabled="Boolean(startDisabledReason)" :aria-label="`启动${props.projectName}`" @click="run('start')">
        启动
      </PerformancePermissionButton>
    </PerformanceDisabledReason>
    <el-dropdown :trigger="['hover', 'click']" placement="bottom-end" @visible-change="moreOpen = $event" @command="run">
      <PerformancePermissionButton op="V" :allowed="props.canManage" class="more-action" :class="{ 'is-active': moreOpen }" icon="MoreOutlined" icon-variant="menu" aria-label="更多项目操作" aria-haspopup="menu" :aria-expanded="moreOpen" />
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-if="props.canCopy" command="copy">复制</el-dropdown-item>
          <el-dropdown-item command="remove">删除</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped>
.project-actions { display: inline-flex; align-items: center; gap: var(--spacing-3); white-space: nowrap; }
.project-actions :deep(.performance-button) { padding: 0; border: 0; background: transparent; color: var(--color-primary); font: inherit; line-height: var(--performance-button-line-height); cursor: pointer; }
.project-actions :deep(.performance-button:disabled) { color: var(--performance-button-link-disabled-color); cursor: not-allowed; }
</style>
