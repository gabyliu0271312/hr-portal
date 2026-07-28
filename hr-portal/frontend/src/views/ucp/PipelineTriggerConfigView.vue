<template>
  <section class="trigger-config">
    <header class="page-header">
      <div>
        <h2>Pipeline Triggers</h2>
        <p>Configure webhook, schedule, or manual entry points without exposing secrets or callback URLs.</p>
      </div>
      <el-button type="primary" :disabled="forbidden" @click="openCreate">Create trigger</el-button>
    </header>

    <el-alert v-if="forbidden" type="warning" :closable="false" title="You do not have permission to manage pipeline triggers." />
    <el-alert v-else-if="loadError" type="error" :closable="false" show-icon>
      <template #title>Unable to load triggers</template>
      <el-button link type="primary" @click="load">Retry</el-button>
    </el-alert>
    <el-alert v-if="!forbidden && !loadError && migrationStatus?.legacy_trigger_count" type="warning" :closable="false" show-icon class="migration-alert">
      <template #title>{{ migrationStatus.legacy_trigger_count }} legacy webhook trigger(s) require migration</template>
      <span>Legacy callbacks remain compatible during rollout. Recreate each trigger with a verified resource event object before enabling the resource ingress path.</span>
      <el-button link type="primary" @click="showLegacy">Review legacy triggers</el-button>
    </el-alert>

    <el-table v-if="!forbidden && !loadError" v-loading="loading" :data="items" empty-text="No pipeline triggers configured yet.">
      <el-table-column prop="trigger_name" label="Trigger" min-width="180" />
      <el-table-column prop="pipeline_template_code" label="Pipeline" min-width="160" />
      <el-table-column prop="trigger_type" label="Type" width="120" />
      <el-table-column label="Source" min-width="200">
        <template #default="{ row }">{{ sourceLabel(row) }}</template>
      </el-table-column>
      <el-table-column label="Status" width="110">
        <template #default="{ row }"><el-tag :type="row.is_active ? 'success' : 'info'">{{ row.is_active ? 'Enabled' : 'Disabled' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="Migration" width="150"><template #default="{ row }"><el-tag v-if="row.migration_status === 'PENDING_MIGRATION'" type="warning">Pending migration</el-tag><el-tag v-else-if="row.migration_status === 'MIGRATED'" type="success">Migrated</el-tag><span v-else>-</span></template></el-table-column>
      <el-table-column label="Actions" width="360" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">Edit</el-button>
          <el-button v-if="row.migration_status === 'PENDING_MIGRATION'" link type="warning" @click="openEdit(row)">Migrate</el-button>
          <el-button v-if="row.migration_status === 'MIGRATED'" link type="warning" @click="rollbackMigration(row)">Rollback migration</el-button>
          <el-button link type="primary" @click="toggle(row)">{{ row.is_active ? 'Disable' : 'Enable' }}</el-button>
          <el-button link type="primary" @click="openTest(row)">Dry run</el-button>
          <el-button link type="danger" :disabled="row.is_active" @click="remove(row)">Delete</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" :title="editing ? 'Edit pipeline trigger' : 'Create pipeline trigger'" width="680px" @closed="closeEditor">
      <el-form label-width="150px">
        <el-form-item label="Trigger code" required><el-input v-model.trim="form.trigger_code" :disabled="Boolean(editing)" /></el-form-item>
        <el-form-item label="Name" required><el-input v-model.trim="form.trigger_name" /></el-form-item>
        <el-form-item label="Pipeline template" required><el-input v-model.trim="form.pipeline_template_code" /></el-form-item>
        <el-form-item label="Type" required>
          <el-select v-model="form.trigger_type" :disabled="Boolean(editing)" @change="resetSource">
            <el-option label="Webhook" value="WEBHOOK" /><el-option label="Schedule" value="SCHEDULE" /><el-option label="Manual" value="MANUAL" /><el-option label="Platform event" value="PLATFORM_EVENT" />
          </el-select>
        </el-form-item>
        <template v-if="form.trigger_type === 'WEBHOOK'">
          <el-form-item label="System" required>
            <el-select v-model="systemId" filterable :loading="sourceLoading" @change="loadResources"><el-option v-for="item in systems" :key="item.id" :label="item.system_name" :value="item.id" /></el-select>
          </el-form-item>
          <el-form-item label="Resource" required>
            <el-select v-model="resourceId" filterable :disabled="!systemId" :loading="sourceLoading" @change="loadObjects"><el-option v-for="item in resources" :key="item.id" :label="item.resource_name" :value="item.id" /></el-select>
          </el-form-item>
          <el-form-item label="Event object" required>
            <el-select v-model="form.source_resource_object_id" :disabled="!resourceId" :loading="sourceLoading"><el-option v-for="item in objects" :key="item.id" :label="item.object_name" :value="item.id" /></el-select>
            <div class="hint">Only active, verified event objects with a published event definition are available.</div>
          </el-form-item>
        </template>
        <template v-if="form.trigger_type === 'SCHEDULE'">
          <el-form-item label="调度计划" required><ScheduleSelector v-model:schedule="form.schedule_config.cron" :show-start-time="false" :allow-advanced="false" :allow-manual="false" :show-hint="false" /></el-form-item>
          <el-form-item label="执行时区"><el-input model-value="Asia/Shanghai（北京时间）" disabled /></el-form-item>
        </template>
        <template v-if="form.trigger_type === 'PLATFORM_EVENT'">
          <el-form-item label="事件分类" required><el-select v-model="platformEventCategory" @change="changePlatformEventCategory"><el-option v-for="item in platformEventCategories" :key="item.category" :label="item.category_name" :value="item.category" /></el-select></el-form-item>
          <el-form-item label="事件来源"><el-input :model-value="selectedPlatformEvent?.source_name || ''" disabled /></el-form-item>
          <el-form-item label="具体事件" required><el-select v-model="form.platform_event_type" :disabled="!platformEventCategory" @change="changePlatformEventType"><el-option v-for="item in platformEventOptions" :key="item.event_type" :label="item.event_name" :value="item.event_type" /></el-select></el-form-item>
          <el-form-item v-if="platformEventFilterFields.length" label="筛选字段"><el-select v-model="platformEventFilterField" clearable @change="syncPlatformEventFilter"><el-option v-for="field in platformEventFilterFields" :key="field" :label="field" :value="field" /></el-select></el-form-item>
          <el-form-item v-if="platformEventFilterField" label="字段值"><el-input v-model.trim="platformEventFilterValue" @change="syncPlatformEventFilter" /></el-form-item>
        </template>
        <el-form-item label="Failure policy"><el-select v-model="form.failure_policy"><el-option label="Retry" value="RETRY" /><el-option label="Dead letter" value="DEAD_LETTER" /><el-option label="Stop" value="STOP" /></el-select></el-form-item>
        <el-form-item label="Enabled"><el-switch v-model="form.is_active" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="visible = false">Cancel</el-button><el-button type="primary" :loading="saving" :disabled="!canSave" @click="save">Save</el-button></template>
    </el-dialog>

    <el-dialog v-model="testVisible" title="Dry-run input" width="640px">
      <p class="hint">The generated input contains the required fields from the selected event definition. It does not start a pipeline.</p>
      <el-input v-model="samplePayloadText" type="textarea" :rows="12" />
      <template #footer><el-button @click="testVisible = false">Cancel</el-button><el-button type="primary" :loading="testing" @click="runTest">Run dry run</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ucpApi } from '@/api/ucp'
