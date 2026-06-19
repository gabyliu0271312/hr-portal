<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import DocumentPaperPreview from '@/components/document/DocumentPaperPreview.vue'
import { toolsApi, type AgreementData, type EditableDraft } from '@/api/tools'
import type { AiAction } from '@/api/ai'
import { printPdfBlob } from '@/utils/printPdf'

const open = ref(false)
const loading = ref(false)
const printing = ref(false)
const title = ref('文档预览')
const previewHtml = ref('')
const originalPreviewHtml = ref('')
const draftAdjusted = ref(false)
const previewRef = ref<InstanceType<typeof DocumentPaperPreview> | null>(null)
const agreement = ref<AgreementData | null>(null)

function toNumber(value: unknown) {
  const n = Number(value || 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function currentDraft(): EditableDraft {
  const html = previewRef.value?.getHtml() || previewHtml.value
  return {
    draft_html: draftAdjusted.value ? html : null,
    manually_adjusted: draftAdjusted.value,
  }
}

async function prepareAgreement(action: AiAction) {
  const query = action.query || {}
  const employeeId = toNumber(query.employee_id)
  if (!employeeId) {
    throw new Error('缺少员工信息，无法生成协议')
  }
  agreement.value = await toolsApi.prepareAgreement({
    employee_id: employeeId,
    leave_date: typeof query.leave_date === 'string' ? query.leave_date : null,
    plan: query.plan === 'N' ? 'N' : 'N+1',
    region: typeof query.region === 'string' ? query.region : null,
    template_code: typeof query.template_code === 'string' ? query.template_code : undefined,
  })
  previewHtml.value = await toolsApi.previewAgreement(agreement.value)
  originalPreviewHtml.value = previewHtml.value
  draftAdjusted.value = false
  title.value = `${action.type === 'document_print' ? '打印' : '预览'}解除协议`
  await nextTick()
  previewRef.value?.setHtml(previewHtml.value)
}

async function printAgreement() {
  if (!agreement.value) return
  printing.value = true
  try {
    const resp = await toolsApi.downloadAgreementPdf(agreement.value, currentDraft())
    printPdfBlob(new Blob([resp.data as BlobPart], { type: 'application/pdf' }))
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '打印失败')
  } finally {
    printing.value = false
  }
}

async function execute(action: AiAction) {
  loading.value = true
  open.value = true
  agreement.value = null
  previewHtml.value = ''
  originalPreviewHtml.value = ''
  draftAdjusted.value = false
  try {
    const businessType = action.query?.business_type
    if (businessType !== 'agreement') {
      throw new Error('当前暂不支持该文档类型')
    }
    await prepareAgreement(action)
    if (action.type === 'document_print') {
      await printAgreement()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '文档生成失败')
    open.value = false
  } finally {
    loading.value = false
  }
}

function resetDraft() {
  previewHtml.value = originalPreviewHtml.value
  previewRef.value?.setHtml(originalPreviewHtml.value)
  draftAdjusted.value = false
}

defineExpose({ execute })
</script>

<template>
  <el-dialog
    v-model="open"
    :title="title"
    width="76%"
    top="4vh"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="doc-action-preview">
      <div class="preview-head">
        <div>
          <div class="preview-title">文档预览</div>
          <div class="preview-tip">当前内容可直接编辑，修改仅影响本次文档。</div>
        </div>
        <div class="preview-actions">
          <el-tag :type="draftAdjusted ? 'warning' : 'success'" size="small">
            {{ draftAdjusted ? '已人工调整' : '标准生成' }}
          </el-tag>
          <el-button size="small" :disabled="!draftAdjusted" @click="resetDraft">恢复原始预览</el-button>
        </div>
      </div>
      <DocumentPaperPreview ref="previewRef" :loading="loading" @dirty="draftAdjusted = $event" />
    </div>

    <template #footer>
      <el-button @click="open = false">关闭</el-button>
      <el-button
        type="primary"
        :loading="printing"
        :disabled="!agreement"
        @click="printAgreement"
      >
        打印
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.doc-action-preview {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.preview-title {
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 600;
}
.preview-tip {
  color: var(--color-text-placeholder);
  font-size: 12px;
  line-height: 1.5;
}
.preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
</style>
