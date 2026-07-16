<template>
  <div class="pipeline-designer-page">
    <div class="designer-toolbar">
      <div class="toolbar-left">
        <el-button @click="$router.push('/ucp/pipelines')">← 返回列表</el-button>
        <el-divider direction="vertical" />
        <span class="toolbar-title">{{ currentTpl ? `编辑流程 — ${form.name || form.template_code}` : '新建流程' }}</span>
      </div>
      <div class="toolbar-right">
        <el-button @click="viewVersions(currentTpl!)" :disabled="!currentTpl">版本历史</el-button>
        <el-button type="success" @click="dryRun">试运行</el-button>
        <el-button type="primary" :loading="saving" @click="saveTemplate">保存</el-button>
      </div>
    </div>

    <div class="designer-body">
      <div class="designer-left">
        <h4>节点库</h4>
        <div v-for="nt in nodeTypes" :key="nt.type" class="node-palette-item" :style="{ borderLeft: `4px solid ${nt.color}` }" draggable="true" @dragstart="onPaletteDragStart($event, nt.type)">
          <el-icon><component :is="resolveIcon(nt.icon)" /></el-icon>
          <span>{{ nt.label }}</span>
          <small>{{ nt.type }}</small>
        </div>
      </div>

      <div class="designer-canvas" ref="canvasRef" @dragover.prevent @drop="onCanvasDrop" @click="deselectNode">
        <svg class="edge-layer" :viewBox="`0 0 ${canvasW} ${canvasH}`" :width="canvasW" :height="canvasH">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><polygon points="0 0, 10 3, 0 6" fill="#909399" /></marker>
            <pattern id="dotgrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#e4e7ed" /></pattern>
          </defs>
          <rect :width="canvasW" :height="canvasH" fill="url(#dotgrid)" />
          <path v-for="(edge, i) in drawingEdges" :key="`draw-edge-${i}`" :d="edgePath(edge)" stroke="#909399" stroke-width="2" fill="none" stroke-dasharray="5,3" marker-end="url(#arrowhead)" />
          <path v-for="(edge, i) in form.edges" :key="`edge-${i}`" :d="edgePath(storedEdge(edge))" stroke="#67C23A" stroke-width="2" fill="none" marker-end="url(#arrowhead)" />
        </svg>
        <div v-for="node in form.nodes" :key="node.id" class="node-card" :class="{ selected: selectedNodeId === node.id, 'is-error': nodeHasError(node) }" :style="{ left: node.x + 'px', top: node.y + 'px', borderColor: getNodeColor(node.type) }" :data-node-id="node.id" @mousedown="startDrag($event, node)" @click.stop="selectNode(node)">
          <div class="node-header" :style="{ background: getNodeColor(node.type) }">
            <span>{{ node.label || getNodeLabel(node.type) }}</span>
            <el-button link size="small" @click.stop="removeNode(node.id)" style="color: #fff"><el-icon><Delete /></el-icon></el-button>
          </div>
          <div class="node-body">
            <small>{{ node.type }}</small>
            <div v-if="node.type === 'CONNECTOR'" class="cfg">
              <div class="cfg-line"><el-icon><Box /></el-icon><span class="muted">{{ node.config?.system_code || '未选系统' }}</span></div>
              <div class="cfg-line"><el-icon><Document /></el-icon><span class="strong">{{ node.config?.resource_name || '未选资源' }}</span></div>
            </div>
            <div v-else-if="node.type === 'BRANCH'" class="cfg">{{ node.config?.condition || '(无条件)' }}</div>
            <div v-else-if="node.type === 'LOOP'" class="cfg">{{ node.config?.input_var || '(未配置输入)' }}</div>
            <div v-else class="cfg">{{ Object.keys(node.config || {}).length }} 配置项</div>
          </div>
          <div class="node-ports"><span class="port port-in" :data-node-id="node.id" data-port="in" @mousedown.stop="startConnect($event, node, 'in')"></span><span class="port port-out" :data-node-id="node.id" data-port="out" @mousedown.stop="startConnect($event, node, 'out')"></span></div>
        </div>
      </div>

      <div class="designer-right">
        <h4>流程信息</h4>
        <el-form :model="form" label-width="60px" size="small" class="pipeline-info-form">
          <el-row :gutter="8">
            <el-col :span="12"><el-form-item label="编码"><el-input v-model="form.template_code" :disabled="!!currentTpl" placeholder="code" size="small" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="名称"><el-input v-model="form.name" placeholder="流程名称" size="small" /></el-form-item></el-col>
          </el-row>
          <el-form-item label="描述" class="compact-item"><el-input v-model="form.description" type="textarea" :rows="2" placeholder="流程用途说明" size="small" /></el-form-item>
          <el-row :gutter="8" v-if="currentTpl">
            <el-col :span="12"><el-form-item label="版本" class="compact-item"><el-input v-model="form.version" disabled size="small"><template #prepend>v</template></el-input></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="变更" class="compact-item"><el-input v-model="form.change_note" placeholder="更新原因" size="small" /></el-form-item></el-col>
          </el-row>
        </el-form>
        <el-divider style="margin: 8px 0" />
        <h4>节点配置</h4>
        <div v-if="!selectedNode" class="empty-tip"><el-icon><Aim /></el-icon><p>点击画布上的节点进行配置</p></div>
        <div v-else>
          <el-form label-width="80px" size="small">
            <el-form-item label="ID"><el-input :model-value="selectedNode.id" disabled /></el-form-item>
            <el-form-item label="类型"><el-input :model-value="selectedNode.type" disabled /></el-form-item>
            <el-form-item label="标签"><el-input v-model="selectedNode.label" placeholder="自定义标签" /></el-form-item>
            <template v-if="(selectedNode.type as string) === 'CONNECTOR'">
              <el-form-item label="系统"><el-select :model-value="selectedNode.config?.system_id" @change="(v: any) => { if (selectedNode) { const cfg = selectedNode.config || {}; cfg.system_id = v; cfg.system_code = systems.find(x=>x.id===v)?.system_code || ''; selectedNode.config = cfg } }" clearable placeholder="选择系统" style="width:100%"><el-option v-for="s in systems" :key="s.id" :label="`${s.system_code} - ${s.system_name}`" :value="s.id" /></el-select></el-form-item>
              <el-form-item label="资源"><el-select :model-value="selectedNode.config?.resource_id" @change="(v: any) => { if (selectedNode) { const cfg = selectedNode.config || {}; cfg.resource_id = v; const r = allResources.find(x=>x.id===v); if(r){cfg.resource_name=r.resource_name;cfg.resource_code=r.resource_code;cfg.adapter_code=r.adapter_code||null} selectedNode.config = cfg } }" clearable placeholder="选择资源" style="width:100%" :loading="resourcesLoading"><el-option v-for="r in resourcesOf(selectedNode.config?.system_id as number | null | undefined)" :key="r.id" :label="`${r.resource_code} - ${r.resource_name}`" :value="r.id" /></el-select></el-form-item>
            </template>
            <template v-else-if="(selectedNode.type as string) === 'LOOP_RESOURCE' || selectedNode.type === 'LOOP'">
              <el-form-item label="系统"><el-select :model-value="selectedNode.config?.system_id" @change="(v: any) => { if (selectedNode) { const cfg = selectedNode.config || {}; cfg.system_id = v; cfg.system_code = systems.find(x=>x.id===v)?.system_code || ''; selectedNode.config = cfg } }" clearable placeholder="选择系统" style="width:100%"><el-option v-for="s in systems" :key="s.id" :label="`${s.system_code} - ${s.system_name}`" :value="s.id" /></el-select></el-form-item>
              <el-form-item label="资源"><el-select :model-value="selectedNode.config?.resource_id" @change="(v: any) => { if (selectedNode) { const cfg = selectedNode.config || {}; cfg.resource_id = v; const r = allResources.find(x=>x.id===v); if(r){cfg.resource_name=r.resource_name;cfg.resource_code=r.resource_code;cfg.adapter_code=r.adapter_code||null} selectedNode.config = cfg } }" clearable placeholder="选择资源" style="width:100%" :loading="resourcesLoading"><el-option v-for="r in resourcesOf(selectedNode.config?.system_id as number | null | undefined)" :key="r.id" :label="`${r.resource_code} - ${r.resource_name}`" :value="r.id" /></el-select></el-form-item>
              <el-form-item label="输入变量"><el-input v-model="selectedNode.config.input_var" placeholder="items" /></el-form-item>
              <el-form-item label="并发数"><el-input-number v-model="selectedNode.config.max_concurrency" :min="1" :max="100" /></el-form-item>
            </template>
            <template v-else-if="(selectedNode.type as string) === 'NOTIFY'">
              <el-form-item label="通知模板"><el-select v-model="selectedNode.config.template_id" filterable placeholder="选择通知模板" style="width:100%" @visible-change="(v: boolean) => v && loadNotifyTemplates()"><el-option v-for="t in notifyTemplates" :key="t.id" :label="t.template_name" :value="t.id" /></el-select></el-form-item>
              <el-form-item label="接收人"><el-input v-model="selectedNode.config.receivers" placeholder="open_id 逗号分隔" /></el-form-item>
            </template>
            <template v-else-if="selectedNode.type === 'BRANCH'">
              <el-form-item label="条件表达式"><el-input v-model="selectedNode.config.condition" placeholder="ctx.amount > 1000" type="textarea" :rows="2" /></el-form-item>
              <div class="condition-hints"><div class="hint-title">可用变量</div><el-tag size="small" v-for="h in branchHints" :key="h" @click="appendCondition(h)" style="cursor:pointer;margin:2px">{{ h }}</el-tag></div>
            </template>
            <template v-else-if="(selectedNode.type as string) === 'TRANSFORM'">
              <el-form-item label="字段映射">
                <div class="field-mappings">
                  <div v-for="(m, i) in transformMappings" :key="i" class="mapping-row">
                    <el-select v-model="m.from" filterable allow-create placeholder="源字段" style="width:130px" size="small">
                      <el-option v-for="f in upstreamFields" :key="f.name" :label="f.name" :value="f.name"><span>{{ f.name }} <small style="color:#909399">{{ f.type }}</small></span></el-option>
                    </el-select>
                    <span class="mapping-arrow">→</span>
                    <el-input v-model="m.to" placeholder="目标字段" size="small" style="width:130px" />
                    <el-button link size="small" type="danger" @click="removeTransformMapping(i)"><el-icon><Delete /></el-icon></el-button>
                  </div>
                  <el-button size="small" @click="addTransformMapping">+ 添加映射</el-button>
                </div>
              </el-form-item>
              <div v-if="upstreamFields.length" class="upstream-ref">
                <div class="upstream-title">上游字段参考 {{ upstreamSourceName }}</div>
                <div class="upstream-field" v-for="f in upstreamFields" :key="f.name" @click="addMappingFromField(f.name)">
                  <span>{{ f.name }}</span><el-tag size="small" type="info">{{ f.type }}</el-tag>
                </div>
              </div>
              <div v-else class="upstream-ref empty">连接上游资源节点后自动解析可用字段</div>
            </template>
            <template v-else><el-form-item v-for="(schema, key) in (getNodeSchema(selectedNode.type) || {})" :key="key" :label="key"><el-input :model-value="stringifyConfig(selectedNode.config?.[key])" @update:model-value="(v: string) => updateNodeConfig(key, v)" :placeholder="schema" type="textarea" :rows="2" /></el-form-item></template>
          </el-form>
        </div>
      </div>
    </div>

    <el-dialog v-model="versionsVisible" title="版本历史" width="640px">
      <el-table :data="versions" stripe border>
        <el-table-column prop="version" label="版本" width="120"><template #default="{ row }"><el-tag size="small">v{{ row.version }}</el-tag></template></el-table-column>
        <el-table-column prop="change_note" label="变更说明" /><el-table-column prop="created_by" label="操作人" width="120" />
        <el-table-column prop="created_at" label="时间" width="180"><template #default="{ row }">{{ formatDateTime(row.created_at) }}</template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" link type="warning" @click="rollbackTo(row)">回滚到此版</el-button></template></el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { ref, reactive, computed, onMounted, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Connection, MagicStick, Share, Refresh, Delete, Aim, Box, Document, DataBoard, BellFilled, TrendCharts, UserFilled, Setting, Warning, Clock, Edit, FolderOpened, Key, Grid } from '@element-plus/icons-vue'
