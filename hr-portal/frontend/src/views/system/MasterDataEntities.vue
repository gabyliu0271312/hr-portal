<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import { masterDataApi, type EntityDefinition } from '@/api/masterData'
import { useUserStore } from '@/stores/user'
import EntityDefinitionList from '@/components/master-data/EntityDefinitionList.vue'
import EntityDefinitionForm from '@/components/master-data/EntityDefinitionForm.vue'
import EntityFieldReferences from '@/components/master-data/EntityFieldReferences.vue'
import RecordEntityRecords from '@/components/master-data/RecordEntityRecords.vue'
const store = useUserStore()
const canView = computed(() => store.menus.some(m => m.code === 'system.master_entities'))
const items = ref<EntityDefinition[]>([])
const selected = ref<EntityDefinition | null>(null)
const editing = ref<EntityDefinition | null>(null)
const form = ref({ entity_code: 'person', name: '人员', description: '人员基本信息定义，不包含真实人员记录。' })
const formOpen = ref(false)
const saving = ref(false)
const publishing = ref(false)
const recordVersion = ref(0)
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const page = ref(1)
const total = ref(0)
const canSave = computed(() => canView.value && store.hasOp('system.master_entities', editing.value ? 'U' : 'C'))
let request = 0
let context = 0
function message(cause: any) {
  let detail = cause?.response?.data?.detail
  if (typeof detail === 'string') { try { detail = JSON.parse(detail) } catch { return detail } }
  return detail?.message || '操作失败，请核对权限和当前定义后重试。'
}
async function load() {
  const current = ++request
  items.value = []; selected.value = null; total.value = 0; error.value = ''; loading.value = false
  if (!canView.value) return
  loading.value = true
  try {
    const result = await masterDataApi.list({ keyword: keyword.value.trim() || undefined, offset: (page.value - 1) * 20, limit: 20 })
    if (current === request) { items.value = result.items; total.value = result.total }
  } catch (cause) { if (current === request) error.value = message(cause) }
  finally { if (current === request) loading.value = false }
}
function open(entity: EntityDefinition | null = null) {
  if (saving.value || !canView.value || !store.hasOp('system.master_entities', entity ? 'U' : 'C')) return
  ++context; editing.value = entity; error.value = ''
  form.value = entity ? { entity_code: entity.entity_code, name: entity.name, description: entity.description } : { entity_code: 'person', name: '人员', description: '人员基本信息定义，不包含真实人员记录。' }
  formOpen.value = true
}
async function save() {
  if (!canSave.value || saving.value) return
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(form.value.entity_code) || !form.value.name.trim() || !form.value.description.trim()) {
    ElMessage.warning('请填写合法实体编码、名称和业务说明'); return
  }
  const current = context
  saving.value = true; error.value = ''
  try {
    const payload = { name: form.value.name.trim(), description: form.value.description.trim() }
    const entity = editing.value ? await masterDataApi.update(editing.value.id, { ...payload, expected_revision: editing.value.revision }) : await masterDataApi.create({ ...payload, entity_code: form.value.entity_code })
    if (current !== context || !canSave.value) return
    formOpen.value = false
    await load()
    if (current !== context || !canView.value) return
    selected.value = entity
    ElMessage.success('定义已保存；未创建或接管人员记录')
  } catch (cause) { if (current === context) error.value = message(cause) }
  finally { if (current === context) saving.value = false }
}
async function publish(entity: EntityDefinition) {
  if (publishing.value || !canView.value || !store.hasOp('system.master_entities', 'U')) return
  const current = context
  publishing.value = true; error.value = ''
  try {
    const updated = await masterDataApi.publish(entity.id, entity.revision)
    if (current !== context || !canView.value || !store.hasOp('system.master_entities', 'U')) return
    const index = items.value.findIndex(item => item.id === entity.id)
    if (index >= 0) items.value[index] = updated
    if (selected.value?.id === entity.id) selected.value = updated
    ++recordVersion.value
    ElMessage.success('实体已发布；记录结构已冻结，人员记录仍由受控服务写入')
  } catch (cause) { if (current === context) error.value = message(cause) }
  finally { if (current === context) publishing.value = false }
}

watch(canSave, allowed => { if (!allowed) { ++context; formOpen.value = false; saving.value = false } }, { flush: 'sync' })
watch(() => [canView.value, store.user?.id, JSON.stringify(store.menus)], () => { ++context; formOpen.value = false; saving.value = false; publishing.value = false; void load() }, { immediate: true, flush: 'sync' })
watch(page, load)
onBeforeUnmount(() => { ++context; ++request })
</script>

<template>
  <div style="padding: 24px"><el-card shadow="never">
    <template #header><div class="entities-heading"><strong>主数据定义</strong><PermissionButton menu="system.master_entities" op="C" type="primary" :disabled="saving" @click="open()">新建实体定义</PermissionButton></div></template>
    <p class="entities-note">配置定义与业务记录访问独立授权。字段与枚举统一在数据仓库的标准字段目录维护。</p>
    <p v-if="!canView" role="alert">无权限查看主数据定义。</p>
    <template v-else>
      <el-alert v-if="error" :title="String(error)" type="error" :closable="false" show-icon />
      <EntityDefinitionForm v-if="formOpen" v-model="form" :editing="!!editing" :saving="saving" @save="save" @cancel="formOpen = false" />
      <el-form v-else inline @submit.prevent="page = 1; load()"><el-form-item label="搜索"><el-input v-model="keyword" clearable placeholder="实体编码或名称" /></el-form-item><PermissionButton menu="system.master_entities" op="V" @click="page = 1; load()">查询</PermissionButton></el-form>
      <EntityDefinitionList :items="items" :loading="loading" :publishing="publishing" @select="selected = $event" @edit="open" @publish="publish" />
      <el-pagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" />
      <EntityFieldReferences v-if="selected" :key="selected.id" :entity="selected" />
    </template>
    <RecordEntityRecords :key="recordVersion" />
  </el-card></div>
</template>

<style scoped>
.entities-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.entities-note { color: var(--color-text-secondary); font-size: 13px; margin: 0 0 20px; }
.el-pagination { margin-top: 16px; justify-content: flex-end; }
</style>
