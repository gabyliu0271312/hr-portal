<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus, Delete, Finished, Search } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import {
  getModel, updateModel, createModel, publishModel, previewModel, saveOutputFields,
  listAssets, type ModelCreatePayload, type ModelUpdatePayload,
  type OutputFieldPayload, type PreviewResult, type Asset,
} from '@/api/warehouse'

const route = useRoute(); const router = useRouter()
const userStore = useUserStore()
const modelId = route.params.id ? Number(route.params.id) : null
const isNew = !modelId
const canEdit = computed(() => isNew ? userStore.hasOp('warehouse.assets','C') : userStore.hasOp('warehouse.assets','U'))

const form = ref({ name: '', warehouse_layer: 'DWD', subject_area: '', business_definition: '', owner_name: '' })
const loading = ref(false); const saving = ref(false); const error = ref<string|null>(null)

const LAYER_LABELS: Record<string,string> = { ODS:'ODS 原始数据', DWD:'DWD 明细数据', DWS:'DWS 汇总数据', ADS:'ADS 应用数据' }
const LAYER_COLORS: Record<string,string> = { ODS:'#8b9dc3', DWD:'#5a9e6f', DWS:'#d4a24e', ADS:'#c4685c' }
const JOIN_COLORS: Record<string,string> = { left:'#5a9e6f', inner:'#3b6ff5', right:'#d4a24e' }
const NODE_W = 200; const NODE_H = 52; const COL_GAP = 300; const ROW_GAP = 140; const PAD = 36

// 表节点
interface ColInfo { code: string; label: string }
interface TableNode { id?: number; table_name: string; alias: string; label?: string; layer?: string; x: number; y: number; columns: ColInfo[] }
const tables = ref<TableNode[]>([])
interface RelationEdge { id?: number; from: string; to: string; join_type: string; cardinality: string; keys: {left:string;right:string}[] }
const relations = ref<RelationEdge[]>([])

const availableTables = ref<Asset[]>([]); const tableSearch = ref('')
const filteredTables = computed(() => {
  const m = new Set(tables.value.map(t => t.table_name))
  return availableTables.value.filter(t => !m.has(t.table_name) && (tableSearch.value ? t.table_label.includes(tableSearch.value)||t.table_name.includes(tableSearch.value) : true))
})
const selectedNode = ref<string|null>(null); const selectedEdge = ref<number|null>(null)
const currentEdge = computed(() => selectedEdge.value !== null ? relations.value[selectedEdge.value] : null)
const dragNode = ref<string|null>(null); const dragStart = ref({x:0,y:0,nx:0,ny:0})

const outputFields = ref<OutputFieldPayload[]>([]); const previewData = ref<PreviewResult|null>(null); const previewLoading = ref(false)

// 单线端点
function edgeEndpoints(rel: RelationEdge) {
  const a = tables.value.find(t=>t.alias===rel.from), b = tables.value.find(t=>t.alias===rel.to)
  if (!a||!b) return null
  return { x1:a.x+NODE_W, y1:a.y+NODE_H/2, x2:b.x, y2:b.y+NODE_H/2 }
}

// 自动布局：拓扑分层，同列垂直堆叠
function autoLayout() {
  if (!tables.value.length) return
  const out = new Map<string,Set<string>>(); const ind = new Map<string,number>()
  for (const t of tables.value) { out.set(t.alias,new Set()); ind.set(t.alias,0) }
  for (const r of relations.value) {
    if (out.has(r.from)&&ind.has(r.to)) { out.get(r.from)!.add(r.to); ind.set(r.to,(ind.get(r.to)||0)+1) }
  }
  const depth = new Map<string,number>(); const q: string[] = []
  for (const [k,v] of ind) { if (v===0) { depth.set(k,0); q.push(k) } }
  if (!q.length) for (const t of tables.value) { depth.set(t.alias,0); q.push(t.alias) }
  while (q.length) {
    const c = q.shift()!; const cd = depth.get(c)||0
    for (const n of out.get(c)||[]) { ind.set(n,(ind.get(n)||1)-1); if (!depth.has(n)||depth.get(n)!<cd+1) depth.set(n,cd+1); if ((ind.get(n)||0)<=0&&!q.includes(n)) q.push(n) }
  }
  const cols = new Map<number,string[]>()
  for (const t of tables.value) { const d = depth.get(t.alias)??0; if (!cols.has(d)) cols.set(d,[]); cols.get(d)!.push(t.alias) }
  const maxR = Math.max(...Array.from(cols.values()).map(c=>c.length),1)
  for (const [col,aliases] of cols) {
    const x = PAD+col*COL_GAP; const th = aliases.length*ROW_GAP; const sy = PAD+(maxR*ROW_GAP-th)/2
    aliases.forEach((a,i)=>{ const n=tables.value.find(t=>t.alias===a); if(n){n.x=x;n.y=Math.round(sy+i*ROW_GAP)} })
  }
}