import { pipelineTemplateApi, ucpApi, type PipelineTemplate, type PipelineNode, type PipelineEdge, type NodeTypeMeta } from '@/api/ucp'

interface SystemItem { id: number; system_code: string; system_name: string }
interface ResourceItem { id: number; resource_code: string; resource_name: string; system_id: number; adapter_code?: string | null }
interface VersionItem { id: number; version: string; change_note: string | null; created_by: string; created_at: string | null }

const nodeTypes = ref<NodeTypeMeta[]>([])
const ICON_MAP: Record<string, any> = { Connection, MagicStick, Share, Refresh, Delete, Aim, Box, Document, Plus, DataBoard, BellFilled, TrendCharts, UserFilled, Setting, Warning, Clock, Edit, FolderOpened, Key, Grid }
function resolveIcon(name: string) { return ICON_MAP[name] || Box }

const NODE_TYPE_DEFS: NodeTypeMeta[] = [
  { type: 'CONNECTOR' as any, label: '资源调用', color: '#409eff', icon: 'Connection', config_schema: {} },
  { type: 'LOOP_RESOURCE' as any, label: '循环资源', color: '#67c23a', icon: 'Refresh', config_schema: {} },
  { type: 'TRANSFORM' as any, label: '字段转换', color: '#e6a23c', icon: 'MagicStick', config_schema: {} },
  { type: 'NOTIFY' as any, label: '通知', color: '#f56c6c', icon: 'BellFilled', config_schema: {} },
  { type: 'BRANCH' as any, label: '条件分支', color: '#909399', icon: 'Share', config_schema: {} },
]
async function loadNodeTypes(): Promise<void> {
  try { const meta = await pipelineTemplateApi.nodeTypes(); nodeTypes.value = meta.node_types } catch { nodeTypes.value = NODE_TYPE_DEFS }
}

