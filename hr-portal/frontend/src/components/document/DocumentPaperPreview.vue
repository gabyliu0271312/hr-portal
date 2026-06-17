<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  loading?: boolean
  editable?: boolean
}>()

const emit = defineEmits<{
  (e: 'dirty', value: boolean): void
}>()

const paperRef = ref<HTMLElement | null>(null)
const original = ref('')

function setHtml(html: string) {
  if (paperRef.value) paperRef.value.innerHTML = html
  original.value = html
  emit('dirty', false)
}

function getHtml(): string {
  return paperRef.value?.innerHTML ?? ''
}

function onInput() {
  emit('dirty', (paperRef.value?.innerHTML ?? '') !== original.value)
}

defineExpose({ setHtml, getHtml })
</script>

<template>
  <div
    ref="paperRef"
    v-loading="loading"
    class="doc-paper"
    :contenteditable="editable !== false"
    spellcheck="false"
    @input="onInput"
  ></div>
</template>

<style scoped>
/* A4 纸张容器，与后端 docx 输出参数对齐 */
.doc-paper {
  flex: none;
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  max-height: 78vh;
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 25.4mm 31.75mm;
  box-sizing: border-box;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  outline: none;
}
.doc-paper:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light), 0 2px 12px rgba(0, 0, 0, 0.06);
}

/* 协议排版（agr-*）—— 与 agreement_svc.render_html 对齐 */
.doc-paper :deep(.agr-doc) {
  font-family: SimSun, '宋体', serif;
  font-size: 12pt;
  line-height: 1.45;
  color: #000;
}
.doc-paper :deep(.agr-header) {
  text-align: right;
  font-size: 9pt;
  color: #000;
  margin-bottom: 8mm;
}
.doc-paper :deep(.agr-title) {
  text-align: center;
  font-size: 16pt;
  font-weight: 700;
  margin: 0 0 8mm;
}
.doc-paper :deep(.agr-head) {
  margin: 0 0 3mm;
  white-space: nowrap;
}
.doc-paper :deep(.agr-p) {
  margin: 0 0 3.5mm;
  text-align: justify;
  text-indent: 2em;
}
.doc-paper :deep(.agr-line) {
  margin: 0 0 3.5mm;
  white-space: nowrap;
}
.doc-paper :deep(.agr-sign) {
  margin-top: 9mm;
  white-space: nowrap;
}

/* 收入证明排版（cert-*）—— 与 income_certificate.render_html 对齐 */
.doc-paper :deep(.cert-doc) {
  font-family: SimSun, '宋体', serif;
  font-size: 14pt;
  line-height: 1.8;
  color: #000;
}
.doc-paper :deep(.cert-header) {
  margin-bottom: 18px;
}
.doc-paper :deep(.cert-logo) {
  width: 38mm;
  height: auto;
  display: block;
}
.doc-paper :deep(.cert-title) {
  text-align: center;
  font-size: 18pt;
  font-weight: 700;
  margin: 6px 0 16px;
}
.doc-paper :deep(.cert-p) {
  margin: 0 0 8px;
  text-align: justify;
  text-indent: 2em;
}
.doc-paper :deep(.cert-sign) {
  margin: 18px 0 8px;
  text-align: right;
  white-space: nowrap;
}
.doc-paper :deep(.cert-line) {
  margin: 4px 0;
  white-space: nowrap;
}
</style>
