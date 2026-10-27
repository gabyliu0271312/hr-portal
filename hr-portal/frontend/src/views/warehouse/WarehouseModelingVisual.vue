<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Search, Plus, Loading, MagicStick } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import dagre from 'dagre'
import {
  getModel, updateModel, createModel, previewModel, saveOutputFields,
  previewModelV2, releaseModel,
  type OutputFieldPayload, type PreviewResult,
  type ModelPreviewV2,
} from '@/api/warehouse'
import PermissionButton from '@/components/PermissionButton.vue'
import CalculatedFieldBridge from '@/components/formula/CalculatedFieldBridge.vue'
import WarehouseModelReadinessPanel from '@/components/warehouse/WarehouseModelReadinessPanel.vue'
import FullScreenModal from '@/components/performance/FullScreenModal.vue'
import PerformanceDragHandle from '@/components/performance/PerformanceDragHandle.vue'
import PerformanceSortableList from '@/components/performance/PerformanceSortableList.vue'
import PerformanceStepFlow from '@/components/performance/PerformanceStepFlow.vue'
import { datasetsApi, type DatasetCalculatedField, type DatasetItem } from '@/api/datasets'

const route = useRoute(); const router = useRouter()
const userStore = useUserStore()
const modelId = ref<number | null>(route.params.id ? Number(route.params.id) : null)

const step = ref(0)
const stepItems = [
  { key: 'basic', label: '基本信息' },
  { key: 'build', label: '数据建模' },
  { key: 'fields', label: '输出字段' },
  { key: 'preview', label: '数据预览' },
  { key: 'validation', label: '建模校验' },
]
const pageTitle = computed(() => (form.value.label ? `数据模型 · ${form.value.label}` : '新建数据模型'))

const modelMeta = ref({ status: 'draft', version: 1, release_version: 0, published_at: null as string | null })
const readinessRef = ref<InstanceType<typeof WarehouseModelReadinessPanel> | null>(null)
const validationReady = ref<boolean | null>(null)
const publishError = ref('')
const publishIssues = ref<Array<{ code: string; message: string }>>([])
const publishing = ref(false)
const savedSignature = ref('')
const currentSignature = computed(() => JSON.stringify({
  form: form.value,
  tables: tables.value.map(t => [t.table_name, t.alias]),
  relations: relations.value.map(r => [r.from, r.to, r.join_type, r.cardinality, r.keys]),
  outputs: outputFields.value.map(f => [f.source_alias, f.source_column, f.output_code, f.output_label, f.data_type, f.agg_role, f.description, f.is_sensitive]),
}))
const dirty = computed(() => currentSignature.value !== savedSignature.value)

async function nextStep() {
  if (step.value === 0 && !form.value.label.trim()) {
    ElMessage.warning('请填写模型名称')
    return
  }
  if (dirty.value && !(await saveDraft())) return
  if (step.value < stepItems.length - 1) step.value += 1
}

watch(step, (value) => {
  if (value === 3) void doPreview()
})

// 计算字段弹窗
const cfDialogVisible = ref(false)
const cfLoading = ref(false)
function onCalculatedFieldSaved(_field: DatasetCalculatedField) {
  cfDialogVisible.value = false
  ElMessage.success('计算字段已保存，请刷新输出字段列表')
}
const canEdit = computed(() => modelId.value
  ? userStore.hasOp('warehouse.assets', 'U')
  : userStore.hasOp('warehouse.assets', 'C'))

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

