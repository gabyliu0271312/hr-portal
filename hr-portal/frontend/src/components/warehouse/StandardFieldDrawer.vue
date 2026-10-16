<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import { standardFieldsApi, type StandardFieldDefinitionPayload, type StandardFieldDetail, type StandardFieldVersion } from '@/api/standardFields'
import { fieldCategoriesApi, type FieldCategory } from '@/api/field_categories'
import { useUserStore } from '@/stores/user'

const props = defineProps<{ modelValue: boolean; fieldId: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; changed: [] }>()
const userStore = useUserStore()
const detail = ref<StandardFieldDetail | null>(null)
const categories = ref<FieldCategory[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const mode = ref<'view' | 'create' | 'version' | 'edit'>('view')
const reason = ref('')
const form = reactive<StandardFieldDefinitionPayload>({
  field_code: '', field_name: '', business_definition: '', data_type: 'string', grain_level: null,
  permission_domain: 'public', is_permission_anchor: false, owner_user_id: 0, category_ids: [],
})
const dataTypes = [{ value: 'string', label: '字符串' }, { value: 'number', label: '数值' }, { value: 'date', label: '日期' }, { value: 'datetime', label: '日期时间' }, { value: 'bool', label: '布尔' }, { value: 'enum', label: '枚举' }]
const grains = [{ value: 'coarse', label: '粗粒度' }, { value: 'fine', label: '细粒度' }, { value: 'identifying', label: '个人标识' }]
const domains = [{ value: 'public', label: '通用' }, { value: 'org', label: '组织' }, { value: 'cost_center', label: '成本中心' }, { value: 'salary', label: '薪酬' }, { value: 'personal', label: '个人信息' }]
const statusLabels: Record<string, string> = { draft: '草稿', active: '已启用', deprecated: '已弃用', archived: '已归档' }
const writable = () => mode.value !== 'view'

function fill(version?: StandardFieldVersion) {
  form.field_code = detail.value?.field_code || ''
  form.field_name = version?.field_name || ''
  form.business_definition = version?.business_definition || ''
  form.data_type = version?.data_type || 'string'
  form.grain_level = version?.grain_level || null
  form.permission_domain = version?.permission_domain || 'public'
  form.is_permission_anchor = version?.is_permission_anchor || false
  form.owner_user_id = version?.owner_user_id || userStore.user?.id || 0
  form.category_ids = [...(version?.category_ids || [])]
}

async function load() {
  if (!props.modelValue) return
  loading.value = true
  error.value = ''
  try {
    const [record, categoryList] = await Promise.all([
      props.fieldId ? standardFieldsApi.get(props.fieldId) : Promise.resolve(null),
      fieldCategoriesApi.list().catch(() => [] as FieldCategory[]),
    ])
    detail.value = record
    categories.value = categoryList
    fill(record?.latest_version)
    mode.value = props.fieldId ? 'view' : 'create'
  } catch (cause: any) {
    error.value = cause?.response?.data?.detail || '标准字段详情加载失败，请重试'
  } finally {
    loading.value = false
  }
}

function close() { if (!saving.value) emit('update:modelValue', false) }
function beginVersion() { if (detail.value?.versions.some(version => version.status === 'draft')) { ElMessage.warning('请先处理已有草稿'); return }; fill(detail.value?.latest_version); mode.value = 'version'; reason.value = '' }
function beginEdit() { fill(detail.value?.latest_version); mode.value = 'edit'; reason.value = '' }
function cancel() { if (detail.value) { fill(detail.value.latest_version); mode.value = 'view' } else close() }
function normalizedForm(): StandardFieldDefinitionPayload {
  return {
    field_name: form.field_name.trim(), business_definition: form.business_definition.trim(),
    data_type: form.data_type, grain_level: form.grain_level || null,
    permission_domain: form.permission_domain, is_permission_anchor: form.is_permission_anchor,
    owner_user_id: form.owner_user_id, category_ids: form.category_ids,
  }
}
async function save() {
  if (!form.field_name.trim() || !form.business_definition.trim() || !form.owner_user_id || (mode.value === 'create' && !form.field_code?.trim())) {
    ElMessage.warning('请填写字段编码、名称、业务定义与负责人')
    return
  }
  saving.value = true
  try {
    const payload = normalizedForm()
    if (mode.value === 'create') {
      await standardFieldsApi.create({ ...payload, field_code: form.field_code?.trim() })
    } else if (detail.value && mode.value === 'version') {
      await standardFieldsApi.createVersion(detail.value.id, { ...payload, expected_version: detail.value.latest_version.version })
    } else if (detail.value && mode.value === 'edit') {
      await standardFieldsApi.updateVersion(detail.value.id, detail.value.latest_version.id, { ...payload, expected_revision: detail.value.latest_version.revision })
    }
    ElMessage.success('草稿已保存，不会自动发布或授权')
    emit('changed')
    emit('update:modelValue', false)
  } catch (cause: any) {
    error.value = cause?.response?.data?.detail || '保存失败，请核对目录版本后重试'
  } finally {
    saving.value = false
  }
}
async function transition(version: StandardFieldVersion, action: 'approve' | 'deprecate' | 'archive') {
  if (!detail.value) return
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('请填写本次操作原因，操作后不能自动恢复旧版本', '确认字段版本变更', {
      inputValidator: value => Boolean(value.trim()) || '请填写原因',
      confirmButtonText: '确认', cancelButtonText: '取消',
    })
    reason = result.value.trim()
  } catch { return }
  saving.value = true
  try {
    if (action === 'approve') await standardFieldsApi.approve(detail.value.id, version.id, version.revision, reason)
    else if (action === 'deprecate') await standardFieldsApi.deprecate(detail.value.id, version.id, version.revision, reason)
    else await standardFieldsApi.archive(detail.value.id, version.id, version.revision, reason)
    ElMessage.success('状态已更新；当前查询权限未改变')
    detail.value = await standardFieldsApi.get(detail.value.id)
    emit('changed')
  } catch (cause: any) {
    error.value = cause?.response?.data?.detail || '操作未完成，请主动重新加载并核对版本'
  } finally {
    saving.value = false
  }
}
watch(() => [props.modelValue, props.fieldId], () => { if (props.modelValue) void load() })
</script>