const systems = ref<SystemItem[]>([]); const allResources = ref<ResourceItem[]>([]); const resourcesLoading = ref(false)
async function loadSystemsAndResources(): Promise<void> {
  try { resourcesLoading.value = true; const [sysRes, resRes] = await Promise.all([ucpApi.systems(), ucpApi.resources({})]); systems.value = sysRes.items as SystemItem[]; allResources.value = resRes.items as ResourceItem[] }
  catch (e: unknown) { ElMessage.warning(`加载系统/资源失败: ${e instanceof Error ? e.message : String(e)}`) }
  finally { resourcesLoading.value = false }
}
function resourcesOf(systemId: number | undefined | null): ResourceItem[] { if (!systemId) return []; return allResources.value.filter((r) => r.system_id === systemId) }

const currentTpl = ref<PipelineTemplate | null>(null)
const form = reactive<{ template_code: string; name: string; description: string; version: string; change_note: string; nodes: PipelineNode[]; edges: PipelineEdge[] }>({ template_code: '', name: '', description: '', version: '1.0.0', change_note: '', nodes: [], edges: [] })
const selectedNodeId = ref<string | null>(null); const selectedNode = computed(() => form.nodes.find((n) => n.id === selectedNodeId.value) || null)
const canvasRef = ref<HTMLElement | null>(null); const canvasW = 2000; const canvasH = 1200

