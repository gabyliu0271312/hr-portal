<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Delete, Upload, Download, MagicStick, Edit, ArrowLeft,
  CircleCheck, Warning, Document, Grid
} from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { tableToolsApi, type TemplateOut, type TemplateDetail, type MergeResult, type AiDraft } from '@/api/tableTools'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
/** 改/删门禁:仅模板创建者本人或超级管理员(与后端一致) */
function canModify(t: TemplateOut): boolean {
  return userStore.isSuperAdmin || t.created_by === userStore.user?.id
}

// ── 视图状态 ─────────────────────────────────────────────────────────────────
// mode: list | build | merge
const mode = ref<'list' | 'build' | 'merge'>('list')

// ── 模板列表 ─────────────────────────────────────────────────────────────────
const templates = ref<TemplateOut[]>([])
const listLoading = ref(false)

async function loadTemplates() {
  listLoading.value = true
  try { templates.value = await tableToolsApi.listTemplates() }
  catch { ElMessage.error('加载模板列表失败') }
  finally { listLoading.value = false }
}
onMounted(loadTemplates)

// ── 建/编辑模板（build 模式） ─────────────────────────────────────────────────
const editingId = ref<number | null>(null)
const buildStep = ref<'upload' | 'ai' | 'form'>('upload')

// 文件 + AI
const tplFiles = ref<File[]>([])
const aiContext = ref('')
const aiLoading = ref(false)
const draft = ref<AiDraft | null>(null)

// 表单数据
const form = ref({
  name: '',
  description: '',
  merge_keys: ['姓名', '证件号码'] as string[],
  std_fields: [] as string[],
  aggregate: 'sum',
  mappings: [] as any[],
})
const stdFieldInput = ref('')
const draggingStdField = ref('')
const savingTpl = ref(false)

// 当前展开的 mapping 索引
const expandedMapping = ref<number | null>(null)
// 当前正在编辑的 mapping 副本
const editingMapping = ref<any | null>(null)

function openNew() {
  editingId.value = null
  tplFiles.value = []
  aiContext.value = ''
  draft.value = null
  expandedMapping.value = null
  editingMapping.value = null
  resetForm()
  buildStep.value = 'upload'
  mode.value = 'build'
}

async function openEdit(id: number) {
  editingId.value = id
  try {
    const detail: TemplateDetail = await tableToolsApi.getTemplate(id)
    form.value = {
      name: detail.name,
      description: detail.description || '',
      merge_keys: [...detail.merge_keys],
      std_fields: [...detail.std_fields],
      aggregate: detail.aggregate,
      mappings: detail.mappings.map((m: any) => ({ ...m })),
    }
    expandedMapping.value = null
    editingMapping.value = null
    buildStep.value = 'form'
    mode.value = 'build'
  } catch { ElMessage.error('加载模板详情失败') }
}

function resetForm() {
  form.value = { name: '', description: '', merge_keys: ['姓名', '证件号码'], std_fields: [], aggregate: 'sum', mappings: [] }
}

// 文件选择（去重）
function handleTplFileChange(uploadFile: any) {
  const file: File = uploadFile.raw
  if (!tplFiles.value.find((f) => f.name === file.name && f.size === file.size)) {
    tplFiles.value.push(file)
  }
}
function removeTplFile(index: number) { tplFiles.value.splice(index, 1) }

// AI 识别
async function runAiDraft() {
  if (!tplFiles.value.length) { ElMessage.warning('请先上传文件'); return }
  buildStep.value = 'ai'
  try {
    draft.value = await tableToolsApi.aiDraft(tplFiles.value, aiContext.value)
    form.value = {
      name: draft.value.name || '',
      description: draft.value.description || '',
      merge_keys: [...draft.value.merge_keys],
      std_fields: [...draft.value.std_fields],
      aggregate: draft.value.aggregate,
      mappings: draft.value.mappings.map((m: any) => ({ ...m })),
    }
    buildStep.value = 'form'
    expandedMapping.value = null
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || 'AI 识别失败，请重试')
    buildStep.value = 'upload'
  }
}

function skipToManual() {
  draft.value = null
  resetForm()
  buildStep.value = 'form'
}

// mapping 编辑
function startEditMapping(idx: number) {
  expandedMapping.value = idx
  editingMapping.value = JSON.parse(JSON.stringify(form.value.mappings[idx]))
}

function cancelEditMapping() {
  expandedMapping.value = null
  editingMapping.value = null
}

function saveEditMapping() {
  if (expandedMapping.value !== null && editingMapping.value) {
    form.value.mappings[expandedMapping.value] = { ...editingMapping.value }
  }
  expandedMapping.value = null
  editingMapping.value = null
}

// key_map / column_map 编辑辅助
function addKeyMapEntry() {
  if (!editingMapping.value) return
  if (!editingMapping.value.key_map) editingMapping.value.key_map = {}
  editingMapping.value.key_map[''] = ''
  editingMapping.value._keyMapEntries = objToEntries(editingMapping.value.key_map)
}

