<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Check } from '@element-plus/icons-vue'
import { listModels, createModel, updateModel, publishModel, saveOutputFields, previewModel, type ModelCreatePayload, type PreviewResult, type Asset, type OutputFieldPayload, type ModelListItem } from '@/api/warehouse'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const step = ref(1)
const modelId = ref<number | null>(null)
const hasModel = computed(() => modelId.value !== null)

// Step 1 — 基础信息
const form1 = ref({ name: '', main_table: '', main_alias: '', join_table: '', join_alias: '', warehouse_layer: 'DWD', subject_area: '' })
const datasetOptions = ref<ModelListItem[]>([])
const datasetTableMap = ref<Record<string, string>>({})  // dataset name → table name
const tablesLoading = ref(false)
async function loadTables() {
  tablesLoading.value = true
  try {
    const res = await listModels({ page_size: 200, warehouse_layer: 'DWD' })
    datasetOptions.value = res.items || []
    // 数据集名→表名映射：ds_dwd_xxx → dwd_xxx
    for (const ds of datasetOptions.value) {
      const tableName = (ds.name || '').replace(/^ds_/, '')
      if (tableName) datasetTableMap.value[ds.name] = tableName
    }
  } catch { /* */ }
  finally { tablesLoading.value = false }
}
loadTables()
function canNext1() { return form1.value.name && form1.value.main_table && form1.value.join_table }

// 可用别名列表
const aliases = computed(() => [
  form1.value.main_alias || form1.value.main_table,
  form1.value.join_alias || form1.value.join_table,
].filter(Boolean))

// Step 2 — 关联条件
const form2 = ref({ join_type: 'left', left_key: '', right_key: '', cardinality: '1:N' })
const keyPairs = ref<{ left: string; right: string }[]>([])
function addKeyPair() { if (!form2.value.left_key || !form2.value.right_key) return; keyPairs.value.push({ left: form2.value.left_key, right: form2.value.right_key }); form2.value.left_key = ''; form2.value.right_key = '' }
function removeKey(i: number) { keyPairs.value.splice(i, 1) }
function canNext2() { return keyPairs.value.length > 0 }

// Step 3 — 输出字段 + 预览
const outputFields = ref<OutputFieldPayload[]>([])
const previewData = ref<PreviewResult | null>(null)
const previewLoading = ref(false)
const saving = ref(false)

function addOutputField() {
  outputFields.value.push({
    source_alias: aliases.value[0] || '',
    source_column: '', output_code: '', output_label: '',
    data_type: 'string', agg_role: 'dimension',
    is_sensitive: false, is_visible: true,
    display_order: outputFields.value.length,
  })
}
function removeOutputField(i: number) { outputFields.value.splice(i, 1) }

function buildPayload(): ModelCreatePayload {
  const mainAlias = form1.value.main_alias || form1.value.main_table
  const joinAlias = form1.value.join_alias || form1.value.join_table
  return {
    name: form1.value.name, warehouse_layer: form1.value.warehouse_layer, subject_area: form1.value.subject_area || undefined,
    tables: [
      { table_name: form1.value.main_table, alias: mainAlias },
      { table_name: form1.value.join_table, alias: joinAlias },
    ],
    relations: [{ left_alias: mainAlias, right_alias: joinAlias, join_type: form2.value.join_type, left_keys: keyPairs.value.map(k => k.left), right_keys: keyPairs.value.map(k => k.right), cardinality: form2.value.cardinality }],
  }
}

async function doPreview() {
  if (!modelId.value && !userStore.hasOp('warehouse.assets', 'C')) { ElMessage.warning('无权限创建模型'); return }
  // 确保模型已保存
  if (!modelId.value) {
    saving.value = true
    try { const res = await createModel(buildPayload()); modelId.value = res.id } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '创建模型失败'); saving.value = false; return }
    saving.value = false
  } else {
    try { await updateModel(modelId.value, { name: form1.value.name, warehouse_layer: form1.value.warehouse_layer, subject_area: form1.value.subject_area || undefined }) } catch { /* 预览优先 */ }
  }
  previewLoading.value = true
  try {
    previewData.value = await previewModel(modelId.value)
    // 用预览结果填充默认输出字段
    if (previewData.value && !outputFields.value.length) {
      outputFields.value = previewData.value.columns.map((c, i) => ({
        source_alias: aliases.value[0] || '',
        source_column: c, output_code: c, output_label: c,
        data_type: 'string', agg_role: 'dimension',
        is_sensitive: false, is_visible: true, display_order: i,
      }))
    }
  } catch { ElMessage.error('预览失败') }
  finally { previewLoading.value = false }
}

function validOutputFields() {
  const fields = outputFields.value.filter(f => f.source_alias && f.source_column && f.output_code && f.output_label)
  if (!fields.length) return false
  // source_alias 必须属于模型的别名列表
  for (const f of fields) {
    if (!aliases.value.includes(f.source_alias)) { ElMessage.error(`source_alias "${f.source_alias}" 不属于该模型的表别名`); return false }
  }
  return true
}

