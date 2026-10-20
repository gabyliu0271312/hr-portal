<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PerformanceAuthorizationDialog from '@/components/performance/PerformanceAuthorizationDialog.vue'
import PerformanceButton from '@/components/performance/PerformanceButton.vue'
import PerformanceContentSurface from '@/components/performance/PerformanceContentSurface.vue'
import PerformanceCreateButton from '@/components/performance/PerformanceCreateButton.vue'
import PerformanceExportIcon from '@/components/performance/PerformanceExportIcon.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'

const tabs = [
  { key: 'users', label: '指定用户授权' },
  { key: 'rules', label: '按规则授权' },
]
const activeTab = ref('users')
const keywords = ref({ users: '', rules: '' })
const keyword = computed({
  get: () => activeTab.value === 'users' ? keywords.value.users : keywords.value.rules,
  set: (value: string) => {
    if (activeTab.value === 'users') keywords.value.users = value
    else keywords.value.rules = value
  },
})
const isRuleTab = computed(() => activeTab.value === 'rules')
const pageSize = ref(10)
const searchPlaceholder = computed(() => isRuleTab.value ? '通过用户范围、授权角色搜索' : '通过用户、授权角色搜索')
const dialogVisible = ref(false)
const dialogMode = ref<'users' | 'rules'>('users')

function openCreateDialog() {
  dialogMode.value = isRuleTab.value ? 'rules' : 'users'
  dialogVisible.value = true
}

function notifyUnavailable(action: string) {
  ElMessage.info(`${action}功能将在后续任务接入`)
}
</script>

<template>
  <section class="authorization-configuration">
    <h1 class="authorization-title">授权配置</h1>
    <PerformanceLineTabs v-model="activeTab" :tabs="tabs" class="authorization-tabs" flush>
      <PerformanceContentSurface class="authorization-surface">
        <PerformanceListToolbar
          v-model:keyword="keyword"
          :search-placeholder="searchPlaceholder"
          :search-aria-label="searchPlaceholder"
          :show-filter="false"
        >
          <template #left>
            <PerformanceCreateButton :label="isRuleTab ? '添加规则' : '添加授权'" @click="openCreateDialog" />
          </template>
          <template #actions>
            <PerformanceButton aria-label="导出" @click="notifyUnavailable('导出')">
              <span class="authorization-export"><PerformanceExportIcon />导出</span>
            </PerformanceButton>
          </template>
        </PerformanceListToolbar>

        <PerformanceManagementTable
          :key="activeTab"
          :rows="[]"
          :loading="false"
          loading-text="正在加载授权配置"
          :empty-text="keyword.trim() ? '暂无匹配结果' : isRuleTab ? '暂无授权规则' : '暂无用户授权'"
          :table-aria-label="`${isRuleTab ? '按规则授权' : '指定用户授权'}列表`"
          pagination-aria-label="授权配置分页"
          :page="1"
          :page-size="pageSize"
          :total="0"
          @page-size-change="pageSize = $event"
        >
          <el-table-column :key="activeTab" :prop="isRuleTab ? 'userScope' : 'users'" :label="isRuleTab ? '用户范围' : '选择用户'" min-width="240" />
          <el-table-column prop="roles" label="授权角色" min-width="200" />
          <el-table-column prop="updatedBy" label="更新人" min-width="160" />
          <el-table-column prop="updatedAt" label="最近更新时间" min-width="200" />
          <el-table-column label="操作" :width="isRuleTab ? 160 : 100" fixed="right">
            <template #default>
              <div class="authorization-actions">
                <PerformancePermissionButton allowed op="U" :aria-label="isRuleTab ? '编辑规则' : '编辑授权'" @click="notifyUnavailable(isRuleTab ? '编辑规则弹窗' : '编辑授权弹窗')">编辑</PerformancePermissionButton>
                <PerformancePermissionButton v-if="isRuleTab" allowed op="D" aria-label="删除规则" @click="notifyUnavailable('删除规则')">删除</PerformancePermissionButton>
              </div>
            </template>
          </el-table-column>
        </PerformanceManagementTable>
      </PerformanceContentSurface>
    </PerformanceLineTabs>
    <PerformanceAuthorizationDialog v-model="dialogVisible" :mode="dialogMode" />
  </section>
</template>

<style scoped>
.authorization-configuration { min-width: 0; color: var(--color-text-primary); font-family: var(--font-sans); }
.authorization-title { margin: 0 0 var(--spacing-4); font-size: var(--font-size-xl); font-weight: var(--performance-page-title-weight); line-height: var(--performance-page-title-line-height); }
.authorization-tabs { --performance-line-tabs-surface: transparent; }
.authorization-surface { margin-top: var(--spacing-4); padding: var(--spacing-25); }
.authorization-surface :deep(.list-toolbar) { margin-bottom: var(--spacing-2); }
.authorization-export { display: inline-flex; align-items: center; gap: var(--spacing-1); }
.authorization-actions { display: inline-flex; align-items: center; gap: var(--spacing-2); white-space: nowrap; }
@media (max-width: 720px) { .authorization-surface :deep(.list-toolbar) { flex-wrap: wrap; } }
</style>
