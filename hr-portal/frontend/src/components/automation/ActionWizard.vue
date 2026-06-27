<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Promotion, Bell, ChatDotRound, User, Connection,
  ArrowLeft, ArrowRight, Close, Check,
  Iphone, ArrowDown
} from '@element-plus/icons-vue'
import type { ReceiverRule, MessageConfig, FeishuChatTarget } from '@/api/feishu'
import { feishuApi } from '@/api/feishu'
import { usersApi, type UserListItem } from '@/api/users'

// ── 动作类型定义 ────────────────────────────────────
interface ActionTypeDef {
  value: string
  label: string
  desc: string
  icon: any
}
const actionTypeDefs: ActionTypeDef[] = [
  {
    value: 'feishu_send_message',
    label: '发送飞书消息',
    desc: '向指定用户或群聊发送飞书通知消息',
    icon: Promotion,
  },
]

// ── Props / Emits ─────────────────────────────────────
const props = defineProps<{
  modelValue: boolean
  editConfig?: Record<string, any> | null  // 编辑时传入已有配置
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'confirm': [payload: { type: string; name: string; enabled: boolean; config: Record<string, any> }]
}>()

// ── 向导步骤 ─────────────────────────────────────────
type Step = 'select' | 'configure'
const currentStep = ref<Step>('select')
const selectedType = ref<string>('feishu_send_message')

const isVisible = ref(false)
const isClosing = ref(false)

// ── 配置表单 ─────────────────────────────────────────
// 接收人（checkbox 多选模式：勾选类型后展开对应输入框）
interface ReceiverCheckItem {
  key: string       // 对应的 receiver type 值
  label: string     // 显示名称
  desc?: string     // 提示文字（info图标）
  icon: any
  placeholder: string // 输入框占位文字
  inputType: 'users' | 'chats' | 'text'
}

const receiverCheckOptions: ReceiverCheckItem[] = [
  { key: 'fixed_users', label: '指定成员或部门', desc: '选择系统用户', icon: User, inputType: 'users', placeholder: '搜索并选择系统用户...' },
  { key: 'fixed_chats', label: '群消息', desc: '选择飞书群聊发送消息', icon: ChatDotRound, inputType: 'chats', placeholder: '搜索并选择飞书群...' },
  { key: 'employee_field_user', label: '私信每个群成员', desc: '根据花名册字段匹配用户后逐个私信', icon: Connection, inputType: 'text', placeholder: '花名册字段名，如 direct_supervisor' },
]

// 已勾选的类型集合
const checkedReceiverKeys = ref<Set<string>>(new Set())

// 每个类型的输入值
const receiverInputValues = ref<Record<string, any>>({})

function toggleReceiverKey(key: string) {
  const newSet = new Set(checkedReceiverKeys.value)
  if (newSet.has(key)) {
    newSet.delete(key)
    delete receiverInputValues.value[key]
  } else {
    newSet.add(key)
    // 初始化默认值
    const opt = receiverCheckOptions.find(o => o.key === key)
    if (opt?.inputType === 'users' || opt?.inputType === 'chats') {
      receiverInputValues.value[key] = []
    } else {
      receiverInputValues.value[key] = ''
    }
  }
  checkedReceiverKeys.value = newSet
}

function updateReceiverValue(key: string, val: any) {
  receiverInputValues.value[key] = val
}
// 消息
const messageFormat = ref<'text' | 'markdown'>('markdown')
const titleTemplate = ref('')
const contentTemplate = ref('{{trigger_event.event_type}} 事件触发')
const hasCardButton = ref(false)
const cardButtonText = ref('查看详情')
const cardButtonUrl = ref('')
const requireCompletion = ref(false)
const testContextJson = ref('')
const testing = ref(false)
const testResult = ref<any | null>(null)
const actionName = ref('')

// 接收人类型选项（已迁移为 checkbox 模式，见上方 receiverCheckOptions）

// ── 数据源 ───────────────────────────────────────────
interface SelectOption { label: string; value: number | string }
const userOptions = ref<SelectOption[]>([])
const chatOptions = ref<SelectOption[]>([])
const dataLoading = ref(false)

// ── @ 提及功能 ─────────────────────────────────────
interface MentionUserOption { label: string; value: string; feishu_user_id: string | null }
const mentionUserOptions = ref<MentionUserOption[]>([])
const showMentionDropdown = ref(false)
const mentionSearch = ref('')
const mentionFilterOptions = ref<{ label: string; value: string }[]>([])
const mentionDropdownStyle = ref<Record<string, string>>({})
const mentionSearchInputRef = ref<HTMLInputElement | null>(null)

// 监听 textarea 输入，检测 @ 触发
function handleContentInput(e: Event) {
  const el = e.target as HTMLTextAreaElement
  contentTemplate.value = el.value
  const cursorPos = el.selectionStart ?? 0
  const textBeforeCursor = el.value.slice(0, cursorPos)
  const lastChar = textBeforeCursor.slice(-1)
  if (lastChar === '@') {
    showMentionDropdown.value = true
    mentionSearch.value = ''
    mentionFilterOptions.value = mentionUserOptions.value
      .filter(u => u.feishu_user_id)
      .map(u => ({ label: u.label, value: u.feishu_user_id! }))
    nextTick(() => { mentionSearchInputRef.value?.focus() })
  }
}

function openMentionDropdown() {
  showMentionDropdown.value = true
  mentionSearch.value = ''
  mentionFilterOptions.value = mentionUserOptions.value
    .filter(u => u.feishu_user_id)
    .map(u => ({ label: u.label, value: u.feishu_user_id! }))
  nextTick(() => { mentionSearchInputRef.value?.focus() })
}

function filterMentionOptions() {
  const q = mentionSearch.value.toLowerCase()
  mentionFilterOptions.value = mentionUserOptions.value
    .filter(u => u.feishu_user_id && u.label.toLowerCase().includes(q))
    .map(u => ({ label: u.label, value: u.feishu_user_id! }))
}

