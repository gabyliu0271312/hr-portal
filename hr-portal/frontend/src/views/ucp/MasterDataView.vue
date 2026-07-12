<template>
  <div class="master-data-page">
    <el-card>
      <template #header><div class="page-header"><h2>主数据目录</h2><el-button type="primary" @click="openCreateDialog">登记对象</el-button></div></template>
      <el-form inline class="filter-bar">
        <el-form-item label="类型"><el-select v-model="filters.object_type" clearable><el-option v-for="t in objTypes" :key="t" :label="t" :value="t"/></el-select></el-form-item>
        <el-form-item label="系统"><el-input v-model="filters.system_code" clearable/></el-form-item>
        <el-form-item><el-button @click="load">查询</el-button></el-form-item>
      </el-form>
      <el-table :data="rows" v-loading="loading" stripe border>
        <el-table-column prop="object_code" label="编码" width="160"><template #default="{row}"><code>{{ row.object_code }}</code></template></el-table-column>
        <el-table-column prop="object_name" label="名称" min-width="140"/>
        <el-table-column prop="object_type" label="类型" width="100"><template #default="{row}"><el-tag size="small">{{ row.object_type }}</el-tag></template></el-table-column>
        <el-table-column prop="system_code" label="系统" width="120"/>
        <el-table-column prop="source_type" label="来源" width="100"><template #default="{row}"><el-tag size="small" :type="row.source_type==='AUTHORITATIVE'?'danger':'info'">{{ row.source_type }}</el-tag></template></el-table-column>
        <el-table-column prop="owner" label="负责人" width="100"/>
        <el-table-column prop="sync_status" label="同步" width="100"/>
        <el-table-column label="操作" width="120"><template #default="{row}"><el-button size="small" @click="openEdit(row)">编辑</el-button></template></el-table-column>
      </el-table>
    </el-card>

    <el-card style="margin-top:12px">
      <template #header><div class="page-header"><h2>ID 映射</h2><el-button type="primary" @click="openMappingDialog">新增映射</el-button></div></template>
      <el-form inline class="filter-bar">
        <el-form-item label="类型"><el-select v-model="mFilters.object_type" clearable><el-option v-for="t in objTypes" :key="t" :label="t" :value="t"/></el-select></el-form-item>
        <el-form-item label="外部系统"><el-input v-model="mFilters.external_system" clearable/></el-form-item>
        <el-form-item><el-button @click="loadMappings">查询</el-button><el-button @click="checkConflicts">冲突检测</el-button></el-form-item>
      </el-form>
      <el-table :data="mappings" v-loading="mLoading" stripe border>
        <el-table-column prop="object_type" label="类型" width="100"/>
        <el-table-column prop="hr_id" label="HR ID" width="130"/>
        <el-table-column label="外部" min-width="200"><template #default="{row}">{{ row.external_system }} / {{ row.external_id }}</template></el-table-column>
        <el-table-column prop="external_name" label="外部名称" width="130"/>
        <el-table-column label="冲突" width="80"><template #default="{row}"><el-tag v-if="row.is_conflict" type="danger" size="small">冲突</el-tag><el-tag v-else type="success" size="small">正常</el-tag></template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{row}"><el-button size="small" type="danger" @click="deleteMapping(row)">删除</el-button></template></el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="登记主数据对象" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="编码"><el-input v-model="form.object_code"/></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.object_name"/></el-form-item>
        <el-form-item label="类型"><el-select v-model="form.object_type"><el-option v-for="t in objTypes" :key="t" :label="t" :value="t"/></el-select></el-form-item>
        <el-form-item label="系统编码"><el-input v-model="form.system_code"/></el-form-item>
        <el-form-item label="来源类型"><el-select v-model="form.source_type"><el-option label="参考来源" value="REFERENCE"/><el-option label="权威来源" value="AUTHORITATIVE"/></el-select></el-form-item>
        <el-form-item label="负责人"><el-input v-model="form.owner"/></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="mDialogVisible" title="新增 ID 映射" width="450px">
      <el-form :model="mForm" label-width="100px">
        <el-form-item label="对象类型"><el-select v-model="mForm.object_type"><el-option v-for="t in objTypes" :key="t" :label="t" :value="t"/></el-select></el-form-item>
        <el-form-item label="HR ID"><el-input v-model="mForm.hr_id"/></el-form-item>
        <el-form-item label="外部系统"><el-input v-model="mForm.external_system"/></el-form-item>
        <el-form-item label="外部 ID"><el-input v-model="mForm.external_id"/></el-form-item>
        <el-form-item label="外部名称"><el-input v-model="mForm.external_name"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="mDialogVisible=false">取消</el-button><el-button type="primary" @click="saveMapping">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { masterDataApi, idMappingApi } from '@/api/ucp'

const objTypes = ['PERSON', 'ORG', 'POSITION', 'ACCOUNT']
const rows = ref<any[]>([])
const loading = ref(false)
const filters = reactive({ object_type: '', system_code: '' })
const dialogVisible = ref(false)
const form = reactive({ object_code:'', object_name:'', object_type:'PERSON', system_code:'', source_type:'REFERENCE', owner:'', description:'' })

const mappings = ref<any[]>([])
const mLoading = ref(false)
const mFilters = reactive({ object_type: '', external_system: '' })
const mDialogVisible = ref(false)
const mForm = reactive({ object_type:'PERSON', hr_id:'', external_system:'', external_id:'', external_name:'' })

async function load() {
  loading.value = true
  try { const res = await masterDataApi.listObjects({ object_type: filters.object_type||undefined, system_code: filters.system_code||undefined }); rows.value = res.items }
  catch (e:any) { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

function openCreateDialog() { Object.assign(form, { object_code:'', object_name:'', object_type:'PERSON', system_code:'', source_type:'REFERENCE', owner:'', description:'' }); dialogVisible.value = true }
function openEdit(row:any) { Object.assign(form, row); dialogVisible.value = true }

async function save() {
  try {
    await masterDataApi.createObject({ ...form })
    ElMessage.success('保存成功'); dialogVisible.value = false; load()
  } catch (e:any) { ElMessage.error('保存失败') }
}

async function loadMappings() {
  mLoading.value = true
  try { const res = await idMappingApi.list({ object_type: mFilters.object_type||undefined, external_system: mFilters.external_system||undefined }); mappings.value = res.items }
  catch (e:any) { ElMessage.error('加载失败') }
  finally { mLoading.value = false }
}

function openMappingDialog() { Object.assign(mForm, { object_type:'PERSON', hr_id:'', external_system:'', external_id:'', external_name:'' }); mDialogVisible.value = true }

async function saveMapping() {
  try { await idMappingApi.create({ ...mForm }); ElMessage.success('创建成功'); mDialogVisible.value = false; loadMappings() }
  catch (e:any) { ElMessage.error('创建失败') }
}

async function deleteMapping(row:any) {
  try { await idMappingApi.delete(row.id); ElMessage.success('已删除'); loadMappings() }
  catch (e:any) { ElMessage.error('删除失败') }
}

async function checkConflicts() {
  try { const res = await idMappingApi.checkConflicts(); ElMessage.info(`发现 ${res.total} 个冲突`) }
  catch (e:any) { ElMessage.error('检测失败') }
}

onMounted(() => { load(); loadMappings() })
</script>

<style scoped>
.page-header { display:flex; justify-content:space-between; align-items:center }
.filter-bar { margin-bottom:8px }
</style>
