<template>
  <div class="adapter-registry-page">
    <el-card>
      <!-- 头部：标题 + 操作 -->
      <template #header>
        <div class="page-header">
          <div>
            <h2>适配器注册</h2>
            <p class="sub">业务方自助注册 adapter 元数据 (类型/字段定义/样例). 实际代码仍由后端维护.</p>
          </div>
          <el-button type="primary" :icon="Plus" @click="openCreateDialog">注册新 Adapter</el-button>
        </div>
      </template>

      <!-- 过滤 -->
      <el-form inline :model="filters" class="filter-bar">
        <el-form-item label="类型">
          <el-select v-model="filters.adapter_type" clearable placeholder="全部" style="width: 140px">
            <el-option v-for="t in ADAPTER_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.is_active" clearable placeholder="全部" style="width: 120px">
            <el-option label="已启用" :value="true" />
            <el-option label="未启用" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键字">
          <el-input v-model="filters.keyword" clearable placeholder="按名称搜索" style="width: 180px" @keyup.enter="loadList" />
        </el-form-item>
        <el-form-item>
          <el-button @click="loadList">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 表格 -->
      <el-table :data="rows" v-loading="loading" stripe border>
        <el-table-column prop="adapter_code" label="Code" width="200">
          <template #default="{ row }">
            <code>{{ row.adapter_code }}</code>
            <el-tag v-if="row.is_active" type="success" size="small" style="margin-left: 6px">已启用</el-tag>
            <el-tag v-else type="info" size="small" style="margin-left: 6px">未启用</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="adapter_type" label="类型" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.adapter_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="version" label="版本" width="100" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="created_by" label="创建人" width="120" />
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            <span class="muted">{{ row.created_at?.slice(0, 19).replace('T', ' ') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="viewAdapter(row)">详情</el-button>
            <el-button
              size="small"
              link
              :type="row.is_active ? 'warning' : 'success'"
              @click="toggleActive(row)"
            >
              {{ row.is_active ? '停用' : '启用' }}
            </el-button>
            <el-button size="small" link type="danger" :disabled="row.is_active" @click="removeAdapter(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 注册/编辑 Dialog -->
    <el-dialog v-model="dialogVisible" title="注册 Adapter" width="640px" :close-on-click-modal="false">
      <el-form :model="form" label-width="120px" :rules="formRules" ref="formRef">
        <el-form-item label="Adapter Code" prop="adapter_code">
          <el-input v-model="form.adapter_code" placeholder="大写字母+下划线, e.g. CUSTOM_BILL_PULL" />
        </el-form-item>
        <el-form-item label="类型" prop="adapter_type">
          <el-select v-model="form.adapter_type" placeholder="选择类型" style="width: 100%">
            <el-option v-for="t in ADAPTER_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="版本">
          <el-input v-model="form.version" placeholder="1.0.0" />
        </el-form-item>
        <el-form-item label="Schema (JSON)">
          <el-input
            v-model="schemaText"
            type="textarea"
            :rows="6"
            placeholder='{"fields": [{"name": "id", "type": "string", "required": true}]}'
          />
          <div class="hint">简化 JSON Schema. fields 为字段列表 (name/type/required).</div>
        </el-form-item>
        <el-form-item label="样例 Payload">
          <el-input
            v-model="sampleText"
            type="textarea"
            :rows="4"
            placeholder='{"id": "demo"}'
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">提交</el-button>
      </template>
    </el-dialog>

    <!-- 详情 Dialog -->
    <el-dialog v-model="detailVisible" title="Adapter 详情" width="720px">
      <pre class="json-block" v-if="detailData">{{ JSON.stringify(detailData, null, 2) }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { adapterRegistryApi, type AdapterDefinition } from '@/api/ucp'

const ADAPTER_TYPES = ['HTTP', 'DB', 'FILE', 'EVENT', 'TRANSFORM', 'CUSTOM']

const rows = ref<AdapterDefinition[]>([])
const loading = ref(false)
const filters = reactive<{ adapter_type: string | null; is_active: boolean | null; keyword: string }>({
  adapter_type: null,
  is_active: null,
  keyword: '',
})

const dialogVisible = ref(false)
const submitting = ref(false)
const form = reactive({
  adapter_code: '',
  adapter_type: 'HTTP',
  name: '',
  description: '',
  version: '1.0.0',
})
const schemaText = ref('')
const sampleText = ref('')
const formRef = ref()

const detailVisible = ref(false)
const detailData = ref<AdapterDefinition | null>(null)

const formRules = computed(() => ({
  adapter_code: [
    { required: true, message: '请输入 code', trigger: 'blur' },
    {
      validator: (_: unknown, v: string, cb: (e?: Error) => void) => {
        if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(v || '')) {
          cb(new Error('需 ^[A-Z][A-Z0-9_]{2,63}$'))
        } else cb()
      },
      trigger: 'blur',
    },
  ],
  adapter_type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
}))

async function loadList() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {}
    if (filters.adapter_type) params.adapter_type = filters.adapter_type
    if (filters.is_active !== null) params.is_active = filters.is_active
    if (filters.keyword) params.keyword = filters.keyword
    rows.value = await adapterRegistryApi.list(params)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(`加载失败: ${msg}`)
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.adapter_type = null
  filters.is_active = null
  filters.keyword = ''
  loadList()
}

function openCreateDialog() {
  form.adapter_code = ''
  form.adapter_type = 'HTTP'
  form.name = ''
  form.description = ''
  form.version = '1.0.0'
  schemaText.value = ''
  sampleText.value = ''
  dialogVisible.value = true
}

async function submitForm() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  let schema: Record<string, unknown> | undefined
  if (schemaText.value.trim()) {
    try {
      schema = JSON.parse(schemaText.value)
    } catch (e) {
      ElMessage.error('Schema JSON 格式错误')
      return
    }
  }
  let sample: Record<string, unknown> | unknown[] | undefined
  if (sampleText.value.trim()) {
    try {
      sample = JSON.parse(sampleText.value)
    } catch (e) {
      ElMessage.error('样例 JSON 格式错误')
      return
    }
  }
  submitting.value = true
  try {
    await adapterRegistryApi.register({
      adapter_code: form.adapter_code,
      adapter_type: form.adapter_type,
      name: form.name,
      description: form.description || undefined,
      version: form.version,
      schema,
      sample_payload: sample,
    })
    ElMessage.success('注册成功')
    dialogVisible.value = false
    loadList()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(`注册失败: ${msg}`)
  } finally {
    submitting.value = false
  }
}

