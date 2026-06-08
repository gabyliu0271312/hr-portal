<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { QuestionFilled, Search, Plus, Delete, Document, Printer } from '@element-plus/icons-vue'
import {
  toolsApi,
  type CompensationResult,
  type EmployeeCandidate,
  type AgreementData,
} from '@/api/tools'

const keyword = ref('')
const searching = ref(false)
const calculating = ref(false)
const employees = ref<EmployeeCandidate[]>([])
const selected = ref<EmployeeCandidate | null>(null)
const leaveDate = ref('')
const leaveDateInvalid = ref(false)
const plan = ref<'N' | 'N+1'>('N+1')
const result = ref<CompensationResult | null>(null)

// 解除协议生成
const agreementOpen = ref(false)
const agreementLoading = ref(false)
const previewing = ref(false)
const downloading = ref(false)
const agreement = ref<AgreementData | null>(null)
const previewHtml = ref('')
const originalPreviewHtml = ref('')
const previewPaperRef = ref<HTMLElement | null>(null)
const draftAdjusted = ref(false)
let editedPreviewHtml = ''

const busy = computed(() => searching.value || calculating.value)

function money(v?: number | null) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

async function searchAndCalculate() {
  if (!keyword.value.trim()) {
    ElMessage.warning('请输入工号、中文名或英文名')
    return
  }
  searching.value = true
  result.value = null
  selected.value = null
  try {
    employees.value = await toolsApi.searchCompensationEmployees({ keyword: keyword.value.trim(), limit: 30 })
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
  employees.value = [row]
  if (row.leave_date) leaveDate.value = row.leave_date
  calculate()
}

function rowClassName({ row }: { row: EmployeeCandidate }) {
  return selected.value && row.id === selected.value.id ? 'is-selected-row' : ''
}

function leaveDateDisplay(row: EmployeeCandidate) {
  if (row.leave_date) return row.leave_date
  if (selected.value && row.id === selected.value.id && leaveDate.value) return leaveDate.value
  return '—'
}

async function calculate() {
  if (!selected.value) return
  if (!leaveDate.value) {
    leaveDateInvalid.value = true
    result.value = null
    ElMessage.warning(`「${selected.value.name || '该员工'}」花名册无离职日期，请先手动选择离职日期再计算`)
    return
  }
  leaveDateInvalid.value = false
  calculating.value = true
  try {
    result.value = await toolsApi.calculateCompensation({
      employee_id: selected.value.id,
      leave_date: leaveDate.value || null,
      plan: plan.value,
      region: null,
    })
  } catch (e: any) {
    result.value = null
    ElMessage.error(`已找到「${selected.value.name || ''}」，但${e?.response?.data?.detail || '计算失败'}`)
  } finally {
    calculating.value = false
  }
}

// 离职日期 / 方案 改动后自动重算（前提是已选中员工）
watch([leaveDate, plan], () => {
  if (selected.value) calculate()
})

function resetAll() {
  keyword.value = ''
  employees.value = []
  selected.value = null
  leaveDate.value = ''
  leaveDateInvalid.value = false
  plan.value = 'N+1'
  result.value = null
  previewHtml.value = ''
  originalPreviewHtml.value = ''
  draftAdjusted.value = false
  editedPreviewHtml = ''
}

async function openAgreement() {
  if (!selected.value) return
  agreementOpen.value = true
  agreementLoading.value = true
  previewHtml.value = ''
  originalPreviewHtml.value = ''
  draftAdjusted.value = false
  editedPreviewHtml = ''
  agreement.value = null
  try {
    agreement.value = await toolsApi.prepareAgreement({
      employee_id: selected.value.id,
      leave_date: leaveDate.value || null,
      plan: plan.value,
      region: null,
    })
    await refreshPreview()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '生成协议数据失败')
    agreementOpen.value = false
  } finally {
    agreementLoading.value = false
  }
}

const installmentSum = () =>
  (agreement.value?.installments || []).reduce((s, it) => s + (Number(it.amount) || 0), 0)

function addInstallment() {
  if (!agreement.value) return
  agreement.value.installments.push({ pay_date: agreement.value.last_work_date, amount: 0 })
}
function removeInstallment(idx: number) {
  agreement.value?.installments.splice(idx, 1)
}

