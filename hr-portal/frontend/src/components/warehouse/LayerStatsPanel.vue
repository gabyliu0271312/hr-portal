<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getLayerStats } from '@/api/warehouse'
import { WAREHOUSE_LAYER_COLORS, WAREHOUSE_LAYER_LABELS } from '@/constants/warehouseLayers'
import type { LayerStat } from '@/api/warehouse'

const router = useRouter()

const loading = ref(false)
const error = ref('')
const stats = ref<LayerStat[]>([])

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await getLayerStats()
    stats.value = res.items
  } catch {
    error.value = '加载分层统计失败'
  } finally {
    loading.value = false
  }
}

function goToLayer(code: string) {
  router.push(`/warehouse/assets?warehouse_layer=${encodeURIComponent(code)}`)
}

onMounted(load)
</script>

<template>
  <div v-loading="loading">
    <div v-if="error" style="color: #909399; padding: 12px 0; text-align: center">{{ error }}</div>
    <div v-else-if="!stats.length && !loading" style="color: #909399; padding: 12px 0; text-align: center">暂无分层数据</div>
    <el-row v-else :gutter="16">
      <el-col
        v-for="s in stats"
        :key="s.code"
        :xs="12"
        :sm="Math.floor(24 / Math.min(stats.length, 7))"
        style="margin-bottom: 8px"
      >
        <div
          class="layer-stat-item"
          :style="{ cursor: s.count > 0 ? 'pointer' : 'default' }"
          @click="s.count > 0 && goToLayer(s.code)"
        >
          <div class="layer-dot" :style="{ background: WAREHOUSE_LAYER_COLORS[s.code] || '#909399' }" />
          <div class="layer-info">
            <span class="layer-code">{{ s.code }}</span>
            <span class="layer-label">{{ WAREHOUSE_LAYER_LABELS[s.code] || s.code }}</span>
          </div>
          <span class="layer-count">{{ s.count }}</span>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.layer-stat-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--color-border, #e4e7ed);
  border-radius: 4px;
  transition: background 0.2s;
}
.layer-stat-item:hover {
  background: var(--color-fill-light, #f5f7fa);
}
.layer-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-right: 10px;
}
.layer-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.layer-code {
  font-weight: 600;
  font-size: 15px;
  line-height: 1.4;
}
.layer-label {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}
.layer-count {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}
</style>