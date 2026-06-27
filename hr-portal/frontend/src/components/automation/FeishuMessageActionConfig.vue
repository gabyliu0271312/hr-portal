<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  View, Promotion, User, ChatDotRound, Connection, Management,
  Bell, Plus, Delete, Iphone, MoreFilled, ArrowDown
} from '@element-plus/icons-vue'
import type { ReceiverRule, MessageConfig, FeishuChatTarget, NotificationConfig, CardButtonConfig } from '@/api/feishu'
import { feishuApi } from '@/api/feishu'
import { usersApi, type UserListItem } from '@/api/users'

interface Props {
  config: Record<string, any>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:config': [value: Record<string, any>]
}>()

// ===== 下拉框数据源 =====
interface SelectOption {
  label: string
  value: number | string
}
const userOptions = ref<SelectOption[]>([])
const chatOptions = ref<SelectOption[]>([])
const dataLoading = ref(false)

// @ 提及专用用户列表（含 feishu_user_id）
interface MentionUserOption {
  id: number
  label: string
  feishu_user_id: string | null
}
const mentionUserOptions = ref<MentionUserOption[]>([])

async function fetchUserOptions() {
  try {
    const resp = await usersApi.list({ page_size: 100 })
    const items = resp.items || []
    userOptions.value = items.map((u: any) => ({
      label: `${u.display_name || u.login_name}`,
      value: u.id,
    }))
    // @ 提及专用列表（含 feishu_user_id）
    mentionUserOptions.value = items.map((u: any) => ({
      id: u.id,
      label: `${u.display_name || u.login_name}`,
      feishu_user_id: u.feishu_user_id || null,
    }))
  } catch (e) {
    console.warn('[FeishuConfig] 获取用户列表失败', e)
  }
}

async function fetchChatOptions() {
  try {
    const targets: FeishuChatTarget[] = await feishuApi.listChatTargets()
    chatOptions.value = targets.map((t) => ({
      label: `${t.name} (${t.chat_id})`,
      value: t.chat_id,
    }))
  } catch (e) {
    console.warn('[FeishuConfig] 获取群列表失败', e)
  }
}

onMounted(async () => {
  dataLoading.value = true
  await Promise.all([fetchUserOptions(), fetchChatOptions()])
  dataLoading.value = false
})

// ===== 接收人列表 =====
const receivers = computed<ReceiverRule[]>({
  get: () => props.config.receivers || [],
  set: (val) => emit('update:config', { ...props.config, receivers: val }),
})

// ===== 消息配置 =====
const message = computed<MessageConfig>({
  get: () =>
    props.config.message || {
      message_format: 'markdown',
      title_template: '',
      content_template: '',
      resources: [],
    },
  set: (val) => emit('update:config', { ...props.config, message: val }),
})

const titleTemplate = computed({
  get: () => message.value.title_template,
  set: (val: string) =>
    emit('update:config', { ...props.config, message: { ...message.value, title_template: val } }),
})

const contentTemplate = computed({
  get: () => message.value.content_template,
  set: (val: string) =>
    emit('update:config', { ...props.config, message: { ...message.value, content_template: val } }),
})

const messageFormat = computed({
  get: () => message.value.message_format || 'markdown',
  set: (val: 'text' | 'markdown') =>
    emit('update:config', { ...props.config, message: { ...message.value, message_format: val } }),
})

const requireCompletion = computed<boolean>({
  get: () => props.config.require_completion ?? false,
  set: (val) => emit('update:config', { ...props.config, require_completion: val }),
})

// ===== 卡片跳转按钮 =====
const cardButtonEnabled = computed<boolean>({
  get: () => props.config.card_button?.enabled ?? false,
  set: (val) => {
    const cb = { ...(props.config.card_button || {}), enabled: val }
    emit('update:config', { ...props.config, card_button: cb })
  },
})
const cardButtonText = computed<string>({
  get: () => props.config.card_button?.text || '查看详情',
  set: (val) => {
    const cb = { ...(props.config.card_button || {}), text: val }
    emit('update:config', { ...props.config, card_button: cb })
  },
})
const cardButtonUrl = computed<string>({
  get: () => props.config.card_button?.url || '',
  set: (val) => {
    const cb = { ...(props.config.card_button || {}), url: val }
    emit('update:config', { ...props.config, card_button: cb })
  },
})

