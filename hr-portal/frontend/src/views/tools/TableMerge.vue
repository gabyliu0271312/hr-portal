<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Upload, Download, MagicStick } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { tableToolsApi, type TemplateOut, type TemplateDetail, type MergeResult, type AiDraft } from '@/api/tableTools'

// ── 状态 ────────────────────────────────────────────────────────────────────
const templates = ref<TemplateOut[]>([])
const loading = ref(false)

// 月度合并抽屉
const mergeDrawer = ref(false)
const mergeTemplate = ref<TemplateOut | null>(null)
const mergeFiles = ref<File[]>([])
const merging = ref(false)
const downloading = ref(false)
const mergeResult = ref<MergeResult | null>(null)

// 建/编辑模板对话框
const tplDialog = ref(false)
const tplStep = ref<'upload' | 'loading' | 'form'>('upload')
const editingId = ref<number | null>(null)

// 文件 + AI
const tplFiles = ref<File[]>([])
const aiContext = ref('')
const aiLoading = ref(false)
const draft = ref<AiDraft | null>(null)

// 表单
const form = ref({
  name: '',
  description: '',
  merge_keys: ['姓名', '证件号码'] as string[],
  std_fields: [] as string[],
  aggregate: 'sum',
  mappings: [] as any[],
})
const stdFieldInput = ref('')
const savingTpl = ref(false)

// ── 加载 ────────────────────────────────────────────────────────────────────
async function loadTemplates() {
  loading.value = true
  try { templates.value = await tableToolsApi.listTemplates() }
  catch { ElMessage.error('加载模板列表失败') }
  finally { loading.value = false }
}
onMounted(loadTemplates)

// ── 建/编辑模板 ──────────────────────────────────────────────────────────────
function openNew() {
  editingId.value = null
  tplFiles.value = []
  aiContext.value = ''
  draft.value = null
  resetForm()
  tplStep.value = 'upload'
  tplDialog.value = true
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
      mappings: detail.mappings.map((m) => ({ ...m })),
    }
    tplStep.value = 'form'
    tplDialog.value = true
  } catch { ElMessage.error('加载模板详情失败') }
}

function resetForm() {
  form.value = { name: '', description: '', merge_keys: ['姓名', '证件号码'], std_fields: [], aggregate: 'sum', mappings: [] }
}

// 文件拖拽/选择（去重）
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
  tplStep.value = 'loading'
  try {
    draft.value = await tableToolsApi.aiDraft(tplFiles.value, aiContext.value)
    form.value = {
      name: draft.value.name || '',
      description: draft.value.description || '',
      merge_keys: [...draft.value.merge_keys],
      std_fields: [...draft.value.std_fields],
      aggregate: draft.value.aggregate,
      mappings: draft.value.mappings.map((m) => ({ ...m })),
    }
    tplStep.value = 'form'
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || 'AI 识别失败，请重试')
    tplStep.value = 'upload'
  }
}

// 跳过 AI，直接进表单
function skipToManual() {
  draft.value = null
  resetForm()
  tplStep.value = 'form'
}

function aiLowConfidence(mappingName: string) {
  return draft.value?._meta?.low_confidence?.find((l) => l.sheet === mappingName)
}

// 保存
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
    tplDialog.value = false
    await loadTemplates()
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

// 标准字段 tag
function addStdField() {
  const v = stdFieldInput.value.trim()
  if (v && !form.value.std_fields.includes(v)) form.value.std_fields.push(v)
  stdFieldInput.value = ''
}
function removeStdField(f: string) {
  form.value.std_fields = form.value.std_fields.filter((x) => x !== f)
}

// ── 月度合并 ─────────────────────────────────────────────────────────────────
function openMerge(t: TemplateOut) {
  mergeTemplate.value = t
  mergeFiles.value = []
  mergeResult.value = null
  mergeDrawer.value = true
}

function handleMergeFileChange(uploadFile: any) {
  const file: File = uploadFile.raw
  if (!mergeFiles.value.find((f) => f.name === file.name && f.size === file.size)) {
    mergeFiles.value.push(file)
  }
}
function removeMergeFile(index: number) { mergeFiles.value.splice(index, 1) }

