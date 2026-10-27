<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import { standardFieldsApi, type StandardFieldDefinitionPayload, type StandardFieldDetail, type StandardFieldVersion } from '@/api/standardFields'
import { fieldCategoriesApi, type FieldCategory } from '@/api/field_categories'
import { useUserStore } from '@/stores/user'
import StandardFieldBindingPanel from './StandardFieldBindingPanel.vue'
import StandardFieldDefinitionForm from './StandardFieldDefinitionForm.vue'
import StandardFieldValueDomain from './StandardFieldValueDomain.vue'

const props = defineProps<{ modelValue: boolean; fieldId: number | null; datasetId?: number | null; tableName?: string | null; governanceMode?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; changed: [] }>()
const userStore = useUserStore()
const detail = ref<StandardFieldDetail | null>(null)
const categories = ref<FieldCategory[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const mode = ref<'view' | 'create' | 'version' | 'edit'>('view')
const canView = computed(() => userStore.menus.some(menu => menu.code === 'warehouse.standard_fields.catalog'))
const canWrite = computed(() => canView.value && userStore.hasOp('warehouse.standard_fields.catalog', mode.value === 'edit' ? 'U' : 'C'))
let requestId = 0
let contextId = 0
const form = reactive<StandardFieldDefinitionPayload>({
  field_code: '', field_name: '', business_definition: '', data_type: 'string', grain_level: null,
  permission_domain: 'public', is_permission_anchor: false, owner_user_id: 0, category_ids: [], value_domain: null,
})
const displayName = ref('')
const writable = () => mode.value !== 'view' && canWrite.value
const categoryNames = computed(() => (detail.value?.latest_version.category_ids || []).map(id => categories.value.find(category => category.id === id)?.name || `分类 #${id}`))
const referenceCount = computed(() => detail.value?.bindings.length || 0)
const migrationRequired = computed(() => [form.value_domain, detail.value?.latest_version?.value_domain].some(domain => domain != null && !Array.isArray(domain.items)))

function message(cause: any, fallback: string) {
  let value = cause?.response?.data?.detail
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { return value || fallback } }
  return typeof value === 'string' ? value : typeof value?.message === 'string' ? value.message : fallback
}

function fill(version?: StandardFieldVersion) {
  form.field_code = detail.value?.field_code || ''
  form.field_name = version?.field_name || ''
  displayName.value = version?.field_name || ''
  form.business_definition = version?.business_definition || ''
  form.data_type = version?.data_type || 'string'
  form.grain_level = version?.grain_level || null
  form.permission_domain = version?.permission_domain || 'public'
  form.is_permission_anchor = version?.is_permission_anchor || false
  form.owner_user_id = version?.owner_user_id || userStore.user?.id || 0
  form.category_ids = [...(version?.category_ids || [])]
  form.value_domain = version?.value_domain ? JSON.parse(JSON.stringify(version.value_domain)) : null
}

async function load() {
  const current = ++requestId
  detail.value = null; categories.value = []; loading.value = false; error.value = ''
  mode.value = 'view'; fill()
  if (!props.modelValue || !canView.value) return
  loading.value = true
  try {
    const [record, categoryList] = await Promise.all([
      props.fieldId ? standardFieldsApi.get(props.fieldId) : Promise.resolve(null),
      fieldCategoriesApi.list().catch(() => [] as FieldCategory[]),
    ])
    if (current !== requestId) return
    detail.value = record
    categories.value = categoryList
    fill(record?.latest_version)
    mode.value = props.fieldId ? 'view' : 'create'
  } catch (cause: any) {
    if (current === requestId) error.value = message(cause, '标准字段详情加载失败，请重试')
  } finally {
    if (current === requestId) loading.value = false
  }
}

