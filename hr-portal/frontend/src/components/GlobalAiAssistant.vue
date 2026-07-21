<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { MagicStick, Position } from '@element-plus/icons-vue'
import { aiApi, type AiAction, type AiChatMessage, type AutomationRuleArtifact, type CapabilityResult } from '@/api/ai'
import type { EmployeeCandidate } from '@/api/tools'
import DocumentActionPreview from '@/components/document/DocumentActionPreview.vue'
import AutomationRuleArtifactPreview from '@/components/automation/AutomationRuleArtifactPreview.vue'
import CompareResultCard from '@/components/ai/CompareResultCard.vue'
import CompensationComparisonCard from '@/components/ai/CompensationComparisonCard.vue'
import EmployeeProfileResultCard from '@/components/ai/EmployeeProfileResultCard.vue'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  traceId?: string | null
  result?: CapabilityResult
}

const route = useRoute()
const router = useRouter()
const open = ref(false)
const input = ref('')
const sending = ref(false)
const threadRef = ref<HTMLElement | null>(null)
const documentActionRef = ref<InstanceType<typeof DocumentActionPreview> | null>(null)
const messages = ref<ChatMessage[]>([])
// 多轮会话:前端只持有后端发的 conversation_id,任务状态/槽位由后端 PG 持久化。
const conversationId = ref<number | null>(null)
const selectingEmployeeProfileMessageId = ref<number | null>(null)
let messageId = 0

function messageCandidates(item: ChatMessage): EmployeeCandidate[] {
  if (!item.result || (item.result.type !== 'compensation_input' && item.result.type !== 'compensation_preview')) {
    return []
  }
  return item.result.data.candidates
}

function chatHistory(): AiChatMessage[] {
  return messages.value.slice(-8).map((item) => ({
    role: item.role,
    content: item.content,
  }))
}

