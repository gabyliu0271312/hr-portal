<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Right, Connection } from '@element-plus/icons-vue'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import dagre from 'dagre'
import {
  getTableLineage,
  getFieldLineage,
  LINEAGE_NODE_COLORS,
  LINEAGE_NODE_LABELS,
  LINEAGE_EDGE_LABELS,
} from '@/api/warehouse'
import type { LineageGraph, LineageNode, LineageEdge } from '@/api/warehouse'
import { MarkerType } from '@vue-flow/core'
import type { Node, Edge } from '@vue-flow/core'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

const route = useRoute()
const router = useRouter()

// ==================== 状态 ====================

const loading = ref(false)
const errorMsg = ref('')
const graphError = ref(false)
const viewMode = ref<'list' | 'graph'>('list')

const queryType = ref<'table' | 'field'>('table')
const tableName = ref('')
const columnCode = ref('')
const direction = ref<'all' | 'upstream' | 'downstream'>('all')
const depth = ref(3)

const data = ref<LineageGraph | null>(null)

const selectedNode = ref<LineageNode | null>(null)
const detailVisible = ref(false)

const flowNodes = ref<Node[]>([])
const flowEdges = ref<Edge[]>([])

// ==================== 自定义血缘节点 ====================

const LineageNodeComponent = {
  name: 'LineageNode',
  props: ['data'],
  setup(props: { data: { lineage: LineageNode } }) {
    return () => {
      const n = props.data.lineage
      const color = LINEAGE_NODE_COLORS[n.type] || '#909399'
      const typeLabel = LINEAGE_NODE_LABELS[n.type] || n.type
      const displayLabel = n.label.length > 16 ? n.label.slice(0, 16) + '…' : n.label

      return h('div', {
        class: 'custom-lineage-node',
        style: { background: color },
      }, [
        h('div', { class: 'node-type-tag' }, typeLabel),
        h('div', { class: 'node-label-text', title: n.label }, displayLabel),
      ])
    }
  },
}

const nodeTypes = { 'lineage-node': LineageNodeComponent }

// ==================== 过滤 ====================

const filteredNodes = computed(() => {
  if (!data.value) return []
  if (direction.value === 'all') return data.value.nodes
  return data.value.nodes.filter(n => {
    const edges = data.value!.edges
    if (direction.value === 'upstream') {
      return edges.some(e => e.target_id === n.id && e.direction === 'upstream')
        || n.type === 'table' || n.type === 'field'
    }
    return edges.some(e => e.source_id === n.id && e.direction === 'downstream')
      || n.type === 'table' || n.type === 'field'
  })
})

const filteredEdges = computed(() => {
  if (!data.value) return []
  return data.value.edges.filter(e => {
    if (direction.value === 'all') return true
    return e.direction === direction.value
  })
})

const centerNode = computed(() => {
  if (!data.value || !tableName.value) return null
  const tid = queryType.value === 'table'
    ? `table:${tableName.value}`
    : `field:${tableName.value}.${columnCode.value}`
  return data.value.nodes.find(n => n.id === tid) || null
})

// ==================== Dagre 布局 ====================

const NODE_WIDTH = 180
const NODE_HEIGHT = 48

function buildDagreGraph(lnodes: LineageNode[], ledges: LineageEdge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 180, marginx: 40, marginy: 40 })

  for (const n of lnodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const e of ledges) {
    g.setEdge(e.source_id, e.target_id)
  }

  dagre.layout(g)

  const vfNodes: Node[] = lnodes.map(n => {
    const pos = g.node(n.id)
    return {
      id: n.id,
      type: 'lineage-node',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { lineage: n },
    }
  })

  const vfEdges: Edge[] = ledges.map((e, i) => {
    const label = e.label || LINEAGE_EDGE_LABELS[e.relation_type] || e.relation_type
    return {
      id: `${e.source_id}→${e.target_id}:${e.relation_type}:${i}`,
      source: e.source_id,
      target: e.target_id,
      type: 'smoothstep',
      animated: false,
      label,
      style: {
        stroke: e.direction === 'upstream' ? '#909399' : '#67C23A',
        strokeWidth: 1.5,
      },
      labelStyle: { fill: '#606266', fontSize: 11 },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 3,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: e.direction === 'upstream' ? '#909399' : '#67C23A' },
    }
  })

  return { nodes: vfNodes, edges: vfEdges }
}

