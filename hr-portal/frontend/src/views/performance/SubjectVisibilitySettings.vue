<template>
  <div class="subject-visibility-settings-page">
    <h1>被评估人信息可见性设置</h1>
    <div class="subject-visibility-description">配置不同角色可见的被评估人信息字段，如各角色在被评估人绩效详情页、任务列表页和导出的表格可见的字段</div>
    <section class="subject-visibility-card">
      <div v-if="loadError" class="subject-visibility-error" role="alert">
        <span>{{ loadError }}</span>
        <button type="button" @click="load">重新加载</button>
      </div>
      <PerformanceManagementTable
        v-else
        :rows="rows"
        :loading="loading"
        loading-text="正在加载可见性设置…"
        empty-text="暂无可见性设置"
        table-aria-label="被评估人信息可见性设置"
        pagination-aria-label="被评估人信息可见性设置分页"
        :page="page"
        :page-size="pageSize"
        :total="total"
        @page-change="changePage"
        @page-size-change="changePageSize"
      >
        <el-table-column prop="role_name" label="角色名称" min-width="160" />
        <el-table-column label="可见标签信息" min-width="160">
          <template #default="{ row }">{{ row.visible_labels.length ? row.visible_labels.join('，') : '--' }}</template>
        </el-table-column>
        <el-table-column label="可见字段" min-width="420">
          <template #default="{ row }">{{ visibleFieldLabels(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <PerformancePermissionButton class="subject-visibility-action" :allowed="true" op="U" :disabled="loading" :aria-label="`编辑${row.role_name}`" @click="edit(row)">编辑</PerformancePermissionButton>
          </template>
        </el-table-column>
      </PerformanceManagementTable>
    </section>
    <PerformanceSubjectVisibilityEditor
      v-model="editorOpen"
      :role="editingRole"
      :field-options="fieldOptions"
      :saving="saving"
      @submit="save"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  performanceSubjectVisibilityApi,
  type PerformanceSubjectVisibilityFieldOption,
  type PerformanceSubjectVisibilityRole,
} from '@/api/performance'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'
import PerformanceSubjectVisibilityEditor from '@/components/performance/PerformanceSubjectVisibilityEditor.vue'

const rows = ref<PerformanceSubjectVisibilityRole[]>([])
const fieldOptions = ref<PerformanceSubjectVisibilityFieldOption[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const editorOpen = ref(false)
const editingRole = ref<PerformanceSubjectVisibilityRole | null>(null)

function visibleFieldLabels(row: PerformanceSubjectVisibilityRole) {
  const labels = new Map(fieldOptions.value.map(option => [option.key, option.label]))
  return row.visible_fields.map(field => labels.get(field) || field).join('，') || '--'
}
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await performanceSubjectVisibilityApi.list(page.value, pageSize.value)
    rows.value = result.items
    total.value = result.total
    fieldOptions.value = result.field_options
  } catch (error: any) {
    loadError.value = error?.response?.data?.detail || '被评估人信息可见性设置加载失败'
  } finally {
    loading.value = false
  }
}
function changePage(value: number) { page.value = value; void load() }
function changePageSize(value: number) { pageSize.value = value; page.value = 1; void load() }
function edit(row: PerformanceSubjectVisibilityRole) { editingRole.value = row; editorOpen.value = true }
async function save(visibleFields: string[]) {
  if (!editingRole.value) return
  saving.value = true
  try {
    const updated = await performanceSubjectVisibilityApi.update(editingRole.value.role_key, visibleFields)
    rows.value = rows.value.map(row => row.role_key === updated.role_key ? updated : row)
    editorOpen.value = false
    ElMessage.success('保存成功')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '被评估人信息可见性设置保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => void load())
</script>

<style scoped>
.subject-visibility-settings-page{min-height:0;color:#1f2329;font-family:var(--font-sans)}.subject-visibility-settings-page>h1{margin:0 0 16px;font-size:20px;font-weight:600;line-height:28px}.subject-visibility-description{margin-bottom:16px;color:#646a73;font-size:14px;font-weight:400;line-height:21px}.subject-visibility-card{min-height:0;padding:20px;box-sizing:border-box;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px}.subject-visibility-error{display:flex;min-height:160px;align-items:center;justify-content:center;gap:12px;color:#646a73}.subject-visibility-error button{padding:0;border:0;background:transparent;color:#1456f0;cursor:pointer;font:inherit}.subject-visibility-card :deep(.performance-management-table .table-pagination){margin-bottom:0}
</style>
