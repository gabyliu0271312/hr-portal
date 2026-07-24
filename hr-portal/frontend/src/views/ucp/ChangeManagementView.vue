<template>
  <div class="change-page">
    <el-card>
      <template #header><div class="page-header"><h2>变更管理</h2><el-button type="primary" @click="openCreate">新建变更单</el-button></div></template>
      <div class="migration-toolbar">
        <el-button type="warning" @click="migrationVisible = true">Migration preview</el-button>
        <span>Preview only. No resource or pipeline is changed automatically.</span>
      </div>
      <el-form inline class="filter-bar">
        <el-form-item label="类型"><el-select v-model="filters.change_type" clearable><el-option v-for="t in changeTypes" :key="t" :label="t" :value="t"/></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="filters.status" clearable><el-option v-for="s in changeStatuses" :key="s" :label="s" :value="s"/></el-select></el-form-item>
        <el-form-item><el-button @click="load">查询</el-button></el-form-item>
      </el-form>
      <el-table :data="rows" v-loading="loading" stripe border>
        <el-table-column prop="change_code" label="编号" width="170"/>
        <el-table-column prop="change_type" label="类型" width="100"/>
        <el-table-column prop="change_target_code" label="目标" width="140"/>
        <el-table-column prop="change_summary" label="摘要" min-width="160"/>
        <el-table-column prop="risk_level" label="风险" width="80"><template #default="{row}"><el-tag :type="row.risk_level==='HIGH'||row.risk_level==='CRITICAL'?'danger':row.risk_level==='MEDIUM'?'warning':'info'" size="small">{{ row.risk_level }}</el-tag></template></el-table-column>
        <el-table-column prop="status" label="状态" width="100"><template #default="{row}"><el-tag :type="statusColor(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="200"><template #default="{row}"><el-button size="small" type="success" @click="publish(row)" v-if="row.status==='DRAFT'||row.status==='APPROVED'">发布</el-button><el-button size="small" type="warning" @click="rollback(row)" v-if="row.status==='PUBLISHED'">回滚</el-button></template></el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="migrationVisible" title="Adapter migration preview" width="860px">
      <el-alert type="warning" :closable="false" show-icon>
        Migration changes are previewed first, require explicit confirmation, and can be rolled back after publication.
      </el-alert>
      <el-form :model="migrationForm" inline style="margin-top: 16px">
        <el-form-item label="Legacy adapters">
          <el-input v-model="migrationForm.legacyCodes" placeholder="LEGACY_A, LEGACY_B" style="width: 260px" />
        </el-form-item>
        <el-form-item label="Target adapter">
          <el-input v-model="migrationForm.targetCode" placeholder="TARGET_ADAPTER" style="width: 220px" />
        </el-form-item>
        <el-button type="primary" :loading="migrationLoading" @click="previewMigration">Preview</el-button>
      </el-form>
      <el-empty v-if="migrationPreview && !migrationPreview.items.length" description="No matching resources" />
      <el-table v-if="migrationPreview?.items.length" :data="migrationPreview.items" size="small" border>
        <el-table-column prop="resource_code" label="Resource" min-width="150" />
        <el-table-column prop="current_adapter_code" label="Current" min-width="150" />
        <el-table-column prop="target_adapter_code" label="Target" min-width="150" />
        <el-table-column label="Impacted pipelines" min-width="200">
          <template #default="{ row }">{{ row.impacted_pipelines.join(', ') || '-' }}</template>
        </el-table-column>
        <el-table-column label="Action" width="120">
          <template #default="{ row }">
            <el-button size="small" type="warning" :loading="confirmingResourceId === row.resource_id" @click="confirmMigration(row)">Confirm</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer><el-button @click="migrationVisible = false">Close</el-button></template>
    </el-dialog>

    <el-dialog v-model="dialogVisible" title="新建变更单" width="450px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="类型"><el-select v-model="form.change_type"><el-option v-for="t in changeTypes" :key="t" :label="t" :value="t"/></el-select></el-form-item>
        <el-form-item label="目标 ID"><el-input-number v-model="form.change_target_id" :min="1"/></el-form-item>
        <el-form-item label="目标编码"><el-input v-model="form.change_target_code"/></el-form-item>
        <el-form-item label="摘要"><el-input v-model="form.change_summary"/></el-form-item>
        <el-form-item label="风险"><el-select v-model="form.risk_level"><el-option v-for="r in riskLevels" :key="r" :label="r" :value="r"/></el-select></el-form-item>
        <el-form-item label="原因"><el-input v-model="form.reason" type="textarea"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { changeApi, migrationApi } from '@/api/ucp'

