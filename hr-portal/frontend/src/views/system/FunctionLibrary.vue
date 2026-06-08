<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import {
  functionLibraryApi,
  type FormulaFunction,
  type FormulaFunctionPayload,
} from '@/api/functionLibrary'

const MENU = 'system.function_library'
const loading = ref(false)
const saving = ref(false)
const list = ref<FormulaFunction[]>([])
const dialogOpen = ref(false)
const editing = ref<FormulaFunction | null>(null)
const activeTab = ref('base')
const keyword = ref('')
const statusFilter = ref('all')

const form = reactive<FormulaFunctionPayload>({
  code: '',
  name: '',
  description: '',
  function_type: 'expression',
  parameters: [],
  return_type: 'number',
  formula_body: '',
  is_enabled: true,
  is_sensitive_output: false,
})

const baseFunctions = computed(() =>
  list.value
    .filter((item) => item.source === 'base_excel' || item.function_type === 'base_excel')
    .filter((item) => {
      const kw = keyword.value.trim().toLowerCase()
      const status = statusFilter.value
      const hitKeyword = !kw || `${item.code} ${item.name} ${item.category_label || ''}`.toLowerCase().includes(kw)
      const hitStatus = status === 'all' || item.support_status === status
      return hitKeyword && hitStatus
    })
)

const managedFunctions = computed(() =>
  list.value.filter((item) => item.source !== 'base_excel' && item.function_type !== 'base_excel')
)

function functionTypeLabel(type: FormulaFunction['function_type']) {
  const map: Record<FormulaFunction['function_type'], string> = {
    base_excel: '基础函数',
    system_builtin: '系统内置',
    expression: '表达式',
    data_action: '数据动作',
  }
  return map[type] || type
}

function supportStatusLabel(row: FormulaFunction) {
  const status = row.support_status || 'executable'
  if (status === 'executable') return '可执行'
  if (status === 'blocked') return '风险禁用'
  return '待适配'
}

function supportStatusTag(row: FormulaFunction) {
  const status = row.support_status || 'executable'
  if (status === 'executable') return 'success'
  if (status === 'blocked') return 'danger'
  return 'info'
}

function parameterNames(row: FormulaFunction) {
  return (row.parameters || []).map((item) => item.name).filter(Boolean).join('，') || '-'
}

async function updateCatalog(
  row: FormulaFunction,
  patch: { is_visible?: boolean; is_enabled?: boolean; is_ai_enabled?: boolean }
) {
  if (!row.is_executable) {
    ElMessage.warning('该函数尚未适配执行，当前只能作为目录查看')
    await load()
    return
  }
  try {
    const next = await functionLibraryApi.updateCatalog(row.code, patch)
    Object.assign(row, next)
    ElMessage.success('函数目录配置已更新')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '更新失败')
    await load()
  }
}

async function updateCatalogVisibility(row: FormulaFunction, value: boolean) {
  await updateCatalog(
    row,
    value
      ? { is_visible: true }
      : { is_visible: false, is_enabled: false, is_ai_enabled: false }
  )
}

async function load() {
  loading.value = true
  try {
    list.value = await functionLibraryApi.list(false)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载函数库失败')
  } finally {
    loading.value = false
  }
}

function reset() {
  Object.assign(form, {
    code: '',
    name: '',
    description: '',
    function_type: 'expression',
    parameters: [],
    return_type: 'number',
    formula_body: '',
    is_enabled: true,
    is_sensitive_output: false,
  })
}

function openCreate() {
  editing.value = null
  reset()
  dialogOpen.value = true
}

function openEdit(row: FormulaFunction) {
  editing.value = row
  Object.assign(form, {
    code: row.code,
    name: row.name,
    description: row.description || '',
    function_type: row.function_type,
    parameters: row.parameters.map((item) => ({ ...item })),
    return_type: row.return_type,
    formula_body: row.formula_body || '',
    is_enabled: row.is_enabled,
    is_sensitive_output: row.is_sensitive_output,
  })
  dialogOpen.value = true
}

function addParam() {
  form.parameters.push({ name: '', type: 'number', description: '' })
}

function removeParam(index: number) {
  form.parameters.splice(index, 1)
}

