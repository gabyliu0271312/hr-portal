<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, RefreshRight } from '@element-plus/icons-vue'
import { codegenApi, type CodeSuggestResult } from '@/api/codegen'

const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  scope?: string
  prefix?: string
  context?: string | null
  datasetId?: number | null
  existingCodes?: string[]
  editable?: boolean
}>(), {
  scope: 'generic',
  prefix: '',
  context: null,
  datasetId: null,
  existingCodes: () => [],
  editable: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  suggested: [value: CodeSuggestResult]
}>()

const loading = ref(false)
const lastLabel = ref('')
const suggestion = ref<CodeSuggestResult | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let requestSeq = 0

const sourceLabel = computed(() => {
  if (!suggestion.value) return '待生成'
  return suggestion.value.source === 'ai' ? 'AI 生成' : '规则生成'
})

async function generate(force = false) {
  const label = props.label.trim()
  if (!label) {
    emit('update:modelValue', '')
    suggestion.value = null
    lastLabel.value = ''
    return
  }
  if (!force && lastLabel.value === label && props.modelValue) return
  const seq = ++requestSeq
  loading.value = true
  try {
    const result = await codegenApi.suggest({
      label,
      scope: props.scope,
      prefix: props.prefix,
      context: props.context,
      dataset_id: props.datasetId,
      existing_codes: props.existingCodes,
    })
    if (seq !== requestSeq) return
    suggestion.value = result
    lastLabel.value = label
    emit('update:modelValue', result.code)
    emit('suggested', result)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '编码生成失败')
  } finally {
    loading.value = false
  }
}

function scheduleGenerate() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    generate(false)
  }, 600)
}

async function copyCode() {
  if (!props.modelValue) return
  await navigator.clipboard?.writeText(props.modelValue)
  ElMessage.success('编码已复制')
}

watch(
  () => props.label,
  () => { scheduleGenerate() },
  { immediate: true }
)
</script>

<template>
  <div class="smart-code-input">
    <el-input
      :model-value="modelValue"
      :readonly="!editable"
      placeholder="输入名称后自动生成"
      @update:model-value="(v: string) => emit('update:modelValue', v)"
    >
      <template #append>
        <el-button :loading="loading" title="重新生成编码" @click="generate(true)">
          <el-icon><RefreshRight /></el-icon>
        </el-button>
        <el-button :disabled="!modelValue" title="复制编码" @click="copyCode">
          <el-icon><CopyDocument /></el-icon>
        </el-button>
      </template>
    </el-input>
    <div class="code-hint">
      <span>{{ sourceLabel }}</span>
      <span>统一规则：英文小写、数字、下划线，自动去重</span>
    </div>
  </div>
</template>

<style scoped>
.smart-code-input {
  display: grid;
  gap: 6px;
}
.smart-code-input :deep(.el-input__inner) {
  font-family: var(--font-mono);
}
.code-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--color-text-placeholder);
  font-size: 12px;
}
.code-hint span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 560px) {
  .code-hint {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