import ScheduleSelector from '@/components/common/ScheduleSelector.vue'

type Trigger = Record<string, any>
const route = useRoute()
const items = ref<Trigger[]>([])
const systems = ref<any[]>([])
const resources = ref<any[]>([])
const objects = ref<any[]>([])
const loading = ref(false)
const sourceLoading = ref(false)
const saving = ref(false)
const testing = ref(false)
const loadError = ref(false)
const forbidden = ref(false)
const visible = ref(false)
const testVisible = ref(false)
const editing = ref<Trigger | null>(null)
const testTarget = ref<Trigger | null>(null)
const migrationStatus = ref<any>(null)
const systemId = ref<number>()
const resourceId = ref<number>()
const samplePayloadText = ref('{}')
const platformEventCatalog = ref<any[]>([])
const platformEventCategory = ref('')
const platformEventFilterField = ref('')
const platformEventFilterValue = ref('')

const fresh = () => ({ trigger_code: '', trigger_name: '', pipeline_template_code: '', trigger_type: 'WEBHOOK', platform_event_type: '', source_resource_object_id: undefined as number | undefined, schedule_config: { cron: '', timezone: 'Asia/Shanghai' }, filter_rule: {}, input_schema: {}, failure_policy: 'RETRY', run_as_type: 'SERVICE_ACCOUNT', is_active: false })
const form = ref(fresh())
const platformEventCategories = computed(() => Array.from(new Map(platformEventCatalog.value.filter((item) => item.enabled).map((item) => [item.category, item])).values()))
const platformEventOptions = computed(() => platformEventCatalog.value.filter((item) => item.enabled && item.category === platformEventCategory.value))
const selectedPlatformEvent = computed(() => platformEventCatalog.value.find((item) => item.event_type === form.value.platform_event_type))
const platformEventFilterFields = computed<string[]>(() => selectedPlatformEvent.value?.filter_fields || [])
const canSave = computed(() => Boolean(form.value.trigger_code && form.value.trigger_name && form.value.pipeline_template_code && (form.value.trigger_type !== 'WEBHOOK' || form.value.source_resource_object_id) && (form.value.trigger_type !== 'SCHEDULE' || form.value.schedule_config.cron && form.value.schedule_config.timezone) && (form.value.trigger_type !== 'PLATFORM_EVENT' || form.value.platform_event_type)))