function addColumnMapEntry() {
  if (!editingMapping.value) return
  if (!editingMapping.value.column_map) editingMapping.value.column_map = {}
  editingMapping.value.column_map[''] = ''
  editingMapping.value._colMapEntries = objToEntries(editingMapping.value.column_map)
}

function objToEntries(obj: Record<string, string>) {
  return Object.entries(obj).map(([k, v]) => ({ key: k, val: v }))
}

function entriesToObj(entries: { key: string; val: string }[]) {
  const obj: Record<string, string> = {}
  for (const e of entries) { if (e.key) obj[e.key] = e.val }
  return obj
}

// derived_fields 编辑
function addDerivedField() {
  if (!editingMapping.value) return
  if (!editingMapping.value.derived_fields) editingMapping.value.derived_fields = []
  editingMapping.value.derived_fields.push({ target: '', expr: '', round: 2 })
}
function removeDerivedField(idx: number) {
  editingMapping.value?.derived_fields?.splice(idx, 1)
}

// 把 key_map/column_map 对象同步到 editingMapping
function syncKeyMap(entries: { key: string; val: string }[]) {
  if (editingMapping.value) editingMapping.value.key_map = entriesToObj(entries)
}
function syncColumnMap(entries: { key: string; val: string }[]) {
  if (editingMapping.value) editingMapping.value.column_map = entriesToObj(entries)
}

// 标准字段
function addStdField() {
  const v = stdFieldInput.value.trim()
  if (v && !form.value.std_fields.includes(v)) form.value.std_fields.push(v)
  stdFieldInput.value = ''
}
function removeStdField(f: string) {
  form.value.std_fields = form.value.std_fields.filter((x) => x !== f)
}
// 拖拽排序：决定归集输出表的列顺序
function reorderStdField(code: string, targetCode: string) {
  if (!code || !targetCode || code === targetCode) return
  const next = [...form.value.std_fields]
  const from = next.indexOf(code)
  const to = next.indexOf(targetCode)
  if (from < 0 || to < 0) return
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  form.value.std_fields = next
}

// 低置信度
function aiLowConfidence(mappingName: string) {
  return draft.value?._meta?.low_confidence?.find((l: any) => l.sheet === mappingName)
}

// 保存模板
async function saveTemplate() {
  if (!form.value.name.trim()) { ElMessage.warning('请填写模板名称'); return }
  if (!form.value.std_fields.length) { ElMessage.warning('标准字段不能为空'); return }
  savingTpl.value = true
  try {
    const payload = {
      name: form.value.name,
      description: form.value.description || null,
      merge_keys: form.value.merge_keys,
      std_fields: form.value.std_fields,
      aggregate: form.value.aggregate,
      mappings: form.value.mappings.map((m) => ({
        name: m.name,
        match_signature: m.match_signature || [],
        sheet_kw: m.sheet_kw || null,
        header_start: m.header_start || 1,
        header_end: m.header_end || 1,
        key_map: m.key_map || {},
        column_map: m.column_map || {},
        derived_fields: m.derived_fields || [],
        derive_check: m.derive_check || null,
        skip_tokens: m.skip_tokens || ['合计', '小计', '总计'],
      })),
    }
    if (editingId.value) {
      await tableToolsApi.updateTemplate(editingId.value, payload)
      ElMessage.success('模板已更新')
    } else {
      await tableToolsApi.createTemplate(payload)
      ElMessage.success('模板已保存')
    }
    await loadTemplates()
    mode.value = 'list'
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    savingTpl.value = false
  }
}

async function deleteTemplate(t: TemplateOut) {
  await ElMessageBox.confirm(`确认删除模板「${t.name}」？`, '确认删除', {
    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
  })
  try {
    await tableToolsApi.deleteTemplate(t.id)
    ElMessage.success('已删除')
    await loadTemplates()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

// ── 月度合并（merge 模式） ────────────────────────────────────────────────────
const mergeTemplate = ref<TemplateOut | null>(null)
const mergeFiles = ref<File[]>([])
const merging = ref(false)
const downloading = ref(false)
const mergeResult = ref<MergeResult | null>(null)

function openMerge(t: TemplateOut) {
  mergeTemplate.value = t
  mergeFiles.value = []
  mergeResult.value = null
  mode.value = 'merge'
}

function handleMergeFileChange(uploadFile: any) {
  const file: File = uploadFile.raw
  if (!mergeFiles.value.find((f) => f.name === file.name && f.size === file.size)) {
    mergeFiles.value.push(file)
  }
}
function removeMergeFile(index: number) { mergeFiles.value.splice(index, 1) }

async function runMerge() {
  if (!mergeTemplate.value || !mergeFiles.value.length) return
  merging.value = true
  mergeResult.value = null
  try {
    mergeResult.value = await tableToolsApi.runMerge(mergeTemplate.value.id, mergeFiles.value)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '合并失败')
  } finally {
    merging.value = false
  }
}

async function downloadResult() {
  if (!mergeTemplate.value || !mergeFiles.value.length) return
  downloading.value = true
  try {
    await tableToolsApi.downloadMerge(mergeTemplate.value.id, mergeFiles.value)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '下载失败')
  } finally {
    downloading.value = false
  }
}

