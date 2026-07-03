<template>
  <el-dialog v-model="visible" title="导出 UCP 配置" width="640px" destroy-on-close @open="onOpen">
    <el-form :model="form" label-width="100px" size="default">
      <el-form-item label="导出范围">
        <el-radio-group v-model="form.target_type">
          <el-radio-button value="all">全部（凭证+连接器+流水线）</el-radio-button>
          <el-radio-button value="connector">仅连接器</el-radio-button>
          <el-radio-button value="pipeline">仅流水线</el-radio-button>
          <el-radio-button value="credential">仅凭证</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="文件格式">
        <el-radio-group v-model="form.format">
          <el-radio-button value="json">JSON</el-radio-button>
          <el-radio-button value="yaml">YAML</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-alert type="warning" :closable="false" show-icon style="margin-top: 8px">
        <template #title>凭证密钥不会导出（出于安全考虑）</template>
        导入后请单独到「凭证管理」补充密钥
      </el-alert>
    </el-form>

    <div v-if="preview" class="preview-box mt-3">
      <div class="preview-header">
        <span>导出预览（{{ preview.length }} 字符 / {{ form.format }}）</span>
        <el-button link size="small" @click="copyToClipboard">复制</el-button>
      </div>
      <pre class="preview-content">{{ preview }}</pre>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button @click="doExport" :loading="exporting" type="primary">下载文件</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ucpApi } from '@/api/ucp'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const visible = ref(props.modelValue)
watch(() => props.modelValue, (v) => visible.value = v)
watch(visible, (v) => emit('update:modelValue', v))

const form = ref({
  target_type: 'all',
  format: 'json',
})
const preview = ref<string>('')
const exporting = ref(false)

function onOpen() {
  preview.value = ''
  doPreview()
}

async function doPreview() {
  exporting.value = true
  try {
    const res = await ucpApi.configExport({ target_type: form.value.target_type, format: form.value.format as 'json' | 'yaml' })
    if (res.format === 'yaml' && typeof res.content === 'string') {
      preview.value = res.content
    } else {
      preview.value = JSON.stringify(res.content, null, 2)
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '预览失败')
  } finally {
    exporting.value = false
  }
}

async function doExport() {
  exporting.value = true
  try {
    const res = await ucpApi.configExport({ target_type: form.value.target_type, format: form.value.format as 'json' | 'yaml' })
    const content = res.format === 'yaml' && typeof res.content === 'string'
      ? res.content
      : JSON.stringify(res.content, null, 2)
    const blob = new Blob([content], { type: res.format === 'yaml' ? 'text/yaml' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    a.download = `ucp-config-${form.value.target_type}-${ts}.${res.format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    ElMessage.success('已下载')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '导出失败')
  } finally {
    exporting.value = false
  }
}

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(preview.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

watch(() => [form.value.target_type, form.value.format], () => {
  if (visible.value) doPreview()
})
</script>

<style scoped>
.preview-box {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafafa;
}
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #ebeef5;
  font-size: 13px;
  color: #606266;
}
.preview-content {
  margin: 0;
  padding: 12px;
  max-height: 360px;
  overflow: auto;
  font-size: 12px;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
