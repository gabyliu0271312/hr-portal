<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, View, Edit, VideoPlay, Finished } from '@element-plus/icons-vue'
import { listModels, publishModel, archiveModel, type ModelListItem } from '@/api/warehouse'
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
          <el-button type="primary" :icon="Search" @click="(page=1,load())">查询</el-button>
          <el-button :icon="Refresh" @click="(keyword='',statusFilter='',page=1,load())">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格 -->
    <el-card shadow="never">
      <el-table v-loading="loading" :data="models" border stripe size="small" empty-text="暂无数据模型">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="warehouse_layer" label="分层" width="80">
          <template #default="{ row }">{{ LAYER_LABELS[row.warehouse_layer] || row.warehouse_layer }}</template>
        </el-table-column>
        <el-table-column prop="subject_area" label="主题域" width="90" />
        <el-table-column prop="owner_name" label="负责人" width="80" />
        <el-table-column prop="table_count" label="表数" width="60" align="center" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="STATUS_TAG[row.status] || 'info'">{{ STATUS_LABELS[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="published_at" label="发布时间" width="140">
          <template #default="{ row }">{{ row.published_at ? new Date(row.published_at).toLocaleString() : '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" :icon="Edit" @click="goEdit(row.id)">编辑</el-button>
            <el-button v-if="row.status==='draft'&&userStore.hasOp('warehouse.assets','U')" text size="small" type="success" :icon="Finished" @click="doPublish(row)">发布</el-button>
            <el-button v-if="row.status==='published'&&userStore.hasOp('warehouse.assets','D')" text size="small" type="warning" :icon="VideoPlay" @click="doArchive(row)">归档</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="display: flex; justify-content: flex-end; margin-top: 12px">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[20,50,100]" layout="total,sizes,prev,pager,next" />
      </div>
    </el-card>
  </div>
</template>