// ── 计算属性 ─────────────────────────────────────────────────────────────────
const mergeResultCols = computed(() => mergeResult.value?.columns || [])

// key_map / column_map entries（用于 v-model 绑定）
const editingKeyMapEntries = computed({
  get: () => editingMapping.value ? objToEntries(editingMapping.value.key_map || {}) : [],
  set: (v) => syncKeyMap(v),
})
const editingColMapEntries = computed({
  get: () => editingMapping.value ? objToEntries(editingMapping.value.column_map || {}) : [],
  set: (v) => syncColumnMap(v),
})
</script>

<template>
  <div class="tt-root">

    <!-- ═══════════════════════════════════════════════════════
         模板列表页
    ════════════════════════════════════════════════════════ -->
    <template v-if="mode === 'list'">
      <div class="page-header">
        <div>
          <h1 class="page-title">表格归集</h1>
          <p class="page-desc">配置归集模板，定期上传多源文件一键合并为标准表格</p>
        </div>
        <PermissionButton menu="table_tools" op="C" type="primary" :icon="Plus" @click="openNew">
          新建模板
        </PermissionButton>
      </div>

      <div v-if="listLoading" class="list-loading">
        <div class="skeleton" v-for="i in 3" :key="i" />
      </div>

      <div v-else-if="!templates.length" class="empty-state">
        <el-icon class="empty-icon"><Grid /></el-icon>
        <p>暂无归集模板</p>
        <PermissionButton menu="table_tools" op="C" type="primary" :icon="Plus" @click="openNew">
          创建第一个模板
        </PermissionButton>
      </div>

      <div v-else class="tpl-grid">
        <div class="tpl-card" v-for="t in templates" :key="t.id">
          <div class="tpl-card-body">
            <div class="tpl-card-icon"><el-icon><Document /></el-icon></div>
            <div class="tpl-card-info">
              <div class="tpl-name">{{ t.name }}</div>
              <div class="tpl-desc" v-if="t.description">{{ t.description }}</div>
              <div class="tpl-meta">
                <span class="meta-tag" v-for="k in t.merge_keys" :key="k">{{ k }}</span>
                <span class="meta-dot">·</span>
                <span class="meta-count">{{ t.mapping_count }} 个数据源</span>
              </div>
            </div>
          </div>
          <div class="tpl-card-actions">
            <el-button type="primary" size="small" :icon="Upload" @click="openMerge(t)">合并</el-button>
            <PermissionButton v-if="canModify(t)" menu="table_tools" op="U" size="small" :icon="Edit" @click="openEdit(t.id)">
              编辑
            </PermissionButton>
            <PermissionButton v-if="canModify(t)" menu="table_tools" op="D" size="small" type="danger" :icon="Delete"
              @click="deleteTemplate(t)" />
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════
         建/编辑模板页（全页面，无弹窗）
    ════════════════════════════════════════════════════════ -->
    <template v-else-if="mode === 'build'">
      <!-- 顶部导航栏 -->
      <div class="build-topbar">
        <button class="back-btn" @click="mode = 'list'">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回模板列表</span>
        </button>
        <h2 class="build-title">{{ editingId ? '编辑模板' : '新建归集模板' }}</h2>
        <div class="build-topbar-actions">
          <el-button @click="mode = 'list'">取消</el-button>
          <el-button type="primary" :loading="savingTpl"
            :disabled="buildStep !== 'form'" @click="saveTemplate">
            保存模板
          </el-button>
        </div>
      </div>

      <!-- 步骤 1：上传 -->
      <template v-if="buildStep === 'upload'">
        <div class="build-upload-wrap">
          <div class="upload-panel">
            <h3 class="upload-heading">上传数据源文件</h3>
            <p class="upload-sub">上传本次归集场景的所有 Excel 文件，AI 将自动识别字段映射关系</p>

            <el-upload
              drag multiple :auto-upload="false" :show-file-list="false"
              accept=".xlsx,.xls" :on-change="handleTplFileChange"
              class="upload-dragger">
              <el-icon class="upload-icon"><Upload /></el-icon>
              <div class="upload-text">拖拽文件到此处，或<em>点击选择</em></div>
              <div class="upload-hint">支持 .xlsx / .xls，可同时选择多个文件</div>
            </el-upload>

            <div v-if="tplFiles.length" class="file-chips">
              <div class="file-chip" v-for="(f, i) in tplFiles" :key="i">
                <el-icon><Document /></el-icon>
                <span>{{ f.name }}</span>
                <button class="chip-remove" @click="removeTplFile(i)">×</button>
              </div>
            </div>

            <div class="context-wrap">
              <label class="context-label">业务背景（可选，但强烈建议填写）</label>
              <el-input
                v-model="aiContext" type="textarea" :rows="3"
                placeholder="描述本次归集的场景与你想要的标准字段，AI 会据此决定字段清单和合并粒度。可包含：&#10;· 归集场景（如：月度社保公积金、考勤汇总、报销明细）&#10;· 想要哪些标准字段、合并到什么粗细（如：每类只保留个人/单位两项，忽略基数与比例）&#10;· 哪些列要忽略、用什么作归集主键&#10;描述越具体，AI 生成的模板越贴近预期，需要手工调整的越少。" />
            </div>

            <div class="upload-actions">
              <el-button @click="skipToManual">跳过，手动配置</el-button>
              <el-button type="primary" :icon="MagicStick"
                :disabled="!tplFiles.length" @click="runAiDraft">
                AI 识别映射关系
              </el-button>
            </div>
          </div>
        </div>
      </template>

      <!-- 步骤 2：AI 分析中 -->
      <template v-else-if="buildStep === 'ai'">
        <div class="ai-loading-wrap">
          <div class="ai-spinner">
            <div class="spinner-ring" />
            <el-icon class="spinner-icon"><MagicStick /></el-icon>
          </div>
          <h3 class="ai-loading-title">AI 正在分析文件结构</h3>
          <p class="ai-loading-sub">正在识别 {{ tplFiles.length }} 个文件的字段映射关系，请稍候…</p>
        </div>
      </template>

      <!-- 步骤 3：表单（左右分栏） -->
      <template v-else>
        <!-- 低置信度提示 -->
        <div v-if="draft?._meta?.low_confidence?.length" class="confidence-alert">
          <el-icon><Warning /></el-icon>
          <div>
            以下映射置信度较低，请核查：
            <strong v-for="lc in draft._meta.low_confidence" :key="lc.sheet" style="margin-left:8px">
              {{ lc.sheet }}（{{ Math.round(lc.confidence * 100) }}%）
            </strong>
          </div>
        </div>

        <div class="build-layout">
          <!-- 左栏：基础信息 -->
          <div class="build-left">
            <section class="form-section">
              <h3 class="section-title">基础信息</h3>
              <div class="field-group">
                <label class="field-label required">模板名称</label>
                <el-input v-model="form.name" placeholder="如：社保月度归集" />
              </div>
              <div class="field-group">
                <label class="field-label">说明</label>
                <el-input v-model="form.description" placeholder="可选" />
              </div>
            </section>

            <section class="form-section">
              <h3 class="section-title">合并主键</h3>
              <p class="section-desc">用于识别「同一个人」的唯一标识字段，建议 2 个以内</p>
              <el-select v-model="form.merge_keys" multiple allow-create filterable
                placeholder="输入后回车" style="width:100%">
                <el-option v-for="k in form.merge_keys" :key="k" :label="k" :value="k" />
              </el-select>
            </section>

            <section class="form-section">
              <h3 class="section-title">标准字段 <span class="required-mark">*</span></h3>
              <p class="section-desc">归集后输出表的列名，所有数据源的字段都会映射到这里；可拖拽调整顺序，决定导出表的列序</p>
              <div class="std-tags">
                <el-tag v-for="f in form.std_fields" :key="f" closable
                  @close="removeStdField(f)" class="std-tag"
                  draggable="true"
                  @dragstart="draggingStdField = f"
                  @dragend="draggingStdField = ''"
                  @dragover.prevent
                  @drop.prevent="reorderStdField(draggingStdField, f); draggingStdField = ''">{{ f }}</el-tag>
              </div>
              <div class="std-add">
                <el-input v-model="stdFieldInput" placeholder="输入字段名后添加"
                  size="small" @keyup.enter="addStdField" />
                <el-button size="small" @click="addStdField">添加</el-button>
              </div>
            </section>
          </div>

          <!-- 右栏：数据源映射 -->
          <div class="build-right">
            <div class="mappings-header">
              <h3 class="section-title">数据源映射</h3>
              <span class="mappings-count">{{ form.mappings.length }} 个</span>
            </div>
            <p class="section-desc" style="margin-bottom:12px">
              点击每个数据源可展开查看和编辑映射关系
            </p>

            <div v-if="!form.mappings.length" class="mappings-empty">
              AI 识别或手动配置后，映射关系将显示在这里
            </div>

            <div class="mapping-list">
              <div
                v-for="(m, idx) in form.mappings"
                :key="idx"
                class="mapping-item"
                :class="{ expanded: expandedMapping === idx }">

                <!-- 折叠头 -->
                <div class="mapping-header" @click="expandedMapping === idx ? cancelEditMapping() : startEditMapping(idx)">
                  <div class="mapping-header-left">
                    <div class="mapping-chevron" :class="{ rotated: expandedMapping === idx }">›</div>
                    <div>
                      <div class="mapping-name">{{ m.name }}</div>
                      <div class="mapping-meta">
                        <span>表头行 {{ m.header_start }}–{{ m.header_end }}</span>
                        <span v-if="m.sheet_kw">· Sheet: {{ m.sheet_kw }}</span>
                        <span>· 字段映射 {{ Object.keys(m.column_map || {}).length }} 个</span>
                      </div>
                    </div>
                  </div>
                  <el-tag v-if="aiLowConfidence(m.name)" type="warning" size="small">
                    置信度 {{ Math.round((aiLowConfidence(m.name)?.confidence || 0) * 100) }}%
                  </el-tag>
                </div>

                <!-- 展开编辑区 -->
                <div v-if="expandedMapping === idx && editingMapping" class="mapping-editor">

                  <!-- Sheet 关键词 & 表头行 -->
                  <div class="editor-row">
                    <div class="editor-field">
                      <label class="editor-label">Sheet 关键词</label>
                      <el-input v-model="editingMapping.sheet_kw" size="small"
                        placeholder="留空匹配全部 sheet" />
                    </div>
                    <div class="editor-field" style="width:90px">
                      <label class="editor-label">表头起始行</label>
                      <el-input-number v-model="editingMapping.header_start" :min="1" :max="10" size="small" />
                    </div>
                    <div class="editor-field" style="width:90px">
                      <label class="editor-label">表头结束行</label>
                      <el-input-number v-model="editingMapping.header_end" :min="1" :max="10" size="small" />
                    </div>
                  </div>

                  <!-- 主键映射 -->
                  <div class="editor-section">
                    <div class="editor-section-header">
                      <span>主键映射</span>
                      <button class="add-row-btn" @click="addKeyMapEntry">+ 新增</button>
                    </div>
                    <div class="map-table">
                      <div class="map-row map-row-head">
                        <span>源列名</span><span>→</span><span>标准主键</span><span></span>
                      </div>
                      <div class="map-row" v-for="(entry, ei) in editingKeyMapEntries" :key="ei">
                        <el-input v-model="entry.key" size="small" placeholder="源列名"
                          @change="syncKeyMap(editingKeyMapEntries)" />
                        <span class="map-arrow">→</span>
                        <el-select v-model="entry.val" size="small" allow-create filterable
                          @change="syncKeyMap(editingKeyMapEntries)">
                          <el-option v-for="k in form.merge_keys" :key="k" :label="k" :value="k" />
                        </el-select>
                        <button class="del-row-btn" @click="() => { editingKeyMapEntries.splice(ei,1); syncKeyMap(editingKeyMapEntries) }">×</button>
                      </div>
                    </div>
                  </div>

                  <!-- 字段映射 -->
                  <div class="editor-section">
                    <div class="editor-section-header">
                      <span>字段映射</span>
                      <button class="add-row-btn" @click="addColumnMapEntry">+ 新增</button>
                    </div>
                    <div class="map-table">
                      <div class="map-row map-row-head">
                        <span>源列名</span><span>→</span><span>标准字段</span><span></span>
                      </div>
                      <div class="map-row" v-for="(entry, ei) in editingColMapEntries" :key="ei">
                        <el-input v-model="entry.key" size="small" placeholder="源列名"
                          @change="syncColumnMap(editingColMapEntries)" />
                        <span class="map-arrow">→</span>
                        <el-select v-model="entry.val" size="small" allow-create filterable
                          @change="syncColumnMap(editingColMapEntries)">
                          <el-option v-for="f in form.std_fields" :key="f" :label="f" :value="f" />
                        </el-select>
                        <button class="del-row-btn" @click="() => { editingColMapEntries.splice(ei,1); syncColumnMap(editingColMapEntries) }">×</button>
                      </div>
                    </div>
                  </div>

                  <!-- 派生字段 -->
                  <div class="editor-section">
                    <div class="editor-section-header">
                      <span>派生字段</span>
                      <button class="add-row-btn" @click="addDerivedField">+ 新增</button>
                    </div>
                    <div v-if="!editingMapping.derived_fields?.length" class="derived-empty">
                      无派生字段（如需要可添加计算公式）
                    </div>
                    <div class="derived-row" v-for="(df, di) in editingMapping.derived_fields" :key="di">
                      <el-select v-model="df.target" size="small" allow-create filterable
                        placeholder="目标标准字段" style="width:140px">
                        <el-option v-for="f in form.std_fields" :key="f" :label="f" :value="f" />
                      </el-select>
                      <span class="map-arrow">=</span>
                      <el-input v-model="df.expr" size="small" placeholder="{列名A}+{列名B}" style="flex:1" />
                      <el-input-number v-model="df.round" :min="0" :max="6" size="small"
                        style="width:80px" :controls="false" placeholder="小数位" />
                      <button class="del-row-btn" @click="removeDerivedField(di)">×</button>
                    </div>
                  </div>

                  <!-- 操作按钮 -->
                  <div class="editor-actions">
                    <el-button size="small" @click="cancelEditMapping">取消</el-button>
                    <el-button size="small" type="primary" :icon="CircleCheck" @click="saveEditMapping">
                      确认修改
                    </el-button>
                  </div>

                  <!-- AI 备注 -->
                  <div v-if="aiLowConfidence(m.name)?.notes" class="ai-notes">
                    ⚠ {{ aiLowConfidence(m.name)?.notes }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ═══════════════════════════════════════════════════════
         月度合并页（全页面，无抽屉）
    ════════════════════════════════════════════════════════ -->
    <template v-else-if="mode === 'merge'">
      <div class="build-topbar">
        <button class="back-btn" @click="mode = 'list'">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回模板列表</span>
        </button>
        <h2 class="build-title">合并 · {{ mergeTemplate?.name }}</h2>
        <div class="build-topbar-actions">
          <PermissionButton menu="table_tools" op="E" :icon="Download" :loading="downloading"
            :disabled="!mergeFiles.length" @click="downloadResult">
            下载完整结果
          </PermissionButton>
          <el-button type="primary" :loading="merging"
            :disabled="!mergeFiles.length" @click="runMerge">
            运行预览
          </el-button>
        </div>
      </div>

      <div class="merge-layout">
        <!-- 左侧：上传区 -->
        <div class="merge-left">
          <h3 class="section-title">上传文件</h3>
          <el-upload
            drag multiple :auto-upload="false" :show-file-list="false"
            accept=".xlsx,.xls" :on-change="handleMergeFileChange"
            class="upload-dragger upload-dragger--sm">
            <el-icon class="upload-icon" style="font-size:28px"><Upload /></el-icon>
            <div class="upload-text" style="font-size:13px">拖拽或点击选择 Excel 文件</div>
          </el-upload>

          <div v-if="mergeFiles.length" class="file-chips" style="margin-top:12px">
            <div class="file-chip" v-for="(f, i) in mergeFiles" :key="i">
              <el-icon><Document /></el-icon>
              <span>{{ f.name }}</span>
              <button class="chip-remove" @click="removeMergeFile(i)">×</button>
            </div>
          </div>

          <!-- 识别日志 -->
          <div v-if="mergeResult?.recognize_log?.length" class="log-panel">
            <h4 class="log-title">识别日志 <span class="log-count">{{ mergeResult.recognize_log.length }} 个命中</span></h4>
            <div class="log-row" v-for="(l, i) in mergeResult.recognize_log" :key="i">
              <span class="log-score" :class="l.score >= 0.9 ? 'good' : 'warn'">
                {{ Math.round(l.score * 100) }}%
              </span>
              <span class="log-file">{{ l.file }}</span>
              <span class="log-sheet">/ {{ l.sheet }}</span>
            </div>
          </div>

          <!-- 异常 -->
          <div v-if="mergeResult?.anomalies?.length" class="anomaly-panel">
            <h4 class="log-title danger">异常 <span class="log-count">{{ mergeResult.anomalies.length }} 条</span></h4>
            <div class="anomaly-row" v-for="(a, i) in mergeResult.anomalies" :key="i">
              <el-tag type="danger" size="small">{{ a.type }}</el-tag>
              <span class="anomaly-detail">{{ a.detail }}</span>
            </div>
          </div>
        </div>

        <!-- 右侧：结果 -->
        <div class="merge-right">
          <!-- 统计卡片 -->
          <div v-if="mergeResult" class="stat-cards">
            <div class="stat-card">
              <div class="stat-val">{{ mergeResult.stats.files }}</div>
              <div class="stat-label">文件</div>
            </div>
            <div class="stat-card">
              <div class="stat-val">{{ mergeResult.stats.records }}</div>
              <div class="stat-label">原始记录</div>
            </div>
            <div class="stat-card highlight">
              <div class="stat-val">{{ mergeResult.stats.persons }}</div>
              <div class="stat-label">归集人数</div>
            </div>
            <div class="stat-card" :class="mergeResult.stats.anomalies ? 'danger' : ''">
              <div class="stat-val">{{ mergeResult.stats.anomalies }}</div>
              <div class="stat-label">异常</div>
            </div>
          </div>

          <!-- 预览表格 -->
          <div v-if="mergeResult?.rows?.length" class="preview-wrap">
            <div class="preview-header">
              <span>预览前 {{ mergeResult.rows.length }} 行 / 共 {{ mergeResult.total_rows }} 行</span>
            </div>
            <el-table :data="mergeResult.rows" size="small" border
              max-height="600" style="font-size:12px; width:100%">
              <el-table-column
                v-for="col in mergeResultCols" :key="col"
                :prop="col" :label="col" min-width="110" show-overflow-tooltip />
            </el-table>
          </div>

          <div v-else-if="!merging" class="merge-empty">
            <el-icon style="font-size:40px;color:var(--color-text-placeholder)"><Upload /></el-icon>
            <p>上传文件后点击「运行预览」查看归集结果</p>
          </div>

          <div v-if="merging" class="merge-loading">
            <div class="spinner-ring" style="width:32px;height:32px;border-width:3px" />
            <span>归集计算中…</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ── 根容器 ─────────────────────────────────────────────── */
.tt-root {
  min-height: calc(100vh - var(--layout-topbar-height));
  background: var(--color-bg-page);
  padding: 24px;
}

/* ── 列表页 ─────────────────────────────────────────────── */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 4px;
}
.page-desc {
  font-size: 13px;
  color: var(--color-text-placeholder);
  margin: 0;
}

