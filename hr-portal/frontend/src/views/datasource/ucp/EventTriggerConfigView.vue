<template>
  <div class="trigger-config">
    <div class="page-header">
      <h2>事件触发器配置</h2>
      <p class="desc">配置事件类型 → Pipeline 映射关系。事件进入 Event Bus 后按触发器规则匹配并派发。</p>
    </div>

    <div class="toolbar">
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      <PermissionButton menu="ucp.events" op="C" type="primary" :icon="Plus" @click="openCreate">
        新建触发器
      </PermissionButton>
    </div>

    <el-table :data="items" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="trigger_code" label="触发器代码" min-width="160" />
      <el-table-column prop="trigger_name" label="名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="event_source" label="事件源" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="sourceTagType(row.event_source)">{{ row.event_source }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="event_types" label="事件类型" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <code>{{ row.event_types }}</code>
        </template>
      </el-table-column>
      <el-table-column prop="pipeline_code" label="目标 Pipeline" min-width="160">
        <template #default="{ row }">
          <code>{{ row.pipeline_code }}</code>
        </template>
      </el-table-column>
      <el-table-column prop="webhook_path" label="Webhook Path" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <code v-if="row.webhook_path">{{ row.webhook_path }}</code>
          <span v-else class="empty">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="run_as_type" label="执行主体" width="120" />
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-switch :model-value="row.is_active" @change="(v: boolean) => toggleActive(row, v)" />
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="170">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建 / 编辑 Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑触发器' : '新建触发器'"
      width="720px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" size="small">
        <el-form-item label="触发器代码" prop="trigger_code">
          <el-input v-model="form.trigger_code" :disabled="isEdit" placeholder="trigger_offer_change" />
        </el-form-item>
        <el-form-item label="触发器名称" prop="trigger_name">
          <el-input v-model="form.trigger_name" />
        </el-form-item>
        <el-form-item label="事件源" prop="event_source">
          <el-select v-model="form.event_source" style="width: 100%">
            <el-option v-for="s in SOURCES" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="订阅系统">
          <el-select
            v-model="form.source_system_code"
            placeholder="不选则监听全平台该 event_source 事件"
            filterable
            clearable
            style="width: 100%"
            @change="onSystemChange"
          >
            <el-option
              v-for="s in systems"
              :key="s.system_code"
              :label="`${s.system_name} (${s.system_code})`"
              :value="s.system_code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="订阅资源">
          <el-select
            v-model="form.source_resource_id"
            placeholder="不选则订阅该系统下所有资源"
            filterable
            clearable
            :disabled="!form.source_system_code"
            style="width: 100%"
          >
            <el-option
              v-for="r in resourcesOf(form.source_system_code)"
              :key="r.id"
              :label="`${r.resource_name} (${r.resource_code})`"
              :value="r.id"
            />
          </el-select>
          <div v-if="form.source_system_code && resourcesOf(form.source_system_code).length === 0" class="form-tip">
            该系统下还没有资源, 可在「接入系统」中添加
          </div>
        </el-form-item>
        <el-form-item label="事件类型" prop="event_types">
          <el-input
            v-model="form.event_types"
            placeholder="EMPLOYEE_ONBOARDING,OFFER_STATUS_CHANGE,*（逗号分隔，* 表示全匹配）"
          />
        </el-form-item>
        <el-form-item label="目标 Pipeline" prop="pipeline_code">
          <el-select
            v-model="form.pipeline_code"
            filterable
            placeholder="选择 pipeline"
            style="width: 100%"
          >
            <el-option
              v-for="p in pipelineOptions"
              :key="p.pipeline_code"
              :label="`${p.pipeline_code} (${p.pipeline_name})`"
              :value="p.pipeline_code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Webhook Path">
          <el-input v-model="form.webhook_path" placeholder="如 feishu/offer-status（外部系统回调路径，唯一）" />
        </el-form-item>
        <el-form-item label="执行主体">
          <el-select v-model="form.run_as_type" style="width: 100%">
            <el-option label="SERVICE_ACCOUNT（系统服务账号）" value="SERVICE_ACCOUNT" />
            <el-option label="TRIGGER_USER（事件触发人）" value="TRIGGER_USER" />
          </el-select>
        </el-form-item>
        <el-form-item label="服务账号代码">
          <el-input v-model="form.service_account_code" placeholder="可选，服务账号编码" />
        </el-form-item>
        <el-form-item label="签名密钥">
          <el-input v-model="form.signing_secret" show-password placeholder="HMAC-SHA256 签名密钥（可选）" />
        </el-form-item>
        <el-form-item label="签名头">
          <el-input v-model="form.signature_header" placeholder="X-Signature" />
        </el-form-item>
        <el-form-item label="飞书 Token">
          <el-input v-model="form.feishu_verification_token" show-password placeholder="飞书 VerificationToken" />
        </el-form-item>
        <el-form-item label="飞书 EncryptKey">
          <el-input v-model="form.feishu_encrypt_key" show-password placeholder="飞书 EncryptKey（可选）" />
        </el-form-item>
        <el-form-item label="过滤规则">
          <el-input
            v-model="filterRuleText"
            type="textarea"
            :rows="4"
            placeholder='{"path": "$.event_type", "op": "eq", "value": "x"}'
          />
          <span class="form-tip">JSON 规则，可选；path 为 JSONPath,op 支持 eq/ne/in/contains/exists</span>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.is_active" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'
import PermissionButton from '@/components/PermissionButton.vue'

const SOURCES = ['FEISHU', 'BEISEN', 'INTERNAL', 'GENERIC']

const items = ref<any[]>([])
const loading = ref(false)
const pipelineOptions = ref<Array<{ pipeline_code: string; pipeline_name: string }>>([])

