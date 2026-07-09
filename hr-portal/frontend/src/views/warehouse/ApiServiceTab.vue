<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Switch } from '@element-plus/icons-vue'
import { formatDateTime } from '@/utils/datetime'
import ServiceStatusBadge from '@/components/warehouse/ServiceStatusBadge.vue'
import ServiceSourcePicker from '@/components/warehouse/ServiceSourcePicker.vue'
import ServiceFieldSelector from '@/components/warehouse/ServiceFieldSelector.vue'
import PermissionPolicyEditor from '@/components/warehouse/PermissionPolicyEditor.vue'
import { apiServicesApi, type ApiServiceOut, type ApiServiceIn } from '@/api/api_services'

const items = ref<ApiServiceOut[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editing = ref<ApiServiceOut | null>(null)

const form = ref<ApiServiceIn & { id?: number }>({
  name: '', source_type: 'table', source_id: '',
  field_whitelist: [], filter_fields: [],
  auth_policy: {}, page_size_max: 500,
})

const sourceRef = ref({ source_type: 'table', source_id: '', source_label: '' })

async function load() {
  loading.value = true
  try { items.value = await apiServicesApi.list() } catch { items.value = [] }
  finally { loading.value = false }
}

function openCreate() {
  editing.value = null
  form.value = { name: '', source_type: 'table', source_id: '', field_whitelist: [], filter_fields: [], auth_policy: {}, page_size_max: 500 }
  sourceRef.value = { source_type: 'table', source_id: '', source_label: '' }
  dialogVisible.value = true
}

function openEdit(item: ApiServiceOut) {
  editing.value = item
  form.value = { name: item.name, description: item.description, source_type: item.source_type, source_id: item.source_id, source_label: item.source_label, source_layer: item.source_layer || undefined, field_whitelist: item.field_whitelist, filter_fields: item.filter_fields, default_sort: item.default_sort || undefined, page_size_max: item.page_size_max, auth_policy: item.auth_policy, rate_limit: item.rate_limit, timeout_seconds: item.timeout_seconds }
  sourceRef.value = { source_type: item.source_type, source_id: item.source_id, source_label: item.source_label || '' }
  dialogVisible.value = true
}

async function save() {
  const payload = { ...form.value, source_type: sourceRef.value.source_type, source_id: sourceRef.value.source_id, source_label: sourceRef.value.source_label }
  try {
    if (editing.value) {
      await apiServicesApi.update(editing.value.id, payload)
      ElMessage.success('已更新')
    } else {
      await apiServicesApi.create(payload as ApiServiceIn)
      ElMessage.success('已创建')
    }
    dialogVisible.value = false
    await load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
}

async function toggle(item: ApiServiceOut) {
  try { await apiServicesApi.toggle(item.id); ElMessage.success(item.status === 'enabled' ? '已停用' : '已启用'); await load() }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '操作失败') }
}

async function remove(item: ApiServiceOut) {
  await ElMessageBox.confirm(`删除「${item.name}」？`, '确认删除', { type: 'warning' })
  try { await apiServicesApi.remove(item.id); ElMessage.success('已删除'); await load() }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '删除失败') }
}

onMounted(() => load())
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
      <span style="font-size: 14px; color: #606266">共 {{ items.length }} 个 API 服务</span>
      <el-button :icon="Plus" type="primary" size="small" @click="openCreate">新建 API</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe size="small">
      <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
      <el-table-column label="来源" min-width="180">
        <template #default="{ row }">{{ row.source_label || row.source_id }} <el-tag size="small" type="info">{{ row.source_layer || row.source_type }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }"><ServiceStatusBadge :status="row.status" /></template>
      </el-table-column>
      <el-table-column label="鉴权" width="80">
        <template #default="{ row }">{{ (row.auth_policy || {}).type || '登录态' }}</template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新" width="150">
        <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" text :type="row.status === 'enabled' ? 'warning' : 'success'" @click="toggle(row)">
            {{ row.status === 'enabled' ? '停用' : '启用' }}
          </el-button>
          <el-button size="small" text type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑 API 服务' : '新建 API 服务'" width="680px" destroy-on-close>
      <el-form label-width="100px" label-position="left">
        <el-form-item label="名称" required><el-input v-model="form.name" placeholder="如: 员工查询API" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="来源资产" required>
          <ServiceSourcePicker v-model="sourceRef" />
        </el-form-item>
        <el-form-item label="返回字段" required>
          <ServiceFieldSelector v-model="form.field_whitelist" />
        </el-form-item>
        <el-form-item label="过滤字段">
          <el-select v-model="form.filter_fields" multiple filterable allow-create placeholder="可选填" style="width: 100%">
            <el-option v-for="f in form.field_whitelist" :key="f.field" :label="f.alias || f.field" :value="f.field" />
          </el-select>
        </el-form-item>
        <el-form-item label="鉴权策略">
          <PermissionPolicyEditor :model-value="form.auth_policy as any" @update:model-value="form.auth_policy = $event" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
