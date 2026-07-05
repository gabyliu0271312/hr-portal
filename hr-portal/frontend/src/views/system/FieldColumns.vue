<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import {
  tableColumnsApi,
  type TableColumn,
  type TableMeta,
} from '@/api/table_columns'
import { adminTablesApi } from '@/api/admin_tables'
import { SCOPE_STRATEGY_OPTIONS } from '@/constants/scopeStrategy'

// T0102: 字段管理已迁移到数据仓库，当前页面为只读兼容入口

const route = useRoute()
const router = useRouter()

const tables = ref<TableMeta[]>([])
const registeredTables = ref<Awaited<ReturnType<typeof adminTablesApi.list>>>([])
const currentTable = ref<string>('')
const columns = ref<TableColumn[]>([])
const loading = ref(false)

const currentRegisteredTable = computed(() =>
  registeredTables.value.find((item) => item.table_name === currentTable.value) || null
)

const DATA_TYPES = [
  { label: '字符串', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '日期', value: 'date' },
  { label: '日期时间', value: 'datetime' },
  { label: '布尔', value: 'bool' },
  { label: '值列表', value: 'enum' },
]

const SCOPE_ROLES = [
  { label: '— 未设置 —', value: '' },
  { label: '成本中心编码 (cc_code)', value: 'cc_code' },
  { label: '组织节点编码 (org_node_code)', value: 'org_node_code' },
  { label: '用工类型 (employment_type)', value: 'employment_type' },
  { label: '用工主体 (employment_entity)', value: 'employment_entity' },
  { label: '人员 (person)', value: 'person' },
]

const AGG_ROLES = [
  { label: '维度', value: 'dimension' },
  { label: '度量', value: 'measure' },
]

const typeLabel = (v: string) => DATA_TYPES.find((t) => t.value === v)?.label || v
const aggLabel = (v: string) => AGG_ROLES.find((t) => t.value === v)?.label || v
const scopeRoleLabel = (v: string | null) =>
  (v && SCOPE_ROLES.find((t) => t.value === v)?.label) || ''

async function loadTables() {
  try {
    tables.value = await tableColumnsApi.tables()
    registeredTables.value = await adminTablesApi.list()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载表清单失败')
  }
}

async function loadColumns() {
  if (!currentTable.value) return
  loading.value = true
  try {
    columns.value = await tableColumnsApi.list(currentTable.value)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载字段失败')
  } finally {
    loading.value = false
  }
}

function goWarehouse() {
  if (currentTable.value) {
    router.push({ name: 'WarehouseAssetColumns', params: { table: currentTable.value } })
  } else {
    router.push({ name: 'WarehouseAssets' })
  }
}

watch(currentTable, () => {
  loadColumns()
  router.replace({ query: { table: currentTable.value } })
})

onMounted(async () => {
  await loadTables()
  const queryTable = route.query.table as string | undefined
  currentTable.value = queryTable || tables.value[0]?.table_name || ''
})
</script>