// Phase 5-2: system / resource 二级下拉
const systems = ref<Array<{ system_code: string; system_name: string }>>([])
const allResources = ref<Array<{ id: number; system_id: number; resource_code: string; resource_name: string }>>([])

async function loadSystemsAndResources() {
  try {
    const [sysRes, resRes] = await Promise.all([
      ucpApi.systems(),
      ucpApi.resources({}),
    ])
    systems.value = sysRes.items || []
    allResources.value = resRes.items || []
  } catch {
    // 静默失败
  }
}

function resourcesOf(systemCode: string) {
  if (!systemCode) return []
  return allResources.value.filter((r) => (r as any).system_code === systemCode)
}

function onSystemChange() {
  // 切换 system 时清空 resource
  form.source_resource_id = null
}

const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const form = reactive<any>({
  trigger_code: '',
  trigger_name: '',
  event_source: 'FEISHU',
  source_system_code: '',
  source_resource_id: null,
  event_types: '',
  pipeline_code: '',
  filter_rule: null,
  signing_secret: '',
  signature_header: 'X-Signature',
  feishu_verification_token: '',
  feishu_encrypt_key: '',
  run_as_type: 'SERVICE_ACCOUNT',
  service_account_code: '',
  is_active: true,
  webhook_path: '',
  description: '',
})
const filterRuleText = ref('')

const rules: FormRules = {
  trigger_code: [{ required: true, message: '必填' }],
  trigger_name: [{ required: true, message: '必填' }],
  event_source: [{ required: true, message: '必填' }],
  event_types: [{ required: true, message: '必填' }],
  pipeline_code: [{ required: true, message: '必填' }],
}

async function loadList() {
  loading.value = true
  try {
    const res = await ucpApi.listEventTriggers({ limit: 200 })
    items.value = res.items || []
  } finally {
    loading.value = false
  }
}

async function loadPipelineOptions() {
  try {
    const res: any = await ucpApi.pipelines()
    pipelineOptions.value = res.items || []
  } catch {
    // 静默失败
  }
}

function openCreate() {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: any) {
  isEdit.value = true
  resetForm()
  Object.assign(form, {
    trigger_code: row.trigger_code,
    trigger_name: row.trigger_name,
    event_source: row.event_source,
    source_system_code: row.source_system_code || '',
    source_resource_id: row.source_resource_id || null,
    event_types: row.event_types,
    pipeline_code: row.pipeline_code,
    filter_rule: row.filter_rule,
    signing_secret: row.signing_secret || '',
    signature_header: row.signature_header || 'X-Signature',
    feishu_verification_token: row.feishu_verification_token || '',
    feishu_encrypt_key: row.feishu_encrypt_key || '',
    run_as_type: row.run_as_type || 'SERVICE_ACCOUNT',
    service_account_code: row.service_account_code || '',
    is_active: row.is_active,
    webhook_path: row.webhook_path || '',
    description: row.description || '',
  })
  filterRuleText.value = row.filter_rule ? JSON.stringify(row.filter_rule, null, 2) : ''
  dialogVisible.value = true
}

function resetForm() {
  Object.assign(form, {
    trigger_code: '', trigger_name: '', event_source: 'FEISHU',
    source_system_code: '', source_resource_id: null,
    event_types: '', pipeline_code: '', filter_rule: null,
    signing_secret: '', signature_header: 'X-Signature',
    feishu_verification_token: '', feishu_encrypt_key: '',
    run_as_type: 'SERVICE_ACCOUNT', service_account_code: '',
    is_active: true, webhook_path: '', description: '',
  })
  filterRuleText.value = ''
}

async function onSubmit() {
  if (!formRef.value) return
  await formRef.value.validate()
  let filterRule: any = null
  if (filterRuleText.value.trim()) {
    try {
      filterRule = JSON.parse(filterRuleText.value)
    } catch {
      ElMessage.error('过滤规则必须是合法 JSON')
      return
    }
  }
  submitting.value = true
  try {
    const payload = { ...form, filter_rule: filterRule }
    if (isEdit.value) {
      await ucpApi.updateEventTrigger(form.trigger_code, payload)
      ElMessage.success('已更新')
    } else {
      await ucpApi.createEventTrigger(payload)
      ElMessage.success('已创建')
    }
    dialogVisible.value = false
    loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    submitting.value = false
  }
}

async function toggleActive(row: any, v: boolean) {
  try {
    await ucpApi.updateEventTrigger(row.trigger_code, { is_active: v })
    ElMessage.success(v ? '已启用' : '已停用')
    loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '操作失败')
  }
}

async function onDelete(row: any) {
  await ElMessageBox.confirm(
    `确认删除触发器 ${row.trigger_code}？`,
    '删除确认',
    { type: 'warning' },
  )
  try {
    await ucpApi.deleteEventTrigger(row.trigger_code)
    ElMessage.success('已删除')
    loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

function sourceTagType(s: string) {
  if (s === 'FEISHU') return 'success'
  if (s === 'BEISEN') return 'warning'
  if (s === 'INTERNAL') return 'info'
  return ''
}

function formatTime(t: string | null) {
  if (!t) return '-'
  return t.replace('T', ' ').slice(0, 19)
}

onMounted(() => {
  loadList()
  loadPipelineOptions()
  loadSystemsAndResources()
})
</script>

<style scoped>
.trigger-config { padding: 16px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header .desc { color: #909399; margin: 0 0 16px; font-size: 13px; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.empty { color: #c0c4cc; }
code { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 12px; }
.form-tip { color: #909399; font-size: 12px; margin-left: 4px; }
</style>