// ===== 拖拽连线（端口吸附 + 淡出）=====
const connecting = ref<{from:string;mx:number;my:number}|null>(null)
const hoverTarget = ref<string|null>(null)
const fadingLine = ref(false) // 松手后淡出动画

function isConnected(alias: string) {
  return relations.value.some(r => r.from === alias || r.to === alias)
}
function connectedAliases(alias: string) {
  const set = new Set<string>()
  for (const r of relations.value) { if (r.from===alias) set.add(r.to); if (r.to===alias) set.add(r.from) }
  return set
}
function startConnect(e:MouseEvent, alias:string, side: 'left'|'right') {
  if (!isNew) return; e.stopPropagation(); e.preventDefault()
  const n = tables.value.find(t=>t.alias===alias); if (!n) return
  const x = side==='right' ? n.x+NODE_W : n.x
  connecting.value = { from: alias, mx: e.clientX, my: e.clientY }
}
function onMove(e:MouseEvent) {
  if (dragNode.value) {
    const n = tables.value.find(t=>t.alias===dragNode.value); if(!n)return
    n.x = Math.round(dragStart.value.nx+(e.clientX-dragStart.value.x))
    n.y = Math.round(dragStart.value.ny+(e.clientY-dragStart.value.y))
  }
  if (connecting.value) {
    // 吸附：检查是否接近任意目标节点的左/右端口
    const cvEl = document.querySelector('.vm-cv'); if (!cvEl) { connecting.value.mx=e.clientX;connecting.value.my=e.clientY;return }
    const cvRect = cvEl.getBoundingClientRect()
    const mx = e.clientX-cvRect.left+cvEl.scrollLeft; const my = e.clientY-cvRect.top+cvEl.scrollTop
    let snapped = false
    for (const t of tables.value) {
      if (t.alias===connecting.value.from) continue
      // 检查鼠标是否接近目标节点的左端口（40px 范围）
      const lx = t.x; const ly = t.y+NODE_H/2
      const dist = Math.hypot(mx-lx, my-ly)
      if (dist < 48) {
        connecting.value.mx = lx; connecting.value.my = ly
        hoverTarget.value = t.alias; snapped = true; break
      }
      // 也检查右端口
      const rx = t.x+NODE_W; const ry = t.y+NODE_H/2
      const distR = Math.hypot(mx-rx, my-ry)
      if (distR < 48) {
        connecting.value.mx = rx; connecting.value.my = ry
        hoverTarget.value = t.alias; snapped = true; break
      }
    }
    if (!snapped) { connecting.value.mx = mx; connecting.value.my = my; hoverTarget.value = null }
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
// ===== 拖拽节点 =====
function onDragStart(e:MouseEvent, alias:string) { if(e.button!==0)return;e.preventDefault();const n=tables.value.find(t=>t.alias===alias);if(!n)return;dragNode.value=alias;dragStart.value={x:e.clientX,y:e.clientY,nx:n.x,ny:n.y} }

// 加载
async function load() {
  loading.value=true;error.value=null
  try {
    availableTables.value = (await listAssets({ page_size:200 })).items
    if (modelId) {
      const d = await getModel(modelId)
      form.value = { name:d.name, warehouse_layer:d.warehouse_layer, subject_area:d.subject_area||'', business_definition:d.business_definition||'', owner_name:d.owner_name||'' }
      for (const t of d.tables) {
        const asset = availableTables.value.find(a=>a.table_name===t.table_name)
        let cols:ColInfo[]=[]
        try{const {listAssetColumns}=await import('@/api/warehouse');const r=await listAssetColumns(t.table_name);cols=(r.columns||[]).map((c:any)=>({code:c.column_code,label:c.column_label||c.column_code}))}catch{}
        tables.value.push({id:t.id,table_name:t.table_name,alias:t.alias,label:asset?.table_label||t.table_name,layer:asset?.warehouse_layer||'ODS',x:0,y:0,columns:cols})
      }
      relations.value = d.relations.map((r:any)=>({id:r.id,from:r.left_alias,to:r.right_alias,join_type:r.join_type,cardinality:r.cardinality,keys:r.keys||[]}))
      outputFields.value = d.output_fields.map((f:any)=>({source_alias:f.source_alias,source_column:f.source_column,output_code:f.output_code,output_label:f.output_label,data_type:f.data_type,description:f.description,agg_role:f.agg_role,is_sensitive:f.is_sensitive,is_visible:f.is_visible,display_order:f.display_order}))
      await nextTick(); autoLayout()
    }
  } catch(e:any){error.value=e?.response?.data?.detail||'加载失败'}finally{loading.value=false}
}

async function addTable(tn:string) {
  if(!isNew){ElMessage.info('V1:不支持增减表');return}
  const a=availableTables.value.find(t=>t.table_name===tn);if(!a)return
  let cols:ColInfo[]=[]
  try{const {listAssetColumns}=await import('@/api/warehouse');const r=await listAssetColumns(tn);cols=(r.columns||[]).map((c:any)=>({code:c.column_code,label:c.column_label||c.column_code}))}catch{}
  tables.value.push({table_name:tn,alias:tn,label:a.table_label,layer:a.warehouse_layer,x:0,y:0,columns:cols})
  await nextTick();autoLayout()
}
function removeTable(alias:string) { if(!isNew){ElMessage.info('V1:不支持增减表');return};tables.value=tables.value.filter(t=>t.alias!==alias);relations.value=relations.value.filter(r=>r.from!==alias&&r.to!==alias);if(selectedNode.value===alias)selectedNode.value=null;autoLayout() }
function addRelation() { if(!isNew){ElMessage.info('V1:不支持增减关联');return};if(tables.value.length<2){ElMessage.warning('至少2张表');return};relations.value.push({from:tables.value[0].alias,to:tables.value[tables.value.length-1].alias,join_type:'left',cardinality:'1:N',keys:[{left:'',right:''}]});autoLayout() }
function removeRelation(i:number) { if(!isNew){ElMessage.info('V1:不支持删除关联');return};relations.value.splice(i,1);selectedEdge.value=null;autoLayout() }
function addKey(ri:number) { relations.value[ri].keys.push({left:'',right:''}) }
function removeKey(ri:number,ki:number) { relations.value[ri].keys.splice(ki,1) }
function addOF() { outputFields.value.push({source_alias:tables.value[0]?.alias||'',source_column:'',output_code:'',output_label:'',data_type:'string',agg_role:'dimension',is_sensitive:false,is_visible:true,display_order:outputFields.value.length}) }
function removeOF(i:number) { outputFields.value.splice(i,1) }

async function saveDraft() {
  saving.value=true
  try {
    if (modelId) {
      await updateModel(modelId,form.value as ModelUpdatePayload);const v=outputFields.value.filter(f=>f.output_code&&f.output_label);if(v.length)await saveOutputFields(modelId,v)
      ElMessage.success('已更新')
    } else {
      const tl=tables.value.map(t=>({table_name:t.table_name,alias:t.alias}));const rl=relations.value.filter(r=>r.from&&r.to).map(r=>({left_alias:r.from,right_alias:r.to,join_type:r.join_type,cardinality:r.cardinality,left_keys:r.keys.filter(k=>k.left).map(k=>k.left),right_keys:r.keys.filter(k=>k.right).map(k=>k.right)}))
      const res=await createModel({name:form.value.name,warehouse_layer:form.value.warehouse_layer,subject_area:form.value.subject_area||undefined,business_definition:form.value.business_definition||undefined,owner_name:form.value.owner_name||undefined,tables:tl,relations:rl})
      ElMessage.success(`已创建 ID:${res.id}`);router.replace(`/warehouse/modeling/visual/${res.id}`)
    }
  } catch(e:any){ElMessage.error(e?.response?.data?.detail||'保存失败')}finally{saving.value=false}
}
async function doPublish() { if(!modelId){ElMessage.warning('请先保存');return};try{await ElMessageBox.confirm('确定发布？','确认',{type:'info'});const v=outputFields.value.filter(f=>f.output_code&&f.output_label);if(v.length)await saveOutputFields(modelId,v);await publishModel(modelId);ElMessage.success('已发布');router.push('/warehouse/modeling')}catch{} }
async function doPreview() { if(!modelId)return;previewLoading.value=true;try{previewData.value=await previewModel(modelId)}catch{ElMessage.error('预览失败')}finally{previewLoading.value=false} }
function goBack() { router.back() }
onMounted(load)
</script>

<template>
  <div class="vm-root" @mousemove="onMove" @mouseup="onUp" @mouseleave="onUp">
    <!-- 工具栏 -->
    <div class="vm-bar">
      <el-button text :icon="ArrowLeft" @click="goBack">返回</el-button>
      <el-input v-model="form.name" placeholder="模型名称" size="small" style="width:180px" />
      <el-select v-model="form.warehouse_layer" size="small" style="width:140px"><el-option v-for="(v,k) in LAYER_LABELS" :key="k" :label="v" :value="k" /></el-select>
      <el-input v-model="form.subject_area" placeholder="主题域" size="small" style="width:90px" />
      <el-input v-model="form.owner_name" placeholder="负责人" size="small" style="width:90px" />
      <span style="flex:1" />
      <el-button size="small" @click="autoLayout()">自动布局</el-button>
      <el-button v-if="canEdit" size="small" :loading="saving" @click="saveDraft">保存</el-button>
      <el-button v-if="modelId&&userStore.hasOp('warehouse.assets','U')" size="small" type="success" :icon="Finished" @click="doPublish">发布</el-button>
      <el-button size="small" @click="doPreview" :loading="previewLoading">预览</el-button>
      <el-tag v-if="!isNew" size="small" type="info">V1: 只读</el-tag>
    </div>
    <el-alert v-if="error" type="error" :title="error" show-icon :closable="false" style="margin:0 12px" />

    <div v-loading="loading" class="vm-body">
      <!-- 左 -->
      <div class="vm-left">
        <div class="vm-lt">数据表</div>
        <div class="vm-ls"><el-input v-model="tableSearch" placeholder="搜索..." size="small" :prefix-icon="Search" clearable /></div>
        <div class="vm-ll">
          <div v-for="t in filteredTables" :key="t.table_name" class="vm-to" @click="addTable(t.table_name)"><span class="vm-dot" :style="{background:LAYER_COLORS[t.warehouse_layer]||'#909399'}" /><div class="vm-oi"><div class="vm-on">{{ t.table_label }}</div><div class="vm-op">{{ t.table_name }}</div></div></div>
          <el-empty v-if="!filteredTables.length" description="无表可添加" :image-size="48" />
        </div>
      </div>

      <!-- 中 -->
      <div class="vm-cv">
        <svg class="vm-svg">
          <defs><marker v-for="(r,i) in relations" :key="'m'+i" :id="'m'+i" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" :fill="JOIN_COLORS[r.join_type]||'#bcc4d0'" /></marker></defs>
          <g v-for="(r,i) in relations" :key="'e'+i" @click.stop="selectedEdge=i;selectedNode=null" style="cursor:pointer">
            <template v-if="edgeEndpoints(r)">
              <!-- 隐形宽线提高点击区域 -->
              <line :x1="edgeEndpoints(r)!.x1" :y1="edgeEndpoints(r)!.y1" :x2="edgeEndpoints(r)!.x2" :y2="edgeEndpoints(r)!.y2" stroke="transparent" stroke-width="14" />
              <line :x1="edgeEndpoints(r)!.x1" :y1="edgeEndpoints(r)!.y1" :x2="edgeEndpoints(r)!.x2" :y2="edgeEndpoints(r)!.y2" :stroke="selectedEdge===i?'#3b6ff5':(JOIN_COLORS[r.join_type]||'#bcc4d0')" :stroke-width="selectedEdge===i?2.5:1.8" :marker-end="`url(#m${i})`" class="vm-el" :class="{a:selectedEdge===i}" />
              <rect :x="(edgeEndpoints(r)!.x1+edgeEndpoints(r)!.x2)/2-44" :y="(edgeEndpoints(r)!.y1+edgeEndpoints(r)!.y2)/2-14" width="88" height="24" rx="4" fill="white" :stroke="selectedEdge===i?'#3b6ff5':(JOIN_COLORS[r.join_type]||'#bcc4d0')" :stroke-width="selectedEdge===i?2:1" />
              <text :x="(edgeEndpoints(r)!.x1+edgeEndpoints(r)!.x2)/2" :y="(edgeEndpoints(r)!.y1+edgeEndpoints(r)!.y2)/2+4" text-anchor="middle" font-size="9" font-weight="700" :fill="selectedEdge===i?'#3b6ff5':(JOIN_COLORS[r.join_type]||'#6b7280')" style="font-family:monospace;pointer-events:none">{{ r.join_type.toUpperCase() }} JOIN</text>
            </template>
          </g>
        </svg>

        <!-- 节点 -->
        <div v-for="t in tables" :key="t.alias" class="vm-nd" :data-alias="t.alias"
          :class="{s:selectedNode===t.alias,h:hoverTarget===t.alias,connecting:connecting?.from===t.alias}"
          :style="{left:t.x+'px',top:t.y+'px',width:NODE_W+'px',borderColor:hoverTarget===t.alias?'#3b6ff5':selectedNode===t.alias?'#3b6ff5':(LAYER_COLORS[t.layer||'ODS']||'#e2e5ea')}"
          @mousedown.stop="onDragStart($event,t.alias)" @click.stop="selectedNode=t.alias;selectedEdge=null">
          <div class="vm-nh" :style="{background:(LAYER_COLORS[t.layer||'ODS']||'#909399')+'18'}">
            <!-- 左端口 -->
            <div v-if="isNew" class="vm-port vm-port-left"
              :class="{linked:connectedAliases(t.alias).size>0}"
              @mousedown.stop="startConnect($event, t.alias, 'left')"
              title="拖到另一张表建立关联" />
            <span class="vm-nl" :style="{background:LAYER_COLORS[t.layer||'ODS']||'#909399'}">{{ t.layer||'ODS' }}</span>
            <span class="vm-na">{{ t.alias }}</span>
            <span class="vm-np">{{ t.label||t.table_name }}</span>
            <!-- 右端口 -->
            <div v-if="isNew" class="vm-port vm-port-right"
              :class="{linked:connectedAliases(t.alias).size>0}"
              @mousedown.stop="startConnect($event, t.alias, 'right')"
              title="拖到另一张表建立关联" />
            <el-button v-if="isNew" text size="small" type="danger" style="flex-shrink:0;padding:2px" @mousedown.stop @click.stop="removeTable(t.alias)"><el-icon><Delete /></el-icon></el-button>
          </div>
        </div>

        <!-- 拖拽连线中的临时线（吸附到端口） -->
        <svg v-if="connecting" class="vm-svg" style="z-index:5" :class="{fading: fadingLine}">
          <line
            :x1="(tables.find(t=>t.alias===connecting!.from)?.x||0)+NODE_W"
            :y1="(tables.find(t=>t.alias===connecting!.from)?.y||0)+NODE_H/2"
            :x2="connecting.mx" :y2="connecting.my"
            :stroke="hoverTarget?'#30a46c':'#3b6ff5'"
            :stroke-width="hoverTarget?2.5:2"
            :stroke-dasharray="hoverTarget?'none':'6,4'"
            style="transition:stroke .15s,stroke-dasharray .15s" />
          <circle v-if="hoverTarget" :cx="connecting.mx" :cy="connecting.my" r="5" fill="#30a46c" opacity="0.8">
            <animate attributeName="r" values="5;7;5" dur="0.8s" repeatCount="indefinite" />
          </circle>
        </svg>

        <div v-if="!tables.length" class="vm-em"><div style="font-size:36px;opacity:.10;margin-bottom:8px">◈</div><div style="color:#9ca3af;font-size:13px">从左侧添加表开始建模</div></div>
      </div>

    </div>

    <!-- 编辑弹窗（节点/关联） -->
    <el-dialog :model-value="!!(selectedNode||selectedEdge!==null)" :title="selectedNode||`关联 ${(selectedEdge||0)+1}`" width="420px" destroy-on-close @close="selectedNode=null;selectedEdge=null">
      <template v-if="selectedNode">
        <div class="vm-fg"><label>别名</label><el-input v-model="tables.find(t=>t.alias===selectedNode)!.alias" size="small" /></div>
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
            <el-select v-model="currentEdge.keys[ki].left" size="small" style="width:130px" filterable placeholder="左表字段">
              <el-option v-for="c in (tables.find(t=>t.alias===currentEdge!.from)?.columns||[])" :key="c.code" :label="`${c.label} (${c.code})`" :value="c.code" /></el-select>
            <span style="color:#9ca3af;flex-shrink:0">=</span>
            <el-select v-model="currentEdge.keys[ki].right" size="small" style="width:130px" filterable placeholder="右表字段">
              <el-option v-for="c in (tables.find(t=>t.alias===currentEdge!.to)?.columns||[])" :key="c.code" :label="`${c.label} (${c.code})`" :value="c.code" /></el-select>
            <el-button v-if="isNew" text size="small" @click="removeKey(selectedEdge!,ki)">×</el-button>
          </div>
          <el-button v-if="isNew" size="small" style="margin-top:4px" @click="addKey(selectedEdge!)">+ 字段对</el-button></div>
        <el-button v-if="isNew" size="small" type="danger" style="margin-top:12px;width:100%" @click="removeRelation(selectedEdge!)">删除关联</el-button>
      </template>
    </el-dialog>

    <!-- 底部 -->
    <div class="vm-bt">
      <div class="vm-bb"><span style="font-weight:600;font-size:12px">输出字段</span><el-button v-if="canEdit" size="small" :icon="Plus" @click="addOF">添加</el-button></div>
      <div class="vm-ow">
        <el-table :data="outputFields" border size="small" max-height="100">
          <el-table-column label="来源表" width="80"><template #default="{row,$index}"><el-input v-model="outputFields[$index].source_alias" size="small" :disabled="!canEdit" /></template></el-table-column>
          <el-table-column label="来源字段" width="90"><template #default="{row,$index}"><el-input v-model="outputFields[$index].source_column" size="small" :disabled="!canEdit" /></template></el-table-column>
          <el-table-column label="输出编码" width="90"><template #default="{row,$index}"><el-input v-model="outputFields[$index].output_code" size="small" :disabled="!canEdit" /></template></el-table-column>
          <el-table-column label="输出名称" width="90"><template #default="{row,$index}"><el-input v-model="outputFields[$index].output_label" size="small" :disabled="!canEdit" /></template></el-table-column>
          <el-table-column label="描述" min-width="70"><template #default="{row,$index}"><el-input v-model="outputFields[$index].description" size="small" :disabled="!canEdit" /></template></el-table-column>
          <el-table-column width="46"><template #default="{row,$index}"><el-button v-if="canEdit" text size="small" type="danger" @click="removeOF($index)">×</el-button></template></el-table-column>
        </el-table>
      </div>
      <div v-if="previewData" class="vm-pv">
        <div style="font-weight:600;font-size:12px;margin-bottom:4px">预览</div>
        <el-table :data="previewData.items" border size="small" max-height="90"><el-table-column v-for="c in previewData.columns" :key="c" :prop="c" :label="c" min-width="70" show-overflow-tooltip /></el-table>
        <el-descriptions :column="3" size="small" border style="margin-top:2px"><el-descriptions-item label="总数">{{ previewData.summary.main_count??'—' }}</el-descriptions-item><el-descriptions-item label="返回">{{ previewData.summary.result_count??'—' }}</el-descriptions-item><el-descriptions-item label="未匹配">{{ previewData.summary.unmatched_count??'—' }}</el-descriptions-item></el-descriptions>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vm-root{display:flex;flex-direction:column;height:calc(100vh - 56px);overflow:hidden;background:#f8f9fb}
.vm-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-bottom:1px solid #e2e5ea;flex-shrink:0;z-index:10}
.vm-body{display:flex;flex:1;min-height:0;overflow:hidden}
.vm-left{width:210px;flex-shrink:0;background:#fff;border-right:1px solid #e2e5ea;display:flex;flex-direction:column;overflow:hidden}
.vm-lt{padding:10px 12px;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:1px solid #e2e5ea}
.vm-ls{padding:6px 8px}
.vm-ll{flex:1;overflow-y:auto;padding:2px 6px}
.vm-to{padding:7px 8px;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:8px;transition:background .1s}
.vm-to:hover{background:#f3f4f6}
.vm-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}
.vm-oi{flex:1;min-width:0}
.vm-on{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vm-op{font-size:10px;color:#9ca3af;margin-top:1px}

.vm-cv{flex:1;position:relative;overflow:auto;background-color:#f4f5f7;background-image:radial-gradient(circle,#dde0e4 1px,transparent 1px);background-size:20px 20px}
.vm-svg{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1}
.vm-svg line,.vm-svg rect,.vm-svg text{pointer-events:auto}
.vm-el{transition:stroke .15s;cursor:pointer}
.vm-el:hover,.vm-el.a{stroke:#3b6ff5!important;stroke-width:2.5!important}

.vm-nd{position:absolute;background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.06);cursor:grab;border:2px solid #e2e5ea;transition:box-shadow .15s,border-color .15s;user-select:none;z-index:2;overflow:hidden}
.vm-nd:hover{box-shadow:0 8px 24px rgba(0,0,0,.09)}
.vm-nd.s{border-color:#3b6ff5;box-shadow:0 0 0 3px rgba(59,111,245,.12),0 4px 16px rgba(0,0,0,.08)}
.vm-nh{display:flex;align-items:center;gap:6px;padding:0 8px;height:52px}
.vm-nl{font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;color:#fff;letter-spacing:.03em;white-space:nowrap}
.vm-na{font-weight:600;font-size:13px;color:#1a1d23;white-space:nowrap}
.vm-np{font-size:10px;color:#9ca3af;margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px}
/* 连接端口 */
.vm-port{width:10px;height:10px;border-radius:50%;background:#c4cdd5;border:2px solid #fff;flex-shrink:0;cursor:crosshair;transition:transform .2s cubic-bezier(.34,1.56,.64,1),background .2s,box-shadow .2s;position:relative;z-index:3}
.vm-port-left{margin-right:2px}
.vm-port-right{margin-left:2px}
.vm-port:hover{transform:scale(1.6);background:#3b6ff5;box-shadow:0 0 0 4px rgba(59,111,245,.25)}
.vm-nd:hover .vm-port{background:#8b9dc3}
.vm-nd:hover .vm-port:hover{background:#3b6ff5}
.vm-port.linked{background:#5a9e6f;box-shadow:0 0 0 2px rgba(90,158,111,.3)}
.vm-port.linked:hover{background:#30a46c;box-shadow:0 0 0 4px rgba(48,164,108,.35)}
/* 连线中端口高亮 */
.vm-nd.connecting .vm-port{background:#3b6ff5;transform:scale(1.3);box-shadow:0 0 0 3px rgba(59,111,245,.3)}
/* hover高亮 */
.vm-nd.h .vm-port{background:#3b6ff5;transform:scale(1.3);box-shadow:0 0 0 3px rgba(59,111,245,.3)}
/* fade-out */
.fading{opacity:0;transition:opacity .2s ease-out}
/* 连线吸附 pulse */
@keyframes pulse{0%,100%{r:5;opacity:.8}50%{r:7;opacity:.6}}
.vm-nd.h{border-color:#3b6ff5!important;box-shadow:0 0 0 3px rgba(59,111,245,.15)!important}
.vm-em{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}

.vm-rt{width:260px;flex-shrink:0;background:#fff;border-left:1px solid #e2e5ea;padding:14px;overflow-y:auto}
.vm-tt{font-size:14px;font-weight:600;margin:0 0 14px;color:#1a1d23}
.vm-fg{margin-bottom:12px}
.vm-fg label{display:block;font-size:10px;font-weight:600;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}
.vm-kp{display:flex;gap:4px;align-items:center;margin-bottom:3px}
.vm-ep{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%}

.vm-bt{flex-shrink:0;background:#fff;border-top:1px solid #e2e5ea;max-height:220px;overflow-y:auto}
.vm-bb{padding:8px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e5ea}
.vm-ow{padding:6px 10px}
.vm-pv{padding:8px 14px;border-top:1px solid #e2e5ea}
</style>
