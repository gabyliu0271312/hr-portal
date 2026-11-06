<template>
  <PerformanceDialogShell
    v-model="open"
    title="设置范围"
    width="840px"
    :loading="saving"
    @close="close"
  >
    <template #description>设置后，将向 HRBP 隐藏实时满足该范围的人的绩效详情。</template>

    <PerformanceAudienceRuleEditor
      v-model="groups"
      scope-mode
      :show-scope-heading="false"
      :min-groups="0"
      default-field="directLeader"
      group-title-pattern="条件组 {index}"
      :allowed-fields="[...HRBP_BLACKLIST_FIELDS]"
      :organization-tree="organizationTree"
      :person-options="personOptions"
      :loading="loadingOptions"
      :disabled="saving"
      @open-options="$emit('open-options')"
      @search-people="$emit('search-people', $event)"
    />

    <template #footer>
      <div class="hrbp-scope-dialog__actions">
        <UiButton variant="secondary" :disabled="saving" @click="close">取消</UiButton>
        <UiButton variant="primary" :disabled="saving || !valid" @click="submit">确定</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceAudienceGroup, PerformanceHrbpOrganizationNode } from '@/api/performance'
import PerformanceAudienceRuleEditor from './PerformanceAudienceRuleEditor.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import { HRBP_BLACKLIST_FIELDS } from './performanceConditionFields'
import UiButton from '../ui/UiButton.vue'

export type PerformanceHrbpScopeFormValue = {
  groups: PerformanceAudienceGroup[]
}

const props = withDefaults(defineProps<{
  modelValue: boolean
  saving?: boolean
  loadingOptions?: boolean
  organizationTree?: PerformanceHrbpOrganizationNode[]
  personOptions?: { value: string; label: string }[]
  initialValue?: PerformanceAudienceGroup[]
}>(), {
  saving: false,
  loadingOptions: false,
  organizationTree: () => [],
  personOptions: () => [],
  initialValue: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [value: PerformanceHrbpScopeFormValue]
  'open-options': []
  'search-people': [value: string]
}>()

const open = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})
const groups = ref<PerformanceAudienceGroup[]>([])

const valid = computed(() => groups.value.every(group =>
  group.conditions.length > 0
  && group.conditions.every(condition =>
    HRBP_BLACKLIST_FIELDS.includes(condition.field as typeof HRBP_BLACKLIST_FIELDS[number])
    && ['include', 'exclude'].includes(condition.operator)
    && condition.values.length > 0
    && condition.values.every(value => value.trim()),
  ),
))

function resetForm() {
  groups.value = props.initialValue
    ? JSON.parse(JSON.stringify(props.initialValue))
    : [{ conditions: [{ field: 'directLeader', operator: 'include', values: [] }] }]
}

function close() {
  if (props.saving) return
  emit('update:modelValue', false)
}

function submit() {
  if (props.saving || !valid.value) return
  emit('submit', {
    groups: JSON.parse(JSON.stringify(groups.value)),
  })
}

watch(() => props.modelValue, visible => {
  if (visible) resetForm()
})
</script>

<style scoped>
.hrbp-scope-dialog__actions { display: flex; justify-content: flex-end; gap: var(--performance-button-gap); }
</style>
