<template>
  <el-dialog v-model="visible" title="导入 UCP 配置" width="720px" destroy-on-close @open="onOpen">
    <el-form :model="form" label-width="100px" size="default">
      <el-form-item label="导入范围">
        <el-radio-group v-model="form.target_type">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="connector">仅连接器</el-radio-button>
          <el-radio-button value="pipeline">仅流水线</el-radio-button>
          <el-radio-button value="credential">仅凭证</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="导入策略">
        <el-checkbox v-model="form.dry_run">仅校验（dry-run）</el-checkbox>
        <el-checkbox v-model="form.skip_existing">跳过已存在（推荐）</el-checkbox>
      </el-form-item>
      <el-form-item label="JSON 内容" required>
        <el-input
          v-model="jsonText"
          type="textarea"
          :rows="14"
          placeholder='粘贴导出的 JSON/YAML 内容，或留空从下方选择文件'
        />
      </el-form-item>
      <el-form-item>
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          accept=".json,.yaml,.yml"
          :on-change="onFileChange"
        >
          <el-button>选择 .json / .yaml 文件</el-button>
        </el-upload>
        <el-button v-if="jsonText" link type="primary" @click="formatJson">格式化 JSON</el-button>
        <el-button v-if="jsonText" link type="danger" @click="jsonText = ''">清空</el-button>
      </el-form-item>
    </el-form>

    <div v-if="result" class="result-box mt-3">
      <el-alert
        :type="result.dry_run ? 'info' : (hasErrors ? 'warning' : 'success')"
        :closable="false"
        show-icon
      >
        <template #title>
          {{ result.dry_run ? '校验结果（未实际导入）' : (hasErrors ? '部分导入成功' : '导入成功') }}
        </template>
      </el-alert>
      <el-row :gutter="12" class="mt-2">
        <el-col :span="8">
          <el-statistic :value="result.credentials.created" :title="'凭证 新增'" />
        </el-col>
        <el-col :span="8">
          <el-statistic :value="result.connectors.created" :title="'连接器 新增'" />
        </el-col>
        <el-col :span="8">
          <el-statistic :value="result.pipelines.created" :title="'流水线 新增'" />
        </el-col>
      </el-row>
      <el-row :gutter="12" class="mt-2">
        <el-col :span="8">
          <el-statistic :value="result.credentials.skipped" :title="'凭证 跳过'" />
        </el-col>
        <el-col :span="8">
          <el-statistic :value="result.connectors.skipped" :title="'连接器 跳过'" />
        </el-col>
        <el-col :span="8">
          <el-statistic :value="result.pipelines.skipped" :title="'流水线 跳过'" />
        </el-col>
      </el-row>
      <el-collapse v-if="hasErrors" class="mt-3">
        <el-collapse-item title="错误明细" name="errors">
          <pre>{{ JSON.stringify(allErrors, null, 2) }}</pre>
        </el-collapse-item>
      </el-collapse>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button @click="doImport" :loading="importing" type="primary">
        {{ form.dry_run ? '校验' : '导入' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, type UploadFile } from 'element-plus'
import { ucpApi } from '@/api/ucp'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'imported'): void }>()

const visible = ref(props.modelValue)
watch(() => props.modelValue, (v) => visible.value = v)
watch(visible, (v) => emit('update:modelValue', v))

const form = ref({
  target_type: 'all',
  dry_run: true,
  skip_existing: true,
})

const jsonText = ref('')
const result = ref<any>(null)
const importing = ref(false)

const allErrors = computed(() => {
  if (!result.value) return []
  return [
    ...result.value.credentials.errors.map((e: any) => ({ type: 'credential', ...e })),
    ...result.value.connectors.errors.map((e: any) => ({ type: 'connector', ...e })),
    ...result.value.pipelines.errors.map((e: any) => ({ type: 'pipeline', ...e })),
  ]
})

const hasErrors = computed(() => allErrors.value.length > 0)

function onOpen() {
  jsonText.value = ''
  result.value = null
}

function onFileChange(file: UploadFile) {
  const reader = new FileReader()
  reader.onload = (e) => {
    jsonText.value = String(e.target?.result || '')
    ElMessage.success(`已加载 ${file.name}（${jsonText.value.length} 字符）`)
  }
  if (file.raw) reader.readAsText(file.raw)
}

function formatJson() {
  try {
    const obj = JSON.parse(jsonText.value)
    jsonText.value = JSON.stringify(obj, null, 2)
    ElMessage.success('JSON 已格式化')
  } catch {
    ElMessage.error('当前内容不是有效 JSON（YAML 也可粘贴，后端会自动转换）')
  }
}

async function doImport() {
  if (!jsonText.value.trim()) {
    ElMessage.warning('请粘贴或上传配置内容')
    return
  }
  let content: any
  try {
    content = JSON.parse(jsonText.value)
  } catch {
    ElMessage.error('JSON 解析失败，请检查格式')
    return
  }
  importing.value = true
  try {
    result.value = await ucpApi.configImport({
      content,
      target_type: form.value.target_type,
      dry_run: form.value.dry_run,
      skip_existing: form.value.skip_existing,
    })
    if (!form.value.dry_run && !hasErrors.value) {
      emit('imported')
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '导入失败')
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.result-box { background: #fafafa; padding: 12px; border-radius: 4px; }
.mt-2 { margin-top: 8px; }
.mt-3 { margin-top: 12px; }
pre { font-size: 12px; }
</style>
