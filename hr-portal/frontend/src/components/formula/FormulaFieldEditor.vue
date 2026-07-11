<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, Plus, Search, Position, Delete } from '@element-plus/icons-vue'
import SmartCodeInput from '@/components/common/SmartCodeInput.vue'
import type { ColumnInfo } from '@/api/data'
import { aiFormulaApi, type FormulaValidation } from '@/api/aiFormula'
import { datasetsApi, type DatasetCalculatedField } from '@/api/datasets'
import { functionLibraryApi, type FormulaFunction } from '@/api/functionLibrary'
import { useUserStore } from '@/stores/user'

const props = defineProps<{
  visible: boolean
  datasetId: number | null
  fields: ColumnInfo[]
  sourceGroups?: { key: string; label: string }[]
  editField?: DatasetCalculatedField | null
  /** 内联模式：不弹 dialog，不显示字段配置面板，嵌入父表单使用 */
  inline?: boolean
  /** 内联模式下公式初始值 */
  initialFormula?: string
  /** 标题（默认 "新建计算字段" / "编辑计算字段"） */
  title?: string
  /** 副标题 */
  subtitle?: string
  /** 是否隐藏默认的字段配置面板（右栏），用 #config 插槽替换 */
  hideDefaultConfig?: boolean
  /** 是否隐藏默认的保存/取消按钮，用 #actions 插槽替换 */
  hideDefaultActions?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [field: DatasetCalculatedField]
  /** 内联模式下公式文本变化时实时通知父组件 */
  'formula-change': [formula: string]
}>()

const form = reactive({
  label: '',
  code: '',
  description: '',
  formula: '',
  formula_display: '',
  data_type: 'number',
  is_sensitive: false,
})

const generating = ref(false)
const validating = ref(false)
const saving = ref(false)
const deleting = ref(false)
const userStore = useUserStore()
const canDeleteField = computed(() => userStore.hasOp('datasource.datasets', 'D'))
const validation = ref<FormulaValidation | null>(null)
const functions = ref<FormulaFunction[]>([])
const fieldKeyword = ref('')
const formulaInputRef = ref<any>(null)
const formulaCursor = ref<number | null>(null)
const chatInput = ref('')
const chatScrollRef = ref<HTMLElement | null>(null)
const dirty = ref(false)
const activePickerTab = ref('fields')

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  formula?: string | null
}

interface DraftApplyResult {
  valid: boolean
  validationErrors?: string[]
}

let chatId = 0
const chatMessages = ref<ChatMessage[]>([])

const formulaOperators = [
  { label: '=', text: '=' },
  { label: '<>', text: '<>' },
  { label: '<', text: '<' },
  { label: '>', text: '>' },
  { label: '<=', text: '<=' },
  { label: '>=', text: '>=' },
  { label: '+', text: '+' },
  { label: '-', text: '-' },
  { label: '*', text: '*' },
  { label: '/', text: '/' },
  { label: '(', text: '(' },
  { label: ')', text: ')' },
  { label: '""', text: '""', cursorOffset: 1 },
  { label: ',', text: ',' },
]

const formulaConstants = [
  { label: '空文本', code: '""', text: '""', hint: '文本为空', category: '文本常量' },
  { label: '是', code: 'TRUE', text: 'TRUE', hint: '布尔真', category: '布尔常量' },
  { label: '否', code: 'FALSE', text: 'FALSE', hint: '布尔假', category: '布尔常量' },
  { label: '零', code: '0', text: '0', hint: '数值 0', category: '数值常量' },
  { label: '一', code: '1', text: '1', hint: '数值 1', category: '数值常量' },
  { label: '今天', code: 'TODAY()', text: 'TODAY()', hint: '当前日期', category: '日期常量' },
]
const activeResourceGroup = ref('')

const open = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})

const filteredFields = computed(() => {
  const kw = fieldKeyword.value.trim().toLowerCase()
  if (!kw) return props.fields
  return props.fields.filter((field) =>
    `${field.label} ${field.code}`.toLowerCase().includes(kw)
  )
})

const baseFunctions = computed(() =>
  functions.value.filter(
    (item) =>
      (item.source === 'base_excel' || item.function_type === 'base_excel') &&
      item.is_executable !== false
  )
)

const managedFunctions = computed(() =>
  functions.value.filter((item) => item.source !== 'base_excel' && item.function_type !== 'base_excel')
)

const existingCalculatedCodes = computed(() =>
  props.fields
    .filter((field) => field.code.startsWith('calc.'))
    .map((field) => field.code.slice('calc.'.length))
)

function keywordMatch(...parts: (string | null | undefined)[]) {
  const kw = fieldKeyword.value.trim().toLowerCase()
  if (!kw) return true
  return parts.join(' ').toLowerCase().includes(kw)
}

const filteredBaseFunctions = computed(() =>
  baseFunctions.value.filter((fn) => keywordMatch(fn.code, fn.name, fn.description))
)

const filteredManagedFunctions = computed(() =>
  managedFunctions.value.filter((fn) => keywordMatch(fn.code, fn.name, fn.description))
)

const filteredFormulaConstants = computed(() =>
  formulaConstants.filter((item) => keywordMatch(item.label, item.code, item.hint))
)

interface ResourceGroup<T> {
  key: string
  label: string
  items: T[]
}

function fieldSourceKey(code: string) {
  if (code.startsWith('calc.')) return 'calc'
  return code.includes('.') ? code.slice(0, code.indexOf('.')) : 'current'
}

function fieldSourceLabel(code: string) {
  const key = fieldSourceKey(code)
  if (key === 'calc') return '计算字段'
  if (key === 'current') return '当前数据表'
  return props.sourceGroups?.find((item) => item.key === key)?.label || key
}

function stripKnownPrefix(value: string, prefixes: (string | null | undefined)[]) {
  for (const prefix of prefixes.filter(Boolean) as string[]) {
    if (value.startsWith(`${prefix}.`)) return value.slice(prefix.length + 1)
  }
  return value
}