interface OutputFieldRow {
  _uid: number
  source_alias: string
  source_column: string
  output_code: string
  output_label: string
  data_type: string
  agg_role: string
  description: string
  is_sensitive: boolean
}
let ofUid = 0
const outputFields = ref<OutputFieldRow[]>([])
const previewData = ref<PreviewResult|null>(null); const previewLoading = ref(false)
const previewError = ref('')
const previewV2 = ref<ModelPreviewV2 | null>(null)
const activeNames = ref<string[]>([])

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
function resolveNodeLabel(asset: AvailableTable | undefined, tableName: string, preferredLabel?: string | null) {
  if (!isCodeLikeLabel(preferredLabel, tableName)) return preferredLabel!.trim()
  if (!isCodeLikeLabel(asset?.table_label, tableName)) return asset!.table_label
  return readableTableLabel(tableName)
}
function resolveNodeDatasetCode(asset: AvailableTable | undefined, tableName: string, preferredCode?: string | null) {
  return preferredCode || asset?.dataset_code || formatTableDatasetCode(tableName)
}
function resolveNodeLayer(asset: AvailableTable | undefined, tableName: string, preferredLayer?: string | null) {
  if (preferredLayer) return preferredLayer
  if (asset?.warehouse_layer) return asset.warehouse_layer
  const lower = tableName.toLowerCase()
  if (lower.startsWith('dwd_')) return 'DWD'
  if (lower.startsWith('dws_')) return 'DWS'
  if (lower.startsWith('ads_')) return 'ADS'
  if (lower.startsWith('ods_')) return 'ODS'
  return 'DWD'
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

let moveBound = false
function bindCanvasMove(on: boolean) {
  if (on && !moveBound) {
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    moveBound = true
  } else if (!on && moveBound) {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    moveBound = false
  }
}

function startConnect(e:MouseEvent, alias:string) {
  e.stopPropagation(); e.preventDefault()
  const n = tables.value.find(t=>t.alias===alias); if (!n) return
  connecting.value = { from: alias, mx: e.clientX, my: e.clientY }
  bindCanvasMove(true)
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
    fadingLine.value = true
    setTimeout(() => { connecting.value = null; fadingLine.value = false }, 200)
    bindCanvasMove(false)
  } else {
    dragNode.value = null
    hoverTarget.value = null
    bindCanvasMove(false)
  }
}
function finishConnect() { dragNode.value = null; connecting.value = null; hoverTarget.value = null; bindCanvasMove(false) }
function onDragStart(e:MouseEvent, alias:string) {
  if(e.button!==0)return
  e.preventDefault()
  const n=tables.value.find(t=>t.alias===alias); if(!n)return
  dragNode.value=alias
  dragStart.value={x:e.clientX,y:e.clientY,nx:n.x,ny:n.y}
  bindCanvasMove(true)
}

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
function addOF() {
  ofUid += 1
  outputFields.value.push({
    _uid: ofUid,
    source_alias: tables.value[0]?.alias || '',
    source_column: '',
    output_code: '',
    output_label: '',
    data_type: 'string',
    agg_role: 'dimension',
    description: '',
    is_sensitive: false,
  })
}
function removeOF(i: number) { outputFields.value.splice(i, 1) }
function reorderFields(from: number, to: number) {
  if (from === to) return
  const [item] = outputFields.value.splice(from, 1)
  outputFields.value.splice(to, 0, item)
}
function outputPayload(): OutputFieldPayload[] {
  return outputFields.value
    .filter(f => f.output_code.trim() && f.output_label.trim())
    .map((f, index) => ({
      source_alias: f.source_alias,
      source_column: f.source_column,
      output_code: f.output_code,
      output_label: f.output_label,
      data_type: f.data_type || 'string',
      description: f.description || null,
      agg_role: f.agg_role || 'dimension',
      is_sensitive: f.is_sensitive,
      display_order: index,
    }))
}

// ==================== 保存/发布/预览 ====================
async function saveDraft(): Promise<boolean> {
  if (saving.value) return false
  saving.value = true
  try {
    const tablePayload = tables.value.map(t => ({ table_name: t.table_name, alias: t.alias }))
    const relationPayload = relations.value.filter(r => r.from && r.to).map(r => ({ left_alias: r.from, right_alias: r.to, join_type: r.join_type, cardinality: r.cardinality, left_keys: r.keys.filter(k => k.left).map(k => k.left), right_keys: r.keys.filter(k => k.right).map(k => k.right) }))
    const payload = {
      label: form.value.label,
      warehouse_layer: form.value.warehouse_layer,
      subject_area: form.value.subject_area || undefined,
      business_definition: form.value.business_definition || undefined,
      owner_name: form.value.owner_name || undefined,
      tables: tablePayload,
      relations: relationPayload,
    }
    if (modelId.value) {
      await updateModel(modelId.value, payload)
      await saveOutputFields(modelId.value, outputPayload())
    } else {
      if (!form.value.label.trim()) { ElMessage.warning('请填写模型名称'); return false }
      const res = await createModel({ name: makeModelCode(form.value.label), ...payload })
      modelId.value = res.id
      await saveOutputFields(res.id, outputPayload())
      router.replace(`/warehouse/modeling/visual/${res.id}`)
    }
    savedSignature.value = currentSignature.value
    return true
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '自动保存失败')
    return false
  } finally { saving.value = false }
}

