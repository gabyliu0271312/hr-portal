<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    :title="title"
    :width="'var(--performance-workbench-editor-width)'"
    :loading="loading"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="$emit('update:modelValue', false)"
  >
    <form class="workbench-editor-form" @submit.prevent="submit('active')">
      <div class="workbench-editor-field">
        <div class="workbench-editor-label"><PerformanceRequiredLabel :label="kind === 'announcement' ? '公告标题' : '入口标题'" /></div>
        <div class="workbench-editor-control">
          <div class="localized-input-row">
            <PerformanceTextField v-model="form.title" variant="feishu-input" :maxlength="128" :invalid="Boolean(errors.title)" :placeholder="''">
              <template #suffix><span class="language-tag">中文</span></template>
            </PerformanceTextField>
            <button class="language-add" type="button" aria-label="添加英文" @click="showComingSoon('多语言')">
              <AddOutlinedIcon /><span>添加英文</span>
            </button>
          </div>
          <span v-if="errors.title" class="workbench-editor-error">{{ errors.title }}</span>
        </div>
      </div>

      <div class="workbench-editor-field">
        <div class="workbench-editor-label"><PerformanceRequiredLabel label="跳转链接" /></div>
        <div class="workbench-editor-control">
          <div class="localized-input-row">
            <PerformanceTextField v-model="form.link" variant="feishu-input" :maxlength="2048" :invalid="Boolean(errors.link)" :placeholder="''">
              <template #suffix><span class="language-tag">中文</span></template>
            </PerformanceTextField>
            <button class="language-add" type="button" aria-label="添加英文" @click="showComingSoon('多语言')">
              <AddOutlinedIcon /><span>添加英文</span>
            </button>
          </div>
          <span v-if="errors.link" class="workbench-editor-error">{{ errors.link }}</span>
        </div>
      </div>

      <div v-if="kind === 'announcement'" class="workbench-editor-field">
        <div class="workbench-editor-label"><PerformanceRequiredLabel label="展示周期" /></div>
        <div class="workbench-editor-control">
          <PerformanceRadioGroup
            v-model="form.cycleScope"
            name="workbench-cycle-scope"
            aria-label="展示周期"
            :options="cycleOptions"
            direction="vertical"
            :gap="8"
          />
          <PerformanceSearchSelect
            v-if="form.cycleScope === 'specified'"
            v-model="form.cycleSelection"
            class="workbench-editor-select"
            aria-label="指定周期"
            placeholder="请选择"
            :options="cycleSelectionOptions"
            :disabled="cycleOptionsLoading"
            @open="loadCycleOptions"
          />
          <span v-if="errors.cycleSelection" class="workbench-editor-error">{{ errors.cycleSelection }}</span>
        </div>
      </div>

      <div v-if="kind === 'announcement'" class="workbench-editor-field">
        <div class="workbench-editor-label"><PerformanceRequiredLabel label="可见范围" /></div>
        <div class="workbench-editor-control">
          <PerformanceRadioGroup
            v-model="form.visibilityScope"
            name="workbench-visibility-scope"
            aria-label="可见范围"
            :options="visibilityOptions"
            direction="vertical"
            :gap="8"
          />
          <PerformanceSearchSelect
            v-if="form.visibilityScope === 'role'"
            v-model="form.personSelection"
            class="workbench-editor-select"
            aria-label="指定人员"
            placeholder="请选择"
            :options="personSelectionOptions"
          />
          <span v-if="errors.personSelection" class="workbench-editor-error">{{ errors.personSelection }}</span>
        </div>
      </div>

      <div v-else class="workbench-editor-field">
        <div class="workbench-editor-label"><PerformanceRequiredLabel label="图标" :required="false" /></div>
        <div class="workbench-editor-control"><PerformanceTextField v-model="form.icon" :maxlength="128" placeholder="可选，填写图标标识" /></div>
      </div>

      <div v-if="kind === 'announcement'" class="workbench-editor-ack">
        <span class="workbench-editor-ack__label">弹窗并要求查看人确认知悉</span>
        <PerformanceSwitch v-model="form.requireAck" aria-label="弹窗并要求查看人确认知悉" />
        <a href="#" @click.prevent="showComingSoon('查看示例')">查看示例</a>
      </div>
    </form>

    <template #footer>
      <div class="workbench-editor-footer">
        <button class="workbench-editor-button workbench-editor-button--default" type="button" :disabled="loading" @click="$emit('update:modelValue', false)">取消</button>
        <button class="workbench-editor-button workbench-editor-button--primary-outline" type="button" :disabled="loading" @click="submit('inactive')">保存</button>
        <button class="workbench-editor-button workbench-editor-button--primary" type="button" :disabled="loading" @click="submit('active')">启用</button>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceCycleApi } from '@/api/performance'
