<template>
  <div class="quality-page">
    <el-card>
      <template #header><div class="page-header"><h2>数据质量规则</h2><el-button type="primary" @click="openCreateRule">新建规则</el-button></div></template>
      <el-table :data="rules" v-loading="loading" stripe border>
        <el-table-column prop="rule_code" label="编码" width="160"/>
        <el-table-column prop="rule_name" label="名称" min-width="140"/>
        <el-table-column prop="object_type" label="对象" width="100"/>
        <el-table-column prop="field_name" label="字段" width="120"/>
        <el-table-column prop="rule_type" label="规则" width="120"><template #default="{row}"><el-tag size="small">{{ row.rule_type }}</el-tag></template></el-table-column>
        <el-table-column prop="severity" label="级别" width="80"><template #default="{row}"><el-tag :type="row.severity==='ERROR'?'danger':row.severity==='WARN'?'warning':'info'" size="small">{{ row.severity }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="200"><template #default="{row}"><el-button size="small" @click="scanRule(row)">扫描</el-button><el-button size="small" type="danger" @click="deleteRule(row)">删除</el-button></template></el-table-column>
      </el-table>
    </el-card>

    <el-card style="margin-top:12px">
      <template #header><h3>质量问题</h3></template>
      <el-table :data="issues" v-loading="iLoading" stripe border>
        <el-table-column prop="object_key" label="对象" width="130"/>
        <el-table-column prop="field_name" label="字段" width="120"/>
        <el-table-column prop="issue_type" label="问题" width="100"/>
        <el-table-column prop="current_value" label="当前值" width="150"/>
        <el-table-column prop="expected_value" label="期望值" width="150"/>
        <el-table-column prop="severity" label="级别" width="80"><template #default="{row}"><el-tag :type="row.severity==='ERROR'?'danger':'warning'" size="small">{{ row.severity }}</el-tag></template></el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="新建质量规则" width="520px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="编码"><el-input v-model="form.rule_code"/></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.rule_name"/></el-form-item>
        <el-form-item label="数据资源 ID"><el-input-number v-model="form.resource_id" :min="1" placeholder="绑定数据资源"/></el-form-item>
        <el-form-item label="对象类型"><el-select v-model="form.object_type"><el-option v-for="t in objTypes" :key="t" :label="t" :value="t"/></el-select></el-form-item>
        <el-form-item label="字段"><el-input v-model="form.field_name"/></el-form-item>
        <el-form-item label="规则类型"><el-select v-model="form.rule_type"><el-option v-for="t in ruleTypes" :key="t" :label="t" :value="t"/></el-select></el-form-item>
        <el-form-item label="级别"><el-select v-model="form.severity"><el-option label="错误" value="ERROR"/><el-option label="警告" value="WARN"/></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" @click="saveRule">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { qualityApi } from '@/api/ucp'

const rules = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const objTypes = ['PERSON', 'ORG', 'POSITION', 'ACCOUNT']
const ruleTypes = ['REQUIRED', 'UNIQUE', 'FORMAT', 'ENUM', 'REFERENCE_INTEGRITY']
const form = reactive({ rule_code:'', rule_name:'', resource_id: null as number|null, object_type:'PERSON', field_name:'', rule_type:'REQUIRED', severity:'WARN' })

const issues = ref<any[]>([])
const iLoading = ref(false)

async function load() { loading.value = true; try { const res = await qualityApi.listRules(); rules.value = res.items } catch(e:any){} finally { loading.value = false } }
async function loadIssues() { iLoading.value = true; try { const res = await qualityApi.listIssues(); issues.value = res.items } catch(e:any){} finally { iLoading.value = false } }

function openCreateRule() { Object.assign(form, { rule_code:'', rule_name:'', resource_id: null, object_type:'PERSON', field_name:'', rule_type:'REQUIRED', severity:'WARN' }); dialogVisible.value = true }

async function saveRule() {
  try { await qualityApi.createRule({ ...form, resource_id: form.resource_id ?? undefined }); ElMessage.success('创建成功'); dialogVisible.value = false; load() }
  catch(e:any) { ElMessage.error(e?.response?.data?.detail || '创建失败') }
}
async function deleteRule(row:any) {
  try { await qualityApi.deleteRule(row.id); ElMessage.success('已删除'); load() }
  catch(e:any) { ElMessage.error('删除失败') }
}
async function scanRule(row:any) {
  try {
    const res = await qualityApi.scan(row.id)
    ElMessage.info(`扫描完成: ${res.issues_found} 问题`)
    loadIssues()
  } catch(e:any) { ElMessage.error(e?.response?.data?.detail || '扫描失败') }
}

onMounted(() => { load(); loadIssues() })
</script>

<style scoped>
.page-header { display:flex; justify-content:space-between; align-items:center }
</style>