let dragNode: PipelineNode | null = null; let dragOffset = { x: 0, y: 0 }
function startDrag(e: MouseEvent, node: PipelineNode): void { dragNode = node; const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); dragOffset.x = e.clientX - rect.left; dragOffset.y = e.clientY - rect.top; window.addEventListener('mousemove', onDragMove); window.addEventListener('mouseup', onDragEnd) }
function onDragMove(e: MouseEvent): void { if (!dragNode || !canvasRef.value) return; const rect = canvasRef.value.getBoundingClientRect(); dragNode.x = Math.max(0, Math.min(canvasW - 160, e.clientX - rect.left - dragOffset.x)); dragNode.y = Math.max(0, Math.min(canvasH - 80, e.clientY - rect.top - dragOffset.y)) }
function onDragEnd(): void { dragNode = null; window.removeEventListener('mousemove', onDragMove); window.removeEventListener('mouseup', onDragEnd) }

let connectFrom: { node: PipelineNode; port: 'in' | 'out' } | null = null; interface DrawingEdge { fromNodeId: string; fromPort: 'in' | 'out'; endX: number; endY: number }
const drawingEdges = ref<DrawingEdge[]>([])
function startConnect(e: MouseEvent, node: PipelineNode, port: 'in' | 'out'): void { connectFrom = { node, port }; window.addEventListener('mousemove', onConnectMove); window.addEventListener('mouseup', onConnectEnd) }
function onConnectMove(e: MouseEvent): void { if (!connectFrom || !canvasRef.value) return; const rect = canvasRef.value.getBoundingClientRect(); drawingEdges.value = [{ fromNodeId: connectFrom.node.id, fromPort: connectFrom.port, endX: e.clientX - rect.left, endY: e.clientY - rect.top }] }
function onConnectEnd(e: MouseEvent): void { window.removeEventListener('mousemove', onConnectMove); window.removeEventListener('mouseup', onConnectEnd); if (!connectFrom || !canvasRef.value) { drawingEdges.value = []; connectFrom = null; return }; const rect = canvasRef.value.getBoundingClientRect(); const mx = e.clientX - rect.left; const my = e.clientY - rect.top; const targetEl = document.elementFromPoint(e.clientX, e.clientY); const nodeCard = targetEl?.closest?.('[data-node-id]'); if (nodeCard) { const targetId = nodeCard.getAttribute('data-node-id') || ''; if (targetId && targetId !== connectFrom.node.id) { const exist = form.edges.find((ed: PipelineEdge) => (ed.from === connectFrom!.node.id && ed.to === targetId) || (ed.from === targetId && ed.to === connectFrom!.node.id)); if (!exist) { const newEdge: PipelineEdge = connectFrom.port === 'out' ? { from: connectFrom.node.id, to: targetId } : { from: targetId, to: connectFrom.node.id }; form.edges.push(newEdge as any) } } }; drawingEdges.value = []; connectFrom = null }