.list-loading { display: flex; flex-direction: column; gap: 12px; }
.skeleton {
  height: 88px;
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, #eef1f6 25%, #f8fafc 50%, #eef1f6 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 80px 0;
  color: var(--color-text-placeholder);
}
.empty-icon { font-size: 48px; }

.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
}
.tpl-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
}
.tpl-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-card);
}
.tpl-card-body { display: flex; gap: 12px; margin-bottom: 14px; }
.tpl-card-icon {
  width: 40px; height: 40px; flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--color-primary-light);
  color: var(--color-primary);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
}
.tpl-name { font-size: 15px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 3px; }
.tpl-desc { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 6px; }
.tpl-meta { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.meta-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.meta-dot { color: var(--color-text-placeholder); }
.meta-count { font-size: 12px; color: var(--color-text-secondary); }
.tpl-card-actions { display: flex; gap: 6px; justify-content: flex-end; }

/* ── 共用：顶部导航栏 ───────────────────────────────────── */
.build-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
}
.back-btn {
  display: flex; align-items: center; gap: 4px;
  font-size: 13px; color: var(--color-text-secondary);
  background: none; border: none; cursor: pointer; padding: 4px 0;
  transition: color var(--duration-fast);
}
.back-btn:hover { color: var(--color-primary); }
.build-title { flex: 1; font-size: 17px; font-weight: 600; color: var(--color-text-primary); margin: 0; }
.build-topbar-actions { display: flex; gap: 8px; }