<template>
  <div style="padding: 24px">
    <!-- T0102: 迁移提示 Banner -->
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    >
      <template #title>
        <span style="font-weight: 600">字段管理已迁移到 数据仓库 &gt; 数据资产 &gt; 字段定义</span>
      </template>
      <template #default>
        <div style="margin-top: 4px">
          当前页面为只读兼容入口，不再支持新增、编辑、删除字段。请前往数据仓库进行字段管理。
        </div>
        <div style="margin-top: 8px">
          <el-button
            type="primary"
            size="small"
            @click="goWarehouse"
          >
            前往数据仓库字段管理
          </el-button>
        </div>
      </template>
    </el-alert>

    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px">
          <div style="display: flex; align-items: center; gap: 6px">
            <span style="font-size: 16px; font-weight: 600">字段管理</span>
            <el-tag type="info" size="small" effect="plain">只读</el-tag>
            <el-tooltip placement="bottom-start" :show-after="100">
              <template #content>
                <div style="max-width: 360px; line-height: 1.7">
                  字段管理已迁移到 数据仓库 &gt; 数据资产 &gt; 字段定义。<br />
                  当前页面为只读兼容入口。
                </div>
              </template>
              <el-icon style="color: var(--color-text-secondary); cursor: help; font-size: 16px">
                <InfoFilled />
              </el-icon>
            </el-tooltip>
          </div>
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
            <el-select v-model="currentTable" style="width: 200px" :disabled="loading" placeholder="选择业务表">
              <el-option
                v-for="t in tables"
                :key="t.table_name"
                :label="t.label"
                :value="t.table_name"
              />
            </el-select>
            <!-- 只读展示数据范围策略 -->
            <el-tag v-if="currentRegisteredTable" type="info" effect="plain">
              策略：{{ SCOPE_STRATEGY_OPTIONS.find(s => s.value === currentRegisteredTable?.scope_strategy)?.label || currentRegisteredTable?.scope_strategy }}
            </el-tag>
            <el-button
              type="primary"
              size="small"
              @click="goWarehouse"
            >
              前往数据仓库字段管理
            </el-button>
          </div>
        </div>
      </template>

      <!-- 只读字段列表 -->
      <el-table v-loading="loading" :data="columns" stripe style="width: 100%" max-height="650">
        <el-table-column label="序号" width="60" type="index" align="center" />

        <el-table-column label="字段" min-width="240">
          <template #default="{ row }">
            <div style="display: flex; flex-direction: column; line-height: 1.4">
              <div style="display: flex; align-items: center; gap: 6px">
                <span style="font-weight: 500">{{ row.column_label }}</span>
                <el-tag v-if="row.auto_discovered" size="small" effect="plain">自动</el-tag>
                <el-tag v-else size="small" type="warning" effect="plain">手动</el-tag>
              </div>
              <span style="font-family: monospace; font-size: 12px; color: var(--color-text-secondary)">
                {{ row.column_code }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">{{ typeLabel(row.data_type) }}</template>
        </el-table-column>

        <el-table-column width="100" align="center">
          <template #header>
            <span>维度/度量</span>
            <el-tooltip placement="top">
              <template #content>
                <div style="max-width: 280px; line-height: 1.6">
                  报表聚合时的角色：<br />
                  • 维度：分组依据（GROUP BY），如月份、成本中心<br />
                  • 度量：被汇总的数值，如金额、人数
                </div>
              </template>
              <el-icon style="margin-left: 4px; vertical-align: middle; cursor: help">
                <InfoFilled />
              </el-icon>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <el-tag size="small" :type="row.agg_role === 'measure' ? 'success' : 'info'" effect="plain">
              {{ aggLabel(row.agg_role) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="属性" min-width="260">
          <template #default="{ row }">
            <div style="display: flex; flex-wrap: wrap; gap: 4px">
              <el-tag v-if="row.is_pk_part" size="small" type="danger" effect="plain">主键</el-tag>
              <el-tag v-if="row.is_sensitive" size="small" type="warning" effect="plain">敏感</el-tag>
              <el-tag v-if="!row.is_visible" size="small" type="info" effect="plain">列表隐藏</el-tag>
              <el-tag v-if="row.copy_from_last_month" size="small" effect="plain">复制上月</el-tag>
              <el-tooltip v-if="row.is_computed" placement="top">
                <template #content>
                  <div style="max-width: 320px; word-break: break-all">{{ row.formula_expr || '（未填公式）' }}</div>
                </template>
                <el-tag size="small" type="success">公式</el-tag>
              </el-tooltip>
              <el-tooltip v-if="row.data_type === 'enum'" placement="top">
                <template #content>
                  <div style="max-width: 320px; line-height: 1.6">
                    <template v-if="row.enum_options?.length">
                      <span v-for="(opt, i) in row.enum_options" :key="opt">
                        {{ opt }}<el-tag v-if="i === 0" size="small" style="margin: 0 4px">默认</el-tag>
                        <br />
                      </span>
                    </template>
                    <span v-else>（暂无可选项）</span>
                  </div>
                </template>
                <el-tag size="small">值列表 · {{ row.enum_options?.length || 0 }}</el-tag>
              </el-tooltip>
              <el-tag v-if="row.scope_role" size="small" type="primary" effect="plain">
                权限：{{ scopeRoleLabel(row.scope_role) }}
              </el-tag>
              <span
                v-if="!row.is_pk_part && !row.is_sensitive && row.is_visible && !row.copy_from_last_month && !row.is_computed && row.data_type !== 'enum' && !row.scope_role"
                style="color: var(--color-text-placeholder); font-size: 12px"
              >—</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="排序" width="80" align="center">
          <template #default="{ row }">
            <span>{{ row.display_order }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="140" fixed="right" align="center">
          <template #default="{ row }">
            <el-tooltip content="编辑功能已迁移到数据仓库字段管理" placement="top">
              <span style="color: var(--color-text-placeholder); font-size: 12px">只读</span>
            </el-tooltip>
          </template>
        </el-table-column>

        <template #empty>
          <div style="padding: 32px 0; color: var(--color-text-placeholder); font-size: 13px">
            <template v-if="currentTable">
              该表尚未发现任何字段
            </template>
            <template v-else>
              请先选择业务表
            </template>
          </div>
        </template>
      </el-table>
    </el-card>
  </div>
</template>