function onPaletteDragStart(e: DragEvent, type: string): void { e.dataTransfer?.setData('nodeType', type) }
function onCanvasDrop(e: DragEvent): void { if (!canvasRef.value) return; const type = e.dataTransfer?.getData('nodeType'); if (!type) return; const rect = canvasRef.value.getBoundingClientRect(); const newNode: any = { id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type, label: '', x: Math.max(0, e.clientX - rect.left - 75), y: Math.max(0, e.clientY - rect.top - 20), config: {} }; form.nodes.push(newNode); selectedNodeId.value = newNode.id }
function selectNode(node: PipelineNode): void { selectedNodeId.value = node.id }
function deselectNode(): void { selectedNodeId.value = null }
function removeNode(id: string): void { form.nodes = form.nodes.filter((n) => n.id !== id); form.edges = form.edges.filter((e: any) => e.from !== id && e.to !== id); if (selectedNodeId.value === id) selectedNodeId.value = null }

function getNodeColor(type: string): string { const m: Record<string, string> = { CONNECTOR: '#409eff', LOOP_RESOURCE: '#67c23a', TRANSFORM: '#e6a23c', NOTIFY: '#f56c6c', BRANCH: '#909399', WAIT: '#b37feb', APPROVAL: '#fa8c16' }; return m[type] || '#dcdfe6' }
function getNodeLabel(type: string): string { const m: Record<string, string> = { CONNECTOR: '资源调用', LOOP_RESOURCE: '循环资源', TRANSFORM: '字段转换', NOTIFY: '通知', BRANCH: '条件分支', WAIT: '等待', APPROVAL: '审批' }; return m[type] || type }
function getNodeSchema(type: string): Record<string, string> { const m: Record<string, Record<string, string>> = { TRANSFORM: { input_keys: '输入字段(逗号分隔)', output_key: '输出字段' }, NOTIFY: { template_id: '通知模板ID', receivers: '接收人(逗号分隔)' }, WAIT: { duration_seconds: '等待时间(秒)' }, APPROVAL: { approver: '审批人', reason: '审批原因' } }; return m[type] || {} }
function stringifyConfig(v: any): string { if (v === undefined || v === null) return ''; if (Array.isArray(v)) return v.join(', '); return String(v) }
function updateNodeConfig(key: string, value: string): void { if (!selectedNode.value) return; const cfg = { ...(selectedNode.value.config || {}) } as Record<string, any>; if (value === '') { delete cfg[key] } else if (value.includes(',')) { cfg[key] = value.split(',').map((s: string) => s.trim()) } else { cfg[key] = value }; selectedNode.value.config = cfg }
function nodeHasError(node: PipelineNode): boolean { const t = node.type as string; if (t === 'CONNECTOR' || t === 'LOOP_RESOURCE') return !node.config?.system_id || !node.config?.resource_id; return false }