async function saveDraft() {
  saving.value = true
  try {
    if (modelId.value) {
      await updateModel(modelId.value, { name: form1.value.name, warehouse_layer: form1.value.warehouse_layer, subject_area: form1.value.subject_area || undefined })
      if (outputFields.value.length) {
        const valid = outputFields.value.filter(f => f.source_alias && f.source_column && f.output_code && f.output_label)
        if (valid.length) await saveOutputFields(modelId.value, valid)
      }
      ElMessage.success('草稿已更新')
    } else {
      const res = await createModel(buildPayload())
      modelId.value = res.id
      if (outputFields.value.length) {
        const valid = outputFields.value.filter(f => f.source_alias && f.source_column && f.output_code && f.output_label)
        if (valid.length) await saveOutputFields(modelId.value, valid)
      }
      ElMessage.success(`模型已创建 (ID: ${res.id})`)
    }
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
  finally { saving.value = false }
}

async function doPublish() {
  if (!modelId.value) { await saveDraft(); if (!modelId.value) return }
  try {
    if (outputFields.value.length) {
      const valid = outputFields.value.filter(f => f.source_alias && f.source_column && f.output_code && f.output_label)
      if (valid.length) await saveOutputFields(modelId.value, valid)
    }
    await publishModel(modelId.value)
    ElMessage.success('模型已发布')
    router.push('/warehouse/modeling')
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '发布失败') }
}

function goModelList() { router.push('/warehouse/modeling') }
</script>

