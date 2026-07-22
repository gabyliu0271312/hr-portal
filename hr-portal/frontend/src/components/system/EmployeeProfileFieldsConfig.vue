<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { employeeProfileFieldsApi, type EmployeeProfileFieldConfig, type EmployeeProfileGovernanceCheck } from '@/api/employee_profile_fields'

const fields = ref<EmployeeProfileFieldConfig[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const governance = ref<EmployeeProfileGovernanceCheck | null>(null)
const governanceError = ref('')

function fieldGovernanceMessages(columnName: string) {
  return governance.value?.issues.filter((issue) => issue.column_name === columnName).map((issue) => issue.message) || []
}

async function load() {
  loading.value = true; error.value = ''; governance.value = null; governanceError.value = ''
  try {
    fields.value = await employeeProfileFieldsApi.list()
    try { governance.value = await employeeProfileFieldsApi.governanceCheck() }
    catch (cause: any) { governanceError.value = cause?.response?.data?.detail || '治理检查暂不可用' }
  }
  catch (cause: any) { error.value = cause?.response?.data?.detail || '员工档案展示配置加载失败' }
  finally { loading.value = false }
}

async function save() {
  saving.value = true
  try { fields.value = await employeeProfileFieldsApi.update(fields.value); ElMessage.success('员工档案展示配置已保存') }
  catch (cause: any) {
    if (cause?.response?.status === 409) { ElMessage.warning('配置已被其他管理员更新，请刷新后重试') }
    else { ElMessage.error(cause?.response?.data?.detail || '保存失败') }
  } finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <el-card style="margin-bottom: 16px">
    <template #header>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div><b>员工档案字段配置</b><div style="margin-top:4px;color:var(--color-text-secondary);font-size:12px">开启后字段才可进入默认候选或用户追问；敏感分类和字段授权仍在原有入口维护。</div></div>
        <el-button :loading="saving" type="primary" @click="save">保存配置</el-button>
      </div>
    </template>
    <el-skeleton v-if="loading" :rows="4" animated />
    <el-alert v-else-if="error" type="error" :title="error" show-icon :closable="false"><template #default><el-button size="small" @click="load">重试</el-button></template></el-alert>
    <el-empty v-else-if="!fields.length" description="当前没有可配置的员工档案字段" />
    <template v-else>
      <el-alert v-if="governanceError" type="warning" :title="governanceError" :closable="false" show-icon style="margin-bottom:12px" />
      <el-alert v-else-if="governance?.warning_count" type="warning" :title="`治理检查发现 ${governance.warning_count} 项待处理告警`" :closable="false" show-icon style="margin-bottom:12px" />
      <el-alert v-else-if="governance" type="success" title="治理检查正常" :closable="false" show-icon style="margin-bottom:12px" />
      <el-table :data="fields" size="small" border>
      <el-table-column label="字段" min-width="150"><template #default="{ row }"><div>{{ row.column_name }}</div><el-text type="info" size="small">{{ row.field_code }}</el-text></template></el-table-column>
      <el-table-column label="展示名称" min-width="180"><template #default="{ row }"><el-input v-model="row.display_name" maxlength="64" show-word-limit /></template></el-table-column>
      <el-table-column label="敏感分类（只读）" min-width="160"><template #default="{ row }"><el-tag v-for="categoryName in row.sensitive_category_names" :key="categoryName" size="small" type="warning" style="margin-right:4px">{{ categoryName }}</el-tag><span v-if="!row.sensitive_category_names.length">—</span></template></el-table-column>
      <el-table-column label="治理状态" min-width="200"><template #default="{ row }"><el-tag v-for="message in fieldGovernanceMessages(row.column_name)" :key="message" size="small" type="warning" style="margin-right:4px">{{ message }}</el-tag><span v-if="!fieldGovernanceMessages(row.column_name).length">正常</span></template></el-table-column>
      <el-table-column label="员工档案可查询" width="140"><template #default="{ row }"><el-switch v-model="row.is_queryable" inline-prompt active-text="开" inactive-text="关" /></template></el-table-column>
      </el-table>
    </template>
  </el-card>
</template>