// ===== TRANSFORM 字段映射 =====
interface FieldMapping { from: string; to: string }
const transformMappings = ref<FieldMapping[]>([])
const upstreamFields = ref<{ name: string; type: string }[]>([])
const upstreamSourceName = ref('')

// 从 edges 中找到流入当前节点的上游节点
function findUpstreamNode(nodeId: string): PipelineNode | null {
  const edge = form.edges.find((e: any) => e.to === nodeId)
  if (!edge) return null
  return form.nodes.find((n: any) => n.id === edge.from) || null
}

// 加载上游节点的字段列表
async function loadUpstreamFields(nodeId: string) {
  upstreamFields.value = []
  upstreamSourceName.value = ''
  const upstream = findUpstreamNode(nodeId)
  if (!upstream || (upstream.type as string) !== 'CONNECTOR') return
  const adapterCode = upstream.config?.adapter_code
  if (!adapterCode) return
  upstreamSourceName.value = `(${upstream.config?.resource_name || adapterCode})`
  try {
    const schema = await (ucpApi as any).adapterSchema?.(adapterCode)
    if (schema?.categories) {
      upstreamFields.value = schema.categories.flatMap((c: any) =>
        (c.fields || []).map((f: any) => ({ name: f.name, type: f.type || 'string' }))
      )
    }
  } catch { /* 上游 schema 未就绪 */ }
}

// 从 node.config.field_mappings 初始化映射列表
function syncMappingsFromConfig() {
  const cfg = selectedNode.value?.config as Record<string, any> | undefined
  const raw = cfg?.field_mappings
  if (Array.isArray(raw)) {
    transformMappings.value = raw.map((m: any) => ({ from: m.from || '', to: m.to || '' }))
  } else if (cfg?.input_keys) {
    // 兼容旧格式：逗号分隔的 input_keys → output_key
    const keys = String(cfg.input_keys).split(',').map(s => s.trim()).filter(Boolean)
    const out = cfg.output_key || ''
    transformMappings.value = keys.map(k => ({ from: k, to: out ? `${out}_${k}` : k }))
  } else {
    transformMappings.value = []
  }
}

function writeMappingsToConfig() {
  if (!selectedNode.value) return
  const mappings = transformMappings.value.filter(m => m.from || m.to)
  const cfg = { ...(selectedNode.value.config || {}) } as Record<string, any>
  cfg.field_mappings = mappings
  cfg.input_keys = mappings.map(m => m.from).join(',')
  cfg.output_key = ''
  selectedNode.value.config = cfg
}

function addTransformMapping() {
  transformMappings.value.push({ from: '', to: '' })
  writeMappingsToConfig()
}
function removeTransformMapping(i: number) {
  transformMappings.value.splice(i, 1)
  writeMappingsToConfig()
}
// ===== NOTIFY 通知模板 =====
const notifyTemplates = ref<Array<{ id: number; template_name: string; template_code: string }>>([])
async function loadNotifyTemplates() { try { const r = await (ucpApi as any).listNotificationTemplates?.({ is_active: 1, limit: 200 }); notifyTemplates.value = r?.items || [] } catch {} }

// ===== BRANCH 条件提示 =====
const branchHints = ['ctx.amount', 'ctx.status', 'ctx.count', 'ctx.result', 'ctx.error', 'ctx.source_system', 'ctx.target_system']
function appendCondition(hint: string) { if (!selectedNode.value) return; const cfg = selectedNode.value.config || {}; cfg.condition = (cfg.condition || '') + ' ' + hint; selectedNode.value.config = cfg }

function addMappingFromField(fieldName: string) {
  transformMappings.value.push({ from: fieldName, to: fieldName })
  writeMappingsToConfig()
}