function selectMention(feishuUserId: string, label: string) {
  const el = textareaRef.value
  if (!el) return
  const cursorPos = el.selectionStart ?? 0
  const text = contentTemplate.value
  const textBeforeCursor = text.slice(0, cursorPos)
  const atIndex = textBeforeCursor.lastIndexOf('@')
  if (atIndex >= 0) {
    const before = text.slice(0, atIndex)
    const after = text.slice(cursorPos)
    const newText = `${before}<at user_id="${feishuUserId}">@${label}</at>${after}`
    contentTemplate.value = newText
    showMentionDropdown.value = false
    nextTick(() => {
      el.focus()
      const newPos = atIndex + `<at user_id="${feishuUserId}">@${label}</at>`.length
      el.selectionStart = newPos
      el.selectionEnd = newPos
    })
  }
}

// 修改 fetchOptions 获取 feishu_user_id
async function fetchOptions() {
  dataLoading.value = true
  try {
    const [usersResp, targets] = await Promise.all([
      usersApi.list({ page_size: 100 }),
      feishuApi.listChatTargets().catch(() => [] as FeishuChatTarget[]),
    ])
    const items = (usersResp.items || []) as any[]
    userOptions.value = items.map((u: any) => ({
      label: `${u.display_name || u.login_name}`,
      value: u.id,
    }))
    // 为 @ 提及单独存一份含 feishu_user_id 的列表
    mentionUserOptions.value = items.map((u: any) => ({
      label: `${u.display_name || u.login_name}`,
      value: String(u.id),
      feishu_user_id: u.feishu_user_id || null,
    }))
    chatOptions.value = (targets as FeishuChatTarget[]).map((t) => ({
      label: `${t.name} (${t.chat_id})`,
      value: t.chat_id,
    }))
  } catch (e) {
    console.warn('[ActionWizard] 获取选项失败', e)
  } finally {
    dataLoading.value = false
  }
}


// ── 富文本工具栏 ─────────────────────────────────────
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const availableVariables = [
  { name: 'trigger_event.event_type', desc: '触发事件类型' },
  { name: 'trigger_event.timestamp', desc: '触发时间' },
  { name: 'trigger_event.biz_id', desc: '业务 ID' },
  { name: 'trigger_event.biz_name', desc: '业务名称' },
  { name: 'rule.name', desc: '规则名称' },
]

function wrapSelection(wrapper: [string, string]) {
  const el = textareaRef.value; if (!el) return
  const start = el.selectionStart, end = el.selectionEnd
  const text = contentTemplate.value
  const selected = text.slice(start, end)
  const mid = wrapper[0] + selected + wrapper[1]
  contentTemplate.value = text.slice(0, start) + mid + text.slice(end)
  nextTick(() => { el.focus(); el.selectionStart = el.selectionEnd = start + mid.length })
}
function toolbarBold() { wrapSelection(['**', '**']) }
function toolbarItalic() { wrapSelection(['*', '*']) }
function toolbarCode() { wrapSelection(['`', '`']) }
function toolbarLink() {
  const url = prompt('输入链接地址：', 'https://')
  if (url) wrapSelection(['[', `](${url})`])
}
function toolbarHr() { contentTemplate.value += '\n\n---\n' }
function toolbarBullet() {
  const el = textareaRef.value
  if (!el) { contentTemplate.value += '- '; return }
  const lines = contentTemplate.value.split('\n')
  const idx = contentTemplate.value.slice(0, el.selectionStart).split('\n').length - 1
  lines[idx] = '- ' + lines[idx]
  contentTemplate.value = lines.join('\n')
}
function insertVariable(variable: string) {
  contentTemplate.value += `{{${variable}}}`
}

// ── 手机预览 ─────────────────────────────────────────
const contentPreview = computed(() => {
  let text = contentTemplate.value || '（空消息）'
  availableVariables.forEach(v => { text = text.replaceAll(`{{${v.name}}}`, `[${v.desc}]`) })
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1').replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^-\s/gm, '• ').replace(/^#{1,6}\s/gm, '')
})

// ── 向导状态管理 ─────────────────────────────────────
watch(() => props.modelValue, (val) => {
  if (val) {
    isVisible.value = true; isClosing.value = false
    if (props.editConfig) {
      selectedType.value = props.editConfig.type || 'feishu_send_message'
      currentStep.value = 'configure'
      // 回填配置
      const cfg = props.editConfig.config || {}
      // 回填接收人：从 receivers 数组转为 checkbox 模式
      const savedReceivers: ReceiverRule[] = (cfg.receivers || []) as ReceiverRule[]
      const keys = new Set<string>()
      const inputs: Record<string, any> = {}
      for (const rcv of savedReceivers) {
        const rtype = (rcv as any).type as string
        keys.add(rtype)
        if (rtype === 'fixed_users') inputs[rtype] = (rcv as any).user_ids || []
        else if (rtype === 'fixed_chats') inputs[rtype] = (rcv as any).chat_ids || []
        else if (rtype === 'employee_field_user') inputs[rtype] = (rcv as any).target_field || ''
        else if (rtype === 'employee_department_manager') inputs[rtype] = (rcv as any).department_field || ''
        else inputs[rtype] = rcv
      }
      checkedReceiverKeys.value = keys
      receiverInputValues.value = inputs
      const msg = cfg.message || {}
      messageFormat.value = msg.message_format || 'markdown'
      titleTemplate.value = msg.title_template || ''
      contentTemplate.value = msg.content_template || '{{trigger_event.event_type}} 事件触发'
      hasCardButton.value = cfg.card_button?.enabled ?? false
      cardButtonText.value = cfg.card_button?.text || '查看详情'
      cardButtonUrl.value = cfg.card_button?.url || ''
      requireCompletion.value = cfg.require_completion ?? false
      // 回填动作名称（兼容旧数据）
      actionName.value = props.editConfig?.name || ''
    } else {
      selectedType.value = 'feishu_send_message'
      currentStep.value = 'select'
      resetConfig()
    }
    fetchOptions()
    nextTick(() => { isVisible.value = true })
  } else {
    closeWizard()
  }
})

