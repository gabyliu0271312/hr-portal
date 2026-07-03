<template>
  <div class="pipeline-designer-page">
    <el-card>
      <template #header>
        <div class="page-header">
          <div>
            <h2>流水线编排</h2>
            <p class="sub">拖拽式可视化编排, 节点类型: 连接器 / 字段映射 / 条件分支 / 列表循环</p>
          </div>
          <div class="actions">
            <el-button @click="loadList">刷新列表</el-button>
            <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建模板</el-button>
          </div>
        </div>
      </template>

      <!-- 模板列表 -->
      <el-table :data="rows" v-loading="loading" stripe border>
        <el-table-column prop="template_code" label="Code" width="180">
          <template #default="{ row }">
            <code>{{ row.template_code }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="节点/连线" width="120">
          <template #default="{ row }">
            <span>{{ row.nodes.length }} 节点 / {{ row.edges.length }} 连线</span>
          </template>
        </el-table-column>
        <el-table-column prop="version" label="版本" width="100">
          <template #default="{ row }">
            <el-tag size="small">v{{ row.version }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_by" label="创建人" width="120" />
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="openDesigner(row)">设计</el-button>
            <el-button size="small" link @click="viewVersions(row)">版本</el-button>
            <el-button size="small" link type="success" @click="saveAsNew(row)">另存</el-button>
            <el-button size="small" link type="danger" @click="removeTemplate(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 模板设计 Dialog -->
    <el-dialog
      v-model="designerVisible"
      :title="`设计模板 - ${form.template_code || '新建'}`"
      width="95%"
      :close-on-click-modal="false"
      top="3vh"
    >
      <div class="designer-container">
        <!-- 左侧: 节点库 + 模板信息 -->
        <div class="designer-left">
          <h4>节点库</h4>
          <div
            v-for="nt in nodeTypes"
            :key="nt.type"
            class="node-palette-item"
            :style="{ borderLeft: `4px solid ${nt.color}` }"
            draggable="true"
            @dragstart="onPaletteDragStart($event, nt.type)"
          >
            <el-icon><component :is="nt.icon" /></el-icon>
            <span>{{ nt.label }}</span>
            <small>{{ nt.type }}</small>
          </div>

          <el-divider />

          <h4>模板信息</h4>
          <el-form :model="form" label-width="80px" size="small">
            <el-form-item label="Code">
              <el-input v-model="form.template_code" :disabled="!!currentTpl" />
            </el-form-item>
            <el-form-item label="名称">
              <el-input v-model="form.name" />
            </el-form-item>
            <el-form-item label="描述">
              <el-input v-model="form.description" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="版本">
              <el-input v-model="form.version" disabled>
                <template #prepend>v</template>
              </el-input>
            </el-form-item>
            <el-form-item label="变更说明" v-if="currentTpl">
              <el-input v-model="form.change_note" type="textarea" :rows="2" placeholder="本次更新原因" />
            </el-form-item>
          </el-form>
        </div>

        <!-- 中间: 画布 -->
        <div
          class="designer-canvas"
          ref="canvasRef"
          @dragover.prevent
          @drop="onCanvasDrop"
          @click="deselectNode"
        >
          <svg class="edge-layer" :viewBox="`0 0 ${canvasW} ${canvasH}`" :width="canvasW" :height="canvasH">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <polygon points="0 0, 10 3, 0 6" fill="#909399" />
              </marker>
              <pattern id="dotgrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="#e4e7ed" />
              </pattern>
            </defs>
            <rect :width="canvasW" :height="canvasH" fill="url(#dotgrid)" />
            <path
              v-for="(edge, i) in drawingEdges"
              :key="`draw-edge-${i}`"
              :d="edgePath(edge)"
              stroke="#909399"
              stroke-width="2"
              fill="none"
              stroke-dasharray="5,3"
              marker-end="url(#arrowhead)"
            />
            <path
              v-for="(edge, i) in form.edges"
              :key="`edge-${i}`"
              :d="edgePath(storedEdge(edge))"
              stroke="#67C23A"
              stroke-width="2"
              fill="none"
              marker-end="url(#arrowhead)"
            />
          </svg>

          <div
            v-for="node in form.nodes"
            :key="node.id"
            class="node-card"
            :class="{ selected: selectedNodeId === node.id, 'is-error': nodeHasError(node) }"
            :style="{
              left: node.x + 'px',
              top: node.y + 'px',
              borderColor: getNodeColor(node.type),
            }"
            :data-node-id="node.id"
            @mousedown="startDrag($event, node)"
            @click.stop="selectNode(node)"
          >
            <div class="node-header" :style="{ background: getNodeColor(node.type) }">
              <span>{{ node.label || getNodeLabel(node.type) }}</span>
              <el-button link size="small" @click.stop="removeNode(node.id)" style="color: #fff">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <div class="node-body">
              <small>{{ node.type }}</small>
              <div v-if="node.type === 'CONNECTOR'" class="cfg">
                <div class="cfg-line">
                  <el-icon><Box /></el-icon>
                  <span class="muted">{{ node.config?.system_code || '未选系统' }}</span>
                </div>
                <div class="cfg-line">
                  <el-icon><Document /></el-icon>
                  <span class="strong">{{ node.config?.resource_name || '未选资源' }}</span>
                </div>
              </div>
              <div v-else-if="node.type === 'BRANCH'" class="cfg">
                {{ node.config?.condition || '(无条件)' }}
              </div>
              <div v-else-if="node.type === 'LOOP'" class="cfg">
                {{ node.config?.input_var || '(未配置输入)' }}
              </div>
              <div v-else class="cfg">
                {{ Object.keys(node.config || {}).length }} 配置项
              </div>
            </div>
            <div class="node-ports">
              <span class="port port-in" :data-node-id="node.id" data-port="in" @mousedown.stop="startConnect($event, node, 'in')"></span>
              <span class="port port-out" :data-node-id="node.id" data-port="out" @mousedown.stop="startConnect($event, node, 'out')"></span>
            </div>
          </div>
        </div>

        <!-- 右侧: 节点配置 -->
        <div class="designer-right">
          <h4>节点配置</h4>
          <div v-if="!selectedNode" class="empty-tip">
            <el-icon><Aim /></el-icon>
            <p>点击画布上的节点进行配置</p>
          </div>
          <div v-else>
            <el-form label-width="80px" size="small">
              <el-form-item label="ID">
                <el-input :model-value="selectedNode.id" disabled />
              </el-form-item>
              <el-form-item label="类型">
                <el-input :model-value="selectedNode.type" disabled />
              </el-form-item>
              <el-form-item label="标签">
                <el-input v-model="selectedNode.label" />
              </el-form-item>
              <el-divider />

              <!-- CONNECTOR 节点: system→resource 联动下拉 -->
              <template v-if="selectedNode.type === 'CONNECTOR'">
                <el-form-item label="业务系统" required>
                  <el-select
                    v-model="(selectedNode.config as Record<string, any>).system_id"
                    placeholder="选择业务系统"
                    filterable
                    clearable
                    style="width: 100%"
                    @change="onSystemChange"
                  >
                    <el-option
                      v-for="s in systems"
                      :key="s.id"
                      :label="`${s.system_name} (${s.system_code})`"
                      :value="s.id"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label="数据资源" required>
                  <el-select
                    v-model="(selectedNode.config as Record<string, any>).resource_id"
                    placeholder="选择该系统下的资源"
                    filterable
                    clearable
                    :disabled="!(selectedNode.config as Record<string, any>).system_id"
                    :loading="resourcesLoading"
                    style="width: 100%"
                    @change="onResourceChange"
                  >
                    <el-option
                      v-for="r in resourcesOf((selectedNode.config as Record<string, any>).system_id)"
                      :key="r.id"
                      :label="`${r.resource_name} (${r.resource_code})`"
                      :value="r.id"
                    />
                  </el-select>
                  <div v-if="(selectedNode.config as Record<string, any>).system_id && resourcesOf((selectedNode.config as Record<string, any>).system_id).length === 0" class="form-hint warn">
                    该系统下还没有资源, 请先在「接入系统」里添加
                  </div>
                </el-form-item>
                <el-form-item label="同步方向">
                  <el-select
                    v-model="(selectedNode.config as Record<string, any>).sync_direction"
                    placeholder="拉取/推送"
                    style="width: 100%"
                  >
                    <el-option label="拉取 (pull)" value="PULL" />
                    <el-option label="推送 (push)" value="PUSH" />
                    <el-option label="双向" value="BIDIRECTIONAL" />
                  </el-select>
                </el-form-item>
              </template>

              <!-- 其他节点: 通用 schema 字段 -->
              <template v-else>
                <el-form-item
                  v-for="(schema, key) in (getNodeSchema(selectedNode.type) || {})"
                  :key="key"
                  :label="key"
                >
                  <el-input
                    :model-value="stringifyConfig(selectedNode.config?.[key])"
                    @update:model-value="(v: string) => updateNodeConfig(key, v)"
                    :placeholder="schema"
                    type="textarea"
                    :rows="2"
                  />
                </el-form-item>
              </template>
            </el-form>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="designerVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTemplate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新建/另存 Dialog -->
    <el-dialog v-model="createVisible" title="新建模板" width="480px">
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="Code" required>
          <el-input v-model="createForm.template_code" placeholder="TPL_OFFER_V2" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 版本历史 Dialog -->
    <el-dialog v-model="versionsVisible" title="版本历史" width="640px">
      <el-table :data="versions" stripe border>
        <el-table-column prop="version" label="版本" width="120">
          <template #default="{ row }">
            <el-tag size="small">v{{ row.version }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="change_note" label="变更说明" />
        <el-table-column prop="created_by" label="操作人" width="120" />
        <el-table-column prop="created_at" label="时间" width="180">
          <template #default="{ row }">
            {{ row.created_at?.slice(0, 19).replace('T', ' ') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" link type="warning" @click="rollbackTo(row)">回滚到此版</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Connection, MagicStick, Share, Refresh, Delete, Aim, Box, Document } from '@element-plus/icons-vue'
import {
  pipelineTemplateApi,
  ucpApi,
  type PipelineTemplate,
  type PipelineNode,
  type PipelineEdge,
  type NodeTypeMeta,
} from '@/api/ucp'

// ===== 类型 =====
interface SystemItem { id: number; system_code: string; system_name: string }
interface ResourceItem { id: number; resource_code: string; resource_name: string; system_id: number; adapter_code?: string | null }
interface VersionItem { id: number; version: string; change_note: string | null; created_by: string; created_at: string | null }

// ===== 列表 =====
const rows = ref<PipelineTemplate[]>([])
const loading = ref(false)
const nodeTypes = ref<NodeTypeMeta[]>([])

async function loadList(): Promise<void> {
  loading.value = true
  try {
    rows.value = await pipelineTemplateApi.list()
  } finally {
    loading.value = false
  }
}

async function loadNodeTypes(): Promise<void> {
  const meta = await pipelineTemplateApi.nodeTypes()
  nodeTypes.value = meta.node_types
}

// ===== 系统 / 资源 =====
const systems = ref<SystemItem[]>([])
const allResources = ref<ResourceItem[]>([])
const resourcesLoading = ref(false)

async function loadSystemsAndResources(): Promise<void> {
  try {
    resourcesLoading.value = true
    const [sysRes, resRes] = await Promise.all([
      ucpApi.systems(),
      ucpApi.resources({}),
    ])
    systems.value = sysRes.items as SystemItem[]
    allResources.value = resRes.items as ResourceItem[]
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.warning(`加载系统/资源失败: ${msg}`)
  } finally {
    resourcesLoading.value = false
  }
}

function resourcesOf(systemId: number | undefined | null): ResourceItem[] {
  if (!systemId) return []
  return allResources.value.filter((r) => r.system_id === systemId)
}

function onSystemChange(): void {
  // 切换 system 时清空 resource_id
  if (!selectedNode.value) return
  const cfg = (selectedNode.value.config || {}) as Record<string, any>
  cfg.resource_id = null
  cfg.resource_name = null
  cfg.resource_code = null
  selectedNode.value.config = cfg
}

function onResourceChange(): void {
  if (!selectedNode.value) return
  const cfg = (selectedNode.value.config || {}) as Record<string, any>
  const r = allResources.value.find((x) => x.id === cfg.resource_id)
  if (r) {
    cfg.resource_name = r.resource_name
    cfg.resource_code = r.resource_code
    cfg.adapter_code = r.adapter_code || null
  }
  selectedNode.value.config = cfg
}

// ===== Designer =====
const designerVisible = ref(false)
const currentTpl = ref<PipelineTemplate | null>(null)
const form = reactive<{
  template_code: string
  name: string
  description: string
  version: string
  change_note: string
  nodes: PipelineNode[]
  edges: PipelineEdge[]
}>({
  template_code: '',
  name: '',
  description: '',
  version: '1.0.0',
  change_note: '',
  nodes: [],
  edges: [],
})
const selectedNodeId = ref<string | null>(null)
const selectedNode = computed(() => form.nodes.find((n) => n.id === selectedNodeId.value) || null)

// 画布
const canvasRef = ref<HTMLElement | null>(null)
const canvasW = 2000
const canvasH = 1200

// 拖拽节点
let dragNode: PipelineNode | null = null
let dragOffset = { x: 0, y: 0 }
function startDrag(e: MouseEvent, node: PipelineNode): void {
  dragNode = node
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dragOffset.x = e.clientX - rect.left
  dragOffset.y = e.clientY - rect.top
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e: MouseEvent): void {
  if (!dragNode || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  dragNode.x = Math.max(0, Math.min(canvasW - 160, e.clientX - rect.left - dragOffset.x))
  dragNode.y = Math.max(0, Math.min(canvasH - 80, e.clientY - rect.top - dragOffset.y))
}
function onDragEnd(): void {
  dragNode = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}

// 连线绘制
let connectFrom: { node: PipelineNode; port: 'in' | 'out' } | null = null
const drawingEdges = ref<DrawingEdge[]>([])

function startConnect(e: MouseEvent, node: PipelineNode, port: 'in' | 'out'): void {
  connectFrom = { node, port }
  window.addEventListener('mousemove', onConnectMove)
  window.addEventListener('mouseup', onConnectEnd)
}
function onConnectMove(e: MouseEvent): void {
  if (!connectFrom || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const fromNode = connectFrom.port === 'out' ? connectFrom.node : null
  if (fromNode) {
    drawingEdges.value = [{ kind: 'drawing', from: { x: fromNode.x + 150, y: fromNode.y + 40 }, to: { x, y } }]
  }
}
function onConnectEnd(e: MouseEvent): void {
  if (!connectFrom) return
  // 通过 data-node-id 找目标节点
  const targetEl = (e.target as HTMLElement)?.closest('.node-card') as HTMLElement | null
  if (targetEl) {
    const targetId = targetEl.getAttribute('data-node-id') || ''
    const targetNode = form.nodes.find((n) => n.id === targetId)
    if (targetNode && targetNode.id !== connectFrom.node.id) {
      if (connectFrom.port === 'out') {
        const exists = form.edges.some(
          (edge) => edge.from === connectFrom!.node.id && edge.to === targetNode.id,
        )
        if (!exists) {
          form.edges.push({ from: connectFrom.node.id, to: targetNode.id, condition: '' })
        }
      } else {
        const exists = form.edges.some(
          (edge) => edge.from === targetNode.id && edge.to === connectFrom!.node.id,
        )
        if (!exists) {
          form.edges.push({ from: targetNode.id, to: connectFrom.node.id, condition: '' })
        }
      }
    }
  }
  drawingEdges.value = []
  connectFrom = null
  window.removeEventListener('mousemove', onConnectMove)
  window.removeEventListener('mouseup', onConnectEnd)
}

function onPaletteDragStart(e: DragEvent, type: PipelineNode['type']): void {
  e.dataTransfer?.setData('text/plain', type)
}
function onCanvasDrop(e: DragEvent): void {
  e.preventDefault()
  const type = e.dataTransfer?.getData('text/plain') as PipelineNode['type']
  if (!type || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = Math.max(0, e.clientX - rect.left - 75)
  const y = Math.max(0, e.clientY - rect.top - 25)
  const newNode: PipelineNode = {
    id: `n_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`,
    type,
    x,
    y,
    label: getNodeLabel(type),
    config: {},
  }
  form.nodes.push(newNode)
  selectedNodeId.value = newNode.id
}

function getNodeColor(type: string): string {
  return nodeTypes.value.find((n) => n.type === type)?.color || '#909399'
}
function getNodeLabel(type: string): string {
  return nodeTypes.value.find((n) => n.type === type)?.label || type
}
function getNodeSchema(type: string): Record<string, string> | null {
  return nodeTypes.value.find((n) => n.type === type)?.config_schema || null
}
function nodeHasError(node: PipelineNode): boolean {
  if (node.type === 'CONNECTOR') {
    const cfg = (node.config || {}) as Record<string, any>
    return !cfg.system_id || !cfg.resource_id
  }
  return false
}

function selectNode(node: PipelineNode): void {
  selectedNodeId.value = node.id
}
function deselectNode(): void {
  selectedNodeId.value = null
}
function removeNode(id: string): void {
  form.nodes = form.nodes.filter((n) => n.id !== id)
  form.edges = form.edges.filter((e) => e.from !== id && e.to !== id)
  if (selectedNodeId.value === id) selectedNodeId.value = null
}

function stringifyConfig(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 2)
}
function updateNodeConfig(key: string, value: string): void {
  if (!selectedNode.value) return
  if (!selectedNode.value.config) selectedNode.value.config = {}
  const trimmed = value.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed === 'true' || trimmed === 'false' || /^-?\d/.test(trimmed)) {
    try {
      (selectedNode.value.config as Record<string, any>)[key] = JSON.parse(trimmed)
      return
    } catch {
      // not json
    }
  }
  (selectedNode.value.config as Record<string, any>)[key] = value
}

interface DrawingEdge { kind: 'drawing'; from: { x: number; y: number }; to: { x: number; y: number } }
interface StoredEdge { kind: 'stored'; from: string; to: string }
type EdgeShape = DrawingEdge | StoredEdge

function storedEdge(e: { from: string; to: string }): StoredEdge {
  return { kind: 'stored', from: e.from, to: e.to }
}

function edgePath(edge: EdgeShape): string {
  let fromX = 0; let fromY = 0; let toX = 0; let toY = 0
  if (edge.kind === 'drawing') {
    fromX = edge.from.x
    fromY = edge.from.y
    toX = edge.to.x
    toY = edge.to.y
  } else {
    const fromNode = form.nodes.find((n) => n.id === edge.from)
    const toNode = form.nodes.find((n) => n.id === edge.to)
    if (!fromNode || !toNode) return ''
    fromX = fromNode.x + 150
    fromY = fromNode.y + 40
    toX = toNode.x
    toY = toNode.y + 40
  }
  const midX = (fromX + toX) / 2
  return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`
}

// ===== Open designer =====
async function openDesigner(tpl: PipelineTemplate): Promise<void> {
  currentTpl.value = tpl
  form.template_code = tpl.template_code
  form.name = tpl.name
  form.description = tpl.description || ''
  form.version = tpl.version
  form.change_note = ''
  form.nodes = JSON.parse(JSON.stringify(tpl.nodes))
  form.edges = JSON.parse(JSON.stringify(tpl.edges))
  selectedNodeId.value = null
  designerVisible.value = true
  await loadSystemsAndResources()
}

// ===== Save =====
const saving = ref(false)
async function saveTemplate(): Promise<void> {
  if (!form.template_code || !form.name) {
    ElMessage.error('Code 和 名称 必填')
    return
  }
  // CONNECTOR 节点校验
  for (const n of form.nodes) {
    if (n.type === 'CONNECTOR') {
      const cfg = (n.config || {}) as Record<string, any>
      if (!cfg.system_id || !cfg.resource_id) {
        ElMessage.error(`节点 ${n.label || n.id} 缺少 system 或 resource`)
        return
      }
    }
  }
  saving.value = true
  try {
    if (currentTpl.value) {
      await pipelineTemplateApi.update(currentTpl.value.template_code, {
        name: form.name,
        description: form.description,
        nodes: form.nodes,
        edges: form.edges,
        change_note: form.change_note,
      })
      ElMessage.success('已保存, 新版本已创建')
    } else {
      await pipelineTemplateApi.create({
        template_code: form.template_code,
        name: form.name,
        description: form.description,
        nodes: form.nodes,
        edges: form.edges,
      })
      ElMessage.success('已创建')
    }
    designerVisible.value = false
    loadList()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(`保存失败: ${msg}`)
  } finally {
    saving.value = false
  }
}

// ===== 新建/另存 =====
const createVisible = ref(false)
const createForm = reactive({ template_code: '', name: '', description: '' })
async function openCreateDialog(): Promise<void> {
  createForm.template_code = ''
  createForm.name = ''
  createForm.description = ''
  createVisible.value = true
}
async function confirmCreate(): Promise<void> {
  if (!createForm.template_code || !createForm.name) {
    ElMessage.error('Code 和 名称 必填')
    return
  }
  currentTpl.value = null
  form.template_code = createForm.template_code
  form.name = createForm.name
  form.description = createForm.description
  form.version = '1.0.0'
  form.change_note = ''
  form.nodes = []
  form.edges = []
  selectedNodeId.value = null
  createVisible.value = false
  designerVisible.value = true
  await loadSystemsAndResources()
}
async function saveAsNew(tpl: PipelineTemplate): Promise<void> {
  currentTpl.value = null
  form.template_code = `${tpl.template_code}_COPY`
  form.name = `${tpl.name} (副本)`
  form.description = tpl.description || ''
  form.version = '1.0.0'
  form.change_note = ''
  form.nodes = JSON.parse(JSON.stringify(tpl.nodes))
  form.edges = JSON.parse(JSON.stringify(tpl.edges))
  selectedNodeId.value = null
  designerVisible.value = true
  await loadSystemsAndResources()
}

// ===== 版本 =====
const versionsVisible = ref(false)
const versions = ref<VersionItem[]>([]) as Ref<VersionItem[]>
async function viewVersions(tpl: PipelineTemplate): Promise<void> {
  try {
    const list = (await pipelineTemplateApi.versions(tpl.template_code)) as unknown as VersionItem[]
    versions.value = list
    versionsVisible.value = true
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(`加载版本失败: ${msg}`)
  }
}
async function rollbackTo(row: VersionItem): Promise<void> {
  if (!currentTpl.value) {
    // 如果在列表页直接点回滚,先打开 designer
    const tpl = rows.value.find((r) => versions.value.some((v) => v.id === row.id))
    if (!tpl) {
      ElMessage.warning('请先打开模板设计')
      return
    }
    currentTpl.value = tpl
  }
  try {
    await ElMessageBox.confirm('确认回滚到此版本? 将创建新版本快照.', '提示', { type: 'warning' })
    await pipelineTemplateApi.rollback(currentTpl.value.template_code, row.id)
    ElMessage.success('已回滚')
    versionsVisible.value = false
    loadList()
  } catch {
    // cancelled
  }
}

async function removeTemplate(tpl: PipelineTemplate): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除 ${tpl.template_code}?`, '危险', { type: 'error' })
    await pipelineTemplateApi.remove(tpl.template_code)
    ElMessage.success('已删除')
    loadList()
  } catch (e: unknown) {
    if (e === 'cancel') return
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(`删除失败: ${msg}`)
  }
}

onMounted(async () => {
  await loadNodeTypes()
  await loadList()
})
</script>

<style scoped>
.pipeline-designer-page {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-header h2 {
  margin: 0 0 4px;
}
.sub {
  margin: 0;
  color: #909399;
  font-size: 13px;
}
code {
  font-family: 'Courier New', monospace;
  background: #f5f7fa;
  padding: 1px 6px;
  border-radius: 3px;
}

.designer-container {
  display: grid;
  grid-template-columns: 200px 1fr 320px;
  height: 75vh;
  gap: 12px;
}
.designer-left,
.designer-right {
  background: #fafafa;
  padding: 12px;
  overflow: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}
.designer-left h4,
.designer-right h4 {
  margin: 0 0 8px;
  font-size: 14px;
}
.node-palette-item {
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 6px;
  cursor: grab;
  display: flex;
  align-items: center;
  gap: 6px;
}
.node-palette-item:hover {
  background: #f0f9ff;
}
.node-palette-item small {
  margin-left: auto;
  color: #909399;
}
.designer-canvas {
  position: relative;
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: auto;
  background-image:
    radial-gradient(circle, #e4e7ed 1px, transparent 1px);
  background-size: 20px 20px;
}
.edge-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
.node-card {
  position: absolute;
  width: 150px;
  background: #fff;
  border: 2px solid #dcdfe6;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
  cursor: move;
  user-select: none;
}
.node-card.selected {
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.3);
}
.node-card.is-error {
  border-color: #f56c6c !important;
  box-shadow: 0 0 0 2px rgba(245, 108, 108, 0.2);
}
.node-header {
  padding: 4px 8px;
  color: #fff;
  border-radius: 4px 4px 0 0;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.node-body {
  padding: 6px 8px;
  font-size: 12px;
}
.node-body small {
  color: #909399;
  font-size: 10px;
  display: block;
  margin-bottom: 2px;
}
.node-body .cfg {
  color: #606266;
  font-size: 11px;
  line-height: 1.5;
}
.node-body .cfg-line {
  display: flex;
  align-items: center;
  gap: 4px;
}
.node-body .cfg-line .muted {
  color: #909399;
}
.node-body .cfg-line .strong {
  color: #303133;
  font-weight: 600;
}
.node-ports {
  position: relative;
  height: 0;
}
.port {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #67c23a;
  border: 2px solid #fff;
  border-radius: 50%;
  cursor: crosshair;
  top: 35px;
}
.port-in {
  left: -7px;
}
.port-out {
  right: -7px;
}
.port:hover {
  background: #409eff;
  transform: scale(1.3);
}
.empty-tip {
  text-align: center;
  padding: 60px 0;
  color: #c0c4cc;
}
.empty-tip p {
  margin: 8px 0 0;
  font-size: 13px;
}
.form-hint {
  font-size: 12px;
  margin-top: 4px;
  color: #909399;
}
.form-hint.warn {
  color: #e6a23c;
}
</style>
