<template>
  <div class="topology-page">
    <el-card>
      <template #header>
        <div class="page-header">
          <h2>依赖拓扑</h2>
          <div>
            <el-select v-model="filterType" placeholder="过滤" clearable style="width:120px" @change="load">
              <el-option label="全部" value=""/><el-option label="系统" value="system"/><el-option label="资源" value="resource"/>
            </el-select>
            <el-button @click="load" style="margin-left:8px">刷新</el-button>
          </div>
        </div>
      </template>
      <div class="topology-canvas">
        <div v-for="n in nodes" :key="n.id" class="topo-node" :class="'node-' + n.type" :style="{left:n.x+'px',top:n.y+'px'}">
          <div class="node-label">{{ n.label }}</div>
          <div class="node-type">{{ n.type }}</div>
        </div>
        <svg class="topo-edges"><line v-for="(e,i) in edges" :key="i" :x1="edgeCoords[e.from]?.x" :y1="edgeCoords[e.from]?.y" :x2="edgeCoords[e.to]?.x" :y2="edgeCoords[e.to]?.y" stroke="#cbd5e1" stroke-width="2"/></svg>
      </div>
    </el-card>

    <el-card style="margin-top:12px">
      <template #header><h3>影响分析</h3></template>
      <el-form inline>
        <el-form-item label="类型"><el-select v-model="impactType"><el-option label="系统" value="system"/><el-option label="资源" value="resource"/><el-option label="流水线" value="pipeline"/></el-select></el-form-item>
        <el-form-item label="ID"><el-input-number v-model="impactId" :min="1"/></el-form-item>
        <el-form-item><el-button type="primary" @click="analyzeImpact">分析</el-button></el-form-item>
      </el-form>
      <div v-if="impactResult">
        <el-tag v-if="impactResult.affected_pipelines?.length">受影响流水线: {{ impactResult.affected_pipelines.map((p:any)=>p.code).join(', ') }}</el-tag>
        <el-tag v-if="impactResult.affected_resources?.length" type="warning">受影响资源: {{ impactResult.affected_resources.map((r:any)=>r.code).join(', ') }}</el-tag>
        <el-empty v-if="!impactResult.affected_pipelines?.length && !impactResult.affected_resources?.length" description="无关联资产"/>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { topologyApi } from '@/api/ucp'

const nodes = ref<any[]>([])
const edges = ref<any[]>([])
const filterType = ref('')
const impactType = ref('system')
const impactId = ref(1)
const impactResult = ref<any>(null)
const edgeCoords = reactive<Record<string,{x:number;y:number}>>({})

const typeColors: Record<string,string> = { system: '#3b82f6', resource: '#10b981', pipeline: '#f59e0b', template: '#8b5cf6' }

async function load() {
  try {
    const data = await topologyApi.get()
    nodes.value = data.nodes
    edges.value = data.edges
    // 布局：简单网格排列
    const cols = 4
    nodes.value.forEach((n, i) => {
      n.x = 20 + (i % cols) * 240
      n.y = 20 + Math.floor(i / cols) * 80
      edgeCoords[n.id] = { x: n.x + 100, y: n.y + 30 }
    })
  } catch (e: any) { ElMessage.warning('拓扑加载失败') }
}

async function analyzeImpact() {
  try {
    impactResult.value = await topologyApi.impact(impactType.value, impactId.value)
  } catch (e: any) { ElMessage.error('分析失败') }
}

onMounted(() => load())
</script>

<style scoped>
.page-header { display:flex; justify-content:space-between; align-items:center }
.topology-canvas { position:relative; min-height:400px; border:1px solid #e5e7eb; border-radius:8px; overflow:auto; background:#fafbfc }
.topo-node { position:absolute; width:200px; padding:8px 12px; border-radius:6px; background:#fff; border:2px solid #e5e7eb; cursor:pointer; text-align:center }
.node-system { border-color:#3b82f6 }
.node-resource { border-color:#10b981 }
.node-pipeline { border-color:#f59e0b }
.node-template { border-color:#8b5cf6 }
.node-label { font-size:13px; font-weight:600 }
.node-type { font-size:11px; color:#8f959e }
.topo-edges { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none }
</style>
