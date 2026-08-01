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

    <el-dialog v-model="resourceEditorVisible" :title="resourceForm.id ? '编辑资源模板' : '新增资源模板'" width="580px" destroy-on-close>
      <el-alert type="info" :closable="false" class="section-tip" title="资源模板自动归属当前系统模板，无需重复选择父系统。" />
      <el-form label-width="120px">
        <el-form-item label="资源模板编码" required><el-input v-model="resourceForm.package_code" :disabled="Boolean(resourceForm.id)" /></el-form-item>
        <el-form-item label="资源模板名称" required><el-input v-model="resourceForm.package_name" /></el-form-item>
        <el-form-item label="资源实现类型" required><el-select v-model="resourceForm.resource_connector_type" style="width:100%"><el-option v-for="item in connectorTypes" :key="item.code" :label="item.label" :value="item.code" /></el-select></el-form-item>
        <el-form-item label="维护人"><el-input v-model="resourceForm.owner" /></el-form-item>
        <el-form-item label="版本"><el-input v-model="resourceForm.version" /></el-form-item>
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
const activeTab = ref('config')
const activePackage = ref<any>()
const blankSystem = () => ({ id: 0, package_code: '', package_name: '', category: 'STANDARD_SAAS', owner: '', version: '1.0.0', hosts: '', auth_type: 'none', scopes: '', base_url: '', release_notes: '' })
const blankResource = () => ({ id: 0, package_code: '', package_name: '', resource_connector_type: '', owner: '', version: '1.0.0' })
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
function openResourceEditor(row?: any) { if (!activePackage.value) return; const schema = row?.system_schema || {}; Object.assign(resourceForm, blankResource(), row || {}, { resource_connector_type: schema.resource_connector_type || '' }); resourceEditorVisible.value = true }
async function saveResourceTemplate() { if (!resourceForm.package_code || !resourceForm.package_name || !resourceForm.resource_connector_type) return ElMessage.warning('请填写资源模板编码、名称和实现类型'); const payload = { package_code: resourceForm.package_code, package_name: resourceForm.package_name, category: 'INSTANCE_RESOURCE', owner: resourceForm.owner, version: resourceForm.version, host_allowlist: [], auth_policy: {}, system_schema: { parent_package_code: activePackage.value.package_code, resource_connector_type: resourceForm.resource_connector_type } }; try { if (resourceForm.id) await ucpApi.updateConnectorPackage(resourceForm.package_code, payload); else await ucpApi.createConnectorPackage(payload); resourceEditorVisible.value = false; await load(); ElMessage.success('资源模板已保存') } catch (error: any) { ElMessage.error(error?.response?.data?.detail || '保存失败') } }
async function publish(row: any) { try { await ucpApi.publishConnectorPackage(row.package_code); await load(); if (activePackage.value?.package_code === row.package_code) activePackage.value = items.value.find(item => item.package_code === row.package_code) } catch (error: any) { ElMessage.error(error?.response?.data?.detail || '发布失败') } }
async function reloadActivePackage() { await load(); if (activePackage.value) activePackage.value = items.value.find(item => item.package_code === activePackage.value.package_code) || activePackage.value }
onMounted(() => { load(); loadConnectorTypes() })
</script>

<style scoped>
.page { padding: 20px }.head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:16px }.head h2 { margin:0 0 6px }.head p { margin:0; color:#909399 }.section-tip { margin-bottom:16px }.tab-toolbar,.drawer-actions { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px }.drawer-actions { justify-content:flex-end; margin-top:18px }.catalog-tabs :deep(.el-tabs__content) { padding-top:4px }
</style>