const rows = ref<any[]>([])
const loading = ref(false)
const changeTypes = ['RESOURCE', 'CREDENTIAL', 'PIPELINE', 'SYSTEM']
const changeStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ROLLED_BACK']
const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const filters = reactive({ change_type:'', status:'' })
const dialogVisible = ref(false)
const form = reactive({ change_type:'RESOURCE', change_target_id:1, change_target_code:'', change_summary:'', risk_level:'LOW', reason:'' })
const migrationVisible = ref(false)
const migrationLoading = ref(false)
const confirmingResourceId = ref<number | null>(null)
const migrationPreview = ref<{ items: any[] } | null>(null)
const migrationForm = reactive({ legacyCodes: '', targetCode: '' })

function statusColor(s:string) { return { DRAFT:'info', PENDING_APPROVAL:'warning', APPROVED:'success', PUBLISHED:'primary', ROLLED_BACK:'danger', REJECTED:'danger' }[s]||'info' }

async function load() {
  loading.value = true
  try { const res = await changeApi.list({ change_type: filters.change_type||undefined, status: filters.status||undefined }); rows.value = res.items }
  catch(e:any) { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

function openCreate() { Object.assign(form, { change_type:'RESOURCE', change_target_id:1, change_target_code:'', change_summary:'', risk_level:'LOW', reason:'' }); dialogVisible.value = true }
async function previewMigration() {
  const legacy_adapter_codes = migrationForm.legacyCodes.split(',').map((code) => code.trim()).filter(Boolean)
  if (!legacy_adapter_codes.length || !migrationForm.targetCode.trim()) {
    ElMessage.warning('Enter legacy and target adapter codes')
    return
  }
  migrationLoading.value = true
  try {
    migrationPreview.value = await migrationApi.preview({ legacy_adapter_codes, target_adapter_code: migrationForm.targetCode.trim() })
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || 'Migration preview failed')
  } finally {
    migrationLoading.value = false
  }
}
async function confirmMigration(row: any) {
  confirmingResourceId.value = row.resource_id
  try {
    await migrationApi.confirm({ resource_id: row.resource_id, target_adapter_code: row.target_adapter_code })
    ElMessage.success('Migration change created; it has not been published')
    await load()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || 'Migration confirmation failed')
  } finally {
    confirmingResourceId.value = null
  }
}
function isMigration(row: any) { return row.change_type === 'RESOURCE' && String(row.change_summary || '').includes('Adapter') && Boolean(row.after_snapshot?.adapter_code) }
async function publishMigration(changeId: number) {
  try {
    await migrationApi.publish(changeId)
    ElMessage.success('Migration published')
    await load()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || 'Migration publish failed')
  }
}
async function save() {
  try { await changeApi.create({ ...form }); ElMessage.success('创建成功'); dialogVisible.value = false; load() }
  catch(e:any) { ElMessage.error('创建失败') }
}
async function publish(row:any) { if (isMigration(row)) return publishMigration(row.id); try { await changeApi.publish(row.id); ElMessage.success('已发布'); load() } catch(e:any) { ElMessage.error('发布失败') } }
async function rollback(row:any) { try { await changeApi.rollback(row.id); ElMessage.success('已回滚'); load() } catch(e:any) { ElMessage.error('回滚失败') } }

onMounted(() => load())
</script>

<style scoped>
.page-header { display:flex; justify-content:space-between; align-items:center }
.migration-toolbar { display:flex; gap:12px; align-items:center; margin-bottom:8px; color:#909399; font-size:13px }
.filter-bar { margin-bottom:8px }
</style>
