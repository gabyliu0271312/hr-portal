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
              <PermissionButton menu="system.field_categories" op="V" size="small" @click="openAssignments(row)">
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
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px">添加字段</div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <el-select
          v-model="newRow.table_name"
          placeholder="选择表"
          style="width: 220px"
        >
          <el-option
            v-for="t in KNOWN_TABLES"
            :key="t.value"
            :label="t.label"
            :value="t.value"
          />
        </el-select>
        <el-input
          v-model="newRow.column_name"
          placeholder="字段名（如 base_salary）"
          style="width: 200px"
          @keyup.enter="addAssignment"
        />
        <el-button @click="addAssignment">+ 添加</el-button>
      </div>

      <div style="font-size: 14px; font-weight: 600; margin-top: 24px; margin-bottom: 12px">
        已分配（{{ assignments.length }}）
      </div>
      <div>
        <div
          v-for="(a, i) in assignments"
          :key="`${a.table_name}.${a.column_name}`"
          style="display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--color-border-light)"
        >
          <span style="flex: 0 0 180px; font-size: 13px; color: var(--color-text-regular)">
            {{ tableLabel(a.table_name) }}
          </span>
          <span style="flex: 1; font-size: 13px; font-family: monospace; color: var(--color-text-primary)">
            {{ a.column_name }}
          </span>
          <el-button link size="small" type="danger" @click="removeAssignment(i)">
            移除
          </el-button>
        </div>
        <div v-if="!assignments.length" style="padding: 32px 0; text-align: center; color: var(--color-text-placeholder); font-size: 13px">
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
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import {
  fieldCategoriesApi,
  type FieldCategory,
  type Assignment,
  type ToolOption,
} from '@/api/field_categories'

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
const newRow = reactive<Assignment>({ table_name: '', column_name: '' })
const assignSaving = ref(false)

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

const KNOWN_TABLES = [
  { value: 'emp_realtime_roster', label: '员工实时花名册' },
  { value: 'emp_monthly_roster', label: '员工月度花名册' },
  { value: 'emp_monthly_salary', label: '员工月度工资表' },
  { value: 'emp_monthly_allocation', label: '员工月度成本分摊表' },
  { value: 'cost_center_monthly', label: '成本中心月度维护表' },
  { value: 'emp_monthly_cost_class', label: '员工月度成本归集分类表' },
  { value: 'users', label: '系统用户表（仅示意）' },
]

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
    Object.assign(newRow, { table_name: '', column_name: '' })
    assignmentDrawer.value = true
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  }
}

function addAssignment() {
  if (!newRow.table_name || !newRow.column_name.trim()) {
    ElMessage.warning('请选择表并填写字段名')
    return
  }
  const dup = assignments.value.find(
    (a) =>
      a.table_name === newRow.table_name &&
      a.column_name === newRow.column_name
  )
  if (dup) {
    ElMessage.warning('该字段已在列表中')
    return
  }
  assignments.value.push({
    table_name: newRow.table_name,
    column_name: newRow.column_name.trim(),
  })
  newRow.column_name = ''
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
  KNOWN_TABLES.find((t) => t.value === val)?.label ?? val

onMounted(async () => {
  await load()
  try {
    tools.value = await fieldCategoriesApi.tools()
  } catch {
    tools.value = []
  }
})
</script>