function apiMessage(error: any, fallback: string) { return error?.response?.data?.detail || fallback }
function sourceLabel(row: Trigger) { return row.trigger_type === 'WEBHOOK' ? `事件对象 #${row.source_resource_object_id || '-'}` : row.trigger_type === 'SCHEDULE' ? `${row.schedule_config?.cron || '-'}（北京时间）` : row.trigger_type === 'PLATFORM_EVENT' ? '平台事件' : '人工启动' }
function resetSource() { systemId.value = undefined; resourceId.value = undefined; resources.value = []; objects.value = []; form.value.source_resource_object_id = undefined; platformEventCategory.value = ''; platformEventFilterField.value = ''; platformEventFilterValue.value = ''; form.value.platform_event_type = '' }
function changePlatformEventCategory() { form.value.platform_event_type = ''; platformEventFilterField.value = ''; platformEventFilterValue.value = ''; form.value.filter_rule = {} }
function changePlatformEventType() { platformEventFilterField.value = ''; platformEventFilterValue.value = ''; form.value.filter_rule = {} }
function syncPlatformEventFilter() { form.value.filter_rule = platformEventFilterField.value ? { path: `$.${platformEventFilterField.value}`, op: 'eq', value: platformEventFilterValue.value } : {} }
function closeEditor() { editing.value = null; form.value = fresh(); resetSource() }

async function load() {
  loading.value = true; loadError.value = false; forbidden.value = false
  try {
    const [triggers, availableSystems, migration, catalog] = await Promise.all([ucpApi.pipelineTriggers(), ucpApi.systems(), ucpApi.triggerMigrationStatus(), ucpApi.platformEventCatalog()])
    items.value = triggers.items || []; systems.value = availableSystems.items || []; migrationStatus.value = migration; platformEventCatalog.value = catalog.items || []
  } catch (error: any) {
    forbidden.value = error?.response?.status === 403
    loadError.value = !forbidden.value
    ElMessage.error(apiMessage(error, 'Load failed'))
  } finally { loading.value = false }
}
function showLegacy() { const codes = migrationStatus.value?.legacy_triggers?.map((item: any) => item.trigger_code).join(', ') || 'None'; ElMessage.warning(`Legacy trigger review: ${codes}`) }

async function loadResources() {
  resourceId.value = undefined; objects.value = []; form.value.source_resource_object_id = undefined
  if (!systemId.value) { resources.value = []; return }
  sourceLoading.value = true
  try { resources.value = (await ucpApi.resources({ system_id: systemId.value })).items || [] } catch (error: any) { ElMessage.error(apiMessage(error, 'Unable to load resources')) } finally { sourceLoading.value = false }
}

async function loadObjects() {
  objects.value = []; form.value.source_resource_object_id = undefined
  if (!resourceId.value) return
  sourceLoading.value = true
  try {
    const result = await ucpApi.resourceObjects(resourceId.value, { object_type: 'EVENT_TYPE', is_active: true })
    objects.value = (result.items || []).filter((item: any) => item.verification_status === 'VERIFIED' && item.event_definition?.status === 'PUBLISHED')
  } catch (error: any) { ElMessage.error(apiMessage(error, 'Unable to load event objects')) } finally { sourceLoading.value = false }
}

