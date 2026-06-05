<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Close } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import HierarchyTreePicker from '@/components/HierarchyTreePicker.vue'
import {
  scopesApi,
  type ScopeTagItem,
  type ScopePayload,
  type ScopeFilterField,
  type ScopeFilterOp,
} from '@/api/scopes'
import { treesApi, distinctApi, type TreeNode, type DistinctValue, type PersonItem } from '@/api/data'

const list = ref<ScopeTagItem[]>([])
const loading = ref(false)

const DIM_OPTS = [
  { value: '', label: '全部' },
  { value: 'cost_center', label: '成本中心' },
  { value: 'org', label: '组织' },
]
const filterDim = ref('')

const FIELD_OPTS: { value: ScopeFilterField; label: string }[] = [
  { value: 'employment_type', label: '用工类型' },
  { value: 'employment_entity', label: '用工主体' },
  { value: 'person', label: '人员' },
]
const OP_OPTS: { value: ScopeFilterOp; label: string }[] = [
  { value: 'eq', label: '等于' },
  { value: 'neq', label: '不等于' },
]

const drawerOpen = ref(false)
const editing = ref<ScopeTagItem | null>(null)
const saving = ref(false)

interface FilterRow {
  field_code: ScopeFilterField
  operator: ScopeFilterOp
  values: string[]
}

interface FormState {
  name: string
  description: string
  dimension: 'cost_center' | 'org'
  org_scope_enabled: boolean
  org_scope_unlimited: boolean
  selections: { node_id: number; include_descendants: boolean }[]
  person_scope_enabled: boolean
  filters: FilterRow[]
}

const form = reactive<FormState>({
  name: '',
  description: '',
  dimension: 'cost_center',
  org_scope_enabled: true,
  org_scope_unlimited: false,
  selections: [],
  person_scope_enabled: false,
  filters: [],
})

const cc_tree = ref<TreeNode[]>([])
const org_tree = ref<TreeNode[]>([])
const include_inactive = ref(false)

const employmentTypes = ref<DistinctValue[]>([])
const employmentEntities = ref<DistinctValue[]>([])
const personOptionsByRow = ref<Record<number, PersonItem[]>>({})
const personLoadingByRow = ref<Record<number, boolean>>({})

const filteredList = computed(() => {
  if (!filterDim.value) return list.value
  return list.value.filter((s) => s.dimension === filterDim.value)
})

const currentTree = computed(() =>
  form.dimension === 'cost_center' ? cc_tree.value : org_tree.value
)