/* ── 上传步骤 ───────────────────────────────────────────── */
.build-upload-wrap {
  display: flex; justify-content: center; padding: 40px 0;
}
.upload-panel {
  width: 100%; max-width: 600px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 32px;
}
.upload-heading { font-size: 17px; font-weight: 600; margin: 0 0 6px; color: var(--color-text-primary); }
.upload-sub { font-size: 13px; color: var(--color-text-secondary); margin: 0 0 20px; }

.upload-dragger :deep(.el-upload-dragger) {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-subtle);
  transition: border-color var(--duration-fast), background var(--duration-fast);
  padding: 28px 20px;
}
.upload-dragger :deep(.el-upload-dragger:hover) {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
}
.upload-dragger--sm :deep(.el-upload-dragger) { padding: 18px 16px; }
.upload-icon { font-size: 36px; color: var(--color-text-placeholder); }
.upload-text {
  margin-top: 10px; font-size: 14px; color: var(--color-text-regular);
}
.upload-text em { color: var(--color-primary); font-style: normal; }
.upload-hint { margin-top: 4px; font-size: 12px; color: var(--color-text-placeholder); }

.file-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.file-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 8px 4px 6px;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  font-size: 12px; color: var(--color-text-regular);
}
.chip-remove {
  background: none; border: none; cursor: pointer;
  color: var(--color-text-placeholder); padding: 0; font-size: 14px; line-height: 1;
}
.chip-remove:hover { color: var(--color-danger); }