function cleanFieldCode(field: ColumnInfo) {
  const key = fieldSourceKey(field.code)
  return stripKnownPrefix(field.code, [key])
}

function cleanFieldLabel(field: ColumnInfo) {
  const key = fieldSourceKey(field.code)
  const sourceLabel = props.sourceGroups?.find((item) => item.key === key)?.label || ''
  const stripped = stripKnownPrefix(field.label, [key, sourceLabel])
  const dot = stripped.lastIndexOf('.')
  return dot >= 0 ? stripped.slice(dot + 1) : stripped
}

function groupedBy<T>(items: T[], keyOf: (item: T) => string, labelOf: (item: T) => string) {
  const groups = new Map<string, ResourceGroup<T>>()
  for (const item of items) {
    const key = keyOf(item)
    if (!groups.has(key)) groups.set(key, { key, label: labelOf(item), items: [] })
    groups.get(key)!.items.push(item)
  }
  return [...groups.values()]
}

const fieldGroups = computed(() =>
  groupedBy(filteredFields.value, (field) => fieldSourceKey(field.code), (field) => fieldSourceLabel(field.code))
)

function functionGroupKey(fn: FormulaFunction) {
  if (fn.source !== 'base_excel' && fn.function_type !== 'base_excel') return 'managed'
  return fn.category || fn.category_label || 'other'
}

function functionGroupLabel(fn: FormulaFunction) {
  if (fn.source !== 'base_excel' && fn.function_type !== 'base_excel') return '业务/自定义函数'
  return fn.category_label || fn.category || '其他函数'
}

const functionGroups = computed(() =>
  groupedBy(
    [...filteredBaseFunctions.value, ...filteredManagedFunctions.value],
    functionGroupKey,
    functionGroupLabel,
  )
)

const constantGroups = computed(() =>
  groupedBy(filteredFormulaConstants.value, (item) => item.category, (item) => item.category)
)

const resourceGroups = computed(() => {
  if (activePickerTab.value === 'functions') return functionGroups.value
  if (activePickerTab.value === 'constants') return constantGroups.value
  return fieldGroups.value
})

const activeResourceItems = computed(() => {
  const groups = resourceGroups.value
  return groups.find((group) => group.key === activeResourceGroup.value)?.items || groups[0]?.items || []
})

function selectedGroupItems<T>(groups: ResourceGroup<T>[]) {
  return groups.find((group) => group.key === activeResourceGroup.value)?.items || groups[0]?.items || []
}

const activeFieldItems = computed(() => selectedGroupItems(fieldGroups.value))
const activeFunctionItems = computed(() => selectedGroupItems(functionGroups.value))
const activeConstantItems = computed(() => selectedGroupItems(constantGroups.value))

watch(
  resourceGroups,
  (groups) => {
    if (!groups.some((group) => group.key === activeResourceGroup.value)) {
      activeResourceGroup.value = groups[0]?.key || ''
    }
  },
  { immediate: true }
)

function reset() {
  Object.assign(form, {
    label: '',
    code: '',
    description: '',
    formula: '',
    formula_display: '',
    data_type: 'number',
    is_sensitive: false,
  })
  validation.value = null
  fieldKeyword.value = ''
  chatInput.value = ''
  chatMessages.value = []
  activePickerTab.value = 'fields'
  dirty.value = false
}

async function loadFunctions() {
  try {
    functions.value = await functionLibraryApi.list(true)
  } catch {
    functions.value = []
  }
}

watch(
  () => props.visible,
  (value) => {
    if (value) {
      reset()
      if (props.editField) {
        const f = props.editField
        Object.assign(form, {
          label: f.label,
          code: f.code,
          description: f.description || '',
          formula: normalizeDisplayFormula(internalFormulaToDisplay(f.formula)),
          formula_display: '',
          data_type: f.data_type,
          is_sensitive: f.is_sensitive,
        })
      }
      loadFunctions()
    }
  },
  { immediate: true },
)

// 初始化公式值（inline 和 dialog 模式均适用）
watch(
  () => props.initialFormula,
  (val) => {
    if (val !== undefined && val !== null) {
      form.formula = normalizeDisplayFormula(internalFormulaToDisplay(val))
    }
  },
  { immediate: true },
)

// 实时通知父组件公式变化（inline 和 dialog 模式均适用）
watch(
  () => form.formula,
  (val) => {
    emit('formula-change', val)
  },
)

function markDirty() {
  dirty.value = true
}

async function requestClose(done?: () => void) {
  if (!dirty.value && !form.label && !form.formula && !chatMessages.value.length) {
    if (done) done()
    else open.value = false
    return
  }
  try {
    await ElMessageBox.confirm('当前字段尚未保存，确认关闭？', '提示', {
      type: 'warning',
      confirmButtonText: '关闭',
      cancelButtonText: '继续编辑',
    })
    dirty.value = false
    if (done) done()
    else open.value = false
  } catch {
    // keep editing
  }
}

