<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { dataCompareApi, type DialogueResponse, type SkillOut, type SkillParams } from '@/api/data-compare'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PermissionButton from '@/components/PermissionButton.vue'

const props = defineProps<{ modelValue: boolean; skill: SkillOut | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
const name = ref(''), instruction = ref(''), message = ref(''), paramsJson = ref('')
const legacy = ref(false), busy = ref(false), saving = ref(false)
const draft = ref<DialogueResponse | null>(null)
const messages = ref<{ role: string; text: string }[]>([])
const requestError = ref(''), needsRestart = ref(false)
let sequence = 0, editVersion = 0
const canConfirm = computed(() => !busy.value && !message.value.trim() && draft.value?.status === 'requires_confirmation')
const canSave = computed(() => !busy.value && !saving.value && !!name.value.trim() && (legacy.value ? !!paramsJson.value : !message.value.trim() && draft.value?.status === 'confirmed' && !!draft.value.confirmation_token))
watch(() => props.modelValue, open => {
  sequence++
  busy.value = false
  requestError.value = ''
  needsRestart.value = false
  if (!open) return
  name.value = props.skill?.name || ''
  instruction.value = props.skill?.instruction || ''
  legacy.value = !!props.skill && !('kind' in props.skill.params)
  message.value = legacy.value ? '' : instruction.value
  paramsJson.value = props.skill ? JSON.stringify(props.skill.params, null, 2) : ''
  draft.value = null
  messages.value = []
})
watch(message, () => {
  editVersion++
  if (draft.value) draft.value = { ...draft.value, status: 'requires_input', confirmation_token: null }
}, { flush: 'sync' })
watch(instruction, () => { if (legacy.value) paramsJson.value = '' }, { flush: 'sync' })
watch(legacy, () => { sequence++; busy.value = false; draft.value = null })

function errorText(e: any) {
  if (e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT') return 'AI 响应超时，未能确认服务端进度；需求已保留，请重新开始对话后重试。'
  const detail = e?.response?.data?.detail
  return typeof detail === 'string' ? detail : detail?.message || e?.message || '请求失败，请重试'
}
function restart() {
  if (busy.value || saving.value) return
  sequence++
  draft.value = null
  requestError.value = ''
  needsRestart.value = false
  const instructions = messages.value.filter(item => item.role === '需求').map(item => item.text)
  if (message.value.trim() && instructions.at(-1) !== message.value.trim()) instructions.push(message.value.trim())
  message.value = instructions.join('\n')
  messages.value.push({ role: '提示', text: '已重新开始，历史需求已放回输入框；请核对后发送。' })
}
async function send(action: 'message' | 'confirm') {
  const text = message.value.trim()
  if (busy.value || needsRestart.value || (action === 'message' && !text) || (action === 'confirm' && !canConfirm.value)) return
  if (action === 'message') {
    instruction.value = text
    messages.value.push({ role: '需求', text })
    message.value = ''
  }
  const request = ++sequence
  const sentEditVersion = editVersion
  requestError.value = ''
  busy.value = true
  try {
    const result = await dataCompareApi.generateDialogue({ dialogue: true, action, instruction: action === 'message' ? text : '', conversation_id: draft.value?.conversation_id, revision: draft.value?.revision })
    if (request !== sequence || !props.modelValue) return
    draft.value = sentEditVersion === editVersion ? result : { ...result, status: 'requires_input', confirmation_token: null }
    messages.value.push({ role: '助手', text: result.question || result.summary || '请继续补充需求' })
  } catch (e: any) {
    if (request === sequence) {
      requestError.value = errorText(e)
      needsRestart.value = !e?.response || e.response.status === 409 || e.response.status === 404
      if (action === 'message' && !message.value.trim()) message.value = text
      messages.value.push({ role: '请求失败', text: requestError.value })
    }
  } finally { if (request === sequence) busy.value = false }
}
async function generateLegacy() {
  const request = ++sequence
  busy.value = true
  try {
    const result = await dataCompareApi.generateSkill({ instruction: instruction.value })
    if (request === sequence && props.modelValue) paramsJson.value = JSON.stringify(result.params, null, 2)
  } catch (e) { if (request === sequence) ElMessage.error(errorText(e)) }
  finally { if (request === sequence) busy.value = false }
}
async function save() {
  if (!canSave.value) return
  let params: SkillParams
  try { params = legacy.value ? JSON.parse(paramsJson.value) : draft.value!.params! }
  catch { ElMessage.error('配置 JSON 格式不合法'); return }
  if (!params || (legacy.value && 'kind' in params)) { ElMessage.warning('报表金额对比必须通过多轮确认保存'); return }
  saving.value = true
  try {
    const payload = { name: name.value.trim(), instruction: instruction.value, params, confirmation_token: legacy.value ? undefined : draft.value!.confirmation_token! }
    if (props.skill) await dataCompareApi.updateSkill(props.skill.id, payload)
    else await dataCompareApi.createSkill(payload)
    ElMessage.success('配置已保存，尚未执行；请创建或手动运行任务')
    emit('saved')
    emit('update:modelValue', false)
  } catch (e) { ElMessage.error(errorText(e)) }
  finally { saving.value = false }
}
function close() {
  const current = draft.value
  sequence++
  if (current?.conversation_id) void dataCompareApi.generateDialogue({ dialogue: true, action: 'cancel', instruction: '', conversation_id: current.conversation_id, revision: current.revision }).catch(() => {})
  emit('update:modelValue', false)
}
</script>

<template>
  <UiDialogShell :model-value="modelValue" :title="skill ? '编辑对比配置' : '新建对比'" width="min(90vw, var(--ui-dialog-width-lg))" :loading="saving" @update:model-value="close">
    <el-form label-position="top">
      <el-form-item label="配置名称" required><el-input v-model="name" :disabled="saving" /></el-form-item>
      <el-form-item label="配置方式">
        <el-radio-group v-model="legacy" :disabled="busy || saving || !!skill">
          <el-radio-button :value="false">报表金额多轮对比</el-radio-button>
          <el-radio-button :value="true">原表间对比</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <template v-if="legacy">
        <el-form-item label="自然语言需求" required><el-input v-model="instruction" type="textarea" :rows="4" :disabled="saving || busy" /></el-form-item>
        <UiButton :loading="busy" :disabled="!instruction.trim() || saving" @click="generateLegacy">AI 生成配置</UiButton>
        <el-collapse><el-collapse-item title="高级：查看 / 编辑 CompareSpec JSON"><el-input v-model="paramsJson" type="textarea" :rows="10" :disabled="saving" /></el-collapse-item></el-collapse>
      </template>
      <template v-else>
        <p class="hint">指定报表 A、注册表 B、月份、金额指标及一个维度。确认只保存口径，不查询或执行业务数据。</p>
        <div class="dialogue-log" role="log" aria-live="polite"><p v-for="(item, index) in messages" :key="index"><strong>{{ item.role }}</strong> {{ item.text }}</p></div>
        <el-form-item label="需求 / 补充或修改口径"><el-input v-model="message" type="textarea" :rows="3" :disabled="saving" placeholder="例如：对比成本报表与工资表 2026 年 5、6 月的实发金额，按部门核对" /></el-form-item>
        <UiButton :loading="busy" :disabled="busy || !message.trim() || saving || needsRestart" @click="send('message')">发送需求</UiButton>
        <p v-if="busy" class="hint" role="status">正在整理已明确内容和待确认事项；可先输入下一条补充，回复后再发送。</p>
        <el-alert v-if="requestError" :title="requestError" type="error" :closable="false" />
        <UiButton v-if="requestError" :disabled="busy || saving" @click="restart">保留需求并重新开始</UiButton>
        <el-alert v-if="draft?.summary" title="已明确内容与待确认事项" type="info" :closable="false" class="summary"><p>{{ draft.summary }}</p></el-alert>
        <p v-if="draft?.status === 'confirmed'" class="hint">口径已确认，可保存。再次输入需求将使本次确认失效。</p>
      </template>
    </el-form>
    <template #footer><div class="actions">
      <UiButton :disabled="saving" @click="close">取消</UiButton>
      <UiButton v-if="!legacy" :disabled="!canConfirm || saving" :loading="busy" @click="send('confirm')">确认以上口径</UiButton>
      <PermissionButton menu="system.data_compare" :op="skill ? 'U' : 'C'" type="primary" :disabled="!canSave" :loading="saving" @click="save">保存配置（不执行）</PermissionButton>
    </div></template>
  </UiDialogShell>
</template>

<style scoped>
.hint { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
.dialogue-log { max-height: 30vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.dialogue-log p { margin: var(--spacing-3) 0; }
.summary { margin-top: var(--spacing-4); white-space: pre-wrap; }
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--spacing-2); }
</style>
