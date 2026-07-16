<template>
  <div class="credential-list">
    <div class="page-header">
      <h2>凭证管理（Credentials）</h2>
      <p class="desc">管理数据源鉴权凭证，支持 Basic Auth / API Key / OAuth2 等认证方式。</p>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-row">
      <el-card class="stat-card">
        <div class="stat-label">总凭证数</div>
        <div class="stat-value">{{ totalCount }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">活跃</div>
        <div class="stat-value text-success">{{ activeCount }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">已停用</div>
        <div class="stat-value text-danger">{{ inactiveCount }}</div>
      </el-card>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索凭证编码/名称" clearable style="width: 220px" @clear="loadList" @keyup.enter="loadList" />
      <el-select v-model="filterAuthType" placeholder="认证方式" clearable style="width: 150px" @change="loadList">
        <el-option label="Basic Auth" value="basic" />
        <el-option label="API Key" value="api_key" />
        <el-option label="OAuth2" value="oauth2" />
        <el-option label="Token" value="token" />
      </el-select>
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">创建凭证</el-button>
    </div>

    <!-- 凭证列表 -->
    <el-table :data="items" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="credential_code" label="凭证编码" min-width="180" show-overflow-tooltip />
      <el-table-column prop="credential_name" label="名称" min-width="150" show-overflow-tooltip />
      <el-table-column prop="auth_type" label="认证方式" width="120">
        <template #default="{ row }">
          <el-tag size="small">{{ row.auth_type || '-' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="is_active" label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.is_active ? 'success' : 'info'">
            {{ row.is_active ? '活跃' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" width="170">
        <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openEditDialog(row)">编辑</el-button>
          <el-button size="small" link :type="row.is_active ? 'warning' : 'success'" @click="toggleActive(row)">
            {{ row.is_active ? '停用' : '启用' }}
          </el-button>
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
    <el-dialog v-model="formVisible" :title="isEdit ? '编辑凭证' : '创建凭证'" width="560px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="凭证编码" required>
          <el-input v-model="form.credential_code" :disabled="isEdit" placeholder="CRED-001" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.credential_name" placeholder="北森生产凭证" />
        </el-form-item>
        <el-form-item label="认证方式">
          <el-select v-model="form.auth_type" placeholder="选择认证方式" style="width: 100%">
            <el-option label="Basic Auth" value="basic" />
            <el-option label="API Key" value="api_key" />
            <el-option label="OAuth2" value="oauth2" />
            <el-option label="Token" value="token" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选描述" />
        </el-form-item>
        <el-form-item label="密钥配置" required>
          <div v-for="(val, key) in form.secrets" :key="key" class="secret-row">
            <el-input v-model="secretKey" placeholder="键名" style="width: 140px" @input="onSecretKeyChange(key, $event)" />
            <el-input v-model="form.secrets[key]" :type="showSecret ? 'text' : 'password'" placeholder="值" style="flex: 1" />
          </div>
          <div class="secret-actions">
            <el-button size="small" link type="primary" @click="addSecretKey">+ 添加密钥字段</el-button>
            <el-button size="small" link @click="showSecret = !showSecret">{{ showSecret ? '隐藏' : '显示' }}值</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { ucpApi } from '@/api/ucp'

const items = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const filterAuthType = ref('')

const formVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const showSecret = ref(false)
const secretKey = ref('')
const form = ref({
  id: 0,
  credential_code: '',
  credential_name: '',
  auth_type: '',
  description: '',
  secrets: {} as Record<string, string>,
})

const activeCount = computed(() => items.value.filter(x => x.is_active).length)
const inactiveCount = computed(() => items.value.filter(x => !x.is_active).length)

const formatTime = (s: string | null) => (s ? formatDateTime(s) : '-')

const loadList = async () => {
  loading.value = true
  try {
    const res = await ucpApi.credentials(filterAuthType.value || undefined)
    items.value = res.items || []
    totalCount.value = res.total || 0
  } catch (e: any) {
    ElMessage.error('加载凭证列表失败: ' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

const openCreateDialog = () => {
  isEdit.value = false
  form.value = { id: 0, credential_code: '', credential_name: '', auth_type: '', description: '', secrets: {} }
  secretKey.value = ''
  formVisible.value = true
}

const openEditDialog = async (row: any) => {
  isEdit.value = true
  try {
    // 直接用行数据填充（secrets 不回显，需重新输入）
    form.value = {
      id: row.id,
      credential_code: row.credential_code,
      credential_name: row.credential_name || '',
      auth_type: row.auth_type || '',
      description: row.description || '',
      secrets: {},
    }
    formVisible.value = true
  } catch (e: any) {
    ElMessage.error('加载详情失败: ' + (e?.message || e))
  }
}

const addSecretKey = () => {
  const key = prompt('请输入密钥字段名（如 username / password / api_key）：')
  if (key) {
    form.value.secrets[key] = ''
  }
}

const onSecretKeyChange = (oldKey: string, newKey: string) => {
  if (newKey && newKey !== oldKey) {
    const val = form.value.secrets[oldKey]
    delete form.value.secrets[oldKey]
    form.value.secrets[newKey] = val
  }
}

const submitForm = async () => {
  if (!form.value.credential_code || !form.value.credential_name) {
    ElMessage.warning('请填写凭证编码和名称')
    return
  }
  if (Object.keys(form.value.secrets).length === 0) {
    ElMessage.warning('请至少配置一个密钥字段')
    return
  }
  submitting.value = true
  try {
    if (isEdit.value) {
      await ucpApi.updateCredential(form.value.id, {
        credential_name: form.value.credential_name,
        auth_type: form.value.auth_type || undefined,
        description: form.value.description || undefined,
        secrets: Object.keys(form.value.secrets).length > 0 ? form.value.secrets : undefined,
      })
      ElMessage.success('凭证更新成功')
    } else {
      await ucpApi.createCredential({
        credential_code: form.value.credential_code,
        credential_name: form.value.credential_name,
        secrets: form.value.secrets,
        auth_type: form.value.auth_type || undefined,
        description: form.value.description || undefined,
      })
      ElMessage.success('凭证创建成功')
    }
    formVisible.value = false
    loadList()
  } catch (e: any) {
    ElMessage.error('提交失败: ' + (e?.response?.data?.detail || e?.message || e))
  } finally {
    submitting.value = false
  }
}

const toggleActive = async (row: any) => {
  const action = row.is_active ? '停用' : '启用'
  try {
    await ElMessageBox.confirm(`确认${action}凭证「${row.credential_name || row.credential_code}」？`, '提示', { type: 'warning' })
    await ucpApi.toggleCredential(row.id, !row.is_active)
    ElMessage.success(`${action}成功`)
    loadList()
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(`${action}失败: ` + (e?.message || e))
  }
}

onMounted(() => {
  loadList()
})
</script>

<style scoped>
.credential-list { padding: 16px; }
.page-header h2 { margin: 0 0 4px 0; }
.desc { color: #909399; font-size: 13px; margin: 0 0 16px 0; }
.stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
.stat-card { text-align: center; }
.stat-label { font-size: 12px; color: #909399; }
.stat-value { font-size: 24px; font-weight: 600; margin-top: 4px; }
.text-success { color: #67c23a; }
.text-danger { color: #f56c6c; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.pager { margin-top: 12px; text-align: right; }
.secret-row { display: flex; gap: 8px; margin-bottom: 6px; }
.secret-actions { display: flex; gap: 12px; margin-top: 4px; }
</style>
