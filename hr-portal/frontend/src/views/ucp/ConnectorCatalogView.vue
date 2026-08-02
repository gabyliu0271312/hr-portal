<template>
  <div class="page">
    <div class="head">
      <div><h2>接入类型管理</h2><p>管理可接入的系统模板；资源模板和业务动作在所属系统模板内维护。</p></div>
      <el-button type="primary" @click="createSystemPackage">新增接入类型</el-button>
    </div>
    <el-table :data="systemPackages" v-loading="loading" border>
      <el-table-column prop="package_name" label="接入类型" min-width="160" />
      <el-table-column prop="package_code" label="编码" min-width="180" />
      <el-table-column label="接入方式" min-width="120"><template #default="{ row }">{{ categoryLabel(row.category) }}</template></el-table-column>
      <el-table-column label="资源模板" min-width="260"><template #default="{ row }">{{ resourceSummary(row.package_code) }}</template></el-table-column>
      <el-table-column prop="status" label="状态" width="110" />
      <el-table-column label="操作" width="140"><template #default="{ row }"><el-button link type="primary" @click="manage(row)">管理</el-button><el-button v-if="row.status === 'DRAFT'" link type="success" @click="publish(row)">发布</el-button></template></el-table-column>
    </el-table>

    <el-drawer v-model="drawerVisible" :title="drawerTitle" size="820px" destroy-on-close>
      <el-tabs v-model="activeTab" class="catalog-tabs">
        <el-tab-pane label="接入配置" name="config">
          <el-alert type="info" :closable="false" class="section-tip" title="接入配置定义系统如何连接；认证、凭证 Schema、系统实例字段均在本页分区维护。" />
          <el-form label-width="120px">
            <el-divider content-position="left">基础信息</el-divider>
            <el-form-item label="模板编码" required><el-input v-model="systemForm.package_code" :disabled="Boolean(systemForm.id)" /></el-form-item>
            <el-form-item label="模板名称" required><el-input v-model="systemForm.package_name" /></el-form-item>
            <el-form-item label="目录分类"><el-select v-model="systemForm.category" :disabled="Boolean(systemForm.id)"><el-option label="标准 SaaS" value="STANDARD_SAAS" /><el-option label="受控 API" value="CONTROLLED_API" /></el-select></el-form-item>
            <el-form-item label="维护人"><el-input v-model="systemForm.owner" /></el-form-item>
            <el-form-item label="版本"><el-input v-model="systemForm.version" /></el-form-item>
            <el-form-item label="升级说明"><el-input v-model="systemForm.release_notes" type="textarea" /></el-form-item>
            <el-divider content-position="left">连接与认证</el-divider>
            <el-form-item label="基础 URL"><el-input v-model="systemForm.base_url" /></el-form-item>
            <el-form-item label="允许域名"><el-input v-model="systemForm.hosts" placeholder="多个域名以逗号分隔" /></el-form-item>
            <el-form-item label="认证方式"><el-select v-model="systemForm.auth_type"><el-option label="无认证" value="none" /><el-option label="Bearer Token" value="bearer" /><el-option label="App Key / Secret" value="app_key_secret" /><el-option label="OAuth 2.0" value="oauth2" /></el-select></el-form-item>
            <el-form-item label="必需 Scope"><el-input v-model="systemForm.scopes" placeholder="多个 Scope 以逗号分隔" /></el-form-item>
            <el-divider content-position="left">系统实例字段</el-divider>
            <el-empty description="暂未配置系统实例字段；后续可在此定义租户 ID、企业 ID、环境标识等系统差异字段。" :image-size="72" />
          </el-form>
          <div class="drawer-actions"><el-button type="primary" @click="saveSystemPackage">保存接入配置</el-button></div>
        </el-tab-pane>

        <el-tab-pane label="资源模板" name="resources" :disabled="!activePackage">
          <el-alert type="info" :closable="false" class="section-tip" title="资源模板定义此系统可以添加的资源。资源创建时仅选择模板，编码、名称、实现类型与凭证自动继承。" />
          <div class="tab-toolbar"><strong>资源模板</strong><el-button type="primary" @click="openResourceEditor()">新增资源模板</el-button></div>
          <el-table :data="activeResourceTemplates" border>
            <el-table-column prop="package_name" label="资源名称" />
            <el-table-column prop="package_code" label="资源编码" />
            <el-table-column label="资源实现类型"><template #default="{ row }">{{ row.system_schema?.resource_connector_type }}</template></el-table-column>
            <el-table-column prop="status" label="状态" width="100" />
            <el-table-column label="操作" width="130"><template #default="{ row }"><el-button link @click="openResourceEditor(row)">编辑</el-button><el-button v-if="row.status === 'DRAFT'" link type="success" @click="publish(row)">发布</el-button></template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="业务动作" name="operations" :disabled="!activePackage">
          <PackageOperations v-if="activePackage" :key="activePackage.package_code" :package-code="activePackage.package_code" :package-id="activePackage.id" @changed="reloadActivePackage" />
        </el-tab-pane>
      </el-tabs>
    </el-drawer>

    <el-dialog v-model="resourceEditorVisible" :title="resourceForm.id ? '编辑资源模板' : '新增资源模板'" width="860px" destroy-on-close>
      <el-alert type="info" :closable="false" class="section-tip" title="资源模板是资源级配置主数据：定义默认连接配置、凭证要求、对象模型和允许的实例覆盖。系统实例仅绑定凭证、维护状态及已批准的环境差异。" />`n      <el-alert v-if="resourceTemplateImpact" :closable="false" type="warning" class="section-tip" :title="`当前模板影响 ${resourceTemplateImpact.total} 个资源实例；修改已发布模板前请确认兼容性。`" />
      <el-form label-width="120px">
        <el-form-item label="资源模板编码" required><el-input v-model="resourceForm.package_code" :disabled="Boolean(resourceForm.id)" /></el-form-item>
        <el-form-item label="资源模板名称" required><el-input v-model="resourceForm.package_name" /></el-form-item>
        <el-form-item label="资源实现类型" required><el-select v-model="resourceForm.resource_connector_type" style="width:100%" @change="applyResourceTemplatePreset"><el-option v-for="item in connectorTypes" :key="item.code" :label="item.label" :value="item.code" /></el-select></el-form-item>
        <el-form-item label="维护人"><el-input v-model="resourceForm.owner" /></el-form-item>
        <el-form-item label="版本"><el-input v-model="resourceForm.version" /></el-form-item>`n        <el-form-item label="描述"><el-input v-model="resourceForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-divider content-position="left">资源实例默认值</el-divider>
        <el-form-item label="稳定资源编码" required><el-input v-model="resourceForm.resource_code" placeholder="实例创建后保持稳定，不能直接等同模板编码" /></el-form-item>
        <el-form-item label="默认资源名称" required><el-input v-model="resourceForm.resource_name" /></el-form-item>
        <template v-if="resourceForm.resource_connector_type === 'webhook_ingress'">
          <el-divider content-position="left">Webhook 共用入站规则</el-divider>
          <el-form-item label="签名 Header"><el-input v-model="resourceForm.signature_header" /></el-form-item>
          <el-form-item label="请求 ID Header"><el-input v-model="resourceForm.request_id_header" /></el-form-item>
          <el-form-item label="时间戳 Header"><el-input v-model="resourceForm.timestamp_header" /></el-form-item>
          <el-form-item label="Nonce Header"><el-input v-model="resourceForm.nonce_header" /></el-form-item>
          <el-form-item label="事件类型路径"><el-input v-model="resourceForm.event_type_path" /></el-form-item>
          <el-form-item label="请求 ID 路径"><el-input v-model="resourceForm.event_id_path" /></el-form-item>
          <el-form-item label="批次路径"><el-input v-model="resourceForm.batch_id_path" /></el-form-item>
          <el-form-item label="期间路径"><el-input v-model="resourceForm.period_path" /></el-form-item>
          <el-form-item label="明细路径"><el-input v-model="resourceForm.records_path" /></el-form-item>
          <el-form-item label="默认限流"><el-input-number v-model="resourceForm.rate_limit_per_minute" :min="1" /><span style="margin-left:8px">每分钟</span><el-input-number v-model="resourceForm.rate_limit_burst" :min="1" style="margin-left:12px" /><span style="margin-left:8px">突发容量</span></el-form-item>
          <el-form-item label="最大包体"><el-input-number v-model="resourceForm.max_body_bytes" :min="1024" /><span style="margin-left:8px">字节</span></el-form-item>
        </template>
        <el-divider content-position="left">凭证、对象与实例边界</el-divider>
        <el-form-item label="凭证认证方式"><el-select v-model="resourceForm.credential_auth_type" style="width:100%"><el-option label="HMAC-SHA256 时间戳签名" value="hmac_sha256_timestamped" /><el-option label="App Key / Secret" value="app_key_secret" /><el-option label="Bearer Token" value="bearer" /><el-option label="无认证" value="none" /></el-select></el-form-item>
        <el-form-item label="必需密钥"><el-input v-model="resourceForm.required_secret_keys" placeholder="多个密钥以逗号分隔" /></el-form-item>
        <el-form-item label="对象类型"><el-select v-model="resourceForm.object_type" style="width:100%"><el-option label="事件" value="EVENT_TYPE" /><el-option label="报表" value="REPORT" /><el-option label="数据表" value="TABLE" /><el-option label="API 对象" value="API_OBJECT" /></el-select></el-form-item>
        <el-form-item label="允许多个对象"><el-switch v-model="resourceForm.object_multiple" /></el-form-item>
        <el-form-item label="对象必填字段"><el-input v-model="resourceForm.required_object_fields" placeholder="多个字段以逗号分隔" /></el-form-item>
        <template v-if="resourceForm.object_type === 'EVENT_TYPE'">
          <el-form-item label="事件定义来源"><el-input v-model="resourceForm.event_definition_source_system_type" placeholder="如 COST_ALLOCATION_SYSTEM" /></el-form-item>
          <el-form-item label="允许事件编码"><el-input v-model="resourceForm.event_definition_codes" placeholder="留空表示该来源全部已发布事件；多个编码以逗号分隔" /></el-form-item>
          <el-form-item label="默认事件对象"><div style="width:100%"><div style="margin-bottom:8px"><el-button size="small" @click="addDefaultEventObject">新增默认事件</el-button></div><el-table :data="resourceForm.default_event_objects" size="small" border><el-table-column label="对象编码" min-width="145"><template #default="{ row }"><el-input v-model="row.object_code" /></template></el-table-column><el-table-column label="事件名称" min-width="125"><template #default="{ row }"><el-input v-model="row.object_name" /></template></el-table-column><el-table-column label="事件定义编码" min-width="190"><template #default="{ row }"><el-input v-model="row.event_definition_code" placeholder="allocation_period.locked" /></template></el-table-column><el-table-column label="操作" width="70"><template #default="{ $index }"><el-button link type="danger" @click="resourceForm.default_event_objects.splice($index, 1)">删除</el-button></template></el-table-column></el-table></div></el-form-item>
        </template>
        <el-form-item label="实例允许覆盖"><el-checkbox-group v-model="resourceForm.allowed_override_fields"><el-checkbox label="credential_id">绑定凭证</el-checkbox><el-checkbox v-if="resourceForm.resource_connector_type === 'webhook_ingress'" label="protocol.ingress.rate_limit_per_minute">每分钟限流</el-checkbox><el-checkbox v-if="resourceForm.resource_connector_type === 'webhook_ingress'" label="protocol.ingress.rate_limit_burst">突发容量</el-checkbox></el-checkbox-group></el-form-item>
      </el-form>
      <template #footer><el-button @click="resourceEditorVisible = false">取消</el-button><el-button type="primary" @click="saveResourceTemplate">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ucpApi } from '@/api/ucp'