function rebuildFlow() {
  const lnodes = filteredNodes.value
  const ledges = filteredEdges.value
  if (!lnodes.length) {
    flowNodes.value = []
    flowEdges.value = []
    return
  }
  const { nodes, edges } = buildDagreGraph(lnodes, ledges)
  flowNodes.value = nodes
  flowEdges.value = edges
}

// ==================== 方法 ====================

async function query() {
  if (!tableName.value.trim()) {
    ElMessage.warning('请输入表名')
    return
  }
  loading.value = true
  errorMsg.value = ''
  graphError.value = false
  selectedNode.value = null
  detailVisible.value = false

  try {
    if (queryType.value === 'table') {
      data.value = await getTableLineage(tableName.value.trim(), depth.value)
    } else {
      if (!columnCode.value.trim()) {
        ElMessage.warning('请输入字段编码')
        loading.value = false
        return
      }
      data.value = await getFieldLineage(tableName.value.trim(), columnCode.value.trim(), depth.value)
    }
    // 成功获取数据后构建图谱布局
    if (data.value && data.value.nodes.length > 0) {
      rebuildFlow()
    }
  } catch (e: any) {
    const msg = e?.response?.data?.detail || e?.message || '查询血缘失败'
    errorMsg.value = msg
    data.value = null
    flowNodes.value = []
    flowEdges.value = []
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  const q: Record<string, string> = {
    type: queryType.value,
    table: tableName.value.trim(),
    depth: String(depth.value),
  }
  if (queryType.value === 'field' && columnCode.value.trim()) {
    q.column = columnCode.value.trim()
  }
  router.replace({ query: q })
  query()
}

function nodeLabel(n: LineageNode) {
  return LINEAGE_NODE_LABELS[n.type] || n.type
}

function nodeColor(n: LineageNode) {
  return LINEAGE_NODE_COLORS[n.type] || '#909399'
}

function openDetail(n: LineageNode) {
  selectedNode.value = n
  detailVisible.value = true
}

function navigateTo(route: string | null) {
  if (!route) return
  if (route.startsWith('/')) {
    router.push(route)
  } else {
    router.push({ name: route })
  }
}

function switchToGraph() {
  try {
    rebuildFlow()
    viewMode.value = 'graph'
    graphError.value = false
  } catch {
    graphError.value = true
    viewMode.value = 'list'
    ElMessage.warning('图谱加载失败，已切换到列表视图')
  }
}

// vue-flow 节点点击事件
function onNodeClick({ node }: { node: Node }) {
  const lineage = node.data?.lineage as LineageNode | undefined
  if (lineage) {
    openDetail(lineage)
  }
}

// ==================== 生命周期 ====================

onMounted(() => {
  const q = route.query
  if (q.type === 'field') queryType.value = 'field'
  if (q.table) tableName.value = String(q.table)
  if (q.column) columnCode.value = String(q.column)
  if (q.depth) depth.value = Number(q.depth)

  if (tableName.value) query()
})
</script>

<template>
  <div class="lineage-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <h2>数据血缘</h2>
    </div>

    <!-- 查询栏 -->
    <el-card shadow="never" class="query-card">
      <el-form :inline="true" :model="{ queryType, tableName, columnCode, direction, depth }" size="default">
        <el-form-item label="对象类型">
          <el-radio-group v-model="queryType">
            <el-radio value="table">表级</el-radio>
            <el-radio value="field">字段级</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="表名" required>
          <el-input v-model="tableName" placeholder="如: employee_info" style="width: 200px" clearable
            @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item v-if="queryType === 'field'" label="字段编码" required>
          <el-input v-model="columnCode" placeholder="如: employee_id" style="width: 160px" clearable
            @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="方向">
          <el-select v-model="direction" style="width: 110px">
            <el-option label="全部" value="all" />
            <el-option label="上游" value="upstream" />
            <el-option label="下游" value="downstream" />
          </el-select>
        </el-form-item>
        <el-form-item label="深度">
          <el-input-number v-model="depth" :min="1" :max="5" style="width: 100px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch" :loading="loading">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 错误 -->
    <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon closable style="margin-bottom: 12px"
      @close="errorMsg = ''" />

    <!-- 加载状态 -->
    <el-card v-if="loading" shadow="never" class="state-card" v-loading="loading" element-loading-text="查询血缘中…" />

    <!-- 空状态 -->
    <el-card v-else-if="!data && !errorMsg" shadow="never" class="state-card">
      <el-empty description="请选择数据表查询血缘关系" />
    </el-card>

    <!-- 无数据状态 -->
    <el-card v-else-if="data && data.nodes.length === 0" shadow="never" class="state-card">
      <el-empty description="未找到血缘关系" />
    </el-card>

    <!-- 血缘结果 -->
    <template v-if="data && data.nodes.length > 0">
      <!-- 操作栏 -->
      <div class="toolbar-v">
        <div class="toolbar-v-left">
          <span class="node-count">节点 {{ data.nodes.length }} · 关系 {{ data.edges.length }}</span>
          <el-tag v-if="centerNode" type="info" size="small" style="margin-left: 8px">
            {{ centerNode.label }}
          </el-tag>
        </div>
        <div class="toolbar-v-right">
          <el-button-group>
            <el-button :type="viewMode === 'list' ? 'primary' : ''" size="small" @click="viewMode = 'list'">
              列表视图
            </el-button>
            <el-button :type="viewMode === 'graph' ? 'primary' : ''" size="small" @click="switchToGraph">
              图谱视图
            </el-button>
          </el-button-group>
          <el-button :icon="Refresh" size="small" @click="query" style="margin-left: 8px">刷新</el-button>
        </div>
      </div>

      <!-- 截断提示 (Q0207) -->
      <el-alert v-if="data.truncated" :title="data.truncation_message || '结果过多，请缩小查询范围'"
        type="warning" show-icon :closable="false" style="margin-bottom: 12px" />

      <!-- ==================== 列表视图 (Q0205) ==================== -->
      <el-card v-if="viewMode === 'list'" shadow="never">
        <el-table :data="filteredNodes" size="small" stripe row-key="id" max-height="500">
          <el-table-column label="类型" width="90">
            <template #default="{ row }">
              <el-tag :color="nodeColor(row)" size="small" effect="dark" disable-transitions>
                {{ nodeLabel(row) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="label" label="名称" min-width="160" />
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <span :style="{ color: row.status === 'published' || row.status === 'active' ? '#67C23A' : '#909399' }">
                {{ row.status }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="关系" min-width="200">
            <template #default="{ row }">
              <template v-for="e in filteredEdges.filter(ed => ed.source_id === row.id || ed.target_id === row.id)"
                :key="e.source_id + e.target_id + e.relation_type">
                <div style="font-size: 12px; color: #606266; line-height: 1.6">
                  <template v-if="e.source_id === row.id">
                    → {{ e.label || LINEAGE_EDGE_LABELS[e.relation_type] || e.relation_type }}
                  </template>
                  <template v-else>
                    ← {{ e.label || LINEAGE_EDGE_LABELS[e.relation_type] || e.relation_type }}
                  </template>
                </div>
              </template>
              <span v-if="!filteredEdges.some(ed => ed.source_id === row.id || ed.target_id === row.id)"
                style="color: #c0c4cc; font-size: 12px">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button link size="small" type="primary" @click="openDetail(row)">详情</el-button>
              <el-button v-if="row.detail_route" link size="small" @click="navigateTo(row.detail_route)">
                <el-icon><Right /></el-icon>
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 边信息 -->
        <div style="margin-top: 12px">
          <el-divider content-position="left">关系明细</el-divider>
          <el-table :data="filteredEdges" size="small" max-height="300">
            <el-table-column label="方向" width="80">
              <template #default="{ row }">
                <el-tag :type="row.direction === 'upstream' ? '' : 'success'" size="small" effect="plain">
                  {{ row.direction === 'upstream' ? '上游' : '下游' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="来源节点" width="180">
              <template #default="{ row }">
                {{ filteredNodes.find(n => n.id === row.source_id)?.label || row.source_id }}
              </template>
            </el-table-column>
            <el-table-column label="关系" width="120">
              <template #default="{ row }">
                {{ row.label || LINEAGE_EDGE_LABELS[row.relation_type] || row.relation_type }}
                <el-icon><Right /></el-icon>
              </template>
            </el-table-column>
            <el-table-column label="目标节点">
              <template #default="{ row }">
                {{ filteredNodes.find(n => n.id === row.target_id)?.label || row.target_id }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-card>

      <!-- ==================== 图谱视图：vue-flow (Q0206) ==================== -->
      <div v-else-if="viewMode === 'graph' && !graphError" class="graph-wrapper">
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          :node-types="nodeTypes"
          :default-viewport="{ x: 0, y: 0, zoom: 0.9 }"
          :min-zoom="0.15"
          :max-zoom="3"
          :fit-view-on-init="true"
          :nodes-draggable="true"
          :snap-to-grid="true"
          :snap-grid="[15, 15]"
          class="lineage-flow"
          @node-click="onNodeClick"
        >
          <Background :gap="20" :size="1" pattern-color="#e8e8e8" />
          <Controls position="top-right" />
        </VueFlow>
      </div>

      <!-- 图谱错误回退 -->
      <el-card v-else-if="viewMode === 'graph' && graphError" shadow="never" class="state-card">
        <el-result icon="warning" title="图谱加载失败" sub-title="已自动切换到列表视图">
          <template #extra>
            <el-button type="primary" @click="viewMode = 'list'">查看列表视图</el-button>
          </template>
        </el-result>
      </el-card>
    </template>

    <!-- ==================== 节点详情抽屉 ==================== -->
    <el-drawer v-model="detailVisible" title="节点详情" size="400px" direction="rtl">
      <template v-if="selectedNode">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="类型">
            <el-tag :color="nodeColor(selectedNode)" size="small" effect="dark" disable-transitions>
              {{ nodeLabel(selectedNode) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="名称">{{ selectedNode.label }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ selectedNode.status }}</el-descriptions-item>
          <el-descriptions-item label="风险等级">
            <el-tag
              :type="selectedNode.risk_level === 'high' ? 'danger' : selectedNode.risk_level === 'medium' ? 'warning' : ''"
              size="small"
            >
              {{ selectedNode.risk_level === 'high' ? '高' : selectedNode.risk_level === 'medium' ? '中' : '低' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="节点 ID">{{ selectedNode.id }}</el-descriptions-item>
        </el-descriptions>

        <!-- UCP 摘要 -->
        <template v-if="selectedNode.ucp_summary">
          <el-divider content-position="left">UCP 信息</el-divider>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="系统 ID">{{ selectedNode.ucp_summary.system_id }}</el-descriptions-item>
            <el-descriptions-item label="资源 ID">{{ selectedNode.ucp_summary.resource_id }}</el-descriptions-item>
          </el-descriptions>
        </template>

        <!-- 关联关系 -->
        <el-divider content-position="left">关联关系</el-divider>
        <div v-if="filteredEdges.filter(e => e.source_id === selectedNode!.id || e.target_id === selectedNode!.id).length">
          <div
            v-for="e in filteredEdges.filter(ed => ed.source_id === selectedNode!.id || ed.target_id === selectedNode!.id)"
            :key="e.source_id + e.target_id + e.relation_type"
            style="padding: 6px 0; font-size: 13px; border-bottom: 1px solid #ebeef5"
          >
            <template v-if="e.source_id === selectedNode!.id">
              → {{ e.label || LINEAGE_EDGE_LABELS[e.relation_type] || e.relation_type }}
              <span style="color: #409EFF">{{ filteredNodes.find(n => n.id === e.target_id)?.label || e.target_id }}</span>
            </template>
            <template v-else>
              ← {{ e.label || LINEAGE_EDGE_LABELS[e.relation_type] || e.relation_type }}
              <span style="color: #409EFF">{{ filteredNodes.find(n => n.id === e.source_id)?.label || e.source_id }}</span>
            </template>
          </div>
        </div>
        <el-empty v-else description="无关联关系" :image-size="60" />

        <div style="margin-top: 16px" v-if="selectedNode.detail_route">
          <el-button type="primary" :icon="Connection" @click="navigateTo(selectedNode.detail_route)">
            跳转到详情页
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.lineage-page { padding: 24px; max-width: 1600px; margin: 0 auto; }

.page-header { margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 20px; }

.query-card { margin-bottom: 12px; }

.state-card {
  display: flex; align-items: center; justify-content: center;
  min-height: 280px;
}

.toolbar-v {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
  flex-wrap: wrap; gap: 8px;
}
.toolbar-v-left { display: flex; align-items: center; }
.toolbar-v-right { display: flex; align-items: center; }
.node-count { font-size: 13px; color: #909399; }

/* ==================== vue-flow 图谱 ==================== */

.graph-wrapper {
  width: 100%; height: 600px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
  background: #fcfcfc;
}

.lineage-flow {
  width: 100%; height: 100%;
}

/* ==================== 自定义节点 ==================== */

:deep(.custom-lineage-node) {
  width: 180px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  transition: box-shadow 0.2s, transform 0.15s;
  user-select: none;
}
:deep(.custom-lineage-node:hover) {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  transform: scale(1.04);
}

.node-type-tag {
  font-size: 10px;
  opacity: 0.85;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.node-label-text {
  margin-top: 2px;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

/* vue-flow 控件覆盖 */
:deep(.vue-flow__controls) {
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}
</style>
