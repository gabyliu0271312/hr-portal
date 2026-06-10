<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, InfoFilled } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import SmartCodeInput from '@/components/common/SmartCodeInput.vue'
import { globalFieldsApi, type GlobalField, type ToolOption } from '@/api/global_fields'
import { fieldCategoriesApi, type FieldCategory } from '@/api/field_categories'

const fields = ref<GlobalField[]>([])
const categories = ref<FieldCategory[]>([])
const tools = ref<ToolOption[]>([])
const loading = ref(false)

const DATA_TYPES = [
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '日期', value: 'date' },
  { label: '日期时间', value: 'datetime' },
  { label: '布尔', value: 'bool' },
]
const AGG_ROLES = [
  { label: '维度', value: 'dimension' },
  { label: '度量', value: 'measure' },
]
const SCOPE_ROLES = [
  { label: '成本中心编码 (绑成本中心树)', value: 'cc_code' },
  { label: '组织节点编码 (绑组织树)', value: 'org_node_code' },
  { label: '用工类型', value: 'employment_type' },
  { label: '用工主体', value: 'employment_entity' },
  { label: '人员', value: 'person' },
]

function scopeLabel(v: string | null) {
  if (!v) return '—'
  return SCOPE_ROLES.find((s) => s.value === v)?.label ?? v
}

