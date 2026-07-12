<template>
  <div class="data-access-index">
    <!-- 顶部标题 + 系统选择器 -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">{{ currentSystemLabel }}</h2>
        <span class="page-subtitle" v-if="activeTab !== 'systems'">
          {{ tabSubtitles[activeTab] }}
        </span>
      </div>
      <div class="header-right">
        <el-button v-if="activeTab !== 'systems'" link @click="goSystems">
          <el-icon><ArrowLeft /></el-icon>返回系统视图
        </el-button>
      </div>
    </div>

    <!-- 页内 Tab -->
    <el-tabs v-model="activeTab" class="da-tabs">
      <el-tab-pane label="接入系统" name="systems" />
      <el-tab-pane label="事件中心" name="events" />
      <el-tab-pane label="流水线" name="pipelines" />
      <el-tab-pane label="监控中心" name="monitor" />
    </el-tabs>

    <!-- Tab 内容 -->
    <div class="tab-content">
      <SystemsTabView
        v-if="activeTab === 'systems'"
        @open-system="openSystem"
      />
      <EventsTabView
        v-else-if="activeTab === 'events'"
        :current-system-code="currentSystemCode"
        @change-system="changeSystem"
      />
      <PipelinesTabView
        v-else-if="activeTab === 'pipelines'"
        :current-system-code="currentSystemCode"
        @change-system="changeSystem"
      />
      <MonitorTabView
        v-else-if="activeTab === 'monitor'"
        :current-system-code="currentSystemCode"
        @change-system="changeSystem"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import SystemsTabView from './tabs/SystemsTabView.vue'
import EventsTabView from './tabs/EventsTabView.vue'
import PipelinesTabView from './tabs/PipelinesTabView.vue'
import MonitorTabView from './tabs/MonitorTabView.vue'

const route = useRoute()
const router = useRouter()

type TabName = 'systems' | 'events' | 'pipelines' | 'monitor'
const activeTab = ref<TabName>(((route.query.tab as string) || 'systems') as TabName)

const currentSystemCode = computed(() => (route.query.system as string) || '')

const currentSystemLabel = computed(() => {
  if (activeTab.value === 'systems') return '接入系统'
  return currentSystemCode.value ? `系统：${currentSystemCode.value}` : '数据接入'
})

const tabSubtitles: Record<TabName, string> = {
  systems: '',
  events: '事件总线 / 触发器 / 死信队列',
  pipelines: '流水线管理 / 流水线编排',
  monitor: '运行监控 / 外部账号 / 审批 / OA 同步',
}

watch(
  () => route.query,
  (q) => {
    if (q.tab) activeTab.value = (q.tab as TabName) || 'systems'
  }
)

function goSystems() {
  router.push({ name: 'UcpIndex', query: { tab: 'systems' } })
}

function openSystem(systemCode: string, subTab: TabName = 'events') {
  activeTab.value = subTab
  router.push({ name: 'UcpIndex', query: { tab: subTab, system: systemCode } })
}

function changeSystem(systemCode: string) {
  router.replace({ query: { ...route.query, system: systemCode } })
}
</script>

<style scoped>
.data-access-index {
  padding: 20px 24px;
  min-height: 100%;
  background: #f5f7fa;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.page-title {
  font-size: 22px;
  font-weight: 600;
  color: #1f2329;
  margin: 0;
}
.page-subtitle {
  font-size: 13px;
  color: #8f959e;
}

.da-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 500;
  padding: 0 20px;
}
.da-tabs :deep(.el-tabs__active-bar) {
  height: 2px;
}

.tab-content {
  margin-top: 20px;
}
</style>
