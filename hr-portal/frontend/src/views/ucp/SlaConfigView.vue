<template>
  <div class="sla-page">
    <el-card>
      <template #header><div class="page-header"><h2>SLA 管理</h2><el-button type="primary" @click="openCreate">新建 SLA</el-button></div></template>
      <el-table :data="configs" v-loading="loading" stripe border>
        <el-table-column prop="sla_code" label="编码" width="160"/>
        <el-table-column prop="sla_name" label="名称" width="160"/>
        <el-table-column prop="target_type" label="目标类型" width="100"/>
        <el-table-column label="成功率目标" width="100"><template #default="{row}">{{ row.success_rate_target ? (row.success_rate_target*100).toFixed(1)+'%' : '-' }}</template></el-table-column>
        <el-table-column label="P95耗时(ms)" width="110"><template #default="{row}">{{ row.p95_duration_ms_max || '-' }}</template></el-table-column>
        <el-table-column label="最近达标" width="100"><template #default="{row}"><el-tag :type="row.latest_met?'success':'danger'" size="small">{{ row.latest_met ? '达标' : '未达标' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="240">
          <template #default="{row}">
            <el-button size="small" @click="calculate(row.id)">计算</el-button>
            <el-button size="small" @click="viewRecords(row)">记录</el-button>
            <el-button size="small" type="danger" @click="confirmDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId?'编辑 SLA':'新建 SLA'" width="500px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="编码"><el-input v-model="form.sla_code" :disabled="!!editingId"/></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.sla_name"/></el-form-item>
        <el-form-item label="目标类型"><el-select v-model="form.target_type"><el-option label="系统" value="system"/><el-option label="资源" value="resource"/><el-option label="流水线" value="pipeline"/></el-select></el-form-item>
        <el-form-item label="目标 ID"><el-input-number v-model="form.target_id" :min="1"/></el-form-item>
        <el-form-item label="成功率目标"><el-input-number v-model="form.success_rate_target" :min="0" :max="1" :step="0.01"/></el-form-item>
        <el-form-item label="P95耗时(ms)"><el-input-number v-model="form.p95_duration_ms_max" :min="1"/></el-form-item>
        <el-form-item label="窗口(小时)"><el-input-number v-model="form.window_hours" :min="1"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>

    <el-drawer v-model="recordsVisible" title="SLA 达标记录" size="600px">
      <el-table :data="records" stripe border>
        <el-table-column label="窗口" width="180"><template #default="{row}">{{ row.window_start?.substring(0,16) }} ~ {{ row.window_end?.substring(0,16) }}</template></el-table-column>
        <el-table-column label="执行数" width="80"><template #default="{row}">{{ row.total_executions }}</template></el-table-column>
        <el-table-column label="成功率" width="90"><template #default="{row}">{{ row.success_rate ? (row.success_rate*100).toFixed(1)+'%' : '-' }}</template></el-table-column>
        <el-table-column label="P95(ms)" width="90"><template #default="{row}">{{ row.p95_duration_ms || '-' }}</template></el-table-column>
        <el-table-column label="达标" width="70"><template #default="{row}"><el-tag :type="row.is_met?'success':'danger'" size="small">{{ row.is_met?'是':'否' }}</el-tag></template></el-table-column>
        <el-table-column label="未达标原因" min-width="200"><template #default="{row}">{{ (row.unmet_reasons||[]).join('; ') }}</template></el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { slaApi } from '@/api/ucp'

const configs = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({ sla_code:'', sla_name:'', target_type:'system', target_id:1, success_rate_target:0.99, p95_duration_ms_max:null as number|null, window_hours:24 })
const recordsVisible = ref(false)
const records = ref<any[]>([])

async function load() {
  loading.value = true
  try {
    const dash = await slaApi.dashboard()
    configs.value = dash.items
  } catch (e: any) { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

function openCreate() { editingId.value = null; Object.assign(form, { sla_code:'', sla_name:'', target_type:'system', target_id:1, success_rate_target:0.99 }); dialogVisible.value = true }
async function save() {
  try {
    const payload = {
      ...form,
      p95_duration_ms_max: form.p95_duration_ms_max ?? undefined,
      p99_duration_ms_max: (form as any).p99_duration_ms_max ?? undefined,
    }
    if (editingId.value) await slaApi.updateConfig(editingId.value, payload)
    else await slaApi.createConfig(payload)
    ElMessage.success('保存成功'); dialogVisible.value = false; load()
  } catch (e: any) { ElMessage.error('保存失败') }
}
async function calculate(id: number) {
  try { await slaApi.calculate(id); ElMessage.success('计算完成'); load() }
  catch (e: any) { ElMessage.error('计算失败') }
}
async function viewRecords(row: any) {
  recordsVisible.value = true
  try { const res = await slaApi.records(row.id); records.value = res.items }
  catch (e: any) { ElMessage.error('加载记录失败') }
}
async function confirmDelete(row: any) {
  try { await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' }); await slaApi.deleteConfig(row.id); ElMessage.success('已删除'); load() }
  catch (e: any) { if (e !== 'cancel') ElMessage.error('删除失败') }
}

onMounted(() => load())
</script>

<style scoped>
.page-header { display:flex; justify-content:space-between; align-items:center }
</style>