async function loadAll() {
  loading.value = true
  try {
    const [f, c, t] = await Promise.all([
      globalFieldsApi.list(),
      fieldCategoriesApi.list(),
      globalFieldsApi.tools(),
    ])
    fields.value = f
    categories.value = c
    tools.value = t
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

// ===== 新建/编辑 =====
const dialogOpen = ref(false)
const editing = ref<GlobalField | null>(null)
const existingCodes = computed(() =>
  fields.value.filter((f) => f.id !== editing.value?.id).map((f) => f.code),
)
const formModel = ref({
  code: '',
  label: '',
  data_type: 'string',
  agg_role: 'dimension',
  scope_role: null as string | null,
  category_id: null as number | null,
  description: '',
})

function openCreate() {
  editing.value = null
  formModel.value = {
    code: '',
    label: '',
    data_type: 'string',
    agg_role: 'dimension',
    scope_role: null,
    category_id: null,
    description: '',
  }
  dialogOpen.value = true
}
function openEdit(row: GlobalField) {
  editing.value = row
  formModel.value = {
    code: row.code,
    label: row.label,
    data_type: row.data_type,
    agg_role: row.agg_role,
    scope_role: row.scope_role,
    category_id: row.category_id,
    description: row.description ?? '',
  }
  dialogOpen.value = true
}
async function save() {
  if (!formModel.value.code.trim() || !formModel.value.label.trim()) {
    ElMessage.warning('编码与名称必填')
    return
  }
  try {
    const payload = { ...formModel.value }
    if (editing.value) {
      await globalFieldsApi.update(editing.value.id, payload)
      ElMessage.success('已保存')
    } else {
      await globalFieldsApi.create(payload)
      ElMessage.success('已创建')
    }
    dialogOpen.value = false
    loadAll()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  }
}
async function remove(row: GlobalField) {
  try {
    await ElMessageBox.confirm(`删除全局字段「${row.label}」？`, '提示', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await globalFieldsApi.remove(row.id)
    ElMessage.success('已删除')
    loadAll()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

// ===== 授权工具白名单 =====
const whitelistOpen = ref(false)
const whitelistCategory = ref<FieldCategory | null>(null)
const whitelistKeys = ref<string[]>([])
const sensitiveCategories = computed(() => categories.value.filter((c) => c.is_sensitive))

async function openWhitelist(cat: FieldCategory) {
  whitelistCategory.value = cat
  try {
    const r = await globalFieldsApi.getWhitelist(cat.id)
    whitelistKeys.value = r.tool_keys
  } catch {
    whitelistKeys.value = []
  }
  whitelistOpen.value = true
}
async function saveWhitelist() {
  if (!whitelistCategory.value) return
  try {
    await globalFieldsApi.setWhitelist(whitelistCategory.value.id, whitelistKeys.value)
    ElMessage.success('已保存白名单')
    whitelistOpen.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  }
}

onMounted(loadAll)
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">全局字段字典</span>
          <PermissionButton menu="system.global_fields" op="C" type="primary" @click="openCreate">
            <el-icon style="margin-right: 4px"><Plus /></el-icon>新建全局字段
          </PermissionButton>
        </div>
      </template>

      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
        <p style="margin: 0; line-height: 1.6">
          全局字段是跨表统一的业务字段（如「工号」「一级部门」）。在「字段管理」里把各表的物理列<strong>认领</strong>到同一个全局字段后，
          名称、字段分类、权限角色都从这里统一继承——组织树/成本中心树只需在此绑定一次，无需逐表维护。
          仅需为<strong>跨表共享或与权限/分类相关</strong>的字段建全局；表内明细字段不必建。
        </p>
      </el-alert>

      <el-table v-loading="loading" :data="fields" stripe style="width: 100%">
        <el-table-column label="编码" prop="code" min-width="140">
          <template #default="{ row }">
            <span style="font-family: monospace; font-size: 12px">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column label="标准名称" prop="label" min-width="140" />
        <el-table-column label="类型" min-width="90">
          <template #default="{ row }">
            {{ DATA_TYPES.find((d) => d.value === row.data_type)?.label ?? row.data_type }}
          </template>
        </el-table-column>
        <el-table-column label="维度/度量" min-width="90">
          <template #default="{ row }">
            {{ row.agg_role === 'measure' ? '度量' : '维度' }}
          </template>
        </el-table-column>
        <el-table-column label="权限角色（绑树）" min-width="200">
          <template #default="{ row }">
            <el-tag v-if="row.scope_role" size="small" type="warning" effect="plain">
              {{ scopeLabel(row.scope_role) }}
            </el-tag>
            <span v-else style="color: var(--color-text-placeholder)">—</span>
          </template>
        </el-table-column>
        <el-table-column label="字段分类" min-width="120">
          <template #default="{ row }">
            <el-tag v-if="row.category_name" size="small">{{ row.category_name }}</el-tag>
            <span v-else style="color: var(--color-text-placeholder)">—</span>
          </template>
        </el-table-column>
        <el-table-column label="已认领列数" min-width="100" align="center">
          <template #default="{ row }">
            <el-badge :value="row.claimed_count" :max="99" type="info" :hidden="row.claimed_count === 0" />
            <span v-if="row.claimed_count === 0" style="color: var(--color-text-placeholder)">0</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <PermissionButton menu="system.global_fields" op="U" link size="small" type="primary" @click="openEdit(row)">
              编辑
            </PermissionButton>
            <PermissionButton menu="system.global_fields" op="D" link size="small" type="danger" @click="remove(row)">
              删除
            </PermissionButton>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 授权工具白名单 -->
    <el-card style="margin-top: 16px">
      <template #header>
        <div>
          <span style="font-size: 16px; font-weight: 600">授权工具白名单</span>
          <el-tooltip placement="top">
            <template #content>
              <div style="max-width: 320px; line-height: 1.6">
                对「敏感」字段分类：<br />
                · 有该分类权限的用户 → 处处可见，不受白名单限制<br />
                · 无该分类权限的用户 → 仅在白名单工具内可使用这类字段（原值可见、可计算）<br />
                · 不在白名单的通用数据集/报表 → 该类字段完全不可用
              </div>
            </template>
            <el-icon style="margin-left: 4px; vertical-align: middle; cursor: help"><InfoFilled /></el-icon>
          </el-tooltip>
        </div>
      </template>
      <el-table :data="sensitiveCategories" stripe>
        <el-table-column label="敏感分类" prop="name" min-width="160" />
        <el-table-column label="说明" prop="description" min-width="200">
          <template #default="{ row }">
            <span style="color: var(--color-text-secondary)">{{ row.description || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <PermissionButton menu="system.global_fields" op="U" link size="small" type="primary" @click="openWhitelist(row)">
              配置白名单工具
            </PermissionButton>
          </template>
        </el-table-column>
        <template #empty>
          <div style="padding: 24px 0; color: var(--color-text-placeholder); font-size: 13px">
            暂无敏感分类。请先到「字段分类」创建并勾选「敏感」。
          </div>
        </template>
      </el-table>
    </el-card>

    <!-- 新建/编辑对话框 -->
    <el-dialog v-model="dialogOpen" :title="editing ? '编辑全局字段' : '新建全局字段'" width="520px">
      <el-form label-position="top">
        <el-form-item label="标准名称" required>
          <el-input v-model="formModel.label" placeholder="展示给用户的中文名，如：工号、一级部门" />
        </el-form-item>
        <el-form-item label="字段编码" required>
          <SmartCodeInput
            v-if="!editing"
            v-model="formModel.code"
            :label="formModel.label"
            scope="global_field"
            :existing-codes="existingCodes"
            :editable="true"
          />
          <template v-else>
            <el-input v-model="formModel.code" :disabled="editing.claimed_count > 0" style="font-family: var(--font-mono)" />
            <div v-if="editing.claimed_count > 0" style="font-size: 12px; color: var(--color-text-placeholder); margin-top: 4px">
              已有物理列认领，编码不可改
            </div>
          </template>
        </el-form-item>
        <el-form-item label="数据类型">
          <el-select v-model="formModel.data_type" style="width: 100%">
            <el-option v-for="t in DATA_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="维度/度量">
          <el-select v-model="formModel.agg_role" style="width: 100%">
            <el-option v-for="r in AGG_ROLES" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="权限角色（数据范围按哪棵树/维度过滤）">
          <el-select v-model="formModel.scope_role" clearable style="width: 100%" placeholder="不参与数据范围过滤">
            <el-option v-for="s in SCOPE_ROLES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="字段分类（认领的物理列自动继承敏感判定）">
          <el-select v-model="formModel.category_id" clearable style="width: 100%" placeholder="不归入分类">
            <el-option v-for="c in categories" :key="c.id" :label="c.name + (c.is_sensitive ? '（敏感）' : '')" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="formModel.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 白名单配置对话框 -->
    <el-dialog v-model="whitelistOpen" :title="`白名单工具 · ${whitelistCategory?.name ?? ''}`" width="460px">
      <p style="color: var(--color-text-secondary); font-size: 13px; line-height: 1.6; margin-top: 0">
        勾选的工具，允许「无本分类权限」的用户在其中使用该分类字段（原值可见、可计算）。
      </p>
      <el-checkbox-group v-model="whitelistKeys">
        <el-checkbox v-for="t in tools" :key="t.key" :value="t.key" :label="t.key" border style="display: block; margin: 0 0 8px">
          {{ t.label }}
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="whitelistOpen = false">取消</el-button>
        <el-button type="primary" @click="saveWhitelist">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
