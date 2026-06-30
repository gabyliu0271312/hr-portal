<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">字段分类（共 {{ list.length }} 个）</span>
          <PermissionButton menu="system.field_categories" op="C" type="primary" @click="openCreate">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>新建分类
          </PermissionButton>
        </div>
      </template>

      <div style="overflow-x: auto">
        <el-table v-loading="loading" :data="list" stripe style="width: 100%" max-height="600">
          <el-table-column label="分类名" min-width="160">
            <template #default="{ row }">
              <strong>{{ row.name }}</strong>
              <el-tag v-if="row.is_sensitive" size="small" type="danger" effect="plain" style="margin-left: 8px">
                敏感
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="280" />
          <el-table-column label="字段数" width="100">
            <template #default="{ row }">{{ row.field_count }}</template>
          </el-table-column>
          <el-table-column label="操作" width="380" fixed="right">
            <template #default="{ row }">
              <PermissionButton menu="system.field_categories" op="U" size="small" @click="openAssignments(row)">
                管理字段
              </PermissionButton>
              <PermissionButton v-if="row.is_sensitive" menu="system.field_categories" op="U" size="small" type="primary" @click="openWhitelist(row)">
                白名单
              </PermissionButton>
              <PermissionButton menu="system.field_categories" op="U" size="small" @click="openEdit(row)">
                编辑
              </PermissionButton>
              <PermissionButton menu="system.field_categories" op="D" size="small" type="danger" @click="removeCat(row)">
                删除
              </PermissionButton>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <!-- 分类编辑对话框 -->
    <el-dialog
      v-model="dialogOpen"
      :title="dialogMode === 'create' ? '新建分类' : '编辑分类'"
      width="480px"
    >
      <el-form label-position="top">
        <el-form-item label="分类名" required>
          <el-input v-model="form.name" placeholder="如：敏感、薪酬、身份证" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            placeholder="该分类的用途说明"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="form.is_sensitive">
            标记为敏感（脱敏视觉与文案会更显眼）
          </el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCategory">
          {{ dialogMode === 'create' ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 字段分配抽屉 -->
    <el-drawer
      v-model="assignmentDrawer"
      :title="`管理字段 · ${assignmentCat?.name ?? ''}`"
      direction="rtl"
      size="540px"
    >
      <el-alert type="info" :closable="false" show-icon class="assignment-alert">
        从业务表字段中勾选后加入当前分类。已加入的字段会用于敏感字段识别、角色/用户字段可见范围控制。
      </el-alert>

      <div class="assignment-picker">
        <div class="assignment-toolbar">
          <el-select
            v-model="currentTable"
            filterable
            placeholder="选择业务表"
            class="table-select"
            :disabled="columnsLoading"
            @change="loadTableColumns"
          >
            <el-option
              v-for="t in tables"
              :key="t.table_name"
              :label="t.label"
              :value="t.table_name"
            />
          </el-select>
          <el-input
            v-model="fieldKeyword"
            clearable
            :prefix-icon="Search"
            placeholder="搜索字段名称/编码"
            class="field-search"
          />
          <el-button
            type="primary"
            :disabled="!selectedAssignableCodes.length"
            @click="addSelectedAssignments"
          >
            <el-icon style="margin-right: 4px"><Plus /></el-icon>加入分类
          </el-button>
        </div>

        <el-table
          ref="fieldSelectTableRef"
          v-loading="columnsLoading"
          :data="filteredTableColumns"
          row-key="column_code"
          height="280"
          class="field-select-table"
          @selection-change="onColumnSelectionChange"
        >
          <el-table-column type="selection" width="42" />
          <el-table-column label="字段" min-width="220">
            <template #default="{ row }">
              <div class="field-name">
                <span>{{ row.column_label }}</span>
                <el-tag v-if="row.is_sensitive" size="small" type="warning" effect="plain">敏感</el-tag>
              </div>
              <div class="field-code">{{ row.column_code }}</div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="90">
            <template #default="{ row }">{{ dataTypeLabel(row.data_type) }}</template>
          </el-table-column>
          <template #empty>
            <div class="assignment-empty">
              {{ currentTable ? '当前表暂无可选字段' : '请先选择业务表' }}
            </div>
          </template>
        </el-table>
      </div>

      <div style="font-size: 14px; font-weight: 600; margin-top: 24px; margin-bottom: 12px">
        已分配（{{ assignments.length }}）
      </div>
      <div class="assigned-list">
        <div
          v-for="(a, i) in assignments"
          :key="`${a.table_name}.${a.column_name}`"
          class="assigned-row"
        >
          <span class="assigned-table">
            {{ tableLabel(a.table_name) }}
          </span>
          <span class="assigned-field">
            <span>{{ columnLabel(a) }}</span>
            <span class="field-code">{{ a.column_name }}</span>
          </span>
          <el-button link size="small" type="danger" @click="removeAssignment(i)">
            移除
          </el-button>
        </div>
        <div v-if="!assignments.length" class="assignment-empty">
          尚未分配任何字段
        </div>
      </div>

      <template #footer>
        <div style="text-align: right">
          <el-button @click="assignmentDrawer = false">取消</el-button>
          <el-button type="primary" :loading="assignSaving" @click="saveAssignments">
            保存分配
          </el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 授权工具白名单对话框 -->
    <el-dialog v-model="whitelistOpen" :title="`授权工具白名单 · ${whitelistCat?.name ?? ''}`" width="460px">
      <p style="color: var(--color-text-secondary); font-size: 13px; line-height: 1.6; margin-top: 0">
        勾选的工具,允许「无本分类权限」的用户在其中使用该分类字段(原值可见、可计算);<br />
        不在白名单的通用数据集/报表,该类字段完全不可用。
      </p>
      <el-checkbox-group v-model="whitelistKeys">
        <el-checkbox v-for="t in tools" :key="t.key" :value="t.key" border style="display: block; margin: 0 0 8px">
          {{ t.label }}
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="whitelistOpen = false">取消</el-button>
        <el-button type="primary" :loading="whitelistSaving" @click="saveWhitelist">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type TableInstance } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import {
  fieldCategoriesApi,
  type FieldCategory,
  type Assignment,
  type ToolOption,
} from '@/api/field_categories'
import {
  tableColumnsApi,
  type TableColumn,
  type TableMeta,
} from '@/api/table_columns'

const list = ref<FieldCategory[]>([])
const loading = ref(false)

const dialogOpen = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref<number | null>(null)
const form = reactive({ name: '', description: '', is_sensitive: false })
const saving = ref(false)

const assignmentDrawer = ref(false)
const assignmentCat = ref<FieldCategory | null>(null)
const assignments = ref<Assignment[]>([])
const assignSaving = ref(false)
const tables = ref<TableMeta[]>([])
const currentTable = ref('')
const tableColumns = ref<TableColumn[]>([])
const columnsLoading = ref(false)
const selectedColumns = ref<TableColumn[]>([])
const fieldKeyword = ref('')
const fieldSelectTableRef = ref<TableInstance>()

// ===== 授权工具白名单 =====
const tools = ref<ToolOption[]>([])
const whitelistOpen = ref(false)
const whitelistCat = ref<FieldCategory | null>(null)
const whitelistKeys = ref<string[]>([])
const whitelistSaving = ref(false)

async function openWhitelist(cat: FieldCategory) {
  whitelistCat.value = cat
  try {
    const r = await fieldCategoriesApi.getWhitelist(cat.id)
    whitelistKeys.value = r.tool_keys
  } catch {
    whitelistKeys.value = []
  }
  whitelistOpen.value = true
}

async function saveWhitelist() {
  if (!whitelistCat.value) return
  whitelistSaving.value = true
  try {
    await fieldCategoriesApi.setWhitelist(whitelistCat.value.id, whitelistKeys.value)
    ElMessage.success('已保存白名单')
    whitelistOpen.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    whitelistSaving.value = false
  }
}

const DATA_TYPES = [
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '日期', value: 'date' },
  { label: '日期时间', value: 'datetime' },
  { label: '布尔', value: 'bool' },
  { label: '值列表', value: 'enum' },
]