function close() { if (!saving.value) { ++contextId; ++requestId; emit('update:modelValue', false) } }
function beginEdit() {
  if (saving.value || !canView.value || !userStore.hasOp('warehouse.standard_fields.catalog', 'U') || !detail.value) return
  const latest = detail.value.latest_version
  if (latest.status === 'draft') {
    fill(latest); mode.value = 'edit'
  } else if (!migrationRequired.value && latest.status === 'active' && !detail.value.versions.some(version => version.status === 'draft')) {
    fill(latest); mode.value = 'version'
  }
}
async function saveDisplayName() {
  if (!detail.value || !displayName.value.trim() || saving.value || !userStore.hasOp('warehouse.standard_fields.catalog', 'U')) return
  saving.value = true
  try {
    const updated = await standardFieldsApi.updateDisplayName(detail.value.id, {
      display_name: displayName.value.trim(),
      expected_version: detail.value.latest_version.version,
      reason: '更新标准字段展示名称',
    })
    detail.value = updated
    fill(updated.latest_version)
    ElMessage.success('展示名称已更新，不会创建语义版本')
    emit('changed')
  } catch (cause: any) {
    error.value = message(cause, '展示名称更新失败，请重试')
  } finally { saving.value = false }
}

function cancel() { if (detail.value) { fill(detail.value.latest_version); mode.value = 'view' } else close() }
function normalizedForm(): StandardFieldDefinitionPayload {
  const valueDomain = form.value_domain ? { items: (form.value_domain.items || []).map(item => ({ code: item.code.trim(), name: item.name.trim(), enabled: item.enabled, sort_order: item.sort_order })) } : null
  if (mode.value === 'create') {
    return {
      field_name: form.field_name.trim(), business_definition: form.business_definition.trim(),
      data_type: form.data_type, value_domain: valueDomain,
    }
  }
  return {
    field_name: form.field_name.trim(), business_definition: form.business_definition.trim(),
    data_type: form.data_type, grain_level: form.grain_level || null,
    permission_domain: form.permission_domain, is_permission_anchor: form.is_permission_anchor,
    owner_user_id: form.owner_user_id, category_ids: form.category_ids, value_domain: valueDomain,
  }
}
async function save() {
  if (migrationRequired.value || saving.value || loading.value || !writable() || (mode.value === 'edit' && detail.value?.latest_version.status !== 'draft')) return
  if (!form.field_name.trim() || !form.business_definition.trim() || (mode.value === 'create' && !form.field_code?.trim()) || (mode.value !== 'create' && !form.owner_user_id)) {
    ElMessage.warning(mode.value === 'create' ? '请填写字段编码、名称与业务定义' : '请填写字段名称、业务定义与负责人')
    return
  }
  const items = form.data_type === 'enum' ? form.value_domain?.items || [] : []
  if (items.length > 1000 || items.some(item => !item.code.trim() || !item.name.trim() || item.code.trim().length > 128 || item.name.trim().length > 128 || !Number.isInteger(item.sort_order) || item.sort_order < 0) || new Set(items.map(item => item.code.trim())).size !== items.length) {
    ElMessage.warning('最多维护1000项；编码和名称须为1–128字符、编码不重复，排序须为非负整数')
    return
  }
  const context = contextId
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
    if (context !== contextId || !canWrite.value) return
    ElMessage.success('字段定义已保存；发布和查询权限仍由服务端统一校验')
    emit('changed')
    emit('update:modelValue', false)
  } catch (cause: any) {
    if (context === contextId) error.value = message(cause, '保存失败，请核对目录版本后重试')
  } finally {
    if (context === contextId) saving.value = false
  }
}
watch(() => [props.modelValue, props.fieldId, canView.value], () => { ++contextId; saving.value = false; void load() }, { immediate: true, flush: 'sync' })
watch(canWrite, allowed => {
  if (allowed || mode.value === 'view') return
  ++contextId; saving.value = false; error.value = ''; mode.value = 'view'; fill(detail.value?.latest_version)
  if (!detail.value) emit('update:modelValue', false)
}, { flush: 'sync' })
watch(() => form.data_type, (value, previous) => { if (writable() && previous === 'enum' && value !== 'enum') form.value_domain = null })
onBeforeUnmount(() => { ++contextId; ++requestId })
</script>