<template>
  <el-drawer :model-value="modelValue" :title="mode === 'create' ? '新建标准字段' : '标准字段详情'" size="min(680px, 90vw)" @close="close">
    <div v-loading="loading" class="standard-field-drawer">
      <el-alert v-if="error" :title="String(error)" type="error" :closable="false" show-icon />
      <p class="standard-field-drawer__note">此处维护业务字段语义，不创建物理列；草稿和建议绑定不会开放业务查询。</p>
      <template v-if="!loading">
        <el-form v-if="writable()" label-position="top" @submit.prevent="save">
          <el-form-item label="字段编码" required>
            <el-input v-model="form.field_code" :disabled="mode !== 'create'" maxlength="64" placeholder="例如 employee_no" />
          </el-form-item>
          <el-form-item label="字段名称" required><el-input v-model="form.field_name" maxlength="128" /></el-form-item>
          <el-form-item label="业务定义" required><el-input v-model="form.business_definition" type="textarea" :rows="3" maxlength="4000" /></el-form-item>
          <el-form-item label="数据类型" required>
            <el-select v-model="form.data_type" style="width: 100%">
              <el-option v-for="item in dataTypes" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="识别粒度">
            <el-select v-model="form.grain_level" clearable placeholder="请选择" style="width: 100%">
              <el-option v-for="item in grains" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="语义域" required>
            <el-select v-model="form.permission_domain" style="width: 100%">
              <el-option v-for="item in domains" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="负责人用户 ID" required><el-input-number v-model="form.owner_user_id" :min="1" :precision="0" controls-position="right" /></el-form-item>
          <el-form-item label="字段分类">
            <el-select v-model="form.category_ids" multiple clearable placeholder="可选已有分类" style="width: 100%">
              <el-option v-for="category in categories" :key="category.id" :label="category.name" :value="category.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="权限锚点候选"><el-switch v-model="form.is_permission_anchor" /></el-form-item>
        </el-form>
        <template v-else-if="detail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="编码">{{ detail.field_code }}</el-descriptions-item>
            <el-descriptions-item label="当前已批准版本">{{ detail.current_active_version_id ? `#${detail.current_active_version_id}` : '暂无' }}</el-descriptions-item>
          </el-descriptions>
          <div class="standard-field-drawer__section">
            <div class="standard-field-drawer__section-title"><strong>语义版本</strong><PermissionButton menu="warehouse.standard_fields.catalog" op="C" size="small" @click="beginVersion">新建版本</PermissionButton></div>
            <div v-for="version in detail.versions" :key="version.id" class="standard-field-drawer__version">
              <div><strong>v{{ version.version }} · {{ version.field_name }}</strong> <el-tag size="small">{{ statusLabels[version.status] || version.status }}</el-tag></div>
              <p>{{ version.business_definition }}</p>
              <div class="standard-field-drawer__actions">
                <PermissionButton v-if="version.id === detail.latest_version.id && version.status === 'draft'" menu="warehouse.standard_fields.catalog" op="U" size="small" @click="beginEdit">编辑草稿</PermissionButton>
                <PermissionButton v-if="version.status === 'draft'" menu="warehouse.standard_fields.catalog" op="U" size="small" :disabled="saving" @click="transition(version, 'approve')">审核启用</PermissionButton>
                <PermissionButton v-if="version.status === 'active'" menu="warehouse.standard_fields.catalog" op="U" size="small" :disabled="saving" @click="transition(version, 'deprecate')">弃用</PermissionButton>
                <PermissionButton v-if="version.status !== 'archived'" menu="warehouse.standard_fields.catalog" op="D" size="small" :disabled="saving" @click="transition(version, 'archive')">归档</PermissionButton>
              </div>
            </div>
          </div>
          <div class="standard-field-drawer__section">
            <strong>绑定引用</strong>
            <el-empty v-if="!detail.bindings.length" description="暂无字段绑定；草稿不会自动绑定来源" :image-size="60" />
            <p v-for="binding in detail.bindings" :key="binding.id">绑定 #{{ binding.id }} · {{ binding.status }} · 版本 #{{ binding.standard_field_version_id }}</p>
          </div>
        </template>
      </template>
    </div>
    <template #footer>
      <el-button @click="close">关闭</el-button>
      <el-button v-if="writable()" @click="cancel">取消</el-button>
      <PermissionButton v-if="writable()" menu="warehouse.standard_fields.catalog" :op="mode === 'edit' ? 'U' : 'C'" type="primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存草稿' }}</PermissionButton>
    </template>
  </el-drawer>
</template>

<style scoped>
.standard-field-drawer { display: grid; gap: 16px; color: var(--color-text-primary); }
.standard-field-drawer__note { margin: 0; color: var(--color-text-secondary); font-size: 13px; line-height: 1.6; }
.standard-field-drawer__section { display: grid; gap: 12px; padding-top: 16px; border-top: 1px solid var(--color-border); }
.standard-field-drawer__section-title, .standard-field-drawer__actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.standard-field-drawer__section-title { justify-content: space-between; }
.standard-field-drawer__version { padding: 12px 0; border-bottom: 1px solid var(--color-border); }
.standard-field-drawer__version p { margin: 8px 0; color: var(--color-text-secondary); }
</style>