function openCreate() { form.value = fresh(); resetSource(); const templateCode = String(route.query.template_code || ''); const triggerType = String(route.query.trigger_type || 'WEBHOOK'); if (templateCode) form.value.pipeline_template_code = templateCode; if (['WEBHOOK', 'SCHEDULE', 'MANUAL', 'PLATFORM_EVENT'].includes(triggerType)) form.value.trigger_type = triggerType; visible.value = true }
async function openEdit(row: Trigger) {
  editing.value = row
  form.value = { ...fresh(), ...row, schedule_config: { ...fresh().schedule_config, ...(row.schedule_config || {}) } }
  resetSource()
  if (row.trigger_type === 'PLATFORM_EVENT') {
    form.value.platform_event_type = row.platform_event_type || ''
    const definition = platformEventCatalog.value.find((item) => item.event_type === form.value.platform_event_type)
    platformEventCategory.value = definition?.category || ''
    const rule = row.filter_rule || {}
    platformEventFilterField.value = String(rule.path || '').replace(/^\$\./, '')
    platformEventFilterValue.value = rule.value == null ? '' : String(rule.value)
  }
  if (row.trigger_type === 'WEBHOOK' && row.source_resource_id) {
    const resource = (await ucpApi.resources()).items?.find((item: any) => item.id === row.source_resource_id)
    if (resource) { systemId.value = resource.system_id; await loadResources(); resourceId.value = resource.id; await loadObjects(); form.value.source_resource_object_id = row.source_resource_object_id }
  }
  visible.value = true
}
async function save() {
  saving.value = true
  try {
    if (editing.value?.migration_status === 'PENDING_MIGRATION') await ucpApi.migrateLegacyPipelineTrigger(editing.value.trigger_code, form.value.source_resource_object_id!)
    if (editing.value) await ucpApi.updatePipelineTrigger(editing.value.trigger_code, form.value)
    else await ucpApi.createPipelineTrigger(form.value)
    visible.value = false; await load(); ElMessage.success('Trigger saved')
  } catch (error: any) { ElMessage.error(apiMessage(error, 'Save failed')) } finally { saving.value = false }
}
async function rollbackMigration(row: Trigger) {
  try {
    await ElMessageBox.confirm('Restore the legacy callback path and remove this trigger from the resource ingress route?', 'Rollback trigger migration')
    await ucpApi.rollbackLegacyPipelineTrigger(row.trigger_code)
    await load()
    ElMessage.success('Trigger migration rolled back')
  } catch (error: any) {
    if (error !== 'cancel') ElMessage.error(apiMessage(error, 'Rollback failed'))
  }
}
async function toggle(row: Trigger) { try { await ucpApi.enablePipelineTrigger(row.trigger_code, !row.is_active); await load(); ElMessage.success(row.is_active ? 'Trigger disabled' : 'Trigger enabled') } catch (error: any) { ElMessage.error(apiMessage(error, 'Operation failed')) } }
function sampleFor(row: Trigger, object?: any) {
  const required = object?.event_definition?.payload_schema?.required || []
  return Object.fromEntries((object?.event_definition?.payload_schema?.required || []).map((key: string) => [key, `<${key}>`]))
}
async function openTest(row: Trigger) {
  testTarget.value = row
  try {
    const source = row.source_resource_id ? (await ucpApi.resourceObjects(row.source_resource_id, { object_type: 'EVENT_TYPE', is_active: true })).items?.find((item: any) => item.id === row.source_resource_object_id) : undefined
    samplePayloadText.value = JSON.stringify(sampleFor(row, source), null, 2)
    testVisible.value = true
  } catch (error: any) { ElMessage.error(apiMessage(error, 'Unable to prepare dry-run input')) }
}
async function runTest() { try { const sample_payload = JSON.parse(samplePayloadText.value); testing.value = true; await ucpApi.testPipelineTrigger(testTarget.value!.trigger_code, { dry_run: true, sample_payload }); testVisible.value = false; ElMessage.success('Dry run completed') } catch (error: any) { ElMessage.error(error instanceof SyntaxError ? 'Input must be valid JSON' : apiMessage(error, 'Dry run failed')) } finally { testing.value = false } }
async function remove(row: Trigger) { try { await ElMessageBox.confirm('Disable the trigger before deleting it.', 'Delete trigger'); await ucpApi.deletePipelineTrigger(row.trigger_code); await load(); ElMessage.success('Trigger deleted') } catch (error: any) { if (error !== 'cancel') ElMessage.error(apiMessage(error, 'Delete failed')) } }

onMounted(async () => { await load(); if (route.query.template_code) openCreate() })
</script>

<style scoped>
.trigger-config { padding: 20px; }
.page-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.page-header h2 { margin: 0; }
.page-header p, .hint { color: #909399; font-size: 13px; margin: 6px 0 0; }
</style>