<template>
  <div style="padding: 24px; max-width: 900px; margin: 0 auto">
    <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 12px">
      <el-button text :icon="ArrowLeft" @click="goModelList">返回</el-button>
      <h2 style="margin: 0; font-size: 20px">快速关联建模</h2>
      <el-tag v-if="hasModel" size="small" type="info">模型 ID: {{ modelId }} — Step1/2 已锁定，仅可编辑输出字段</el-tag>
    </div>

    <el-steps :active="step" finish-status="success" align-center style="margin-bottom: 24px">
      <el-step title="基础信息" /><el-step title="关联配置" /><el-step title="输出字段 & 预览" />
    </el-steps>

    <!-- Step 1 — 已有模型后锁定 -->
    <el-card v-show="step===1">
      <el-alert v-if="hasModel" type="info" title="V1: 模型已创建，表/关系不可修改。如需调整请新建模型" show-icon :closable="false" style="margin-bottom: 12px" />
      <el-form label-width="100px" size="small">
        <el-form-item label="模型名称" required><el-input v-model="form1.name" placeholder="如：员工薪资汇总" maxlength="64" :disabled="hasModel" /></el-form-item>
        <el-form-item label="主表" required>
          <el-select v-model="form1.main_table" filterable placeholder="选择 DWD 数据集" style="width: 100%" :loading="tablesLoading" :disabled="hasModel">
            <el-option v-for="ds in datasetOptions" :key="ds.name" :label="`${ds.label || ds.name} (${ds.name})`" :value="datasetTableMap[ds.name] || ds.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="主表别名"><el-input v-model="form1.main_alias" placeholder="默认同表名" :disabled="hasModel" /></el-form-item>
        <el-form-item label="关联表" required>
          <el-select v-model="form1.join_table" filterable placeholder="选择 DWD 数据集" style="width: 100%" :loading="tablesLoading" :disabled="hasModel">
            <el-option v-for="ds in datasetOptions" :key="ds.name" :label="`${ds.label || ds.name} (${ds.name})`" :value="datasetTableMap[ds.name] || ds.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联表别名"><el-input v-model="form1.join_alias" placeholder="默认同表名" :disabled="hasModel" /></el-form-item>
        <el-form-item label="分层">
          <el-select v-model="form1.warehouse_layer" style="width: 160px">
            <el-option label="ODS 原始数据" value="ODS" /><el-option label="DWD 明细数据" value="DWD" /><el-option label="DWS 汇总数据" value="DWS" /><el-option label="ADS 应用数据" value="ADS" />
          </el-select>
        </el-form-item>
        <el-form-item label="主题域"><el-input v-model="form1.subject_area" placeholder="如：薪酬" /></el-form-item>
      </el-form>
      <div style="text-align: right; margin-top: 16px">
        <el-button type="primary" :icon="ArrowRight" :disabled="!canNext1()" @click="step=2">下一步</el-button>
      </div>
    </el-card>

    <!-- Step 2 — 已有模型后锁定 -->
    <el-card v-show="step===2">
      <el-alert v-if="hasModel" type="info" title="V1: 模型已创建，关联关系不可修改" show-icon :closable="false" style="margin-bottom: 12px" />
      <el-form label-width="100px" size="small">
        <el-form-item label="关联类型"><el-select v-model="form2.join_type" style="width: 160px" :disabled="hasModel"><el-option label="LEFT JOIN" value="left" /><el-option label="INNER JOIN" value="inner" /><el-option label="RIGHT JOIN" value="right" /></el-select></el-form-item>
        <el-form-item label="基数"><el-select v-model="form2.cardinality" style="width: 160px" :disabled="hasModel"><el-option label="1:1" value="1:1" /><el-option label="1:N" value="1:N" /><el-option label="N:1" value="N:1" /><el-option label="N:M" value="N:M" /></el-select></el-form-item>
        <el-divider>关联字段</el-divider>
        <el-form-item label="左表字段"><el-input v-model="form2.left_key" placeholder="主表字段编码" @keyup.enter="addKeyPair" :disabled="hasModel" /></el-form-item>
        <el-form-item label="右表字段"><el-input v-model="form2.right_key" placeholder="关联表字段编码" @keyup.enter="addKeyPair" :disabled="hasModel" /></el-form-item>
        <el-form-item><el-button size="small" @click="addKeyPair" :disabled="hasModel">添加关联字段对</el-button></el-form-item>
      </el-form>
      <div v-if="keyPairs.length" style="margin-top: 8px">
        <el-tag v-for="(p,i) in keyPairs" :key="i" :closable="!hasModel" size="small" style="margin: 4px" @close="!hasModel && removeKey(i)">{{ p.left }} = {{ p.right }}</el-tag>
      </div>
      <div style="text-align: right; margin-top: 16px">
        <el-button :icon="ArrowLeft" @click="step=1">上一步</el-button>
        <el-button type="primary" :icon="ArrowRight" :disabled="!canNext2()" @click="step=3">下一步</el-button>
      </div>
    </el-card>

    <!-- Step 3: 输出字段 + 预览 -->
    <el-card v-show="step===3">
      <div style="margin-bottom: 12px; display: flex; gap: 8px">
        <el-button v-if="!hasModel ? userStore.hasOp('warehouse.assets','C') : userStore.menus.some(m => m.code === 'warehouse.assets')" type="primary" @click="doPreview" :loading="previewLoading">预览数据</el-button>
        <el-button v-if="!hasModel ? userStore.hasOp('warehouse.assets','C') : userStore.hasOp('warehouse.assets','U')" :loading="saving" @click="saveDraft">保存草稿</el-button>
        <el-button v-if="userStore.hasOp('warehouse.assets','U')" type="success" :icon="Check" @click="doPublish">发布模型</el-button>
      </div>

      <!-- 输出字段编辑 -->
      <div style="margin-bottom: 12px">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px">
          <span style="font-weight: 600; font-size: 13px">输出字段配置</span>
          <el-button v-if="(!hasModel ? userStore.hasOp('warehouse.assets','C') : userStore.hasOp('warehouse.assets','U'))" size="small" :icon="ArrowRight" @click="addOutputField">添加字段</el-button>
        </div>
        <el-table v-if="outputFields.length" :data="outputFields" border size="small" max-height="240">
          <el-table-column label="来源表别名" width="110">
            <template #default="{ row, $index }">
              <el-select v-model="outputFields[$index].source_alias" size="small" style="width: 100%">
                <el-option v-for="a in aliases" :key="a" :label="a" :value="a" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="来源字段" min-width="110">
            <template #default="{ row, $index }">
              <el-input v-model="outputFields[$index].source_column" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="输出编码" min-width="100">
            <template #default="{ row, $index }">
              <el-input v-model="outputFields[$index].output_code" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="输出名称" min-width="100">
            <template #default="{ row, $index }">
              <el-input v-model="outputFields[$index].output_label" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="描述" min-width="80">
            <template #default="{ row, $index }">
              <el-input v-model="outputFields[$index].description" size="small" placeholder="可选" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="50">
            <template #default="{ row, $index }">
              <el-button v-if="(!hasModel ? userStore.hasOp('warehouse.assets','C') : userStore.hasOp('warehouse.assets','U'))" text size="small" type="danger" @click="removeOutputField($index)">×</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="点击「预览数据」自动填充，或手动添加字段" :image-size="60" />
      </div>

      <!-- 预览结果 -->
      <el-table v-if="previewData" :data="previewData.items" border size="small" max-height="240" style="margin-bottom: 12px">
        <el-table-column v-for="c in previewData.columns" :key="c" :prop="c" :label="c" min-width="100" show-overflow-tooltip />
      </el-table>
      <el-descriptions v-if="previewData?.summary" :column="3" size="small" border style="margin-top: 12px">
        <el-descriptions-item label="总数">{{ previewData.summary.main_count ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="返回行数">{{ previewData.summary.result_count ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="未匹配">{{ previewData.summary.unmatched_count ?? '—' }}</el-descriptions-item>
      </el-descriptions>
      <div style="text-align: right; margin-top: 16px">
        <el-button :icon="ArrowLeft" @click="step=2">上一步</el-button>
      </div>
    </el-card>
  </div>
</template>