async function runMerge() {
  if (!mergeTemplate.value) return
  if (!mergeFiles.value.length) { ElMessage.warning('请先上传文件'); return }
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
  if (!mergeTemplate.value) return
  if (!mergeFiles.value.length) { ElMessage.warning('请先上传文件'); return }
  downloading.value = true
  try {
    await tableToolsApi.downloadMerge(mergeTemplate.value.id, mergeFiles.value)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '下载失败')
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div style="padding: 24px">
    <!-- 模板列表 -->
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div>
            <div style="font-size: 16px; font-weight: 600">表格归集</div>
            <div style="margin-top: 4px; font-size: 13px; color: var(--color-text-placeholder)">
              配置归集模板，定期上传多源文件一键合并为标准表格。
            </div>
          </div>
          <PermissionButton menu="table_tools" op="E" type="primary" :icon="Plus"
            @click="openNew">新建模板</PermissionButton>
        </div>
      </template>

      <el-empty v-if="!loading && !templates.length" description="暂无归集模板" />

      <el-table v-else :data="templates" v-loading="loading" style="width: 100%">
        <el-table-column prop="name" label="模板名称" min-width="160" />
        <el-table-column prop="description" label="说明" min-width="200" show-overflow-tooltip />
        <el-table-column label="合并主键" min-width="140">
          <template #default="{ row }">
            <el-tag v-for="k in row.merge_keys" :key="k" size="small" style="margin-right: 4px">{{ k }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="mapping_count" label="数据源数" width="90" align="center" />
        <el-table-column prop="version" label="版本" width="70" align="center" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" :icon="Upload" @click="openMerge(row)">合并</el-button>
            <PermissionButton menu="table_tools" op="E" size="small" style="margin-left: 6px"
              @click="openEdit(row.id)">编辑</PermissionButton>
            <PermissionButton menu="table_tools" op="E" size="small" type="danger" :icon="Delete"
              style="margin-left: 6px" @click="deleteTemplate(row)">删除</PermissionButton>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 月度合并抽屉 -->
    <el-drawer v-model="mergeDrawer" :title="`合并 · ${mergeTemplate?.name}`" size="720px" destroy-on-close>
      <div style="padding: 0 4px">
        <!-- 拖拽上传区 -->
        <el-upload
          drag multiple :auto-upload="false" :show-file-list="false"
          accept=".xlsx,.xls" :on-change="handleMergeFileChange"
          style="margin-bottom: 12px">
          <el-icon style="font-size: 40px; color: var(--color-text-placeholder)"><Upload /></el-icon>
          <div style="margin-top: 8px; font-size: 14px; color: var(--color-text-regular)">
            拖拽文件到此处，或 <em style="color: var(--color-primary)">点击选择</em>
          </div>
          <div style="margin-top: 4px; font-size: 12px; color: var(--color-text-placeholder)">
            支持 .xlsx / .xls，可同时选择多个文件
          </div>
        </el-upload>

        <!-- 已选文件列表 -->
        <div v-if="mergeFiles.length" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px">
          <el-tag v-for="(f, i) in mergeFiles" :key="i" closable @close="removeMergeFile(i)" type="info">
            {{ f.name }}
          </el-tag>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 16px">
          <el-button type="primary" :loading="merging" :disabled="!mergeFiles.length" @click="runMerge">
            运行预览
          </el-button>
          <el-button :icon="Download" :loading="downloading" :disabled="!mergeFiles.length" @click="downloadResult">
            下载完整结果
          </el-button>
        </div>

        <!-- 统计 -->
        <div v-if="mergeResult" style="margin-bottom: 12px">
          <el-descriptions :column="4" border size="small">
            <el-descriptions-item label="文件">{{ mergeResult.stats.files }}</el-descriptions-item>
            <el-descriptions-item label="原始记录">{{ mergeResult.stats.records }}</el-descriptions-item>
            <el-descriptions-item label="归集人数">{{ mergeResult.stats.persons }}</el-descriptions-item>
            <el-descriptions-item label="异常">
              <el-tag :type="mergeResult.stats.anomalies ? 'danger' : 'success'" size="small">
                {{ mergeResult.stats.anomalies }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 识别日志 -->
        <div v-if="mergeResult?.recognize_log?.length">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--color-text-regular)">
            识别日志（{{ mergeResult.recognize_log.length }} 个 sheet 命中）
          </div>
          <el-table :data="mergeResult.recognize_log" size="small" style="margin-bottom: 12px">
            <el-table-column prop="file" label="文件" show-overflow-tooltip />
            <el-table-column prop="sheet" label="Sheet" />
            <el-table-column prop="mapping" label="映射方案" />
          </el-table>
        </div>

        <!-- 异常 -->
        <div v-if="mergeResult?.anomalies?.length">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--el-color-danger)">
            字段冲突（{{ mergeResult.anomalies.length }} 条）
          </div>
          <el-table :data="mergeResult.anomalies" size="small" style="margin-bottom: 12px">
            <el-table-column prop="key" label="人员主键" show-overflow-tooltip />
            <el-table-column prop="field" label="字段" />
            <el-table-column label="冲突值">
              <template #default="{ row }">{{ row.values?.join(' vs ') }}</template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 预览表格 -->
        <div v-if="mergeResult?.rows?.length">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--color-text-regular)">
            预览（前 {{ mergeResult.rows.length }} 行 / 共 {{ mergeResult.total_rows }} 行）
          </div>
          <el-table :data="mergeResult.rows" size="small" border style="font-size: 12px" max-height="400">
            <el-table-column v-for="col in mergeResult.columns" :key="col" :prop="col" :label="col"
              min-width="110" show-overflow-tooltip />
          </el-table>
        </div>
      </div>
    </el-drawer>

    <!-- 新建/编辑模板对话框 -->
    <el-dialog
      v-model="tplDialog"
      :title="editingId ? '编辑模板' : '新建归集模板'"
      width="860px" destroy-on-close>

      <!-- 步骤 1：上传文件（新建时） -->
      <template v-if="tplStep === 'upload'">
        <el-upload
          drag multiple :auto-upload="false" :show-file-list="false"
          accept=".xlsx,.xls" :on-change="handleTplFileChange">
          <el-icon style="font-size: 40px; color: var(--color-text-placeholder)"><Upload /></el-icon>
          <div style="margin-top: 8px; font-size: 14px; color: var(--color-text-regular)">
            拖拽文件到此处，或 <em style="color: var(--color-primary)">点击选择</em>
          </div>
          <div style="margin-top: 4px; font-size: 12px; color: var(--color-text-placeholder)">
            上传本次归集场景的所有源文件，AI 将自动识别字段映射 · 支持 .xlsx / .xls · 可多选
          </div>
        </el-upload>

        <!-- 已选文件 -->
        <div v-if="tplFiles.length" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px">
          <el-tag v-for="(f, i) in tplFiles" :key="i" closable @close="removeTplFile(i)" type="info">
            {{ f.name }}
          </el-tag>
        </div>

        <!-- 业务背景 -->
        <el-input
          v-model="aiContext"
          placeholder="可选：一句话说明业务背景，如：社保公积金月度归集，区分个人与单位"
          style="margin-top: 16px" />

        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px">
          <el-button @click="tplDialog = false">取消</el-button>
          <el-button @click="skipToManual">跳过，手动配置</el-button>
          <el-button type="primary" :icon="MagicStick" :disabled="!tplFiles.length" @click="runAiDraft">
            AI 识别
          </el-button>
        </div>
      </template>

      <!-- 步骤 2：AI 分析中 -->
      <template v-else-if="tplStep === 'loading'">
        <div style="text-align: center; padding: 60px 0">
          <el-icon class="is-loading" style="font-size: 40px; color: var(--color-primary)">
            <MagicStick />
          </el-icon>
          <div style="margin-top: 16px; color: var(--color-text-regular)">AI 正在分析文件结构，请稍候…</div>
        </div>
      </template>

      <!-- 步骤 3：确认/填写表单（AI 草稿或手动） -->
      <template v-else>
        <!-- 低置信度提示 -->
        <el-alert v-if="draft?._meta?.low_confidence?.length" type="warning" :closable="false"
          style="margin-bottom: 16px">
          <div style="font-size: 13px">
            以下映射置信度较低，请人工核查：
            <span v-for="lc in draft._meta.low_confidence" :key="lc.sheet" style="margin-left: 8px">
              <strong>{{ lc.sheet }}</strong>（{{ Math.round(lc.confidence * 100) }}%）{{ lc.notes ? '· ' + lc.notes : '' }}
            </span>
          </div>
        </el-alert>

        <el-form :model="form" label-width="100px" style="max-height: 560px; overflow-y: auto; padding-right: 8px">
          <el-form-item label="模板名称" required>
            <el-input v-model="form.name" placeholder="如：社保月度归集" />
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model="form.description" placeholder="可选" />
          </el-form-item>
          <el-form-item label="合并主键">
            <el-select v-model="form.merge_keys" multiple allow-create filterable placeholder="输入后回车">
              <el-option v-for="k in form.merge_keys" :key="k" :label="k" :value="k" />
            </el-select>
          </el-form-item>
          <el-form-item label="标准字段" required>
            <div style="width: 100%">
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px">
                <el-tag v-for="f in form.std_fields" :key="f" closable @close="removeStdField(f)">{{ f }}</el-tag>
              </div>
              <div style="display: flex; gap: 6px">
                <el-input v-model="stdFieldInput" placeholder="输入字段名后添加" size="small"
                  @keyup.enter="addStdField" style="width: 200px" />
                <el-button size="small" @click="addStdField">添加</el-button>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="数据源映射">
            <div style="width: 100%">
              <div v-if="!form.mappings.length" style="color: var(--color-text-placeholder); font-size: 13px">
                暂无映射，保存后可在编辑中补充
              </div>
              <el-collapse v-else>
                <el-collapse-item v-for="(m, idx) in form.mappings" :key="idx" :name="idx">
                  <template #title>
                    <div style="display: flex; align-items: center; gap: 8px">
                      <span>{{ m.name }}</span>
                      <el-tag v-if="aiLowConfidence(m.name)" type="warning" size="small">
                        置信度 {{ Math.round((aiLowConfidence(m.name)?.confidence || 0) * 100) }}%
                      </el-tag>
                    </div>
                  </template>
                  <div style="font-size: 12px; color: var(--color-text-regular); line-height: 2">
                    <div><strong>Sheet：</strong>{{ m.sheet_kw || '(任意)' }} &nbsp;
                      <strong>表头行：</strong>{{ m.header_start }}–{{ m.header_end }}</div>
                    <div><strong>识别签名：</strong>{{ m.match_signature?.join(', ') }}</div>
                    <div><strong>主键映射：</strong>
                      <span v-for="(v, k) in m.key_map" :key="String(k)" style="margin-right: 8px">{{ k }} → {{ v }}</span>
                    </div>
                    <div><strong>字段映射：</strong>
                      <span v-for="(v, k) in m.column_map" :key="String(k)" style="margin-right: 8px">{{ k }} → {{ v }}</span>
                    </div>
                    <div v-if="m.derived_fields?.length"><strong>派生字段：</strong>
                      <span v-for="df in m.derived_fields" :key="df.target" style="margin-right: 8px">
                        {{ df.target }} = {{ df.expr }}
                      </span>
                    </div>
                    <div v-if="aiLowConfidence(m.name)?.notes" style="color: var(--el-color-warning)">
                      ⚠️ {{ aiLowConfidence(m.name)?.notes }}
                    </div>
                  </div>
                </el-collapse-item>
              </el-collapse>
            </div>
          </el-form-item>
        </el-form>

        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px">
          <!-- 新建时可以退回重新上传 -->
          <el-button v-if="!editingId" @click="tplStep = 'upload'">返回重新上传</el-button>
          <el-button @click="tplDialog = false">取消</el-button>
          <el-button type="primary" :loading="savingTpl" @click="saveTemplate">保存模板</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
