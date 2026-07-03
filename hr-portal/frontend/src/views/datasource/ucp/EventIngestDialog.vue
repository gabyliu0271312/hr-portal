<template>
  <el-dialog
    v-model="visible"
    title="发布事件（内部 API）"
    width="640px"
    :close-on-click-modal="false"
    @open="onOpen"
    @close="onClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" size="small">
      <el-form-item label="Event ID" prop="event_id">
        <el-input v-model="form.event_id" placeholder="如 evt_20260703_xxxxx（唯一键）" />
      </el-form-item>
      <el-form-item label="事件类型" prop="event_type">
        <el-input v-model="form.event_type" placeholder="如 EMPLOYEE_ONBOARDING" />
      </el-form-item>
      <el-form-item label="来源" prop="source">
        <el-select v-model="form.source" style="width: 100%">
          <el-option v-for="s in SOURCES" :key="s" :label="s" :value="s" />
        </el-select>
      </el-form-item>
      <el-form-item label="触发模式">
        <el-radio-group v-model="form.trigger">
          <el-radio-button value="REALTIME">REALTIME</el-radio-button>
          <el-radio-button value="BATCH">BATCH</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="Payload">
        <el-input
          v-model="payloadText"
          type="textarea"
          :rows="6"
          placeholder='{"key": "value"}'
        />
      </el-form-item>
      <el-form-item label="去重">
        <el-switch v-model="form.is_dedup" />
        <span class="form-tip">同 event_id 重复入库时返回 409</span>
      </el-form-item>
      <el-form-item label="自动派发">
        <el-switch v-model="form.auto_dispatch" />
        <span class="form-tip">关闭则仅入库，状态停留在 RECEIVED</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="onSubmit">发布</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ucpApi } from '@/api/ucp'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void; (e: 'success'): void }>()

const SOURCES = ['FEISHU', 'BEISEN', 'INTERNAL', 'GENERIC']

const visible = ref(props.visible)
watch(() => props.visible, (v) => (visible.value = v))
watch(visible, (v) => emit('update:visible', v))

const form = reactive({
  event_id: '',
  event_type: '',
  source: 'GENERIC',
  trigger: 'REALTIME',
  is_dedup: true,
  auto_dispatch: true,
})
const payloadText = ref('{}')
const submitting = ref(false)
const formRef = ref<FormInstance>()

const rules: FormRules = {
  event_id: [{ required: true, message: '必填' }],
  event_type: [{ required: true, message: '必填' }],
  source: [{ required: true, message: '必填' }],
}

function onOpen() {
  // 预填一个 event_id
  if (!form.event_id) {
    form.event_id = `evt_${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`
  }
}

function onClose() {
  // 重置
  form.event_id = ''
  form.event_type = ''
  form.source = 'GENERIC'
  form.trigger = 'REALTIME'
  form.is_dedup = true
  form.auto_dispatch = true
  payloadText.value = '{}'
}

async function onSubmit() {
  if (!formRef.value) return
  await formRef.value.validate()
  let payload: any = {}
  try {
    payload = JSON.parse(payloadText.value || '{}')
  } catch {
    ElMessage.error('Payload 必须是合法 JSON')
    return
  }
  submitting.value = true
  try {
    const res = await ucpApi.ingestEvent({
      event_id: form.event_id,
      event_type: form.event_type,
      source: form.source,
      payload,
      trigger: form.trigger,
      is_dedup: form.is_dedup,
      auto_dispatch: form.auto_dispatch,
    })
    ElMessage.success(`事件已接入：${res.status}`)
    emit('success')
    visible.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail?.message || '发布失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.form-tip { color: #909399; font-size: 12px; margin-left: 8px; }
</style>