.context-wrap { margin-top: 20px; }
.context-label { display: block; font-size: 13px; color: var(--color-text-secondary); margin-bottom: 6px; }

.upload-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

/* ── AI 加载 ────────────────────────────────────────────── */
.ai-loading-wrap {
  display: flex; flex-direction: column; align-items: center;
  padding: 100px 0; gap: 16px;
}
.ai-spinner {
  position: relative; width: 64px; height: 64px;
}
.spinner-ring {
  width: 100%; height: 100%;
  border-radius: 50%;
  border: 3px solid var(--color-primary-light);
  border-top-color: var(--color-primary);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.spinner-icon {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; color: var(--color-primary);
}
.ai-loading-title { font-size: 18px; font-weight: 600; margin: 0; color: var(--color-text-primary); }
.ai-loading-sub { font-size: 14px; color: var(--color-text-secondary); margin: 0; }

/* ── 置信度警告 ─────────────────────────────────────────── */
.confidence-alert {
  display: flex; align-items: flex-start; gap: 8px;
  background: var(--color-warning-light);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-size: 13px; color: var(--color-text-regular);
  margin-bottom: 16px;
}

/* ── 建模表单（左右分栏） ───────────────────────────────── */
.build-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;
  align-items: start;
}

.build-left {
  display: flex; flex-direction: column; gap: 16px;
}
.build-right {
  min-width: 0;
}

