<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Document, Printer } from '@element-plus/icons-vue'
import {
  toolsApi,
  type EmployeeCandidate,
  type IncomeCertificateData,
  type IncomeCertificateTemplate,
} from '@/api/tools'

const keyword = ref('')
const searching = ref(false)
const preparing = ref(false)
const printing = ref(false)
const employees = ref<EmployeeCandidate[]>([])
const selected = ref<EmployeeCandidate | null>(null)
const templates = ref<IncomeCertificateTemplate[]>([])
const templateCode = ref('annual_income')
const certData = ref<IncomeCertificateData | null>(null)

const previewOpen = ref(false)
const previewing = ref(false)
const downloading = ref(false)
const previewHtml = ref('')

const busy = computed(() => searching.value || preparing.value)

function money(v?: number | null) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

async function loadTemplates() {
  try {
    templates.value = await toolsApi.listIncomeCertificateTemplates()
    if (!templateCode.value && templates.value.length) templateCode.value = templates.value[0].code
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载模板失败')
  }
}

async function searchAndPrepare() {
  if (!keyword.value.trim()) {
    ElMessage.warning('请输入工号、中文名或英文名')
    return
  }
  searching.value = true
  selected.value = null
  certData.value = null
  try {
    employees.value = await toolsApi.searchIncomeCertificateEmployees({ keyword: keyword.value.trim(), limit: 30 })
    if (!employees.value.length) {
      ElMessage.info('未找到有权限查看的员工')
    } else if (employees.value.length === 1) {
      pickEmployee(employees.value[0])
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '查询员工失败')
  } finally {
    searching.value = false
  }
}

function pickEmployee(row: EmployeeCandidate) {
  selected.value = row
  employees.value = []
  prepareCertificate()
}

function rowClassName({ row }: { row: EmployeeCandidate }) {
  return selected.value && row.id === selected.value.id ? 'is-selected-row' : ''
}

async function prepareCertificate() {
  if (!selected.value || !templateCode.value) return
  preparing.value = true
  try {
    certData.value = await toolsApi.prepareIncomeCertificate({
      employee_id: selected.value.id,
      template_code: templateCode.value,
    })
  } catch (e: any) {
    certData.value = null
    ElMessage.error(`已找到「${selected.value.name || ''}」，但${e?.response?.data?.detail || '开具失败'}`)
  } finally {
    preparing.value = false
  }
}

watch(templateCode, () => {
  if (selected.value) prepareCertificate()
})

function resetAll() {
  keyword.value = ''
  employees.value = []
  selected.value = null
  certData.value = null
  previewHtml.value = ''
  previewOpen.value = false
}

async function openPreview() {
  if (!certData.value) return
  previewOpen.value = true
  await refreshPreview()
}

async function refreshPreview() {
  if (!certData.value) return
  previewing.value = true
  try {
    previewHtml.value = await toolsApi.previewIncomeCertificate(certData.value)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '预览失败')
  } finally {
    previewing.value = false
  }
}

