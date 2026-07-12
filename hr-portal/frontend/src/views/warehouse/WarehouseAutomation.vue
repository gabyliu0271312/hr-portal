<script setup lang="ts">
import { ref } from 'vue'
import AutomationStatusBar from '@/components/warehouse/automation/AutomationStatusBar.vue'
import OdsDwdAutomationTab from '@/components/warehouse/automation/OdsDwdAutomationTab.vue'
import MetricAutomationTab from '@/components/warehouse/automation/MetricAutomationTab.vue'
import L4PilotTab from '@/components/warehouse/automation/L4PilotTab.vue'
import AutomationAuditTab from '@/components/warehouse/automation/AutomationAuditTab.vue'

const activeTab = ref('ods-dwd')
</script>

<template>
  <div class="automation-page">
    <header class="page-header">
      <h1>数据仓库自动化配置</h1>
    </header>

    <AutomationStatusBar />

    <el-tabs v-model="activeTab">
      <el-tab-pane label="ODS→DWD 自动化" name="ods-dwd">
        <OdsDwdAutomationTab />
      </el-tab-pane>

      <el-tab-pane label="指标自动化" name="metric">
        <MetricAutomationTab />
      </el-tab-pane>

      <el-tab-pane label="L4 全自动试点" name="l4">
        <L4PilotTab />
      </el-tab-pane>

      <el-tab-pane label="运行记录 / 审计" name="audit">
        <AutomationAuditTab />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.automation-page { padding: 20px 24px; max-width: 1400px; }
.page-header { margin-bottom: 12px; }
.page-header h1 { font-size: 20px; font-weight: 600; margin: 0; }
</style>
