<template>
  <div class="workbench-settings-page">
    <h1>工作台设置</h1>

    <section class="settings-card">
      <header class="settings-card__header">
        <h2>更多入口</h2>
        <p>设置工作台的快捷入口中「更多入口」内的跳转入口。当查看人可见范围内有更多入口时，将出现该分组。<a href="#" @click.prevent="showComingSoon('功能示例')">查看功能示例</a></p>
      </header>
      <div class="section-heading">
        <strong>入口列表</strong>
      </div>
      <PerformanceListToolbar
        v-model:keyword="entryKeyword"
        search-placeholder="搜索标题"
        search-aria-label="搜索入口标题"
        :show-filter="true"
        @search="refreshEntries"
        @clear="refreshEntries"
        @filter="entryFilterOpen = !entryFilterOpen"
      >
        <template #actions>
          <PerformanceButton variant="primary" @click="openCreate('entry')"><el-icon><Plus /></el-icon>新建</PerformanceButton>
        </template>
      </PerformanceListToolbar>
      <div v-if="entryFilterOpen" class="filter-row" aria-label="入口状态筛选">
        <span>状态</span>
        <el-select v-model="entryStatus" size="small" aria-label="入口状态" @change="refreshEntries">
          <el-option label="全部" value="" />
          <el-option label="已启用" value="active" />
          <el-option label="已停用" value="inactive" />
        </el-select>
      </div>
      <div v-if="entryError" class="settings-error" role="alert">
        <span>{{ entryError }}</span><PerformanceTextButton label="重新加载" @click="loadEntries" />
      </div>
      <PerformanceManagementTable
        v-else
        :rows="entries"
        :loading="entryLoading"
        loading-text="正在加载入口..."
        empty-text="暂无更多入口"
        table-aria-label="更多入口列表"
        pagination-aria-label="更多入口分页"
        :page="entryPage"
        :page-size="entryPageSize"
        :total="entryTotal"
        @page-change="entryPage = $event; loadEntries()"
        @page-size-change="entryPageSize = $event; entryPage = 1; loadEntries()"
      >
        <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
        <el-table-column label="状态" min-width="110">
          <template #default="{ row }"><span class="status-text"><i :class="`status-dot status-dot--${row.status}`" />{{ statusLabel(row.status) }}</span></template>
        </el-table-column>
        <el-table-column label="链接" min-width="260" show-overflow-tooltip>
          <template #default="{ row }"><a class="link-text" :href="row.link" target="_blank" rel="noreferrer">{{ row.link }}</a></template>
        </el-table-column>
        <el-table-column prop="icon" label="图标" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.icon || '--' }}</template>
        </el-table-column>
        <el-table-column prop="visibility" label="可见范围" min-width="150" show-overflow-tooltip />
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <PerformancePermissionButton :allowed="true" op="U" @click="openEdit('entry', row)">编辑</PerformancePermissionButton>
              <PerformancePermissionButton :allowed="true" op="U" @click="toggleEntry(row)">{{ row.status === 'active' ? '停用' : '启用' }}</PerformancePermissionButton>
              <PerformancePermissionButton :allowed="true" op="D" danger @click="askDelete('entry', row)">删除</PerformancePermissionButton>
            </div>
          </template>
        </el-table-column>
      </PerformanceManagementTable>
    </section>

    <section class="settings-card settings-card--announcement">
      <div class="announcement-toggle">
        <div>
          <h2>公告功能</h2>
          <p>开启后，公告入口将会出现在工作台，管理员可以在公告发布内容。<a href="#" @click.prevent="showComingSoon('功能示例')">查看功能示例</a></p>
        </div>
        <PerformanceSwitch :model-value="announcementEnabled" aria-label="公告功能" :disabled="announcementSaving" @update:model-value="toggleAnnouncements" />
      </div>
      <div class="section-heading section-heading--announcement">
        <strong>公告列表</strong>
      </div>
      <PerformanceListToolbar
        v-model:keyword="announcementKeyword"
        search-placeholder="搜索标题"
        search-aria-label="搜索公告标题"
        :show-filter="true"
        @search="refreshAnnouncements"
        @clear="refreshAnnouncements"
        @filter="announcementFilterOpen = !announcementFilterOpen"
      >
        <template #actions>
          <PerformanceButton variant="primary" @click="openCreate('announcement')"><el-icon><Plus /></el-icon>新建</PerformanceButton>
        </template>
      </PerformanceListToolbar>
      <div v-if="announcementFilterOpen" class="filter-row" aria-label="公告状态筛选">
        <span>状态</span>
        <el-select v-model="announcementStatus" size="small" aria-label="公告状态" @change="refreshAnnouncements">
          <el-option label="全部" value="" />
          <el-option label="已启用" value="active" />
          <el-option label="已停用" value="inactive" />
        </el-select>
      </div>
      <div v-if="announcementError" class="settings-error" role="alert">
        <span>{{ announcementError }}</span><PerformanceTextButton label="重新加载" @click="loadAnnouncements" />
      </div>
      <PerformanceManagementTable
        v-else
        :rows="announcements"
        :loading="announcementLoading"
        loading-text="正在加载公告..."
        empty-text="暂无公告"
        table-aria-label="公告列表"
        pagination-aria-label="公告分页"
        :page="announcementPage"
        :page-size="announcementPageSize"
        :total="announcementTotal"
        @page-change="announcementPage = $event; loadAnnouncements()"
        @page-size-change="announcementPageSize = $event; announcementPage = 1; loadAnnouncements()"
      >
        <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
        <el-table-column label="状态" min-width="110">
          <template #default="{ row }"><span class="status-text"><i :class="`status-dot status-dot--${row.status}`" />{{ statusLabel(row.status) }}</span></template>
        </el-table-column>
        <el-table-column label="链接" min-width="260" show-overflow-tooltip>
          <template #default="{ row }"><a class="link-text" :href="row.link" target="_blank" rel="noreferrer">{{ row.link }}</a></template>
        </el-table-column>
        <el-table-column prop="cycle_label" label="展示周期" min-width="150" show-overflow-tooltip />
        <el-table-column prop="visibility" label="可见范围" min-width="150" show-overflow-tooltip />
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <PerformancePermissionButton :allowed="true" op="U" @click="openEdit('announcement', row)">编辑</PerformancePermissionButton>
              <PerformancePermissionButton :allowed="true" op="U" @click="toggleAnnouncement(row)">{{ row.status === 'active' ? '停用' : '启用' }}</PerformancePermissionButton>
              <PerformancePermissionButton :allowed="true" op="D" danger @click="askDelete('announcement', row)">删除</PerformancePermissionButton>
            </div>
          </template>
        </el-table-column>
      </PerformanceManagementTable>
    </section>

    <WorkbenchSettingEditor v-model="editorVisible" :kind="editorKind" :item="editorItem" :loading="editorSaving" @save="saveEditor" />
    <PerformanceConfirmDialog
      v-model="deleteDialogVisible"
      message="确定删除当前配置吗？"
      description="删除后无法恢复，请确认当前操作。"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  performanceWorkbenchSettingsApi,
  type PerformanceWorkbenchAnnouncement,
  type PerformanceWorkbenchAnnouncementPayload,
  type PerformanceWorkbenchEntry,
  type PerformanceWorkbenchEntryPayload,
} from '@/api/performance'
import PerformanceButton from '@/components/performance/PerformanceButton.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'
import PerformanceSwitch from '@/components/performance/PerformanceSwitch.vue'
import PerformanceTextButton from '@/components/performance/PerformanceTextButton.vue'
import WorkbenchSettingEditor from '@/components/performance/WorkbenchSettingEditor.vue'