<template>
  <el-drawer :model-value="modelValue" :title="mode === 'create' ? '新建标准字段' : '标准字段详情'" size="min(680px, 90vw)" @close="close">
    <div v-loading="loading" class="standard-field-drawer">
      <el-alert v-if="error" :title="String(error)" type="error" :closable="false" show-icon />
      <p class="standard-field-drawer__note">此处维护字段定义和敏感分类；来源映射由资产/Mapping流程负责，发布和查询权限由服务端统一校验。</p>
      <p v-if="!canView" role="alert">无权限查看标准字段目录。</p>
      <p v-else-if="migrationRequired" role="status">旧格式值域仅支持读取，请先完成值域格式迁移；定义暂不可保存。</p>
      <template v-if="canView && !loading">
        <StandardFieldDefinitionForm v-if="writable() && mode !== 'view'" :model-value="form" :mode="mode" :saving="saving" :categories="categories" :governance-mode="props.governanceMode" @update:model-value="Object.assign(form, $event)" @submit="save" />
        <template v-else-if="detail">
          <section class="field-summary">
            <div><span>字段编码</span><strong>{{ detail.field_code }}</strong></div>
            <div><span>字段名称</span><strong>{{ detail.latest_version.field_name }}</strong></div>
            <div><span>数据类型</span><strong>{{ detail.latest_version.data_type }}</strong></div>
            <div class="field-summary__definition"><span>业务定义</span><p>{{ detail.latest_version.business_definition }}</p></div>
            <div><span>敏感字段分类</span><strong>{{ categoryNames.length ? categoryNames.join('、') : '未分类' }}</strong></div>
            <div><span>引用关系</span><strong>{{ referenceCount }} 个已登记引用</strong></div>
          </section>
          <section v-if="props.governanceMode" class="display-name-editor">
            <div><strong>展示名称</strong><p>兼容历史治理数据的展示名称维护。</p></div>
            <div class="display-name-editor__row">
              <el-input v-model="displayName" maxlength="128" :disabled="saving || !userStore.hasOp('warehouse.standard_fields.catalog', 'U')" />
              <PermissionButton menu="warehouse.standard_fields.catalog" op="U" :loading="saving" @click="saveDisplayName">更新</PermissionButton>
            </div>
          </section>
          <StandardFieldValueDomain v-if="detail.latest_version.data_type === 'enum'" :model-value="detail.latest_version.value_domain" readonly />
          <StandardFieldBindingPanel v-if="props.governanceMode" :field-id="detail.id" :active-version-id="detail.current_active_version_id" :bindings="detail.bindings" :dataset-id="datasetId" :table-name="tableName" @changed="load(); emit('changed')" />
        </template>
      </template>
    </div>
    <template #footer>
      <el-button @click="close">关闭</el-button>
      <PermissionButton v-if="detail && mode === 'view'" menu="warehouse.standard_fields.catalog" op="U" :disabled="saving" @click="beginEdit">编辑</PermissionButton>
      <el-button v-if="writable()" @click="cancel">取消</el-button>
      <PermissionButton v-if="writable()" menu="warehouse.standard_fields.catalog" :op="mode === 'edit' ? 'U' : 'C'" type="primary" :disabled="saving || migrationRequired" @click="save">{{ saving ? '保存中…' : '保存草稿' }}</PermissionButton>
    </template>
  </el-drawer>
</template>

<style scoped>
.field-summary { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg-subtle); }
.field-summary > div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 8px; align-items: start; }
.field-summary span { color: var(--color-text-secondary); font-size: 12px; }
.field-summary strong, .field-summary p { margin: 0; overflow-wrap: anywhere; }
.field-summary__definition p { color: var(--color-text-regular); line-height: 1.6; }
.standard-field-drawer { display: grid; gap: 16px; color: var(--color-text-primary); }
.standard-field-drawer__note { margin: 0; color: var(--color-text-secondary); font-size: 13px; line-height: 1.6; }
.display-name-editor { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg-subtle); }
.display-name-editor p { margin: 4px 0 0; color: var(--color-text-secondary); font-size: 12px; }
.display-name-editor__row { display: flex; gap: 8px; }
</style>
