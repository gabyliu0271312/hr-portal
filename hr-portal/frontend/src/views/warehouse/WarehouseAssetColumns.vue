<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, View, Connection } from '@element-plus/icons-vue'
import { listAssetColumns, impactField, type AssetColumn, type ImpactResult } from '@/api/warehouse'

const route = useRoute()
const router = useRouter()
const tableName = route.params.table as string

const columns = ref<AssetColumn[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// 字段详情抽屉
const drawerVisible = ref(false)
const selectedColumn = ref<AssetColumn | null>(null)

// 影响分析
const impactVisible = ref(false)
const impactResult = ref<ImpactResult | null>(null)
const impactLoading = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await listAssetColumns(tableName)
    columns.value = res.columns
  } catch (e: any) {
    error.value = e?.response?.data?.detail || '加载字段列表失败'
  } finally {
    loading.value = false
  }
}

function goBack() { router.back() }
function showDetail(col: AssetColumn) { selectedColumn.value = col; drawerVisible.value = true }

async function showImpact(col: AssetColumn) {
  impactVisible.value = true
  impactLoading.value = true
  try {
    impactResult.value = await impactField(tableName, col.column_code)
  } catch {
    ElMessage.error('影响分析查询失败')
  } finally {
    impactLoading.value = false
  }
}

const AGG_LABELS: Record<string, string> = { dimension: '维度', measure: '度量' }

onMounted(load)
</script>

<template>
  <div style="padding: 24px">
    <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 12px">
      <el-button text :icon="ArrowLeft" @click="goBack">返回</el-button>
      <h2 style="margin: 0; font-size: 18px">{{ tableName }} · 字段定义</h2>
    </div>

    <!-- 错误态 -->
    <el-alert v-if="error" type="error" :title="error" show-icon :closable="false" style="margin-bottom: 16px" />

    <!-- 表格 -->
    <el-card shadow="never">
      <el-table v-loading="loading" :data="columns" border stripe size="small" empty-text="暂无字段定义">
        <el-table-column prop="column_code" label="字段编码" min-width="140" show-overflow-tooltip />
        <el-table-column prop="column_label" label="字段名称" min-width="120" show-overflow-tooltip />
        <el-table-column prop="data_type" label="数据类型" width="90" />
        <el-table-column prop="is_pk_part" label="主键" width="60" align="center">
          <template #default="{ row }"><el-tag size="small" :type="row.is_pk_part ? 'danger' : 'info'">{{ row.is_pk_part ? '是' : '否' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="is_sensitive" label="敏感" width="60" align="center">
          <template #default="{ row }"><el-tag size="small" :type="row.is_sensitive ? 'warning' : 'info'">{{ row.is_sensitive ? '是' : '否' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="agg_role" label="维度/度量" width="80">
          <template #default="{ row }">{{ AGG_LABELS[row.agg_role] || row.agg_role }}</template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="80" />
        <el-table-column prop="is_visible" label="可见" width="60" align="center">
          <template #default="{ row }"><el-tag size="small" :type="row.is_visible ? 'success' : 'info'">{{ row.is_visible ? '是' : '否' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" :icon="View" @click="showDetail(row)">详情</el-button>
            <el-button text size="small" :icon="Connection" @click="showImpact(row)">影响</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 字段详情抽屉 -->
    <el-drawer v-model="drawerVisible" title="字段详情" size="420px" @close="selectedColumn = null">
      <template v-if="selectedColumn">
        <el-card header="基础信息" shadow="never" style="margin-bottom: 12px">
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="字段编码">{{ selectedColumn.column_code }}</el-descriptions-item>
            <el-descriptions-item label="字段名称">{{ selectedColumn.column_label }}</el-descriptions-item>
            <el-descriptions-item label="数据类型">{{ selectedColumn.data_type }}</el-descriptions-item>
            <el-descriptions-item label="描述">{{ selectedColumn.description || '—' }}</el-descriptions-item>
            <el-descriptions-item label="可见">{{ selectedColumn.is_visible ? '是' : '否' }}</el-descriptions-item>
            <el-descriptions-item label="展示顺序">{{ selectedColumn.display_order }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
        <el-card header="数仓属性" shadow="never" style="margin-bottom: 12px">
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="维度/度量">{{ AGG_LABELS[selectedColumn.agg_role] || selectedColumn.agg_role }}</el-descriptions-item>
            <el-descriptions-item label="来源">{{ selectedColumn.source }}</el-descriptions-item>
            <el-descriptions-item label="计算字段">{{ selectedColumn.is_computed ? '是' : '否' }}</el-descriptions-item>
            <el-descriptions-item label="计算公式">{{ selectedColumn.formula_expr || '—' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
        <el-card header="权限属性" shadow="never">
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="敏感字段">{{ selectedColumn.is_sensitive ? '是' : '否' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </template>
    </el-drawer>

    <!-- 影响分析弹窗 -->
    <el-dialog v-model="impactVisible" title="影响分析" width="600px">
      <div v-loading="impactLoading">
        <template v-if="impactResult">
          <el-alert
            v-if="impactResult.blocking"
            type="danger"
            title="存在高风险引用"
            :description="'该字段被引用且不可直接修改/删除'"
            show-icon style="margin-bottom: 12px"
          />
          <el-alert v-else type="success" title="无阻塞引用" show-icon style="margin-bottom: 12px" />
          <el-table v-if="impactResult.references.length" :data="impactResult.references" size="small" border>
            <el-table-column prop="type" label="类型" width="80" />
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column prop="usage" label="用途" min-width="100" />
            <el-table-column prop="risk_level" label="风险" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="({low:'success',medium:'warning',high:'danger'} as Record<string,string>)[row.risk_level]||'info'">
                  {{ row.risk_level }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="blocking" label="阻塞" width="70">
              <template #default="{ row }">{{ row.blocking ? '是' : '否' }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="无引用记录" :image-size="80" />
        </template>
      </div>
    </el-dialog>
  </div>
</template>
