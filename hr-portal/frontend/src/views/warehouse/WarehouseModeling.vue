<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, View, Edit, VideoPlay, Finished, Lock } from '@element-plus/icons-vue'
import { listModels, publishModel, archiveModel, buildDataset, type ModelListItem } from '@/api/warehouse'
import { api } from '@/api/client'
import { datasetsApi } from '@/api/datasets'
import AclEditor, { type AclRow } from '@/components/AclEditor.vue'
import { useUserStore } from '@/stores/user'
import WarehouseDimension from './WarehouseDimension.vue'
import WarehouseDwsAggregate from './WarehouseDwsAggregate.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

/** tabs: activeTab 支持从 query 参数恢复 */
const tabs = [
  { name: 'recipe', label: '数据加工' },
  { name: 'modeling', label: '数据建模' },
  { name: 'dimensions', label: '维度管理' },
  { name: 'dws', label: '汇总视图' },
  { name: 'snapshots', label: '快照管理' },
]
const activeTab = ref('modeling')

// 从 URL query 恢复 tab 状态
const routeTab = computed(() => (route.query.tab as string) || 'modeling')
watch(routeTab, (v) => { if (tabs.some(t => t.name === v)) activeTab.value = v }, { immediate: true })

function onTabChange(name: string) {
  if (name === 'recipe') { router.push('/warehouse/data-recipe'); return }
  if (name === 'snapshots') { router.push('/warehouse/snapshots'); return }
  activeTab.value = name
  router.replace({ query: { tab: name === 'modeling' ? undefined : name } })
}

// ---- 数据建模 tab（原有逻辑） ----
const models = ref<ModelListItem[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const statusFilter = ref('')

const aclVisible = ref(false)
const aclModel = ref<ModelListItem | null>(null)
const aclRows = ref<AclRow[]>([])
const aclSaving = ref(false)

const STATUS_LABELS: Record<string, string> = { draft: '草稿', published: '已发布', archived: '已归档' }
const STATUS_TAG: Record<string, string> = { draft: 'info', published: 'success', archived: 'info' }
const LAYER_LABELS: Record<string, string> = { ODS: 'ODS', DWD: 'DWD', DWS: 'DWS', ADS: 'ADS' }
const REFRESH_LABELS: Record<string, string> = { manual: '手动', full: '全量', incremental: '增量' }
const REFRESH_HINTS: Record<string, string> = {
  manual: '手动触发构建，每次全量重建',
  full: '定时或手动触发，每次全量重建（DROP → CREATE）',
  incremental: '基于表中时间字段，仅追加新数据。无时间字段时自动降级为全量',
}

const refreshStrategies = ref<Record<number, string>>({})
const strategyLoading = ref<Set<number>>(new Set())
const buildingIds = ref<Set<number>>(new Set())
const buildStatuses = ref<Record<number, { status: string; msg?: string }>>({})

async function loadStrategy(datasetId: number) {
  try {
    const res = await api.get(`/warehouse/datasets/${datasetId}/refresh-strategy`)
    refreshStrategies.value[datasetId] = res.data.refresh_strategy
  } catch { /* ignore */ }
}

async function changeStrategy(datasetId: number, strategy: string) {
  if (strategyLoading.value.has(datasetId)) return
  strategyLoading.value.add(datasetId)
  try {
    await api.patch(`/warehouse/datasets/${datasetId}/refresh-strategy`, { refresh_strategy: strategy })
    refreshStrategies.value[datasetId] = strategy
    ElMessage.success('刷新策略已更新')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '更新失败')
  } finally { strategyLoading.value.delete(datasetId) }
}

async function loadWithStrategies() {
  await load()
  for (const m of models.value) loadStrategy(m.id)
}

async function doBuild(model: ModelListItem) {
  const id = model.id
  buildingIds.value.add(id)
  buildStatuses.value[id] = { status: 'running' }
  try {
    const result = await buildDataset(id)
    buildStatuses.value[id] = {
      status: result.status,
      msg: result.status === 'success' ? `输出 ${result.row_count ?? '?'} 行` : (result.error_message || '构建失败'),
    }
    if (result.status === 'success') ElMessage.success(`模型「${model.name}」构建完成`)
    else ElMessage.error(buildStatuses.value[id].msg || '构建失败')
  } catch (e: any) {
    buildStatuses.value[id] = { status: 'failed', msg: e?.response?.data?.detail || '构建请求失败' }
    ElMessage.error(buildStatuses.value[id].msg || '构建失败')
  } finally { buildingIds.value.delete(id) }
}

async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: page.value, page_size: pageSize.value }
    if (keyword.value) params.keyword = keyword.value
    if (statusFilter.value) params.status = statusFilter.value
    const res = await listModels(params)
    models.value = res.items
    total.value = res.total
  } catch { ElMessage.error('加载模型列表失败') }
  finally { loading.value = false }
}