function scrollToBottom() {
  nextTick(() => {
    const el = threadRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function openAssistant() {
  open.value = true
  scrollToBottom()
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return '--'
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function employeeTitle(item: EmployeeCandidate) {
  const name = item.name || item.chinese_name || item.english_name || '未命名员工'
  return `${name}${item.employee_no ? ` · ${item.employee_no}` : ''}`
}

function runAction(action: AiAction) {
  if (action.type === 'navigate') {
    if (!action.route) return
    router.push({ path: action.route, query: action.query || {} })
    open.value = false
    return
  }
  if (action.type === 'document_preview' || action.type === 'document_print') {
    documentActionRef.value?.execute(action)
  }
}

function runAutoActions(actions: AiAction[]) {
  const documentAction = actions.find((action) => action.type === 'document_preview' || action.type === 'document_print')
  if (documentAction) {
    nextTick(() => documentActionRef.value?.execute(documentAction))
  }
}

async function chooseCandidate(candidate: EmployeeCandidate) {
  const text = `选择 ${employeeTitle(candidate)}`
  messages.value.push({ id: ++messageId, role: 'user', content: text })
  scrollToBottom()
  await sendMessage(`计算 ${employeeTitle(candidate)} 的补偿金`, candidate.id, false)
}

function controlledActionErrorDetail(error: any) {
  if (error?.response?.status === 410) return '\u5458\u5de5\u5019\u9009\u9879\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u67e5\u8be2\u3002'
  return error?.response?.data?.detail || '\u5458\u5de5\u4fe1\u606f\u67e5\u8be2\u5931\u8d25\u3002'
}

function isEmployeeProfileCard(item: ChatMessage) {
  return item.result?.type === 'employee_profile_result' || item.result?.type === 'employee_profile_candidates'
}

async function chooseEmployeeProfileCandidate(item: ChatMessage, selectionHandle: string) {
  if (!conversationId.value || item.result?.type !== 'employee_profile_candidates') {
    item.result = undefined
    item.content = '\u5458\u5de5\u5019\u9009\u9879\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u67e5\u8be2\u3002'
    return
  }
  selectingEmployeeProfileMessageId.value = item.id
  try {
    const result = await aiApi.consumeControlledAction(conversationId.value, {
      action_type: 'employee.profile.select_candidate',
      selection_handle: selectionHandle,
    })
    if (result.conversation_id) conversationId.value = result.conversation_id
    item.content = result.answer
    item.traceId = result.trace_id
    item.result = result.result
  } catch (error: any) {
    const detail = controlledActionErrorDetail(error)
    item.result = undefined
    item.content = detail
    ElMessage.warning(detail)
  } finally {
    selectingEmployeeProfileMessageId.value = null
    scrollToBottom()
  }
}

async function sendMessage(
  text: string = input.value,
  selectedEmployeeId: number | null = null,
  showUserMessage = true,
) {
  if (sending.value) return
  const message = text.trim()
  if (!message) {
    ElMessage.warning('请先输入要让 AI 处理的事情')
    return
  }
  if (showUserMessage) {
    messages.value.push({ id: ++messageId, role: 'user', content: message })
  }
  input.value = ''
  sending.value = true
  scrollToBottom()
  try {
    const result = await aiApi.chat({
      message,
      page_path: route.fullPath,
      conversation_id: conversationId.value,
      history: chatHistory(),
      selected_employee_id: selectedEmployeeId,
    })
    if (result.conversation_id) {
      conversationId.value = result.conversation_id
    }
    const actions = result.result.actions
    messages.value.push({
      id: ++messageId,
      role: 'assistant',
      content: result.answer,
      traceId: result.trace_id,
      result: result.result,
    })
    runAutoActions(actions)
    scrollToBottom()
  } catch (e: any) {
    const detail = e?.code === 'ECONNABORTED'
      ? '模型响应超时，请稍后重试。'
      : e?.response?.data?.detail || 'AI 处理失败'
    messages.value.push({ id: ++messageId, role: 'assistant', content: detail })
    ElMessage.error(detail)
    scrollToBottom()
  } finally {
    sending.value = false
  }
}

function clearAutomationRuleDraft(item: ChatMessage) {
  if (item.result?.type === 'automation_rule_draft') {
    item.result = undefined
  }
}

function handleArtifactSaved(item: ChatMessage) {
  ElMessage.success('自动化规则已保存，请在自动化规则页面查看')
  clearAutomationRuleDraft(item)
}

function handleArtifactDismissed(item: ChatMessage) {
  clearAutomationRuleDraft(item)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <el-button class="global-ai-trigger" type="primary" circle @click="openAssistant">
    <el-icon><MagicStick /></el-icon>
  </el-button>

  <el-drawer v-model="open" title="全局 AI 助手" size="620px" append-to-body class="global-ai-drawer">
    <div class="ai-chat">
      <div ref="threadRef" class="chat-thread">
        <div v-if="!messages.length" class="chat-empty">
          可以在任何页面发起受控任务，例如：帮我计算刘琦的补偿金。
        </div>
        <div v-for="item in messages" :key="item.id" class="chat-message" :class="[item.role, { 'employee-profile-message': isEmployeeProfileCard(item) }]">
          <div class="chat-bubble">
            <div v-if="!isEmployeeProfileCard(item)" class="chat-content">{{ item.content }}</div>
            <div v-if="item.result?.type === 'compensation_preview'" class="result-card">
              <div class="result-row">
                <span>员工</span>
                <strong>{{ item.result.data.compensation.employee.name || item.result.data.compensation.employee.employee_no }}</strong>
              </div>
              <div class="result-row">
                <span>离职日期</span>
                <strong>{{ item.result.data.compensation.leave_date || '--' }}</strong>
              </div>
              <div class="result-row">
                <span>方案</span>
                <strong>{{ item.result.data.compensation.plan }}</strong>
              </div>
              <div class="result-row">
                <span>合计</span>
                <strong>{{ formatMoney(item.result.data.compensation.total_amount) }}</strong>
              </div>
            </div>
            <div v-if="messageCandidates(item).length" class="candidate-list">
              <button
                v-for="candidate in messageCandidates(item)"
                :key="candidate.id"
                type="button"
                class="candidate-item"
                @click="chooseCandidate(candidate)"
              >
                <span>{{ employeeTitle(candidate) }}</span>
                <small>{{ candidate.company || '--' }} · {{ candidate.department || '--' }}</small>
              </button>
            </div>
            <div v-if="item.result?.actions.length" class="action-list">
              <el-button
                v-for="action in item.result.actions"
                :key="`${action.type}-${action.route || action.label}`"
                size="small"
                type="primary"
                plain
                @click="runAction(action)"
              >
                {{ action.label }}
              </el-button>
            </div>
            <AutomationRuleArtifactPreview
              v-if="item.result?.type === 'automation_rule_draft'"
              :artifact="item.result.data"
              @saved="handleArtifactSaved(item)"
              @dismissed="handleArtifactDismissed(item)"
            />
            <CompensationComparisonCard
              v-if="item.result?.type === 'compensation_comparison'"
              :result="item.result.data"
            />
            <CompareResultCard
              v-if="item.result?.type === 'data_compare_result'"
              :result="item.result.data"
            />
            <EmployeeProfileResultCard
              v-if="item.result?.type === 'employee_profile_result' || item.result?.type === 'employee_profile_candidates'"
              :result="item.result"
              :loading="selectingEmployeeProfileMessageId === item.id"
              @select="chooseEmployeeProfileCandidate(item, $event)"
            />
          </div>
        </div>
        <div v-if="sending" class="chat-message assistant">
          <div class="chat-bubble">正在处理...</div>
        </div>
      </div>

      <div class="ai-send-box">
        <el-input
          v-model="input"
          class="ai-send-input"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 3 }"
          resize="none"
          placeholder="例如：帮我计算张三 2026-06-30 N+1 补偿金"
          @keydown="handleKeydown"
        />
        <div class="ai-send-actions">
          <span>Enter 发送，Shift+Enter 换行</span>
          <el-button class="send-button" type="primary" circle :loading="sending" @click="sendMessage()">
            <el-icon><Position /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </el-drawer>

  <DocumentActionPreview ref="documentActionRef" />
</template>

<style scoped>
.global-ai-trigger {
  position: fixed;
  right: 22px;
  bottom: 24px;
  z-index: 1200;
  width: 44px;
  height: 44px;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.2);
}
.global-ai-drawer :deep(.el-drawer__body) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ai-chat {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
}
.chat-thread {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: var(--color-bg-subtle);
}
.chat-empty {
  color: var(--color-text-placeholder);
  font-size: 13px;
  line-height: 1.6;
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
  gap: 8px;
  max-width: 88%;
  padding: 9px 11px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: #fff;
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.chat-message.employee-profile-message .chat-bubble {
  width: 100%;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
}
.chat-message.user .chat-bubble {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
.result-card {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: var(--color-bg-soft);
}
.result-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.candidate-list {
  display: grid;
  gap: 6px;
}
.candidate-item {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: #fff;
  color: var(--color-text-primary);
  text-align: left;
  cursor: pointer;
}
.candidate-item:hover {
  border-color: var(--color-primary);
}
.candidate-item small {
  color: var(--color-text-secondary);
}
.action-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.trace-line {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-placeholder);
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
  color: var(--color-text-placeholder);
  font-size: 12px;
}
.send-button {
  flex: 0 0 auto;
}
</style>