const assignmentKey = (tableName: string, columnName: string) => `${tableName}.${columnName}`
const assignedKeys = computed(
  () => new Set(assignments.value.map((a) => assignmentKey(a.table_name, a.column_name)))
)
const selectedAssignableCodes = computed(() =>
  selectedColumns.value
    .filter((c) => !assignedKeys.value.has(assignmentKey(currentTable.value, c.column_code)))
    .map((c) => c.column_code)
)

const filteredTableColumns = computed(() => {
  const keyword = fieldKeyword.value.trim().toLowerCase()
  return tableColumns.value.filter((c) => {
    if (assignedKeys.value.has(assignmentKey(currentTable.value, c.column_code))) return false
    if (!keyword) return true
    return `${c.column_label} ${c.column_code}`.toLowerCase().includes(keyword)
  })
})

async function load() {
  loading.value = true
  try {
    list.value = await fieldCategoriesApi.list()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

async function loadTables() {
  try {
    tables.value = await tableColumnsApi.tables()
    if (!currentTable.value && tables.value.length) {
      currentTable.value = tables.value[0].table_name
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载业务表失败')
    tables.value = []
  }
}

async function loadTableColumns() {
  if (!currentTable.value) {
    tableColumns.value = []
    return
  }
  columnsLoading.value = true
  selectedColumns.value = []
  try {
    tableColumns.value = await tableColumnsApi.list(currentTable.value)
  } catch (e: any) {
    tableColumns.value = []
    ElMessage.error(e?.response?.data?.detail || '加载字段失败')
  } finally {
    columnsLoading.value = false
  }
}

function openCreate() {
  dialogMode.value = 'create'
  editingId.value = null
  Object.assign(form, { name: '', description: '', is_sensitive: false })
  dialogOpen.value = true
}

function openEdit(cat: FieldCategory) {
  dialogMode.value = 'edit'
  editingId.value = cat.id
  Object.assign(form, {
    name: cat.name,
    description: cat.description ?? '',
    is_sensitive: cat.is_sensitive,
  })
  dialogOpen.value = true
}

async function saveCategory() {
  if (!form.name.trim()) {
    ElMessage.warning('分类名必填')
    return
  }
  saving.value = true
  try {
    const body = {
      name: form.name,
      description: form.description || undefined,
      is_sensitive: form.is_sensitive,
    }
    if (dialogMode.value === 'create') {
      await fieldCategoriesApi.create(body)
      ElMessage.success('分类已创建')
    } else if (editingId.value !== null) {
      await fieldCategoriesApi.update(editingId.value, body)
      ElMessage.success('分类已更新')
    }
    dialogOpen.value = false
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function removeCat(cat: FieldCategory) {
  try {
    await ElMessageBox.confirm(`删除分类 "${cat.name}"？`, '提示', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await fieldCategoriesApi.remove(cat.id)
    ElMessage.success('已删除')
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

async function openAssignments(cat: FieldCategory) {
  assignmentCat.value = cat
  try {
    assignments.value = await fieldCategoriesApi.getAssignments(cat.id)
    assignmentDrawer.value = true
    if (!tables.value.length) {
      await loadTables()
    }
    if (!currentTable.value && assignments.value[0]?.table_name) {
      currentTable.value = assignments.value[0].table_name
    }
    if (!currentTable.value && tables.value[0]) {
      currentTable.value = tables.value[0].table_name
    }
    await loadTableColumns()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  }
}

function onColumnSelectionChange(rows: TableColumn[]) {
  selectedColumns.value = rows
}

function addSelectedAssignments() {
  if (!currentTable.value) {
    ElMessage.warning('请先选择业务表')
    return
  }
  const next = selectedColumns.value.filter(
    (c) => !assignedKeys.value.has(assignmentKey(currentTable.value, c.column_code))
  )
  if (!next.length) {
    ElMessage.warning('请选择尚未加入分类的字段')
    return
  }
  assignments.value.push(
    ...next.map((c) => ({
      table_name: currentTable.value,
      column_name: c.column_code,
    }))
  )
  selectedColumns.value = []
  fieldSelectTableRef.value?.clearSelection()
  ElMessage.success(`已加入 ${next.length} 个字段`)
}

function removeAssignment(idx: number) {
  assignments.value.splice(idx, 1)
}

async function saveAssignments() {
  if (!assignmentCat.value) return
  assignSaving.value = true
  try {
    await fieldCategoriesApi.setAssignments(
      assignmentCat.value.id,
      assignments.value
    )
    ElMessage.success('分配已保存')
    assignmentDrawer.value = false
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    assignSaving.value = false
  }
}

const tableLabel = (val: string) =>
  tables.value.find((t) => t.table_name === val)?.label ?? val

const dataTypeLabel = (val: string) =>
  DATA_TYPES.find((t) => t.value === val)?.label ?? val

function columnLabel(a: Assignment) {
  if (a.table_name !== currentTable.value) return a.column_name
  return tableColumns.value.find((c) => c.column_code === a.column_name)?.column_label ?? a.column_name
}

onMounted(async () => {
  await Promise.all([load(), loadTables()])
  await loadTableColumns()
  try {
    tools.value = await fieldCategoriesApi.tools()
  } catch {
    tools.value = []
  }
})
</script>

<style scoped>
.assignment-alert {
  margin-bottom: 16px;
}

.assignment-picker {
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--color-bg-subtle);
}

.assignment-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.table-select {
  width: 210px;
}

.field-search {
  flex: 1;
  min-width: 180px;
}

.field-select-table {
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
}

.field-name {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.field-code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-secondary);
  word-break: break-all;
}

.assigned-list {
  border-top: 1px solid var(--color-border-light);
}

.assigned-row {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) 48px;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border-light);
}

.assigned-table {
  color: var(--color-text-regular);
  font-size: 13px;
}

.assigned-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  color: var(--color-text-primary);
  font-size: 13px;
}

.assignment-empty {
  padding: 28px 0;
  text-align: center;
  color: var(--color-text-placeholder);
  font-size: 13px;
}
</style>