function scrollChatToBottom() {
  nextTick(() => {
    const el = chatScrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function formulaTextarea(): HTMLTextAreaElement | null {
  return formulaInputRef.value?.textarea || formulaInputRef.value?.$el?.querySelector?.('textarea') || null
}

function rememberFormulaCursor() {
  const el = formulaTextarea()
  if (!el) return
  formulaCursor.value = el.selectionStart ?? form.formula.length
}

function focusFormulaAt(position: number) {
  formulaCursor.value = position
  nextTick(() => {
    const el = formulaTextarea()
    if (!el) return
    el.focus()
    el.setSelectionRange(position, position)
  })
}

function insertionRange(current: string) {
  const el = formulaTextarea()
  const fallback = formulaCursor.value ?? current.length
  const start = el?.selectionStart ?? fallback
  const end = el?.selectionEnd ?? start
  return {
    start: Math.max(0, Math.min(start, current.length)),
    end: Math.max(0, Math.min(end, current.length)),
  }
}

function shouldPrefixSpace(current: string, start: number, text: string) {
  const prev = current[start - 1] || ''
  if (!prev || prev === '=' || prev === '(' || prev === ',' || /\s/.test(prev)) return false
  if ('+-*/<>'.includes(prev) || text.startsWith(')') || text.startsWith(',')) return false
  return true
}

function aliasFieldRef(field: ColumnInfo): string {
  const alias = field.code.includes('.') ? field.code.slice(0, field.code.indexOf('.')) : ''
  const name = cleanFieldLabel(field)
  return alias ? `${alias}.${name}` : name
}

function displayFieldRef(field: ColumnInfo) {
  return aliasFieldRef(field)
}

function fieldCodeToLabel(code: string) {
  return props.fields.find((field) => field.code === code)?.label || code
}

function internalFormulaToDisplay(formula: string) {
  return (formula || '').replace(/FIELD\(\s*["']([^"']+)["']\s*\)/gi, (_match, code: string) => {
    const field = props.fields.find((f) => f.code === code)
    return field ? aliasFieldRef(field) : code
  })
}

function normalizeDisplayFormula(formula: string) {
  const trimmed = (formula || '').trimStart()
  if (!trimmed) return ''
  return `=${trimmed.replace(/^=+/, '')}`
}

function insertText(text: string, cursorOffset = text.length) {
  const current = form.formula || ''
  const { start, end } = insertionRange(current)
  if (text === '=' && current.slice(start, end || start + 1) === '=') {
    focusFormulaAt(start + 1)
    return
  }
  const prefix = shouldPrefixSpace(current, start, text) ? ' ' : ''
  const inserted = `${prefix}${text}`
  form.formula = `${current.slice(0, start)}${inserted}${current.slice(end)}`
  validation.value = null
  markDirty()
  focusFormulaAt(start + prefix.length + cursorOffset)
}

function insertField(field: ColumnInfo) {
  insertText(displayFieldRef(field))
}

function insertFunction(fn: FormulaFunction) {
  const snippet = `${fn.code}()`
  insertText(snippet, fn.code.length + 1)
}

function insertOperator(item: { text: string; cursorOffset?: number }) {
  insertText(item.text, item.cursorOffset ?? item.text.length)
}

function insertConstant(item: { text: string }) {
  insertText(item.text)
}

function chatHistoryPayload() {
  return chatMessages.value.slice(-8).map((item) => ({
    role: item.role,
    content: item.content,
    formula: item.formula || null,
  }))
}

function errorMessage(e: any, fallback: string) {
  if (e?.code === 'ECONNABORTED') return '模型生成超时，请稍后重试或调大 AI 配置超时时间'
  return e?.response?.data?.detail || e?.message || fallback
}

function normalizeAiFailureMessage(e: any) {
  const raw = errorMessage(e, '')
  if (e?.code === 'ECONNABORTED') {
    return '这次模型响应超时了，没有生成可用公式。可以缩短需求描述后重试，或在 AI 基础配置里调大超时时间。'
  }
  if (/Request failed with status code/i.test(raw)) {
    return '这次模型接口没有返回可用结果，我没有更新公式。请稍后重试，或检查 AI 基础配置里的模型和接口地址。'
  }
  if (/json|合法 JSON|JSON/i.test(raw)) {
    return '模型返回的内容格式不符合公式助手要求，我没有更新公式。请继续用一句话补充需求，我会重新生成结构化公式。'
  }
  if (/模型接口|Base URL|api key|unauthorized|forbidden|401|403/i.test(raw)) {
    return '模型接口调用失败，我没有更新公式。请检查 AI 基础配置里的 Base URL、API Key 和模型名称是否匹配。'
  }
  return raw || '这次没有生成可用公式，请换一种更明确的说法后重试。'
}

function compactFormulaIssues(issues?: string[]) {
  const list = (issues || []).filter(Boolean)
  if (!list.length) return ''
  return list.slice(0, 2).join('；') + (list.length > 2 ? '。其余问题可在右侧校验结果查看。' : '')
}

function draftValidationErrors(draft: any) {
  return Array.isArray(draft?.validation_errors) ? draft.validation_errors.filter(Boolean) : []
}

function buildAssistantReply(draft: any, applyResult: DraftApplyResult) {
  const summary = draft.change_summary || draft.explanation || '已更新公式草稿。'
  if (draft.should_update_formula === false || draft.intent === 'formula_question') {
    const lines = [
      draft.explanation || draft.change_summary || '已回答你的问题。',
      draft.standard_excel_formula ? `标准 Excel：${draft.standard_excel_formula}` : '',
      draft.platform_limitation ? `平台限制：${draft.platform_limitation}` : '',
    ].filter(Boolean)
    return lines.join('\n')
  }
  const validationErrors = applyResult.validationErrors || draftValidationErrors(draft)
  const platformLimitation = draft.platform_limitation
  if (validationErrors.length) {
    return `${summary}\n\n公式区已更新，但当前草稿还没有通过校验：${compactFormulaIssues(validationErrors)}`
  }
  if (platformLimitation) {
    return `${summary}\n\n平台限制：${platformLimitation}`
  }
  const warnings = Array.isArray(draft.warnings) ? draft.warnings.filter(Boolean) : []
  if (warnings.length) {
    return `${summary}\n\n提示：${warnings.slice(0, 2).join('；')}`
  }
  return summary
}

async function applyDraftToFormula(draft: any): Promise<DraftApplyResult> {
  if (draft.should_update_formula === false || draft.intent === 'formula_question') {
    return { valid: true, validationErrors: [] }
  }
  form.label = draft.field_label || form.label
  form.formula = normalizeDisplayFormula(internalFormulaToDisplay(draft.formula_display || draft.formula))
  form.formula_display = form.formula
  form.data_type = draft.data_type || 'number'
  validation.value = null
  try {
    const result = await aiFormulaApi.validate({
      dataset_id: props.datasetId!,
      formula: draft.formula,
    })
    validation.value = {
      ...result,
      warnings: [...(draft.warnings || []), ...(result.warnings || [])],
    }
    if (result.valid) {
      form.formula = normalizeDisplayFormula(internalFormulaToDisplay(result.formula))
    }
    return { valid: result.valid, validationErrors: result.valid ? [] : result.errors }
  } catch (e: any) {
    return {
      valid: false,
      validationErrors: [errorMessage(e, '自动校验失败')],
    }
  }
}

async function sendChat() {
  if (!props.datasetId) {
    ElMessage.warning('请先选择数据集')
    return
  }
  const message = chatInput.value.trim()
  if (!message) {
    ElMessage.warning('请先输入调整需求')
    return
  }
  const history = chatHistoryPayload()
  chatMessages.value.push({
    id: ++chatId,
    role: 'user',
    content: message,
    formula: form.formula || null,
  })
  chatInput.value = ''
  scrollChatToBottom()
  generating.value = true
  try {
    const draft = await aiFormulaApi.draft({
      dataset_id: props.datasetId,
      message,
      current_formula: form.formula || null,
      current_field_label: form.label || null,
      history,
    })
    const shouldUpdateFormula = draft.should_update_formula !== false && draft.intent !== 'formula_question'
    const applyResult = await applyDraftToFormula(draft)
    chatMessages.value.push({
      id: ++chatId,
      role: 'assistant',
      content: buildAssistantReply(draft, applyResult),
      formula: shouldUpdateFormula ? form.formula || null : null,
    })
    if (shouldUpdateFormula) markDirty()
    if (shouldUpdateFormula && applyResult.validationErrors?.length) {
      ElMessage.warning('公式草稿已生成，但还需要调整后才能保存')
    }
    scrollChatToBottom()
  } catch (e: any) {
    const error = normalizeAiFailureMessage(e)
    chatMessages.value.push({
      id: ++chatId,
      role: 'assistant',
      content: error,
      formula: form.formula || null,
    })
    scrollChatToBottom()
    ElMessage.error(error)
  } finally {
    generating.value = false
  }
}

function inferAggRole() {
  return form.data_type === 'number' ? 'measure' : 'dimension'
}

function handleChatKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendChat()
  }
}

async function validate() {
  if (!props.datasetId || !form.formula.trim()) return false
  validating.value = true
  try {
    const result = await aiFormulaApi.validate({
      dataset_id: props.datasetId,
      formula: form.formula.trim(),
    })
    validation.value = result
    if (result.valid) {
      form.formula = normalizeDisplayFormula(internalFormulaToDisplay(result.formula))
      ElMessage.success('公式校验通过')
      return true
    }
    ElMessage.warning(result.errors.join('；') || '公式未通过校验')
    return false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '校验失败')
    return false
  } finally {
    validating.value = false
  }
}

