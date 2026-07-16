<template>
  <div class="diff-page">
    <el-card>
      <template #header><div class="page-header"><h2>差异检测</h2><el-button type="primary" @click="openCreateJob">新建任务</el-button></div></template>
      <el-table :data="jobs" v-loading="loading" stripe border>
        <el-table-column prop="job_code" label="编码" width="160"/>
        <el-table-column prop="job_name" label="名称" min-width="150"/>
        <el-table-column label="源 → 目标" width="180"><template #default="{row}">{{ row.source_system }} → {{ row.target_system }}</template></el-table-column>
        <el-table-column prop="object_type" label="对象" width="100"/>
        <el-table-column prop="last_run_status" label="最近状态" width="100"/>
        <el-table-column label="操作" width="280"><template #default="{row}"><el-button size="small" @click="runJob(row)">执行</el-button><el-button size="small" @click="editJob(row)">编辑</el-button><el-button size="small" type="danger" @click="deleteJob(row)">删除</el-button></template></el-table-column>
      </el-table>
    </el-card>

    <el-card style="margin-top:12px">
      <template #header><h3>差异记录</h3></template>
      <el-form inline><el-form-item label="类型"><el-select v-model="recFilters.diff_type" clearable><el-option label="缺失" value="MISSING"/><el-option label="多余" value="EXTRA"/><el-option label="不一致" value="FIELD_MISMATCH"/></el-select></el-form-item><el-form-item><el-button @click="loadRecords">查询</el-button></el-form-item></el-form>
      <el-table :data="records" v-loading="recLoading" stripe border>
        <el-table-column prop="object_key" label="对象" width="120"/>
        <el-table-column prop="object_name" label="名称" width="140"/>
        <el-table-column prop="diff_type" label="差异类型" width="120"><template #default="{row}"><el-tag :type="diffColor(row.diff_type)" size="small">{{ row.diff_type }}</el-tag></template></el-table-column>
        <el-table-column label="详情" min-width="200"><template #default="{row}">{{ JSON.stringify(row.diff_detail) }}</template></el-table-column>
        <el-table-column prop="suggested_action" label="建议" width="150"/>
        <el-table-column prop="created_at" label="时间" width="160"><template #default="{row}">{{ formatDateTime(row.created_at) }}</template></el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="差异检测任务" width="560px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="编码"><el-input v-model="form.job_code"/></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.job_name"/></el-form-item>
        <el-form-item label="源系统"><el-input v-model="form.source_system"/></el-form-item>
        <el-form-item label="目标系统"><el-input v-model="form.target_system"/></el-form-item>
        <el-form-item label="对象类型"><el-select v-model="form.object_type"><el-option label="人员" value="PERSON"/><el-option label="组织" value="ORG"/></el-select></el-form-item>
        <el-form-item label="关键字段"><el-input v-model="form.key_field"/></el-form-item>
        <el-form-item label="源资源 ID"><el-input-number v-model="form.source_resource_id" :min="1" placeholder="绑定源数据资源"/></el-form-item>
        <el-form-item label="目标资源 ID"><el-input-number v-model="form.target_resource_id" :min="1" placeholder="绑定目标数据资源"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" @click="saveJob">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { diffApi } from '@/api/ucp'

const jobs = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const form = reactive({ job_code:'', job_name:'', source_system:'', target_system:'', object_type:'ORG', key_field:'id', source_resource_id: null as number|null, target_resource_id: null as number|null })

const records = ref<any[]>([])
const recLoading = ref(false)
const recFilters = reactive({ diff_type: '' })

function diffColor(t: string) { return { MISSING:'danger', EXTRA:'warning', FIELD_MISMATCH:'info' }[t] || 'info' }

async function loadJobs() { loading.value = true; try { const res = await diffApi.listJobs(); jobs.value = res.items } catch(e:any){} finally { loading.value = false } }
function openCreateJob() { Object.assign(form, { job_code:'', job_name:'', source_system:'', target_system:'', object_type:'ORG', key_field:'id', source_resource_id: null, target_resource_id: null }); dialogVisible.value = true }
function editJob(row:any) { Object.assign(form, row); dialogVisible.value = true }

async function saveJob() {
  try { await diffApi.createJob({ ...form, source_resource_id: form.source_resource_id ?? undefined, target_resource_id: form.target_resource_id ?? undefined }); ElMessage.success('保存成功'); dialogVisible.value = false; loadJobs() }
  catch(e:any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
}
async function deleteJob(row:any) {
  try { await diffApi.deleteJob(row.id); ElMessage.success('已删除'); loadJobs() }
  catch(e:any) { ElMessage.error('删除失败') }
}
async function runJob(row:any) {
  try {
    const res = await diffApi.runJob(row.id)
    ElMessage.success(`检测完成: ${res.record_count} 差异`)
    loadRecords()
  } catch(e:any) { ElMessage.error(e?.response?.data?.detail || '执行失败') }
}
async function loadRecords() { recLoading.value = true; try { const res = await diffApi.listRecords({ diff_type: recFilters.diff_type||undefined }); records.value = res.items } catch(e:any){} finally { recLoading.value = false } }

onMounted(() => { loadJobs(); loadRecords() })
</script>

<style scoped>
.page-header { display:flex; justify-content:space-between; align-items:center }
</style>
