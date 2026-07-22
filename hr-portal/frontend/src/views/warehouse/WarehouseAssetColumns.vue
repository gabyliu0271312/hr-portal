<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, View, Connection, EditPen, Plus, Delete } from '@element-plus/icons-vue'
import Sortable from 'sortablejs'
import { listAssetColumns, impactField, type AssetColumn, type ImpactResult } from '@/api/warehouse'
import { tableColumnsApi, type ColumnUpdatePayload } from '@/api/table_columns'
import { employeeProfileFieldsApi, type EmployeeProfileFieldConfig } from '@/api/employee_profile_fields'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const tableName = route.params.table as string

const columns = ref<AssetColumn[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const employeeProfileFields = ref<EmployeeProfileFieldConfig[]>([])
const isEmployeeRoster = computed(() => tableName === 'emp_realtime_roster')

// 详情/编辑抽屉
const drawerVisible = ref(false)
const selectedColumn = ref<AssetColumn | null>(null)
const editMode = ref(false)
const isCreateMode = ref(false)
const newColumnCode = ref('')
const existingColumnCodes = computed(() => columns.value.map((c) => c.column_code))
const editForm = ref({
  column_label: '', agg_role: 'dimension',
  is_pk_part: false, is_sensitive: false, is_visible: true, copy_from_last_month: false,
  scope_role: '', display_order: 0, description: '',
  enum_options: [] as string[],
  formula_expr: '' as string,
  data_type: 'string',
})
const editSaving = ref(false)

// 影响分析
const impactVisible = ref(false)
const impactResult = ref<ImpactResult | null>(null)
const impactLoading = ref(false)

const DATA_TYPES = ['string', 'number', 'date', 'datetime', 'bool', 'enum']
const DATA_TYPE_LABELS: Record<string, string> = { string: '字符串', number: '数字', date: '日期', datetime: '日期时间', bool: '布尔', enum: '值列表' }
const AGG_ROLES = [{ label: '维度', value: 'dimension' }, { label: '度量', value: 'measure' }]
const SCOPE_ROLES = [
  { label: '— 未设置 —', value: '' },
  { label: '成本中心编码', value: 'cc_code' },
  { label: '组织节点编码', value: 'org_node_code' },
  { label: '用工类型', value: 'employment_type' },
  { label: '用工主体', value: 'employment_entity' },
  { label: '人员', value: 'person' },
]
const AGG_LABELS: Record<string, string> = { dimension: '维度', measure: '度量' }
const refOptions = computed(() => columns.value.filter((c) => c.column_code !== selectedColumn.value?.column_code))

function insertRef(code: string) {
  editForm.value.formula_expr = (editForm.value.formula_expr || '') + `[${code}]`
}

// ====== SortableJS 拖拽排序 ======
const tableRef = ref<any>(null)

function initSortable() {
  if (!tableRef.value) return
  const el = tableRef.value.$el?.querySelector?.('.el-table__body-wrapper tbody')
  if (!el) return
  Sortable.create(el, {
    handle: '.drag-handle',
    animation: 150,
    onEnd: async (evt) => {
      const { oldIndex, newIndex } = evt
      if (oldIndex == null || newIndex == null || oldIndex === newIndex) return
      const moved = columns.value.splice(oldIndex, 1)[0]
      columns.value.splice(newIndex, 0, moved)
      columns.value.forEach((c, i) => { c.display_order = (i + 1) * 10 })
      const payloads = columns.value.map(c => ({ id: c.id, display_order: c.display_order, column_code: c.column_code }))
      try { await tableColumnsApi.bulkUpdate(tableName, payloads as any) } catch { ElMessage.error('排序保存失败'); load() }
    },
  })
}

async function load() {
  loading.value = true; error.value = null
  try {
    const res = await listAssetColumns(tableName)
    columns.value = res.columns.sort((a, b) => a.display_order - b.display_order)
    employeeProfileFields.value = isEmployeeRoster.value ? await employeeProfileFieldsApi.list() : []
    await nextTick(); initSortable()
  } catch (e: any) { error.value = e?.response?.data?.detail || '加载字段列表失败' } finally { loading.value = false }
}

function employeeProfileField(columnCode: string) { return employeeProfileFields.value.find(field => field.column_name === columnCode) }
async function setEmployeeProfileQueryable(columnCode: string, isQueryable: boolean) {
  const field = employeeProfileField(columnCode)
  if (!field) return
  const previous = field.is_queryable
  field.is_queryable = isQueryable
  try { employeeProfileFields.value = await employeeProfileFieldsApi.update(employeeProfileFields.value) }
  catch (cause: any) { field.is_queryable = previous; ElMessage.error(cause?.response?.data?.detail || '员工档案字段配置保存失败') }
}

function goBack() { router.back() }

// ====== 新建字段 ======
function openCreate() {
  isCreateMode.value = true
  selectedColumn.value = null
  newColumnCode.value = ''
  editForm.value = {
    column_label: '', agg_role: 'dimension',
    is_pk_part: false, is_sensitive: false, is_visible: true, copy_from_last_month: false,
    scope_role: '',
    display_order: (columns.value[columns.value.length - 1]?.display_order ?? 0) + 10,
    description: '', enum_options: [], formula_expr: '',
    data_type: 'string',
  }
  editMode.value = true; drawerVisible.value = true
}

// ====== 编辑字段 ======
function enterEdit(col: AssetColumn) {
  isCreateMode.value = false
  selectedColumn.value = col
  editForm.value = {
    column_label: col.column_label, agg_role: col.agg_role || 'dimension',
    is_pk_part: col.is_pk_part, is_sensitive: col.is_sensitive, is_visible: col.is_visible,
    copy_from_last_month: false,
    scope_role: col.scope_role || '', display_order: col.display_order, description: col.description || '',
    enum_options: Array.isArray(col.enum_options) ? [...col.enum_options] : [],
    formula_expr: col.formula_expr || '',
    data_type: col.data_type || 'string',
  }
  editMode.value = true; drawerVisible.value = true
}

function buildPayload(): ColumnUpdatePayload {
  const f = editForm.value
  const p: Record<string, any> = {
    column_code: isCreateMode.value ? newColumnCode.value : selectedColumn.value!.column_code,
    column_label: f.column_label,
    data_type: f.data_type || 'string',
    is_pk_part: f.is_pk_part, is_sensitive: f.is_sensitive,
    is_visible: f.is_visible, display_order: f.display_order,
    description: f.description || null, scope_role: f.scope_role || null,
    copy_from_last_month: f.copy_from_last_month, agg_role: f.agg_role,
    enum_options: null,
  }
  return p as ColumnUpdatePayload
}

async function saveEdit() {
  if (!editForm.value.column_label.trim()) { ElMessage.warning('字段名称必填'); return }
  if (isCreateMode.value && !newColumnCode.value.trim()) { ElMessage.warning('字段编码必填'); return }
  editSaving.value = true
  try {
    if (isCreateMode.value) {
      await tableColumnsApi.create(tableName, buildPayload())
      ElMessage.success('字段已创建')
    } else {
      const payload = buildPayload()
      const typeChanged = editForm.value.data_type !== selectedColumn.value?.data_type
      if (typeChanged) {
        try {
          await ElMessageBox.confirm(
            `字段「${editForm.value.column_label}」已有数据，确认将类型从「${DATA_TYPE_LABELS[selectedColumn.value?.data_type || ''] || selectedColumn.value?.data_type}」改为「${DATA_TYPE_LABELS[editForm.value.data_type] || editForm.value.data_type}」？已有数据将执行类型转换。`,
            '确认类型变更', { type: 'warning', confirmButtonText: '确认变更', cancelButtonText: '取消' }
          )
        } catch { editSaving.value = false; return }
        ;(payload as any).confirm_type_change = true
      }
      await tableColumnsApi.update(tableName, selectedColumn.value!.id, payload)
      ElMessage.success('字段已更新')
    }
    editMode.value = false; load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') } finally { editSaving.value = false }
}

function cancelEdit() { editMode.value = false; isCreateMode.value = false }

async function doDelete(col: AssetColumn) {
  try {
    await ElMessageBox.confirm(`确定删除字段"${col.column_label}"(${col.column_code})？此操作不可恢复。`, '确认删除', { type: 'warning' })
  } catch { return }
  try {
    await tableColumnsApi.remove(tableName, col.id!)
    ElMessage.success('字段已删除')
    await load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '删除失败') }
}
function showDetail(col: AssetColumn) { selectedColumn.value = col; editMode.value = false; drawerVisible.value = true }

async function showImpact(col: AssetColumn) {
  impactVisible.value = true; impactLoading.value = true
  try { impactResult.value = await impactField(tableName, col.column_code) }
  catch { ElMessage.error('影响分析查询失败') } finally { impactLoading.value = false }
}

onMounted(load)
</script>

<template>
  <div style="padding: 24px">
    <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between">
      <div style="display: flex; align-items: center; gap: 12px">
        <el-button text :icon="ArrowLeft" @click="goBack">返回</el-button>
        <h2 style="margin: 0; font-size: 18px">{{ tableName }} · 字段定义</h2>
        <span style="color: #909399; font-size: 12px">拖拽行可调整排序</span>
      </div>
      <el-button v-if="userStore.hasOp('warehouse.assets','C')" type="primary" size="small" @click="openCreate">新增字段</el-button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon :closable="false" style="margin-bottom: 16px" />

    <el-card shadow="never">
      <el-table ref="tableRef" v-loading="loading" :data="columns" border stripe size="small" empty-text="暂无字段定义" row-key="id" max-height="calc(100vh - 260px)">
        <el-table-column width="36" align="center" fixed="left">
          <template #default>
            <span class="drag-handle" style="cursor: grab; color: #909399; font-size: 16px; user-select: none">⋮⋮</span>
          </template>
        </el-table-column>
        <el-table-column label="序号" width="50" align="center">
          <template #default="{ row }">{{ row.display_order }}</template>
        </el-table-column>
        <el-table-column label="字段" min-width="200">
          <template #default="{ row }">
            <div style="line-height: 1.4">
              <div style="display: flex; align-items: center; gap: 6px">
                <span style="font-weight: 500">{{ row.column_label }}</span>
                <el-tag v-if="row.is_computed" size="small" type="success">公式</el-tag>
                <el-tag v-if="row.is_pk_part" size="small" type="danger" effect="plain">主键</el-tag>
                <el-tag v-if="row.is_sensitive" size="small" type="warning" effect="plain">敏感</el-tag>
              </div>
              <span style="font-family: monospace; font-size: 12px; color: #909399">{{ row.column_code }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="80" align="center">
          <template #default="{ row }">{{ DATA_TYPE_LABELS[row.data_type] || row.data_type }}</template>
        </el-table-column>
        <el-table-column label="维度/度量" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.agg_role === 'measure' ? 'success' : 'info'" effect="plain">{{ AGG_LABELS[row.agg_role] || row.agg_role }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="属性" min-width="140">
          <template #default="{ row }">
            <div style="display: flex; flex-wrap: wrap; gap: 3px">
              <el-tag v-if="!row.is_visible" size="small" type="info" effect="plain">隐藏</el-tag>
              <el-tag v-if="row.data_type === 'enum'" size="small">值列表·{{ row.enum_options?.length || 0 }}</el-tag>
              <el-tag v-if="row.scope_role" size="small" type="primary" effect="plain">权限：{{ SCOPE_ROLES.find(r => r.value === row.scope_role)?.label || row.scope_role }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="isEmployeeRoster" label="员工档案可查询" width="150">
          <template #default="{ row }"><el-switch :model-value="employeeProfileField(row.column_code)?.is_queryable || false" :disabled="!userStore.hasOp('warehouse.assets','U')" inline-prompt active-text="开" inactive-text="关" @change="setEmployeeProfileQueryable(row.column_code, $event)" /></template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" :icon="View" @click="showDetail(row)">详情</el-button>
            <el-button v-if="userStore.hasOp('warehouse.assets','U')" text size="small" :icon="EditPen" @click="enterEdit(row)">编辑</el-button>
            <el-button v-if="userStore.hasOp('warehouse.assets','D')" text size="small" type="danger" :icon="Delete" @click="doDelete(row)">删除</el-button>
            <el-button text size="small" :icon="Connection" @click="showImpact(row)">影响</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 字段详情/编辑/新建抽屉 -->
    <el-drawer v-model="drawerVisible" :title="isCreateMode ? '新建字段' : editMode ? '编辑字段' : '字段详情'" size="520px" @close="selectedColumn = null; editMode = false; isCreateMode = false">
      <template v-if="editMode">
        <el-form label-position="top" size="small" style="padding: 0 8px">
          <el-form-item label="字段名称" required>
            <el-input v-model="editForm.column_label" placeholder="展示给用户看的中文名" />
          </el-form-item>

          <!-- 新建模式：字段编码可输入 -->
          <el-form-item v-if="isCreateMode" label="字段编码" required>
            <el-input v-model="newColumnCode" placeholder="英文字母+数字+下划线，如 calc_bonus" />
            <div style="font-size: 12px; color: #909399; margin-top: 2px">创建后不可修改。只允许小写字母、数字、下划线</div>
          </el-form-item>
          <el-form-item v-else label="字段编码">
            <el-input :model-value="selectedColumn?.column_code" disabled />
            <div style="font-size: 12px; color: #909399; margin-top: 2px">字段编码与源端 key 绑定，不可修改</div>
          </el-form-item>

          <el-form-item label="数据类型">
            <el-select v-model="editForm.data_type" style="width: 100%">
              <el-option v-for="t in DATA_TYPES" :key="t" :label="DATA_TYPE_LABELS[t] || t" :value="t" />
            </el-select>
            <div v-if="!isCreateMode && editForm.data_type !== selectedColumn?.data_type" style="font-size: 12px; color: #e6a23c; margin-top: 2px">
              类型变更将对已有数据执行类型转换，保存时需二次确认
            </div>
          </el-form-item>

          <el-form-item label="维度/度量">
            <el-radio-group v-model="editForm.agg_role">
              <el-radio-button v-for="r in AGG_ROLES" :key="r.value" :value="r.value">{{ r.label }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="字段属性">
            <el-checkbox v-model="editForm.is_pk_part">参与业务主键</el-checkbox>
            <el-checkbox v-model="editForm.is_sensitive">敏感字段</el-checkbox>
            <el-checkbox v-model="editForm.is_visible">列表展示</el-checkbox>
            <el-checkbox v-model="editForm.copy_from_last_month">复制上月</el-checkbox>
          </el-form-item>
          <el-form-item label="权限角色">
            <el-select v-model="editForm.scope_role" clearable style="width: 100%" placeholder="不参与权限过滤">
              <el-option v-for="r in SCOPE_ROLES.filter(x => x.value)" :key="r.value" :label="r.label" :value="r.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="显示顺序">
            <el-input-number v-model="editForm.display_order" :min="0" :max="9999" controls-position="right" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="editForm.description" type="textarea" :rows="2" />
          </el-form-item>
        </el-form>
        <div style="display: flex; gap: 8px; margin-top: 16px; padding: 0 8px">
          <el-button type="primary" :loading="editSaving" @click="saveEdit">{{ isCreateMode ? '创建' : '保存' }}</el-button>
          <el-button @click="cancelEdit">取消</el-button>
        </div>
      </template>

      <!-- 查看模式 -->
      <template v-else-if="selectedColumn">
        <el-card header="基础信息" shadow="never" style="margin-bottom: 12px">
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="字段编码">{{ selectedColumn.column_code }}</el-descriptions-item>
            <el-descriptions-item label="字段名称">{{ selectedColumn.column_label }}</el-descriptions-item>
            <el-descriptions-item label="数据类型">{{ DATA_TYPE_LABELS[selectedColumn.data_type] || selectedColumn.data_type }}</el-descriptions-item>
            <el-descriptions-item label="描述">{{ selectedColumn.description || '—' }}</el-descriptions-item>
            <el-descriptions-item label="可见">{{ selectedColumn.is_visible ? '是' : '否' }}</el-descriptions-item>
            <el-descriptions-item label="展示顺序">{{ selectedColumn.display_order }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
        <el-card header="数仓属性" shadow="never" style="margin-bottom: 12px">
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="维度/度量">{{ AGG_LABELS[selectedColumn.agg_role] || selectedColumn.agg_role }}</el-descriptions-item>
            <el-descriptions-item label="来源">{{ selectedColumn.source }}</el-descriptions-item>
            <el-descriptions-item label="计算字段">{{ selectedColumn.is_computed ? '是' : '否' }}</el-descriptions-item>
            <el-descriptions-item label="计算公式">{{ selectedColumn.formula_expr || '—' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
        <el-card header="权限属性" shadow="never">
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="敏感字段">{{ selectedColumn.is_sensitive ? '是' : '否' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </template>
    </el-drawer>

    <!-- 影响分析弹窗 -->
    <el-dialog v-model="impactVisible" title="影响分析" width="600px">
      <div v-loading="impactLoading">
        <template v-if="impactResult">
          <el-alert v-if="impactResult.blocking" type="danger" title="存在高风险引用" :description="'该字段被引用且不可直接修改/删除'" show-icon style="margin-bottom: 12px" />
          <el-alert v-else type="success" title="无阻塞引用" show-icon style="margin-bottom: 12px" />
          <el-table v-if="impactResult.references.length" :data="impactResult.references" size="small" border>
            <el-table-column prop="type" label="类型" width="80" />
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column prop="usage" label="用途" min-width="100" />
            <el-table-column prop="risk_level" label="风险" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="({low:'success',medium:'warning',high:'danger'} as Record<string,string>)[row.risk_level]||'info'">{{ row.risk_level }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="blocking" label="阻塞" width="70">
              <template #default="{ row }">{{ row.blocking ? '是' : '否' }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="无引用记录" :image-size="80" />
        </template>
      </div>
    </el-dialog>
  </div>
</template>