type Kind = 'entry' | 'announcement'
type Item = PerformanceWorkbenchEntry | PerformanceWorkbenchAnnouncement

const entries = ref<PerformanceWorkbenchEntry[]>([])
const announcements = ref<PerformanceWorkbenchAnnouncement[]>([])
const announcementEnabled = ref(true)
const announcementSaving = ref(false)
const entryKeyword = ref('')
const announcementKeyword = ref('')
const entryStatus = ref<'active' | 'inactive' | ''>('')
const announcementStatus = ref<'active' | 'inactive' | ''>('')
const entryFilterOpen = ref(false)
const announcementFilterOpen = ref(false)
const entryPage = ref(1)
const announcementPage = ref(1)
const entryPageSize = ref(10)
const announcementPageSize = ref(10)
const entryTotal = ref(0)
const announcementTotal = ref(0)
const entryLoading = ref(false)
const announcementLoading = ref(false)
const entryError = ref('')
const announcementError = ref('')
const editorVisible = ref(false)
const editorSaving = ref(false)
const editorKind = ref<Kind>('entry')
const editorItem = ref<Item | null>(null)
const deleteDialogVisible = ref(false)
const deleteKind = ref<Kind>('entry')
const deleteItem = ref<Item | null>(null)

function statusLabel(status: string) { return status === 'active' ? '已启用' : '已停用' }
function showComingSoon(name: string) { ElMessage.info(`${name}功能将在后续版本开放`) }

async function loadEntries() {
  entryLoading.value = true
  entryError.value = ''
  try {
    const result = await performanceWorkbenchSettingsApi.listEntries(entryKeyword.value.trim(), entryStatus.value || undefined, entryPage.value, entryPageSize.value)
    entries.value = result.items
    entryTotal.value = result.total
  } catch (error: any) {
    entryError.value = error?.response?.data?.detail || '入口列表加载失败'
  } finally { entryLoading.value = false }
}

async function loadAnnouncements() {
  announcementLoading.value = true
  announcementError.value = ''
  try {
    const result = await performanceWorkbenchSettingsApi.listAnnouncements(announcementKeyword.value.trim(), announcementStatus.value || undefined, announcementPage.value, announcementPageSize.value)
    announcements.value = result.items
    announcementTotal.value = result.total
  } catch (error: any) {
    announcementError.value = error?.response?.data?.detail || '公告列表加载失败'
  } finally { announcementLoading.value = false }
}