async function doPublish() {
  if (!modelId.value || !canEdit.value || saving.value || publishing.value) return
  publishing.value = true
  publishError.value = ''
  publishIssues.value = []
  try {
    try {
      await ElMessageBox.confirm('发布时将重新校验当前模型与权限，校验通过后对授权消费方生效。确定发布？', '确认发布', { type: 'warning' })
    } catch { return }
    if (!canEdit.value) return
    if (dirty.value && !(await saveDraft())) return
    const latest = await getModel(modelId.value)
    await releaseModel(modelId.value, latest.version)
    const refreshed = await getModel(modelId.value)
    modelMeta.value = { status: refreshed.status, version: refreshed.version, release_version: refreshed.release_version ?? 0, published_at: refreshed.published_at }
    await readinessRef.value?.refresh()
    ElMessage.success('发布成功')
  } catch (e: any) {
    let detail = e?.response?.data?.detail
    if (typeof detail === 'string') { try { detail = JSON.parse(detail) } catch {} }
    publishError.value = typeof detail === 'string' ? detail : detail?.message || '发布失败，请重新检查当前模型'
    publishIssues.value = Array.isArray(detail?.issues) ? detail.issues : []
    ElMessage.error(publishError.value)
    await readinessRef.value?.refresh()
  } finally {
    publishing.value = false
  }
}

async function doPreview() {
  if (!modelId.value) return
  previewLoading.value = true
  previewError.value = ''
  try {
    previewData.value = await previewModel(modelId.value)
    previewV2.value = await previewModelV2(modelId.value)
  } catch (e: any) {
    previewData.value = null
    previewV2.value = null
    previewError.value = e?.response?.data?.detail || '预览失败，请检查关联与输出字段'
  } finally { previewLoading.value = false }
}

async function goBack() {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('当前修改尚未保存，确定返回吗？', '未保存内容', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch { return }
  }
  router.back()
}

// ==================== 加载 ====================
async function load() {
  loading.value = true; error.value = null
  tables.value = []
  relations.value = []
  outputFields.value = []
  try {
    const datasets = await datasetsApi.list(); availableTables.value = (datasets || []).filter(isSingleTableDataset).map(ds => ({ table_name: ds.tables[0].table_name, table_label: ds.label || ds.tables[0].table_label || ds.tables[0].table_name, dataset_code: formatDatasetCode(ds), warehouse_layer: ds.warehouse_layer || 'DWD' }))
    if (modelId.value) {
      const d = await getModel(modelId.value)
      form.value = { label: d.label || d.name, warehouse_layer: d.warehouse_layer, subject_area: d.subject_area || '', business_definition: d.business_definition || '', owner_name: d.owner_name || '' }
      modelMeta.value = { status: d.status, version: d.version, release_version: d.release_version ?? 0, published_at: d.published_at }
        for (const t of d.tables) {
        const asset = availableTables.value.find(a => a.table_name === t.table_name)
        let cols: ColInfo[] = []
        try { const { listAssetColumns } = await import('@/api/warehouse'); const r = await listAssetColumns(t.table_name); cols = (r.columns || []).map((c: any) => ({ code: c.column_code, label: c.column_label || c.column_code })) } catch {}
        const preferredLabel = t.dataset_label || t.table_label
        tables.value.push({ id: t.id, table_name: t.table_name, alias: t.alias, label: resolveNodeLabel(asset, t.table_name, preferredLabel), dataset_code: resolveNodeDatasetCode(asset, t.table_name, t.dataset_code), layer: resolveNodeLayer(asset, t.table_name, t.warehouse_layer), x: 0, y: 0, columns: cols })
      }
      relations.value = d.relations.map((r: any) => ({ id: r.id, from: r.left_alias, to: r.right_alias, join_type: r.join_type, cardinality: r.cardinality, keys: r.keys || [] }))
      outputFields.value = d.output_fields.map((f: any) => {
        ofUid += 1
        return {
          _uid: ofUid,
          source_alias: f.source_alias,
          source_column: f.source_column,
          output_code: f.output_code,
          output_label: f.output_label,
          data_type: f.data_type || 'string',
          agg_role: f.agg_role || 'dimension',
          description: f.description || '',
          is_sensitive: !!f.is_sensitive,
        }
      })
      await nextTick(); autoLayout()
    }
  } catch (e: any) { error.value = e?.response?.data?.detail || '加载失败' } finally {
    savedSignature.value = currentSignature.value
    loading.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onPanMoveGlobal)
  window.removeEventListener('mouseup', onPanEndGlobal)
  bindCanvasMove(false)
})
</script>