// 监听节点选中，同步映射
watch(selectedNodeId, async (newId) => {
  if (!newId) { transformMappings.value = []; upstreamFields.value = []; return }
  syncMappingsFromConfig()
  await loadUpstreamFields(newId)
})
interface CoordEdge { fromX: number; fromY: number; toX: number; toY: number }
function storedEdge(e: PipelineEdge): CoordEdge { const from = form.nodes.find((n) => n.id === e.from); const to = form.nodes.find((n) => n.id === e.to); return { fromX: (from?.x ?? 0) + 75, fromY: (from?.y ?? 0) + 40, toX: (to?.x ?? 0) + 75, toY: (to?.y ?? 0) + 40 } }
function edgePath(e: DrawingEdge | CoordEdge): string { const fromX = 'fromNodeId' in e ? (form.nodes.find((n) => n.id === (e as DrawingEdge).fromNodeId)?.x ?? 0) + 75 : (e as CoordEdge).fromX; const fromY = 'fromNodeId' in e ? (form.nodes.find((n) => n.id === (e as DrawingEdge).fromNodeId)?.y ?? 0) + 40 : (e as CoordEdge).fromY; const toX = 'endX' in e ? (e as DrawingEdge).endX : (e as CoordEdge).toX; const toY = 'endY' in e ? (e as DrawingEdge).endY : (e as CoordEdge).toY; const cx = (fromX + toX) / 2; return `M${fromX},${fromY} C${cx},${fromY} ${cx},${toY} ${toX},${toY}` }

async function openDesigner(tpl: PipelineTemplate): Promise<void> { currentTpl.value = tpl; form.template_code = tpl.template_code; form.name = tpl.name; form.description = tpl.description || ''; form.version = tpl.version; form.change_note = ''; form.nodes = JSON.parse(JSON.stringify(tpl.nodes)); form.edges = JSON.parse(JSON.stringify(tpl.edges)); selectedNodeId.value = null; await loadSystemsAndResources() }

const saving = ref(false)
async function saveTemplate(): Promise<void> { if (!form.template_code || !form.name) { ElMessage.error('编码和名称必填'); return }; saving.value = true; try { if (currentTpl.value) { await pipelineTemplateApi.update(currentTpl.value.template_code, { name: form.name, description: form.description, nodes: form.nodes, edges: form.edges, version: form.version, change_note: form.change_note || undefined }); ElMessage.success('已保存，新版本已创建') } else { const created = await pipelineTemplateApi.create({ template_code: form.template_code, name: form.name, description: form.description, nodes: form.nodes, edges: form.edges }); currentTpl.value = { ...created, nodes: form.nodes, edges: form.edges }; ElMessage.success('已创建') } } catch (e: unknown) { ElMessage.error(`保存失败: ${e instanceof Error ? e.message : String(e)}`) } finally { saving.value = false } }

async function dryRun(): Promise<void> { if (!form.template_code) { ElMessage.error('请先保存后再试运行'); return }; try { const result = await ucpApi.runPipeline(form.template_code, { dry_run: true }); ElMessage.success(`试运行已触发，Trace ID: ${result.pipeline_run_id}`) } catch (e: unknown) { ElMessage.error(`试运行失败: ${e instanceof Error ? e.message : String(e)}`) } }

const versionsVisible = ref(false); const versions = ref<VersionItem[]>([]) as Ref<VersionItem[]>
async function viewVersions(tpl: PipelineTemplate): Promise<void> { try { const list = (await pipelineTemplateApi.versions(tpl.template_code)) as unknown as VersionItem[]; versions.value = list; versionsVisible.value = true } catch (e: unknown) { ElMessage.error(`加载版本失败: ${e instanceof Error ? e.message : String(e)}`) } }
async function rollbackTo(row: VersionItem): Promise<void> { if (!currentTpl.value) { ElMessage.warning('请先打开流程设计'); return }; try { await ElMessageBox.confirm('确认回滚到此版本? 将创建新版本快照.', '提示', { type: 'warning' }); await pipelineTemplateApi.rollback(currentTpl.value.template_code, row.id); ElMessage.success('已回滚'); versionsVisible.value = false } catch {} }

