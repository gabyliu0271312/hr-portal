<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { projectManagementApi, type ProjectManagementProject, type RevieweeSearchOption } from '@/api/performance'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import InfoFilledIcon from './InfoFilledIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'

const props = defineProps<{
  modelValue: boolean
  /** 当前项目 id（弹窗默认选中的项目；可切换） */
  projectId: number | null
  /** 当前周期下可切换的项目 */
  projects: ProjectManagementProject[]
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 至少一人添加成功后触发（父级按当前视图重绘一次） */
  added: []
}>()

const open = computed(() => props.modelValue)
const projectValue = ref<string | null>(null)
const selected = ref<string[]>([])
const options = ref<PerformanceSearchSelectOption[]>([])
const searching = ref(false)
const saving = ref(false)
const error = ref('')
const revieweeTouched = ref(false)
let searchVersion = 0

const projectOptions = computed<PerformanceSearchSelectOption[]>(() =>
  props.projects.map(project => ({ value: String(project.project_id), label: project.project_name })),
)

/** 必填项校验：点击确定时未选被评估人则该项进入 invalid 态（该项下方提示 + 输入框红边框），选人后自动消除 */
const invalidReviewee = computed(() => revieweeTouched.value && !selected.value.length)

watch(() => props.modelValue, visible => {
  if (!visible) return
  projectValue.value = props.projectId ? String(props.projectId) : projectOptions.value[0]?.value ?? null
  selected.value = []
  options.value = []
  error.value = ''
  revieweeTouched.value = false
})

watch(projectValue, () => {
  selected.value = []
  options.value = []
  error.value = ''
  revieweeTouched.value = false
})

async function search(keyword: string) {
  const query = keyword.trim()
  const projectId = Number(projectValue.value)
  if (!query || !projectId) { options.value = []; return }
  const version = ++searchVersion
  searching.value = true
  try {
    const result = await projectManagementApi.revieweeSearch(projectId, query)
    if (version !== searchVersion) return
    options.value = result.items.map((item: RevieweeSearchOption) => ({
      value: item.value,
      label: item.label,
      subLabel: item.sub_label ?? undefined,
      avatarFallback: item.label.slice(-1),
      disabled: !item.is_permitted,
      disabledText: item.reason ?? undefined,
    }))
  } catch {
    if (version === searchVersion) options.value = []
  } finally {
    if (version === searchVersion) searching.value = false
  }
}

async function submit() {
  const projectId = Number(projectValue.value)
  if (!projectId || saving.value) return
  if (!selected.value.length) { revieweeTouched.value = true; return }
  saving.value = true
  error.value = ''
  const addedPeople = new Set<string>()
  try {
    for (const employeeNo of selected.value) {
      const conflict = await projectManagementApi.revieweeConflictCheck(projectId, employeeNo)
      if (conflict.conflicts.length) {
        error.value = `「${employeeNo}」${conflict.conflicts.map(item => item.stage_label).join('、')}，无法添加`
        return
      }
      await projectManagementApi.addReviewee(projectId, employeeNo)
      addedPeople.add(employeeNo)
    }
    emit('added')
    emit('update:modelValue', false)
    ElMessage.success(`已添加 ${addedPeople.size} 位被评估人`)
  } catch (e: any) {
    error.value = e?.response?.data?.detail || '添加失败，请稍后重试'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PerformanceDialogShell v-model="open" title="添加被评估人" :loading="saving" @close="emit('update:modelValue', false)">
    <div class="reviewee-add-notice" role="alert">
      <InfoFilledIcon class="reviewee-add-notice__icon" />
      <div class="reviewee-add-notice__text">
        <p>添加成功后，该人员可完成对应评估任务。</p>
        <p>每天 19:00 项目管理员会收到添加、删除、转移人员的记录。</p>
      </div>
    </div>
    <p v-if="error" class="reviewee-add-error" role="alert">{{ error }}</p>
    <PerformanceFormItem label="选择项目" required>
      <PerformanceSearchSelect
        v-model="projectValue"
        :options="projectOptions"
        :remote-search="false"
        placeholder="请选择项目"
        aria-label="选择项目"
        :disabled="saving || !projects.length"
      />
    </PerformanceFormItem>
    <PerformanceFormItem label="被评估人" required :invalid="invalidReviewee" error-message="被评估人为必填">
      <PerformancePersonSelect
        v-model="selected"
        :options="options"
        :remote-search="true"
        multiple
        placeholder="请输入"
        aria-label="选择被评估人"
        :disabled="saving || !projectValue"
        :loading="searching"
        @search="search"
      />
    </PerformanceFormItem>
    <template #footer>
      <div class="reviewee-add-footer">
        <UiButton variant="secondary" :disabled="saving" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" :loading="saving" :disabled="!projectValue" @click="submit">确定</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.reviewee-add-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 20px;
  padding: 9px 16px 9px 12px;
  border-radius: 4px;
  background: var(--performance-notice-info-background);
}
.reviewee-add-notice__icon { flex: none; margin-top: 2px; color: var(--performance-notice-info-icon); }
.reviewee-add-notice__text { font-size: var(--font-size-md); line-height: 22px; color: var(--performance-notice-info-text); }
.reviewee-add-notice__text p { margin: 0; }
.reviewee-add-error { margin: 0 0 var(--spacing-3); color: var(--performance-field-error-color); font-size: var(--performance-field-error-font-size); line-height: var(--performance-field-error-line-height); }
.reviewee-add-footer { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
.reviewee-add-footer .performance-button { min-width: var(--performance-button-min-width); }
</style>