async function refreshPreview() {
  if (!agreement.value) return
  if (draftAdjusted.value) {
    try {
      await ElMessageBox.confirm('重新生成会覆盖当前预览中的人工修改，是否继续？', '确认重新生成', {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      return
    }
  }
  previewing.value = true
  try {
    previewHtml.value = await toolsApi.previewAgreement(agreement.value)
    originalPreviewHtml.value = previewHtml.value
    editedPreviewHtml = previewHtml.value
    draftAdjusted.value = false
    await nextTick()
    if (previewPaperRef.value) previewPaperRef.value.innerHTML = previewHtml.value
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '预览失败')
  } finally {
    previewing.value = false
  }
}

function onPreviewInput() {
  editedPreviewHtml = previewPaperRef.value?.innerHTML || ''
  draftAdjusted.value = editedPreviewHtml !== originalPreviewHtml.value
}

function resetPreviewDraft() {
  previewHtml.value = originalPreviewHtml.value
  editedPreviewHtml = originalPreviewHtml.value
  draftAdjusted.value = false
  if (previewPaperRef.value) previewPaperRef.value.innerHTML = originalPreviewHtml.value
}

function currentDraft() {
  const html = previewPaperRef.value?.innerHTML || editedPreviewHtml || previewHtml.value
  return {
    draft_html: draftAdjusted.value ? html : null,
    manually_adjusted: draftAdjusted.value,
  }
}

async function downloadDocx() {
  if (!agreement.value) return
  downloading.value = true
  try {
    const resp = await toolsApi.downloadAgreement(agreement.value, currentDraft())
    const blob = new Blob([resp.data as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `解除劳动合同协议书_${agreement.value.name || '员工'}.docx`
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
  .agr-doc { font-size: 12pt; line-height: 1.8; }
  .agr-header { text-align: right; font-size: 9pt; color: #444; margin-bottom: 8px; }
  .agr-title { text-align: center; font-size: 16pt; font-weight: 700; margin: 6px 0 16px; }
  .agr-p { margin: 0 0 8px; text-align: justify; text-indent: 2em; }
  .agr-line { margin: 0 0 8px; white-space: nowrap; }
  .agr-sign { margin-top: 18px; white-space: nowrap; }
`

async function printAgreement() {
  if (!previewHtml.value) return
  const html = previewPaperRef.value?.innerHTML || previewHtml.value
  if (agreement.value) {
    try {
      await toolsApi.logAgreementPrint(agreement.value, currentDraft())
    } catch {
      ElMessage.warning('打印留痕失败，但不影响本次打印')
    }
  }
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) {
    ElMessage.warning('浏览器拦截了打印窗口，请允许弹窗后重试')
    return
  }
  w.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>解除劳动合同协议书</title><style>${PRINT_STYLE}</style></head><body>${html}</body></html>`,
  )
  w.document.close()
  w.focus()
  setTimeout(() => {
    w.print()
  }, 300)
}

const printing = ref(false)
async function printDirect() {
  if (!selected.value) return
  printing.value = true
  try {
    const data = await toolsApi.prepareAgreement({
      employee_id: selected.value.id,
      leave_date: leaveDate.value || null,
      plan: plan.value,
      region: null,
    })
    previewHtml.value = await toolsApi.previewAgreement(data)
    originalPreviewHtml.value = previewHtml.value
    editedPreviewHtml = previewHtml.value
    draftAdjusted.value = false
    await nextTick()
    if (previewPaperRef.value) previewPaperRef.value.innerHTML = previewHtml.value
    agreement.value = data
    await printAgreement()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '生成协议失败')
  } finally {
    printing.value = false
  }
}


const resultRow = computed(() => {
  if (!result.value) return [] as ResultRow[]
  const r = result.value
  const row: ResultRow = {
    employee_no: r.employee.employee_no || '—',
    name: r.employee.name || '—',
    hire_date: r.hire_date,
    leave_date: r.leave_date,
    work_region: r.work_region,
    basic_salary: money(r.basic_salary),
    cap_amount: money(r.cap_amount),
    compensation_base: money(r.compensation_base),
    service_years_n: r.service_years_n,
    plan: r.plan,
    n_amount: money(r.n_amount),
    extra_amount: money(r.extra_amount),
    total_amount: money(r.total_amount),
  }
  return [row]
})

interface ResultRow {
  employee_no: string
  name: string
  hire_date: string
  leave_date: string
  work_region: string
  basic_salary: string
  cap_amount: string
  compensation_base: string
  service_years_n: number
  plan: string
  n_amount: string
  extra_amount: string
  total_amount: string
}
</script>

<template>
  <div class="comp-calc">
    <el-card body-style="padding: 16px">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <div style="display: flex; align-items: center; gap: 6px">
            <span style="font-size: 16px; font-weight: 600">补偿金计算</span>
            <el-tooltip
              placement="right"
              content="员工搜索结果会自动叠加当前账号的数据范围权限。若员工重名，请从候选列表中选择正确人员。"
            >
              <el-icon style="color: var(--color-text-placeholder); cursor: help"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
          <div v-if="result" style="display: flex; gap: 8px">
            <el-button type="primary" plain :loading="agreementLoading" @click="openAgreement">
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
              @keyup.enter="searchAndCalculate"
            >
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="离职日期">
            <div :class="{ 'date-invalid': leaveDateInvalid }">
              <el-date-picker
                v-model="leaveDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="离职日期"
                style="width: 150px"
              />
            </div>
          </el-form-item>
          <el-form-item label="方案">
            <el-radio-group v-model="plan">
              <el-radio-button label="N+1" />
              <el-radio-button label="N" />
            </el-radio-group>
          </el-form-item>
        </div>
        <div class="op-row">
          <el-form-item>
            <el-button type="primary" :loading="busy" @click="searchAndCalculate">
              <el-icon style="margin-right: 4px"><Search /></el-icon>查询并计算
            </el-button>
            <el-button link @click="resetAll">重置</el-button>
          </el-form-item>
        </div>
      </el-form>

      <template v-if="employees.length">
        <div class="section-title">员工信息（{{ employees.length }} 人，点击选择）</div>
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
            <el-table-column prop="leave_date" label="离职日期" align="left" min-width="110">
              <template #default="{ row }">{{ leaveDateDisplay(row) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </template>

      <template v-if="result">
        <div class="section-title">计算结果</div>
        <div style="overflow-x: auto">
          <el-table :data="resultRow" border size="small" style="width: 100%">
            <el-table-column prop="employee_no" label="工号" align="left" min-width="90" />
            <el-table-column prop="name" label="姓名" align="left" min-width="100" show-overflow-tooltip />
            <el-table-column prop="basic_salary" label="基本工资" align="left" min-width="100" />
            <el-table-column prop="compensation_base" label="补偿基数" align="left" min-width="100" />
            <el-table-column prop="service_years_n" label="年限 N" align="left" min-width="80" />
            <el-table-column prop="plan" label="方案" align="left" min-width="70" />
            <el-table-column prop="n_amount" label="N 金额" align="left" min-width="100" />
            <el-table-column prop="extra_amount" label="+1 金额" align="left" min-width="100" />
            <el-table-column prop="total_amount" label="合计" align="left" min-width="110">
              <template #default="scope">
                <span class="result-highlight">{{ (scope.row as ResultRow).total_amount }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </el-card>

    <el-dialog
      v-model="agreementOpen"
      title="生成解除劳动合同协议书"
      width="92%"
      top="4vh"
      :close-on-click-modal="false"
    >
      <div v-loading="agreementLoading" class="agr-layout">
        <!-- 左：字段表单 -->
        <div class="agr-form-pane">
          <div class="agr-pane-title">协议字段（可修改）</div>
          <el-form v-if="agreement" label-position="top" size="small">
            <el-form-item label="甲方（公司全称）">
              <el-input v-model="agreement.company" />
            </el-form-item>
            <div class="agr-row2">
              <el-form-item label="乙方（员工）">
                <el-input v-model="agreement.name" />
              </el-form-item>
              <el-form-item label="身份证号码">
                <el-input v-model="agreement.id_card" />
              </el-form-item>
            </div>
            <div class="agr-row2">
              <el-form-item label="解除劳动关系日期">
                <el-date-picker v-model="agreement.dissolve_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
              <el-form-item label="最后工作日">
                <el-date-picker v-model="agreement.last_work_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </div>
            <div class="agr-row2">
              <el-form-item label="社保最后月份">
                <el-input v-model="agreement.social_security_month" placeholder="如 2024年1月" />
              </el-form-item>
              <el-form-item label="工资计算截止日">
                <el-date-picker v-model="agreement.salary_until" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
              </el-form-item>
            </div>
            <div class="agr-row2">
              <el-form-item label="补偿基数">
                <el-input-number v-model="agreement.base_amount" :min="0" :precision="2" :step="1000" style="width: 100%" />
              </el-form-item>
              <el-form-item label="补偿总额">
                <el-input-number v-model="agreement.total_amount" :min="0" :precision="2" :step="1000" style="width: 100%" />
              </el-form-item>
            </div>

            <div class="agr-pane-title" style="margin-top: 6px; display: flex; justify-content: space-between; align-items: center">
              <span>分期付款明细</span>
              <el-button size="small" @click="addInstallment"><el-icon><Plus /></el-icon>加一期</el-button>
            </div>
            <el-table :data="agreement.installments" size="small" border>
              <el-table-column label="期" width="50" align="left">
                <template #default="{ $index }">{{ $index + 1 }}</template>
              </el-table-column>
              <el-table-column label="付款日期" min-width="150" align="left">
                <template #default="{ row }">
                  <el-date-picker v-model="row.pay_date" type="date" value-format="YYYY-MM-DD" size="small" style="width: 100%" />
                </template>
              </el-table-column>
              <el-table-column label="金额" min-width="130" align="left">
                <template #default="{ row }">
                  <el-input-number v-model="row.amount" :min="0" :precision="2" :step="1000" size="small" style="width: 100%" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="70" align="left">
                <template #default="{ $index }">
                  <el-button size="small" type="danger" link @click="removeInstallment($index)"><el-icon><Delete /></el-icon></el-button>
                </template>
              </el-table-column>
            </el-table>
            <div
              style="margin-top: 8px; font-size: 12px"
              :style="{ color: Math.abs(installmentSum() - agreement.total_amount) > 0.01 ? 'var(--el-color-danger)' : 'var(--color-text-placeholder)' }"
            >
              分期合计：{{ installmentSum().toFixed(2) }} / 补偿总额：{{ agreement.total_amount.toFixed(2) }}
            </div>

            <el-button type="primary" plain style="margin-top: 14px; width: 100%" :loading="previewing" @click="refreshPreview">
              更新右侧预览
            </el-button>
          </el-form>
        </div>

        <!-- 右：预览 -->
        <div class="agr-preview-pane">
          <div class="agr-preview-head">
            <div>
              <div class="agr-pane-title">协议预览</div>
              <div class="draft-tip">当前内容可直接编辑，修改仅影响本次文档，不会修改后台模板。</div>
            </div>
            <div class="draft-actions">
              <el-tag :type="draftAdjusted ? 'warning' : 'success'" size="small">
                {{ draftAdjusted ? '已人工调整' : '标准生成' }}
              </el-tag>
              <el-button size="small" :disabled="!draftAdjusted" @click="resetPreviewDraft">恢复原始预览</el-button>
            </div>
          </div>
          <div
            ref="previewPaperRef"
            v-loading="previewing"
            class="agr-preview-paper"
            contenteditable="true"
            spellcheck="false"
            v-html="previewHtml"
            @input="onPreviewInput"
          ></div>
        </div>
      </div>

      <template #footer>
        <el-button @click="agreementOpen = false">关闭</el-button>
        <el-button :loading="downloading" @click="downloadDocx">下载 Word</el-button>
        <el-button type="primary" @click="printAgreement">打印</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.comp-calc {
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
.date-invalid :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset !important;
}
.date-invalid :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset !important;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-regular);
  margin: 12px 0 8px;
}
:deep(.is-selected-row) {
  background-color: var(--color-primary-light) !important;
}
.result-highlight {
  color: var(--color-primary);
  font-size: 15px;
  font-weight: 600;
}
.agr-layout {
  display: grid;
  grid-template-columns: minmax(380px, 1fr) minmax(420px, 1.2fr);
  gap: 20px;
  min-height: 60vh;
}
.agr-form-pane {
  max-height: 78vh;
  overflow-y: auto;
  padding-right: 6px;
}
.agr-pane-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 12px;
}
.agr-row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.agr-preview-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-x: auto;
}
.agr-preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.draft-tip {
  color: var(--color-text-placeholder);
  font-size: 12px;
  line-height: 1.5;
}
.draft-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.agr-preview-paper {
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
  outline: none;
}
.agr-preview-paper:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light), 0 2px 12px rgba(0, 0, 0, 0.06);
}
.agr-preview-paper :deep(.agr-doc) {
  font-family: SimSun, '宋体', serif;
  font-size: 12pt;
  line-height: 1.9;
  color: #000;
}
.agr-preview-paper :deep(.agr-header) {
  text-align: right;
  font-size: 9pt;
  color: #666;
  margin-bottom: 8px;
}
.agr-preview-paper :deep(.agr-title) {
  text-align: center;
  font-size: 16pt;
  font-weight: 700;
  margin: 8px 0 18px;
}
.agr-preview-paper :deep(.agr-p) {
  margin: 0 0 10px;
  text-align: justify;
  text-indent: 2em;
}
.agr-preview-paper :deep(.agr-line) {
  margin: 0 0 10px;
  white-space: nowrap;
}
.agr-preview-paper :deep(.agr-sign) {
  margin-top: 20px;
  white-space: nowrap;
}
.agr-preview-paper :deep(.agr-sign) {
  margin-top: 20px;
}
</style>
