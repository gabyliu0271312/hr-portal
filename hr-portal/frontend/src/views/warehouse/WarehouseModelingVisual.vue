<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Delete, Finished, Search, Clock, Plus, Loading, MagicStick } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import dagre from 'dagre'
import {
  getModel, updateModel, createModel, previewModel, saveOutputFields,
  publishModelV2, listModelVersions, previewModelV2,
  type OutputFieldPayload, type PreviewResult, type Asset,
  type ModelVersion, type ModelPreviewV2,
} from '@/api/warehouse'
import CalculatedFieldBridge from '@/components/formula/CalculatedFieldBridge.vue'
import { datasetsApi, type DatasetCalculatedField, type DatasetItem } from '@/api/datasets'

const route = useRoute(); const router = useRouter()
const userStore = useUserStore()
const modelId = route.params.id ? Number(route.params.id) : null

// 计算字段弹窗
const cfDialogVisible = ref(false)
const cfLoading = ref(false)
function onCalculatedFieldSaved(_field: DatasetCalculatedField) {
  cfDialogVisible.value = false
  ElMessage.success('计算字段已保存，请刷新输出字段列表')
}
const isNew = !modelId
const canEdit = computed(() => isNew ? userStore.hasOp('warehouse.assets','C') : userStore.hasOp('warehouse.assets','U'))

const form = ref({ label: '', warehouse_layer: 'DWD', subject_area: '', business_definition: '', owner_name: '' })
const loading = ref(false); const saving = ref(false); const error = ref<string|null>(null)

const LAYER_LABELS: Record<string,string> = { ODS:'ODS', DWD:'DWD', DWS:'DWS', ADS:'ADS' }
const LAYER_COLORS: Record<string,string> = { ODS:'#8b9dc3', DWD:'#5a9e6f', DWS:'#d4a24e', ADS:'#c4685c' }
const JOIN_COLORS: Record<string,string> = { left:'#5a9e6f', inner:'#3b6ff5', right:'#d4a24e' }
const NODE_W = 200; const NODE_H = 52

// 表节点
interface ColInfo { code: string; label: string }
interface TableNode { id?: number; table_name: string; alias: string; label?: string; dataset_code?: string; layer?: string; x: number; y: number; columns: ColInfo[] }
const tables = ref<TableNode[]>([])
interface RelationEdge { id?: number; from: string; to: string; join_type: string; cardinality: string; keys: {left:string;right:string}[] }
const relations = ref<RelationEdge[]>([])

interface AvailableTable { table_name: string; table_label: string; dataset_code: string; warehouse_layer: string }
const availableTables = ref<AvailableTable[]>([]); const tableSearch = ref('')
const filteredTables = computed(() => {
  const m = new Set(tables.value.map(t => t.table_name))
  return availableTables.value.filter(t => !m.has(t.table_name) && (tableSearch.value ? t.table_label.includes(tableSearch.value)||t.table_name.includes(tableSearch.value)||t.dataset_code.includes(tableSearch.value.toUpperCase()) : true))
})

const selectedNode = ref<string|null>(null); const selectedEdge = ref<number|null>(null)
const currentEdge = computed(() => selectedEdge.value !== null ? relations.value[selectedEdge.value] : null)
const drawerVisible = ref(false)

const outputFields = ref<OutputFieldPayload[]>([]); const previewData = ref<PreviewResult|null>(null); const previewLoading = ref(false)
const previewV2 = ref<ModelPreviewV2 | null>(null)
const versions = ref<ModelVersion[]>([]); const versionVisible = ref(false)
const activeNames = ref<string[]>([])
const rightTab = ref<'fields'|'preview'>('fields')

function isSingleTableDataset(ds: DatasetItem) {
  const isNormalizedSingleTable = ds.name.startsWith('ds_')
  const isLegacySingleTable = ds.name.startsWith('\u5355\u8868\u6570\u636e\u96c6')
  return (
    ds.is_active !== false &&
    (isNormalizedSingleTable || isLegacySingleTable) &&
    ds.tables?.length === 1 &&
    ds.tables[0]?.alias === 'current' &&
    (!ds.relations || ds.relations.length === 0)
  )
}
function formatDatasetCode(ds: DatasetItem) {
  return ds.name.startsWith('ds_') ? ds.name.toUpperCase() : `DS${String(ds.id).padStart(4, '0')}`
}
function formatTableDatasetCode(tableName: string) {
  return `DS_${tableName}`.toUpperCase()
}
function isCodeLikeLabel(label: string | undefined | null, tableName: string) {
  const v = (label || '').trim()
  return !v || v === tableName || v.toLowerCase() === tableName.toLowerCase() || v.toLowerCase().startsWith('ds_')
}
function readableTableLabel(tableName: string) {
  return tableName
    .replace(/^dwd_/i, '')
    .replace(/^ods_/i, '')
    .replace(/^dim_/i, '')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || tableName
}
function resolveNodeLabel(asset: AvailableTable | undefined, tableName: string) {
  return isCodeLikeLabel(asset?.table_label, tableName) ? readableTableLabel(tableName) : asset!.table_label
}
function resolveNodeDatasetCode(asset: AvailableTable | undefined, tableName: string) {
  return asset?.dataset_code || formatTableDatasetCode(tableName)
}
function makeModelCode(label: string) {
  const suffix = Date.now().toString(36)
  const ascii = (label || 'model').trim().toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `model_${ascii || suffix}_${suffix}`.slice(0, 64)
}