import type {
  PerformanceWorkbenchAnnouncement,
  PerformanceWorkbenchAnnouncementPayload,
  PerformanceWorkbenchEntry,
  PerformanceWorkbenchEntryPayload,
} from '@/api/performance'
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceRadioGroup, { type PerformanceRadioOption } from './PerformanceRadioGroup.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'
import PerformanceTextField from './PerformanceTextField.vue'

type Kind = 'entry' | 'announcement'
type Item = PerformanceWorkbenchEntry | PerformanceWorkbenchAnnouncement

const props = withDefaults(defineProps<{
  modelValue: boolean
  kind: Kind
  item?: Item | null
  loading?: boolean
}>(), { item: null, loading: false })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [payload: PerformanceWorkbenchEntryPayload | PerformanceWorkbenchAnnouncementPayload]
}>()

const form = reactive({
  title: '',
  link: '',
  icon: '',
  cycleScope: 'all',
  cycleSelection: '',
  visibilityScope: 'all',
  personSelection: '',
  requireAck: false,
})
const errors = reactive({ title: '', link: '', cycleSelection: '', personSelection: '' })
const title = computed(() => `${props.item ? '编辑' : '新建'}${props.kind === 'announcement' ? '公告' : '更多入口'}`)
const cycleOptions: PerformanceRadioOption[] = [
  { value: 'all', label: '所有周期' },
  { value: 'specified', label: '指定周期' },
]
const visibilityOptions: PerformanceRadioOption[] = [
  { value: 'all', label: '所有人' },
  { value: 'role', label: '指定人员' },
]
const cycleSelectionOptions = ref<PerformanceSearchSelectOption[]>([])
const personSelectionOptions: PerformanceSearchSelectOption[] = [
  { value: 'HRBP', label: '管理范围内有人参评的 HRBP' },
  { value: 'REAL_LINE_MANAGER', label: '管理范围内有人参评的实线上级' },
]
const cycleOptionsLoading = ref(false)

watch(() => [props.modelValue, props.item, props.kind], () => {
  if (!props.modelValue) return
  const item = props.item
  form.title = item?.title || ''
  form.link = item?.link || ''
  form.icon = props.kind === 'entry' && item && 'icon' in item ? item.icon || '' : ''
  form.cycleScope = props.kind === 'announcement' && item && 'cycle_label' in item && item.cycle_label === '指定周期' ? 'specified' : 'all'
  form.cycleSelection = props.kind === 'announcement' && item && 'cycle_ref' in item ? item.cycle_ref || '' : ''
  form.visibilityScope = props.kind === 'announcement' && item && ['指定角色', '指定人员'].includes(item.visibility) ? 'role' : 'all'
  form.personSelection = props.kind === 'announcement' && item && 'visibility_role' in item ? item.visibility_role || '' : ''
  form.requireAck = props.kind === 'announcement' && item && 'require_ack' in item ? item.require_ack : false
  errors.title = ''
  errors.link = ''
  errors.cycleSelection = ''
  errors.personSelection = ''
}, { immediate: true })

async function loadCycleOptions() {
  if (cycleOptionsLoading.value || cycleSelectionOptions.value.length) return
  cycleOptionsLoading.value = true
  try {
    const page = await performanceCycleApi.list(undefined, 1, 100)
    cycleSelectionOptions.value = page.items.map(cycle => ({ value: cycle.cycle_ref, label: cycle.name }))
  } catch {
    ElMessage.error('周期列表加载失败，请稍后重试')
  } finally {
    cycleOptionsLoading.value = false
  }
}

function showComingSoon(name: string) { ElMessage.info(`${name}功能将在后续版本开放`) }