import PackageOperations from './PackageOperations.vue'

const items = ref<any[]>([])
const loading = ref(false)
const drawerVisible = ref(false)
const connectorTypes = ref<any[]>([])

async function loadConnectorTypes() {
  try {
    connectorTypes.value = (await ucpApi.connectorTypes('ucp')).filter((item: any) => item.connection_kind === 'DATA_OBJECT' || item.connection_kind === 'EVENT_INGRESS')
  } catch {
    connectorTypes.value = []
  }
}


const resourceEditorVisible = ref(false)
const resourceTemplateImpact = ref<any>(null)
const activeTab = ref('config')
const activePackage = ref<any>()
const blankSystem = () => ({ id: 0, package_code: '', package_name: '', category: 'STANDARD_SAAS', owner: '', version: '1.0.0', hosts: '', auth_type: 'none', scopes: '', base_url: '', release_notes: '' })
const blankResource = () => ({ id: 0, package_code: '', package_name: '', resource_connector_type: '', owner: '', version: '1.0.0', description: '', resource_code: '', resource_name: '', credential_auth_type: 'none', required_secret_keys: '', object_type: 'TABLE', object_multiple: true, required_object_fields: '', allowed_override_fields: ['credential_id'], signature_header: 'X-Signature', request_id_header: 'X-Request-Id', timestamp_header: 'X-Timestamp', nonce_header: 'X-Nonce', event_type_path: 'event_type', event_id_path: 'request_id', batch_id_path: 'batch_id', period_path: 'period', records_path: 'records', rate_limit_per_minute: 120, rate_limit_burst: 10, max_body_bytes: 1048576, event_definition_source_system_type: '', event_definition_codes: '', default_event_objects: [], source_schema: {} })
const systemForm = reactive<any>(blankSystem())
const resourceForm = reactive<any>(blankResource())
const systemPackages = computed(() => items.value.filter(item => item.category !== 'INSTANCE_RESOURCE'))
const activeResourceTemplates = computed(() => items.value.filter(item => item.category === 'INSTANCE_RESOURCE' && item.system_schema?.parent_package_code === activePackage.value?.package_code))
const drawerTitle = computed(() => activePackage.value ? `管理接入类型 — ${activePackage.value.package_name}` : '新增接入类型')

