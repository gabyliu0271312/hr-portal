<template>
  <div class="api-template-library">
    <el-card>
      <template #header>
        <div class="page-header">
          <div><h2>API 模板库</h2><p class="sub">可配置、可测试、可保存为资源、可被 Pipeline 引用的 API 模板</p></div>
          <div class="header-actions">
            <el-button v-if="selected" @click="selected = null">返回列表</el-button>
            <el-button type="primary" @click="openCreateDialog">新建模板</el-button>
            <el-button @click="showImport = true">导入</el-button>
          </div>
        </div>
      </template>

      <!-- List View -->
      <template v-if="!selected">
        <el-form inline :model="filters" class="filter-bar">
          <el-form-item label="分类"><el-select v-model="filters.category" clearable placeholder="全部" style="width:130px"><el-option v-for="c in categories" :key="c" :label="c" :value="c"/></el-select></el-form-item>
          <el-form-item label="关键字"><el-input v-model="filters.keyword" clearable placeholder="搜索" style="width:180px" @keyup.enter="load"/></el-form-item>
          <el-form-item><el-button @click="load">查询</el-button></el-form-item>
        </el-form>
        <el-table :data="rows" v-loading="loading" stripe border>
          <el-table-column prop="template_code" label="编码" width="180"><template #default="{row}"><code>{{ row.template_code }}</code></template></el-table-column>
          <el-table-column prop="template_name" label="名称" min-width="160"/>
          <el-table-column prop="category" label="分类" width="100"><template #default="{row}"><el-tag size="small">{{ row.category }}</el-tag></template></el-table-column>
          <el-table-column prop="method" label="方法" width="80"><template #default="{row}"><el-tag size="small" :type="methodColor(row.method)">{{ row.method }}</el-tag></template></el-table-column>
          <el-table-column prop="pagination_type" label="分页" width="80"/>
          <el-table-column prop="auth_type" label="认证" width="90"/>
          <el-table-column prop="version" label="版本" width="80"/>
          <el-table-column label="状态" width="80"><template #default="{row}"><el-tag :type="row.is_published?'success':'info'" size="small">{{ row.is_published ? '已发布' : '草稿' }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="340" fixed="right">
            <template #default="{row}">
              <el-button size="small" @click="openDetail(row)">详情</el-button>
              <el-button size="small" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" type="primary" @click="openTest(row)">测试</el-button>
              <el-button size="small" @click="copyTemplate(row)">复制</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination v-if="total > pageSize" :total="total" :page-size="pageSize" layout="prev,next" @current-change="pageChange" style="margin-top:12px;justify-content:flex-end"/>
      </template>

      <!-- Detail View -->
      <template v-else>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="编码">{{ selected.template_code }}</el-descriptions-item>
          <el-descriptions-item label="名称">{{ selected.template_name }}</el-descriptions-item>
          <el-descriptions-item label="方法">{{ selected.method }}</el-descriptions-item>
          <el-descriptions-item label="URL">{{ selected.base_url }}{{ selected.path }}</el-descriptions-item>
          <el-descriptions-item label="认证">{{ selected.auth_type || '无' }}</el-descriptions-item>
          <el-descriptions-item label="分页">{{ selected.pagination_type }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ selected.version }}</el-descriptions-item>
          <el-descriptions-item label="QPS限流">{{ selected.rate_limit_qps || '-' }} / 并发 {{ selected.rate_limit_concurrency || '-' }}</el-descriptions-item>
          <el-descriptions-item label="重试">{{ selected.retry_max || 0 }} 次 / {{ selected.retry_backoff || '-' }}</el-descriptions-item>
          <el-descriptions-item label="域名白名单">{{ (selected.allowed_domains || []).join(', ') || '-' }}</el-descriptions-item>
          <el-descriptions-item label="描述">{{ selected.description || '-' }}</el-descriptions-item>
        </el-descriptions>

        <h4 style="margin-top:16px">Headers</h4>
        <el-table :data="(selected.headers_config || [])" size="small" v-if="(selected.headers_config || []).length">
          <el-table-column prop="key" label="Key"/><el-table-column prop="value" label="Value"/><el-table-column prop="type" label="类型" width="100"/>
        </el-table>
        <el-text v-else type="info" size="small">无</el-text>

        <h4 style="margin-top:16px">Query Params</h4>
        <el-table :data="(selected.query_config || [])" size="small" v-if="(selected.query_config || []).length">
          <el-table-column prop="key" label="Key"/><el-table-column prop="value" label="Value"/><el-table-column prop="required" label="必填" width="80"/>
        </el-table>
        <el-text v-else type="info" size="small">无</el-text>

        <h4 style="margin-top:16px">Field Mappings</h4>
        <el-table :data="(selected.field_mappings || [])" size="small" v-if="(selected.field_mappings || []).length">
          <el-table-column prop="source" label="源字段"/><el-table-column prop="target" label="目标字段"/><el-table-column prop="transform" label="转换" width="100"/>
        </el-table>
        <el-text v-else type="info" size="small">无</el-text>

        <h4 style="margin-top:16px">版本历史</h4>
        <el-table :data="versions" size="small" v-loading="versionLoading">
          <el-table-column prop="version" label="版本" width="100"/>
          <el-table-column prop="change_note" label="变更说明" min-width="200"/>
          <el-table-column prop="created_by" label="操作人" width="120"/>
          <el-table-column prop="created_at" label="时间" width="180"><template #default="{row}">{{ row.created_at?.slice(0,19) }}</template></el-table-column>
          <el-table-column label="操作" width="120"><template #default="{row}"><el-button size="small" type="warning" @click="rollbackVersion(row.id)" :disabled="row.id === latestVersionId">回滚</el-button></template></el-table-column>
        </el-table>
      </template>
    </el-card>

    <!-- Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑模板' : '新建模板'" width="800px" destroy-on-close>
      <el-tabs v-model="formTab">
        <el-tab-pane label="基础" name="basic">
          <el-form :model="form" label-width="110px">
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item label="编码"><el-input v-model="form.template_code" :disabled="!!editingId"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="名称"><el-input v-model="form.template_name"/></el-form-item></el-col>
            </el-row>
            <el-row :gutter="12">
              <el-col :span="8"><el-form-item label="分类"><el-select v-model="form.category"><el-option v-for="c in categories" :key="c" :label="c" :value="c"/></el-select></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="方法"><el-select v-model="form.method"><el-option v-for="m in methods" :key="m" :label="m" :value="m"/></el-select></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="Content-Type"><el-input v-model="form.content_type" placeholder="application/json"/></el-form-item></el-col>
            </el-row>
            <el-form-item label="Base URL"><el-input v-model="form.base_url" placeholder="https://api.example.com"/></el-form-item>
            <el-form-item label="Path"><el-input v-model="form.path" placeholder="/v1/employees"/></el-form-item>
            <el-row :gutter="12">
              <el-col :span="8"><el-form-item label="认证方式"><el-select v-model="form.auth_type" clearable><el-option v-for="a in authTypes" :key="a" :label="a" :value="a"/></el-select></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="分页策略"><el-select v-model="form.pagination_type"><el-option v-for="p in paginationTypes" :key="p" :label="p" :value="p"/></el-select></el-form-item></el-col>
              <el-col :span="8"><el-form-item label="超时(秒)"><el-input-number v-model="form.timeout_seconds" :min="1" :max="300"/></el-form-item></el-col>
            </el-row>
            <el-form-item label="Data Path"><el-input v-model="form.data_path" placeholder="$.data.items"/></el-form-item>
            <el-form-item label="Total Path"><el-input v-model="form.total_path" placeholder="$.data.total"/></el-form-item>
            <el-form-item label="Cursor Path"><el-input v-model="form.next_cursor_path" placeholder="$.data.next_cursor"/></el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="协议" name="protocol">
          <el-form label-width="110px">
            <el-form-item label="Headers">
              <div v-for="(h, i) in form.headers_config" :key="i" style="display:flex;gap:8px;margin-bottom:6px">
                <el-input v-model="h.key" placeholder="Key" style="flex:1"/>
                <el-input v-model="h.value" placeholder="Value (支持 {{var}})" style="flex:2"/>
                <el-select v-model="h.type" style="width:100px"><el-option label="静态" value="static"/><el-option label="凭证" value="credential"/><el-option label="变量" value="variable"/></el-select>
                <el-button @click="form.headers_config.splice(i,1)" type="danger" :icon="'Delete'"/>
              </div>
              <el-button size="small" @click="form.headers_config.push({key:'',value:'',type:'static'})">+ 添加 Header</el-button>
            </el-form-item>
            <el-form-item label="Query Params">
              <div v-for="(q, i) in form.query_config" :key="i" style="display:flex;gap:8px;margin-bottom:6px">
                <el-input v-model="q.key" placeholder="Key" style="flex:1"/>
                <el-input v-model="q.value" placeholder="Value" style="flex:2"/>
                <el-checkbox v-model="q.required" style="width:80px">必填</el-checkbox>
                <el-button @click="form.query_config.splice(i,1)" type="danger"/>
              </div>
              <el-button size="small" @click="form.query_config.push({key:'',value:'',required:false})">+ 添加 Query</el-button>
            </el-form-item>
            <el-form-item label="Body Template"><el-input v-model="bodyTemplateStr" type="textarea" :rows="6" placeholder='{"query":"{{keyword}}","page":{{page}}}'/></el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="映射" name="mapping">
          <el-form label-width="110px">
            <el-form-item label="字段映射">
              <div v-for="(f, i) in form.field_mappings" :key="i" style="display:flex;gap:8px;margin-bottom:6px">
                <el-input v-model="f.source" placeholder="源字段" style="flex:1"/>
                <el-input v-model="f.target" placeholder="目标字段" style="flex:1"/>
                <el-select v-model="f.transform" clearable style="width:100px"><el-option v-for="t in transforms" :key="t" :label="t" :value="t"/></el-select>
                <el-button @click="form.field_mappings.splice(i,1)" type="danger"/>
              </div>
              <el-button size="small" @click="form.field_mappings.push({source:'',target:'',transform:''})">+ 添加映射</el-button>
            </el-form-item>
            <el-form-item label="错误码映射">
              <div v-for="(e, i) in errorCodePairs" :key="i" style="display:flex;gap:8px;margin-bottom:6px">
                <el-input v-model="e.external" placeholder="外部码" style="flex:1"/>
                <el-input v-model="e.ucp" placeholder="UCP码" style="flex:1"/>
                <el-button @click="errorCodePairs.splice(i,1)" type="danger"/>
              </div>
              <el-button size="small" @click="errorCodePairs.push({external:'',ucp:''})">+ 添加错误码</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="限制" name="limits">
          <el-form label-width="120px">
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item label="限流 QPS"><el-input-number v-model="form.rate_limit_qps" :min="1"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="并发数"><el-input-number v-model="form.rate_limit_concurrency" :min="1"/></el-form-item></el-col>
            </el-row>
            <el-row :gutter="12">
              <el-col :span="12"><el-form-item label="重试次数"><el-input-number v-model="form.retry_max" :min="0" :max="10"/></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="退避策略"><el-select v-model="form.retry_backoff"><el-option label="固定" value="fixed"/><el-option label="指数" value="exponential"/><el-option label="线性" value="linear"/></el-select></el-form-item></el-col>
            </el-row>
            <el-form-item label="域名白名单"><el-input v-model="allowedDomainsStr" placeholder="用逗号分隔, * 表示全部, 如: *.example.com,api.com"/></el-form-item>
            <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2"/></el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save" :loading="saving">{{ editingId ? '更新' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <!-- Test Dialog -->
    <el-dialog v-model="testVisible" title="测试 API" width="700px" destroy-on-close @opened="runTest">
      <el-form label-width="100px">
        <el-form-item label="变量上下文"><el-input v-model="testContextStr" type="textarea" :rows="3" placeholder='{"keyword":"HR","page":1}'/></el-form-item>
      </el-form>
      <el-divider/>
      <div v-if="testLoading"><el-text>测试中...</el-text></div>
      <div v-else-if="testResult">
        <h4>请求摘要</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="方法">{{ testResult.request?.method }}</el-descriptions-item>
          <el-descriptions-item label="URL">{{ testResult.request?.url }}</el-descriptions-item>
          <el-descriptions-item label="Headers">{{ (testResult.request?.headers_keys || []).join(', ') }}</el-descriptions-item>
          <el-descriptions-item label="有Body">{{ testResult.request?.has_body ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="提取行数">{{ testResult.total }}</el-descriptions-item>
        </el-descriptions>
        <h4 style="margin-top:12px">响应样例（已脱敏，最多 3 条）</h4>
        <pre style="background:#f5f7fa;padding:8px;border-radius:4px;max-height:200px;overflow:auto">{{ JSON.stringify(testResult.response_sample, null, 2) }}</pre>
      </div>
      <div v-else-if="testError"><el-alert :title="testError" type="error"/></div>
      <template #footer>
        <el-button @click="testVisible = false">关闭</el-button>
        <el-button type="primary" @click="runTest">重新测试</el-button>
        <el-button type="success" @click="saveSample" v-if="testResult" :loading="savingSample">保存样例</el-button>
      </template>
    </el-dialog>

    <!-- Import Dialog -->
    <el-dialog v-model="showImport" title="导入 API 模板" width="500px">
      <el-input v-model="importJson" type="textarea" :rows="12" placeholder="粘贴 JSON 模板内容"/>
      <template #footer>
        <el-button @click="showImport = false">取消</el-button>
        <el-button type="primary" @click="doImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiTemplateApi } from '@/api/ucp'

const rows = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const pageSize = 20
let page = 1
const selected = ref<any>(null)
const versions = ref<any[]>([])
const versionLoading = ref(false)
const latestVersionId = ref(0)
const formTab = ref('basic')

const filters = reactive({ category: '', keyword: '' })
const categories = ['HR', 'FINANCE', 'OA', 'IM', 'CAR', 'CUSTOM']
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const paginationTypes = ['NONE', 'PAGE', 'OFFSET', 'CURSOR']
const authTypes = ['API_KEY', 'BEARER', 'BASIC', 'OAUTH2', 'NONE']
const transforms = ['upper', 'lower', 'trim', 'int', 'float', 'bool']

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)

const form = reactive<Record<string, any>>({
  template_code: '', template_name: '', category: 'CUSTOM', method: 'GET',
  pagination_type: 'NONE', base_url: '', path: '', auth_type: '',
  data_path: '', total_path: '', next_cursor_path: '',
  rate_limit_qps: null, rate_limit_concurrency: null,
  retry_max: 3, retry_backoff: 'exponential', content_type: 'application/json',
  timeout_seconds: 30, description: '', allowed_domains: [],
  headers_config: [] as any[], query_config: [] as any[],
  field_mappings: [] as any[], error_code_map: {} as Record<string,string>,
})

const bodyTemplateStr = computed({
  get: () => form.body_template ? JSON.stringify(form.body_template, null, 2) : '',
  set: (v) => { try { form.body_template = v ? JSON.parse(v) : null } catch { form.body_template = v } },
})

const errorCodePairs = computed({
  get: () => Object.entries(form.error_code_map || {}).map(([k,v]) => ({external:k,ucp:v})),
  set: (pairs: any[]) => { form.error_code_map = Object.fromEntries(pairs.filter((p:any)=>p.external).map((p:any)=>[p.external,p.ucp])) },
})

const allowedDomainsStr = computed({
  get: () => (form.allowed_domains || []).join(','),
  set: (v) => { form.allowed_domains = v ? v.split(',').map((s:string)=>s.trim()).filter(Boolean) : [] },
})

const showImport = ref(false)
const importJson = ref('')

const testVisible = ref(false)
const testLoading = ref(false)
const testResult = ref<any>(null)
const testError = ref('')
const testContextStr = ref('{}')
const savingSample = ref(false)
let testCode = ''

function methodColor(m: string) {
  return { GET:'success',POST:'primary',PUT:'warning',PATCH:'info',DELETE:'danger' }[m] || 'info'
}

async function load() {
  loading.value = true
  try {
    const res = await apiTemplateApi.list({category:filters.category||undefined,keyword:filters.keyword||undefined,limit:pageSize,offset:(page-1)*pageSize})
    rows.value = res.items; total.value = res.total
  } catch(e:any) { ElMessage.error('加载失败: '+(e?.response?.data?.detail||e?.message)) }
  finally { loading.value = false }
}

async function loadVersions() {
  if (!selected.value) return
  versionLoading.value = true
  try {
    const res = await apiTemplateApi.versions(selected.value.template_code)
    const items = (res as any).items || (Array.isArray(res) ? res : [])
    versions.value = items
    if (items.length) latestVersionId.value = items[0].id
  } catch { versions.value = [] }
  finally { versionLoading.value = false }
}

function pageChange(p: number) { page = p; load() }

function openCreateDialog() {
  editingId.value = null
  formTab.value = 'basic'
  Object.keys(form).forEach(k => {
    if (Array.isArray(form[k])) (form as any)[k] = []
    else if (k === 'error_code_map') (form as any)[k] = {}
    else if (typeof form[k] === 'number') (form as any)[k] = k === 'retry_max' ? 3 : k === 'timeout_seconds' ? 30 : null
    else (form as any)[k] = k === 'category' ? 'CUSTOM' : k === 'method' ? 'GET' : k === 'pagination_type' ? 'NONE' : k === 'content_type' ? 'application/json' : ''
  })
  dialogVisible.value = true
}

function openEdit(row: any) {
  editingId.value = row.template_code
  formTab.value = 'basic'
  Object.keys(form).forEach(k => {
    if (row[k] !== undefined) (form as any)[k] = row[k]
    else if (Array.isArray(form[k])) (form as any)[k] = []
    else if (k === 'error_code_map') (form as any)[k] = {}
  })
  dialogVisible.value = true
}

async function openDetail(row: any) {
  selected.value = row
  await loadVersions()
}

function openTest(row: any) {
  testCode = row.template_code
  testContextStr.value = '{}'
  testResult.value = null
  testError.value = ''
  testVisible.value = true
}

async function runTest() {
  testLoading.value = true; testError.value = ''; testResult.value = null
  try {
    let ctx: any = {}
    try { ctx = JSON.parse(testContextStr.value) } catch { ctx = {} }
    const tpl = editingId.value ? { ...form } : rows.value.find((r:any) => r.template_code === testCode) || {}
    const res = await apiTemplateApi.testApiTemplate({ template: tpl, context: ctx })
    testResult.value = res
  } catch(e: any) { testError.value = e?.response?.data?.detail || e?.message || '测试失败' }
  finally { testLoading.value = false }
}

async function saveSample() {
  if (!testResult.value) return
  savingSample.value = true
  try {
    const tpl = editingId.value ? { ...form } : rows.value.find((r:any) => r.template_code === testCode) || {}
    await apiTemplateApi.testApiTemplate({ template: tpl, context: JSON.parse(testContextStr.value||'{}'), save_sample: true })
    ElMessage.success('样例已保存')
  } catch(e: any) { ElMessage.error('保存失败: '+(e?.response?.data?.detail||e?.message)) }
  finally { savingSample.value = false }
}

async function save() {
  saving.value = true
  try {
    const payload = { ...form }
    // auto-save error_code_map from pairs
    payload.error_code_map = Object.fromEntries(errorCodePairs.value.filter((p:any)=>p.external).map((p:any)=>[p.external,p.ucp]))
    if (editingId.value) await apiTemplateApi.update(editingId.value, { ...payload, change_note: '手动编辑' })
    else await apiTemplateApi.create({ ...payload })
    ElMessage.success(editingId.value ? '更新成功' : '创建成功')
    dialogVisible.value = false; load()
  } catch(e: any) { ElMessage.error('保存失败: '+(e?.response?.data?.detail||e?.message)) }
  finally { saving.value = false }
}

async function copyTemplate(row: any) {
  try {
    await apiTemplateApi.copy(row.template_code, `${row.template_code}_copy`, `${row.template_name} (副本)`)
    ElMessage.success('复制成功'); load()
  } catch(e: any) { ElMessage.error('复制失败: '+(e?.response?.data?.detail||e?.message)) }
}

async function confirmDelete(row: any) {
  try {
    await ElMessageBox.confirm(`确认删除模板 "${row.template_code}"？`, '提示', { type: 'warning' })
    await apiTemplateApi.delete(row.template_code)
    ElMessage.success('已删除'); load()
  } catch(e: any) { if (e !== 'cancel') ElMessage.error('删除失败') }
}

async function exportTemplate(row: any) {
  try {
    const res = await apiTemplateApi.exportTemplate(row.template_code)
    const blob = new Blob([JSON.stringify(res.content, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `${row.template_code}.json`; a.click()
    URL.revokeObjectURL(url)
  } catch(e: any) { ElMessage.error('导出失败') }
}

async function doImport() {
  try {
    const content = JSON.parse(importJson.value)
    await apiTemplateApi.importTemplate(content)
    ElMessage.success('导入成功'); showImport.value = false; load()
  } catch(e: any) { ElMessage.error('导入失败: '+(e?.response?.data?.detail||e?.message)) }
}

async function rollbackVersion(versionId: number) {
  if (!selected.value) return
  try {
    await ElMessageBox.confirm('确认回滚到该版本？', '提示', { type: 'warning' })
    await apiTemplateApi.rollback(selected.value.template_code, versionId)
    ElMessage.success('已回滚')
    await loadVersions()
    // refresh selected detail
    const updated = await apiTemplateApi.get(selected.value.template_code)
    if (updated) selected.value = updated
  } catch(e: any) { if (e !== 'cancel') ElMessage.error('回滚失败') }
}

onMounted(() => load())
</script>

<style scoped>
.page-header { display:flex; justify-content:space-between; align-items:center }
.header-actions { display:flex; gap:8px }
.sub { color:#8f959e; font-size:13px; margin:4px 0 0 }
.filter-bar { margin-bottom:12px }
h4 { margin: 12px 0 6px; font-size: 14px; color: #303133 }
</style>
