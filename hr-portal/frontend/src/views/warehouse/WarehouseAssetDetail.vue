<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Link, Edit, List, DataAnalysis, Connection } from '@element-plus/icons-vue'
import {
  getAsset, updateAsset,
  getUcpRoute,
  UCP_DISABLED_TEXT,
  UCP_NOT_CONNECTED_TEXT,
  type AssetDetail,
} from '@/api/warehouse'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const tableName = route.params.tableName as string

const asset = ref<AssetDetail | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// 编辑模式
const editMode = ref(false)
const editForm = ref({ warehouse_layer: '', subject_area: '', owner_name: '', asset_status: '', description: '' })
const editSaving = ref(false)

const LAYER_OPTIONS = ['ODS', 'DWD', 'DWS', 'ADS']
const LAYER_LABELS: Record<string, string> = { ODS: 'ODS 原始数据层', DWD: 'DWD 明细数据层', DWS: 'DWS 汇总数据层', ADS: 'ADS 应用数据层' }
const STATUS_OPTIONS = ['draft', 'published', 'disabled', 'archived']
const STATUS_LABELS: Record<string, string> = { draft: '草稿', published: '已发布', disabled: '已禁用', archived: '已归档' }

async function load() {
  loading.value = true
  error.value = null
  try {
    asset.value = await getAsset(tableName)
  } catch (e: any) {
    const detail = e?.response?.data?.detail
    if (e?.response?.status === 404) {
      error.value = '资产不存在'
    } else if (e?.response?.status === 403) {
      error.value = '无权限访问该资产'
    } else {
      error.value = typeof detail === 'string' ? detail : '加载失败'
    }
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.back()
}

function handleUcpJump() {
  if (!asset.value) return
  const route = getUcpRoute(asset.value.ucp)
  if (route) {
    router.push(route)
  }
}

function enterEdit() {
  if (!asset.value) return
  editForm.value = {
    warehouse_layer: asset.value.warehouse_layer,
    subject_area: asset.value.subject_area || '',
    owner_name: asset.value.owner_name || '',
    asset_status: asset.value.asset_status,
    description: asset.value.description || '',
  }
  editMode.value = true
}

function cancelEdit() { editMode.value = false }

async function saveEdit() {
  if (!asset.value) return
  editSaving.value = true
  try {
    await updateAsset(tableName, {
      warehouse_layer: editForm.value.warehouse_layer,
      subject_area: editForm.value.subject_area || null,
      owner_name: editForm.value.owner_name || null,
      asset_status: editForm.value.asset_status,
      description: editForm.value.description || null,
    })
    ElMessage.success('保存成功')
    editMode.value = false
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    editSaving.value = false
  }
}

function goFields() { router.push(`/warehouse/assets/${encodeURIComponent(tableName)}/columns`) }
function goPreview() { router.push(`/data/${encodeURIComponent(tableName)}`) }
function goImpact() { router.push(`/warehouse/impact?table=${encodeURIComponent(tableName)}`) }
function goSource() {
  if (asset.value?.source_system && asset.value.source_system !== 'internal') {
    router.push('/datasource/endpoints')
  } else {
    ElMessage.info('当前资产为内部表 / 手工维护，无需配置外部来源')
  }
}

const layerTagType: Record<string, string> = {
  ODS: '',
  DWD: 'success',
  DWS: 'warning',
  ADS: 'danger',
}

const statusTagType: Record<string, string> = {
  draft: 'info',
  published: 'success',
  disabled: 'warning',
  archived: 'info',
}

const qualityTagType: Record<string, string> = {
  unknown: 'info',
  pass: 'success',
  warn: 'warning',
  fail: 'danger',
}

onMounted(load)
</script>

<template>
  <div style="padding: 24px; max-width: 960px">
    <!-- 返回 -->
    <div style="margin-bottom: 16px">
      <el-button text :icon="ArrowLeft" @click="goBack">返回</el-button>
    </div>

    <!-- 加载态 -->
    <el-skeleton v-if="loading" :rows="6" animated />

    <!-- 错误态 -->
    <el-alert
      v-else-if="error"
      type="error"
      :title="error"
      show-icon
      :closable="false"
      style="margin-bottom: 16px"
    />

    <!-- 正常内容 -->
    <template v-else-if="asset">
      <!-- 操作栏 -->
      <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap">
        <el-button v-if="userStore.hasOp('warehouse.assets','U')" size="small" :icon="Edit" :type="editMode ? 'default' : 'primary'" @click="editMode ? cancelEdit() : enterEdit()">
          {{ editMode ? '取消编辑' : '编辑资产' }}
        </el-button>
        <el-button size="small" :icon="List" @click="goFields()">查看字段</el-button>
        <el-button size="small" :icon="DataAnalysis" @click="goPreview()">数据预览</el-button>
        <el-button size="small" :icon="Connection" @click="goImpact()">影响分析</el-button>
        <el-button size="small" :icon="Link" @click="goSource()">来源配置</el-button>
      </div>

      <!-- 基础信息 -->
      <el-card style="margin-bottom: 16px">
        <template #header>
          <span style="font-size: 16px; font-weight: 600">{{ asset.table_label }}</span>
          <span style="color: #909399; margin-left: 12px; font-size: 13px">{{ asset.table_name }}</span>
          <el-tag
            v-if="asset.asset_status"
            :type="statusTagType[asset.asset_status] || 'info'"
            size="small"
            style="margin-left: 12px"
          >
            {{ STATUS_LABELS[asset.asset_status] || asset.asset_status }}
          </el-tag>
        </template>

        <!-- 编辑模式 -->
        <el-form v-if="editMode" label-width="100px" size="small">
          <el-form-item label="描述">
            <el-input v-model="editForm.description" />
          </el-form-item>
          <el-form-item label="分层">
            <el-select v-model="editForm.warehouse_layer" style="width: 100%">
              <el-option v-for="l in LAYER_OPTIONS" :key="l" :label="LAYER_LABELS[l]" :value="l" />
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
              <el-option v-for="s in STATUS_OPTIONS" :key="s" :label="STATUS_LABELS[s]" :value="s" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="editSaving" @click="saveEdit">保存</el-button>
          </el-form-item>
        </el-form>

        <!-- 展示模式 -->
        <el-descriptions v-else :column="2" border size="small">
          <el-descriptions-item label="描述">{{ asset.description || '—' }}</el-descriptions-item>
          <el-descriptions-item label="来源系统">{{ asset.source_system || '—' }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{ asset.owner_name || '—' }}</el-descriptions-item>
          <el-descriptions-item label="字段数">{{ asset.columns_count ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="最近同步">
            {{ asset.last_synced_at ? new Date(asset.last_synced_at).toLocaleString() : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ asset.created_at ? new Date(asset.created_at).toLocaleString() : '—' }}
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 数仓属性 -->
      <el-card style="margin-bottom: 16px">
        <template #header>
          <span style="font-weight: 600">数仓属性</span>
        </template>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="数仓分层">
            <el-tag v-if="asset.warehouse_layer" :type="layerTagType[asset.warehouse_layer] || 'info'" size="small">
              {{ ({ODS:'原始数据(ODS)',DWD:'明细数据(DWD)',DWS:'汇总数据(DWS)',ADS:'应用数据(ADS)'} as Record<string,string>)[asset.warehouse_layer]||asset.warehouse_layer }}
            </el-tag>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="主题域">{{ asset.subject_area || '—' }}</el-descriptions-item>
          <el-descriptions-item label="质量状态">
            <el-tag :type="qualityTagType[asset.last_quality_status] || 'info'" size="small">
              {{ asset.last_quality_status }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="最近质检">
            {{ asset.last_quality_checked_at ? new Date(asset.last_quality_checked_at).toLocaleString() : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="周期字段">{{ asset.period_col || '—' }}</el-descriptions-item>
          <el-descriptions-item label="数据范围策略">{{ asset.scope_strategy || '—' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- UCP 协同状态 -->
      <el-card style="margin-bottom: 16px">
        <template #header>
          <span style="font-weight: 600">数据连接平台（UCP）</span>
        </template>

        <!-- UCP 未启用 -->
        <el-alert
          v-if="!asset.ucp.enabled"
          type="info"
          :title="UCP_DISABLED_TEXT"
          :description="'当前分支未部署 UCP 模块，数据连接能力暂不可用。'"
          show-icon
          :closable="false"
        />

        <!-- UCP 已启用但未关联 -->
        <el-alert
          v-else-if="!asset.ucp.resource_id"
          type="info"
          :title="UCP_NOT_CONNECTED_TEXT"
          description="该资产尚未关联 UCP 数据资源。"
          show-icon
          :closable="false"
        />

        <!-- UCP 已启用且已关联 -->
        <template v-else>
          <el-descriptions :column="2" border size="small" style="margin-bottom: 12px">
            <el-descriptions-item label="系统 ID">{{ asset.ucp.system_id ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="资源 ID">{{ asset.ucp.resource_id ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="连接器配置 ID">{{ asset.ucp.connector_config_id ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="跳转路由">{{ asset.ucp.config_route ?? '—' }}</el-descriptions-item>
          </el-descriptions>
          <el-button type="primary" :icon="Link" @click="handleUcpJump">
            前往 UCP 查看资源详情
          </el-button>
        </template>
      </el-card>
    </template>
  </div>
</template>