function categoryLabel(category: string) { return category === 'CONTROLLED_API' ? '受控 API' : '标准 SaaS' }
function resourceSummary(packageCode: string) { const list = items.value.filter(item => item.category === 'INSTANCE_RESOURCE' && item.system_schema?.parent_package_code === packageCode); return list.length ? list.map(item => item.package_name).join('、') : '暂无资源模板' }
async function load() { loading.value = true; try { items.value = await ucpApi.connectorPackages() } finally { loading.value = false } }
function assignSystemForm(row?: any) { const schema = row?.system_schema || {}; const auth = row?.auth_policy || {}; Object.assign(systemForm, blankSystem(), row || {}, { hosts: (row?.host_allowlist || []).join(','), auth_type: auth.auth_type || 'none', scopes: (auth.required_scopes || []).join(','), base_url: schema.base_url || '' }) }
function createSystemPackage() { activePackage.value = undefined; assignSystemForm(); activeTab.value = 'config'; drawerVisible.value = true }
function manage(row: any) { activePackage.value = row; assignSystemForm(row); activeTab.value = 'config'; drawerVisible.value = true }
async function saveSystemPackage() { if (!systemForm.package_code || !systemForm.package_name) return ElMessage.warning('请填写模板编码和名称'); const payload = { package_code: systemForm.package_code, package_name: systemForm.package_name, category: systemForm.category, owner: systemForm.owner, version: systemForm.version, host_allowlist: systemForm.hosts.split(',').map((item: string) => item.trim()).filter(Boolean), auth_policy: { auth_type: systemForm.auth_type, required_scopes: systemForm.scopes.split(',').map((item: string) => item.trim()).filter(Boolean), credential_schema: [] }, system_schema: { base_url: systemForm.base_url, fields: [] }, release_notes: systemForm.release_notes }; try { const saved = systemForm.id ? await ucpApi.updateConnectorPackage(systemForm.package_code, payload) : await ucpApi.createConnectorPackage(payload); activePackage.value = saved; assignSystemForm(saved); await load(); ElMessage.success('接入配置已保存') } catch (error: any) { ElMessage.error(error?.response?.data?.detail || '保存失败') } }
function splitValues(value: string) { return value.split(',').map((item: string) => item.trim()).filter(Boolean) }
function addDefaultEventObject() { resourceForm.default_event_objects.push({ object_code: '', object_name: '', event_definition_code: '', is_active: true }) }
function resourceTemplatePreset(connectorType: string) {
  const presets: Record<string, any> = {
    webhook_ingress: { credential_auth_type: 'hmac_sha256_timestamped', required_secret_keys: 'signing_secret', object_type: 'EVENT_TYPE', required_object_fields: '', allowed_override_fields: ['credential_id', 'protocol.ingress.rate_limit_per_minute', 'protocol.ingress.rate_limit_burst'] },
    beisen_report: { credential_auth_type: 'app_key_secret', required_secret_keys: 'app_key,app_secret', object_type: 'REPORT', required_object_fields: 'report_id', allowed_override_fields: ['credential_id'] },
    feishu_sheet: { credential_auth_type: 'app_key_secret', required_secret_keys: 'app_id,app_secret', object_type: 'TABLE', required_object_fields: 'spreadsheet_token,sheet_id', allowed_override_fields: ['credential_id'] },
    feishu_bitable: { credential_auth_type: 'app_key_secret', required_secret_keys: 'app_id,app_secret', object_type: 'TABLE', required_object_fields: 'app_token,table_id', allowed_override_fields: ['credential_id'] },
  }
  return presets[connectorType] || { credential_auth_type: 'none', required_secret_keys: '', object_type: 'TABLE', required_object_fields: '', allowed_override_fields: ['credential_id'] }
}
function applyResourceTemplatePreset() { Object.assign(resourceForm, resourceTemplatePreset(resourceForm.resource_connector_type)) }
async function openResourceEditor(row?: any) { if (!activePackage.value) return; resourceTemplateImpact.value = null; const schema = row?.system_schema || {}; const defaults = schema.resource_defaults || {}; const ingress = defaults.protocol?.ingress || {}; const credential = schema.credential_requirement || {}; const objectTemplate = schema.object_template || {}; const preset = resourceTemplatePreset(schema.resource_connector_type || ''); Object.assign(resourceForm, blankResource(), preset, row || {}, { resource_connector_type: schema.resource_connector_type || '', resource_code: schema.resource_code || defaults.resource_code || '', resource_name: schema.resource_name || defaults.resource_name || '', credential_auth_type: credential.auth_type || preset.credential_auth_type, required_secret_keys: (credential.required_secret_keys || []).join(','), object_type: objectTemplate.object_type || preset.object_type, object_multiple: objectTemplate.multiple !== false, required_object_fields: (objectTemplate.required_object_fields || []).join(','), allowed_override_fields: schema.instance_override_policy?.allowed_fields || preset.allowed_override_fields, signature_header: ingress.signature_header || 'X-Signature', request_id_header: ingress.request_id_header || 'X-Request-Id', timestamp_header: ingress.timestamp_header || 'X-Timestamp', nonce_header: ingress.nonce_header || 'X-Nonce', event_type_path: ingress.event_type_path || 'event_type', event_id_path: ingress.event_id_path || 'request_id', batch_id_path: ingress.batch_id_path || 'batch_id', period_path: ingress.period_path || 'period', records_path: ingress.records_path || 'records', rate_limit_per_minute: ingress.rate_limit_per_minute || 120, rate_limit_burst: ingress.rate_limit_burst || 10, max_body_bytes: ingress.max_body_bytes || 1048576, event_definition_source_system_type: objectTemplate.event_definition_source_system_type || '', event_definition_codes: (objectTemplate.event_definition_codes || []).join(','), default_event_objects: (objectTemplate.default_objects || []).map((item: any) => ({ ...item })), source_schema: schema }); if (row?.package_code) { try { resourceTemplateImpact.value = await ucpApi.resourceTemplateImpact(row.package_code) } catch { resourceTemplateImpact.value = null } } resourceEditorVisible.value = true }
async function saveResourceTemplate() { if (!resourceForm.package_code || !resourceForm.package_name || !resourceForm.resource_connector_type || !resourceForm.resource_code || !resourceForm.resource_name) return ElMessage.warning('请填写资源模板编码、名称、实现类型及稳定资源标识'); try { const resourceDefaults: any = { resource_code: resourceForm.resource_code, resource_name: resourceForm.resource_name }; if (resourceForm.resource_connector_type === 'webhook_ingress') resourceDefaults.protocol = { ingress: { verification_strategy: 'HMAC_SHA256_TIMESTAMPED', signature_header: resourceForm.signature_header, request_id_header: resourceForm.request_id_header, timestamp_header: resourceForm.timestamp_header, nonce_header: resourceForm.nonce_header, event_type_path: resourceForm.event_type_path, event_id_path: resourceForm.event_id_path, batch_id_path: resourceForm.batch_id_path, period_path: resourceForm.period_path, records_path: resourceForm.records_path, rate_limit_per_minute: resourceForm.rate_limit_per_minute, rate_limit_burst: resourceForm.rate_limit_burst, max_body_bytes: resourceForm.max_body_bytes } }; const payload = { package_code: resourceForm.package_code, package_name: resourceForm.package_name, category: 'INSTANCE_RESOURCE', owner: resourceForm.owner, version: resourceForm.version, description: resourceForm.description, host_allowlist: [], auth_policy: {}, system_schema: { ...(resourceForm.source_schema || {}), parent_package_code: activePackage.value.package_code, resource_connector_type: resourceForm.resource_connector_type, resource_defaults: resourceDefaults, credential_requirement: { auth_type: resourceForm.credential_auth_type, required_secret_keys: splitValues(resourceForm.required_secret_keys) }, object_template: { object_type: resourceForm.object_type, multiple: resourceForm.object_multiple, required_object_fields: splitValues(resourceForm.required_object_fields), event_definition_source_system_type: resourceForm.event_definition_source_system_type || undefined, event_definition_codes: splitValues(resourceForm.event_definition_codes), config_schema: [], default_objects: resourceForm.default_event_objects.filter((item: any) => item.object_code && item.event_definition_code) }, instance_override_policy: { allowed_fields: resourceForm.allowed_override_fields } } }; if (resourceForm.id) await ucpApi.updateConnectorPackage(resourceForm.package_code, payload); else await ucpApi.createConnectorPackage(payload); resourceEditorVisible.value = false; await load(); ElMessage.success('资源模板已保存') } catch (error: any) { ElMessage.error(error?.response?.data?.detail || error?.message || '保存失败') } }async function publish(row: any) { try { await ucpApi.publishConnectorPackage(row.package_code); await load(); if (activePackage.value?.package_code === row.package_code) activePackage.value = items.value.find(item => item.package_code === row.package_code) } catch (error: any) { ElMessage.error(error?.response?.data?.detail || '发布失败') } }
async function reloadActivePackage() { await load(); if (activePackage.value) activePackage.value = items.value.find(item => item.package_code === activePackage.value.package_code) || activePackage.value }
onMounted(() => { load(); loadConnectorTypes() })
</script>

<style scoped>
.page { padding: 20px }.head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:16px }.head h2 { margin:0 0 6px }.head p { margin:0; color:#909399 }.section-tip { margin-bottom:16px }.tab-toolbar,.drawer-actions { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px }.drawer-actions { justify-content:flex-end; margin-top:18px }.catalog-tabs :deep(.el-tabs__content) { padding-top:4px }
</style>
