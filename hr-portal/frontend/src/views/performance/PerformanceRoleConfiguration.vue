<template>
  <section class="performance-role-configuration">
    <h1 class="role-page-title">角色配置</h1>

    <div class="role-tabs" role="tablist" aria-label="角色类型">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="role-tab"
        :class="{ active: activeTab === tab.key }"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <section class="role-card">
      <PerformanceListToolbar
        class="role-toolbar"
        :keyword="keyword"
        :search-placeholder="activeTab === 'assessment' ? '通过角色类型搜索' : '通过角色名称搜索'"
        :search-aria-label="activeTab === 'assessment' ? '通过角色类型搜索' : '通过角色名称搜索'"
        @update:keyword="keyword = $event"
        @filter="notifyUnavailable('筛选')"
      >
        <template #left>
          <PerformanceCreateButton v-if="activeTab === 'management'" label="新建角色" @click="goCreate" />
        </template>
        <template #actions>
          <button v-if="activeTab === 'management'" class="role-export-button" type="button" aria-label="导出" @click="notifyUnavailable('导出')">
            <PerformanceExportIcon />
            <span>导出</span>
          </button>
        </template>
      </PerformanceListToolbar>

      <PerformanceManagementTable
        :rows="filteredRows"
        :loading="loading"
        loading-text="正在加载角色"
        :empty-text="activeTab === 'management' ? '暂无管理角色' : '暂无评估角色'"
        table-aria-label="角色配置列表"
        pagination-aria-label="角色配置分页"
        :page="page"
        :page-size="pageSize"
        :total="total"
        @page-change="page = $event; void loadRoles()"
        @page-size-change="pageSize = $event; page = 1; void loadRoles()"
      >
        <el-table-column prop="name" :label="activeTab === 'assessment' ? '角色类型' : '角色'" min-width="180">
          <template #default="{ row }">
            <span v-if="activeTab === 'assessment'">{{ row.name }}</span>
            <button v-else class="role-name-button" type="button" @click="notifyUnavailable(`查看${row.name}`)">
              {{ row.name }}
            </button>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" :min-width="activeTab === 'assessment' ? 180 : 280" />
        <el-table-column v-if="activeTab === 'assessment'" label="如何指定角色成员" min-width="220">
          <template #default="{ row }">{{ row.memberSource }}</template>
        </el-table-column>
        <el-table-column label="状态" min-width="120">
          <template #default="{ row }">
            <span class="role-status"><i aria-hidden="true" />{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新人" :min-width="activeTab === 'assessment' ? 120 : 180">
          <template #default="{ row }">
            <span class="role-updater">{{ row.updatedBy }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="activeTab === 'management'" prop="updatedAt" label="最近更新时间" min-width="180" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="role-actions">
              <template v-if="activeTab === 'assessment'">
                <PerformanceButton variant="text" aria-label="编辑角色" disabled>编辑</PerformanceButton>
                <PerformanceButton variant="text" aria-label="停用角色" disabled>停用</PerformanceButton>
              </template>
              <template v-else>
                <PerformancePermissionButton allowed op="U" aria-label="编辑角色" @click="goEdit(row)">编辑</PerformancePermissionButton>
                <PerformancePermissionButton
                  allowed
                  op="U"
                  :aria-label="row.isActive ? '停用角色' : '启用角色'"
                  :disabled="row.isSystem || updatingRoleId === row.id"
                  :title="row.isSystem ? '系统创建的角色不支持停用' : undefined"
                  @click="toggleRoleStatus(row)"
                >{{ row.isActive ? '停用' : '启用' }}</PerformancePermissionButton>
                <div class="role-more-wrap">
                  <el-dropdown trigger="click" :disabled="updatingRoleId === row.id" placement="bottom-end" popper-class="performance-role-action-popper">
                    <button class="role-more-button" type="button" aria-label="更多操作" :disabled="updatingRoleId === row.id">···</button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <PerformanceDisabledReason
                          :disabled="row.isSystem || row.isActive"
                          :reason="row.isSystem ? '系统创建的角色不支持删除' : '需要先停用角色，再进行删除'"
                        >
                          <el-dropdown-item :disabled="row.isSystem || row.isActive || updatingRoleId === row.id" @click="openDeleteDialog(row)">删除</el-dropdown-item>
                        </PerformanceDisabledReason>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
            </div>
          </template>
        </el-table-column>
      </PerformanceManagementTable>
    </section>
    <PerformanceConfirmDialog
      v-model="deleteDialogVisible"
      message="确定删除吗？"
      description="删除后，该角色将从角色管理页面移除"
      :loading="deleting"
      :error-message="deleteError"
      @confirm="confirmDelete"
    />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { formatDisplayDateTime } from '@/utils/datetime'
import {
  performanceRoleApi,
  type PerformanceRoleListItem,
} from '@/api/performance'
import PerformanceCreateButton from '@/components/performance/PerformanceCreateButton.vue'
import PerformanceButton from '@/components/performance/PerformanceButton.vue'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import PerformanceExportIcon from '@/components/performance/PerformanceExportIcon.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'
import PerformanceDisabledReason from '@/components/performance/PerformanceDisabledReason.vue'

type RoleTab = 'management' | 'assessment'

type RoleRow = {
  id: number
  name: string
  isActive: boolean
  isSystem: boolean
  description: string
  status: '已启用' | '已停用'
  memberSource: string
  updatedBy: string
  updatedAt: string
}

const tabs: Array<{ key: RoleTab; label: string }> = [
  { key: 'management', label: '管理角色' },
  { key: 'assessment', label: '评估角色' },
]

const router = useRouter()
const activeTab = ref<RoleTab>('management')
const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const filteredRows = ref<RoleRow[]>([])
const updatingRoleId = ref<number | null>(null)
const pendingDeleteRole = ref<RoleRow | null>(null)
const deleteDialogVisible = ref(false)
const deleteError = ref('')
const deleting = ref(false)
let requestId = 0

function toRoleRow(item: PerformanceRoleListItem): RoleRow {
  return {
    id: item.id,
    name: item.name,
    isActive: item.is_active,
    isSystem: item.is_system,
    description: item.description || '--',
    memberSource: item.member_source || '--',
    status: item.is_active ? '已启用' : '已停用',
    updatedBy: '--',
    updatedAt: formatDisplayDateTime(item.updated_at),
  }
}

async function loadRoles() {
  const currentRequest = ++requestId
  loading.value = true
  try {
    const roleType = activeTab.value === 'assessment' ? 'ASSESSMENT' : 'MANAGEMENT'
    const result = await performanceRoleApi.list(keyword.value, page.value, pageSize.value, roleType)
    if (currentRequest !== requestId) return
    filteredRows.value = result.items.map(toRoleRow)
    total.value = result.total
  } catch (error: any) {
    if (currentRequest !== requestId) return
    filteredRows.value = []
    total.value = 0
    ElMessage.error(error?.response?.data?.detail || '角色列表加载失败')
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

watch([keyword, activeTab], () => {
  page.value = 1
  void loadRoles()
})

onMounted(() => void loadRoles())

function goCreate() {
  void router.push({ name: 'PerformancePermissionRoleCreate' })
}

function goEdit(row: RoleRow) {
  void router.push({ name: 'PerformancePermissionRoleEdit', params: { roleId: row.id } })
}

async function toggleRoleStatus(row: RoleRow) {
  if (row.isSystem || updatingRoleId.value !== null) return
  updatingRoleId.value = row.id
  try {
    await performanceRoleApi.updateStatus(row.id, !row.isActive)
    filteredRows.value = filteredRows.value.map(item => item.id === row.id
      ? { ...item, isActive: !row.isActive, status: row.isActive ? '已停用' : '已启用' }
      : item)
    ElMessage.success(row.isActive ? '角色已停用' : '角色已启用')
    await loadRoles()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '角色状态更新失败')
  } finally {
    updatingRoleId.value = null
  }
}

function openDeleteDialog(row: RoleRow) {
  if (row.isActive || row.isSystem || updatingRoleId.value === row.id) return
  pendingDeleteRole.value = row
  deleteError.value = ''
  deleteDialogVisible.value = true
}

async function confirmDelete() {
  const role = pendingDeleteRole.value
  if (!role || deleting.value) return
  deleting.value = true
  try {
    await performanceRoleApi.remove(role.id)
  } catch (error: any) {
    deleteError.value = error?.response?.data?.detail || '角色删除失败'
    deleting.value = false
    return
  }
  deleteDialogVisible.value = false
  pendingDeleteRole.value = null
  filteredRows.value = filteredRows.value.filter(item => item.id !== role.id)
  if (filteredRows.value.length === 0 && page.value > 1) page.value -= 1
  total.value = Math.max(0, total.value - 1)
  deleting.value = false
  ElMessage.success('角色已删除')
  await loadRoles()
}

function notifyUnavailable(action: string) {
  ElMessage.info(`${action}功能将在后续任务接入`)
}
</script>

<style scoped>
.performance-role-configuration { min-height: 0; color: #1f2329; font-family: var(--font-sans); }
.role-page-title { margin: 0 0 16px; font-size: 20px; font-weight: 600; line-height: 28px; }
.role-tabs { display: flex; height: 48px; align-items: stretch; border-bottom: 1px solid rgba(31, 35, 41, .15); }
.role-tab { position: relative; min-width: 104px; padding: 0 16px; border: 0; background: transparent; color: #646a73; cursor: pointer; font: 400 16px/24px var(--font-sans); }
.role-tab.active { color: var(--color-primary); font-weight: 600; }
.role-tab.active::after { position: absolute; right: 16px; bottom: -1px; left: 16px; height: 3px; border-radius: 3px 3px 0 0; background: #3370ff; content: ''; }
.role-card { box-sizing: border-box; margin-top: 16px; padding: 10px; border-radius: 8px; background: #fff; box-shadow: rgba(31, 35, 41, .02) 0 1px 2px -2px, rgba(31, 35, 41, .02) 0 2px 4px, rgba(31, 35, 41, .02) 0 2px 8px 2px; }
.role-toolbar :deep(.list-toolbar) { margin-bottom: 8px; }
.role-export-button { display: inline-flex; height: 32px; align-items: center; gap: 4px; padding: 4px 11px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; cursor: pointer; font: 400 14px/22px var(--font-sans); }
.role-export-button:hover { background: #f2f3f5; }
.role-name-button { padding: 0; border: 0; background: transparent; color: var(--color-primary); cursor: pointer; font: inherit; text-align: left; }
.role-name-button:hover { color: #3370ff; }
.role-status { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.role-status i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34c759; }
.role-updater { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.role-actions { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
.role-actions :deep(.performance-button--text:disabled) { color: var(--performance-button-link-disabled-color); opacity: 1; }
.role-actions :deep(.performance-button--text[title]) { cursor: not-allowed; }
.role-more-wrap { position: relative; }
.role-more-button { width: 24px; height: 24px; padding: 0; border: 0; border-radius: var(--performance-button-radius); background: transparent; color: #646a73; cursor: pointer; font-size: 16px; line-height: 18px; }
.role-more-button:hover:not(:disabled), .role-more-button:focus-visible { background: var(--performance-button-text-hover-background); outline: 0; }
.role-more-button:disabled { color: var(--performance-button-link-disabled-color); cursor: not-allowed; }
@media (max-width: 720px) { .role-toolbar :deep(.list-toolbar) { flex-wrap: wrap; }.role-card { padding: 8px; } }
</style>
