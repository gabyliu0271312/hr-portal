<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Plus, Refresh, Upload, View } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import {
  toolsApi,
  type DocumentTemplate,
  type DocumentTemplateBusinessType,
  type DocumentTemplatePayload,
  type DocumentTemplateVariable,
  type DocumentTemplateVariableSourceType,
} from '@/api/tools'

const MENU = 'system.document_templates'

const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const previewing = ref(false)
const list = ref<DocumentTemplate[]>([])
const keyword = ref('')
const businessTypeFilter = ref('')
const dialogOpen = ref(false)
const previewOpen = ref(false)
const previewHtml = ref('')
const previewTarget = ref<DocumentTemplate | null>(null)
const previewPaperRef = ref<HTMLElement | null>(null)
const previewDirty = ref(false)
const savingPreview = ref(false)
const editing = ref<DocumentTemplate | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const businessTypeOptions: Array<{ label: string; value: DocumentTemplateBusinessType }> = [
  { label: '解除协议', value: 'agreement' },
  { label: '收入证明', value: 'income_certificate' },
]

const sourceTypeOptions: Array<{ label: string; value: DocumentTemplateVariableSourceType }> = [
  { label: '员工字段', value: 'employee_field' },
  { label: '系统计算', value: 'computed' },
  { label: '手工录入', value: 'manual' },
  { label: '固定值', value: 'fixed' },
  { label: '系统参数', value: 'system' },
]

const form = reactive<DocumentTemplatePayload>({
  code: '',
  name: '',
  business_type: 'income_certificate',
  description: '',
  is_active: true,
  version: '1.0',
  effective_start: null,
  effective_end: null,
  layout_config: {},
  blocks: [],
  variables: [],
})

const businessTypeName = (value: string) =>
  businessTypeOptions.find((item) => item.value === value)?.label || value

