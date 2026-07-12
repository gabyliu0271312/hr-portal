<template>
  <div class="conflict-page">
    <el-card>
      <template #header><div class="page-header"><h2>冲突处理工作台</h2><div><el-button @click="syncConflicts">同步冲突</el-button></div></div></template>
      <el-form inline class="filter-bar">
        <el-form-item label="来源"><el-select v-model="filters.source_type" clearable><el-option label="差异" value="DIFF"/><el-option label="质量" value="QUALITY"/><el-option label="映射" value="MAPPING"/></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="filters.status" clearable><el-option label="待处理" value="OPEN"/><el-option label="已解决" value="RESOLVED"/></el-select></el-form-item>
        <el-form-item><el-button @click="load">查询</el-button></el-form-item>
      </el-form>
      <el-table :data="rows" v-loading="loading" stripe border>
        <el-table-column prop="conflict_code" label="编号" width="160"/>
        <el-table-column prop="source_type" label="来源" width="80"><template #default="{row}"><el-tag size="small">{{ row.source_type }}</el-tag></template></el-table-column>
        <el-table-column prop="object_type" label="对象类型" width="100"/>
        <el-table-column prop="object_key" label="对象" width="120"/>
        <el-table-column prop="conflict_type" label="冲突类型" width="140"/>
        <el-table-column prop="conflict_summary" label="摘要" min-width="180"/>
        <el-table-column prop="status" label="状态" width="100"><template #default="{row}"><el-tag :type="row.status==='RESOLVED'?'success':row.status==='IN_PROGRESS'?'warning':'danger'" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="180"><template #default="{row}"><el-button size="small" @click="resolveConflict(row)" :disabled="row.status==='RESOLVED'">处理</el-button></template></el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="resolveDialog" title="处理冲突" width="450px">
      <p><strong>冲突:</strong> {{ resolveForm.conflict_summary }}</p>
      <el-form label-width="100px">
        <el-form-item label="处理策略"><el-select v-model="resolveForm.strategy"><el-option label="以 HR 为准" value="HR_PORTAL_WINS"/><el-option label="以外部为准" value="EXTERNAL_WINS"/><el-option label="手工修正" value="MANUAL_FIX"/><el-option label="忽略" value="IGNORE"/></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="resolveDialog=false">取消</el-button><el-button type="primary" @click="doResolve">确认</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { conflictApi } from '@/api/ucp'

const rows = ref<any[]>([])
const loading = ref(false)
const filters = reactive({ source_type:'', status:'' })
const resolveDialog = ref(false)
const resolveForm = reactive({ id:0, conflict_summary:'', strategy:'MANUAL_FIX' })

async function load() {
  loading.value = true
  try { const res = await conflictApi.list({ source_type: filters.source_type||undefined, status: filters.status||undefined }); rows.value = res.items }
  catch(e:any) { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

async function syncConflicts() {
  try { const res = await conflictApi.sync(); ElMessage.success(`已同步: 差异${res.counts.diff}, 质量${res.counts.quality}, 映射${res.counts.mapping}`) }
  catch(e:any) { ElMessage.error('同步失败') }
}

function resolveConflict(row:any) { resolveForm.id = row.id; resolveForm.conflict_summary = row.conflict_summary; resolveForm.strategy = 'MANUAL_FIX'; resolveDialog.value = true }

async function doResolve() {
  try { await conflictApi.resolve(resolveForm.id, { resolution_strategy: resolveForm.strategy }); ElMessage.success('已处理'); resolveDialog.value = false; load() }
  catch(e:any) { ElMessage.error('处理失败') }
}

onMounted(() => load())
</script>

<style scoped>
.page-header { display:flex; justify-content:space-between; align-items:center }
.filter-bar { margin-bottom:8px }
</style>
