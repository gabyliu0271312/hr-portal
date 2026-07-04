<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Connection } from '@element-plus/icons-vue'
import { listAssets } from '@/api/warehouse'
import type { Asset } from '@/api/warehouse'

const router = useRouter()
const loading = ref(false)

// 治理卡片数据
const noLayer = ref<Asset[]>([])
const noOwner = ref<Asset[]>([])
const qualityFail = ref<Asset[]>([])

async function load() {
  loading.value = true
  try {
    const res = await listAssets({ page_size: 200 })
    const all = res.items
    noLayer.value = all.filter((a: Asset) => !a.warehouse_layer)
    noOwner.value = all.filter((a: Asset) => !a.owner_name)
    qualityFail.value = all.filter((a: Asset) => a.last_quality_status === 'fail' || a.last_quality_status === 'warn')
  } catch {
    ElMessage.error('加载治理数据失败')
  }
  finally { loading.value = false }
}

function goImpact(tableName: string) { router.push(`/warehouse/impact?table=${encodeURIComponent(tableName)}`) }

onMounted(load)
</script>

<template>
  <div style="padding: 24px; max-width: 1000px; margin: 0 auto">
    <h2 style="margin: 0 0 16px; font-size: 20px">数据治理</h2>

    <el-row :gutter="16" v-loading="loading" style="margin-bottom: 16px">
      <el-col :sm="8" style="margin-bottom: 12px">
        <el-card shadow="hover" class="gov-card">
          <div class="gov-num">{{ noLayer.length }}</div>
          <div class="gov-label">未设置分层</div>
          <div v-if="noLayer.length" style="margin-top: 8px">
            <el-tag v-for="a in noLayer.slice(0,5)" :key="a.table_name" size="small" style="margin: 2px">{{ a.table_label }}</el-tag>
            <div v-if="noLayer.length>5" style="font-size:12px;color:#909399;margin-top:4px">... 等{{ noLayer.length }}项</div>
          </div>
        </el-card>
      </el-col>
      <el-col :sm="8" style="margin-bottom: 12px">
        <el-card shadow="hover" class="gov-card">
          <div class="gov-num">{{ noOwner.length }}</div>
          <div class="gov-label">未设置负责人</div>
          <div v-if="noOwner.length" style="margin-top: 8px">
            <el-tag v-for="a in noOwner.slice(0,5)" :key="a.table_name" size="small" style="margin: 2px">{{ a.table_label }}</el-tag>
            <div v-if="noOwner.length>5" style="font-size:12px;color:#909399;margin-top:4px">... 等{{ noOwner.length }}项</div>
          </div>
        </el-card>
      </el-col>
      <el-col :sm="8" style="margin-bottom: 12px">
        <el-card shadow="hover" class="gov-card" :style="{ borderLeft: qualityFail.length ? '3px solid #e6a23c' : '' }">
          <div class="gov-num" :class="{ 'text-warning': qualityFail.length }">{{ qualityFail.length }}</div>
          <div class="gov-label">质量异常</div>
          <div v-if="qualityFail.length" style="margin-top: 8px">
            <el-tag v-for="a in qualityFail.slice(0,5)" :key="a.table_name" size="small" type="warning" style="margin: 2px">{{ a.table_label }}</el-tag>
            <div v-if="qualityFail.length>5" style="font-size:12px;color:#909399;margin-top:4px">... 等{{ qualityFail.length }}项</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never">
      <template #header><span style="font-weight: 600">快捷操作</span></template>
      <el-button :icon="Connection" @click="router.push('/warehouse/impact')" style="margin-right: 8px">影响分析</el-button>
      <el-button @click="router.push('/warehouse/assets')">数据资产</el-button>
    </el-card>
  </div>
</template>

<style scoped>
.gov-card { text-align: center; }
.gov-num { font-size: 32px; font-weight: 600; color: #303133; }
.gov-label { font-size: 13px; color: #909399; margin-top: 4px; }
.text-warning { color: #e6a23c; }
</style>