// ===== 富文本编辑状态 =====
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const contentPreview = ref('')
const showPreviewDialog = ref(false)
const previewLoading = ref(false)

// ===== @ 提及功能 =====
const showMentionDropdown = ref(false)
const mentionSearch = ref('')
const mentionFilterOptions = ref<SelectOption[]>([])
const mentionDropdownStyle = ref<Record<string, string>>({})
const mentionSearchInputRef = ref<HTMLInputElement | null>(null)

// 监听 @ 输入，定位下拉框
function handleContentInput(e: Event) {
  const el = textareaRef.value
  if (!el) return
  const text = (e.target as HTMLTextAreaElement).value
  contentTemplate.value = text

  // 检测是否刚输入了 @
  const cursorPos = el.selectionStart
  const textBeforeCursor = text.slice(0, cursorPos)
  const lastChar = textBeforeCursor[textBeforeCursor.length - 1]

  if (lastChar === '@') {
    // 显示 @ 下拉框
    openMentionDropdown(cursorPos)
  } else {
    // 如果下拉框已显示，过滤选项
    if (showMentionDropdown.value) {
      const atIndex = textBeforeCursor.lastIndexOf('@')
      if (atIndex >= 0) {
        const query = textBeforeCursor.slice(atIndex + 1)
        mentionSearch.value = query
        filterMentionOptions(query)
      } else {
        showMentionDropdown.value = false
      }
    }
  }
}

function openMentionDropdown(cursorPos: number) {
  showMentionDropdown.value = true
  mentionSearch.value = ''
  // 初始只显示已绑定飞书的用户
  mentionFilterOptions.value = mentionUserOptions.value
    .filter(u => u.feishu_user_id)
    .map(u => ({ label: u.label, value: u.feishu_user_id! }))
  nextTick(() => {
    if (mentionSearchInputRef.value) {
      mentionSearchInputRef.value.focus()
    }
  })
}

function filterMentionOptions(query: string) {
  if (!query) {
    mentionFilterOptions.value = mentionUserOptions.value
      .filter(u => u.feishu_user_id)  // 只显示已绑定飞书的用户
      .map(u => ({ label: u.label, value: u.feishu_user_id! }))
  } else {
    const q = query.toLowerCase()
    mentionFilterOptions.value = mentionUserOptions.value
      .filter(u => u.feishu_user_id && u.label.toLowerCase().includes(q))
      .map(u => ({ label: u.label, value: u.feishu_user_id! }))
  }
}

function selectMention(user: MentionUserOption) {
  if (!user.feishu_user_id) {
    ElMessage.warning('该用户未绑定飞书，无法 @ 提及')
    return
  }
  const el = textareaRef.value
  if (!el) return
  const cursorPos = el.selectionStart
  const text = contentTemplate.value
  const textBeforeCursor = text.slice(0, cursorPos)
  const atIndex = textBeforeCursor.lastIndexOf('@')
  if (atIndex >= 0) {
    const before = text.slice(0, atIndex)
    const after = text.slice(cursorPos)
    const newText = `${before}<at user_id="${user.feishu_user_id}">@${user.label}</at>${after}`
    contentTemplate.value = newText
    showMentionDropdown.value = false
    nextTick(() => {
      el.focus()
      const newPos = atIndex + `<at user_id="${user.feishu_user_id}">@${user.label}</at>`.length
      el.selectionStart = newPos
      el.selectionEnd = newPos
    })
  }
}

// 变量列表
const availableVariables = [
  { name: 'trigger_event.event_type', desc: '触发事件类型' },
  { name: 'trigger_event.timestamp', desc: '触发时间' },
  { name: 'trigger_event.biz_id', desc: '业务 ID' },
  { name: 'trigger_event.biz_name', desc: '业务名称' },
  { name: 'rule.name', desc: '规则名称' },
]

const showVariables = ref(false)

