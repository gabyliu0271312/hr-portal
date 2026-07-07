<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import WarehouseAds from './WarehouseAds.vue'

const router = useRouter()

const tabs = [
  { name: 'ads', label: '消费资产' },
  { name: 'api', label: 'API 服务' },
  { name: 'push', label: '数据推送' },
  { name: 'subscribe', label: '订阅管理' },
  { name: 'monitor', label: '服务监控' },
]
const activeTab = ref('ads')
</script>

<template>
  <div style="padding: 24px">
    <div class="tab-bar">
      <span
        v-for="tab in tabs"
        :key="tab.name"
        class="tab-item"
        :class="{ active: activeTab === tab.name, disabled: tab.name !== 'ads' }"
        @click="activeTab = tab.name"
      >
        {{ tab.label }}
        <el-tag v-if="tab.name !== 'ads'" size="small" type="info" style="margin-left: 4px">规划中</el-tag>
      </span>
    </div>

    <div v-show="activeTab === 'ads'" class="tab-content">
      <WarehouseAds />
    </div>

    <div v-show="activeTab !== 'ads'" style="text-align: center; padding: 80px; color: #909399">
      <p style="font-size: 16px">{{ tabs.find(t => t.name === activeTab)?.label }} — 功能规划中</p>
      <p style="font-size: 13px; margin-top: 8px">后续将支持 DWD/DWS/指标/ADS 的 API 暴露、数据推送和订阅管理</p>
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
.tab-item:hover { color: var(--color-primary, #409eff); }
.tab-item.active {
  color: var(--color-primary, #409eff);
  border-bottom-color: var(--color-primary, #409eff);
  font-weight: 500;
}
.tab-item.disabled { color: #c0c4cc; cursor: not-allowed; }
.tab-item.disabled:hover { color: #c0c4cc; }
.tab-content { margin: -24px; }
</style>
