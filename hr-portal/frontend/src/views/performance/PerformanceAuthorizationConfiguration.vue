<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceUserAuthorizationApi, type PerformanceUserAuthorization } from '@/api/performance'
import { formatDisplayDateTime } from '@/utils/datetime'
import PerformanceAuthorizationDialog from '@/components/performance/PerformanceAuthorizationDialog.vue'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceContentSurface from '@/components/performance/PerformanceContentSurface.vue'
import PerformanceCreateButton from '@/components/performance/PerformanceCreateButton.vue'
import PerformanceExportButton from '@/components/performance/PerformanceExportButton.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'

const tabs = [{ key: 'users', label: '指定用户授权' }, { key: 'rules', label: '按规则授权' }]
const activeTab = ref('users')
const keywords = ref({ users: '', rules: '' })
const keyword = computed({
  get: () => activeTab.value === 'users' ? keywords.value.users : keywords.value.rules,
  set: (value: string) => { if (activeTab.value === 'users') keywords.value.users = value; else keywords.value.rules = value },
})
const isRuleTab = computed(() => activeTab.value === 'rules')
const pageSize = ref(10)
const searchPlaceholder = computed(() => isRuleTab.value ? '通过用户范围、授权角色搜索' : '通过用户、授权角色搜索')
const dialogVisible = ref(false)
const dialogMode = ref<'users' | 'rules'>('users')
const rows = ref<PerformanceUserAuthorization[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadError = ref('')
const editing = ref<PerformanceUserAuthorization | null>(null)
const pendingRevoke = ref<PerformanceUserAuthorization | null>(null)
const revokeVisible = ref(false)
const revoking = ref(false)
const revokeError = ref('')
let sequence = 0

async function loadRows() {
  const current = ++sequence
  rows.value = []
  total.value = 0
  loadError.value = ''
  if (isRuleTab.value) { loading.value = false; return }
  loading.value = true
  try {
    const result = await performanceUserAuthorizationApi.list(keyword.value, page.value, pageSize.value)
    if (current !== sequence) return
    rows.value = result.items
    total.value = result.total
  } catch (e: any) {
    if (current === sequence) loadError.value = e?.response?.data?.detail || e?.message || '授权列表加载失败'
  } finally {
    if (current === sequence) loading.value = false
  }
}

watch([activeTab, keyword], () => { page.value = 1; dialogVisible.value = false; void loadRows() }, { immediate: true })

function openCreateDialog() { editing.value = null; dialogMode.value = isRuleTab.value ? 'rules' : 'users'; dialogVisible.value = true }
function openEdit(row: PerformanceUserAuthorization) { editing.value = row; dialogMode.value = 'users'; dialogVisible.value = true }
function openRevoke(row: PerformanceUserAuthorization) { pendingRevoke.value = row; revokeError.value = ''; revokeVisible.value = true }

async function revoke() {
  if (!pendingRevoke.value || revoking.value) return
  revoking.value = true
  try {
    await performanceUserAuthorizationApi.revoke(pendingRevoke.value.user_id)
    revokeVisible.value = false
    if (rows.value.length === 1 && page.value > 1) page.value -= 1
    await loadRows()
  } catch (e: any) {
    revokeError.value = e?.response?.data?.detail || e?.message || '撤销授权失败'
  } finally {
    revoking.value = false
  }
}

async function exportRows() {
  const result = await performanceUserAuthorizationApi.exportAll(keyword.value)
  return [
    ['选择用户', '授权角色', '更新人', '最近更新时间'],
    ...result.items.map(item => [`${item.display_name}（${item.employee_no}）`, item.roles.map(role => role.name).join('、'), item.updated_by || '--', formatDisplayDateTime(item.updated_at)]),
  ]
}

function notifyUnavailable(action: string) { ElMessage.info(`${action}功能将在后续任务接入`) }
</script>

<template>
  <section class="authorization-configuration">
    <h1 class="authorization-title">授权配置</h1>
    <PerformanceLineTabs v-model="activeTab" :tabs="tabs" class="authorization-tabs" flush>
      <PerformanceContentSurface class="authorization-surface">
        <PerformanceListToolbar v-model:keyword="keyword" :search-placeholder="searchPlaceholder" :search-aria-label="searchPlaceholder" :show-filter="false">
          <template #left><PerformanceCreateButton :label="isRuleTab ? '添加规则' : '添加授权'" @click="openCreateDialog" /></template>
          <template #actions>
            <PerformanceExportButton v-if="!isRuleTab" :load-rows="exportRows" filename="绩效用户授权" :disabled="loading || !total" @success="ElMessage.success('导出成功')" @error="ElMessage.error('导出失败，请稍后重试')" />
          </template>
        </PerformanceListToolbar>
        <p v-if="loadError" role="alert">{{ loadError }} <UiButton variant="text" @click="loadRows">重试</UiButton></p>
        <PerformanceManagementTable
          :key="activeTab" :rows="isRuleTab ? [] : rows" :loading="loading" loading-text="正在加载授权配置"
          :empty-text="keyword.trim() ? '暂无匹配结果' : isRuleTab ? '暂无授权规则' : '暂无用户授权'"
          :table-aria-label="`${isRuleTab ? '按规则授权' : '指定用户授权'}列表`" pagination-aria-label="授权配置分页"
          :page="page" :page-size="pageSize" :total="isRuleTab ? 0 : total"
          @page-change="page = $event; void loadRows()" @page-size-change="pageSize = $event; page = 1; void loadRows()"
        >
          <el-table-column :key="activeTab" :prop="isRuleTab ? 'userScope' : 'users'" :label="isRuleTab ? '用户范围' : '选择用户'" min-width="240"><template #default="{ row }">{{ row?.display_name ? `${row.display_name}（${row.employee_no}）` : '' }}</template></el-table-column>
          <el-table-column prop="roles" label="授权角色" min-width="200">
            <template #default="{ row }">{{ row?.roles?.map((role: any) => role.name).join('、') || '' }}</template>
          </el-table-column>
          <el-table-column prop="updatedBy" label="更新人" min-width="160"><template #default="{ row }">{{ row?.updated_by || '--' }}</template></el-table-column>
          <el-table-column prop="updatedAt" label="最近更新时间" min-width="200"><template #default="{ row }">{{ row?.updated_at ? formatDisplayDateTime(row.updated_at) : '' }}</template></el-table-column>
          <el-table-column label="操作" :width="isRuleTab ? 160 : 180" fixed="right">
            <template #default="{ row }"><div class="authorization-actions">
              <PerformancePermissionButton v-if="!isRuleTab" allowed op="U" aria-label="编辑授权" @click="openEdit(row)">编辑</PerformancePermissionButton>
              <PerformancePermissionButton v-if="!isRuleTab" allowed op="D" aria-label="撤销授权" @click="openRevoke(row)">撤销</PerformancePermissionButton>
              <PerformancePermissionButton v-if="isRuleTab" allowed op="U" aria-label="编辑规则" @click="notifyUnavailable('编辑规则弹窗')">编辑</PerformancePermissionButton>
              <PerformancePermissionButton v-if="isRuleTab" allowed op="D" aria-label="删除规则" @click="notifyUnavailable('删除规则')">删除</PerformancePermissionButton>
            </div></template>
          </el-table-column>
        </PerformanceManagementTable>
      </PerformanceContentSurface>
    </PerformanceLineTabs>
    <PerformanceAuthorizationDialog v-model="dialogVisible" :mode="dialogMode" :authorization="editing" @saved="loadRows" />
    <PerformanceConfirmDialog v-model="revokeVisible" message="确定撤销授权吗？" :description="`撤销${pendingRevoke?.display_name || ''}的自定义管理角色授权，不影响系统角色、其他范围授权及历史任务。`" cancel-text="取消" confirm-text="撤销" :loading="revoking" :error-message="revokeError" @confirm="revoke" />
  </section>
</template>

<style scoped>
.authorization-configuration { min-width: 0; color: var(--color-text-primary); font-family: var(--font-sans); }
.authorization-title { margin: 0 0 var(--spacing-4); font-size: var(--font-size-xl); font-weight: var(--performance-page-title-weight); line-height: var(--performance-page-title-line-height); }
.authorization-tabs { --performance-line-tabs-surface: transparent; }
.authorization-surface { margin-top: var(--spacing-4); padding: var(--spacing-25); }
.authorization-surface :deep(.list-toolbar) { margin-bottom: var(--spacing-2); }
.authorization-actions { display: inline-flex; align-items: center; gap: var(--spacing-2); white-space: nowrap; }
@media (max-width: 720px) { .authorization-surface :deep(.list-toolbar) { flex-wrap: wrap; } }
</style>