<template>
  <FullScreenModal :title="pageTitle" :show-footer="false" @back="goBack">
    <template #actions>
      <PerformanceStepFlow :steps="stepItems" :current-step="step" aria-label="数据模型步骤" />
      <span class="save-state">{{ saving ? '保存中…' : dirty ? '未保存' : (modelId ? '已保存' : '') }}</span>
      <el-button v-if="step > 0" :disabled="saving || publishing" @click="step -= 1">上一步</el-button>
      <el-button v-if="step < stepItems.length - 1" type="primary" :loading="saving" @click="nextStep">下一步</el-button>
      <PermissionButton
        v-else
        menu="warehouse.assets"
        op="U"
        mode="disable"
        type="primary"
        :loading="publishing"
        :disabled="!modelId || !canEdit || loading || saving || publishing"
        @click="doPublish"
      >{{ modelMeta.status === 'published' ? '重新发布' : '发布' }}</PermissionButton>
    </template>

    <div v-loading="loading" class="wizard-body">
      <el-alert v-if="error" type="error" :title="error" show-icon :closable="false" />

      <!-- 1. 基本信息 -->
      <section v-if="step === 0" class="wizard-panel wizard-panel--narrow">
        <header class="panel-head">
          <h2>基本信息</h2>
          <p>填写模型标识与归属；保存后即可进入数据建模。</p>
        </header>
        <div class="panel-body">
          <label class="field">
            <span class="field-label">模型名称<i class="required">*</i></span>
            <el-input v-model="form.label" placeholder="如 员工月度分摊模型" maxlength="120" />
          </label>
          <div class="field-grid">
            <label class="field">
              <span class="field-label">分层</span>
              <el-select v-model="form.warehouse_layer">
                <el-option v-for="(v, k) in LAYER_LABELS" :key="k" :label="v" :value="k" />
              </el-select>
            </label>
            <label class="field">
              <span class="field-label">主题域</span>
              <el-input v-model="form.subject_area" placeholder="如 薪酬、组织" />
            </label>
          </div>
          <div class="field-grid">
            <label class="field">
              <span class="field-label">负责人</span>
              <el-input v-model="form.owner_name" placeholder="负责人姓名" />
            </label>
            <div class="field">
              <span class="field-label">模型标识</span>
              <div class="inline-meta">
                <el-tag v-if="modelId" size="small" type="info">ID {{ modelId }}</el-tag>
                <span v-else class="field-hint">保存后生成</span>
              </div>
            </div>
          </div>
          <label class="field">
            <span class="field-label">业务定义</span>
            <el-input v-model="form.business_definition" type="textarea" :rows="3" placeholder="说明模型口径与用途" />
          </label>

          <div class="panel-divider"></div>
          <div class="field">
            <span class="field-label">版本信息</span>
            <div v-if="modelId" class="version-meta">
              <el-tag size="small" :type="modelMeta.status === 'published' ? 'success' : 'info'">
                {{ modelMeta.status === 'published' ? '已发布' : '草稿' }}
              </el-tag>
              <span>结构版本 v{{ modelMeta.version }}</span>
              <span>发布序号 {{ modelMeta.release_version }}</span>
              <span v-if="modelMeta.published_at">最近发布 {{ modelMeta.published_at }}</span>
            </div>
            <span v-else class="field-hint">保存后生成模型标识与版本</span>
            <span class="field-hint">结构版本与转换批准绑定，仅随模型结构变化；发布序号每次发布成功 +1。</span>
          </div>
        </div>
      </section>

      <!-- 2. 数据建模 -->
      <section v-else-if="step === 1" class="wizard-panel wizard-panel--fill">
        <header class="panel-head panel-head--row">
          <div>
            <h2>数据建模</h2>
            <p>从左侧添加数据表，拖拽节点调整位置，拖动节点两侧圆点连线建立关联。</p>
          </div>
          <div class="panel-actions">
            <el-button size="small" @click="autoLayout()">自动布局</el-button>
            <el-button size="small" @click="resetView()">重置视图</el-button>
          </div>
        </header>
        <div class="builder">
          <aside class="builder-aside">
            <div class="builder-aside-title">数据表</div>
            <div class="builder-aside-search">
              <el-input v-model="tableSearch" placeholder="搜索表名或编码" size="small" :prefix-icon="Search" clearable />
            </div>
            <div class="builder-aside-list">
              <div v-for="t in filteredTables" :key="t.table_name" class="table-option" @click="addTable(t.table_name)">
                <span class="table-dot" :style="{ background: LAYER_COLORS[t.warehouse_layer] || '#909399' }" />
                <div class="table-option-main">
                  <div class="table-option-name">{{ t.table_label }}</div>
                  <div class="table-option-code">{{ t.dataset_code }}</div>
                </div>
              </div>
              <el-empty v-if="!filteredTables.length" description="无表可添加" :image-size="48" />
            </div>
          </aside>

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
        </div>
      </section>

      <!-- 3. 输出字段 -->
      <section v-else-if="step === 2" class="wizard-panel wizard-panel--wide">
        <header class="panel-head panel-head--row">
          <div>
            <h2>输出字段</h2>
            <p>输出字段决定数据集对外可用的列；拖拽调整顺序，顺序即输出顺序。</p>
          </div>
          <div class="panel-actions">
            <el-button v-if="modelId" size="small" :icon="MagicStick" @click="cfDialogVisible = true">计算字段</el-button>
            <el-button size="small" :icon="Plus" @click="addOF">添加字段</el-button>
          </div>
        </header>
        <div class="panel-body">
          <div class="of-head">
            <span></span>
            <span>来源表</span>
            <span>来源字段</span>
            <span>输出编码</span>
            <span>输出名称</span>
            <span>类型</span>
            <span>角色</span>
            <span>描述</span>
            <span></span>
          </div>
          <PerformanceSortableList
            v-if="outputFields.length"
            :items="outputFields"
            item-key="_uid"
            :gap="8"
            @reorder="reorderFields"
          >
            <template #default="{ item: f, index, dragging, itemStyle }">
              <div class="of-row" :class="{ 'is-dragging': dragging }" :style="itemStyle" :data-sortable-index="index">
                <PerformanceDragHandle :label="`拖拽第${index + 1}个输出字段`" :dragging="dragging" />
                <el-select v-model="f.source_alias" size="small" filterable allow-create placeholder="来源表">
                  <el-option v-for="t in tables" :key="t.alias" :label="t.label || t.alias" :value="t.alias" />
                </el-select>
                <el-select v-model="f.source_column" size="small" filterable allow-create placeholder="来源字段">
                  <el-option
                    v-for="c in (tables.find(t => t.alias === f.source_alias)?.columns || [])"
                    :key="c.code"
                    :label="`${c.label}（${c.code}）`"
                    :value="c.code"
                  />
                </el-select>
                <el-input v-model="f.output_code" size="small" placeholder="output_code" />
                <el-input v-model="f.output_label" size="small" placeholder="输出名称" />
                <el-select v-model="f.data_type" size="small">
                  <el-option label="文本" value="string" />
                  <el-option label="数字" value="number" />
                  <el-option label="日期" value="date" />
                </el-select>
                <el-select v-model="f.agg_role" size="small">
                  <el-option label="维度" value="dimension" />
                  <el-option label="度量" value="measure" />
                </el-select>
                <el-input v-model="f.description" size="small" placeholder="描述" />
                <el-button text size="small" type="danger" @click="removeOF(index)">删除</el-button>
              </div>
            </template>
          </PerformanceSortableList>
          <el-empty v-else description="暂无输出字段，点击右上角「添加字段」" :image-size="60" />
        </div>
      </section>

      <!-- 4. 数据预览 -->
      <section v-else-if="step === 3" class="wizard-panel wizard-panel--wide">
        <header class="panel-head panel-head--row">
          <div>
            <h2>数据预览</h2>
            <p>进入本步自动按当前建模生成 SQL 并预览结果；预览不落库，用于确认关联与输出是否正确。</p>
          </div>
        </header>
        <div class="panel-body">
          <el-alert v-if="previewError" type="error" :title="previewError" show-icon :closable="false" />
          <div v-if="previewLoading" class="preview-loading">
            <el-icon class="is-loading" :size="24"><Loading /></el-icon>
          </div>
          <template v-else-if="previewData">
            <el-alert
              v-for="e in (previewV2?.errors || [])"
              :key="e.node_id"
              :title="`${e.node_id}: ${e.message}`"
              type="error"
              show-icon
              :closable="false"
              size="small"
            />
            <el-collapse v-if="previewV2?.sql" v-model="activeNames">
              <el-collapse-item title="SQL" name="sql"><pre class="vm-sql">{{ previewV2.sql }}</pre></el-collapse-item>
              <el-collapse-item title="关系" name="explain"><pre class="vm-explain">{{ previewV2.sql_explanation }}</pre></el-collapse-item>
            </el-collapse>
            <div class="preview-table">
              <el-table :data="previewData.items" border size="small" max-height="46vh">
                <el-table-column v-for="c in previewData.columns" :key="c" :prop="c" :label="c" min-width="90" show-overflow-tooltip />
              </el-table>
            </div>
            <p class="preview-summary">
              总数 {{ previewData.summary.main_count ?? '—' }} · 返回 {{ previewData.summary.result_count ?? '—' }} · 未匹配 {{ previewData.summary.unmatched_count ?? '—' }}
            </p>
          </template>
          <el-empty v-else description="暂无预览数据；完成前面步骤后进入本步会自动加载" :image-size="60" />
        </div>
      </section>

      <!-- 5. 建模校验 -->
      <section v-else class="wizard-panel wizard-panel--wide">
        <header class="panel-head panel-head--row">
          <div>
            <h2>建模校验</h2>
            <p>查看模型检查结果并修复问题；点击发布时服务端会重新校验，无需另行批准执行资格。</p>
          </div>
          <div class="panel-actions">
            <el-tag :type="validationReady === null ? 'info' : validationReady ? 'success' : 'warning'">
              {{ validationReady === null ? '待校验' : validationReady ? '校验通过' : '需检查' }}
            </el-tag>
          </div>
        </header>
        <div class="panel-body">
          <el-alert v-if="publishError" :title="publishError" type="error" show-icon :closable="false" />
          <ul v-if="publishIssues.length" aria-label="发布检查问题"><li v-for="(issue, index) in publishIssues" :key="`${issue.code}-${index}`">{{ issue.message }}</li></ul>
          <WarehouseModelReadinessPanel
            v-if="modelId"
            ref="readinessRef"
            :model-id="modelId"
            :model-version="modelMeta.version"
            :model-name="form.label || '当前模型'"
            @ready="validationReady = $event"
          />
          <el-empty v-else description="请先完成并保存前面的步骤" :image-size="60" />
        </div>
      </section>
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

    <!-- 计算字段弹窗 -->
    <el-dialog v-model="cfDialogVisible" title="管理计算字段" width="800px" v-if="modelId">
      <CalculatedFieldBridge :dataset-id="modelId" :datasets="[]" :tables="[]" @saved="onCalculatedFieldSaved" />
    </el-dialog>
  </FullScreenModal>
