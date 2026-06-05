<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ReportViewerPanel from '@/components/report/ReportViewerPanel.vue'

const route = useRoute()
const reportId = computed(() => Number(route.params.id))
</script>

<template>
  <div style="padding: 24px">
    <ReportViewerPanel :report-id="reportId" />
  </div>
</template>