.form-section {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 18px;
}
.section-title {
  font-size: 14px; font-weight: 600; color: var(--color-text-primary);
  margin: 0 0 4px;
}
.required-mark { color: var(--color-danger); }
.section-desc { font-size: 12px; color: var(--color-text-secondary); margin: 0 0 10px; }

.field-group { margin-bottom: 14px; }
.field-group:last-child { margin-bottom: 0; }
.field-label {
  display: block; font-size: 12px; color: var(--color-text-secondary);
  margin-bottom: 5px;
}
.field-label.required::after { content: ' *'; color: var(--color-danger); }

.std-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; min-height: 24px; }
.std-tag { font-size: 12px; cursor: grab; }
.std-tag:active { cursor: grabbing; }
.std-add { display: flex; gap: 6px; }

/* ── 映射列表 ───────────────────────────────────────────── */
.mappings-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 4px;
}
.mappings-count {
  font-size: 12px; color: var(--color-text-placeholder);
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  padding: 1px 8px;
}
.mappings-empty {
  padding: 40px;
  text-align: center;
  color: var(--color-text-placeholder);
  font-size: 13px;
  background: var(--color-bg-card);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
}
.mapping-list { display: flex; flex-direction: column; gap: 8px; }

.mapping-item {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color var(--duration-fast);
}
.mapping-item.expanded { border-color: var(--color-primary); }