</template>

<style scoped>
.wizard-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-4);
  min-width: 0;
  min-height: 0;
  padding: var(--spacing-6);
  box-sizing: border-box;
  overflow-y: auto;
}
.wizard-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 100%;
  max-width: 1200px;
  min-height: 0;
  padding: var(--spacing-7) var(--spacing-8) var(--spacing-8);
  box-sizing: border-box;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: var(--color-surface-card);
  box-shadow: var(--shadow-card);
}
.wizard-panel--narrow { max-width: 640px; }
.wizard-panel--fill { flex: 1 1 auto; max-width: none; }
.panel-head { display: flex; flex-direction: column; flex-shrink: 0; gap: var(--spacing-2); }
.panel-head--row { flex-direction: row; align-items: flex-start; justify-content: space-between; gap: var(--spacing-4); }
.panel-head h2 { margin: 0; color: var(--color-text-primary); font-size: var(--font-size-xl); font-weight: 600; line-height: var(--line-height-tight); }
.panel-head p { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--line-height-base); }
.panel-body { display: flex; flex-direction: column; gap: var(--spacing-4); margin-top: var(--spacing-6); min-height: 0; }
.panel-actions { display: flex; flex-shrink: 0; align-items: center; gap: var(--spacing-2); flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: var(--spacing-2); min-width: 0; }
.field :deep(.el-select) { width: 100%; }
.field-label { color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: 22px; }
.required { margin-left: var(--spacing-1); color: var(--color-text-danger-strong); font-style: normal; }
.field-hint { color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--spacing-5) var(--spacing-6); }
.inline-meta { display: flex; align-items: center; min-height: var(--performance-control-height); }
.save-state { color: var(--color-text-secondary); font-size: var(--font-size-xs); white-space: nowrap; }
.panel-divider { height: 1px; background: var(--color-border-light); }
.version-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-2); color: var(--color-text-secondary); font-size: var(--font-size-sm); }
.version-table { width: 100%; }

