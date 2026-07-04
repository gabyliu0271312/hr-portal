<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { listAssets, listModels, impactTable, impactField, impactModel, type Asset, type ModelListItem, type ImpactResult, type ImpactRef } from '@/api/warehouse'

const route = useRoute()

// 三个分析 tab
const activeTab = ref<'table'|'field'|'model'>('table')

// 表分析
const tableOptions = ref<Asset[]>([])
const tableName = ref(route.query.table as string || '')
const tableLoading = ref(false)
const tableResult = ref<ImpactResult | null>(null)

// 字段分析
const fieldTableName = ref('')
const fieldColumnCode = ref('')
const fieldLoading = ref(false)
const fieldResult = ref<ImpactResult | null>(null)

// 模型分析
const modelOptions = ref<ModelListItem[]>([])
const modelId = ref<number | null>(null)
const modelLoading = ref(false)
const modelResult = ref<ImpactResult | null>(null)

async function loadTableOptions() {
  try { tableOptions.value = (await listAssets({ page_size: 200 })).items } catch { ElMessage.error('加载表列表失败') }
}
async function loadModelOptions() {
  try { modelOptions.value = (await listModels({ page_size: 200 })).items } catch { ElMessage.error('加载模型列表失败') }
}
loadTableOptions(); loadModelOptions()

async function doTableImpact() {
  if (!tableName.value) return
  tableLoading.value = true
  try { tableResult.value = await impactTable(tableName.value) }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '分析失败') }
  finally { tableLoading.value = false }
}

async function doFieldImpact() {
  if (!fieldTableName.value || !fieldColumnCode.value) return
  fieldLoading.value = true
  try { fieldResult.value = await impactField(fieldTableName.value, fieldColumnCode.value) }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '分析失败') }
  finally { fieldLoading.value = false }
}

async function doModelImpact() {
  if (!modelId.value) return
  modelLoading.value = true
  try { modelResult.value = await impactModel(modelId.value) }
  catch (e: any) { ElMessage.error(e?.response?.data?.detail || '分析失败') }
  finally { modelLoading.value = false }
}

function refsForTab(): ImpactRef[] {
  if (activeTab.value === 'table') return tableResult.value?.references || []
  if (activeTab.value === 'field') return fieldResult.value?.references || []
  return modelResult.value?.references || []
}

function blockingForTab(): boolean {
  if (activeTab.value === 'table') return tableResult.value?.blocking || false
  if (activeTab.value === 'field') return fieldResult.value?.blocking || false
  return modelResult.value?.blocking || false
}

const riskTag: Record<string, string> = { low: 'success', medium: 'warning', high: 'danger' }
const refTypeLabel: Record<string, string> = { dataset: '数据集', report: '报表', metric: '指标', notification: '通知' }

// 页加载时如果有 query 参数，直接查
if (tableName.value) doTableImpact()
</script>

<template>
  <div style="padding: 24px; max-width: 1000px; margin: 0 auto">
    <h2 style="margin: 0 0 16px; font-size: 20px">影响分析</h2>

    <el-tabs v-model="activeTab">
      <!-- 表分析 -->
      <el-tab-pane label="表影响分析" name="table">
        <el-card shadow="never">
          <el-form :inline="true" size="small">
            <el-form-item label="选择表">
              <el-select v-model="tableName" filterable placeholder="搜索资产表" style="width: 280px">
                <el-option v-for="a in tableOptions" :key="a.table_name" :label="`${a.table_label} (${a.table_name})`" :value="a.table_name" />
              </el-select>
            </el-form-item>
            <el-form-item><el-button type="primary" :icon="Search" :loading="tableLoading" @click="doTableImpact">分析</el-button></el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- 字段分析 -->
      <el-tab-pane label="字段影响分析" name="field">
        <el-card shadow="never">
          <el-form :inline="true" size="small">
            <el-form-item label="表">
              <el-select v-model="fieldTableName" filterable placeholder="选择表" style="width: 200px">
                <el-option v-for="a in tableOptions" :key="a.table_name" :label="a.table_label" :value="a.table_name" />
              </el-select>
            </el-form-item>
            <el-form-item label="字段">
              <el-input v-model="fieldColumnCode" placeholder="字段编码" style="width: 160px" />
            </el-form-item>
            <el-form-item><el-button type="primary" :icon="Search" :loading="fieldLoading" @click="doFieldImpact">分析</el-button></el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- 模型分析 -->
      <el-tab-pane label="模型影响分析" name="model">
        <el-card shadow="never">
          <el-form :inline="true" size="small">
            <el-form-item label="选择模型">
              <el-select v-model="modelId" filterable placeholder="搜索数据模型" style="width: 280px">
                <el-option v-for="m in modelOptions" :key="m.id" :label="`${m.name} (ID:${m.id})`" :value="m.id" />
              </el-select>
            </el-form-item>
            <el-form-item><el-button type="primary" :icon="Search" :loading="modelLoading" @click="doModelImpact">分析</el-button></el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 结果区 -->
    <el-card v-if="refsForTab().length || blockingForTab()" shadow="never" style="margin-top: 16px">
      <template #header><span style="font-weight: 600">引用分析结果</span></template>

      <el-alert
        v-if="blockingForTab()"
        type="danger"
        title="存在阻塞性引用"
        description="以下引用可能阻止该对象的修改或删除操作"
        show-icon style="margin-bottom: 12px"
      />
      <el-alert v-else type="success" title="无阻塞风险" show-icon style="margin-bottom: 12px" />

      <el-table :data="refsForTab()" border size="small" empty-text="无引用记录">
        <el-table-column prop="type" label="类型" width="80">
          <template #default="{ row }">{{ refTypeLabel[row.type] || row.type }}</template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="usage" label="用途" min-width="120" show-overflow-tooltip />
        <el-table-column prop="risk_level" label="风险等级" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="riskTag[row.risk_level] || 'info'">{{ row.risk_level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="blocking" label="阻塞" width="70" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.blocking ? 'danger' : 'success'">{{ row.blocking ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>