function fileSize(size?: number | null) {
  if (!size) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function newVariable(code = ''): DocumentTemplateVariable {
  return {
    variable_code: code,
    variable_name: code,
    source_type: 'manual',
    source_key: '',
    default_value: '',
    required: false,
    formatter: '',
  }
}

function clonePayload(row: DocumentTemplate): DocumentTemplatePayload {
  return {
    code: row.code,
    name: row.name,
    business_type: row.business_type,
    description: row.description || '',
    is_active: row.is_active,
    version: row.version || '1.0',
    effective_start: row.effective_start,
    effective_end: row.effective_end,
    layout_config: row.layout_config || {},
    blocks: row.blocks.map((block) => ({ ...block })),
    variables: row.variables.map((variable) => ({ ...variable })),
  }
}

function resetForm() {
  Object.assign(form, {
    code: '',
    name: '',
    business_type: 'income_certificate',
    description: '',
    is_active: true,
    version: '1.0',
    effective_start: null,
    effective_end: null,
    layout_config: {},
    blocks: [],
    variables: [],
  })
}

async function load() {
  loading.value = true
  try {
    list.value = await toolsApi.listDocumentTemplates({
      business_type: businessTypeFilter.value || undefined,
      keyword: keyword.value || undefined,
    })
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载模板失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  resetForm()
  dialogOpen.value = true
}

function openEdit(row: DocumentTemplate) {
  editing.value = row
  Object.assign(form, clonePayload(row))
  dialogOpen.value = true
}

function addVariable(code = '') {
  form.variables.push(newVariable(code))
}

function removeVariable(index: number) {
  form.variables.splice(index, 1)
}

function addMissingParsedVariables() {
  if (!editing.value?.parsed_variables?.length) return
  const existing = new Set(form.variables.map((item) => item.variable_code))
  editing.value.parsed_variables.forEach((code) => {
    if (!existing.has(code)) addVariable(code)
  })
}

function normalizePayload(): DocumentTemplatePayload {
  return {
    ...form,
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description?.trim() || null,
    effective_start: form.effective_start || null,
    effective_end: form.effective_end || null,
    layout_config: form.layout_config || {},
    blocks: form.blocks.map((block) => ({
      ...block,
      content: block.content || '',
      style_config: block.style_config || {},
    })),
    variables: form.variables.map((variable) => ({
      ...variable,
      variable_code: variable.variable_code.trim(),
      variable_name: variable.variable_name.trim(),
      source_key: variable.source_key?.trim() || null,
      default_value: variable.default_value?.trim() || null,
      formatter: variable.formatter?.trim() || null,
    })),
  }
}

function validate() {
  if (!form.code.trim() || !form.name.trim()) {
    ElMessage.warning('模板编码和模板名称必填')
    return false
  }
  const codes = form.variables.map((item) => item.variable_code.trim()).filter(Boolean)
  if (codes.length !== new Set(codes).size) {
    ElMessage.warning('变量编码不能重复')
    return false
  }
  if (form.variables.some((item) => !item.variable_code.trim() || !item.variable_name.trim())) {
    ElMessage.warning('变量编码和变量名称必填')
    return false
  }
  return true
}

async function save() {
  if (!validate()) return
  saving.value = true
  try {
    const payload = normalizePayload()
    const saved = editing.value
      ? await toolsApi.updateDocumentTemplate(editing.value.id, payload)
      : await toolsApi.createDocumentTemplate(payload)
    editing.value = saved
    Object.assign(form, clonePayload(saved))
    ElMessage.success('已保存')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row: DocumentTemplate) {
  try {
    await ElMessageBox.confirm(`删除模板「${row.name}」？`, '提示', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await toolsApi.removeDocumentTemplate(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

function chooseFile(row: DocumentTemplate) {
  editing.value = row
  Object.assign(form, clonePayload(row))
  fileInput.value?.click()
}

async function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !editing.value) return
  uploading.value = true
  try {
    const result = await toolsApi.uploadDocumentTemplateWord(editing.value.id, file)
    ElMessage.success(`已上传并解析 ${result.parsed_variables.length} 个变量`)
    await load()
    const fresh = await toolsApi.getDocumentTemplate(editing.value.id)
    editing.value = fresh
    Object.assign(form, clonePayload(fresh))
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '上传失败')
  } finally {
    uploading.value = false
  }
}

async function downloadWord(row: DocumentTemplate) {
  try {
    const resp = await toolsApi.downloadDocumentTemplateWord(row.id)
    const blob = new Blob([resp.data as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = row.template_file_name || `${row.code}.docx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '下载失败')
  }
}

function placeholderSampleData(row: DocumentTemplate) {
  const codes = new Set<string>()
  row.parsed_variables.forEach((code) => codes.add(code))
  row.variables.forEach((variable) => codes.add(variable.variable_code))
  return Object.fromEntries([...codes].map((code) => [code, `{{${code}}}`]))
}

async function preview(row: DocumentTemplate) {
  previewTarget.value = row
  previewOpen.value = true
  previewing.value = true
  previewHtml.value = ''
  previewDirty.value = false
  try {
    const result = await toolsApi.previewDocumentTemplate(row.id, placeholderSampleData(row))
    previewHtml.value = result.html
    await nextTick()
    if (previewPaperRef.value) previewPaperRef.value.innerHTML = previewHtml.value
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '预览失败')
  } finally {
    previewing.value = false
  }
}

function onTemplatePreviewInput() {
  previewHtml.value = previewPaperRef.value?.innerHTML || ''
  previewDirty.value = true
}

async function saveTemplatePreview() {
  if (!previewTarget.value) return
  const html = previewPaperRef.value?.innerHTML || previewHtml.value
  savingPreview.value = true
  try {
    const saved = await toolsApi.saveDocumentTemplatePreview(previewTarget.value.id, html)
    previewTarget.value = saved
    if (editing.value?.id === saved.id) {
      editing.value = saved
      Object.assign(form, clonePayload(saved))
    }
    previewDirty.value = false
    ElMessage.success('已保存预览内容')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存预览失败')
  } finally {
    savingPreview.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="template-page">
    <input ref="fileInput" class="hidden-file" type="file" accept=".docx" @change="onFilePicked" />

    <el-card>
      <template #header>
        <div class="page-head">
          <div>
            <div class="page-title">模板维护</div>
            <div class="page-subtitle" v-text="'上传 Word 模板，系统解析 {{variable_code}} 占位符并用于文档生成。'"></div>
          </div>
          <div class="page-actions">
            <el-button :icon="Refresh" @click="load">刷新</el-button>
            <PermissionButton :menu="MENU" op="C" type="primary" @click="openCreate">
              <el-icon><Plus /></el-icon>
              新增模板
            </PermissionButton>
          </div>
        </div>
      </template>

      <el-form class="filter-bar" inline>
        <el-form-item>
          <el-input
            v-model="keyword"
            placeholder="模板名称 / 编码"
            clearable
            style="width: 220px"
            @keyup.enter="load"
            @change="load"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="businessTypeFilter" clearable placeholder="业务类型" style="width: 160px" @change="load">
            <el-option v-for="item in businessTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" plain @click="load">查询</el-button>
          <el-button link @click="keyword = ''; businessTypeFilter = ''; load()">重置</el-button>
        </el-form-item>
      </el-form>

      <div class="table-wrap">
        <el-table v-loading="loading" :data="list" stripe style="width: 100%" max-height="620">
          <el-table-column prop="name" label="模板名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="code" label="编码" min-width="150" show-overflow-tooltip />
          <el-table-column label="业务类型" min-width="110">
            <template #default="{ row }">{{ businessTypeName(row.business_type) }}</template>
          </el-table-column>
          <el-table-column label="Word 模板" min-width="190" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.template_file_name">{{ row.template_file_name }}（{{ fileSize(row.template_file_size) }}）</span>
              <el-tag v-else size="small" type="warning" effect="plain">未上传</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="变量" min-width="90">
            <template #default="{ row }">{{ row.parsed_variables.length }} / {{ row.variables.length }}</template>
          </el-table-column>
          <el-table-column label="状态" min-width="80">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'info'" effect="plain">
                {{ row.is_active ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="updated_at" label="更新时间" min-width="170" show-overflow-tooltip />
          <el-table-column label="操作" width="330" fixed="right">
            <template #default="{ row }">
              <PermissionButton :menu="MENU" op="U" size="small" :disabled="uploading" @click="chooseFile(row)">
                <el-icon><Upload /></el-icon>
                上传
              </PermissionButton>
              <el-button size="small" plain @click="downloadWord(row)">
                <el-icon><Download /></el-icon>
                下载
              </el-button>
              <el-button size="small" plain @click="preview(row)">
                <el-icon><View /></el-icon>
                预览
              </el-button>
              <PermissionButton :menu="MENU" op="U" size="small" @click="openEdit(row)">编辑</PermissionButton>
              <PermissionButton :menu="MENU" op="D" size="small" type="danger" @click="remove(row)">删除</PermissionButton>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <el-dialog
      v-model="dialogOpen"
      :title="editing ? '编辑模板' : '新增模板'"
      width="92%"
      top="4vh"
      :close-on-click-modal="false"
    >
      <div class="editor-layout">
        <div class="editor-main">
          <el-form label-position="top">
            <div class="form-grid">
              <el-form-item label="模板编码" required>
                <el-input v-model="form.code" placeholder="如 annual_income" :disabled="Boolean(editing)" />
              </el-form-item>
              <el-form-item label="模板名称" required>
                <el-input v-model="form.name" placeholder="如 年包收入证明" />
              </el-form-item>
              <el-form-item label="业务类型" required>
                <el-select v-model="form.business_type" style="width: 100%">
                  <el-option v-for="item in businessTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="版本">
                <el-input v-model="form.version" />
              </el-form-item>
              <el-form-item label="生效开始">
                <el-date-picker v-model="form.effective_start" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
              <el-form-item label="生效结束">
                <el-date-picker v-model="form.effective_end" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </div>
            <el-form-item label="描述">
              <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选" />
            </el-form-item>
            <el-form-item>
              <el-switch v-model="form.is_active" active-text="启用" inactive-text="停用" />
            </el-form-item>
          </el-form>

          <div class="section-head">
            <div>
              <div class="section-title">变量来源</div>
              <div class="section-subtitle" v-text="'Word 里使用 {{name}} 这样的占位符；上传后会自动解析并补充变量。'"></div>
            </div>
            <div class="section-actions">
              <el-button v-if="editing?.parsed_variables?.length" size="small" @click="addMissingParsedVariables">
                补齐解析变量
              </el-button>
              <el-button size="small" @click="addVariable()">
                <el-icon><Plus /></el-icon>
                新增变量
              </el-button>
            </div>
          </div>

          <el-table :data="form.variables" border size="small" class="editor-table">
            <el-table-column label="编码" min-width="150">
              <template #default="{ row }"><el-input v-model="row.variable_code" size="small" /></template>
            </el-table-column>
            <el-table-column label="名称" min-width="150">
              <template #default="{ row }"><el-input v-model="row.variable_name" size="small" /></template>
            </el-table-column>
            <el-table-column label="来源" width="130">
              <template #default="{ row }">
                <el-select v-model="row.source_type" size="small">
                  <el-option v-for="item in sourceTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="来源键" min-width="150">
              <template #default="{ row }"><el-input v-model="row.source_key" size="small" placeholder="员工字段名或系统键" /></template>
            </el-table-column>
            <el-table-column label="默认值" min-width="150">
              <template #default="{ row }"><el-input v-model="row.default_value" size="small" /></template>
            </el-table-column>
            <el-table-column label="必填" width="80">
              <template #default="{ row }"><el-checkbox v-model="row.required" /></template>
            </el-table-column>
            <el-table-column label="操作" width="70">
              <template #default="{ $index }">
                <el-button type="danger" link size="small" @click="removeVariable($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <aside class="editor-aside">
          <div class="aside-title">Word 模板</div>
          <template v-if="editing">
            <div class="file-box">
              <div class="file-name">{{ editing.template_file_name || '尚未上传 Word 模板' }}</div>
              <div class="file-meta">大小：{{ fileSize(editing.template_file_size) }}</div>
              <div class="file-meta">解析变量：{{ editing.parsed_variables.length }} 个</div>
            </div>
            <PermissionButton :menu="MENU" op="U" style="width: 100%" :disabled="uploading" @click="chooseFile(editing)">
              <el-icon><Upload /></el-icon>
              上传 / 替换 Word
            </PermissionButton>
            <el-button style="width: 100%; margin-top: 8px" @click="downloadWord(editing)">
              <el-icon><Download /></el-icon>
              下载当前模板
            </el-button>
            <div class="parsed-list">
              <div v-for="code in editing.parsed_variables" :key="code" class="parsed-item">{{ code }}</div>
            </div>
          </template>
          <template v-else>
            <div class="empty-aside">先保存模板基础信息，再上传 Word 模板。</div>
          </template>
        </aside>
      </div>

      <template #footer>
        <el-button @click="dialogOpen = false">关闭</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="previewOpen" title="模板预览 / 编辑" width="96%" top="2vh">
      <div class="preview-scroll">
        <div
          ref="previewPaperRef"
          v-loading="previewing"
          class="preview-paper"
          contenteditable="true"
          spellcheck="false"
          v-html="previewHtml"
          @input="onTemplatePreviewInput"
        ></div>
      </div>
      <template #footer>
        <span
          class="save-hint"
          v-text="previewDirty ? '预览内容已修改，保存后会作为系统标准模板使用。' : '预览内容可直接编辑，变量请保留 {{变量编码}} 格式。'"
        ></span>
        <el-button :loading="savingPreview" :disabled="!previewDirty" type="primary" @click="saveTemplatePreview">保存预览内容</el-button>
        <el-button @click="previewOpen = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.template-page {
  padding: 24px;
}
.hidden-file {
  display: none;
}
.page-head,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.page-subtitle,
.section-subtitle {
  margin-top: 4px;
  color: var(--color-text-placeholder);
  font-size: 13px;
}
.page-actions,
.section-actions {
  display: flex;
  gap: 8px;
}
.filter-bar {
  margin-bottom: 16px;
}
.filter-bar :deep(.el-form-item) {
  margin-bottom: 8px;
}
.table-wrap {
  overflow-x: auto;
}
.editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  max-height: 74vh;
  overflow: hidden;
}
.editor-main {
  min-width: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 1fr));
  gap: 0 12px;
}
.section-head {
  margin: 18px 0 10px;
}
.section-title,
.aside-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.editor-table {
  width: 100%;
}
.editor-aside {
  min-height: 0;
  border-left: 1px solid var(--color-border);
  padding-left: 16px;
  overflow-y: auto;
}
.file-box {
  padding: 10px;
  margin: 12px 0;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-bg-subtle);
}
.file-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  word-break: break-all;
}
.file-meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.parsed-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.parsed-item {
  max-width: 100%;
  padding: 2px 6px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  color: var(--color-primary);
  background: var(--color-primary-subtle);
  font-size: 12px;
  word-break: break-all;
}
.empty-aside {
  margin-top: 12px;
  color: var(--color-text-secondary);
  font-size: 13px;
}
.preview-scroll {
  max-height: 78vh;
  overflow: auto;
  background: var(--color-bg-subtle);
  padding: 16px;
}
.preview-paper {
  width: 215.9mm;
  min-height: 279.4mm;
  margin: 0 auto;
  padding: 25.4mm 31.75mm;
  box-sizing: border-box;
  overflow: visible;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  outline: none;
}
.preview-paper:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light), 0 2px 12px rgba(0, 0, 0, 0.06);
}
.preview-paper :deep(.agr-doc),
.preview-paper :deep(.cert-doc) {
  font-family: SimSun, '宋体', serif;
  color: #000;
}
.preview-paper :deep(.agr-doc) {
  font-size: 12pt;
  line-height: 1.45;
}
.preview-paper :deep(.agr-header) {
  text-align: right;
  font-size: 9pt;
  color: #000;
  margin-bottom: 8mm;
}
.preview-paper :deep(.agr-title) {
  text-align: center;
  font-size: 16pt;
  font-weight: 700;
  margin: 0 0 8mm;
}
.preview-paper :deep(.agr-head) {
  margin: 0 0 3mm;
  white-space: nowrap;
}
.preview-paper :deep(.agr-p) {
  margin: 0 0 3.5mm;
  text-align: justify;
  text-indent: 2em;
}
.preview-paper :deep(.agr-line) {
  margin: 0 0 3.5mm;
  white-space: nowrap;
}
.preview-paper :deep(.agr-sign) {
  margin-top: 9mm;
  white-space: nowrap;
}
.preview-paper :deep(.cert-doc) {
  font-size: 14pt;
  line-height: 1.5;
}
.preview-paper :deep(.cert-title) {
  text-align: center;
  font-size: 18pt;
  font-weight: 700;
  margin: 18mm 0 18mm;
}
.preview-paper :deep(.cert-p) {
  margin: 0 0 8mm;
  text-align: justify;
  text-indent: 2em;
}
.preview-paper :deep(.cert-sign) {
  margin: 0 0 5mm;
  text-align: right;
}
.preview-paper :deep(.cert-line) {
  margin: 0 0 3mm;
}
.save-hint {
  float: left;
  color: var(--color-text-secondary);
  font-size: 13px;
}

@media (max-width: 1100px) {
  .editor-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  .editor-aside {
    border-left: 0;
    border-top: 1px solid var(--color-border);
    padding-left: 0;
    padding-top: 16px;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
