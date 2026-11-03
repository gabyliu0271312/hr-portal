<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PerformanceLineTabs from './PerformanceLineTabs.vue'
import PerformancePeopleListPanel from './PerformancePeopleListPanel.vue'
import PerformanceDepartmentListPanel from './PerformanceDepartmentListPanel.vue'

const props = defineProps<{
  cycleId: number
  showDepartment?: boolean
  peopleCount?: number
  departmentCount?: number
  modelValue?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [key: string] }>()

const activeKey = ref(props.modelValue ?? 'employee')

watch(() => props.modelValue, value => {
  if (value && value !== activeKey.value) activeKey.value = value
})
watch(activeKey, key => {
  emit('update:modelValue', key)
})
watch(() => props.showDepartment, () => {
  if (!props.showDepartment && activeKey.value === 'department') activeKey.value = 'employee'
})

const tabs = computed(() => {
  const list = [{ key: 'employee', label: `人员 (${props.peopleCount ?? 0})` }]
  if (props.showDepartment) {
    list.push({ key: 'department', label: `部门 (${props.departmentCount ?? 0})` })
  }
  return list
})
</script>

<template>
  <div class="people-department-page">
    <PerformanceLineTabs v-model="activeKey" :tabs="tabs" sticky flush fill>
      <PerformancePeopleListPanel v-if="activeKey === 'employee'" :cycle-id="cycleId" />
      <PerformanceDepartmentListPanel v-else :cycle-id="cycleId" />
    </PerformanceLineTabs>
  </div>
</template>

<style scoped>
.people-department-page {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  padding: var(--performance-table-page-top-gap) var(--performance-table-page-inset) var(--performance-table-page-bottom-gap);
  overflow: hidden;
  box-sizing: border-box;
}
</style>