// ==================== 画布缩放 ====================
const zoom = ref(0.95)
const panX = ref(0); const panY = ref(0)
const isPanning = ref(false); const panStart = ref({ x: 0, y: 0, px: 0, py: 0 })

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const d = e.deltaY > 0 ? 0.9 : 1.1
  zoom.value = Math.min(3, Math.max(0.15, zoom.value * d))
}

function onPanStart(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.vm-nd')) return
  isPanning.value = true
  panStart.value = { x: e.clientX, y: e.clientY, px: panX.value, py: panY.value }
  window.addEventListener('mousemove', onPanMoveGlobal)
  window.addEventListener('mouseup', onPanEndGlobal)
}
function onPanMoveGlobal(e: MouseEvent) {
  if (!isPanning.value) return
  panX.value = panStart.value.px + (e.clientX - panStart.value.x)
  panY.value = panStart.value.py + (e.clientY - panStart.value.y)
}
function onPanEndGlobal() { isPanning.value = false; window.removeEventListener('mousemove', onPanMoveGlobal); window.removeEventListener('mouseup', onPanEndGlobal) }
function resetView() { zoom.value = 0.95; panX.value = 0; panY.value = 0 }

// ==================== 连线 ====================
const connecting = ref<{from:string;mx:number;my:number}|null>(null)
const hoverTarget = ref<string|null>(null)
const fadingLine = ref(false)
const dragNode = ref<string|null>(null); const dragStart = ref({x:0,y:0,nx:0,ny:0})

function connectedAliases(alias: string) {
  const set = new Set<string>()
  for (const r of relations.value) { if (r.from===alias) set.add(r.to); if (r.to===alias) set.add(r.from) }
  return set
}

function startConnect(e:MouseEvent, alias:string) {
  e.stopPropagation(); e.preventDefault()
  const n = tables.value.find(t=>t.alias===alias); if (!n) return
  connecting.value = { from: alias, mx: e.clientX, my: e.clientY }
}

function onMove(e: MouseEvent) {
  if (dragNode.value) {
    const n = tables.value.find(t=>t.alias===dragNode.value); if (!n) return
    n.x = Math.round(dragStart.value.nx + (e.clientX - dragStart.value.x) / zoom.value)
    n.y = Math.round(dragStart.value.ny + (e.clientY - dragStart.value.y) / zoom.value)
  }
  if (connecting.value) {
    const cvEl = document.querySelector('.vm-cv-inner'); if (!cvEl) return
    const r = cvEl.getBoundingClientRect()
    const mx = (e.clientX - r.left) / zoom.value
    const my = (e.clientY - r.top) / zoom.value
    connecting.value.mx = mx; connecting.value.my = my
    let snapped = false
    for (const t of tables.value) {
      if (t.alias === connecting.value.from) continue
      const lx = t.x; const ly = t.y + NODE_H / 2
      if (Math.hypot(mx - lx, my - ly) < 60) {
        connecting.value.mx = lx; connecting.value.my = ly
        hoverTarget.value = t.alias; snapped = true; break
      }
    }
    if (!snapped) hoverTarget.value = null
  }
}

function onUp() {
  if (connecting.value && hoverTarget.value) {
    const from = connecting.value.from; const to = hoverTarget.value
    if (!relations.value.some(r=>(r.from===from&&r.to===to)||(r.from===to&&r.to===from))) {
      relations.value.push({from, to, join_type:'left', cardinality:'1:N', keys:[{left:'',right:''}]})
      autoLayout()
    }
    finishConnect()
  } else if (connecting.value) {
    fadingLine.value = true; setTimeout(() => { connecting.value = null; fadingLine.value = false }, 200)
  } else { dragNode.value = null; hoverTarget.value = null }
}
function finishConnect() { dragNode.value = null; connecting.value = null; hoverTarget.value = null }
function onDragStart(e:MouseEvent, alias:string) { if(e.button!==0)return;e.preventDefault();const n=tables.value.find(t=>t.alias===alias);if(!n)return;dragNode.value=alias;dragStart.value={x:e.clientX,y:e.clientY,nx:n.x,ny:n.y} }

