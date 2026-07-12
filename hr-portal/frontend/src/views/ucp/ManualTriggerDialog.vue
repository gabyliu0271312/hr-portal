<template>
  <el-dialog
    v-model="visible"
    :title="`手动触发 Pipeline - ${pipelineCode}`"
    width="560px"
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="Pipeline">
        <el-input :model-value="pipelineCode" disabled />
      </el-form-item>

      <el-form-item label="触发方式" prop="dry_run">
        <el-radio-group v-model="form.dry_run">
          <el-radio :value="false">真实执行</el-radio>
          <el-radio :value="true">DRY-RUN 模拟</el-radio>
        </el-radio-group>
        <div class="form-tip">
          <el-text v-if="form.dry_run" type="warning" size="small">
            模拟执行不写目标表、不发通知，仅验证流程
          </el-text>
          <el-text v-else type="info" size="small">
            真实执行将写入目标表并发送通知，请谨慎
          </el-text>
        </div>
      </el-form-item>

      <el-form-item label="时间范围">
        <el-date-picker
          v-model="timeRangeValue"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          format="YYYY-MM-DD HH:mm"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 100%"
        />
        <div class="form-tip">
          <el-text type="info" size="small">可选，注入到所有 RESOURCE 步骤的查询参数</el-text>
        </div>
      </el-form-item>

      <el-form-item label="步骤参数覆盖">
        <el-input
          v-model="overrideParamsText"
          type="textarea"
          :rows="3"
          placeholder='格式: {"step_id_1": {"limit": 10}, "step_id_2": {"filter": "x"}}'
        />
        <div class="form-tip">
          <el-text type="info" size="small">JSON 格式，可选；key 为 step_id，value 为覆盖参数对象</el-text>
        </div>
      </el-form-item>

      <el-alert
        v-if="form.dry_run"
        title="DRY-RUN 模式"
        type="warning"
        :closable="false"
        show-icon
        style="margin-top: 8px"
      >
        模拟执行不会写目标表，不会发送通知，仅用于流程验证
      </el-alert>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="onSubmit">
        {{ form.dry_run ? '模拟执行' : '确认触发' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, type FormInstance } from 'element-plus'

export interface ManualTriggerResult {
  pipeline_run_id: string
  trace_id: string
  status: string
  duration_ms: number | null
  dry_run?: boolean
}

const props = defineProps<{
  modelValue: boolean
  pipelineCode: string
}>()

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  'submit': [params: { dry_run: boolean; time_range: { start: string; end: string } | null; override_params: Record<string, any> | null }, resolve: (result: ManualTriggerResult) => void, reject: (err: any) => void]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const formRef = ref<FormInstance | null>(null)
const submitting = ref(false)
const form = ref({
  dry_run: false,
})
const timeRangeValue = ref<[string, string] | null>(null)
const overrideParamsText = ref('')

const rules = {
  dry_run: [{ required: true, message: '请选择触发方式', trigger: 'change' }],
}

function onOpen() {
  // 重置表单
  form.value = { dry_run: false }
  timeRangeValue.value = null
  overrideParamsText.value = ''
  formRef.value?.clearValidate()
}

async function onSubmit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  // 解析 override_params JSON
  let override_params: Record<string, any> | null = null
  if (overrideParamsText.value.trim()) {
    try {
      const parsed = JSON.parse(overrideParamsText.value)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        ElMessage.error('步骤参数覆盖必须是 JSON 对象')
        return
      }
      override_params = parsed
    } catch (e: any) {
      ElMessage.error(`步骤参数 JSON 解析失败: ${e.message ?? e}`)
      return
    }
  }

  // 构造 time_range
  const time_range = timeRangeValue.value && timeRangeValue.value.length === 2
    ? { start: timeRangeValue.value[0], end: timeRangeValue.value[1] }
    : null

  const params = {
    dry_run: form.value.dry_run,
    time_range,
    override_params,
  }

  submitting.value = true
  try {
    // 父组件负责调用 API 并 resolve
    const result = await new Promise<ManualTriggerResult>((resolve, reject) => {
      emit('submit', params, resolve, reject)
    })
    ElMessage.success(
      form.value.dry_run
        ? `模拟执行完成，状态：${result.status}`
        : `Pipeline 已触发，Run #${result.pipeline_run_id}，状态：${result.status}`
    )
    visible.value = false
  } catch (e: any) {
    const detail = e?.response?.data?.detail
    let errMsg: string
    if (typeof detail === 'object' && detail?.message) {
      errMsg = detail.message
    } else if (typeof detail === 'string') {
      errMsg = detail
    } else {
      errMsg = e?.message || '触发失败'
    }
    ElMessage.error(errMsg)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.form-tip {
  margin-top: 4px;
  line-height: 1.4;
}
</style>