async function save() {
  if (!props.datasetId) {
    ElMessage.warning('请先选择数据集')
    return
  }
  if (!form.label.trim() || !form.formula.trim()) {
    ElMessage.warning('字段名称和公式必填')
    return
  }
  if (!form.code.trim()) {
    ElMessage.warning('字段编码正在生成，请稍后再保存')
    return
  }
  const ok = validation.value?.valid || await validate()
  if (!ok) return
  const latestValidation = await aiFormulaApi.validate({
    dataset_id: props.datasetId,
    formula: form.formula.trim(),
  })
  if (!latestValidation.valid) {
    validation.value = latestValidation
    ElMessage.warning(latestValidation.errors.join('；') || '公式未通过校验')
    return
  }
  validation.value = latestValidation
  form.formula = normalizeDisplayFormula(internalFormulaToDisplay(latestValidation.formula))
  saving.value = true
  try {
    const payload = {
      code: form.code.trim() || null,
      label: form.label.trim(),
      description: form.description.trim() || null,
      formula: form.formula.trim(),
      formula_display: null,
      data_type: form.data_type,
      agg_role: inferAggRole() as 'dimension' | 'measure',
      is_sensitive: form.is_sensitive,
      is_active: true,
    }
    let saved: DatasetCalculatedField
    if (props.editField?.id) {
      saved = await datasetsApi.updateCalculatedField(props.datasetId, props.editField.id, payload)
    } else {
      saved = await aiFormulaApi.saveCalculatedField(props.datasetId, payload)
    }
    ElMessage.success('计算字段已保存')
    dirty.value = false
    emit('saved', saved)
    open.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function removeField() {
  if (!props.datasetId || !props.editField?.id) return
  try {
    await ElMessageBox.confirm(
      `确定删除计算字段「${props.editField.label || props.editField.code}」吗？` +
        '删除后，引用了该字段的报表/拆分规则将自动跳过它，结果可能变化。',
      '删除计算字段',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  deleting.value = true
  try {
    await datasetsApi.removeCalculatedField(props.datasetId, props.editField.id)
    ElMessage.success('计算字段已删除')
    dirty.value = false
    emit('saved', props.editField)
    open.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <!-- 内联模式：直接嵌入父页面 -->
  <div v-if="inline" class="formula-designer formula-designer--inline">
    <aside class="resource-panel">
      <div class="panel-title">计算素材</div>
      <el-tabs v-model="activePickerTab" class="picker-tabs">
        <el-tab-pane label="字段" name="fields" />
        <el-tab-pane label="函数" name="functions" />
        <el-tab-pane label="常量" name="constants" />
      </el-tabs>
      <el-input
        v-model="fieldKeyword"
        class="picker-search"
        size="small"
        placeholder="搜索"
        :prefix-icon="Search"
      />
      <div class="resource-browser">
        <el-select
          v-model="activeResourceGroup"
          class="resource-group-select"
          size="small"
          placeholder="选择分组"
          :disabled="!resourceGroups.length"
        >
          <el-option
            v-for="group in resourceGroups"
            :key="group.key"
            :label="`${group.label}（${group.items.length}）`"
            :value="group.key"
          />
        </el-select>
        <div class="resource-groups">
          <button
            v-for="group in resourceGroups"
            :key="group.key"
            type="button"
            class="resource-group"
            :class="{ active: group.key === activeResourceGroup }"
            @click="activeResourceGroup = group.key"
          >
            <span class="group-plus">+</span>
            <span>{{ group.label }}</span>
            <em>{{ group.items.length }}</em>
          </button>
          <div v-if="!resourceGroups.length" class="empty-side">暂无可用素材</div>
        </div>
        <div class="resource-items">
          <template v-if="activePickerTab === 'fields'">
            <button
              v-for="field in activeFieldItems"
              :key="field.code"
              type="button"
              class="pick-item"
              @click="insertField(field)"
            >
              <span>{{ cleanFieldLabel(field) }}</span>
              <code>{{ cleanFieldCode(field) }}</code>
            </button>
          </template>
          <template v-if="activePickerTab === 'functions'">
            <button
              v-for="fn in activeFunctionItems"
              :key="`${fn.id || fn.code}`"
              type="button"
              class="pick-item"
              @click="insertFunction(fn)"
            >
              <span>{{ fn.code }}</span>
              <code>{{ fn.name }}</code>
            </button>
          </template>
          <template v-if="activePickerTab === 'constants'">
            <button
              v-for="item in activeConstantItems"
              :key="item.code"
              type="button"
              class="pick-item"
              @click="insertConstant(item)"
            >
              <span>{{ item.label }}</span>
              <code>{{ item.code }} · {{ item.hint }}</code>
            </button>
          </template>
          <div v-if="!activeResourceItems.length" class="empty-side">没有匹配项</div>
        </div>
      </div>
    </aside>

    <main class="designer-main">
      <section class="formula-card">
        <div class="section-head compact-head">
          <span class="section-marker"></span>
          <span>计算公式</span>
          <span class="head-note">字段、函数、常量可从左侧点击插入</span>
        </div>
        <div class="operator-bar">
          <button
            v-for="item in formulaOperators"
            :key="item.label"
            type="button"
            class="operator-button"
            @click="insertOperator(item)"
          >
            {{ item.label }}
          </button>
        </div>
        <el-input
          ref="formulaInputRef"
          v-model="form.formula"
          class="formula-input"
          type="textarea"
          spellcheck="false"
          placeholder="=IF(员工姓名=&quot;刘琦&quot;,1,2)"
          @input="markDirty"
          @blur="rememberFormulaCursor"
          @click="rememberFormulaCursor"
          @keyup="rememberFormulaCursor"
          @select="rememberFormulaCursor"
        />
      </section>

      <section class="ai-card">
        <div class="section-head compact-head">
          <span class="section-marker"></span>
          <span>AI 公式助手</span>
          <span class="head-note">继续输入就是继续调整</span>
        </div>
        <div ref="chatScrollRef" class="chat-thread">
          <div v-if="!chatMessages.length" class="chat-empty">直接输入需求，AI 会更新公式草稿。</div>
          <div v-for="item in chatMessages" :key="item.id" class="chat-message" :class="item.role">
            <div class="chat-bubble">
              <div class="chat-content">{{ item.content }}</div>
              <code v-if="item.role === 'assistant' && item.formula" class="chat-formula">{{ item.formula }}</code>
            </div>
          </div>
          <div v-if="generating" class="chat-message assistant">
            <div class="chat-bubble">正在更新公式...</div>
          </div>
        </div>
        <div class="ai-send-box">
          <el-input
            v-model="chatInput"
            class="ai-send-input"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 3 }"
            resize="none"
            placeholder="给 AI 发送消息"
            @keydown="handleChatKeydown"
          />
          <div class="ai-send-actions">
            <span class="send-hint">Enter 发送，Shift+Enter 换行</span>
            <el-button class="send-icon-button" type="primary" circle :loading="generating" @click="sendChat">
              <el-icon><Position /></el-icon>
            </el-button>
          </div>
        </div>
      </section>
    </main>
  </div>

  <!-- Dialog 模式：完整弹窗 -->
  <el-dialog
    v-else
    v-model="open"
    width="92vw"
    top="0"
    class="formula-designer-dialog"
    modal-class="formula-designer-modal"
    header-class="formula-designer-dialog-header"
    body-class="formula-designer-dialog-body"
    append-to-body
    :show-close="false"
    :close-on-click-modal="false"
    :before-close="requestClose"
  >
    <template #header>
      <div class="designer-titlebar">
        <div>
          <div class="designer-title">{{ title || (editField ? '编辑计算字段' : '新建计算字段') }}</div>
          <div class="designer-subtitle">{{ subtitle || '用自然语言生成公式，也可以手动插入字段、函数和常量。' }}</div>
        </div>
        <div class="title-actions">
          <slot name="actions">
            <el-button v-if="!hideDefaultActions && editField?.id && canDeleteField" type="danger" plain :loading="deleting" @click="removeField">
              <el-icon><Delete /></el-icon>删除
            </el-button>
            <el-button v-if="!hideDefaultActions" @click="requestClose()">
              <el-icon><Close /></el-icon>取消
            </el-button>
            <el-button v-if="!hideDefaultActions" :loading="validating" @click="validate">
              <el-icon><Check /></el-icon>校验
            </el-button>
            <el-button v-if="!hideDefaultActions" type="primary" :loading="saving" @click="save">
              <el-icon><Plus /></el-icon>
              保存字段
            </el-button>
          </slot>
        </div>
      </div>
    </template>

    <div class="formula-designer">
      <aside class="resource-panel">
        <div class="panel-title">计算素材</div>
        <el-tabs v-model="activePickerTab" class="picker-tabs">
          <el-tab-pane label="字段" name="fields" />
          <el-tab-pane label="函数" name="functions" />
          <el-tab-pane label="常量" name="constants" />
        </el-tabs>
        <el-input
          v-model="fieldKeyword"
          class="picker-search"
          size="small"
          placeholder="搜索"
          :prefix-icon="Search"
        />
        <div class="resource-browser">
          <el-select
            v-model="activeResourceGroup"
            class="resource-group-select"
            size="small"
            placeholder="选择分组"
            :disabled="!resourceGroups.length"
          >
            <el-option
              v-for="group in resourceGroups"
              :key="group.key"
              :label="`${group.label}（${group.items.length}）`"
              :value="group.key"
            />
          </el-select>

          <div class="resource-groups">
            <button
              v-for="group in resourceGroups"
              :key="group.key"
              type="button"
              class="resource-group"
              :class="{ active: group.key === activeResourceGroup }"
              @click="activeResourceGroup = group.key"
            >
              <span class="group-plus">+</span>
              <span>{{ group.label }}</span>
              <em>{{ group.items.length }}</em>
            </button>
            <div v-if="!resourceGroups.length" class="empty-side">暂无可用素材</div>
          </div>

          <div class="resource-items">
            <template v-if="activePickerTab === 'fields'">
              <button
                v-for="field in activeFieldItems"
                :key="field.code"
                type="button"
                class="pick-item"
                @click="insertField(field)"
              >
                <span>{{ cleanFieldLabel(field) }}</span>
                <code>{{ cleanFieldCode(field) }}</code>
              </button>
            </template>

            <template v-if="activePickerTab === 'functions'">
              <button
                v-for="fn in activeFunctionItems"
                :key="`${fn.id || fn.code}`"
                type="button"
                class="pick-item"
                @click="insertFunction(fn)"
              >
                <span>{{ fn.code }}</span>
                <code>{{ fn.name }}</code>
              </button>
            </template>

            <template v-if="activePickerTab === 'constants'">
              <button
                v-for="item in activeConstantItems"
                :key="item.code"
                type="button"
                class="pick-item"
                @click="insertConstant(item)"
              >
                <span>{{ item.label }}</span>
                <code>{{ item.code }} · {{ item.hint }}</code>
              </button>
            </template>
            <div v-if="!activeResourceItems.length" class="empty-side">没有匹配项</div>
          </div>
        </div>
      </aside>

      <main class="designer-main">
        <section class="formula-card">
          <div class="section-head compact-head">
            <span class="section-marker"></span>
            <span>计算公式</span>
            <span class="head-note">字段、函数、常量可从左侧点击插入</span>
          </div>
          <div class="operator-bar">
            <button
              v-for="item in formulaOperators"
              :key="item.label"
              type="button"
              class="operator-button"
              @click="insertOperator(item)"
            >
              {{ item.label }}
            </button>
          </div>
          <el-input
            ref="formulaInputRef"
            v-model="form.formula"
            class="formula-input"
            type="textarea"
            spellcheck="false"
            placeholder="=IF(员工姓名=&quot;刘琦&quot;,1,2)"
            @input="markDirty"
            @blur="rememberFormulaCursor"
            @click="rememberFormulaCursor"
            @keyup="rememberFormulaCursor"
            @select="rememberFormulaCursor"
          />
        </section>

        <section class="ai-card">
          <div class="section-head compact-head">
            <span class="section-marker"></span>
            <span>AI 公式助手</span>
            <span class="head-note">继续输入就是继续调整</span>
          </div>
          <div ref="chatScrollRef" class="chat-thread">
            <div v-if="!chatMessages.length" class="chat-empty">
              直接输入需求，AI 会更新上方公式草稿。
            </div>
            <div
              v-for="item in chatMessages"
              :key="item.id"
              class="chat-message"
              :class="item.role"
            >
              <div class="chat-bubble">
                <div class="chat-content">{{ item.content }}</div>
                <code v-if="item.role === 'assistant' && item.formula" class="chat-formula">{{ item.formula }}</code>
              </div>
            </div>
            <div v-if="generating" class="chat-message assistant">
              <div class="chat-bubble">正在更新公式...</div>
            </div>
          </div>

          <div class="ai-send-box">
            <el-input
              v-model="chatInput"
              class="ai-send-input"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 3 }"
              resize="none"
              placeholder="给 AI 发送消息，例如：如果员工是刘琦，则等于1，否则等于2"
              @keydown="handleChatKeydown"
            />
            <div class="ai-send-actions">
              <span class="send-hint">Enter 发送，Shift+Enter 换行</span>
              <el-button
                class="send-icon-button"
                type="primary"
                circle
                :loading="generating"
                @click="sendChat"
              >
                <el-icon><Position /></el-icon>
              </el-button>
            </div>
          </div>
        </section>
      </main>

      <aside class="config-panel">
        <slot name="config">
          <section v-if="!hideDefaultConfig" class="config-card">
            <div class="section-head compact-head">
              <span class="section-marker"></span>
              <span>字段配置</span>
            </div>
            <el-form label-position="top" class="config-form">
            <el-form-item label="字段名称" required>
              <el-input v-model="form.label" placeholder="如 个税金额" @input="markDirty" />
            </el-form-item>
            <el-form-item label="字段编码">
              <SmartCodeInput
                v-model="form.code"
                :label="form.label"
                scope="calculated_field"
                :dataset-id="datasetId"
                :existing-codes="existingCalculatedCodes"
                context="数据集计算字段"
              />
            </el-form-item>
            <el-form-item label="字段类型">
              <el-select v-model="form.data_type" style="width: 100%" @change="markDirty">
                <el-option label="数值" value="number" />
                <el-option label="文本" value="string" />
                <el-option label="日期" value="date" />
                <el-option label="布尔" value="bool" />
              </el-select>
            </el-form-item>
            <el-form-item label="描述">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="3"
                maxlength="200"
                show-word-limit
                placeholder="输入描述信息"
                @input="markDirty"
              />
            </el-form-item>
            <el-form-item>
              <el-switch v-model="form.is_sensitive" active-text="绝密（所有人脱敏）" inactive-text="按依赖裁决" @change="markDirty" />
              <span style="margin-left: 8px; font-size: 12px; color: var(--color-text-placeholder)">
                开启后该字段对所有人（含超管）脱敏；关闭则按公式依赖字段的授权自动裁决
              </span>
            </el-form-item>
          </el-form>
        </section>

        <section class="config-card validation-card">
          <div class="section-head compact-head">
            <span class="section-marker"></span>
            <span>校验结果</span>
          </div>
          <div class="validate-panel" :class="{ ok: validation?.valid, bad: validation && !validation.valid }">
            <div class="validate-title">
              {{ validation ? (validation.valid ? '校验通过' : '校验未通过') : '尚未校验' }}
            </div>
            <div v-if="validation?.depends_on?.length" class="validate-line">
              依赖字段：{{ validation.depends_on.join('，') }}
            </div>
            <div v-if="validation?.used_functions?.length" class="validate-line">
              使用函数：{{ validation.used_functions.join('，') }}
            </div>
            <div v-if="validation?.is_sensitive" class="validate-line">公式含敏感函数/字段：结果默认对无权用户脱敏；如需对所有人绝密，请开启上方「绝密」开关。</div>
            <div v-for="err in validation?.errors || []" :key="err" class="validate-error">{{ err }}</div>
            <div v-for="warn in validation?.warnings || []" :key="warn" class="validate-warn">{{ warn }}</div>
          </div>
        </section>
        </slot>
      </aside>
    </div>
  </el-dialog>
</template>

<style scoped>
:deep(.formula-designer-dialog) {
  display: flex;
  flex-direction: column;
  max-width: 1440px;
  height: min(900px, calc(100vh - 16px));
  max-height: calc(100vh - 16px);
  margin-bottom: 0;
  overflow: hidden;
}
:deep(.formula-designer-dialog .el-dialog__header) {
  flex: none;
  margin: 0;
  padding: 12px 22px 10px;
  border-bottom: 1px solid var(--color-border-light);
}
:deep(.formula-designer-dialog .el-dialog__body) {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  max-height: none;
  padding: 0;
  overflow: hidden;
  background: #fff;
}
:deep(.formula-designer-dialog .el-dialog__footer) {
  display: none;
}
.designer-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}
.designer-titlebar > div:first-child {
  min-width: 0;
}
.designer-title {
  color: var(--color-text-primary);
  font-size: 17px;
  font-weight: 700;
}
.designer-subtitle {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.title-actions {
  display: flex;
  align-items: center;
  flex: none;
  gap: 8px;
}
.formula-designer {
  display: grid;
  grid-template-columns: clamp(260px, 20vw, 330px) minmax(320px, 1fr) clamp(280px, 20vw, 340px);
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
/* 内联模式：嵌入父表单，去掉高度限制 */
.formula-designer--inline {
  grid-template-columns: clamp(220px, 18vw, 300px) minmax(280px, 1fr);
  height: auto;
  min-height: 380px;
  max-height: 620px;
  border: 1px solid var(--color-border-light, #e4e7ed);
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}
.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 700;
}
.section-marker {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--color-primary);
}
.compact-head {
  min-height: 28px;
}
.head-note {
  margin-left: auto;
  color: var(--color-text-placeholder);
  font-size: 12px;
  font-weight: 400;
}
.resource-panel,
.config-panel,
.designer-main {
  min-height: 0;
}
.resource-panel {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  min-width: 0;
  overflow: hidden;
  border-right: 1px solid var(--color-border-light);
  background: var(--color-bg-page);
}
.panel-title {
  padding: 14px 16px 0;
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 700;
}
.picker-tabs {
  padding: 0 16px;
}
.picker-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}
.picker-search {
  width: calc(100% - 32px);
  margin: 0 16px 10px;
}
.resource-browser {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-top: 1px solid var(--color-border-light);
  background: #fff;
}
.resource-group-select {
  display: none;
}
.resource-groups,
.resource-items {
  min-height: 0;
  height: 100%;
  overflow-x: hidden;
  overflow-y: scroll;
  padding: 10px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.resource-groups {
  border-right: 1px solid var(--color-border-light);
  background: #fff;
}
.resource-group {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 5px;
  width: 100%;
  min-height: 30px;
  padding: 5px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}
.resource-group:hover,
.resource-group.active {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}
.resource-group span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.resource-group em {
  color: var(--color-text-placeholder);
  font-style: normal;
}
.group-plus {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  border: 1px solid currentColor;
  font-size: 11px;
  line-height: 1;
}
.resource-items {
  display: grid;
  align-content: start;
  gap: 6px;
  overscroll-behavior: contain;
  overflow-y: scroll;
  border-left: 0;
  background: var(--color-bg-page);
}
.designer-main {
  display: grid;
  grid-template-rows: clamp(156px, 24vh, 220px) minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  padding: 10px;
}
.ai-card,
.formula-card,
.config-card {
  display: grid;
  gap: 8px;
  min-height: 0;
  padding: 10px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: #fff;
}
.ai-card {
  grid-template-rows: auto minmax(0, 1fr) auto;
}
.chat-workspace {
  display: grid;
  gap: 10px;
}
.chat-thread {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 0;
  overflow: auto;
  padding: 8px 10px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: var(--color-bg-subtle);
  overscroll-behavior: contain;
}
.chat-empty {
  color: var(--color-text-placeholder);
  font-size: 12px;
}
.chat-message {
  display: flex;
  min-width: 0;
}
.chat-message.user {
  justify-content: flex-end;
}
.chat-message.assistant {
  justify-content: flex-start;
}
.chat-bubble {
  display: grid;
  gap: 6px;
  max-width: min(680px, 88%);
  padding: 8px 10px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: #fff;
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.chat-message.user .chat-bubble {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
.chat-formula {
  display: block;
  overflow-wrap: anywhere;
  color: inherit;
  opacity: 0.82;
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
}
.ai-send-box {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
}
.ai-send-input :deep(.el-textarea__inner) {
  min-height: 30px !important;
  padding: 2px 0;
  border: 0;
  box-shadow: none;
  color: var(--color-text-primary);
  font-size: 14px;
  line-height: 1.6;
}
.ai-send-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.send-hint {
  min-width: 0;
  color: var(--color-text-placeholder);
  font-size: 12px;
}
.send-icon-button {
  width: 32px;
  height: 32px;
  flex: none;
  background: #9fb4ff;
  border-color: #9fb4ff;
}
.send-icon-button:hover {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.formula-card {
  display: grid;
  grid-template-rows: auto auto minmax(72px, 1fr);
  min-height: 0;
}
.pick-item {
  display: grid;
  gap: 3px;
  width: 100%;
  min-height: 48px;
  padding: 8px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: #fff;
  color: var(--color-text-primary);
  cursor: pointer;
  text-align: left;
}
.pick-item:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
}
.pick-item span,
.pick-item code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pick-item code {
  color: var(--color-text-placeholder);
  font-family: var(--font-mono);
  font-size: 11px;
}
.empty-side {
  padding: 14px 4px;
  color: var(--color-text-placeholder);
  font-size: 12px;
}
.operator-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  min-height: 28px;
  padding: 3px 8px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-bg-subtle);
}
.operator-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
}
.operator-button:hover {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}
.formula-input {
  display: block;
  height: 100%;
  min-height: 0;
}
.formula-input :deep(.el-textarea__inner) {
  height: 100% !important;
  min-height: 72px !important;
  padding: 10px 14px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  box-shadow: none;
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.7;
  overflow: auto;
  overscroll-behavior: contain;
  resize: none;
}
.config-panel {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  padding: 10px;
  border-left: 1px solid var(--color-border-light);
  background: var(--color-bg-subtle);
  overscroll-behavior: contain;
}
.config-card {
  align-content: start;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.config-form :deep(.el-form-item) {
  margin-bottom: 14px;
}
.config-form :deep(.el-form-item__label) {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}
.validation-card {
  max-height: 180px;
  overflow: auto;
}
.validate-panel {
  padding: 10px 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: var(--color-bg-subtle);
  font-size: 12px;
}
.validate-panel.ok {
  border-color: var(--color-success-border);
  background: var(--color-success-light);
}
.validate-panel.bad {
  border-color: var(--color-danger-border);
  background: var(--color-danger-light);
}
.validate-title {
  font-weight: 700;
  color: var(--color-text-primary);
}
.validate-line,
.validate-warn,
.validate-error {
  margin-top: 6px;
  color: var(--color-text-secondary);
  word-break: break-all;
}
.validate-error {
  color: var(--color-danger);
}
.validate-warn {
  color: var(--color-warning);
}
@media (max-width: 1280px) {
  .formula-designer {
    grid-template-columns: 248px minmax(320px, 1fr) 270px;
  }
  .designer-main {
    grid-template-rows: clamp(145px, 23vh, 200px) minmax(0, 1fr);
  }
  .resource-browser {
    grid-template-columns: 116px minmax(0, 1fr);
  }
  .head-note {
    display: none;
  }
}
@media (max-width: 1080px) {
  .formula-designer {
    grid-template-columns: 220px minmax(300px, 1fr) 248px;
  }
  .resource-browser {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 8px;
    padding: 8px;
  }
  .resource-group-select {
    display: block;
  }
  .resource-groups {
    display: none;
  }
  .resource-items {
    padding: 0;
    border-radius: 6px;
    border: 1px solid var(--color-border-light);
  }
}
@media (max-width: 860px) {
  :deep(.formula-designer-dialog) {
    width: 96vw !important;
    height: calc(100vh - 12px);
    max-height: calc(100vh - 12px);
  }
  :deep(.formula-designer-dialog .el-dialog__body) {
    overflow: hidden;
  }
  .formula-designer {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(160px, 26vh) minmax(360px, 1fr) minmax(220px, 30vh);
    height: 100%;
    min-height: 0;
  }
  .title-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .resource-panel,
  .config-panel {
    border-right: 0;
    border-left: 0;
  }
  .resource-panel {
    max-height: none;
  }
  .config-panel {
    grid-template-columns: 1fr;
    max-height: none;
  }
}
@media (max-width: 560px) {
  .ai-send-actions,
  .title-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .send-icon-button {
    align-self: flex-end;
  }
}
</style>

<style>
.formula-designer-modal .el-overlay-dialog {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
  padding: 8px 0;
}
.formula-designer-modal .formula-designer-dialog.el-dialog {
  --el-dialog-padding-primary: 0;
  display: flex;
  flex-direction: column;
  width: min(92vw, 1440px) !important;
  height: min(900px, calc(100vh - 16px));
  max-height: calc(100vh - 16px);
  margin: 0;
  overflow: hidden;
}
.formula-designer-modal .formula-designer-dialog-header {
  flex: none;
  margin: 0;
  padding: 12px 22px 10px;
  border-bottom: 1px solid var(--color-border-light);
}
.formula-designer-modal .formula-designer-dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: #fff;
}
@media (max-width: 860px) {
  .formula-designer-modal .el-overlay-dialog {
    padding: 6px 0;
  }
  .formula-designer-modal .formula-designer-dialog.el-dialog {
    width: 96vw !important;
    height: calc(100vh - 12px);
    max-height: calc(100vh - 12px);
  }
}
</style>
