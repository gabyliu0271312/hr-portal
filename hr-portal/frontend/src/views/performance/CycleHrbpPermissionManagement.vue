<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { performanceCycleApi, type PerformanceHrbpOrganizationNode, type PerformanceHrbpPermission, type PerformanceHrbpPersonOption } from '@/api/performance'
import FullScreenModal from '@/components/performance/FullScreenModal.vue'
import PerformanceContentSurface from '@/components/performance/PerformanceContentSurface.vue'
import PerformanceHrbpPermissionTable from '@/components/performance/PerformanceHrbpPermissionTable.vue'
import PerformanceHrbpPermissionDialog from '@/components/performance/PerformanceHrbpPermissionDialog.vue'
import PerformanceHrbpScopeSummary from '@/components/performance/PerformanceHrbpScopeSummary.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'

const route = useRoute()
const router = useRouter()
type HrbpPermissionRow = {
  id: number
  hrbp: string
  hrbpRef: string
  scope: string
  scopeValues: string[]
  invisiblePeople: string
  invisiblePeopleValues: string[]
}

const rows = ref<HrbpPermissionRow[]>([])
const selectedRows = ref<unknown[]>([])
const page = ref(1)
const pageSize = ref(10)
const showCreateDialog = ref(false)
const optionsLoading = ref(false)
const saving = ref(false)
const hrbpOptions = ref<PerformanceHrbpPersonOption[]>([])
const invisiblePeopleOptions = ref<PerformanceHrbpPersonOption[]>([])
const organizationTree = ref<PerformanceHrbpOrganizationNode[]>([])
const dialogMode = ref<'create' | 'edit'>('create')
const editingPermissionId = ref<number | null>(null)
const initialValue = ref<{ hrbp?: string; scope?: string[]; invisiblePeopleEnabled?: boolean; invisiblePeople?: string[] }>()
const tabs = [
  { key: 'auth-list', label: '本周期负责的部门和不可见人员' },
  { key: 'history', label: '变更记录' },
]
const activeTab = computed({
  get: () => route.query.activeKey === 'history' ? 'history' : 'auth-list',
  set: (value: string) => {
    void router.replace({ query: { ...route.query, activeKey: value } })
  },
})

function cycleId() {
  const value = Number(route.params.cycleId)
  return Number.isInteger(value) && value > 0 ? value : null
}

function mapPermission(permission: PerformanceHrbpPermission): HrbpPermissionRow {
  return {
    id: permission.id,
    hrbp: permission.hrbp.display_name,
    hrbpRef: permission.hrbp.employee_no,
    scope: permission.scope.join('、'),
    scopeValues: [...permission.scope],
    invisiblePeople: permission.invisible_people.map(person => person.display_name).join('、'),
    invisiblePeopleValues: permission.invisible_people.map(person => person.employee_no),
  }
}

async function loadPermissions() {
  const id = cycleId()
  if (!id) return
  try {
    rows.value = (await performanceCycleApi.listHrbpPermissions(id)).map(mapPermission)
  } catch {
    rows.value = []
    ElMessage.error('HRBP 权限配置加载失败，请稍后重试')
  }
}

async function openCreateDialog() {
  const id = cycleId()
  if (!id) return
  dialogMode.value = 'create'
  editingPermissionId.value = null
  initialValue.value = undefined
  showCreateDialog.value = true
  optionsLoading.value = true
  try {
    const options = await performanceCycleApi.listHrbpOptions(id)
    hrbpOptions.value = options.people
    invisiblePeopleOptions.value = options.invisible_people || []
    organizationTree.value = options.organization_tree
  } catch {
    hrbpOptions.value = []
    invisiblePeopleOptions.value = []
    organizationTree.value = []
    ElMessage.error('周期快照人员加载失败，请稍后重试')
  } finally {
    optionsLoading.value = false
  }
}