/* ===== 数据建模 ===== */
.builder {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  margin-top: var(--spacing-5);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.builder-aside {
  display: flex;
  flex-direction: column;
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border-light);
  background: var(--color-bg-subtle);
}
.builder-aside-title { padding: var(--spacing-3) var(--spacing-4) 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); font-weight: 600; }
.builder-aside-search { padding: var(--spacing-2) var(--spacing-3); }
.builder-aside-list { display: flex; flex: 1 1 auto; flex-direction: column; gap: 2px; overflow-y: auto; padding: 0 var(--spacing-2) var(--spacing-3); }
.table-option { display: flex; align-items: center; gap: var(--spacing-2); padding: var(--spacing-2) var(--spacing-3); border-radius: var(--radius-sm); cursor: pointer; }
.table-option:hover { background: var(--color-bg-hover); }
.table-dot { width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; }
.table-option-main { min-width: 0; }
.table-option-name { overflow: hidden; color: var(--color-text-primary); font-size: var(--font-size-sm); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.table-option-code { overflow: hidden; color: var(--color-text-placeholder); font-family: var(--font-mono); font-size: var(--font-size-xs); text-overflow: ellipsis; white-space: nowrap; }

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

/* ===== 输出字段 ===== */
.of-head,
.of-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) 96px 88px minmax(0, 1.2fr) 56px;
  gap: var(--spacing-2);
  align-items: center;
}
.of-head { padding: 0 var(--spacing-3); color: var(--color-text-secondary); font-size: var(--font-size-xs); line-height: 20px; }
.of-row {
  padding: var(--spacing-2) var(--spacing-3);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-surface-card);
}
.of-row.is-dragging { box-shadow: var(--shadow-popover); }

/* ===== 预览 ===== */
.preview-loading { display: flex; justify-content: center; padding: var(--spacing-8) 0; }
.preview-table { overflow-x: auto; }
.preview-summary { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); }
.vm-sql { max-height: 180px; margin: 0; padding: var(--spacing-3); border-radius: var(--radius-sm); background: var(--color-bg-subtle); font-size: var(--font-size-xs); overflow-x: auto; }
.vm-explain { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-xs); white-space: pre-wrap; }

/* ===== 抽屉 ===== */
.vm-fg { margin-bottom: 10px; }
.vm-fg label { display: block; font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; }
.vm-kp { display: flex; gap: 4px; align-items: center; margin-bottom: 4px; }
</style>
