<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Refresh, View, Edit, DataAnalysis, Connection, Link, List, ArrowDown } from '@element-plus/icons-vue'
import { listAssets, updateAsset, type Asset } from '@/api/warehouse'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const canEditAsset = () => userStore.hasOp('warehouse.assets', 'U')

// 列表
const assets = ref<Asset[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

// 筛选
const filters = ref({
  keyword: '',
  warehouse_layer: '',
  subject_area: '',
  source_system: '',
  asset_status: '',
})

// 编辑弹窗
const editVisible = ref(false)
const editAsset = ref<Asset | null>(null)
const editForm = ref({ warehouse_layer: '', subject_area: '', owner_name: '', asset_status: '' })
const editSaving = ref(false)

// 质量状态筛选
const qualityFilter = ref('')

// 筛选选项
const layerOptions = ['', 'ODS', 'DWD', 'DWS', 'ADS']
const statusOptions = ['', 'draft', 'published', 'disabled', 'archived']

const LAYER_LABELS: Record<string, string> = { ODS: 'ODS 原始数据', DWD: 'DWD 明细数据', DWS: 'DWS 汇总数据', ADS: 'ADS 应用数据' }
const STATUS_LABELS: Record<string, string> = { draft: '草稿', published: '已发布', disabled: '已禁用', archived: '已归档' }
const QUALITY_LABELS: Record<string, string> = { unknown: '未知', pass: '通过', warn: '告警', fail: '失败' }
const LAYER_TAG: Record<string, string> = { ODS: '', DWD: 'success', DWS: 'warning', ADS: 'danger' }
const STATUS_TAG: Record<string, string> = { draft: 'info', published: 'success', disabled: 'warning', archived: 'info' }
const QUALITY_TAG: Record<string, string> = { unknown: 'info', pass: 'success', warn: 'warning', fail: 'danger' }

async function load() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: qualityFilter.value ? 1 : page.value,
      page_size: qualityFilter.value ? 200 : pageSize.value,
    }
    if (filters.value.keyword) params.keyword = filters.value.keyword
    if (filters.value.warehouse_layer) params.warehouse_layer = filters.value.warehouse_layer
    if (filters.value.subject_area) params.subject_area = filters.value.subject_area
    if (filters.value.source_system) params.source_system = filters.value.source_system
    if (filters.value.asset_status) params.asset_status = filters.value.asset_status
    const res = await listAssets(params)
    if (qualityFilter.value) {
      const filtered = res.items.filter((a: Asset) => a.last_quality_status === qualityFilter.value)
      total.value = filtered.length
      const start = (page.value - 1) * pageSize.value
      assets.value = filtered.slice(start, start + pageSize.value)
    } else {
      assets.value = res.items
      total.value = res.total
    }
  } catch {
    ElMessage.error('加载资产列表失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() { page.value = 1; load() }
function handleReset() {
  filters.value = { keyword: '', warehouse_layer: '', subject_area: '', source_system: '', asset_status: '' }
  qualityFilter.value = ''
  page.value = 1
  load()
}

// 详情跳转
function goDetail(tableName: string) { router.push(`/warehouse/assets/${encodeURIComponent(tableName)}`) }

// 字段入口
function goFields(tableName: string) { router.push(`/warehouse/assets/${encodeURIComponent(tableName)}/columns`) }

// 预览 → 跳转 DataView
function goPreview(tableName: string) { router.push(`/data/${encodeURIComponent(tableName)}`) }

// 影响分析
function goImpact(tableName: string) { router.push(`/warehouse/impact?table=${encodeURIComponent(tableName)}`) }

// 来源配置
function goSource(asset: Asset) {
  if (asset.source_system && asset.source_system !== 'internal') {
    router.push('/datasource/endpoints')
  } else {
    ElMessage.info('当前资产为内部表 / 手工维护，无需配置外部来源')
  }
}

// 编辑
function openEdit(asset: Asset) {
  editAsset.value = asset
  editForm.value = {
    warehouse_layer: asset.warehouse_layer,
    subject_area: asset.subject_area || '',
    owner_name: asset.owner_name || '',
    asset_status: asset.asset_status,
  }
  editVisible.value = true
}

async function saveEdit() {
  if (!editAsset.value) return
  editSaving.value = true
  try {
    await updateAsset(editAsset.value.table_name, {
      warehouse_layer: editForm.value.warehouse_layer,
      subject_area: editForm.value.subject_area || null,
      owner_name: editForm.value.owner_name || null,
      asset_status: editForm.value.asset_status,
    })
    ElMessage.success('保存成功')
    editVisible.value = false
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    editSaving.value = false
  }
}

watch([page, pageSize], () => load())
onMounted(load)
</script>

<template>
  <div class="warehouse-assets">
    <div class="page-header">
      <h2>数据资产</h2>
    </div>

    <!-- 筛选栏 -->
    <el-card style="margin-bottom: 16px" shadow="never">
      <el-form :inline="true" size="small" @submit.prevent="handleSearch">
        <el-form-item label="搜索">
          <el-input v-model="filters.keyword" placeholder="表名 / 显示名 / 描述" clearable style="width: 200px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="分层">
          <el-select v-model="filters.warehouse_layer" clearable placeholder="全部" style="width: 140px" @change="handleSearch">
            <el-option v-for="l in layerOptions" :key="l" :label="l ? LAYER_LABELS[l] : '全部'" :value="l" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.asset_status" clearable placeholder="全部" style="width: 120px" @change="handleSearch">
            <el-option v-for="s in statusOptions" :key="s" :label="s ? STATUS_LABELS[s] : '全部'" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="质量">
          <el-select v-model="qualityFilter" clearable placeholder="全部" style="width: 110px" @change="load">
            <el-option label="通过" value="pass" />
            <el-option label="告警" value="warn" />
            <el-option label="失败" value="fail" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格 -->
    <el-card shadow="never">
      <el-table v-loading="loading" :data="assets" border stripe size="small" empty-text="暂无数据资产">
        <el-table-column prop="table_name" label="表名" min-width="160" show-overflow-tooltip />
        <el-table-column prop="table_label" label="显示名" min-width="130" show-overflow-tooltip />
        <el-table-column prop="warehouse_layer" label="分层" width="140">
          <template #default="{ row }">
            <el-tag size="small" :type="LAYER_TAG[row.warehouse_layer] || 'info'">
              {{ LAYER_LABELS[row.warehouse_layer] || row.warehouse_layer }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="subject_area" label="主题域" width="90" show-overflow-tooltip />
        <el-table-column prop="source_system" label="来源" width="80" show-overflow-tooltip />
        <el-table-column prop="owner_name" label="负责人" width="90" />
        <el-table-column prop="columns_count" label="字段数" width="70" align="center" />
        <el-table-column prop="last_quality_status" label="质量" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="QUALITY_TAG[row.last_quality_status] || 'info'">
              {{ QUALITY_LABELS[row.last_quality_status] || row.last_quality_status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="asset_status" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="STATUS_TAG[row.asset_status] || 'info'">
              {{ STATUS_LABELS[row.asset_status] || row.asset_status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" :icon="View" @click="goDetail(row.table_name)">详情</el-button>
            <el-button text size="small" :icon="List" @click="goFields(row.table_name)">字段</el-button>
            <el-button v-if="canEditAsset()" text size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-dropdown trigger="click" style="margin-left: 4px">
              <el-button text size="small">更多<el-icon style="margin-left: 2px"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :icon="DataAnalysis" @click="goPreview(row.table_name)">预览</el-dropdown-item>
                  <el-dropdown-item :icon="Connection" @click="goImpact(row.table_name)">影响分析</el-dropdown-item>
                  <el-dropdown-item :icon="Link" @click="goSource(row)">来源配置</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <div style="display: flex; justify-content: flex-end; margin-top: 12px">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
        />
      </div>
    </el-card>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editVisible" title="编辑资产" width="480px" @close="editAsset = null">
      <el-form v-if="editAsset" label-width="80px" size="small" @submit.prevent="saveEdit">
        <el-form-item label="表名">
          <el-input :model-value="editAsset.table_name" disabled />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input :model-value="editAsset.table_label" disabled />
        </el-form-item>
        <el-form-item label="分层">
          <el-select v-model="editForm.warehouse_layer" style="width: 100%">
            <el-option v-for="l in layerOptions.slice(1)" :key="l" :label="LAYER_LABELS[l]" :value="l" />
          </el-select>
        </el-form-item>
        <el-form-item label="主题域">
          <el-input v-model="editForm.subject_area" placeholder="如：员工、薪酬" />
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="editForm.owner_name" placeholder="负责人姓名" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.asset_status" style="width: 100%">
            <el-option v-for="s in statusOptions.slice(1)" :key="s" :label="STATUS_LABELS[s]" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.warehouse-assets {
  padding: 24px;
}
.page-header {
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
}
</style>