async function toggleActive(row: AdapterDefinition) {
  const action = row.is_active ? '停用' : '启用'
  try {
    await ElMessageBox.confirm(`确认${action} ${row.adapter_code}?`, '提示', { type: 'warning' })
    await adapterRegistryApi.activate(row.adapter_code, !row.is_active)
    ElMessage.success(`已${action}`)
    loadList()
  } catch {
    // cancelled
  }
}

async function removeAdapter(row: AdapterDefinition) {
  try {
    await ElMessageBox.confirm(`确认删除 ${row.adapter_code}?`, '危险操作', {
      type: 'error',
    })
    await adapterRegistryApi.remove(row.adapter_code)
    ElMessage.success('已删除')
    loadList()
  } catch (e: unknown) {
    if (e === 'cancel') return
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(`删除失败: ${msg}`)
  }
}

async function viewAdapter(row: AdapterDefinition) {
  try {
    detailData.value = await adapterRegistryApi.get(row.adapter_code)
    detailVisible.value = true
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(`查询失败: ${msg}`)
  }
}

onMounted(loadList)
</script>

<style scoped>
.adapter-registry-page {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-header h2 {
  margin: 0 0 4px;
  font-size: 20px;
}
.sub {
  margin: 0;
  color: #909399;
  font-size: 13px;
}
.filter-bar {
  margin-bottom: 16px;
}
.muted {
  color: #909399;
  font-size: 12px;
}
code {
  font-family: 'Courier New', monospace;
  background: #f5f7fa;
  padding: 1px 6px;
  border-radius: 3px;
}
.hint {
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
}
.json-block {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  max-height: 60vh;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
}
</style>
