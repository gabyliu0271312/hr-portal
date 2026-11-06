<template>
  <div class="hrbp-invisible-scope-summary">
    <template v-for="(group, index) in groups" :key="index">
      <div v-if="index" class="hrbp-invisible-scope-summary__or">或</div>
      <div class="hrbp-invisible-scope-summary__group">
        <div class="hrbp-invisible-scope-summary__title">条件组 {{ index + 1 }}</div>
        <div v-for="(condition, conditionIndex) in group.conditions" :key="conditionIndex" class="hrbp-invisible-scope-summary__condition">
          <span v-if="conditionIndex" class="hrbp-invisible-scope-summary__logic">且</span>
          <span>{{ PERFORMANCE_CONDITION_FIELDS[condition.field as PerformanceConditionField]?.label || condition.field }}</span>
          <span>{{ condition.operator === 'exclude' ? '不包含' : '包含' }}</span>
          <span v-for="value in condition.values" :key="value" class="hrbp-invisible-scope-summary__value">{{ label(condition.field, value) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceAudienceGroup, PerformanceHrbpOrganizationNode, PerformanceOtherPermissionPerson } from '@/api/performance'
import { PERFORMANCE_CONDITION_FIELDS, type PerformanceConditionField } from './performanceConditionFields'

const props = defineProps<{
  groups: PerformanceAudienceGroup[]
  people: PerformanceOtherPermissionPerson[]
  organizationTree: PerformanceHrbpOrganizationNode[]
}>()
const peopleLabels = computed(() => new Map(props.people.map(person => [person.employee_no, person.display_name])))
const organizationLabels = computed(() => {
  const labels = new Map<string, string>()
  function visit(nodes: PerformanceHrbpOrganizationNode[]) {
    for (const node of nodes) {
      labels.set(node.value, node.label)
      visit(node.children || [])
    }
  }
  visit(props.organizationTree)
  return labels
})
function label(field: string, value: string) {
  return (field === 'department' ? organizationLabels.value : peopleLabels.value).get(value) || value
}
</script>

<style scoped>
.hrbp-invisible-scope-summary { font-size: var(--font-size-md); line-height: 22px; }
.hrbp-invisible-scope-summary__group { padding: var(--spacing-4); border-radius: var(--radius-lg); background: var(--performance-evaluation-rule-surface); }
.hrbp-invisible-scope-summary__title { margin-bottom: var(--spacing-2); color: var(--color-text-primary); }
.hrbp-invisible-scope-summary__condition { display: flex; align-items: center; flex-wrap: wrap; gap: var(--spacing-2); overflow-wrap: anywhere; }
.hrbp-invisible-scope-summary__condition + .hrbp-invisible-scope-summary__condition { margin-top: var(--spacing-2); }
.hrbp-invisible-scope-summary__logic { color: var(--color-text-secondary); }
.hrbp-invisible-scope-summary__value { max-width: 100%; padding: 1px 8px; border-radius: var(--radius-md); background: var(--performance-select-tag-background); color: var(--performance-select-tag-text); }
.hrbp-invisible-scope-summary__or { padding: var(--spacing-2) 0; }
</style>