// ==================== 边路由 ====================
function edgeEndpoints(rel: RelationEdge) {
  const a = tables.value.find(t=>t.alias===rel.from), b = tables.value.find(t=>t.alias===rel.to)
  if (!a||!b) return null
  const stub = 28
  const sy = a.y + NODE_H / 2; const ty = b.y + NODE_H / 2
  const vx = a.x + NODE_W + stub  // 垂直主干 X
  return { sx: a.x + NODE_W, sy, tx: b.x, ty, vx }
}
function edgePath(ep: {sx:number;sy:number;tx:number;ty:number;vx:number}) {
  return `M ${ep.sx} ${ep.sy} L ${ep.vx} ${ep.sy} L ${ep.vx} ${ep.ty} L ${ep.tx} ${ep.ty}`
}

// ==================== 布局 ====================
function autoLayout() {
  if (!tables.value.length) return
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 180, marginx: 50, marginy: 50 })
  for (const t of tables.value) g.setNode(t.alias, { width: NODE_W, height: NODE_H })
  for (const r of relations.value) { if (r.from && r.to) g.setEdge(r.from, r.to) }
  dagre.layout(g)
  for (const t of tables.value) {
    const pos = g.node(t.alias)
    if (pos) { t.x = pos.x - NODE_W / 2; t.y = pos.y - NODE_H / 2 }
  }
}

// ==================== 表操作 ====================
async function addTable(tn: string) {
  const a = availableTables.value.find(t => t.table_name === tn); if (!a) return
  let cols: ColInfo[] = []
  try { const { listAssetColumns } = await import('@/api/warehouse'); const r = await listAssetColumns(tn); cols = (r.columns || []).map((c: any) => ({ code: c.column_code, label: c.column_label || c.column_code })) } catch {}
  tables.value.push({ table_name: tn, alias: tn, label: a.table_label, dataset_code: a.dataset_code, layer: a.warehouse_layer, x: 0, y: 0, columns: cols })
  await nextTick(); autoLayout()
}
function removeTable(alias: string) {
  tables.value = tables.value.filter(t => t.alias !== alias)
  relations.value = relations.value.filter(r => r.from !== alias && r.to !== alias)
  if (selectedNode.value === alias) { selectedNode.value = null; drawerVisible.value = false }
  autoLayout()
}
function selectNodeFn(alias: string) { selectedNode.value = alias; selectedEdge.value = null; drawerVisible.value = true }
function selectEdgeFn(i: number) { selectedEdge.value = i; selectedNode.value = null; drawerVisible.value = true }

function removeRelation(i: number) { relations.value.splice(i, 1); selectedEdge.value = null; drawerVisible.value = false; autoLayout() }
function addKey(ri: number) { relations.value[ri].keys.push({ left: '', right: '' }) }
function removeKey(ri: number, ki: number) { relations.value[ri].keys.splice(ki, 1) }
function addOF() { outputFields.value.push({ source_alias: tables.value[0]?.alias || '', source_column: '', output_code: '', output_label: '', data_type: 'string', agg_role: 'dimension', is_sensitive: false, is_visible: true, display_order: outputFields.value.length }) }
function removeOF(i: number) { outputFields.value.splice(i, 1) }