function resetConfig() {
  checkedReceiverKeys.value = new Set()
  receiverInputValues.value = {}
  messageFormat.value = 'markdown'
  titleTemplate.value = ''
  contentTemplate.value = '{{trigger_event.event_type}} 事件触发'
  hasCardButton.value = false
  cardButtonText.value = '查看详情'
  cardButtonUrl.value = ''
  requireCompletion.value = false
  // actionName/actionEnabled 不再重置（用默认值）
}

function closeWizard() {
  isClosing.value = true
  setTimeout(() => {
    isVisible.value = false; isClosing.value = false
    emit('update:modelValue', false)
  }, 280)
}

function goToConfigure() {
  if (!selectedType.value) return
  currentStep.value = 'configure'
}

function goBackToSelect() { currentStep.value = 'select' }

function buildReceiversFromForm(): ReceiverRule[] {
  const builtReceivers: ReceiverRule[] = []
  for (const key of checkedReceiverKeys.value) {
    const val = receiverInputValues.value[key]
    if (key === 'fixed_users') builtReceivers.push({ type: 'fixed_users', user_ids: val || [] })
    else if (key === 'fixed_chats') builtReceivers.push({ type: 'fixed_chats', chat_ids: val || [] })
    else if (key === 'employee_field_user') builtReceivers.push({ type: 'employee_field_user', target_field: val || '' })
    else if (key === 'employee_department_manager') builtReceivers.push({ type: 'employee_department_manager', department_field: val || '' })
  }
  return builtReceivers
}

function buildMessageConfig(): MessageConfig {
  return {
    message_format: messageFormat.value,
    title_template: titleTemplate.value,
    content_template: contentTemplate.value,
    resources: [],
  }
}

function buildNotificationConfig() {
  return {
    enabled: true,
    receivers: buildReceiversFromForm(),
    message: buildMessageConfig(),
    require_completion: requireCompletion.value,
    card_button: {
      enabled: hasCardButton.value,
      text: cardButtonText.value || '查看详情',
      url: cardButtonUrl.value || '',
    },
  }
}

