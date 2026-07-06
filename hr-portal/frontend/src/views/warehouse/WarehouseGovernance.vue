<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { listAssets } from '@/api/warehouse'
import type { Asset } from '@/api/warehouse'
import LayerStatsPanel from '@/components/warehouse/LayerStatsPanel.vue'

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

    <!-- 治理功能入口 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :sm="8" style="margin-bottom: 12px">
        <el-card shadow="hover" class="gov-entry-card" @click="router.push('/warehouse/lineage')">
          <div class="gov-entry-icon" style="color: #409eff">&#8599;</div>
          <div class="gov-entry-title">数据血缘</div>
          <div class="gov-entry-desc">表/字段级上下游依赖追踪</div>
        </el-card>
      </el-col>
      <el-col :sm="8" style="margin-bottom: 12px">
        <el-card shadow="hover" class="gov-entry-card" @click="router.push('/warehouse/quality')">
          <div class="gov-entry-icon" style="color: #e6a23c">&#9888;</div>
          <div class="gov-entry-title">数据质量</div>
          <div class="gov-entry-desc">规则配置、执行与告警</div>
        </el-card>
      </el-col>
      <el-col :sm="8" style="margin-bottom: 12px">
        <el-card shadow="hover" class="gov-entry-card" @click="router.push('/warehouse/monitor')">
          <div class="gov-entry-icon" style="color: #67c23a">&#9783;</div>
          <div class="gov-entry-title">执行监控</div>
          <div class="gov-entry-desc">运行聚合、告警规则</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 分层概览 (Q0107) -->
    <el-card style="margin-bottom: 16px" shadow="never">
      <template #header><span style="font-weight: 600">分层概览</span></template>
      <LayerStatsPanel />
    </el-card>

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
  </div>
</template>

<style scoped>
.gov-entry-card { cursor: pointer; text-align: center; transition: box-shadow .2s; }
.gov-entry-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.12); }
.gov-entry-icon { font-size: 28px; margin-bottom: 8px; }
.gov-entry-title { font-size: 15px; font-weight: 600; color: #303133; margin-bottom: 4px; }
.gov-entry-desc { font-size: 12px; color: #909399; }
.gov-card { text-align: center; }
.gov-num { font-size: 32px; font-weight: 600; color: #303133; }
.gov-label { font-size: 13px; color: #909399; margin-top: 4px; }
.text-warning { color: #e6a23c; }
</style>