// ===== 富文本工具栏操作 =====
function wrapSelection(wrapper: [string, string]) {
  const el = textareaRef.value
  if (!el) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const text = contentTemplate.value
  const selected = text.slice(start, end)
  const newText = text.slice(0, start) + wrapper[0] + selected + wrapper[1] + text.slice(end)
  contentTemplate.value = newText
  nextTick(() => {
    el.focus()
    el.selectionStart = start + wrapper[0].length
    el.selectionEnd = start + wrapper[0].length + (selected.length || 0)
  })
}

import { nextTick } from 'vue'

function toolbarBold() { wrapSelection(['**', '**']) }
function toolbarItalic() { wrapSelection(['*', '*']) }
function toolbarCode() { wrapSelection(['`', '`']) }
function toolbarLink() {
  const url = prompt('输入链接地址：', 'https://')
  if (url) wrapSelection(['[', `](${url})`])
}
function toolbarHr() {
  contentTemplate.value = contentTemplate.value + '\n\n---\n'
}
function toolbarBullet() {
  const el = textareaRef.value
  if (!el) {
    contentTemplate.value = contentTemplate.value + '- '
    return
  }
  const lines = contentTemplate.value.split('\n')
  const cursorLine = contentTemplate.value.slice(0, el.selectionStart).split('\n').length - 1
  lines[cursorLine] = '- ' + lines[cursorLine]
  contentTemplate.value = lines.join('\n')
}

function insertVariable(variable: string) {
  const el = textareaRef.value
  if (el) {
    const start = el.selectionStart
    const text = contentTemplate.value
    contentTemplate.value = text.slice(0, start) + `{{${variable}}}` + text.slice(start)
    nextTick(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + variable.length + 4
    })
  } else {
    contentTemplate.value = contentTemplate.value + `{{${variable}}}`
  }
  showVariables.value = false
}

// 预览（手机样式）
function openPreview() {
  previewLoading.value = true
  try {
    let preview = contentTemplate.value || '（空消息）'
    availableVariables.forEach((v) => {
      preview = preview.replaceAll(`{{${v.name}}}`, `[${v.desc}]`)
    })
    contentPreview.value = preview
    showPreviewDialog.value = true
  } finally {
    previewLoading.value = false
  }
}

// 渲染预览内容（支持 @ 高亮）
function renderPreviewContent(content: string): string {
  let html = content
  // 变量高亮
  availableVariables.forEach((v) => {
    html = html.replaceAll(
      `{{${v.name}}}`,
      `<span class="preview-var">[${v.desc}]</span>`
    )
  })
  // @ 提及高亮
  html = html.replace(
    /<at\s+user_id=".+?">(.+?)<\/at>/g,
    '<span class="preview-mention">$1</span>'
  )
  // 简单 markdown
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^-\s/gm, '• ')
    .replace(/^#{1,6}\s/gm, '')
    .replace(/\n/g, '<br>')
  return html
}

// ===== 接收人操作 =====
const receiverTypeOptions = [
  { value: 'fixed_users', label: '指定用户', desc: '选择系统中已有用户', icon: User },
  { value: 'fixed_chats', label: '指定群', desc: '选择飞书群聊', icon: ChatDotRound },
  { value: 'employee_field_user', label: '按员工字段', desc: '根据花名册字段匹配', icon: Connection },
  { value: 'employee_department_manager', label: '部门负责人', desc: '匹配员工所属部门负责人', icon: Management },
]

function addReceiver() {
  const newReceivers: ReceiverRule[] = [
    ...receivers.value,
    { type: 'fixed_users', user_ids: [] },
  ]
  emit('update:config', { ...props.config, receivers: newReceivers })
}

function removeReceiver(index: number) {
  const newReceivers = [...receivers.value]
  newReceivers.splice(index, 1)
  emit('update:config', { ...props.config, receivers: newReceivers })
}

function updateReceiver(index: number, receiver: ReceiverRule) {
  const newReceivers = [...receivers.value]
  newReceivers[index] = receiver
  emit('update:config', { ...props.config, receivers: newReceivers })
}

function handleReceiverTypeChange(index: number, receiverType: string) {
  if (receiverType === 'fixed_users') {
    updateReceiver(index, { type: 'fixed_users', user_ids: [] })
  } else if (receiverType === 'fixed_chats') {
    updateReceiver(index, { type: 'fixed_chats', chat_ids: [] })
  } else if (receiverType === 'employee_field_user') {
    updateReceiver(index, { type: 'employee_field_user', target_field: '' })
  } else if (receiverType === 'employee_department_manager') {
    updateReceiver(index, { type: 'employee_department_manager', department_field: '' })
  }
}

