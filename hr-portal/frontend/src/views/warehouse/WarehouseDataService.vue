<script setup lang="ts">
import { ref, markRaw } from 'vue'
import WarehouseAds from './WarehouseAds.vue'
import ApiServiceTab from './ApiServiceTab.vue'
import SubscriptionTab from './SubscriptionTab.vue'
import PushTargetList from '@/components/push/PushTargetList.vue'
import ServiceRunLogPanel from '@/components/warehouse/ServiceRunLogPanel.vue'

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
        :class="{ active: activeTab === tab.name }"
        @click="activeTab = tab.name"
      >
        {{ tab.label }}
      </span>
    </div>

    <div v-show="activeTab === 'ads'" class="tab-content">
      <WarehouseAds />
    </div>

    <div v-show="activeTab === 'api'" class="tab-content">
      <ApiServiceTab />
    </div>

    <div v-show="activeTab === 'push'" class="tab-content">
      <div style="padding: 8px">
        <PushTargetList source-table="" :hide-header="false" />
      </div>
    </div>

    <div v-show="activeTab === 'subscribe'" class="tab-content">
      <SubscriptionTab />
    </div>

    <div v-show="activeTab === 'monitor'" class="tab-content">
      <ServiceRunLogPanel :compact="false" />
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
.tab-content { margin: -24px; }
</style>