const route = useRoute()
onMounted(async () => { await loadNodeTypes(); await loadSystemsAndResources(); const tplCode = route.query.code as string | undefined; if (tplCode) { try { const tpl = await pipelineTemplateApi.get(tplCode); if (tpl) await openDesigner(tpl) } catch {} } })
</script>

<style scoped>
.pipeline-designer-page { height: 100%; display: flex; flex-direction: column; background: var(--color-bg-page) }
.designer-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--color-bg-card); border-bottom: 1px solid var(--color-border); flex-shrink: 0 }
.toolbar-left { display: flex; align-items: center; gap: 12px } .toolbar-title { font-size: 16px; font-weight: 600; color: var(--color-text-primary) } .toolbar-right { display: flex; gap: 8px }
.designer-body { display: grid; grid-template-columns: 220px 1fr 320px; flex: 1; min-height: 0; gap: 0 }
.designer-left, .designer-right { background: #fafafa; padding: 12px; overflow: auto; border-right: 1px solid #ebeef5 } .designer-right { border-right: none; border-left: 1px solid #ebeef5 }
.designer-left h4, .designer-right h4 { margin: 0 0 8px; font-size: 14px }
.node-palette-item { background: #fff; border: 1px solid #dcdfe6; border-radius: 4px; padding: 8px; margin-bottom: 6px; cursor: grab; display: flex; align-items: center; gap: 6px }
.node-palette-item:hover { background: #f0f9ff } .node-palette-item small { margin-left: auto; color: #909399 }
.designer-canvas { position: relative; background: #fafbfc; overflow: auto; background-image: radial-gradient(circle, #e4e7ed 1px, transparent 1px); background-size: 20px 20px }
.edge-layer { position: absolute; top: 0; left: 0; pointer-events: none }
.node-card { position: absolute; width: 150px; background: #fff; border: 2px solid #dcdfe6; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,.06); cursor: move; user-select: none }
.node-card.selected { box-shadow: 0 0 0 3px rgba(64,158,255,.3) } .node-card.is-error { border-color: #f56c6c!important; box-shadow: 0 0 0 2px rgba(245,108,108,.2) }
.node-header { padding: 4px 8px; color: #fff; border-radius: 4px 4px 0 0; font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; align-items: center }
.node-body { padding: 6px 8px; font-size: 12px } .node-body small { color: #909399; font-size: 10px; display: block; margin-bottom: 2px }
.node-body .cfg { color: #606266; font-size: 11px; line-height: 1.5 } .node-body .cfg-line { display: flex; align-items: center; gap: 4px } .node-body .cfg-line .muted { color: #909399 } .node-body .cfg-line .strong { color: #303133; font-weight: 600 }
.node-ports { position: relative; height: 0 } .port { position: absolute; width: 10px; height: 10px; background: #67c23a; border: 2px solid #fff; border-radius: 50%; cursor: crosshair; top: 35px } .port-in { left: -7px } .port-out { right: -7px } .port:hover { background: #409eff; transform: scale(1.3) }
.empty-tip { text-align: center; padding: 60px 0; color: #c0c4cc } .empty-tip p { margin: 8px 0 0; font-size: 13px }
.pipeline-info-form :deep(.el-form-item) { margin-bottom: 8px } .pipeline-info-form .compact-item :deep(.el-form-item) { margin-bottom: 0 }
.field-mappings { margin-bottom: 8px } .mapping-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px } .mapping-arrow { color: #909399; font-size: 14px }
.upstream-ref { background: #f5f7fa; border-radius: 4px; padding: 8px; max-height: 200px; overflow: auto }
.upstream-ref.empty { color: #c0c4cc; font-size: 12px; text-align: center }
.upstream-title { font-size: 12px; color: #909399; margin-bottom: 6px }
.upstream-field { display: flex; justify-content: space-between; align-items: center; padding: 3px 6px; cursor: pointer; border-radius: 3px; font-size: 12px }
.upstream-field:hover { background: #ecf5ff } .upstream-field small { color: #909399 }
.condition-hints { background: #f5f7fa; border-radius: 4px; padding: 8px; margin-top: 4px } .hint-title { font-size: 12px; color: #909399; margin-bottom: 4px }
</style>