function submit(status: 'active' | 'inactive') {
  errors.title = form.title.trim() ? '' : `请输入${props.kind === 'announcement' ? '公告' : '入口'}标题`
  errors.link = form.link.trim() ? '' : '请输入跳转链接'
  errors.cycleSelection = props.kind === 'announcement' && form.cycleScope === 'specified' && !form.cycleSelection ? '请选择周期' : ''
  errors.personSelection = props.kind === 'announcement' && form.visibilityScope === 'role' && !form.personSelection ? '请选择人员范围' : ''
  if (errors.title || errors.link || errors.cycleSelection || errors.personSelection) return
  if (props.kind === 'entry') {
    emit('save', { title: form.title.trim(), link: form.link.trim(), icon: form.icon.trim() || null, visibility: '所有人', status })
    return
  }
  emit('save', {
    title: form.title.trim(),
    link: form.link.trim(),
    cycle_label: form.cycleScope === 'specified' ? '指定周期' : '所有周期',
    cycle_ref: form.cycleScope === 'specified' ? form.cycleSelection || null : null,
    visibility: form.visibilityScope === 'role' ? '指定人员' : '所有人',
    visibility_role: form.visibilityScope === 'role' ? (form.personSelection as 'HRBP' | 'REAL_LINE_MANAGER') || null : null,
    require_ack: form.requireAck,
    status,
  })
}
</script>

<style scoped>
.workbench-editor-form { min-height: 0; padding: 0; }
.workbench-editor-field { display: flex; flex-direction: column; gap: 8px; margin-bottom: var(--performance-workbench-editor-field-gap); }
.workbench-editor-label { display: flex; align-items: center; min-height: 22px; color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: 22px; }
.workbench-editor-control { min-width: 0; }
.localized-input-row { display: flex; flex-direction: column; align-items: flex-start; max-width: 100%; }
.localized-input-row :deep(.performance-text-field) { width: 100%; flex: 1 1 auto; }
.localized-input-row :deep(.feishu-input-wrap) { border-radius: var(--performance-control-radius); }
.language-tag { display: inline-flex; align-items: center; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: var(--radius-sm); background: var(--performance-workbench-editor-language-tag-bg); color: var(--performance-workbench-editor-language-tag-color); font-size: var(--font-size-xs); font-weight: 500; line-height: 20px; white-space: nowrap; writing-mode: horizontal-tb; }
.language-add { display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 22px; margin: 8px 0 0; padding: 2px 4px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-primary-hover); font: 400 var(--font-size-md)/18px var(--font-sans); cursor: pointer; }
.language-add:hover { background: var(--color-bg-hover); }
.language-add :deep(svg) { width: 14px; height: 14px; }
.workbench-editor-error { display: block; margin-top: 4px; color: var(--color-text-danger-strong); font-size: var(--font-size-sm); line-height: 20px; }
.workbench-editor-select { margin-top: 4px; margin-left: var(--performance-workbench-editor-select-indent); width: calc(100% - var(--performance-workbench-editor-select-indent)); }
.workbench-editor-ack { display: flex; align-items: center; min-height: 66px; margin-top: -4px; color: var(--color-text-primary); font-size: var(--font-size-md); line-height: 22px; }
.workbench-editor-ack__label { margin-right: 4px; font-weight: 600; }
.workbench-editor-ack :deep(.performance-switch) { flex: 0 0 var(--performance-workbench-editor-compact-switch-width); width: var(--performance-workbench-editor-compact-switch-width); height: var(--performance-workbench-editor-compact-switch-height); }
.workbench-editor-ack a { margin-left: 8px; color: var(--color-primary); text-decoration: none; }
.workbench-editor-footer { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.workbench-editor-button { display: inline-flex; align-items: center; justify-content: center; min-width: 80px; height: var(--performance-control-height); padding: 4px 11px; box-sizing: border-box; border: 1px solid var(--color-line-control); border-radius: var(--performance-control-radius); font: 400 var(--font-size-md)/22px var(--font-sans); cursor: pointer; }
.workbench-editor-button--default { background: var(--color-bg-card); color: var(--color-text-primary); }
.workbench-editor-button--primary-outline { border-color: var(--color-primary-hover); background: var(--color-bg-card); color: var(--color-primary-hover); }
.workbench-editor-button--primary { border-color: var(--color-primary-hover); background: var(--color-primary-hover); color: #fff; }
.workbench-editor-button:disabled { cursor: not-allowed; opacity: .6; }
</style>