.mapping-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; cursor: pointer;
  user-select: none;
  transition: background var(--duration-fast);
}
.mapping-header:hover { background: var(--color-bg-subtle); }
.mapping-header-left { display: flex; align-items: center; gap: 10px; }
.mapping-chevron {
  font-size: 16px; color: var(--color-text-placeholder);
  transition: transform var(--duration-fast);
  line-height: 1;
}
.mapping-chevron.rotated { transform: rotate(90deg); }
.mapping-name { font-size: 13px; font-weight: 500; color: var(--color-text-primary); }
.mapping-meta { font-size: 11px; color: var(--color-text-placeholder); margin-top: 2px; }
.mapping-meta span + span { margin-left: 4px; }

/* ── 映射编辑器 ─────────────────────────────────────────── */
.mapping-editor {
  border-top: 1px solid var(--color-border);
  padding: 16px;
  background: var(--color-bg-subtle);
}
.editor-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.editor-field { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 120px; }
.editor-label { font-size: 12px; color: var(--color-text-secondary); }

.editor-section { margin-bottom: 16px; }
.editor-section-header {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; font-weight: 600; color: var(--color-text-secondary);
  margin-bottom: 8px;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.add-row-btn {
  font-size: 12px; color: var(--color-primary);
  background: none; border: none; cursor: pointer; padding: 0;
}
.add-row-btn:hover { text-decoration: underline; }

.map-table { display: flex; flex-direction: column; gap: 6px; }
.map-row {
  display: grid;
  grid-template-columns: 1fr 24px 1fr 24px;
  gap: 6px; align-items: center;
}
.map-row-head {
  font-size: 11px; color: var(--color-text-placeholder);
  padding: 0 2px;
}
.map-arrow {
  text-align: center; font-size: 13px;
  color: var(--color-text-placeholder);
}
.del-row-btn {
  background: none; border: none; cursor: pointer;
  color: var(--color-text-placeholder); font-size: 15px; padding: 0;
  text-align: center; line-height: 1;
  transition: color var(--duration-fast);
}
.del-row-btn:hover { color: var(--color-danger); }

.derived-empty {
  font-size: 12px; color: var(--color-text-placeholder);
  padding: 8px 0;
}
.derived-row {
  display: flex; gap: 6px; align-items: center; margin-bottom: 6px;
}

.editor-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 8px; padding-top: 12px;
  border-top: 1px solid var(--color-border-light);
}
.ai-notes {
  margin-top: 10px; padding: 8px 10px;
  background: var(--color-warning-light);
  border-radius: var(--radius-sm);
  font-size: 12px; color: var(--color-text-regular);
}

/* ── 合并页 ─────────────────────────────────────────────── */
.merge-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;
  align-items: start;
}
.merge-left {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 18px;
  position: sticky;
  top: calc(var(--layout-topbar-height) + 24px);
}
.merge-right { min-width: 0; }

.log-panel { margin-top: 16px; }
.log-title {
  font-size: 12px; font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px;
  margin: 0 0 8px;
}
.log-title.danger { color: var(--color-danger); }
.log-count {
  font-size: 11px; font-weight: 400;
  color: var(--color-text-placeholder);
  text-transform: none; letter-spacing: 0;
  margin-left: 6px;
}
.log-row {
  display: flex; align-items: baseline; gap: 6px;
  font-size: 12px; padding: 3px 0;
  border-bottom: 1px solid var(--color-border-lighter);
}
.log-score {
  font-size: 11px; font-weight: 600; min-width: 32px;
}
.log-score.good { color: var(--color-success); }
.log-score.warn { color: var(--color-warning); }
.log-file { color: var(--color-text-regular); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-sheet { color: var(--color-text-placeholder); flex-shrink: 0; }

.anomaly-panel { margin-top: 16px; }
.anomaly-row {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 12px; padding: 4px 0;
  border-bottom: 1px solid var(--color-border-lighter);
}
.anomaly-detail { color: var(--color-text-secondary); font-size: 11px; line-height: 1.5; }

.stat-cards {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 10px; margin-bottom: 16px;
}
.stat-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  text-align: center;
}
.stat-card.highlight { border-color: var(--color-primary); background: var(--color-primary-subtle); }
.stat-card.danger { border-color: var(--color-danger-border); background: var(--color-danger-light); }
.stat-val { font-size: 24px; font-weight: 700; color: var(--color-text-primary); line-height: 1; }
.stat-card.highlight .stat-val { color: var(--color-primary); }
.stat-card.danger .stat-val { color: var(--color-danger); }
.stat-label { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }

.preview-wrap {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.preview-header {
  padding: 10px 14px;
  font-size: 12px; color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.merge-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; padding: 80px 0;
  color: var(--color-text-placeholder); font-size: 13px;
}
.merge-loading {
  display: flex; align-items: center; justify-content: center;
  gap: 12px; padding: 60px 0;
  font-size: 13px; color: var(--color-text-secondary);
}

@media (max-width: 900px) {
  .build-layout, .merge-layout { grid-template-columns: 1fr; }
  .merge-left { position: static; }
  .stat-cards { grid-template-columns: repeat(2, 1fr); }
}
</style>