function refreshEntries() { entryPage.value = 1; void loadEntries() }
function refreshAnnouncements() { announcementPage.value = 1; void loadAnnouncements() }
function openCreate(kind: Kind) { editorKind.value = kind; editorItem.value = null; editorVisible.value = true }
function openEdit(kind: Kind, item: Item) { editorKind.value = kind; editorItem.value = item; editorVisible.value = true }

async function saveEditor(payload: PerformanceWorkbenchEntryPayload | PerformanceWorkbenchAnnouncementPayload) {
  editorSaving.value = true
  try {
    if (editorKind.value === 'entry') {
      if (editorItem.value) await performanceWorkbenchSettingsApi.updateEntry(editorItem.value.id, payload as Partial<PerformanceWorkbenchEntryPayload>)
      else await performanceWorkbenchSettingsApi.createEntry(payload as PerformanceWorkbenchEntryPayload)
      editorVisible.value = false
      await loadEntries()
    } else {
      if (editorItem.value) await performanceWorkbenchSettingsApi.updateAnnouncement(editorItem.value.id, payload as Partial<PerformanceWorkbenchAnnouncementPayload>)
      else await performanceWorkbenchSettingsApi.createAnnouncement(payload as PerformanceWorkbenchAnnouncementPayload)
      editorVisible.value = false
      await loadAnnouncements()
    }
    ElMessage.success('保存成功')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '保存失败，请稍后重试')
  } finally { editorSaving.value = false }
}

async function toggleEntry(item: PerformanceWorkbenchEntry) {
  try { await performanceWorkbenchSettingsApi.updateEntryStatus(item.id, item.status === 'active' ? 'inactive' : 'active'); await loadEntries() } catch { ElMessage.error('入口状态更新失败') }
}
async function toggleAnnouncement(item: PerformanceWorkbenchAnnouncement) {
  try { await performanceWorkbenchSettingsApi.updateAnnouncementStatus(item.id, item.status === 'active' ? 'inactive' : 'active'); await loadAnnouncements() } catch { ElMessage.error('公告状态更新失败') }
}
async function toggleAnnouncements(value: boolean) {
  const previous = announcementEnabled.value
  announcementEnabled.value = value
  announcementSaving.value = true
  try { const result = await performanceWorkbenchSettingsApi.update({ announcement_enabled: value }); announcementEnabled.value = result.announcement_enabled } catch { announcementEnabled.value = previous; ElMessage.error('公告功能设置保存失败') } finally { announcementSaving.value = false }
}
function askDelete(kind: Kind, item: Item) { deleteKind.value = kind; deleteItem.value = item; deleteDialogVisible.value = true }
async function confirmDelete() {
  const item = deleteItem.value
  if (!item) return
  try {
    if (deleteKind.value === 'entry') await performanceWorkbenchSettingsApi.removeEntry(item.id)
    else await performanceWorkbenchSettingsApi.removeAnnouncement(item.id)
    deleteDialogVisible.value = false
    deleteItem.value = null
    if (deleteKind.value === 'entry') await loadEntries()
    else await loadAnnouncements()
    ElMessage.success('删除成功')
  } catch { ElMessage.error('删除失败，请稍后重试') }
}

onMounted(async () => {
  await Promise.all([
    performanceWorkbenchSettingsApi.get().then(result => { announcementEnabled.value = result.announcement_enabled }).catch(() => undefined),
    loadEntries(),
    loadAnnouncements(),
  ])
})
</script>

<style scoped>
.workbench-settings-page { min-height: 0; color: #1f2329; }
.workbench-settings-page > h1 { margin: 0 0 16px; font-size: 20px; font-weight: 600; line-height: 28px; }
.settings-card { box-sizing: border-box; margin-bottom: 16px; padding: 16px 20px 20px; border-radius: 8px; background: #fff; }
.settings-card__header h2, .announcement-toggle h2 { margin: 0; color: rgba(0,0,0,.85); font-size: 16px; font-weight: 600; line-height: 24px; }
.settings-card__header p, .announcement-toggle p { margin: 0; color: #646a73; font-size: 14px; line-height: 21px; }
.settings-card__header a, .announcement-toggle a { margin-left: 4px; color: #3370ff; text-decoration: none; }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin: 16px 0 12px; font-size: 14px; line-height: 21px; }
.section-heading--announcement { margin-top: 24px; }
.announcement-toggle { display: flex; align-items: center; justify-content: space-between; padding-bottom: 0; }
.filter-row { display: flex; align-items: center; gap: 8px; margin: -4px 0 12px; color: #646a73; font-size: 14px; }
.filter-row .el-select { width: 120px; }
.status-text { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #bbbfc4; }
.status-dot--active { background: #34c724; }
.link-text { display: block; overflow: hidden; color: #3370ff; text-overflow: ellipsis; white-space: nowrap; }
.row-actions { display: flex; align-items: center; gap: 2px; white-space: nowrap; }
.settings-error { display: flex; min-height: 96px; align-items: center; justify-content: center; gap: 12px; color: #646a73; }
@media (max-width: 900px) { .settings-card { padding-inline: 12px; }.settings-card :deep(.list-toolbar) { flex-wrap: wrap; }.settings-card :deep(.toolbar-spacer) { display: none; } }
</style>
