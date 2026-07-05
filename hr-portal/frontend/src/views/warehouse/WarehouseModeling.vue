<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, View, Edit, VideoPlay, Finished, Lock } from '@element-plus/icons-vue'
import { listModels, publishModel, archiveModel, type ModelListItem } from '@/api/warehouse'
import { datasetsApi } from '@/api/datasets'
import AclEditor, { type AclRow } from '@/components/AclEditor.vue'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const models = ref<ModelListItem[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const statusFilter = ref('')

// 授权弹窗
const aclVisible = ref(false)
const aclModel = ref<ModelListItem | null>(null)
const aclRows = ref<AclRow[]>([])
const aclSaving = ref(false)

const STATUS_LABELS: Record<string, string> = { draft: '草稿', published: '已发布', archived: '已归档' }
const STATUS_TAG: Record<string, string> = { draft: 'info', published: 'success', archived: 'info' }
const LAYER_LABELS: Record<string, string> = { ODS: 'ODS', DWD: 'DWD', DWS: 'DWS', ADS: 'ADS' }

async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: page.value, page_size: pageSize.value }
    if (keyword.value) params.keyword = keyword.value
    if (statusFilter.value) params.status = statusFilter.value
    const res = await listModels(params)
    models.value = res.items
    total.value = res.total
  } catch {
    ElMessage.error('加载模型列表失败')
  } finally { loading.value = false }
}

function goCreate() { router.push('/warehouse/modeling/visual') }
function goEdit(id: number) { router.push(`/warehouse/modeling/visual/${id}`) }

async function openAcl(model: ModelListItem) {
  aclModel.value = model
  aclRows.value = []
  try {
    const detail = await datasetsApi.get(model.id)
    aclRows.value = (detail as any).acl?.map((a: any) => ({ id: a.id, role_id: a.role_id, user_id: a.user_id })) || []
  } catch {
    aclRows.value = []
  }
  aclVisible.value = true
}

async function saveAcl() {
  if (!aclModel.value) return
  aclSaving.value = true
  try {
    await datasetsApi.update(aclModel.value.id, { acl: aclRows.value } as any)
    ElMessage.success('授权已保存')
    aclVisible.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally { aclSaving.value = false }
}

async function doPublish(model: ModelListItem) {
  try {
    await ElMessageBox.confirm(`确定发布模型「${model.name}」？`, '确认发布', { type: 'info' })
    await publishModel(model.id)
    ElMessage.success('发布成功')
    load()
  } catch { /* 取消 */ }
}

async function doArchive(model: ModelListItem) {
  try {
    await ElMessageBox.confirm(`归档后该模型将不可用，确定？`, '确认归档', { type: 'warning' })
    await archiveModel(model.id)
    ElMessage.success('已归档')
    load()
  } catch { /* 取消 */ }
}

watch([page, pageSize], () => load())
onMounted(load)
</script>

<template>
  <div style="padding: 24px">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h2 style="margin: 0; font-size: 20px">数据建模</h2>
      <div style="display: flex; gap: 8px">
        <el-button v-if="userStore.hasOp('warehouse.assets','C')" type="primary" :icon="Plus" @click="goCreate">快速关联</el-button>
      </div>
    </div>

    <!-- 筛选 -->
    <el-card shadow="never" style="margin-bottom: 16px">
      <el-form :inline="true" size="small">
        <el-form-item label="搜索">
          <el-input v-model="keyword" placeholder="模型名称" clearable style="width: 200px" @keyup.enter="(page=1,load())" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 120px" @change="(page=1,load())">
            <el-option label="草稿" value="draft" /><el-option label="已发布" value="published" /><el-option label="已归档" value="archived" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" size="small" @click="(page=1,load())">查询</el-button>
          <el-button :icon="Refresh" size="small" @click="(page=1,keyword='',statusFilter='',load())">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 模型列表 -->
    <el-card shadow="never">
      <el-table v-loading="loading" :data="models" border stripe size="small" empty-text="暂无数据模型">
        <el-table-column prop="name" label="模型名称" min-width="160" />
        <el-table-column label="分层" width="100">
          <template #default="{ row }">{{ LAYER_LABELS[row.warehouse_layer] || row.warehouse_layer }}</template>
        </el-table-column>
        <el-table-column prop="subject_area" label="主题域" width="90" />
        <el-table-column prop="owner_name" label="负责人" width="90" />
        <el-table-column prop="table_count" label="关联表数" width="80" align="center" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="STATUS_TAG[row.status] || 'info'">{{ STATUS_LABELS[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="版本" width="60" align="center">
          <template #default="{ row }">{{ row.version || 1 }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" :icon="View" @click="goEdit(row.id)">编辑</el-button>
            <el-button v-if="userStore.hasOp('warehouse.assets','U')" text size="small" :icon="Lock" @click="openAcl(row)">授权</el-button>
            <el-button v-if="row.status === 'draft' && userStore.hasOp('warehouse.assets','U')" text size="small" :icon="Finished" type="success" @click="doPublish(row)">发布</el-button>
            <el-button v-if="row.status !== 'archived' && userStore.hasOp('warehouse.assets','U')" text size="small" type="warning" @click="doArchive(row)">归档</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="display: flex; justify-content: flex-end; margin-top: 12px">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[20,50,100]" layout="total,sizes,prev,pager,next" />
      </div>
    </el-card>

    <!-- 授权弹窗 -->
    <el-dialog v-model="aclVisible" title="访问授权" width="480px" @close="aclModel = null">
      <template v-if="aclModel">
        <p style="color: #909399; font-size: 13px; margin: 0 0 12px">模型「{{ aclModel.name }}」— 控制谁可以使用此数据集进行建模和预览</p>
        <AclEditor v-model="aclRows" />
      </template>
      <template #footer>
        <el-button @click="aclVisible = false">取消</el-button>
        <el-button type="primary" :loading="aclSaving" @click="saveAcl">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
