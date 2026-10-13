<template>
  <PerformanceDialogShell
    :model-value="open"
    title="添加提示"
    width="600px"
    @close="close"
    @update:model-value="emit('update:open', $event)"
  >
    <div class="prompt-modal__body">
      <PerformanceFormItem label="标题">
        <input v-model="draftTitle" class="prompt-input" type="text" />
      </PerformanceFormItem>
      <PerformanceFormItem label="提示内容" required :invalid="submitted && !draftContent.trim()" error-message="提示内容为必填">
        <PerformanceTextField v-model="draftContent" type="textarea" :maxlength="2000" show-count />
      </PerformanceFormItem>
      <PerformanceFormItem label="颜色" required>
        <PerformancePromptColorPicker v-model="draftColor" />
      </PerformanceFormItem>
      <PerformanceFormItem label="适用的被评估人范围" required>
        <div class="prompt-radio-group">
          <label class="prompt-radio"><input v-model="draftScope" type="radio" value="all" /><span class="prompt-radio__dot"></span><span>全部成员</span></label>
          <label class="prompt-radio"><input v-model="draftScope" type="radio" value="cycle" /><span class="prompt-radio__dot"></span><span>在周期提示范围中配置具体范围</span></label>
        </div>
      </PerformanceFormItem>
    </div>

    <template #footer>
      <div class="prompt-modal__footer">
        <PerformanceButton variant="primary" :disabled="!draftContent.trim()" @click="confirm">确定</PerformanceButton>
        <PerformanceButton variant="secondary" @click="close">取消</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformancePromptColorPicker from './PerformancePromptColorPicker.vue'
import PerformanceTextField from './PerformanceTextField.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; save: [value: { title: string; content: string; color: string; scope: string }] }>()
const draftTitle = ref('')
const draftContent = ref('')
const draftColor = ref('#3B82F6')
const draftScope = ref('all')
const submitted = ref(false)

watch(() => props.open, value => {
  if (value) {
    draftTitle.value = ''
    draftContent.value = ''
    draftColor.value = '#3B82F6'
    draftScope.value = 'all'
    submitted.value = false
  }
})

function close() { emit('update:open', false) }
function confirm() {
  submitted.value = true
  if (!draftContent.value.trim()) return
  emit('save', { title: draftTitle.value, content: draftContent.value, color: draftColor.value, scope: draftScope.value })
  close()
}
</script>

<style scoped>
.prompt-modal__body { display: grid; gap: 0; }
.prompt-input { width: 100%; height: var(--performance-control-height); padding: 4px var(--performance-input-padding-x); box-sizing: border-box; border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); background: var(--color-bg-card); color: var(--color-text-primary); font: inherit; }
.prompt-input:focus { border-color: var(--performance-field-border-focus); outline: 0; box-shadow: var(--performance-field-focus-ring); }
.prompt-radio-group { display: flex; flex-direction: column; gap: var(--spacing-2); }
.prompt-radio { position: relative; display: flex; align-items: center; gap: var(--spacing-2); min-height: 22px; color: var(--color-text-primary); line-height: 22px; cursor: pointer; }
.prompt-radio input { position: absolute; width: 16px; height: 16px; margin: 0; opacity: 0; cursor: pointer; }
.prompt-radio__dot { display: block; width: 16px; height: 16px; flex: none; box-sizing: border-box; border: 1px solid var(--color-text-placeholder); border-radius: 50%; }
.prompt-radio input:checked + .prompt-radio__dot { border-color: var(--color-primary-hover); background: var(--color-primary-hover); box-shadow: inset 0 0 0 4px var(--color-bg-card); }
.prompt-radio input:focus-visible + .prompt-radio__dot { box-shadow: inset 0 0 0 4px var(--color-bg-card), var(--performance-button-focus-ring); }
.prompt-modal__footer { display: flex; justify-content: flex-end; gap: var(--performance-button-gap); }
.prompt-modal__footer :deep(.performance-button) { min-width: var(--performance-button-min-width); }
</style>