function getReceiverType(receiver: ReceiverRule): string {
  return receiver.type
}

// ── 测试发送 ──────────────────────────────────────────
const testContextJson = ref('')
const testing = ref(false)
const testResult = ref<null | {
  ok: boolean
  success_count: number
  failed_count: number
  errors: string[]
  preview?: { rendered_title: string; rendered_content: string; missing_variables: string[] }
}>(null)

async function handleTestSend() {
  // 构造完整 NotificationConfig
  const cfg: NotificationConfig = {
    enabled: true,
    receivers: receivers.value,
    message: {
      message_format: messageFormat.value,
      title_template: titleTemplate.value,
      content_template: contentTemplate.value,
      resources: [],
    },
    require_completion: requireCompletion.value,
    card_button: {
      enabled: cardButtonEnabled.value,
      text: cardButtonText.value || '查看详情',
      url: cardButtonUrl.value || '',
    },
  }

  // 解析测试上下文
  let context: Record<string, any> = {}
  if (testContextJson.value.trim()) {
    try {
      context = JSON.parse(testContextJson.value)
    } catch {
      ElMessage.warning('测试上下文 JSON 格式不正确，已忽略')
    }
  }

  testing.value = true
  testResult.value = null
  try {
    // 第一步：后端 preview 校验
    const preview = await feishuApi.previewMessage({
      message: cfg.message,
      context,
    })

    // 第二步：调用测试发送
    const result = await feishuApi.testSend({
      config: cfg,
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
    const detail = e?.response?.data?.detail || e?.message || '请求异常'
    testResult.value = {
      ok: false,
      success_count: 0,
      failed_count: 1,
      errors: [detail],
    }
    ElMessage.error('测试发送异常：' + detail)
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="feishu-layout">
    <!-- ═══════════════════════════════════════════════════════
         左侧：手机预览区
    ════════════════════════════════════════════════════════ -->
    <div class="mobile-preview">
      <div class="preview-label">消息预览</div>
      <div class="phone-frame">
        <div class="phone-topbar">
          <div class="phone-time">9:41</div>
        </div>
        <div class="phone-content">
          <div class="phone-msg">
            <div class="phone-msg-icon"><el-icon :size="18"><Bell /></el-icon></div>
            <div class="phone-msg-title">{{ titleTemplate || '通知标题' }}</div>
            <div class="phone-msg-body">
              {{ contentPreview || '在这里编辑消息内容...' }}
            </div>
            <div v-if="cardButtonEnabled" class="phone-card-btn">
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
          <div class="phone-nav-item active">消息</div>
          <div class="phone-nav-item">通讯录</div>
          <div class="phone-nav-item">工作台</div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════
         右侧：配置表单
    ════════════════════════════════════════════════════════ -->
    <div class="config-form">
      <!-- ── 发送对象 ──────────────────────────────────────── -->
      <div class="form-block">
        <div class="block-header">
          <h4 class="block-title">选择发送对象</h4>
          <el-button size="small" :icon="Plus" type="primary" plain @click="addReceiver">
            {{ receivers.length === 0 ? '添加发送对象' : '添加规则' }}
          </el-button>
        </div>
        <div v-if="receivers.length === 0" class="block-empty">
          尚未配置接收人，点击上方按钮添加
        </div>

        <div v-for="(receiver, idx) in receivers" :key="idx" class="receiver-block">
          <div class="receiver-top">
            <span class="receiver-no">规则 {{ idx + 1 }}</span>
            <el-button size="small" type="danger" text :icon="Delete" @click="removeReceiver(idx)" />
          </div>

          <!-- 接收人类型：图标卡片 -->
          <div class="type-grid">
            <label
              v-for="opt in receiverTypeOptions"
              :key="opt.value"
              class="type-tile"
              :class="{ active: getReceiverType(receiver) === opt.value }"
            >
              <input
                type="radio"
                :value="opt.value"
                :checked="getReceiverType(receiver) === opt.value"
                @change="handleReceiverTypeChange(idx, opt.value)"
                class="type-input"
              />
              <el-icon class="tile-icon"><component :is="opt.icon" /></el-icon>
              <span class="tile-label">{{ opt.label }}</span>
            </label>
          </div>

          <!-- 各类型输入 -->
          <div v-if="receiver.type === 'fixed_users'" class="receiver-input">
            <el-select
              :model-value="(receiver as any).user_ids || []"
              @update:model-value="(val: number[]) => updateReceiver(idx, { type: 'fixed_users', user_ids: val })"
              multiple filterable placeholder="搜索并选择系统用户..."
              :loading="dataLoading"
              style="width: 100%"
            >
              <el-option v-for="opt in userOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </div>

          <div v-if="receiver.type === 'fixed_chats'" class="receiver-input">
            <el-select
              :model-value="(receiver as any).chat_ids || []"
              @update:model-value="(val: string[]) => updateReceiver(idx, { type: 'fixed_chats', chat_ids: val })"
              multiple filterable placeholder="搜索并选择飞书群..."
              :loading="dataLoading"
              style="width: 100%"
            >
              <el-option v-for="opt in chatOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </div>

          <div v-if="receiver.type === 'employee_field_user'" class="receiver-input">
            <el-input
              :model-value="(receiver as any).target_field"
              @update:model-value="(val: string) => updateReceiver(idx, { ...receiver, target_field: val } as any)"
              placeholder="花名册字段名，如 direct_supervisor"
            />
            <span class="input-note">根据花名册中该字段的值匹配对应的系统用户</span>
          </div>

          <div v-if="receiver.type === 'employee_department_manager'" class="receiver-input">
            <el-input
              :model-value="(receiver as any).department_field"
              @update:model-value="(val: string) => updateReceiver(idx, { ...receiver, department_field: val } as any)"
              placeholder="部门字段名，如 department"
            />
            <span class="input-note">根据该部门字段匹配部门负责人的系统用户</span>
          </div>
        </div>
      </div>

      <!-- ── 消息标题 ──────────────────────────────────────── -->
      <div class="form-block">
        <h4 class="block-title">消息标题</h4>
        <el-input v-model="titleTemplate" placeholder="如：{{rule.name}} — 通知" />
        <div class="var-row">
          <el-tag
            v-for="v in availableVariables"
            :key="v.name"
            size="small"
            class="var-tag"
            @click="contentTemplate = contentTemplate + `{{${v.name}}}`"
          >
            {{ v.name }}
          </el-tag>
        </div>
      </div>

      <!-- ── 消息内容（富文本编辑） ─────────────────────────── -->
      <div class="form-block">
        <div class="block-header">
          <h4 class="block-title">消息内容</h4>
          <div class="toolbar-actions">
            <el-dropdown trigger="click">
              <el-button size="small" plain>
                插入变量 <el-icon><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="v in availableVariables"
                    :key="v.name"
                    @click="insertVariable(v.name)"
                  >
                    <code>{{ v.name }}</code>
                    <span style="margin-left:8px;color:var(--color-text-placeholder);font-size:11px">{{ v.desc }}</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button size="small" :loading="previewLoading" @click="openPreview">
              <el-icon style="margin-right:4px"><Iphone /></el-icon>手机预览
            </el-button>
          </div>
        </div>

        <!-- 富文本工具栏 -->
        <div class="richtext-toolbar">
          <button class="tb-btn" title="加粗 (Ctrl+B)" @click="toolbarBold"><b>B</b></button>
          <button class="tb-btn" title="斜体 (Ctrl+I)" @click="toolbarItalic"><i>I</i></button>
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
          <button class="tb-btn" title="提及人员（@）" @click="showMentionDropdown = true; nextTick(() => { mentionSearchInputRef?.focus() })"><b>@</b></button>
          <span class="tb-divider"></span>
          <div class="format-switch">
            <button
              class="fmt-btn"
              :class="{ active: messageFormat === 'text' }"
              @click="messageFormat = 'text'"
            >纯文本</button>
            <button
              class="fmt-btn"
              :class="{ active: messageFormat === 'markdown' }"
              @click="messageFormat = 'markdown'"
            >Markdown</button>
          </div>
        </div>

        <!-- 编辑区（含 @ 下拉） -->
        <div class="editor-wrap">
          <textarea
            ref="textareaRef"
            :value="contentTemplate"
            @input="handleContentInput"
            class="richtext-area"
            :class="{ 'mode-markdown': messageFormat === 'markdown' }"
            placeholder="输入消息内容，支持 Markdown 格式。输入 @ 可提及人员..."
            rows="6"
          ></textarea>
          <!-- @ 人员下拉 -->
          <div v-if="showMentionDropdown" class="mention-dropdown">
            <div class="mention-search">
              <input
                ref="mentionSearchInputRef"
                v-model="mentionSearch"
                placeholder="搜索人员..."
                class="mention-search-input"
                @input="filterMentionOptions(mentionSearch)"
              />
            </div>
            <div class="mention-options">
              <div
                v-for="opt in mentionFilterOptions"
                :key="opt.value"
                class="mention-option"
                @click="selectMention(mentionUserOptions.find(u => u.feishu_user_id === opt.value)!)"
              >
                <div class="mention-avatar">{{ (opt.label as string).charAt(0) }}</div>
                <span class="mention-name">{{ opt.label }}</span>
              </div>
              <div v-if="mentionFilterOptions.length === 0" class="mention-empty">
                未找到匹配人员（仅显示已绑定飞书的用户）
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 卡片按钮 ──────────────────────────────────────── -->
      <div class="form-block">
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-title">卡片按钮</div>
            <div class="toggle-desc">用户点击按钮，可跳转至指定页面</div>
          </div>
          <el-switch v-model="cardButtonEnabled" />
        </div>
        <template v-if="cardButtonEnabled">
          <div class="card-btn-field">
            <label class="field-label required">按钮文案</label>
            <el-input
              v-model="cardButtonText"
              placeholder="查看详情"
              maxlength="20"
              show-word-limit
              size="default"
            />
          </div>
          <div class="card-btn-field">
            <label class="field-label required">跳转至</label>
            <el-input
              v-model="cardButtonUrl"
              placeholder="输入跳转链接"
              size="default"
            >
              <template #prefix>
                <svg style="width:14px;height:14px;color:#999;flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              </template>
            </el-input>
          </div>
        </template>
      </div>

      <!-- ── 标记完成 ──────────────────────────────────────── -->
      <div class="form-block">
        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-title">标记完成</div>
            <div class="toggle-desc">消息附带「✅ 标记完成」按钮，已完成的人下次自动过滤</div>
          </div>
          <el-switch v-model="requireCompletion" />
        </div>
      </div>

      <!-- ── 测试发送 ──────────────────────────────────────── -->
      <div class="form-block test-send-block">
        <div class="block-header">
          <h4 class="block-title">测试发送</h4>
          <span class="block-desc">保存前先用真实配置发一条测试消息</span>
        </div>
        <div class="test-context-hint">
          后端将校验消息模板并渲染预览；下方可填写测试变量上下文（JSON，可选）
        </div>
        <el-input
          v-model="testContextJson"
          type="textarea"
          :rows="3"
          placeholder='可选，如：{"employee_name":"张三","report_name":"月度报表"}'
          size="small"
          style="margin:8px 0"
        />
        <el-button
          type="primary"
          plain
          size="small"
          :loading="testing"
          @click="handleTestSend"
        >
          发送测试消息
        </el-button>
        <div v-if="testResult" class="test-result" :class="testResult.ok ? 'result-ok' : 'result-err'">
          <div v-if="testResult.ok" class="result-summary">
            ✅ 发送成功：{{ testResult.success_count }} 成功，{{ testResult.failed_count }} 失败
          </div>
          <div v-else class="result-summary">
            ❌ 发送失败
          </div>
          <div v-if="testResult.preview" class="result-preview">
            <div class="preview-label">后端渲染预览：</div>
            <div class="preview-title">{{ testResult.preview.rendered_title }}</div>
            <div class="preview-content">{{ testResult.preview.rendered_content }}</div>
            <div v-if="testResult.preview.missing_variables?.length" class="preview-warn">
              ⚠️ 未知变量：{{ testResult.preview.missing_variables.join(', ') }}
            </div>
          </div>
          <div v-if="testResult.errors?.length" class="result-errors">
            <div v-for="(err, i) in testResult.errors" :key="i" class="err-item">{{ err }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── 手机预览弹窗 ────────────────────────────────────── -->
    <el-dialog v-model="showPreviewDialog" title="消息预览" width="420px" center>
      <div class="phone-frame" style="margin:0 auto;transform:none">
        <div class="phone-topbar"><div class="phone-time">9:41</div></div>
        <div class="phone-content">
          <div class="phone-msg">
            <div class="phone-msg-icon"><el-icon :size="18"><Bell /></el-icon></div>
            <div class="phone-msg-title">{{ titleTemplate || '通知标题' }}</div>
            <div class="phone-msg-body" v-html="renderPreviewContent(contentPreview || '（空消息）')"></div>
            <div v-if="cardButtonEnabled" class="phone-card-btn">
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
          <div class="phone-nav-item active">消息</div>
          <div class="phone-nav-item">通讯录</div>
          <div class="phone-nav-item">工作台</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ── 双栏布局 ──────────────────────────────────────────── */
.feishu-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

/* ── 左侧：手机预览 ────────────────────────────────────── */
.mobile-preview {
  flex-shrink: 0;
  width: 260px;
  position: sticky;
  top: 80px;
}
.preview-label {
  font-size: 11px;
  color: var(--color-text-placeholder);
  text-align: center;
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}
.phone-frame {
  width: 240px;
  margin: 0 auto;
  border: 2px solid #333;
  border-radius: 24px;
  overflow: hidden;
  background: #f5f5f5;
}
.phone-topbar {
  padding: 10px 16px 4px;
  background: #fff;
  text-align: center;
}
.phone-time {
  font-size: 10px;
  font-weight: 600;
  color: #333;
}
.phone-content {
  padding: 12px;
  min-height: 160px;
  background: #f5f5f5;
}
.phone-msg {
  background: #fff;
  border-radius: 10px;
  padding: 14px 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.phone-msg-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #ecf5ff;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.phone-msg-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 6px;
}
.phone-msg-body {
  font-size: 11px;
  color: #666;
  line-height: 1.5;
}
.phone-card-btn {
  margin-top: 8px;
  padding: 6px 12px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 4px;
  font-size: 11px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.phone-msg-time {
  font-size: 10px;
  color: #999;
  margin-top: 8px;
  text-align: right;
}
.phone-bottombar {
  display: flex;
  justify-content: space-around;
  padding: 8px 16px;
  background: #fff;
  border-top: 1px solid #eee;
}
.phone-nav-item {
  font-size: 10px;
  color: #999;
  text-align: center;
}
.phone-nav-item.active {
  color: var(--color-primary);
  font-weight: 500;
}

/* ── 右侧：配置表单 ────────────────────────────────────── */
.config-form {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-block {
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-card);
}
.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.block-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}
.block-empty {
  font-size: 12px;
  color: var(--color-text-placeholder);
  padding: 20px;
  text-align: center;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-subtle);
}

/* ── 接收人块 ──────────────────────────────────────────── */
.receiver-block {
  padding: 12px;
  margin-bottom: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.receiver-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.receiver-no {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}
.type-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.type-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  cursor: pointer;
  transition: all 0.15s ease;
}
.type-tile:hover {
  border-color: var(--color-primary-light);
}
.type-tile.active {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
}
.type-input { display: none; }
.tile-icon {
  font-size: 18px;
  color: var(--color-text-secondary);
}
.type-tile.active .tile-icon {
  color: var(--color-primary);
}
.tile-label {
  font-size: 11px;
  color: var(--color-text-regular);
}
.receiver-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.input-note {
  font-size: 11px;
  color: var(--color-text-placeholder);
}

/* ── 变量行 ───────────────────────────────────────────── */
.var-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.var-tag { cursor: pointer; }
.var-tag:hover { border-color: var(--color-primary); color: var(--color-primary); }

/* ── 富文本工具栏 ──────────────────────────────────────── */
.richtext-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-bottom: none;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: var(--color-bg-subtle);
}
.tb-btn {
  width: 30px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  transition: all 0.15s ease;
}
.tb-btn:hover {
  background: var(--color-bg-card);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}
.tb-divider {
  width: 1px;
  height: 18px;
  background: var(--color-border);
  margin: 0 4px;
}
.format-switch {
  display: flex;
  margin-left: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.fmt-btn {
  padding: 2px 10px;
  font-size: 11px;
  border: none;
  background: none;
  color: var(--color-text-placeholder);
  cursor: pointer;
  transition: all 0.15s ease;
}
.fmt-btn.active {
  background: var(--color-primary);
  color: #fff;
}

.richtext-area {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--color-bg-card);
  color: var(--color-text-primary);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: 1.7;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s ease;
}
.richtext-area:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary-light);
}
.richtext-area::placeholder {
  color: var(--color-text-placeholder);
}
.richtext-area.mode-markdown {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

/* ── @ 提及下拉 ────────────────────────────────────── */
.editor-wrap {
  position: relative;
}
.mention-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  width: 260px;
  max-height: 240px;
  border: 1px solid var(--color-border, #e4e7ed);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
  z-index: 100;
  overflow: hidden;
  margin-bottom: 4px;
}
.mention-search {
  padding: 8px;
  border-bottom: 1px solid var(--color-border, #e4e7ed);
}
.mention-search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-border, #e4e7ed);
  border-radius: var(--radius-sm, 4px);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.mention-search-input:focus {
  border-color: var(--color-primary, #409eff);
}
.mention-options {
  max-height: 190px;
  overflow-y: auto;
}
.mention-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.1s;
}
.mention-option:hover {
  background: var(--color-primary-subtle, #ecf5ff);
}
.mention-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-primary, #409eff);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.mention-name {
  font-size: 13px;
  color: var(--color-text-primary, #303133);
}
.mention-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-placeholder, #c0c4cc);
}

/* ── 预览中的高亮 ──────────────────────────────────── */
.preview-mention {
  display: inline-block;
  background: #e8f4fd;
  color: var(--color-primary, #409eff);
  border-radius: 3px;
  padding: 0 3px;
  font-weight: 500;
  margin: 0 1px;
}
.preview-var {
  display: inline-block;
  background: #fef0e6;
  color: #e6a23c;
  border-radius: 3px;
  padding: 0 3px;
  font-size: 11px;
  margin: 0 1px;
}

/* ── 测试发送区块 ───────────────────────────── */
.test-send-block {
  border-color: var(--color-primary, #409eff);
  background: linear-gradient(135deg, var(--color-primary-light-9, #f0f8ff), var(--color-bg-card, #fff));
}
.block-desc {
  font-size: 11px;
  color: var(--color-text-placeholder, #c0c4cc);
  margin-left: 8px;
}
.test-context-hint {
  font-size: 11px;
  color: var(--color-text-placeholder, #c0c4cc);
  margin-bottom: 4px;
}
.test-result {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md, 6px);
  font-size: 12px;
}
.result-ok {
  background: #f0f9eb;
  border: 1px solid #c8e6c9;
  color: #2e7d32;
}
.result-err {
  background: #fde8e8;
  border: 1px solid #f5c6c6;
  color: #c62828;
}
.result-summary {
  font-weight: 500;
  margin-bottom: 6px;
}
.result-preview {
  margin-top: 8px;
  padding: 8px;
  background: rgba(0,0,0,0.03);
  border-radius: 4px;
  font-size: 11px;
}
.preview-label {
  color: var(--color-text-placeholder, #c0c4cc);
  margin-bottom: 4px;
}
.preview-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.preview-content {
  white-space: pre-wrap;
  margin-bottom: 4px;
}
.preview-warn {
  color: #e6a23c;
  margin-top: 4px;
}
.result-errors {
  margin-top: 6px;
}
.err-item {
  font-size: 11px;
  color: #c62828;
}

  display: flex;
  justify-content: space-between;
  align-items: center;
}
.toggle-info {
  flex: 1;
  min-width: 0;
}
.toggle-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}
.toggle-desc {
  font-size: 11px;
  color: var(--color-text-placeholder);
  margin-top: 2px;
}
.card-btn-field {
  margin-top: 10px;
}
.card-btn-field .field-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  margin-bottom: 6px;
}
.card-btn-field .field-label.required::before {
  content: '*';
  color: #f56c6c;
  margin-right: 3px;
}
</style>