// ==================== 保存/发布/预览 ====================
async function saveDraft() {
  saving.value = true
  try {
    if (modelId) {
      await updateModel(modelId, { label: form.value.label, warehouse_layer: form.value.warehouse_layer, subject_area: form.value.subject_area || undefined, business_definition: form.value.business_definition || undefined, owner_name: form.value.owner_name || undefined })
      const v = outputFields.value.filter(f => f.output_code && f.output_label); if (v.length) await saveOutputFields(modelId, v)
      ElMessage.success('已更新')
    } else {
      const tl = tables.value.map(t => ({ table_name: t.table_name, alias: t.alias }))
      const rl = relations.value.filter(r => r.from && r.to).map(r => ({ left_alias: r.from, right_alias: r.to, join_type: r.join_type, cardinality: r.cardinality, left_keys: r.keys.filter(k => k.left).map(k => k.left), right_keys: r.keys.filter(k => k.right).map(k => k.right) }))
      const res = await createModel({ name: makeModelCode(form.value.label), label: form.value.label, warehouse_layer: form.value.warehouse_layer, subject_area: form.value.subject_area || undefined, business_definition: form.value.business_definition || undefined, owner_name: form.value.owner_name || undefined, tables: tl, relations: rl })
      ElMessage.success(`已创建 ID:${res.id}`); router.replace(`/warehouse/modeling/visual/${res.id}`)
    }
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') } finally { saving.value = false }
}

async function doPublish() {
  if (!modelId) { ElMessage.warning('请先保存'); return }
  try { await ElMessageBox.confirm('确定发布？', '确认', { type: 'info' }); const v = outputFields.value.filter(f => f.output_code && f.output_label); if (v.length) await saveOutputFields(modelId, v); const res = await publishModelV2(modelId); ElMessage.success(`已发布 v${res.version}`); router.push('/warehouse/modeling') } catch {}
}

async function doPreview() { if (!modelId) return; previewLoading.value = true; try { previewData.value = await previewModel(modelId); previewV2.value = await previewModelV2(modelId); rightTab.value = 'preview' } catch { ElMessage.error('预览失败') } finally { previewLoading.value = false } }
async function showVersions() { if (!modelId) return; try { versions.value = await listModelVersions(modelId); versionVisible.value = true } catch { ElMessage.error('加载版本历史失败') } }
function goBack() { router.back() }

// ==================== 加载 ====================
async function load() {
  loading.value = true; error.value = null
  try {
    const datasets = await datasetsApi.list(); availableTables.value = (datasets || []).filter(isSingleTableDataset).map(ds => ({ table_name: ds.tables[0].table_name, table_label: ds.label || ds.tables[0].table_label || ds.tables[0].table_name, dataset_code: formatDatasetCode(ds), warehouse_layer: ds.warehouse_layer || 'DWD' }))
    if (modelId) {
      const d = await getModel(modelId)
      form.value = { label: d.label || d.name, warehouse_layer: d.warehouse_layer, subject_area: d.subject_area || '', business_definition: d.business_definition || '', owner_name: d.owner_name || '' }
      for (const t of d.tables) {
        const asset = availableTables.value.find(a => a.table_name === t.table_name)
        let cols: ColInfo[] = []
        try { const { listAssetColumns } = await import('@/api/warehouse'); const r = await listAssetColumns(t.table_name); cols = (r.columns || []).map((c: any) => ({ code: c.column_code, label: c.column_label || c.column_code })) } catch {}
        tables.value.push({ id: t.id, table_name: t.table_name, alias: t.alias, label: resolveNodeLabel(asset, t.table_name), dataset_code: resolveNodeDatasetCode(asset, t.table_name), layer: asset?.warehouse_layer || 'ODS', x: 0, y: 0, columns: cols })
      }
      relations.value = d.relations.map((r: any) => ({ id: r.id, from: r.left_alias, to: r.right_alias, join_type: r.join_type, cardinality: r.cardinality, keys: r.keys || [] }))
      outputFields.value = d.output_fields.map((f: any) => ({ source_alias: f.source_alias, source_column: f.source_column, output_code: f.output_code, output_label: f.output_label, data_type: f.data_type, description: f.description, agg_role: f.agg_role, is_sensitive: f.is_sensitive, is_visible: f.is_visible, display_order: f.display_order }))
      await nextTick(); autoLayout()
    }
  } catch (e: any) { error.value = e?.response?.data?.detail || '加载失败' } finally { loading.value = false }
}

onMounted(load)
</script>

<template>
  <div class="vm-root" @mousemove="onMove" @mouseup="onUp" @mouseleave="onUp">
    <!-- 工具栏 -->
    <div class="vm-bar">
      <el-button text :icon="ArrowLeft" @click="goBack">返回</el-button>
      <el-input v-model="form.label" placeholder="模型名称" size="small" style="width:160px" />
      <el-select v-model="form.warehouse_layer" size="small" style="width:110px"><el-option v-for="(v,k) in LAYER_LABELS" :key="k" :label="v" :value="k" /></el-select>
      <el-input v-model="form.subject_area" placeholder="主题域" size="small" style="width:80px" />
      <el-input v-model="form.owner_name" placeholder="负责人" size="small" style="width:80px" />
      <span style="flex:1" />
      <el-button size="small" @click="autoLayout()">自动布局</el-button>
      <el-button size="small" @click="resetView()">重置视图</el-button>
      <el-button v-if="canEdit" size="small" :loading="saving" @click="saveDraft">保存</el-button>
      <el-button v-if="modelId&&userStore.hasOp('warehouse.assets','U')" size="small" type="success" :icon="Finished" @click="doPublish">发布</el-button>
      <el-button v-if="modelId" size="small" :icon="Clock" @click="showVersions">版本</el-button>
      <el-button size="small" @click="doPreview" :loading="previewLoading">预览</el-button>
    </div>
    <el-alert v-if="error" type="error" :title="error" show-icon :closable="false" style="margin:0 12px" />

    <div v-loading="loading" class="vm-body">
      <!-- 左栏：表选择器 -->
      <div class="vm-left">
        <div class="vm-lt">数据表</div>
        <div class="vm-ls"><el-input v-model="tableSearch" placeholder="搜索..." size="small" :prefix-icon="Search" clearable /></div>
        <div class="vm-ll">
          <div v-for="t in filteredTables" :key="t.table_name" class="vm-to" @click="addTable(t.table_name)">
            <span class="vm-dot" :style="{background:LAYER_COLORS[t.warehouse_layer]||'#909399'}" />
            <div class="vm-oi"><div class="vm-on">{{ t.table_label }}</div><div class="vm-op">{{ t.dataset_code }}</div></div>
          </div>
          <el-empty v-if="!filteredTables.length" description="无表可添加" :image-size="48" />
        </div>
      </div>

      <!-- 中：可缩放画布 -->
      <div class="vm-cv" @wheel.prevent="onWheel" @mousedown="onPanStart" :style="{cursor:isPanning?'grabbing':'grab'}">
        <div class="vm-cv-inner" :style="{transform:`translate(${panX}px,${panY}px) scale(${zoom})`,transformOrigin:'0 0',width:Math.max(...tables.map(t=>t.x+NODE_W),800)+200+'px',height:Math.max(...tables.map(t=>t.y+NODE_H),500)+200+'px'}">
          <!-- 边 -->
          <svg class="vm-svg" style="position:absolute;inset:0;overflow:visible;pointer-events:none">
            <defs><marker v-for="(r,i) in relations" :key="'m'+i" :id="'m'+i" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" :fill="JOIN_COLORS[r.join_type]||'#909399'" /></marker></defs>
            <g v-for="(r,i) in relations" :key="'e'+i" style="cursor:pointer;pointer-events:all" @click.stop="selectEdgeFn(i);selectedNode=null">
              <template v-if="edgeEndpoints(r)">
                <path :d="edgePath(edgeEndpoints(r)!)" fill="none" stroke="transparent" stroke-width="20" stroke-linejoin="round"/>
                <path :d="edgePath(edgeEndpoints(r)!)" fill="none" :stroke="selectedEdge===i?'#3b6ff5':(JOIN_COLORS[r.join_type]||'#909399')" :stroke-width="selectedEdge===i?2.5:2" stroke-linejoin="round" stroke-linecap="round" :marker-end="`url(#m${i})`" />
                <rect :x="(edgeEndpoints(r)!.vx+edgeEndpoints(r)!.tx)/2-40" :y="edgeEndpoints(r)!.ty-12" width="80" height="24" rx="4" fill="white" :stroke="selectedEdge===i?'#3b6ff5':(JOIN_COLORS[r.join_type]||'#909399')" :stroke-width="1" />
                <text :x="(edgeEndpoints(r)!.vx+edgeEndpoints(r)!.tx)/2" :y="edgeEndpoints(r)!.ty+4" text-anchor="middle" font-size="9" font-weight="700" :fill="JOIN_COLORS[r.join_type]||'#606266'" style="font-family:monospace;pointer-events:none;cursor:pointer" @click.stop="selectEdgeFn(i);selectedNode=null">{{ r.join_type.toUpperCase() }}</text>
              </template>
            </g>
            <!-- 拖拽中的临时线 -->
            <line v-if="connecting" :x1="(tables.find(t=>t.alias===connecting!.from)?.x||0)+NODE_W" :y1="(tables.find(t=>t.alias===connecting!.from)?.y||0)+NODE_H/2" :x2="connecting.mx" :y2="connecting.my" :stroke="hoverTarget?'#30a46c':'#3b6ff5'" :stroke-width="2" :stroke-dasharray="hoverTarget?'none':'6,4'" style="pointer-events:all" />
            <circle v-if="connecting&&hoverTarget" :cx="connecting.mx" :cy="connecting.my" r="5" fill="#30a46c" opacity="0.8"><animate attributeName="r" values="5;7;5" dur="0.8s" repeatCount="indefinite" /></circle>
          </svg>

          <!-- 表节点 -->
          <div v-for="t in tables" :key="t.alias" class="vm-nd" :data-alias="t.alias"
            :class="{s:selectedNode===t.alias,h:hoverTarget===t.alias,connecting:connecting?.from===t.alias}"
            :style="{left:t.x+'px',top:t.y+'px',width:NODE_W+'px',background:(LAYER_COLORS[t.layer||'ODS']||'#909399')+'20',borderColor:hoverTarget===t.alias?'#30a46c':selectedNode===t.alias?'#3b6ff5':(LAYER_COLORS[t.layer||'ODS']||'#909399')+'55'}"
            @mousedown.stop="onDragStart($event,t.alias)" @click.stop="selectNodeFn(t.alias);selectedEdge=null">
            <div class="vm-port vm-port-left" :class="{linked:connectedAliases(t.alias).size>0}"
              @mousedown.stop="startConnect($event, t.alias)" title="拖线连接" />
            <div class="vm-nb">
              <div class="vm-nn" :title="t.label||t.table_name">{{ t.label||t.table_name }}</div>
              <div class="vm-nc" :title="t.dataset_code || t.table_name">{{ t.dataset_code || t.table_name }}</div>
            </div>
            <div class="vm-port vm-port-right" :class="{linked:connectedAliases(t.alias).size>0}"
              @mousedown.stop="startConnect($event, t.alias)" title="拖线连接" />
            <el-button class="vm-ndel" text size="small" type="danger" @mousedown.stop @click.stop="removeTable(t.alias)"><el-icon><Delete /></el-icon></el-button>
          </div>

          <!-- 空态提示 -->
          <div v-if="!tables.length" class="vm-empty-hint" style="position:absolute;left:0;top:0;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:#9ca3af;font-size:13px;pointer-events:none">
            <div style="font-size:36px;opacity:.08;margin-bottom:8px">&#9672;</div>
            <div>从左侧添加表开始建模</div>
          </div>
        </div>
      </div>

      <!-- 右栏：Tab 面板 -->
      <div class="vm-right-panel">
        <el-tabs v-model="rightTab" class="vm-tabs" stretch>
          <el-tab-pane label="输出字段" name="fields">
            <div class="vm-rp-header"><span style="font-size:12px;color:#909399">{{ outputFields.length }} 个字段</span><div style="display:flex;gap:6px"><el-button v-if="modelId" size="small" :icon="MagicStick" @click="cfDialogVisible = true">计算字段</el-button><el-button size="small" :icon="Plus" @click="addOF">添加</el-button></div></div>
            <div class="vm-of-list">
              <div v-for="(f,i) in outputFields" :key="i" class="vm-of-card">
                <div class="vm-of-row">
                  <el-input v-model="outputFields[i].source_alias" size="small" placeholder="来源表" style="width:68px" />
                  <el-input v-model="outputFields[i].source_column" size="small" placeholder="字段" style="width:68px" />
                  <span style="color:#909399">→</span>
                  <el-input v-model="outputFields[i].output_code" size="small" placeholder="编码" style="width:68px" />
                  <el-input v-model="outputFields[i].output_label" size="small" placeholder="名称" style="width:68px" />
                </div>
                <div class="vm-of-row2">
                  <el-select v-model="outputFields[i].data_type" size="small" style="width:70px"><el-option label="string" value="string" /><el-option label="number" value="number" /><el-option label="date" value="date" /></el-select>
                  <el-select v-model="outputFields[i].agg_role" size="small" style="width:75px"><el-option label="维度" value="dimension" /><el-option label="度量" value="measure" /></el-select>
                  <el-input v-model="outputFields[i].description" size="small" placeholder="描述" style="width:80px" />
                  <el-button text size="small" type="danger" @click="removeOF(i)">×</el-button>
                </div>
              </div>
              <el-empty v-if="!outputFields.length" description="暂无输出字段" :image-size="48" />
            </div>
          </el-tab-pane>
          <el-tab-pane label="预览" name="preview">
            <div v-if="previewLoading" style="text-align:center;padding:40px"><el-icon class="is-loading" :size="24"><Loading /></el-icon></div>
            <template v-else-if="previewData">
              <el-alert v-for="e in (previewV2?.errors||[])" :key="e.node_id" :title="`${e.node_id}: ${e.message}`" type="error" show-icon :closable="false" size="small" style="margin-bottom:4px" />
              <el-collapse v-if="previewV2?.sql" v-model="activeNames" style="margin-bottom:4px">
                <el-collapse-item title="SQL" name="sql"><pre class="vm-sql">{{ previewV2.sql }}</pre></el-collapse-item>
                <el-collapse-item title="关系" name="explain"><pre class="vm-explain">{{ previewV2.sql_explanation }}</pre></el-collapse-item>
              </el-collapse>
              <el-table :data="previewData.items" border size="small" max-height="240"><el-table-column v-for="c in previewData.columns" :key="c" :prop="c" :label="c" min-width="70" show-overflow-tooltip /></el-table>
              <div style="font-size:11px;color:#909399;margin-top:4px">总数 {{ previewData.summary.main_count??'—' }} · 返回 {{ previewData.summary.result_count??'—' }} · 未匹配 {{ previewData.summary.unmatched_count??'—' }}</div>
            </template>
            <el-empty v-else description="点击「预览」生成数据" :image-size="48" />
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 属性抽屉 -->
    <el-drawer v-model="drawerVisible" :title="selectedNode?'节点属性':'关联属性'" size="360px" direction="rtl" @close="selectedNode=null;selectedEdge=null">
      <template v-if="selectedNode">
        <div class="vm-fg"><label>显示名称</label><el-input :model-value="tables.find(t=>t.alias===selectedNode)?.label || tables.find(t=>t.alias===selectedNode)?.table_name" size="small" disabled /></div>
        <div class="vm-fg"><label>数据集编码</label><el-input :model-value="tables.find(t=>t.alias===selectedNode)?.dataset_code || tables.find(t=>t.alias===selectedNode)?.table_name" size="small" disabled /></div>
        <div class="vm-fg"><label>别名</label><el-input :model-value="tables.find(t=>t.alias===selectedNode)?.alias" size="small" @change="(v:string)=>{const n=tables.find(t=>t.alias===selectedNode);if(n)n.alias=v}" /></div>
        <div class="vm-fg"><label>物理表</label><el-input :model-value="tables.find(t=>t.alias===selectedNode)?.table_name" size="small" disabled /></div>
        <div class="vm-fg"><label>分层</label><el-select :model-value="tables.find(t=>t.alias===selectedNode)?.layer" size="small" style="width:100%" @change="(v:string)=>{const n=tables.find(t=>t.alias===selectedNode);if(n)n.layer=v}"><el-option v-for="(v,k) in LAYER_LABELS" :key="k" :label="v" :value="k" /></el-select></div>
      </template>
      <template v-else-if="selectedEdge!==null && currentEdge">
        <div class="vm-fg"><label>左表</label><el-input :model-value="currentEdge.from" size="small" disabled /></div>
        <div class="vm-fg"><label>右表</label><el-input :model-value="currentEdge.to" size="small" disabled /></div>
        <div class="vm-fg"><label>类型</label><el-select v-model="currentEdge.join_type" size="small" style="width:100%"><el-option label="LEFT JOIN" value="left" /><el-option label="INNER JOIN" value="inner" /><el-option label="RIGHT JOIN" value="right" /></el-select></div>
        <div class="vm-fg"><label>基数</label><el-select v-model="currentEdge.cardinality" size="small" style="width:100%"><el-option label="1:1" value="1:1" /><el-option label="1:N" value="1:N" /><el-option label="N:1" value="N:1" /><el-option label="N:M" value="N:M" /></el-select></div>
        <div class="vm-fg"><label>关联字段</label>
          <div v-for="(k,ki) in currentEdge.keys" :key="ki" class="vm-kp">
            <el-select v-model="currentEdge.keys[ki].left" size="small" style="width:130px" filterable placeholder="左字段"><el-option v-for="c in (tables.find(t=>t.alias===currentEdge!.from)?.columns||[])" :key="c.code" :label="c.label" :value="c.code" /></el-select>
            <span style="color:#9ca3af">=</span>
            <el-select v-model="currentEdge.keys[ki].right" size="small" style="width:130px" filterable placeholder="右字段"><el-option v-for="c in (tables.find(t=>t.alias===currentEdge!.to)?.columns||[])" :key="c.code" :label="c.label" :value="c.code" /></el-select>
            <el-button text size="small" @click="removeKey(selectedEdge!,ki)">×</el-button>
          </div>
          <el-button size="small" style="margin-top:4px" @click="addKey(selectedEdge!)">+ 字段对</el-button>
        </div>
        <el-button size="small" type="danger" style="margin-top:12px;width:100%" @click="removeRelation(selectedEdge!)">删除关联</el-button>
      </template>
      <el-empty v-else description="点击画布上的节点或关联线" :image-size="48" />
    </el-drawer>

    <!-- 版本历史 -->
    <el-dialog v-model="versionVisible" title="版本历史" width="500px">
      <el-table :data="versions" size="small" stripe>
        <el-table-column prop="version" label="版本" width="80" />
        <el-table-column prop="status" label="状态" width="80"><template #default="{ row }"><el-tag size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="发布时间" width="160"><template #default="{ row }">{{ row.published_at || '-' }}</template></el-table-column>
      </el-table>
      <el-empty v-if="!versions.length" description="暂无版本历史" :image-size="60" />
    </el-dialog>

    <!-- 计算字段弹窗 -->
    <el-dialog v-model="cfDialogVisible" title="管理计算字段" width="800px" v-if="modelId">
      <CalculatedFieldBridge :dataset-id="modelId" :datasets="[]" :tables="[]" @saved="onCalculatedFieldSaved" />
    </el-dialog>
  </div>
</template>

<style scoped>
.vm-root { display: flex; flex-direction: column; height: calc(100vh - 56px); overflow: hidden; background: #f8f9fb; }

.vm-bar { display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: #fff; border-bottom: 1px solid #e2e5ea; flex-shrink: 0; flex-wrap: wrap; }

.vm-body { display: flex; flex: 1; overflow: hidden; }

/* ===== 左栏 ===== */
.vm-left { width: 180px; flex-shrink: 0; background: #fff; border-right: 1px solid #e2e5ea; display: flex; flex-direction: column; overflow: hidden; }
.vm-lt { font-weight: 600; font-size: 12px; padding: 8px 12px; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; }
.vm-ls { padding: 0 8px 6px; }
.vm-ll { flex: 1; overflow-y: auto; padding: 0 6px 6px; }
.vm-to { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px; cursor: pointer; transition: background .15s; }
.vm-to:hover { background: #f0f2f5; }
.vm-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.vm-oi { min-width: 0; }
.vm-on { font-size: 12px; font-weight: 500; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vm-op { font-size: 10px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ===== 画布 ===== */
.vm-cv { flex: 1; overflow: hidden; position: relative; background: #f5f6f8; }
.vm-cv-inner { position: relative; }

/* ===== 边 ===== */
.vm-svg { pointer-events: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: visible; }
.vm-svg g, .vm-svg line, .vm-svg circle { pointer-events: all; }

/* ===== 节点 ===== */
.vm-nd { position: absolute; border-radius: 8px; border: 1.5px solid #dde0e5; box-shadow: 0 2px 8px rgba(0,0,0,.06); cursor: pointer; transition: box-shadow .15s,border-color .15s; overflow: visible; display: flex; align-items: center; padding: 0 6px; }
.vm-nd:hover { box-shadow: 0 4px 16px rgba(0,0,0,.1); }
.vm-nd.s { border-color: #3b6ff5; border-width: 2px; }
.vm-nd.h { border-color: #30a46c; }
.vm-nd.connecting { border-color: #3b6ff5; }
.vm-nb { flex: 1; min-width: 0; padding: 5px 0; text-align: center; }
.vm-nn { font-size: 13px; font-weight: 600; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; }
.vm-nc { font-size: 11px; color: #909399; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: monospace; line-height: 1.4; }
.vm-ndel { position: absolute; top: 2px; right: 2px; opacity: 0; transition: opacity .15s; }
.vm-nd:hover .vm-ndel { opacity: 1; }

/* 端口 */
.vm-port { position: absolute; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; border-radius: 50%; background: #d0d5dd; border: 2.5px solid #fff; cursor: crosshair; transition: transform .2s cubic-bezier(.34,1.56,.64,1),background .2s,box-shadow .2s; z-index: 3; }
.vm-port::after { content: '+'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: transparent; transition: color .15s; }
.vm-port-left { left: -7px; }
.vm-port-right { right: -7px; }
.vm-port:hover { transform: translateY(-50%) scale(1.35); background: #3b6ff5; box-shadow: 0 0 0 5px rgba(59,111,245,.2); }
.vm-port:hover::after { color: #fff; }
.vm-nd:hover .vm-port { background: #a0aab5; }
.vm-nd:hover .vm-port:hover { background: #3b6ff5; }
.vm-port.linked { background: #5a9e6f; box-shadow: 0 0 0 3px rgba(90,158,111,.25); }
.vm-port.linked:hover { background: #30a46c; box-shadow: 0 0 0 5px rgba(48,164,108,.3); }
.vm-nd.connecting .vm-port { background: #3b6ff5; transform: translateY(-50%) scale(1.3); box-shadow: 0 0 0 4px rgba(59,111,245,.25); }
.vm-nd.h .vm-port { background: #3b6ff5; transform: translateY(-50%) scale(1.3); box-shadow: 0 0 0 4px rgba(59,111,245,.25); }

/* ===== 右栏 ===== */
.vm-right-panel { width: 340px; flex-shrink: 0; background: #fff; border-left: 1px solid #e2e5ea; display: flex; flex-direction: column; overflow: hidden; }
.vm-tabs { height: 100%; display: flex; flex-direction: column; }
.vm-tabs :deep(.el-tabs__content) { flex: 1; overflow-y: auto; padding: 0 8px 8px; }
.vm-tabs :deep(.el-tabs__header) { margin: 0; padding: 0 8px; }
.vm-rp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.vm-of-list { display: flex; flex-direction: column; gap: 4px; }
.vm-of-card { padding: 6px 8px; border: 1px solid #ebeef5; border-radius: 6px; background: #fafafa; }
.vm-of-row { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.vm-of-row2 { display: flex; align-items: center; gap: 4px; }
.vm-sql { background: #f5f7fa; padding: 8px; border-radius: 4px; font-size: 11px; overflow-x: auto; max-height: 120px; margin: 0; }
.vm-explain { font-size: 11px; color: #606266; white-space: pre-wrap; margin: 0; }

/* ===== 抽屉 ===== */
.vm-fg { margin-bottom: 10px; }
.vm-fg label { display: block; font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; }
.vm-kp { display: flex; gap: 4px; align-items: center; margin-bottom: 4px; }
</style>