async function loadList() {
  loading.value = true
  try {
    list.value = await scopesApi.list()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

async function loadTrees() {
  try {
    cc_tree.value = await treesApi.costCenter(include_inactive.value)
    org_tree.value = await treesApi.org(include_inactive.value)
  } catch {
    cc_tree.value = []
    org_tree.value = []
  }
}

async function loadEnums() {
  try {
    employmentTypes.value = await distinctApi.employmentTypes(include_inactive.value)
    employmentEntities.value = await distinctApi.employmentEntities(include_inactive.value)
  } catch {
    employmentTypes.value = []
    employmentEntities.value = []
  }
}

watch(include_inactive, async () => {
  await Promise.all([loadTrees(), loadEnums()])
})

function resetForm() {
  Object.assign(form, {
    name: '',
    description: '',
    dimension: 'cost_center',
    org_scope_enabled: true,
    org_scope_unlimited: false,
    selections: [],
    person_scope_enabled: false,
    filters: [],
  })
  personOptionsByRow.value = {}
  personLoadingByRow.value = {}
  editing.value = null
}

function openCreate() {
  resetForm()
  drawerOpen.value = true
}

function openEdit(row: ScopeTagItem) {
  editing.value = row
  form.name = row.name
  form.description = row.description ?? ''
  form.dimension = row.dimension
  form.org_scope_enabled = row.org_scope_enabled
  form.org_scope_unlimited = row.org_scope_unlimited
  form.selections = row.selections.map((s) => ({
    node_id: s.node_id,
    include_descendants: s.include_descendants,
  }))
  form.person_scope_enabled = row.person_scope_enabled
  form.filters = row.filters.map((f) => ({
    field_code: f.field_code,
    operator: f.operator,
    values: [...f.values],
  }))
  // 编辑模式：把已选 person 值预填到 options，避免回显成空
  personOptionsByRow.value = {}
  form.filters.forEach((f, idx) => {
    if (f.field_code === 'person' && f.values.length) {
      personOptionsByRow.value[idx] = f.values.map((v) => ({
        value: v,
        label: v,
        department: null,
        active: true,
      }))
    }
  })
  drawerOpen.value = true
}

function dimLabel(s: ScopeTagItem): string {
  return s.dimension === 'cost_center' ? '成本中心' : '组织'
}

function summary(s: ScopeTagItem): string {
  const parts: string[] = []
  if (s.org_scope_enabled) {
    if (s.org_scope_unlimited) parts.push('组织不限')
    else parts.push(`组织 ${s.selections.length} 节点`)
  }
  if (s.person_scope_enabled) {
    parts.push(`人员 ${s.filters.length} 条筛选`)
  }
  return parts.join(' / ') || '—'
}

function fieldLabel(f: ScopeFilterField): string {
  return FIELD_OPTS.find((x) => x.value === f)?.label || f
}

function addFilter() {
  form.filters.push({ field_code: 'employment_type', operator: 'eq', values: [] })
}

function removeFilter(idx: number) {
  form.filters.splice(idx, 1)
  // 重排 personOptionsByRow / personLoadingByRow 的 key
  const rebuiltOpts: Record<number, PersonItem[]> = {}
  const rebuiltLoading: Record<number, boolean> = {}
  form.filters.forEach((_, i) => {
    if (personOptionsByRow.value[i]) rebuiltOpts[i] = personOptionsByRow.value[i]
    if (personLoadingByRow.value[i]) rebuiltLoading[i] = personLoadingByRow.value[i]
  })
  personOptionsByRow.value = rebuiltOpts
  personLoadingByRow.value = rebuiltLoading
}

function onFieldChange(idx: number) {
  // 切换字段后清空已选值，避免脏数据
  form.filters[idx].values = []
  if (form.filters[idx].field_code === 'person') {
    personOptionsByRow.value[idx] = []
  }
}

function valueOptionsFor(idx: number): { value: string; label: string }[] {
  const f = form.filters[idx]
  if (f.field_code === 'employment_type') {
    return employmentTypes.value.map((d) => ({
      value: d.value,
      label: `${d.value} (在职 ${d.active_count})`,
    }))
  }
  if (f.field_code === 'employment_entity') {
    return employmentEntities.value.map((d) => ({
      value: d.value,
      label: `${d.value} (在职 ${d.active_count})`,
    }))
  }
  // person：来自远程搜索
  return (personOptionsByRow.value[idx] || []).map((p) => ({
    value: p.value,
    label: p.value + (p.department ? `（${p.department}）` : '') + (p.active ? '' : ' [离职]'),
  }))
}

async function remoteSearchPerson(idx: number, keyword: string) {
  personLoadingByRow.value[idx] = true
  try {
    const list = await distinctApi.persons({
      keyword,
      include_inactive: include_inactive.value,
      limit: 50,
    })
    // 保留已选项，避免下拉里看不到自己选的（如果搜索结果不含）
    const selected = new Set(form.filters[idx].values)
    const seen = new Set(list.map((p) => p.value))
    const merged = [...list]
    selected.forEach((v) => {
      if (!seen.has(v)) merged.push({ value: v, label: v, department: null, active: true })
    })
    personOptionsByRow.value[idx] = merged
  } catch {
    personOptionsByRow.value[idx] = []
  } finally {
    personLoadingByRow.value[idx] = false
  }
}

async function onPersonFocus(idx: number) {
  if (form.filters[idx].field_code !== 'person') return
  if (!personOptionsByRow.value[idx] || personOptionsByRow.value[idx].length === 0) {
    await remoteSearchPerson(idx, '')
  }
}

const filterPreview = computed(() => {
  if (!form.person_scope_enabled || !form.filters.length) return ''
  return form.filters
    .map((f) => {
      const op = f.operator === 'eq' ? '∈' : '∉'
      const vals = f.values.length ? `(${f.values.join(', ')})` : '(未选)'
      return `${fieldLabel(f.field_code)} ${op} ${vals}`
    })
    .join('  AND  ')
})

function buildPayload(): ScopePayload {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    dimension: form.dimension,
    org_scope_enabled: form.org_scope_enabled,
    org_scope_unlimited: form.org_scope_unlimited,
    selections:
      form.org_scope_enabled && !form.org_scope_unlimited
        ? form.selections.map((s) => ({
            node_id: s.node_id,
            include_descendants: s.include_descendants,
          }))
        : [],
    person_scope_enabled: form.person_scope_enabled,
    filters: form.person_scope_enabled
      ? form.filters.map((f, i) => ({
          field_code: f.field_code,
          operator: f.operator,
          values: f.values,
          order_index: i,
        }))
      : [],
  }
}

function validate(): string | null {
  if (!form.name.trim()) return '请填写名称'
  if (!form.org_scope_enabled && !form.person_scope_enabled)
    return '至少启用「管理组织范围」或「管理人员范围」之一'
  if (
    form.org_scope_enabled &&
    !form.org_scope_unlimited &&
    form.selections.length === 0
  )
    return '请勾选组织节点，或选择「不限范围」'
  if (form.person_scope_enabled) {
    if (form.filters.length === 0) return '请至少添加 1 条人员筛选条件'
    for (let i = 0; i < form.filters.length; i++) {
      if (form.filters[i].values.length === 0)
        return `第 ${i + 1} 条筛选条件未选值`
    }
  }
  return null
}

async function save() {
  const err = validate()
  if (err) {
    ElMessage.warning(err)
    return
  }
  saving.value = true
  try {
    const payload = buildPayload()
    if (editing.value) {
      await scopesApi.update(editing.value.id, payload)
      ElMessage.success('已保存')
    } else {
      await scopesApi.create(payload)
      ElMessage.success('已创建')
    }
    drawerOpen.value = false
    await loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: ScopeTagItem) {
  try {
    await ElMessageBox.confirm(`确认删除标签「${row.name}」？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await scopesApi.remove(row.id)
    ElMessage.success('已删除')
    await loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

async function onDimensionChange() {
  if (form.selections.length > 0) {
    try {
      await ElMessageBox.confirm(
        '切换维度会清空已勾选的节点，确认继续？',
        '提示',
        { type: 'warning' }
      )
    } catch {
      // 回滚
      form.dimension = form.dimension === 'cost_center' ? 'org' : 'cost_center'
      return
    }
    form.selections = []
  }
}

onMounted(async () => {
  await loadList()
  await Promise.all([loadTrees(), loadEnums()])
})
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">
            管理单元（数据范围标签，共 {{ filteredList.length }} 个）
          </span>
          <PermissionButton menu="system.scopes" op="C" type="primary" @click="openCreate">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>新建标签
          </PermissionButton>
        </div>
      </template>

      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
        <p style="margin: 0; line-height: 1.6">
          每个标签包含「管理组织范围」和「管理人员范围」两段，可独立启用。
          管理组织范围按成本中心或组织树勾选；管理人员范围按用工类型 / 用工主体 / 人员添加筛选条件。
          单标签内两段取交集，多标签之间取并集。
        </p>
      </el-alert>

      <el-form inline style="margin-bottom: 16px">
        <el-form-item label="维度">
          <el-select v-model="filterDim" placeholder="全部" clearable style="width: 200px">
            <el-option v-for="d in DIM_OPTS" :key="d.value" :label="d.label" :value="d.value" />
          </el-select>
        </el-form-item>
      </el-form>

      <div style="overflow-x: auto">
        <el-table v-loading="loading" :data="filteredList" stripe style="width: 100%" max-height="600">
          <el-table-column label="标签名" min-width="200">
            <template #default="{ row }">
              <strong>{{ row.name }}</strong>
              <div v-if="row.description" style="color: var(--color-text-secondary); font-size: 12px; margin-top: 2px">
                {{ row.description }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="组织维度" width="120">
            <template #default="{ row }">
              <el-tag size="small" effect="plain">{{ dimLabel(row) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="范围概要" min-width="240">
            <template #default="{ row }">{{ summary(row) }}</template>
          </el-table-column>
          <el-table-column label="使用用户" width="100">
            <template #default="{ row }">{{ row.used_by_users }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <PermissionButton menu="system.scopes" op="U" size="small" @click="openEdit(row)">
                <el-icon style="margin-right: 4px"><Edit /></el-icon>编辑
              </PermissionButton>
              <PermissionButton menu="system.scopes" op="D" size="small" type="danger" @click="handleDelete(row)">
                <el-icon style="margin-right: 4px"><Delete /></el-icon>删除
              </PermissionButton>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <el-drawer
      v-model="drawerOpen"
      :title="editing ? `编辑标签 · ${editing.name}` : '新建标签'"
      direction="rtl"
      size="720px"
    >
      <el-form label-position="top">
        <el-form-item label="标签名" required>
          <el-input v-model="form.name" maxlength="64" placeholder="如：研发部正式员工" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>

        <el-checkbox v-model="include_inactive" style="margin-bottom: 12px">
          含离职 / 失效节点（影响下方树和人员下拉）
        </el-checkbox>

        <!-- ===== 管理组织范围 ===== -->
        <el-card shadow="never" style="margin-bottom: 16px">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <strong>管理组织范围</strong>
              <el-switch v-model="form.org_scope_enabled" />
            </div>
          </template>

          <template v-if="form.org_scope_enabled">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px">
              <el-form-item label="维度" required style="margin-bottom: 0">
                <el-select v-model="form.dimension" style="width: 100%" @change="onDimensionChange">
                  <el-option label="成本中心" value="cost_center" />
                  <el-option label="组织" value="org" />
                </el-select>
              </el-form-item>
              <el-form-item label="不限范围" style="margin-bottom: 0">
                <el-switch
                  v-model="form.org_scope_unlimited"
                  active-text="不限（该维度无约束）"
                  inactive-text="按下方勾选"
                />
              </el-form-item>
            </div>

            <div v-if="!form.org_scope_unlimited">
              <div style="margin-bottom: 8px; font-size: 13px; color: var(--color-text-secondary)">
                选择节点（{{ form.selections.length }} 个已勾选）
              </div>
              <HierarchyTreePicker v-model="form.selections" :tree="currentTree" />
            </div>
          </template>
          <div v-else style="color: var(--color-text-placeholder); font-size: 13px">
            未启用 — 该标签将不约束组织范围
          </div>
        </el-card>

        <!-- ===== 管理人员范围 ===== -->
        <el-card shadow="never">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <strong>管理人员范围</strong>
              <el-switch v-model="form.person_scope_enabled" />
            </div>
          </template>

          <template v-if="form.person_scope_enabled">
            <div style="margin-bottom: 8px; font-size: 13px; color: var(--color-text-secondary)">
              筛选条件（满足全部）
            </div>
            <div
              v-for="(f, idx) in form.filters"
              :key="idx"
              style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px"
            >
              <el-select
                v-model="f.field_code"
                style="width: 130px; flex-shrink: 0"
                @change="onFieldChange(idx)"
              >
                <el-option v-for="o in FIELD_OPTS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <el-select v-model="f.operator" style="width: 100px; flex-shrink: 0">
                <el-option v-for="o in OP_OPTS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <el-select
                v-model="f.values"
                multiple
                filterable
                :remote="f.field_code === 'person'"
                :remote-method="f.field_code === 'person' ? (kw: string) => remoteSearchPerson(idx, kw) : undefined"
                :loading="!!personLoadingByRow[idx]"
                placeholder="选择值"
                style="flex: 1; min-width: 200px"
                @focus="onPersonFocus(idx)"
              >
                <el-option
                  v-for="o in valueOptionsFor(idx)"
                  :key="o.value"
                  :label="o.label"
                  :value="o.value"
                />
              </el-select>
              <el-button link type="danger" @click="removeFilter(idx)">
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
            <el-button type="primary" plain size="small" @click="addFilter">
              <el-icon style="margin-right: 4px"><Plus /></el-icon>添加条件
            </el-button>

            <div
              v-if="filterPreview"
              style="margin-top: 12px; padding: 8px 12px; background: var(--el-fill-color-light); border-radius: 4px; font-size: 12px; color: var(--color-text-secondary); font-family: monospace"
            >
              {{ filterPreview }}
            </div>
          </template>
          <div v-else style="color: var(--color-text-placeholder); font-size: 13px">
            未启用 — 该标签将不约束人员范围
          </div>
        </el-card>
      </el-form>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px">
          <el-button @click="drawerOpen = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>
