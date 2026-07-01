<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ReportViewerPanel from '@/components/report/ReportViewerPanel.vue'

const route = useRoute()
const reportId = computed(() => Number(route.params.id))
</script>

<template>
  <div class="report-run-page">
    <ReportViewerPanel :report-id="reportId" />
  </div>
</template>


<style scoped>
.report-run-page {
  display: flex;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 16px;
}

.report-run-page :deep(.report-view-card) {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
</style>
