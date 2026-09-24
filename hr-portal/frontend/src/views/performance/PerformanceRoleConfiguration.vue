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
        search-placeholder="通过角色名称搜索"
        search-aria-label="通过角色名称搜索"
        @update:keyword="keyword = $event"
        @filter="notifyUnavailable('筛选')"
      >
        <template #left>
          <PerformanceCreateButton label="新建角色" @click="goCreate" />
        </template>
        <template #actions>
          <button class="role-export-button" type="button" aria-label="导出" @click="notifyUnavailable('导出')">
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
        <el-table-column prop="name" label="角色" min-width="180">
          <template #default="{ row }">
            <button class="role-name-button" type="button" @click="notifyUnavailable(`查看${row.name}`)">
              {{ row.name }}
            </button>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="280" />
        <el-table-column label="状态" min-width="120">
          <template #default="{ row }">
            <span class="role-status"><i aria-hidden="true" />{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新人" min-width="180">
          <template #default="{ row }">
            <span class="role-updater">{{ row.updatedBy }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="最近更新时间" min-width="180" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="role-actions">
              <PerformancePermissionButton
                allowed
                op="U"
                aria-label="编辑角色"
                @click="notifyUnavailable(`编辑${row.name}`)"
              >编辑</PerformancePermissionButton>
              <PerformancePermissionButton
                allowed
                op="U"
                aria-label="停用角色"
                disabled
              >停用</PerformancePermissionButton>
              <button class="role-more-button" type="button" aria-label="更多操作" @click="notifyUnavailable('更多操作')">···</button>
            </div>
          </template>
        </el-table-column>
      </PerformanceManagementTable>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  performanceRoleApi,
  type PerformanceRoleListItem,
} from '@/api/performance'
import PerformanceCreateButton from '@/components/performance/PerformanceCreateButton.vue'
import PerformanceExportIcon from '@/components/performance/PerformanceExportIcon.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'

type RoleTab = 'management' | 'assessment'

type RoleRow = {
  id: number
  name: string
  description: string
  status: '已启用' | '已停用'
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

function toRoleRow(item: PerformanceRoleListItem): RoleRow {
  return {
    id: item.id,
    name: item.name,
    description: item.description || '--',
    status: item.is_active ? '已启用' : '已停用',
    updatedBy: '--',
    updatedAt: new Date(item.updated_at).toLocaleString('zh-CN', { hour12: false }),
  }
}

async function loadRoles() {
  if (activeTab.value === 'assessment') {
    filteredRows.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const result = await performanceRoleApi.list(keyword.value, page.value, pageSize.value)
    filteredRows.value = result.items.map(toRoleRow)
    total.value = result.total
  } catch (error: any) {
    filteredRows.value = []
    total.value = 0
    ElMessage.error(error?.response?.data?.detail || '角色列表加载失败')
  } finally {
    loading.value = false
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

function notifyUnavailable(action: string) {
  ElMessage.info(`${action}功能将在后续任务接入`)
}
</script>

<style scoped>
.performance-role-configuration { min-height: 0; color: #1f2329; font-family: var(--font-sans); }
.role-page-title { margin: 0 0 16px; font-size: 20px; font-weight: 600; line-height: 28px; }
.role-tabs { display: flex; height: 48px; align-items: stretch; border-bottom: 1px solid rgba(31, 35, 41, .15); }
.role-tab { position: relative; min-width: 104px; padding: 0 16px; border: 0; background: transparent; color: #646a73; cursor: pointer; font: 400 16px/24px var(--font-sans); }
.role-tab.active { color: #1456f0; font-weight: 600; }
.role-tab.active::after { position: absolute; right: 16px; bottom: -1px; left: 16px; height: 3px; border-radius: 3px 3px 0 0; background: #3370ff; content: ''; }
.role-card { box-sizing: border-box; margin-top: 16px; padding: 10px; border-radius: 8px; background: #fff; box-shadow: rgba(31, 35, 41, .02) 0 1px 2px -2px, rgba(31, 35, 41, .02) 0 2px 4px, rgba(31, 35, 41, .02) 0 2px 8px 2px; }
.role-toolbar :deep(.list-toolbar) { margin-bottom: 8px; }
.role-export-button { display: inline-flex; height: 32px; align-items: center; gap: 4px; padding: 4px 11px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; cursor: pointer; font: 400 14px/22px var(--font-sans); }
.role-export-button:hover { background: #f2f3f5; }
.role-name-button { padding: 0; border: 0; background: transparent; color: #1456f0; cursor: pointer; font: inherit; text-align: left; }
.role-name-button:hover { color: #3370ff; }
.role-status { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.role-status i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #34c759; }
.role-updater { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.role-actions { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
.role-more-button { width: 24px; height: 24px; padding: 0; border: 0; background: transparent; color: #646a73; cursor: pointer; font-size: 16px; line-height: 18px; }
@media (max-width: 720px) { .role-toolbar :deep(.list-toolbar) { flex-wrap: wrap; }.role-card { padding: 8px; } }
</style>
