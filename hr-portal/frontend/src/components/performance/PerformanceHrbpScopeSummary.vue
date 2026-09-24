<script setup lang="ts">
import PerformanceContentSurface from './PerformanceContentSurface.vue'
import PerformancePermissionButton from './PerformancePermissionButton.vue'

withDefaults(defineProps<{
  scopeText?: string
  allowed?: boolean
}>(), {
  scopeText: '本周期负责的人员和当前负责的人员',
  allowed: true,
})

const emit = defineEmits<{ settings: [] }>()
</script>

<template>
  <PerformanceContentSurface class="hrbp-scope-summary">
    <div class="scope-summary-heading">
      <div class="scope-summary-copy">
        <h2>HRBP 可管理的绩效数据范围</h2>
        <p>可设置 HRBP 在前台“项目管理”菜单下管理绩效数据的成员范围。本周期内哪些项目的绩效数据可由 HRBP 管理，可以在各项目中单独配置。此设置不会影响 HRBP 在绩效流流程中作为环节执行人处理任务。</p>
      </div>
      <PerformancePermissionButton :allowed="allowed" op="U" variant="secondary" class="scope-settings-button" @click="emit('settings')">设置</PerformancePermissionButton>
    </div>
    <div class="scope-summary-value">
      <span>权限范围</span>
      <strong>{{ scopeText }}</strong>
    </div>
  </PerformanceContentSurface>
</template>

<style scoped>
.hrbp-scope-summary { min-height: 156px; margin-bottom: 12px; padding: 16px 20px; box-shadow: none; }
.scope-summary-heading { display: flex; justify-content: space-between; min-width: 0; }
.scope-summary-copy { min-width: 0; }
.scope-summary-copy h2, .scope-summary-copy p { margin: 0; font-size: 14px; line-height: 22px; }
.scope-summary-copy h2 { color: #1f2329; font-weight: 600; }
.scope-summary-copy p { color: #646a73; font-weight: 400; }
.scope-settings-button { min-width: 80px; flex: 0 0 80px; margin: 2px 0 0 24px; }
.scope-summary-value { display: flex; min-height: 68px; flex-direction: column; justify-content: center; margin-top: 12px; padding: 12px 16px; box-sizing: border-box; border-radius: 8px; background: #f5f6f7; font-size: 14px; line-height: 22px; }
.scope-summary-value span { color: #646a73; font-weight: 400; }
.scope-summary-value strong { color: #1f2329; font-weight: 400; }
</style>