async function save() {
  if (!form.code.trim() || !form.name.trim()) {
    ElMessage.warning('函数编码和名称必填')
    return
  }
  if (form.function_type === 'expression' && !form.formula_body?.trim()) {
    ElMessage.warning('表达式型函数必须填写公式体')
    return
  }
  saving.value = true
  try {
    const payload: FormulaFunctionPayload = {
      ...form,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description?.trim() || null,
      formula_body: form.formula_body?.trim() || null,
      parameters: form.parameters
        .filter((item) => item.name?.trim())
        .map((item) => ({ ...item, name: item.name.trim() })),
    }
    if (editing.value) {
      if (editing.value.id == null) {
        ElMessage.warning('基础函数为系统只读，不能编辑')
        return
      }
      await functionLibraryApi.update(editing.value.id, payload)
    } else {
      await functionLibraryApi.create(payload)
    }
    ElMessage.success('函数已保存')
    dialogOpen.value = false
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <el-card>
      <template #header>
        <div class="page-head">
          <div>
            <div class="page-title">函数库管理</div>
            <div class="page-subtitle">维护平台公共公式函数，AI 公式助手只读取已启用函数元数据。</div>
          </div>
          <div class="page-actions">
            <el-button :icon="Refresh" @click="load">刷新</el-button>
            <PermissionButton :menu="MENU" op="C" type="primary" @click="openCreate">
              <el-icon><Plus /></el-icon>
              新增函数
            </PermissionButton>
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane :label="`Excel 函数目录（${baseFunctions.length}）`" name="base">
          <div class="catalog-toolbar">
            <el-input v-model="keyword" placeholder="搜索函数编码/名称/分类" clearable />
            <el-select v-model="statusFilter" style="width: 150px">
              <el-option label="全部状态" value="all" />
              <el-option label="可执行" value="executable" />
              <el-option label="待适配" value="catalog_only" />
              <el-option label="风险禁用" value="blocked" />
            </el-select>
          </div>
          <el-table v-loading="loading" :data="baseFunctions" stripe style="width: 100%" max-height="640">
            <el-table-column prop="code" label="编码" min-width="130" />
            <el-table-column prop="name" label="名称" min-width="150" />
            <el-table-column label="分类" min-width="110">
              <template #default="{ row }">
                <el-tag type="info" effect="plain">{{ row.category_label || functionTypeLabel(row.function_type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="return_type" label="返回类型" min-width="100" />
            <el-table-column label="适配状态" min-width="100">
              <template #default="{ row }">
                <el-tag :type="supportStatusTag(row)" effect="plain">{{ supportStatusLabel(row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="参数" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ parameterNames(row) }}</template>
            </el-table-column>
            <el-table-column prop="description" label="说明" min-width="240" show-overflow-tooltip />
            <el-table-column label="编辑器显示" width="120" fixed="right">
              <template #default="{ row }">
                <el-switch
                  v-model="row.is_visible"
                  :disabled="!row.is_executable"
                  @change="(value: boolean) => updateCatalogVisibility(row, value)"
                />
              </template>
            </el-table-column>
            <el-table-column label="报表可用" width="110" fixed="right">
              <template #default="{ row }">
                <el-switch
                  v-model="row.is_enabled"
                  :disabled="!row.is_executable || !row.is_visible"
                  @change="(value: boolean) => updateCatalog(row, { is_enabled: value })"
                />
              </template>
            </el-table-column>
            <el-table-column label="AI 可用" width="110" fixed="right">
              <template #default="{ row }">
                <el-switch
                  v-model="row.is_ai_enabled"
                  :disabled="!row.is_executable || !row.is_enabled"
                  @change="(value: boolean) => updateCatalog(row, { is_ai_enabled: value })"
                />
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="`业务/自定义函数（${managedFunctions.length}）`" name="managed">
          <el-table v-loading="loading" :data="managedFunctions" stripe style="width: 100%" max-height="640">
            <el-table-column prop="code" label="编码" min-width="130" />
            <el-table-column prop="name" label="名称" min-width="150" />
            <el-table-column label="类型" min-width="120">
              <template #default="{ row }">{{ functionTypeLabel(row.function_type) }}</template>
            </el-table-column>
            <el-table-column prop="return_type" label="返回类型" min-width="100" />
            <el-table-column label="状态" min-width="90">
              <template #default="{ row }">
                <el-tag :type="row.is_enabled ? 'success' : 'info'" effect="plain">
                  {{ row.is_enabled ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <PermissionButton :menu="MENU" op="U" size="small" @click="openEdit(row)">编辑</PermissionButton>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="dialogOpen" :title="editing ? '编辑函数' : '新增函数'" width="760px" top="6vh">
      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="函数编码" required>
            <el-input v-model="form.code" :disabled="Boolean(editing)" placeholder="如 CALC_TAX" />
          </el-form-item>
          <el-form-item label="函数名称" required>
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item label="函数类型">
            <el-select v-model="form.function_type" :disabled="Boolean(editing)" style="width: 100%">
              <el-option label="表达式" value="expression" />
              <el-option label="系统内置" value="system_builtin" />
              <el-option label="数据动作（首期不可执行）" value="data_action" />
            </el-select>
          </el-form-item>
          <el-form-item label="返回类型">
            <el-select v-model="form.return_type" style="width: 100%">
              <el-option label="数值" value="number" />
              <el-option label="文本" value="string" />
              <el-option label="布尔" value="bool" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item v-if="form.function_type === 'expression'" label="公式体" required>
          <el-input
            v-model="form.formula_body"
            type="textarea"
            :rows="3"
            placeholder='参数用 FIELD("amount") 引用，如 =ROUND(FIELD("amount")*0.1,2)'
          />
        </el-form-item>
        <div class="section-head">
          <span>参数</span>
          <el-button size="small" @click="addParam">
            <el-icon><Plus /></el-icon>
            新增参数
          </el-button>
        </div>
        <el-table :data="form.parameters" border size="small" style="width: 100%">
          <el-table-column label="名称" min-width="140">
            <template #default="{ row }"><el-input v-model="row.name" size="small" /></template>
          </el-table-column>
          <el-table-column label="类型" width="120">
            <template #default="{ row }"><el-input v-model="row.type" size="small" /></template>
          </el-table-column>
          <el-table-column label="说明" min-width="180">
            <template #default="{ row }"><el-input v-model="row.description" size="small" /></template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="{ $index }">
              <el-button type="danger" link size="small" @click="removeParam($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="switch-row">
          <el-switch v-model="form.is_enabled" active-text="启用" inactive-text="停用" />
          <el-switch v-model="form.is_sensitive_output" active-text="敏感输出" inactive-text="普通输出" />
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  padding: 24px;
}
.page-head,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
}
.page-subtitle {
  margin-top: 4px;
  color: var(--color-text-placeholder);
  font-size: 13px;
}
.page-actions {
  display: flex;
  gap: 8px;
}
.catalog-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 150px;
  gap: 10px;
  margin-bottom: 12px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: 0 12px;
}
.section-head {
  margin: 10px 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
}
.switch-row {
  display: flex;
  gap: 18px;
  margin-top: 14px;
}
@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
