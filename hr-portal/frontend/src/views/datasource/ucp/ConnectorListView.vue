<template>
  <div class="connector-list">
    <div class="page-header">
      <h2>连接器管理（Connectors）</h2>
      <p class="desc">管理数据源连接配置，支持北森/飞书/滴滴/曹操等系统。创建后请完成连通性测试。</p>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-row">
      <el-card class="stat-card">
        <div class="stat-label">总连接器</div>
        <div class="stat-value">{{ totalCount }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">启用</div>
        <div class="stat-value text-success">{{ enabledCount }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">禁用</div>
        <div class="stat-value text-danger">{{ disabledCount }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">未测试</div>
        <div class="stat-value text-warning">{{ untestedCount }}</div>
      </el-card>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索连接器编码/名称" clearable style="width: 220px" @clear="loadList" @keyup.enter="loadList" />
      <el-select v-model="filterType" placeholder="类型" clearable style="width: 150px" @change="loadList">
        <el-option label="BEISEN（北森）" value="BEISEN" />
        <el-option label="FEISHU（飞书）" value="FEISHU" />
        <el-option label="DIDI（滴滴）" value="DIDI" />
        <el-option label="CAOCAO（曹操）" value="CAOCAO" />
        <el-option label="OA" value="OA" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 130px" @change="loadList">
        <el-option label="启用" :value="1" />
        <el-option label="禁用" :value="2" />
      </el-select>
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">创建连接器</el-button>
    </div>

    <!-- 连接器列表 -->
    <el-table :data="items" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="65" />
      <el-table-column prop="connector_code" label="连接器编码" min-width="170" show-overflow-tooltip />
      <el-table-column prop="connector_name" label="名称" min-width="140" show-overflow-tooltip />
      <el-table-column prop="connector_type" label="类型" width="120">
        <template #default="{ row }">
          <el-tag size="small">{{ row.connector_type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="凭证" width="100">
        <template #default="{ row }">
          <span v-if="row.credential_code">{{ row.credential_code }}</span>
          <span v-else class="empty">未绑定</span>
        </template>
      </el-table-column>
      <el-table-column label="测试状态" width="110" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.test_status === 'success'" size="small" type="success">通过</el-tag>
          <el-tag v-else-if="row.test_status === 'failed'" size="small" type="danger">失败</el-tag>
          <el-tag v-else size="small" type="info">未测</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 1 ? 'success' : 'info'">
            {{ row.status === 1 ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openEditDialog(row)">编辑</el-button>
          <el-button size="small" link :type="row.status === 1 ? 'warning' : 'success'" @click="toggleStatus(row)">
            {{ row.status === 1 ? '禁用' : '启用' }}
          </el-button>
          <el-button size="small" link type="success" @click="openTestDialog(row)">测试</el-button>
          <el-button size="small" link type="danger" @click="deleteConnector(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="totalCount"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      @current-change="loadList"
      @size-change="loadList"
    />

    <!-- 创建/编辑 Dialog -->
    <el-dialog v-model="formVisible" :title="isEdit ? '编辑连接器' : '创建连接器'" width="580px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="连接器编码" required>
          <el-input v-model="form.connector_code" :disabled="isEdit" placeholder="CONN-001" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.connector_name" placeholder="北森生产连接器" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="form.connector_type" placeholder="选择类型" style="width: 100%">
            <el-option label="BEISEN（北森）" value="BEISEN" />
            <el-option label="FEISHU（飞书）" value="FEISHU" />
            <el-option label="DIDI（滴滴）" value="DIDI" />
            <el-option label="CAOCAO（曹操）" value="CAOCAO" />
            <el-option label="OA" value="OA" />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定凭证" required>
          <el-select v-model="form.credential_id" placeholder="选择凭证" style="width: 100%" filterable>
            <el-option v-for="c in credentialOptions" :key="c.id" :label="c.credential_name || c.credential_code" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="基础 URL">
          <el-input v-model="form.base_url" placeholder="https://api.example.com" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">提交</el-button>
      </template>
    </el-dialog>

    <!-- 测试 Dialog -->
    <el-dialog v-model="testVisible" title="连通性测试" width="520px">
      <div v-if="testRunning" style="text-align: center; padding: 20px">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <div style="margin-top: 8px; color: #909399">测试运行中…</div>
      </div>
      <div v-else-if="testResult">
        <el-alert :type="testResult.status === 'success' ? 'success' : 'error'" :closable="false" show-icon style="margin-bottom: 16px">
          {{ testResult.status === 'success' ? '连通性测试通过！' : `测试失败：[${testResult.error_code}] ${testResult.error_message}` }}
        </el-alert>
        <el-descriptions :column="1" border size="small" v-if="testResult.duration_ms != null">
          <el-descriptions-item label="耗时">{{ testResult.duration_ms }} ms</el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button @click="testVisible = false">关闭</el-button>
        <el-button v-if="testResult && testResult.status !== 'success'" type="primary" @click="runTest(currentRow!.connector_code, 'connectivity')">重新测试</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Loading } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'

const items = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const filterType = ref('')
const filterStatus = ref<number | string>('')

const formVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const form = ref({
  id: 0,
  connector_code: '',
  connector_name: '',
  connector_type: '',
  credential_id: undefined as number | undefined,
  base_url: '',
  description: '',
})
const credentialOptions = ref<any[]>([])

const testVisible = ref(false)
const testRunning = ref(false)
const testResult = ref<any>(null)
const currentRow = ref<any>(null)

const enabledCount = computed(() => items.value.filter(x => x.status === 1).length)
const disabledCount = computed(() => items.value.filter(x => x.status === 2).length)
const untestedCount = computed(() => items.value.filter(x => !x.test_status || x.test_status === 'untested').length)

const loadList = async () => {
  loading.value = true
  try {
    const res = await ucpApi.connectors(filterType.value || undefined)
    let data = res.items || []
    if (filterStatus.value !== '') {
      data = data.filter(x => x.status === Number(filterStatus.value))
    }
    if (keyword.value) {
      const kw = keyword.value.toLowerCase()
      data = data.filter(x => (x.system_code || '').toLowerCase().includes(kw) || (x.system_name || '').toLowerCase().includes(kw))
    }
    items.value = data
    totalCount.value = res.total || data.length
  } catch (e: any) {
    ElMessage.error('加载连接器列表失败: ' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

const loadCredentials = async () => {
  try {
    const res = await ucpApi.credentials()
    credentialOptions.value = res.items || []
  } catch {}
}

const openCreateDialog = () => {
  isEdit.value = false
  form.value = { id: 0, connector_code: '', connector_name: '', connector_type: '', credential_id: undefined, base_url: '', description: '' }
  loadCredentials()
  formVisible.value = true
}

const openEditDialog = async (row: any) => {
  isEdit.value = true
  await loadCredentials()
  form.value = {
    id: row.id,
    connector_code: row.connector_code,
    connector_name: row.connector_name || '',
    connector_type: row.connector_type || '',
    credential_id: row.credential_id || undefined,
    base_url: row.base_url || '',
    description: row.description || '',
  }
  formVisible.value = true
}

const submitForm = async () => {
  if (!form.value.connector_code || !form.value.connector_name || !form.value.connector_type) {
    ElMessage.warning('请填写编码、名称和类型')
    return
  }
  submitting.value = true
  try {
    const payload: any = {
      connector_code: form.value.connector_code,
      connector_name: form.value.connector_name,
      connector_type: form.value.connector_type,
      credential_id: form.value.credential_id,
      base_url: form.value.base_url || undefined,
      description: form.value.description || undefined,
    }
    if (isEdit.value) {
      await ucpApi.updateConnector(form.value.id, { ...payload, version: 1 })
      ElMessage.success('连接器更新成功')
    } else {
      await ucpApi.createConnector(payload)
      ElMessage.success('连接器创建成功，请完成连通性测试')
    }
    formVisible.value = false
    loadList()
  } catch (e: any) {
    ElMessage.error('提交失败: ' + (e?.response?.data?.detail || e?.message || e))
  } finally {
    submitting.value = false
  }
}

const toggleStatus = async (row: any) => {
  const newStatus = row.status === 1 ? 2 : 1
  try {
    await ElMessageBox.confirm(`确认${newStatus === 1 ? '启用' : '禁用'}连接器「${row.connector_name || row.connector_code}」？`, '提示', { type: 'warning' })
    await ucpApi.toggleConnector(row.id, newStatus)
    ElMessage.success('操作成功')
    loadList()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('操作失败: ' + (e?.message || e))
  }
}

const deleteConnector = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确认删除连接器「${row.system_name || row.system_code}」？此操作不可恢复。`, '确认删除', { type: 'warning' })
    await ucpApi.deleteConnector(row.id)
    ElMessage.success('删除成功')
    loadList()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error('删除失败: ' + (e?.message || e))
  }
}

const openTestDialog = (row: any) => {
  currentRow.value = row
  testResult.value = null
  testRunning.value = false
  testVisible.value = true
  runTest(row.connector_code, 'connectivity')
}

const runTest = async (connectorCode: string, testType: string) => {
  testRunning.value = true
  testResult.value = null
  try {
    testResult.value = await ucpApi.runConnectorTest(connectorCode, testType)
  } catch (e: any) {
    testResult.value = { status: 'failed', error_code: 'TEST_ERROR', error_message: e?.message || '测试执行异常' }
  } finally {
    testRunning.value = false
  }
}

onMounted(() => {
  loadList()
})
</script>

<style scoped>
.connector-list { padding: 16px; }
.page-header h2 { margin: 0 0 4px 0; }
.desc { color: #909399; font-size: 13px; margin: 0 0 16px 0; }
.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.stat-card { text-align: center; }
.stat-label { font-size: 12px; color: #909399; }
.stat-value { font-size: 24px; font-weight: 600; margin-top: 4px; }
.text-success { color: #67c23a; }
.text-danger { color: #f56c6c; }
.text-warning { color: #e6a23c; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.pager { margin-top: 12px; text-align: right; }
.empty { color: #c0c4cc; }
</style>
