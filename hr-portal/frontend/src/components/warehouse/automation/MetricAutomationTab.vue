<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getWarehouseFeatures } from '@/api/warehouse'

const featureEnabled = ref(false)
const loading = ref(true)

onMounted(async () => {
  try { const f = await getWarehouseFeatures(); featureEnabled.value = f.metric_automation } catch { }
  finally { loading.value = false }
})
</script>

<template>
  <div>
    <el-alert v-if="!featureEnabled && !loading" type="info" :closable="false" show-icon style="margin-bottom:12px">
      <template #title>指标自动化生成当前未启用</template>
      开启 <code>WAREHOUSE_FEATURE_METRIC_AUTOMATION=true</code> 后，可从指标定义自动生成 DWS/ADS 草稿。
    </el-alert>

    <el-card v-if="featureEnabled" shadow="never">
      <template #header><span style="font-weight:600">指标自动化数仓开发 (X05)</span></template>
      <div style="font-size:13px;color:#606266;line-height:1.8">
        <p><strong>已开放能力：</strong></p>
        <ul>
          <li>指标诊断 — 判断指标是否可自动化生成 DWS/ADS</li>
          <li>DWS 草稿生成 — 从指标定义自动生成聚合定义</li>
          <li>预览与门禁 — 发布前质量/小样本/敏感字段检查</li>
          <li>人工确认发布 — 生产发布必须手动确认</li>
          <li>ADS 消费草稿 — 自动生成 ADS + BI 消费契约</li>
        </ul>
        <p style="margin-top:8px">入口：<strong>指标管理</strong> → 点击指标 → 详情抽屉 →「自动化生成 DWS/ADS」面板</p>
      </div>
    </el-card>
  </div>
</template>
