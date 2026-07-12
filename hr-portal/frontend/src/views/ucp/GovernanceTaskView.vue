<template>
  <div class="gov-page">
    <el-card>
      <template #header><div class="page-header"><h2>治理任务</h2><div><el-button type="primary" @click="openCreateTask">新建任务</el-button><el-button @click="generateReport">生成报表</el-button></div></div></template>
      <el-form inline class="filter-bar">
        <el-form-item label="状态"><el-select v-model="filters.status" clearable><el-option v-for="s in statuses" :key="s" :label="s" :value="s"/></el-select></el-form-item>
        <el-form-item label="优先级"><el-select v-model="filters.priority" clearable><el-option v-for="p in priorities" :key="p" :label="p" :value="p"/></el-select></el-form-item>
        <el-form-item><el-button @click="load">查询</el-button></el-form-item>
      </el-form>
      <el-table :data="tasks" v-loading="loading" stripe border>
        <el-table-column prop="task_code" label="编号" width="140"/>
        <el-table-column prop="task_name" label="名称" min-width="180"/>
        <el-table-column prop="source_type" label="来源" width="80"/>
        <el-table-column prop="priority" label="优先级" width="80"><template #default="{row}"><el-tag :type="row.priority==='HIGH'?'danger':row.priority==='MEDIUM'?'warning':'info'" size="small">{{ row.priority }}</el-tag></template></el-table-column>
        <el-table-column prop="status" label="状态" width="100"><template #default="{row}"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column prop="assigned_to" label="负责人" width="100"/>
        <el-table-column label="操作" width="260"><template #default="{row}"><el-button size="small" @click="updateStatus(row,'DONE')" v-if="row.status!=='DONE'">完成</el-button><el-button size="small" @click="openAssign(row)">分派</el-button><el-button size="small" @click="updateStatus(row,'CANCELLED')" v-if="row.status==='TODO'">取消</el-button></template></el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="新建治理任务" width="450px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称"><el-input v-model="form.task_name"/></el-form-item>
        <el-form-item label="来源类型"><el-select v-model="form.source_type"><el-option v-for="s in sourceTypes" :key="s" :label="s" :value="s"/></el-select></el-form-item>
        <el-form-item label="系统"><el-input v-model="form.system_code"/></el-form-item>
        <el-form-item label="优先级"><el-select v-model="form.priority"><el-option v-for="p in priorities" :key="p" :label="p" :value="p"/></el-select></el-form-item>
        <el-form-item label="负责人"><el-input v-model="form.assigned_to"/></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" @click="saveTask">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { governanceApi } from '@/api/ucp'

const tasks = ref<any[]>([])
const loading = ref(false)
const statuses = ['TODO', 'IN_PROGRESS', 'DONE', 'OVERDUE', 'CANCELLED']
const priorities = ['HIGH', 'MEDIUM', 'LOW']
const sourceTypes = ['DIFF', 'QUALITY', 'CONFLICT', 'MAPPING']
const filters = reactive({ status:'', priority:'' })

const dialogVisible = ref(false)
const form = reactive({ task_name:'', source_type:'DIFF', system_code:'', priority:'MEDIUM', assigned_to:'', description:'' })

function statusType(s:string) { return { DONE:'success', IN_PROGRESS:'warning', TODO:'info', OVERDUE:'danger', CANCELLED:'info' }[s]||'info' }

async function load() {
  loading.value = true
  try { const res = await governanceApi.listTasks({ status: filters.status||undefined, priority: filters.priority||undefined }); tasks.value = res.items }
  catch(e:any) { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

function openCreateTask() { Object.assign(form, { task_name:'', source_type:'DIFF', system_code:'', priority:'MEDIUM', assigned_to:'', description:'' }); dialogVisible.value = true }
async function saveTask() {
  try { await governanceApi.createTask({ ...form }); ElMessage.success('创建成功'); dialogVisible.value = false; load() }
  catch(e:any) { ElMessage.error('创建失败') }
}
async function updateStatus(row:any, status:string) {
  try { await governanceApi.updateTask(row.id, { status }); ElMessage.success(`已${status==='DONE'?'完成':'取消'}`); load() }
  catch(e:any) { ElMessage.error('操作失败') }
}
function openAssign(row:any) {
  const name = prompt('负责人?', row.assigned_to)
  if (name !== null) { governanceApi.updateTask(row.id, { assigned_to: name }).then(() => { ElMessage.success('已分派'); load() }).catch(() => ElMessage.error('分派失败')) }
}
async function generateReport() {
  try { const res = await governanceApi.generateReport(); ElMessage.success(`报表生成: ${res.summary.total_issues} 个问题, 闭环率 ${(res.summary.overall_closure_rate*100).toFixed(1)}%`) }
  catch(e:any) { ElMessage.error('生成失败') }
}

onMounted(() => load())
</script>

<style scoped>
.page-header { display:flex; justify-content:space-between; align-items:center }
.filter-bar { margin-bottom:8px }
</style>
