<template>
  <PerformanceDialogShell v-model="open" :title="title" :loading="props.saving">
    <PerformancePromptNotice class="hrbp-permission-dialog__notice" type="info" multiline>
      <div class="hrbp-permission-dialog__notice-copy">
        <p>1. HRBP 将拥有其权限范围内成员的数据权限。具体可查看「权限管理 / 角色配置」中的 HRBP 角色详情。</p>
        <p>2. 由于“不可见人员”的优先级高于“权限范围”，若某成员被设置为 HRBP 的“不可见人员”，即使将 Ta 加入 HRBP 的“权限范围”，HRBP 仍无法查看或操作该成员的数据。</p>
      </div>
    </PerformancePromptNotice>

    <div v-if="props.loadingOptions" class="hrbp-permission-dialog__loading" role="status">正在加载实时花名册...</div>
    <div v-else class="hrbp-permission-dialog__form">
      <PerformanceFormItem label="HRBP" required :invalid="submitted && !form.hrbp">
        <PerformancePersonSelect
          v-model="form.hrbp"
          aria-label="HRBP"
          :options="props.hrbpOptions"
          placeholder="请选择"
        />
      </PerformanceFormItem>

      <PerformanceFormItem label="权限范围" required :invalid="submitted && !form.scope.length">
        <template #description>
          <p class="hrbp-permission-dialog__description">部门内的人员信息来自实时花名册中当前在职人员的组织架构</p>
        </template>
        <PerformanceOrganizationSelect
          v-model="form.scope"
          :nodes="props.organizationTree"
        />
      </PerformanceFormItem>

      <div class="hrbp-permission-dialog__switch-row">
        <label for="hrbp-invisible-people">设置「不可见人员」</label>
        <PerformanceSwitch id="hrbp-invisible-people" v-model="form.invisiblePeopleEnabled" aria-label="设置不可见人员" />
      </div>
      <p class="hrbp-permission-dialog__description hrbp-permission-dialog__invisible-description">开启并设置人员后，HRBP 将无法管理这些人的评估进度和绩效数据</p>

      <PerformancePersonSelect
        v-if="form.invisiblePeopleEnabled"
        v-model="form.invisiblePeople"
        class="hrbp-permission-dialog__invisible-select"
        aria-label="不可见人员"
        :options="props.invisiblePeopleOptions"
        placeholder="请选择"
        multiple
      />
    </div>

    <template #footer>
      <div class="hrbp-permission-dialog__actions">
        <button class="hrbp-permission-dialog__button hrbp-permission-dialog__button--primary" type="button" :disabled="props.saving || props.loadingOptions" @click="submit">确定</button>
        <button class="hrbp-permission-dialog__button hrbp-permission-dialog__button--secondary" type="button" :disabled="props.saving || props.loadingOptions" @click="close">取消</button>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { PerformanceHrbpOrganizationNode } from '@/api/performance'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceOrganizationSelect from './PerformanceOrganizationSelect.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformancePromptNotice from './PerformancePromptNotice.vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'

export type PerformanceHrbpPermissionFormValue = {
  hrbp: string
  scope: string[]
  invisiblePeopleEnabled: boolean
  invisiblePeople: string[]
}

const props = withDefaults(defineProps<{
  modelValue: boolean
  mode?: 'create' | 'edit'
  saving?: boolean
  loadingOptions?: boolean
  initialValue?: Partial<PerformanceHrbpPermissionFormValue>
  hrbpOptions?: PerformanceSearchSelectOption[]
  organizationTree?: PerformanceHrbpOrganizationNode[]
  invisiblePeopleOptions?: PerformanceSearchSelectOption[]
}>(), {
  mode: 'create',
  saving: false,
  loadingOptions: false,
  initialValue: undefined,
  hrbpOptions: () => [],
  organizationTree: () => [],
  invisiblePeopleOptions: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [value: PerformanceHrbpPermissionFormValue]
}>()

const form = reactive<PerformanceHrbpPermissionFormValue>({
  hrbp: '',
  scope: [],
  invisiblePeopleEnabled: false,
  invisiblePeople: [],
})
const submitted = ref(false)
const open = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})
const title = computed(() => props.mode === 'edit' ? '编辑 HRBP' : '添加 HRBP')

function resetForm() {
  const initial = props.initialValue || {}
  form.hrbp = initial.hrbp || ''
  form.scope = [...(initial.scope || [])]
  form.invisiblePeopleEnabled = Boolean(initial.invisiblePeopleEnabled)
  form.invisiblePeople = [...(initial.invisiblePeople || [])]
  submitted.value = false
}

function close() {
  if (!props.saving) emit('update:modelValue', false)
}

function submit() {
  submitted.value = true
  if (!form.hrbp || !form.scope.length || props.saving || props.loadingOptions) return
  emit('submit', {
    hrbp: form.hrbp,
    scope: [...form.scope],
    invisiblePeopleEnabled: form.invisiblePeopleEnabled,
    invisiblePeople: [...form.invisiblePeople],
  })
}

watch(() => props.modelValue, visible => {
  if (visible) resetForm()
})
watch(() => props.initialValue, () => {
  if (props.modelValue) resetForm()
}, { deep: true })
</script>

<style scoped>
.hrbp-permission-dialog__notice { width: 100%; min-height: 128px; margin-bottom: 28px; }
.hrbp-permission-dialog__notice :deep(.prompt-notice__text) { width: 100%; }
.hrbp-permission-dialog__notice-copy p { margin: 0; }
.hrbp-permission-dialog__notice-copy p + p { margin-top: 0; }
.hrbp-permission-dialog__loading { min-height: 244px; display: grid; place-items: center; color: #646a73; }
.hrbp-permission-dialog__form { min-width: 0; }
.hrbp-permission-dialog__description { margin: -8px 0 8px; color: #646a73; font: 400 14px/22px var(--font-sans); }
.hrbp-permission-dialog__invisible-description { margin: 0 0 20px; }
.hrbp-permission-dialog__switch-row { display: flex; align-items: center; height: 22px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.hrbp-permission-dialog__switch-row label { cursor: pointer; }
.hrbp-permission-dialog__switch-row :deep(.performance-switch) { margin-left: 4px; }
.hrbp-permission-dialog__invisible-select { margin-bottom: 4px; }
.hrbp-permission-dialog__actions { display: flex; flex-direction: row-reverse; flex-wrap: wrap; overflow: hidden; margin-bottom: -12px; }
.hrbp-permission-dialog__button { min-width: 80px; height: 32px; margin-bottom: 12px; margin-left: 12px; padding: 4px 11px; box-sizing: border-box; border: 1px solid; border-radius: 6px; font: 400 14px/22px var(--font-sans); white-space: nowrap; cursor: pointer; }
.hrbp-permission-dialog__button--primary { border-color: #1456f0; background: #1456f0; color: #fff; }
.hrbp-permission-dialog__button--secondary { border-color: #d0d3d6; background: #fff; color: #1f2329; }
.hrbp-permission-dialog__button:disabled { cursor: not-allowed; opacity: .6; }
</style>