function openEditDialog(rawRow: any) {
  const row = rawRow as HrbpPermissionRow
  dialogMode.value = 'edit'
  editingPermissionId.value = row.id
  initialValue.value = {
    hrbp: row.hrbpRef,
    scope: [...row.scopeValues],
    invisiblePeopleEnabled: row.invisiblePeopleValues.length > 0,
    invisiblePeople: [...row.invisiblePeopleValues],
  }
  void openCreateDialog().then(() => {
    dialogMode.value = 'edit'
    editingPermissionId.value = row.id
    initialValue.value = {
      hrbp: row.hrbpRef,
      scope: [...row.scopeValues],
      invisiblePeopleEnabled: row.invisiblePeopleValues.length > 0,
      invisiblePeople: [...row.invisiblePeopleValues],
    }
  })
}

async function submitPermission(value: { hrbp: string; scope: string[]; invisiblePeopleEnabled: boolean; invisiblePeople: string[] }) {
  const id = cycleId()
  if (!id) return
  saving.value = true
  try {
    const payload = {
      hrbp: value.hrbp,
      scope: value.scope,
      invisible_people: value.invisiblePeopleEnabled ? value.invisiblePeople : [],
    }
    if (dialogMode.value === 'edit' && editingPermissionId.value) {
      await performanceCycleApi.updateHrbpPermission(id, editingPermissionId.value, payload)
    } else {
      await performanceCycleApi.createHrbpPermission(id, payload)
    }
    showCreateDialog.value = false
    await loadPermissions()
    ElMessage.success('HRBP 权限已保存')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || 'HRBP 权限保存失败')
  } finally {
    saving.value = false
  }
}

async function removePermission(rawRow: any) {
  const row = rawRow as HrbpPermissionRow
  const id = cycleId()
  if (!id || !window.confirm(`确定要删除“${row.hrbp}”的 HRBP 权限配置吗？`)) return
  try {
    await performanceCycleApi.removeHrbpPermission(id, row.id)
    await loadPermissions()
    ElMessage.success('HRBP 权限已删除')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || 'HRBP 权限删除失败')
  }
}

function goBack() {
  void router.push({ name: 'PerformanceCycles' })
}

onMounted(() => {
  void loadPermissions()
})
</script>

<template>
  <FullScreenModal title="HRBP 权限管理" :show-footer="false" @back="goBack">
    <div class="hrbp-permission-page">
      <PerformanceHrbpScopeSummary />
      <PerformanceContentSurface class="hrbp-permission-panel">
        <PerformanceLineTabs v-model="activeTab" :tabs="tabs">
          <PerformanceHrbpPermissionTable
            v-if="activeTab === 'auth-list'"
            :rows="rows"
            :page="page"
            :page-size="pageSize"
            :total="rows.length"
            @selection-change="selectedRows = $event"
            @page-change="page = $event"
            @page-size-change="pageSize = $event"
            @create="openCreateDialog"
            @edit="openEditDialog"
            @remove="removePermission"
          />
          <section v-else class="history-panel" aria-label="变更记录"></section>
        </PerformanceLineTabs>
      </PerformanceContentSurface>
      <PerformanceHrbpPermissionDialog
        v-model="showCreateDialog"
        :loading-options="optionsLoading"
        :hrbp-options="hrbpOptions"
        :organization-tree="organizationTree"
        :invisible-people-options="invisiblePeopleOptions"
        :mode="dialogMode"
        :saving="saving"
        :initial-value="initialValue"
        @submit="submitPermission"
      />
    </div>
  </FullScreenModal>
</template>

<style scoped>
.hrbp-permission-page { width: 100%; min-width: 0; min-height: 100%; padding: 24px; box-sizing: border-box; overflow: auto; background: #f5f6f7; }
.hrbp-permission-panel { min-height: calc(100vh - 248px); box-shadow: none; --performance-line-tabs-surface: #fff; }
.history-panel { min-height: 96px; }
</style>