async function handleTestSend() {
  testing.value = true
  testResult.value = null
  try {
    let context: Record<string, any> = {}
    if (testContextJson.value.trim()) {
      try {
        context = JSON.parse(testContextJson.value)
      } catch {
        ElMessage.warning('测试上下文 JSON 格式不正确，已忽略')
      }
    }

    const preview = await feishuApi.previewMessage({
      message: buildMessageConfig(),
      context,
    })
    const result = await feishuApi.testSend({
      config: buildNotificationConfig(),
      context,
    })
    testResult.value = {
      ...result,
      preview: {
        rendered_title: preview.rendered_title,
        rendered_content: preview.rendered_content,
        missing_variables: preview.missing_variables || [],
      },
    }
    if (result.ok) {
      ElMessage.success(`测试发送完成：${result.success_count} 成功${result.failed_count > 0 ? `，${result.failed_count} 失败` : ''}`)
    } else {
      ElMessage.error('测试发送失败：' + (result.errors?.[0] || '未知错误'))
    }
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || '未知错误'
    ElMessage.error('测试发送异常：' + detail)
  } finally {
    testing.value = false
  }
}
async function handleConfirm() {
  // ── 动作名称：使用类型标签作默认名称（规则级名称已在首页编辑）────────────────────
  const actionTypeDef = actionTypeDefs.find(d => d.value === selectedType.value)
  const defaultName = actionTypeDef?.label || selectedType.value
  const trimmedName = (actionName.value || "").trim() || defaultName

  // ── 完整校验（动作始终由规则级启用控制，无需动作级开关）────────────────────
  // 从 checkbox 模型构建 receivers 数组
  const builtReceivers: ReceiverRule[] = []
  for (const key of checkedReceiverKeys.value) {
    const val = receiverInputValues.value[key]
    if (key === 'fixed_users') builtReceivers.push({ type: 'fixed_users', user_ids: val || [] })
    else if (key === 'fixed_chats') builtReceivers.push({ type: 'fixed_chats', chat_ids: val || [] })
    else if (key === 'employee_field_user') builtReceivers.push({ type: 'employee_field_user', target_field: val || '' })
    else if (key === 'employee_department_manager') builtReceivers.push({ type: 'employee_department_manager', department_field: val || '' })
  }

  const messageConfig = {
    message_format: messageFormat.value,
    title_template: titleTemplate.value,
    content_template: contentTemplate.value,
    resources: [],
  }

  // 保存前强制走后端 preview 校验（仅飞书消息动作）
  if (selectedType.value === 'feishu_send_message') {
    try {
      const preview = await feishuApi.previewMessage({
        message: messageConfig,
        context: {},
      })
      if (preview.missing_variables && preview.missing_variables.length > 0) {
        const warn = `消息模板包含未知变量：${preview.missing_variables.join(', ')}，请确认变量名是否正确`
        if (!confirm(warn + '\n\n是否仍要保存？')) return
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail || '后端预览接口异常'
      if (!confirm(`消息预览校验失败：${detail}\n\n是否仍要保存？`)) return
    }
  }

  const config: Record<string, any> = {
    receivers: builtReceivers,
    message: messageConfig,
    require_completion: requireCompletion.value,
    card_button: {
      enabled: hasCardButton.value,
      text: cardButtonText.value || '查看详情',
      url: cardButtonUrl.value || '',
    },
  }
  emit('confirm', {
    type: selectedType.value,
    name: trimmedName,
    enabled: true,
    config,
  })
  closeWizard()
}

// ── 步骤指示器 ───────────────────────────────────────
const steps = [
  { key: 'select' as Step, label: '选择动作类型' },
  { key: 'configure' as Step, label: '配置通知详情' },
]
const currentStepIndex = computed(() => steps.findIndex(s => s.key === currentStep.value))
</script>

<template>
  <Teleport to="body">
    <Transition name="wizard-fade">
      <div v-if="isVisible" class="wizard-overlay" :class="{ closing: isClosing }">
        <Transition name="wizard-slide">
          <div v-if="isVisible && !isClosing" class="wizard-panel wide">
            <!-- 顶部栏 -->
            <div class="wizard-header">
              <div class="wizard-header-left">
                <button class="wizard-back-btn" @click="closeWizard">
                  <el-icon :size="20"><Close /></el-icon>
                </button>
                <div class="wizard-title">{{ props.editConfig ? '编辑通知动作' : '添加通知动作' }}</div>
              </div>
              <div class="step-indicator">
                <div v-for="(step, i) in steps" :key="step.key"
                  class="step-dot" :class="{ active: i <= currentStepIndex, current: i === currentStepIndex }">
                  <span v-if="i < currentStepIndex" class="step-check"><el-icon :size="12"><Check /></el-icon></span>
                  <span v-else class="step-num">{{ i + 1 }}</span>
                </div>
                <div v-for="i in steps.length - 1" :key="'line-' + i"
                  class="step-line" :class="{ filled: i <= currentStepIndex }"></div>
              </div>
            </div>

            <!-- ── 第1步：选择动作类型 ─────────────────────── -->
            <div v-if="currentStep === 'select'" class="wizard-body">
              <p class="wizard-desc">选择通知的发送方式</p>
              <div class="action-type-grid">
                <button v-for="def in actionTypeDefs" :key="def.value"
                  class="action-type-card" :class="{ active: selectedType === def.value }"
                  @click="selectedType = def.value; goToConfigure()">
                  <div class="atc-icon" :class="{ highlight: selectedType === def.value }">
                    <el-icon :size="28"><component :is="def.icon" /></el-icon>
                  </div>
                  <div class="atc-body">
                    <div class="atc-title">{{ def.label }}</div>
                    <div class="atc-desc">{{ def.desc }}</div>
                  </div>
                  <div v-if="selectedType === def.value" class="atc-check">
                    <el-icon :size="14"><Check /></el-icon>
                  </div>
                </button>
              </div>
            </div>

            <!-- ── 第2步：配置通知详情 ─────────────────────── -->
            <div v-if="currentStep === 'configure'" class="wizard-body config-body">
              <!-- 双栏：手机预览 + 表单 -->
              <div class="config-dual-layout">
                <!-- 左侧手机预览 -->
                <div class="preview-col">
                  <div class="preview-sticky">
                    <div class="preview-label">实时预览</div>
                    <div class="phone-frame">
                      <div class="phone-topbar"><div class="phone-time">9:41</div></div>
                      <div class="phone-content">
                        <div class="phone-msg">
                          <div class="phone-msg-icon"><el-icon :size="18"><Bell /></el-icon></div>
                          <div class="phone-msg-title">{{ titleTemplate || '通知标题' }}</div>
                          <div class="phone-msg-body" style="white-space:pre-wrap">{{ contentPreview }}</div>
                          <div v-if="hasCardButton" class="phone-card-btn">
                            {{ cardButtonText || '查看详情' }}
                            <el-icon :size="12"><ArrowDown /></el-icon>
                          </div>
                          <div v-if="requireCompletion" class="phone-completion-btn">
                            ✅ 标记完成
                          </div>
                          <div class="phone-msg-time">刚刚</div>
                        </div>
                      </div>
                      <div class="phone-bottombar">
                        <div class="phone-nav-item active">消息</div><div class="phone-nav-item">通讯录</div><div class="phone-nav-item">工作台</div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 右侧配置表单 -->
                <div class="form-col">
                  <!-- 发送对象（checkbox 多选 + 展开输入） -->
                  <div class="wiz-section">
                    <h4 class="wiz-section-title">选择发送对象 <span class="required-star">*</span></h4>
                    <p class="section-desc">消息预览图仅为示意，消息内容以实际发送为准</p>

                    <!-- 候选列表：每个选项下方可直接展开输入 -->
                    <div class="receiver-check-list">
                      <div
                        v-for="opt in receiverCheckOptions"
                        :key="opt.key"
                        class="receiver-check-row"
                        :class="{ expanded: checkedReceiverKeys.has(opt.key) }"
                      >
                        <!-- checkbox 行 -->
                        <label
                          class="receiver-check-item"
                          :class="{ checked: checkedReceiverKeys.has(opt.key) }"
                        >
                          <span class="check-box" :class="{ checked: checkedReceiverKeys.has(opt.key) }">
                            <svg v-if="checkedReceiverKeys.has(opt.key)" class="check-icon" viewBox="0 0 12 12" width="10" height="10">
                              <path d="M2 6l3 3 5-5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </span>
                          <span class="check-label">{{ opt.label }}</span>
                          <el-tooltip v-if="opt.desc" :content="opt.desc" placement="top">
                            <el-icon class="check-info"><i style="font-style:normal">&#9432;</i></el-icon>
                          </el-tooltip>
                          <input
                            type="checkbox"
                            :checked="checkedReceiverKeys.has(opt.key)"
                            @change="toggleReceiverKey(opt.key)"
                            class="check-input"
                          />
                        </label>

                        <!-- 展开的输入区域：直接在该选项下方 -->
                        <div
                          v-if="checkedReceiverKeys.has(opt.key)"
                          class="receiver-field-inline"
                        >
                          <!-- 用户多选 -->
                          <el-select
                            v-if="opt.inputType === 'users'"
                            :model-value="receiverInputValues[opt.key] || []"
                            @update:model-value="(val: number[]) => updateReceiverValue(opt.key, val)"
                            multiple filterable
                            :placeholder="opt.placeholder"
                            :loading="dataLoading"
                            style="width: 100%"
                          >
                            <el-option v-for="o in userOptions" :key="o.value" :label="o.label" :value="o.value" />
                          </el-select>

                          <!-- 群多选 -->
                          <el-select
                            v-else-if="opt.inputType === 'chats'"
                            :model-value="receiverInputValues[opt.key] || []"
                            @update:model-value="(val: string[]) => updateReceiverValue(opt.key, val)"
                            multiple filterable
                            :placeholder="opt.placeholder"
                            :loading="dataLoading"
                            style="width: 100%"
                          >
                            <el-option v-for="o in chatOptions" :key="o.value" :label="o.label" :value="o.value" />
                          </el-select>

                          <!-- 文本输入 -->
                          <el-input
                            v-else
                            :model-value="receiverInputValues[opt.key] || ''"
                            @update:model-value="(val: string) => updateReceiverValue(opt.key, val)"
                            :placeholder="opt.placeholder"
                            size="default"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 消息标题 -->
                  <div class="wiz-section">
                    <h4 class="wiz-section-title">消息标题</h4>
                    <el-input v-model="titleTemplate" placeholder="如：{{rule.name}} — 通知" size="small" />
                  </div>

                  <!-- 消息内容 -->
                  <div class="wiz-section">
                    <div class="wiz-section-header">
                      <h4 class="wiz-section-title">消息内容</h4>
                      <el-dropdown trigger="click">
                        <el-button size="small" plain>插入变量 <el-icon><ArrowDown /></el-icon></el-button>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item v-for="v in availableVariables" :key="v.name" @click="insertVariable(v.name)">
                              <code>{{ v.name }}</code>
                              <span style="margin-left:8px;color:#999;font-size:11px">{{ v.desc }}</span>
                            </el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </div>
                    <!-- 富文本工具栏 -->
                    <div class="richtext-toolbar">
                      <button class="tb-btn" title="加粗" @click="toolbarBold"><b>B</b></button>
                      <button class="tb-btn" title="斜体" @click="toolbarItalic"><i>I</i></button>
                      <button class="tb-btn" title="行内代码" @click="toolbarCode">&lt;/&gt;</button>
                      <span class="tb-divider"></span>
                      <button class="tb-btn" title="链接" @click="toolbarLink">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      </button>
                      <button class="tb-btn" title="分割线" @click="toolbarHr">—</button>
                      <button class="tb-btn" title="无序列表" @click="toolbarBullet">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/></svg>
                      </button>
                      <span class="tb-divider"></span>
                      <button class="tb-btn" title="提及人员（@）" @click="openMentionDropdown"><b>@</b></button>
                      <span class="tb-divider"></span>
                      <div class="format-switch">
                        <button class="fmt-btn" :class="{ active: messageFormat === 'text' }" @click="messageFormat = 'text'">纯文本</button>
                        <button class="fmt-btn" :class="{ active: messageFormat === 'markdown' }" @click="messageFormat = 'markdown'">Markdown</button>
                      </div>
                    </div>
                    <textarea ref="textareaRef" :value="contentTemplate"
                      @input="handleContentInput"
                      class="richtext-area" :class="{ 'mode-markdown': messageFormat === 'markdown' }"
                      placeholder="输入消息内容，支持 Markdown 格式。输入 @ 可提及人员..." rows="6"></textarea>
                    <!-- @ 人员下拉 -->
                    <div v-if="showMentionDropdown" class="mention-dropdown">
                      <div class="mention-search">
                        <input
                          ref="mentionSearchInputRef"
                          v-model="mentionSearch"
                          placeholder="搜索人员..."
                          class="mention-search-input"
                          @input="filterMentionOptions"
                        />
                      </div>
                      <div class="mention-options">
                        <div
                          v-for="opt in mentionFilterOptions"
                          :key="opt.value"
                          class="mention-option"
                          @click="selectMention(opt.value, opt.label)"
                        >
                          <div class="mention-avatar">{{ opt.label.charAt(0) }}</div>
                          <span class="mention-name">{{ opt.label }}</span>
                        </div>
                        <div v-if="mentionFilterOptions.length === 0" class="mention-empty">
                          未找到匹配人员
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 卡片按钮 -->
                  <div class="wiz-section">
                    <div class="toggle-row">
                      <div class="toggle-info">
                        <div class="toggle-title">卡片按钮</div>
                        <div class="toggle-desc">用户点击按钮，可跳转至指定页面</div>
                      </div>
                      <el-switch v-model="hasCardButton" size="small" />
                    </div>
                    <template v-if="hasCardButton">
                      <div style="margin-top:10px">
                        <label class="field-label required" style="display:block;font-size:13px;font-weight:500;color:#333;margin-bottom:6px">按钮文案</label>
                        <el-input v-model="cardButtonText" placeholder="查看详情" maxlength="20" show-word-limit size="small" />
                      </div>
                      <div style="margin-top:10px">
                        <label class="field-label required" style="display:block;font-size:13px;font-weight:500;color:#333;margin-bottom:6px">跳转至</label>
                        <el-input v-model="cardButtonUrl" placeholder="输入跳转链接" size="small">
                          <template #prefix>
                            <svg style="width:14px;height:14px;color:#999;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                          </template>
                        </el-input>
                      </div>
                    </template>
                  </div>

                  <!-- 标记完成 -->
                  <div class="wiz-section">
                    <div class="toggle-row">
                      <div class="toggle-info">
                        <div class="toggle-title">标记完成</div>
                        <div class="toggle-desc">消息附带「标记完成」按钮，已完成的人下次自动过滤</div>
                      </div>
                      <el-switch v-model="requireCompletion" size="small" />
                    </div>
                  </div>
                  <!-- 测试发送 -->
                  <div class="wiz-section test-send-section">
                    <div class="wiz-section-header">
                      <h4 class="wiz-section-title">测试发送</h4>
                      <span class="test-desc">保存前用真实配置发送一条测试消息</span>
                    </div>
                    <el-input
                      v-model="testContextJson"
                      type="textarea"
                      :rows="3"
                      placeholder='可选测试上下文 JSON，如：{"employee_name":"张三","report_name":"月度报表"}'
                      size="small"
                      style="margin-bottom:8px"
                    />
                    <el-button type="primary" plain size="small" :loading="testing" @click="handleTestSend">
                      发送测试消息
                    </el-button>
                    <div v-if="testResult" class="test-result" :class="testResult.ok ? 'result-ok' : 'result-err'">
                      <div v-if="testResult.ok">✅ 发送成功：{{ testResult.success_count }} 成功，{{ testResult.failed_count }} 失败</div>
                      <div v-else>❌ 发送失败</div>
                      <div v-if="testResult.preview" class="test-preview">
                        <div class="test-preview-title">{{ testResult.preview.rendered_title }}</div>
                        <div class="test-preview-content">{{ testResult.preview.rendered_content }}</div>
                        <div v-if="testResult.preview.missing_variables?.length" class="test-preview-warn">
                          ⚠️ 未知变量：{{ testResult.preview.missing_variables.join(', ') }}
                        </div>
                      </div>
                      <div v-if="testResult.errors?.length" class="test-errors">
                        <div v-for="err in testResult.errors" :key="err">{{ err }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 底部操作栏 -->
            <div class="wizard-footer">
              <template v-if="currentStep === 'select'">
                <div></div>
                <el-button type="primary" :disabled="!selectedType" @click="goToConfigure">
                  下一步 <el-icon class="btn-icon-right"><ArrowRight /></el-icon>
                </el-button>
              </template>
              <template v-if="currentStep === 'configure'">
                <el-button :icon="ArrowLeft" @click="goBackToSelect">上一步</el-button>
                <el-button type="primary" :icon="Check" @click="handleConfirm">
                  {{ props.editConfig ? '保存修改' : '确认添加' }}
                </el-button>
              </template>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════
   (复用 TriggerWizard 的遮罩/动画/步骤指示器样式)
═══════════════════════════════════════════════════════════ */
.wizard-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.45); display: flex; justify-content: flex-end;
  backdrop-filter: blur(2px);
}
.wizard-panel {
  width: 620px; max-width: 100vw; height: 100vh;
  background: var(--color-bg-page, #f5f7fa);
  display: flex; flex-direction: column;
  box-shadow: -8px 0 40px rgba(0,0,0,0.12);
}
.wizard-panel.wide { width: 960px; }

.wizard-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 24px; background: var(--color-bg-card, #fff);
  border-bottom: 1px solid var(--color-border, #e4e7ed); flex-shrink: 0;
}
.wizard-header-left { display: flex; align-items: center; gap: 12px; }
.wizard-back-btn {
  width: 32px; height: 32px; border: none; border-radius: 8px;
  background: var(--color-bg-subtle, #f0f2f5);
  color: var(--color-text-secondary, #909399);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
}
.wizard-back-btn:hover { background: var(--color-primary-light, #ecf5ff); color: var(--color-primary, #409eff); }
.wizard-title { font-size: 16px; font-weight: 600; color: var(--color-text-primary, #303133); }

.step-indicator { display: flex; align-items: center; gap: 0; }
.step-dot {
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid var(--color-border, #dcdfe6);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all 0.25s ease; z-index: 1;
}
.step-dot.active { border-color: var(--color-primary, #409eff); background: var(--color-primary, #409eff); }
.step-dot.current { border-color: var(--color-primary, #409eff); background: var(--color-bg-card, #fff); box-shadow: 0 0 0 3px rgba(64,158,255,0.15); }
.step-num { font-size: 11px; font-weight: 600; color: var(--color-text-placeholder, #c0c4cc); }
.step-dot.active .step-num { color: #fff; }
.step-dot.current .step-num { color: var(--color-primary, #409eff); }
.step-check { color: #fff; display: flex; }
.step-line { width: 40px; height: 2px; background: var(--color-border, #dcdfe6); transition: background 0.3s ease; margin: 0 -2px; }
.step-line.filled { background: var(--color-primary, #409eff); }

/* ── 内容区 ──────────────────────────────────────────── */
.wizard-body { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 20px; }
.wizard-body.config-body { padding: 0; gap: 0; }
.wizard-desc { font-size: 13px; color: var(--color-text-secondary, #909399); margin: 0 0 4px; }

/* ═══════════════════════════════════════════════════════════
   第1步：动作类型卡片
═══════════════════════════════════════════════════════════ */
.action-type-grid { display: flex; flex-direction: column; gap: 8px; }
.action-type-card {
  display: flex; align-items: center; gap: 16px;
  padding: 18px 20px; border: 1.5px solid var(--color-border, #e4e7ed);
  border-radius: 12px; background: var(--color-bg-card, #fff);
  cursor: pointer; transition: all 0.2s ease;
  text-align: left; width: 100%; font: inherit; color: inherit;
}
.action-type-card:hover { border-color: var(--color-primary-light, #a0cfff); box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.action-type-card.active { border-color: var(--color-primary, #409eff); background: var(--color-primary-subtle, #ecf5ff); }
.atc-icon {
  flex-shrink: 0; width: 52px; height: 52px; border-radius: 12px;
  background: var(--color-bg-subtle, #f0f2f5);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-secondary, #909399);
  transition: all 0.2s ease;
}
.atc-icon.highlight { background: var(--color-primary, #409eff); color: #fff; }
.atc-body { flex: 1; min-width: 0; }
.atc-title { font-size: 15px; font-weight: 600; color: var(--color-text-primary, #303133); margin-bottom: 3px; }
.atc-desc { font-size: 12px; color: var(--color-text-placeholder, #c0c4cc); line-height: 1.4; }
.atc-check {
  flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%;
  background: var(--color-primary, #409eff); color: #fff;
  display: flex; align-items: center; justify-content: center;
}

/* ═══════════════════════════════════════════════════════════
   第2步：双栏配置
═══════════════════════════════════════════════════════════ */
.config-dual-layout {
  display: flex; gap: 0; height: 100%;
}
.preview-col {
  width: 340px; flex-shrink: 0;
  background: var(--color-bg-subtle, #f0f2f5);
  padding: 24px 20px; border-right: 1px solid var(--color-border, #e4e7ed);
  display: flex; align-items: flex-start; justify-content: center;
}
.preview-sticky { position: sticky; top: 24px; }
.preview-label { font-size: 11px; color: var(--color-text-placeholder, #c0c4cc); text-align: center; margin-bottom: 12px; letter-spacing: 0.5px; }
.form-col {
  flex: 1; min-width: 0; padding: 24px;
  overflow-y: auto; display: flex; flex-direction: column; gap: 16px;
}

/* ── 手机预览（仿真手机框） ───────────────────────── */
.phone-frame {
  width: 300px;
  height: 580px;
  border: 3px solid #1a1a1a; border-radius: 36px;
  overflow: hidden; background: #f5f5f5;
  box-shadow:
    0 0 0 2px #333,
    0 20px 60px rgba(0,0,0,0.22),
    inset 0 0 0 1px rgba(255,255,255,0.05);
  position: relative;
  display: flex; flex-direction: column;
}
/* 刘海 */
.phone-frame::before {
  content: '';
  position: absolute;
  top: 10px; left: 50%; transform: translateX(-50%);
  width: 100px; height: 26px;
  background: #1a1a1a;
  border-radius: 14px;
  z-index: 2;
}
/* 侧边按键 */
.phone-frame::after {
  content: '';
  position: absolute;
  right: -5px; top: 100px;
  width: 4px; height: 40px;
  background: #ccc; border-radius: 0 3px 3px 0;
  z-index: 3;
}
.phone-topbar {
  padding: 42px 16px 10px; background: #fff; text-align: center;
  position: relative; flex-shrink: 0;
}
.phone-time { font-size: 14px; font-weight: 700; color: #1a1a1a; }
.phone-content {
  flex: 1; padding: 14px 10px; background: #f5f5f5;
  overflow-y: auto;
}
.phone-msg {
  background: #fff; border-radius: 14px; padding: 14px 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
}
.phone-msg-icon {
  width: 34px; height: 34px; border-radius: 9px;
  background: #ecf5ff; color: var(--color-primary, #409eff);
  display: flex; align-items: center; justify-content: center; margin-bottom: 8px;
}
.phone-msg-title { font-size: 14px; font-weight: 600; color: #1a1a1a; margin-bottom: 6px; }
.phone-msg-body { font-size: 12px; color: #555; line-height: 1.65; }
.phone-card-btn {
  margin-top: 8px; padding: 7px 14px; background: var(--color-primary, #409eff);
  color: #fff; border-radius: 6px; font-size: 12px; text-align: center;
  display: flex; align-items: center; justify-content: center; gap: 4px;
}
.phone-completion-btn {
  margin-top: 8px;
  padding: 6px 12px;
  background: #f0f9eb;
  color: #67c23a;
  border-radius: 4px;
  font-size: 11px;
  text-align: center;
  border: 1px solid #e1f3d8;
}
.phone-msg-time { font-size: 11px; color: #aaa; margin-top: 8px; text-align: right; }
.phone-bottombar {
  display: flex; justify-content: space-around; padding: 8px 16px 10px;
  background: #fff; border-top: 1px solid #eee;
}
.phone-nav-item { font-size: 10px; color: #999; }
.phone-nav-item.active { color: var(--color-primary, #409eff); font-weight: 600; }

/* ── 表单区块 ───────────────────────────────────────── */
.wiz-section {
  padding: 16px; border: 1px solid var(--color-border, #e4e7ed);
  border-radius: 10px; background: var(--color-bg-card, #fff);
}
.wiz-section-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;
}
.wiz-section-title {
  font-size: 13px; font-weight: 600; color: var(--color-text-primary, #303133); margin: 0;
}
.wiz-section-empty {
  font-size: 12px; color: var(--color-text-placeholder, #c0c4cc);
  padding: 18px; text-align: center; border: 1px dashed var(--color-border, #e4e7ed);
  border-radius: 8px; background: var(--color-bg-subtle, #f0f2f5);
}

/* ── 发送对象（checkbox 多选模式） ─────────────────── */
.section-desc {
  font-size: 11px; color: var(--text-text-placeholder, #c0c4cc);
  margin: 0 0 12px; line-height: 1.4;
}
.required-star { color: var(--color-danger, #f56c6c); }

/* 候选 checkbox 列表 */
.receiver-check-list {
  display: flex; flex-direction: column; gap: 6px;
}
.receiver-check-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  border: 1.5px solid var(--color-border, #e4e7ed);
  border-radius: 10px;
  background: var(--color-bg-card, #fff);
  cursor: pointer; transition: all 0.18s ease;
  user-select: none;
  position: relative;
}
.receiver-check-item:hover {
  border-color: var(--color-primary-light, #a0cfff);
  background: var(--color-primary-subtle-faint, #f5f9ff);
}
.receiver-check-item.checked {
  border-color: var(--color-primary, #409eff);
  background: var(--color-primary-subtle, #ecf5ff);
}

/* 自定义 checkbox */
.check-box {
  width: 18px; height: 18px; min-width: 18px;
  border: 2px solid var(--color-border, #dcdfe6);
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
  background: #fff;
}
.check-box.checked {
  background: var(--color-primary, #409eff);
  border-color: var(--color-primary, #409eff);
}
.check-icon { display: block; }
.check-label {
  font-size: 13px; font-weight: 500;
  color: var(--color-text-primary, #303133);
}
.receiver-check-item.checked .check-label {
  color: var(--color-primary, #409eff);
  font-weight: 600;
}
.check-info {
  font-size: 13px; color: var(--color-text-placeholder, #c0c4cc); margin-left: auto;
  cursor: help;
}
.check-input {
  position: absolute; opacity: 0; pointer-events: none;
}

/* 展开的输入区域：蓝色左边框 + 滑入动画（参考图4） */
.receiver-field-inline {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 14px 14px 29px;
  margin-left: 14px;
  border-left: 3px solid var(--color-primary, #409eff);
  border-radius: 0 0 0 4px;
  background: var(--color-bg-card, #fff);
  animation: fieldSlideIn 0.2s ease;
}
@keyframes fieldSlideIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── 富文本工具栏 ───────────────────────────────────── */
.richtext-toolbar {
  display: flex; align-items: center; gap: 4px; padding: 7px 10px;
  border: 1px solid var(--color-border, #e4e7ed); border-bottom: none;
  border-radius: 6px 6px 0 0; background: var(--color-bg-subtle, #f0f2f5);
}
.tb-btn {
  width: 28px; height: 26px; border: 1px solid transparent; border-radius: 4px;
  background: none; color: var(--color-text-secondary, #909399);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 12px; transition: all 0.15s ease;
}
.tb-btn:hover { background: var(--color-bg-card, #fff); border-color: var(--color-border, #e4e7ed); color: var(--color-text-primary, #303133); }
.tb-divider { width: 1px; height: 16px; background: var(--color-border, #e4e7ed); margin: 0 3px; }

/* ── @ 提及下拉 ───────────────────────────────────── */
.mention-dropdown {
  position: relative;
  border: 1px solid var(--color-border, #e4e7ed);
  border-radius: 8px;
  background: var(--color-bg-card, #fff);
  box-shadow: 0 4px 16px rgba(0,0,0,0.10);
  margin-top: 6px;
  max-height: 220px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.mention-search { padding: 6px 8px; border-bottom: 1px solid var(--color-border, #e4e7ed); }
.mention-search-input {
  width: 100%; padding: 5px 8px; border: 1px solid var(--color-border, #e4e7ed);
  border-radius: 4px; font-size: 12px; outline: none;
}
.mention-search-input:focus { border-color: var(--color-primary, #409eff); }
.mention-options { flex: 1; overflow-y: auto; padding: 4px 0; }
.mention-option {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; cursor: pointer; transition: background 0.1s ease;
}
.mention-option:hover { background: var(--color-bg-subtle, #f0f2f5); }
.mention-avatar {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--color-primary-subtle, #ecf5ff); color: var(--color-primary, #409eff);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; flex-shrink: 0;
}
.mention-name { font-size: 12px; color: var(--color-text-primary, #303133); }
.mention-empty { padding: 12px; text-align: center; font-size: 12px; color: var(--color-text-placeholder, #c0c4cc); }

/* ── 格式切换 ─────────────────────────────────── */
.format-switch { display: flex; margin-left: auto; border: 1px solid var(--color-border, #e4e7ed); border-radius: 4px; overflow: hidden; }
.fmt-btn {
  padding: 2px 8px; font-size: 10px; border: none; background: none;
  color: var(--color-text-placeholder, #c0c4cc); cursor: pointer; transition: all 0.15s ease;
}
.fmt-btn.active { background: var(--color-primary, #409eff); color: #fff; }
.richtext-area {
  width: 100%; padding: 10px; border: 1px solid var(--color-border, #e4e7ed);
  border-top: none; border-radius: 0 0 6px 6px; background: var(--color-bg-card, #fff);
  color: var(--color-text-primary, #303133); font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px; line-height: 1.7; resize: vertical; outline: none;
  transition: border-color 0.2s ease;
}
.richtext-area:focus { border-color: var(--color-primary, #409eff); box-shadow: 0 0 0 1px var(--color-primary-light, #a0cfff); }
.richtext-area::placeholder { color: var(--color-text-placeholder, #c0c4cc); }

/* ── 开关行 ─────────────────────────────────────────── */
.toggle-row { display: flex; justify-content: space-between; align-items: center; }
.toggle-info { flex: 1; min-width: 0; }
.toggle-title { font-size: 13px; font-weight: 500; color: var(--color-text-primary, #303133); }
.toggle-desc { font-size: 11px; color: var(--color-text-placeholder, #c0c4cc); margin-top: 2px; }
.draft-hint { font-size: 12px; color: #e6a23c; margin-top: 6px; padding: 6px 8px; background: #fdf6ec; border-radius: 4px; border: 1px solid #faecd8; }

/* ═══════════════════════════════════════════════════════════
   底部 / 动画
═══════════════════════════════════════════════════════════ */
.wizard-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 24px; background: var(--color-bg-card, #fff);
  border-top: 1px solid var(--color-border, #e4e7ed); flex-shrink: 0;
}
.btn-icon-right { margin-left: 4px; }

.wizard-fade-enter-active, .wizard-fade-leave-active { transition: opacity 0.28s ease; }
.wizard-fade-enter-from, .wizard-fade-leave-to { opacity: 0; }
.wizard-slide-enter-active { transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1); }
.wizard-slide-leave-active { transition: transform 0.25s cubic-bezier(0.4, 0, 1, 1); }
.wizard-slide-enter-from { transform: translateX(100%); }
.wizard-slide-leave-to { transform: translateX(100%); }
.test-send-section {
  background: #f8fafc;
  border: 1px dashed #c7d2fe;
  border-radius: 12px;
  padding: 14px;
}
.test-desc {
  font-size: 12px;
  color: #64748b;
}
.test-result {
  margin-top: 10px;
  padding: 10px;
  border-radius: 8px;
  font-size: 13px;
}
.result-ok {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}
.result-err {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
.test-preview {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(0,0,0,.08);
}
.test-preview-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.test-preview-content {
  white-space: pre-wrap;
}
.test-preview-warn,
.test-errors {
  margin-top: 6px;
  color: #b45309;
}
</style>
