<template>
  <div class="asset-catalog-page">
    <el-card>
      <template #header><h2>集成资产目录</h2></template>
      <div class="kpi-grid">
        <div class="kpi-card" v-for="k in kpis" :key="k.label">
          <div class="kpi-value">{{ k.value }}</div>
          <div class="kpi-label">{{ k.label }}</div>
          <div class="kpi-sub" v-if="k.sub">{{ k.sub }}</div>
        </div>
      </div>
    </el-card>

    <el-card style="margin-top:12px">
      <template #header><div class="card-title">资产列表</div></template>
      <el-tabs v-model="activeTab" @tab-change="loadAssets">
        <el-tab-pane label="系统" name="system"/>
        <el-tab-pane label="资源" name="resource"/>
        <el-tab-pane label="流水线" name="pipeline"/>
      </el-tabs>
      <el-form inline class="filter-bar"><el-form-item><el-input v-model="keyword" clearable placeholder="搜索" @keyup.enter="loadAssets"/></el-form-item></el-form>
      <el-table :data="assetRows" v-loading="loading" stripe border>
        <el-table-column prop="code" label="编码" width="180"><template #default="{row}"><code>{{ row.code }}</code></template></el-table-column>
        <el-table-column prop="name" label="名称" min-width="160"/>
        <el-table-column label="标签" width="200"><template #default="{row}"><el-tag v-for="(v,k) in row.tags" :key="k" size="small" style="margin:1px">{{k}}:{{v}}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="120"><template #default="{row}"><el-button size="small" @click="openTags(row)">标签</el-button></template></el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="tagDialog" title="编辑标签" width="400px">
      <div v-for="(v,k) in tagForm.tags" :key="k" class="tag-row">
        <el-input v-model="tagForm.tags[k]" size="small" style="width:140px" :placeholder="k"/>
        <el-button size="small" type="danger" @click="removeTag(k)">删除</el-button>
      </div>
      <div class="tag-row" style="margin-top:8px">
        <el-input v-model="newTagKey" size="small" placeholder="key" style="width:100px"/>
        <el-input v-model="newTagValue" size="small" placeholder="value" style="width:100px"/>
        <el-button size="small" @click="addTag">添加</el-button>
      </div>
      <template #footer><el-button @click="tagDialog=false">取消</el-button><el-button type="primary" @click="saveTags">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { assetCatalogApi } from '@/api/ucp'

const kpis = ref<Array<{label:string;value:number;sub?:string}>>([])
const loading = ref(false)
const activeTab = ref('system')
const assetRows = ref<any[]>([])
const keyword = ref('')

const tagDialog = ref(false)
const tagForm = reactive<{assetType:string;assetId:number;tags:Record<string,string>}>({assetType:'',assetId:0,tags:{}})
const newTagKey = ref('')
const newTagValue = ref('')

async function loadCatalog() {
  try {
    const cat = await assetCatalogApi.catalog()
    kpis.value = [
      { label: '系统', value: cat.systems.total, sub: `活跃 ${cat.systems.active}` },
      { label: '资源', value: cat.resources.total, sub: `活跃 ${cat.resources.active}` },
      { label: '凭证', value: cat.credentials.total, sub: `活跃 ${cat.credentials.active}` },
      { label: '流水线', value: cat.pipelines.total, sub: `活跃 ${cat.pipelines.active}` },
      { label: '模板', value: cat.templates.total },
      { label: '24h 事件', value: cat.events_24h },
    ]
  } catch (e: any) { /* ignore */ }
}

async function loadAssets() {
  loading.value = true
  try {
    const res = await assetCatalogApi.list({ asset_type: activeTab.value, keyword: keyword.value || undefined })
    assetRows.value = res.items
  } catch (e: any) { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

function openTags(row: any) {
  tagForm.assetType = row.type || activeTab.value
  tagForm.assetId = row.id
  tagForm.tags = { ...(row.tags || {}) }
  tagDialog.value = true
}
function addTag() {
  if (newTagKey.value && newTagValue.value) { tagForm.tags[newTagKey.value] = newTagValue.value; newTagKey.value = ''; newTagValue.value = '' }
}
function removeTag(key: string) { delete tagForm.tags[key] }
async function saveTags() {
  try {
    for (const [k, v] of Object.entries(tagForm.tags)) {
      await assetCatalogApi.setTag({ asset_type: tagForm.assetType, asset_id: tagForm.assetId, tag_key: k, tag_value: v })
    }
    ElMessage.success('标签已保存'); tagDialog.value = false; loadAssets()
  } catch (e: any) { ElMessage.error('保存失败') }
}

onMounted(() => { loadCatalog(); loadAssets() })
</script>

<style scoped>
.kpi-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:12px }
.kpi-card { padding:16px; background:#f8f9fa; border-radius:8px; text-align:center }
.kpi-value { font-size:28px; font-weight:700; color:#3b82f6 }
.kpi-label { font-size:13px; color:#8f959e; margin-top:4px }
.kpi-sub { font-size:11px; color:#a0aec0 }
.card-title { font-weight:600 }
.filter-bar { margin-bottom:8px }
.tag-row { display:flex; gap:6px; align-items:center; margin-bottom:6px }
</style>