async function downloadDocx() {
  if (!certData.value) return
  downloading.value = true
  try {
    const resp = await toolsApi.downloadIncomeCertificate(certData.value)
    const blob = new Blob([resp.data as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `收入证明_${certData.value.name || '员工'}.docx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '下载失败')
  } finally {
    downloading.value = false
  }
}

const PRINT_STYLE = `
  @page { size: A4; margin: 25mm 20mm; }
  body { font-family: SimSun, "宋体", serif; color: #000; }
  .cert-doc { font-size: 14pt; line-height: 1.8; }
  .cert-header { margin-bottom: 18px; }
  .cert-logo { width: 38mm; height: auto; display: block; }
  .cert-title { text-align: center; font-size: 18pt; font-weight: 700; margin: 6px 0 16px; }
  .cert-p { margin: 0 0 8px; text-align: justify; text-indent: 2em; }
  .cert-sign { margin: 18px 0 8px; text-align: right; white-space: nowrap; }
  .cert-line { margin: 4px 0; white-space: nowrap; }
`

function printHtml(html: string) {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) {
    ElMessage.warning('浏览器拦截了打印窗口，请允许弹窗后重试')
    return
  }
  w.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>收入证明</title><style>${PRINT_STYLE}</style></head><body>${html}</body></html>`,
  )
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

async function printDirect() {
  if (!certData.value) return
  printing.value = true
  try {
    previewHtml.value = await toolsApi.previewIncomeCertificate(certData.value)
    printHtml(previewHtml.value)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '打印失败')
  } finally {
    printing.value = false
  }
}

onMounted(loadTemplates)
</script>

<template>
  <div class="income-cert">
    <el-card body-style="padding: 16px">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <div>
            <div style="font-size: 16px; font-weight: 600">证明开具</div>
            <div style="margin-top: 4px; color: var(--color-text-placeholder); font-size: 13px">
              选择模板后开具收入证明，支持预览、打印和下载 Word。
            </div>
          </div>
          <div v-if="certData" style="display: flex; gap: 8px">
            <el-button type="primary" plain :loading="previewing" @click="openPreview">
              <el-icon style="margin-right: 4px"><Document /></el-icon>预览
            </el-button>
            <el-button type="primary" :loading="printing" @click="printDirect">
              <el-icon style="margin-right: 4px"><Printer /></el-icon>打印
            </el-button>
          </div>
        </div>
      </template>

      <el-form class="op-bar">
        <div class="op-row">
          <el-form-item>
            <el-input
              v-model="keyword"
              placeholder="工号 / 中文名 / 英文名"
              clearable
              style="width: 220px"
              @keyup.enter="searchAndPrepare"
            >
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="模板">
            <el-select v-model="templateCode" style="width: 180px" placeholder="请选择模板">
              <el-option v-for="t in templates" :key="t.code" :label="t.name" :value="t.code" />
            </el-select>
          </el-form-item>
        </div>
        <div class="op-row">
          <el-form-item>
            <el-button type="primary" :loading="busy" @click="searchAndPrepare">
              <el-icon style="margin-right: 4px"><Search /></el-icon>查询并开具
            </el-button>
            <el-button link @click="resetAll">重置</el-button>
          </el-form-item>
        </div>
      </el-form>

      <template v-if="employees.length">
        <div class="section-title">请选择员工（{{ employees.length }} 人）</div>
        <div style="overflow-x: auto">
          <el-table
            :data="employees"
            stripe
            highlight-current-row
            size="small"
            max-height="220"
            style="width: 100%"
            :row-class-name="rowClassName"
            @row-click="pickEmployee"
          >
            <el-table-column prop="employee_no" label="工号" align="left" min-width="90" />
            <el-table-column prop="name" label="姓名" align="left" min-width="100" show-overflow-tooltip />
            <el-table-column prop="company" label="公司" align="left" min-width="140" show-overflow-tooltip />
            <el-table-column prop="department" label="部门" align="left" min-width="140" show-overflow-tooltip />
            <el-table-column prop="work_region" label="工作地" align="left" min-width="90">
              <template #default="{ row }">{{ row.work_region || '—' }}</template>
            </el-table-column>
            <el-table-column prop="hire_date" label="入职日期" align="left" min-width="110">
              <template #default="{ row }">{{ row.hire_date || '—' }}</template>
            </el-table-column>
          </el-table>
        </div>
      </template>

      <template v-if="certData">
        <div class="section-title">开具信息</div>
        <div style="overflow-x: auto">
          <el-table :data="[certData]" border size="small" style="width: 100%">
            <el-table-column prop="name" label="姓名" align="left" min-width="100" />
            <el-table-column prop="id_card" label="身份证号" align="left" min-width="150" show-overflow-tooltip />
            <el-table-column prop="position" label="职位" align="left" min-width="110" show-overflow-tooltip />
            <el-table-column prop="hire_date" label="入职日期" align="left" min-width="110" />
            <el-table-column label="月基本工资" align="left" min-width="110">
              <template #default="{ row }">{{ money(row.basic_salary) }}</template>
            </el-table-column>
            <el-table-column label="目标年终奖" align="left" min-width="110">
              <template #default="{ row }">{{ money(row.target_bonus) }}</template>
            </el-table-column>
            <el-table-column label="年薪预算总包" align="left" min-width="120">
              <template #default="{ row }"><span class="result-highlight">{{ money(row.annual_package) }}</span></template>
            </el-table-column>
            <el-table-column prop="template_name" label="模板" align="left" min-width="120" />
          </el-table>
        </div>
      </template>
    </el-card>

    <el-dialog v-model="previewOpen" title="收入证明预览" width="92%" top="4vh" :close-on-click-modal="false">
      <div class="cert-layout">
        <div class="cert-form-pane">
          <div class="cert-pane-title">证明字段（可修改）</div>
          <el-form v-if="certData" label-position="top" size="small">
            <el-form-item label="模板">
              <el-select v-model="certData.template_code" style="width: 100%">
                <el-option v-for="t in templates" :key="t.code" :label="t.name" :value="t.code" />
              </el-select>
            </el-form-item>
            <div class="cert-row2">
              <el-form-item label="姓名"><el-input v-model="certData.name" /></el-form-item>
              <el-form-item label="身份证号"><el-input v-model="certData.id_card" /></el-form-item>
            </div>
            <div class="cert-row2">
              <el-form-item label="公司"><el-input v-model="certData.company" /></el-form-item>
              <el-form-item label="职位"><el-input v-model="certData.position" /></el-form-item>
            </div>
            <el-form-item label="入职日期"><el-date-picker v-model="certData.hire_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" /></el-form-item>
            <div class="cert-row2">
              <el-form-item label="月基本工资"><el-input-number v-model="certData.basic_salary" :min="0" :precision="2" :step="1000" style="width: 100%" /></el-form-item>
              <el-form-item label="目标年终奖"><el-input-number v-model="certData.target_bonus" :min="0" :precision="2" :step="1000" style="width: 100%" /></el-form-item>
            </div>
            <div class="cert-row2">
              <el-form-item label="年薪预算总包"><el-input-number v-model="certData.annual_package" :min="0" :precision="2" :step="1000" style="width: 100%" /></el-form-item>
              <el-form-item label="开具日期"><el-date-picker v-model="certData.issue_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" /></el-form-item>
            </div>
            <el-button type="primary" plain style="margin-top: 14px; width: 100%" :loading="previewing" @click="refreshPreview">更新右侧预览</el-button>
          </el-form>
        </div>

        <div class="cert-preview-pane">
          <div class="cert-pane-title">证明预览（与下载的 Word 格式一致）</div>
          <div v-loading="previewing" class="cert-preview-paper" v-html="previewHtml"></div>
        </div>
      </div>

      <template #footer>
        <el-button @click="previewOpen = false">关闭</el-button>
        <el-button :loading="downloading" @click="downloadDocx">下载 Word</el-button>
        <el-button type="primary" @click="printDirect">打印</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.income-cert {
  padding: 16px;
}
.op-bar :deep(.el-form-item) {
  margin-bottom: 8px;
}
.op-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-regular);
  margin: 12px 0 8px;
}
:deep(.is-selected-row) {
  background-color: rgba(51, 112, 255, 0.1) !important;
}
.result-highlight {
  color: var(--color-primary);
  font-size: 15px;
  font-weight: 600;
}
.cert-layout {
  display: grid;
  grid-template-columns: minmax(380px, 1fr) minmax(420px, 1.2fr);
  gap: 20px;
  min-height: 60vh;
}
.cert-form-pane {
  max-height: 78vh;
  overflow-y: auto;
  padding-right: 6px;
}
.cert-pane-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 12px;
}
.cert-row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.cert-preview-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-x: auto;
}
.cert-preview-paper {
  flex: none;
  width: 210mm;
  margin: 0 auto;
  max-height: 78vh;
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 20mm;
  box-sizing: border-box;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}
.cert-preview-paper :deep(.cert-doc) {
  font-family: SimSun, '宋体', serif;
  font-size: 14pt;
  line-height: 1.8;
  color: #000;
}
.cert-preview-paper :deep(.cert-header) {
  margin-bottom: 18px;
}
.cert-preview-paper :deep(.cert-logo) {
  width: 38mm;
  height: auto;
  display: block;
}
.cert-preview-paper :deep(.cert-title) {
  text-align: center;
  font-size: 18pt;
  font-weight: 700;
  margin: 6px 0 16px;
}
.cert-preview-paper :deep(.cert-p) {
  margin: 0 0 8px;
  text-align: justify;
  text-indent: 2em;
}
.cert-preview-paper :deep(.cert-sign) {
  margin: 18px 0 8px;
  text-align: right;
  white-space: nowrap;
}
.cert-preview-paper :deep(.cert-line) {
  margin: 4px 0;
  white-space: nowrap;
}
</style>
