<template>
  <div class="lifecycle-page">
    <el-card>
      <template #header><div class="header"><div><b>账号生命周期规则</b><p>飞书员工事件驱动外部账号创建、停用与延时删除。</p></div><PermissionButton menu="ucp.external_accounts" op="C" type="primary" @click="openCreate">新建规则</PermissionButton></div></template>
      <el-table v-loading="loading" :data="rules" stripe>
        <el-table-column prop="rule_name" label="规则名称" min-width="160" /><el-table-column prop="internal_event_type" label="事件" width="170" />
        <el-table-column prop="target_resource_code" label="目标资源" width="150" /><el-table-column prop="lifecycle_action" label="动作" width="110" />
        <el-table-column label="删除策略" min-width="150"><template #default="{row}">{{ row.approval_required ? '需审批；' : '' }}保留 {{ row.retention_days }} 天</template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.status ? 'success' : 'info'">{{ row.status ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="210"><template #default="{row}"><PermissionButton menu="ucp.external_accounts" op="V" link @click="runDry(row)">模拟</PermissionButton><PermissionButton menu="ucp.external_accounts" op="U" link @click="toggle(row)">{{ row.status ? '停用' : '启用' }}</PermissionButton></template></el-table-column>
      </el-table>
    </el-card>
    <el-card class="jobs"><template #header><b>生命周期任务</b></template><el-table :data="jobs" stripe><el-table-column prop="job_code" label="任务" min-width="180"/><el-table-column prop="action" label="动作" width="100"/><el-table-column prop="status" label="状态" width="150"/><el-table-column prop="scheduled_at" label="计划执行" min-width="170"/><el-table-column prop="last_error_message" label="最近错误" min-width="180"/><el-table-column label="操作" width="100"><template #default="{row}"><PermissionButton v-if="row.status === 'FAILED'" menu="ucp.external_accounts" op="U" link @click="retry(row)">重试</PermissionButton></template></el-table-column></el-table></el-card>
    <el-dialog v-model="visible" title="新建生命周期规则" width="680px"><el-form label-width="120px"><el-form-item label="规则编码"><el-input v-model="form.rule_code" placeholder="FEISHU_DIDI_OFFBOARD"/></el-form-item><el-form-item label="规则名称"><el-input v-model="form.rule_name"/></el-form-item><el-form-item label="内部事件"><el-select v-model="form.internal_event_type"><el-option label="员工入职" value="EMPLOYEE_ONBOARD"/><el-option label="员工离职" value="EMPLOYEE_OFFBOARD"/></el-select></el-form-item><el-form-item label="目标资源"><el-input v-model="form.target_resource_code" placeholder="DIDI_ACCOUNT"/></el-form-item><el-form-item label="动作"><el-select v-model="form.lifecycle_action"><el-option value="CREATE"/><el-option value="DISABLE"/><el-option value="DELETE"/></el-select></el-form-item><el-form-item label="保留天数"><el-input-number v-model="form.retention_days" :min="0"/></el-form-item><el-form-item label="需要审批"><el-switch v-model="form.approval_required"/></el-form-item><el-form-item label="员工编号路径"><el-input v-model="form.employeePath" placeholder="$.employee.employee_id"/></el-form-item></el-form><template #footer><el-button @click="visible=false">取消</el-button><el-button type="primary" @click="create">保存</el-button></template></el-dialog>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import PermissionButton from '@/components/PermissionButton.vue'
import { accountLifecycleApi, type AccountLifecycleRule, type AccountLifecycleJob } from '@/api/ucp'
const rules=ref<AccountLifecycleRule[]>([]), jobs=ref<AccountLifecycleJob[]>([]), loading=ref(false), visible=ref(false)
const form=ref<any>({ rule_code:'',rule_name:'',internal_event_type:'EMPLOYEE_OFFBOARD',target_system_code:'DIDI',target_resource_code:'DIDI_ACCOUNT',lifecycle_action:'DISABLE',retention_days:30,approval_required:false,employeePath:'$.employee.employee_id' })
async function load(){loading.value=true;try{const [r,j]=await Promise.all([accountLifecycleApi.listRules(),accountLifecycleApi.listJobs()]);rules.value=r.items;jobs.value=j.items}catch(e:any){ElMessage.error(e?.response?.data?.detail||'加载失败')}finally{loading.value=false}}
function openCreate(){form.value={...form.value,rule_code:'',rule_name:''};visible.value=true}
async function create(){try{await accountLifecycleApi.createRule({...form.value,field_mapping:{employee_id:form.value.employeePath}});visible.value=false;ElMessage.success('已保存');load()}catch(e:any){ElMessage.error(e?.response?.data?.detail||'保存失败')}}
async function toggle(row:AccountLifecycleRule){await accountLifecycleApi.setRuleEnabled(row.rule_code,!row.status);ElMessage.success('状态已更新');load()}
async function retry(row:AccountLifecycleJob){await accountLifecycleApi.retryJob(row.job_code);ElMessage.success('已重试');load()}
async function runDry(row:AccountLifecycleRule){try{const r=await accountLifecycleApi.dryRun(row.rule_code,{employee:{employee_id:'DRY-RUN-001'}});ElMessage.success(r.matched?'规则匹配成功':'规则未匹配')}catch(e:any){ElMessage.error(e?.response?.data?.detail||'模拟失败')}}
onMounted(load)
</script><style scoped>.lifecycle-page{padding:24px}.header{display:flex;justify-content:space-between;align-items:center}.header p{margin:6px 0 0;color:#909399;font-size:13px}.jobs{margin-top:16px}</style>
