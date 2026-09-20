<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FullScreenModal from '@/components/performance/FullScreenModal.vue'
import PerformanceContentSurface from '@/components/performance/PerformanceContentSurface.vue'
import PerformanceHrbpPermissionTable from '@/components/performance/PerformanceHrbpPermissionTable.vue'
import PerformanceHrbpScopeSummary from '@/components/performance/PerformanceHrbpScopeSummary.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'

const route = useRoute()
const router = useRouter()
const rows = ref([])
const selectedRows = ref<unknown[]>([])
const page = ref(1)
const pageSize = ref(10)
const tabs = [
  { key: 'auth-list', label: '本周期负责的部门和不可见人员' },
  { key: 'history', label: '变更记录' },
]
const activeTab = computed({
  get: () => route.query.activeKey === 'history' ? 'history' : 'auth-list',
  set: (value: string) => {
    void router.replace({ query: { ...route.query, activeKey: value } })
  },
})

function goBack() {
  void router.push({ name: 'PerformanceCycles' })
}
</script>

<template>
  <FullScreenModal title="HRBP 权限管理" :show-footer="false" @back="goBack">
    <div class="hrbp-permission-page">
      <PerformanceHrbpScopeSummary />
      <PerformanceContentSurface class="hrbp-permission-panel">
        <PerformanceLineTabs v-model="activeTab" :tabs="tabs">
          <PerformanceHrbpPermissionTable
            v-if="activeTab === 'auth-list'"
            :rows="rows"
            :page="page"
            :page-size="pageSize"
            :total="rows.length"
            @selection-change="selectedRows = $event"
            @page-change="page = $event"
            @page-size-change="pageSize = $event"
          />
          <section v-else class="history-panel" aria-label="变更记录"></section>
        </PerformanceLineTabs>
      </PerformanceContentSurface>
    </div>
  </FullScreenModal>
</template>

<style scoped>
.hrbp-permission-page { width: 100%; min-width: 0; min-height: 100%; padding: 24px; box-sizing: border-box; overflow: auto; background: #f5f6f7; }
.hrbp-permission-panel { min-height: calc(100vh - 248px); box-shadow: none; --performance-line-tabs-surface: #fff; }
.history-panel { min-height: 96px; }
</style>