function goCreate() { router.push('/warehouse/modeling/visual') }
function goEdit(id: number) { router.push(`/warehouse/modeling/visual/${id}`) }

async function openAcl(model: ModelListItem) {
  aclModel.value = model
  aclRows.value = []
  try {
    const detail = await datasetsApi.get(model.id)
    aclRows.value = (detail as any).acl?.map((a: any) => ({ id: a.id, role_id: a.role_id, user_id: a.user_id })) || []
  } catch { aclRows.value = [] }
  aclVisible.value = true
}

async function saveAcl() {
  if (!aclModel.value) return
  aclSaving.value = true
  try {
    await datasetsApi.update(aclModel.value.id, { acl: aclRows.value } as any)
    ElMessage.success('授权已保存')
    aclVisible.value = false
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
  finally { aclSaving.value = false }
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

watch([page, pageSize], () => loadWithStrategies())
onMounted(loadWithStrategies)
</script>

<template>
  <div style="padding: 24px">
    <!-- 自定义 Tab 导航 -->
    <div class="tab-bar">
      <span
        v-for="tab in tabs"
        :key="tab.name"
        class="tab-item"
        :class="{ active: activeTab === tab.name }"
        @click="onTabChange(tab.name)"
      >{{ tab.label }}</span>
    </div>

    <!-- Tab 1: 数据建模 -->
    <div v-show="activeTab === 'modeling'">
      <div style="display: flex; justify-content: flex-end; align-items: center; margin-bottom: 16px">
        <el-button v-if="userStore.hasOp('warehouse.assets','C')" type="primary" :icon="Plus" @click="goCreate">快速关联</el-button>
      </div>
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
          <el-table-column label="刷新策略" width="120" align="center">
            <template #default="{ row }">
              <el-tooltip :content="REFRESH_HINTS[refreshStrategies[row.id] || 'manual']" placement="top">
                <el-select
                  v-if="row.status === 'published'"
                  v-model="refreshStrategies[row.id]"
                  size="small"
                  @change="(v: string) => changeStrategy(row.id, v)"
                  :loading="strategyLoading.has(row.id)"
                >
                  <el-option label="手动" value="manual" />
                  <el-option label="全量" value="full" />
                  <el-option label="增量" value="incremental" />
                </el-select>
                <el-tag v-else size="small" type="info">{{ REFRESH_LABELS[refreshStrategies[row.id]] || '手动' }}</el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="版本" width="60" align="center">
            <template #default="{ row }">{{ row.version || 1 }}</template>
          </el-table-column>
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <el-button text size="small" :icon="View" @click="goEdit(row.id)">编辑</el-button>
              <el-button v-if="userStore.hasOp('warehouse.assets','U')" text size="small" :icon="Lock" @click="openAcl(row)">授权</el-button>
              <el-tooltip
                v-if="row.status === 'published'"
                :content="buildStatuses[row.id]?.status === 'failed' ? buildStatuses[row.id]?.msg : buildStatuses[row.id]?.status === 'success' ? buildStatuses[row.id]?.msg : ''"
                :disabled="!buildStatuses[row.id] || buildStatuses[row.id]?.status === 'running'"
                placement="top"
              >
                <el-button
                  text size="small" :icon="VideoPlay"
                  :type="buildStatuses[row.id]?.status === 'success' ? 'success' : buildStatuses[row.id]?.status === 'failed' ? 'danger' : 'primary'"
                  :loading="buildingIds.has(row.id)"
                  @click="doBuild(row)"
                >构建</el-button>
              </el-tooltip>
              <el-button v-else-if="row.status === 'draft' && userStore.hasOp('warehouse.assets','U')" text size="small" :icon="Finished" type="success" @click="doPublish(row)">发布</el-button>
              <el-button v-if="row.status !== 'archived' && userStore.hasOp('warehouse.assets','U')" text size="small" type="warning" @click="doArchive(row)">归档</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div style="display: flex; justify-content: flex-end; margin-top: 12px">
          <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[20,50,100]" layout="total,sizes,prev,pager,next" />
        </div>
      </el-card>

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

    <!-- Tab 2: 维度管理 -->
    <div v-show="activeTab === 'dimensions'" class="tab-content">
      <WarehouseDimension />
    </div>

    <!-- Tab 3: 汇总视图 -->
    <div v-show="activeTab === 'dws'" class="tab-content">
      <WarehouseDwsAggregate />
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #e4e7ed;
  margin-bottom: 20px;
}
.tab-item {
  padding: 10px 20px;
  font-size: 14px;
  color: #606266;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
  user-select: none;
}
.tab-item:hover {
  color: var(--color-primary, #409eff);
}
.tab-item.active {
  color: var(--color-primary, #409eff);
  border-bottom-color: var(--color-primary, #409eff);
  font-weight: 500;
}
.tab-content {
  /* 子页面自带 padding，这里抵消外层 padding 避免双倍 */
  margin: -24px;
}
</style>
