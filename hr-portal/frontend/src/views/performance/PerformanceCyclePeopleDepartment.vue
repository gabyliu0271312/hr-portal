<template>
  <UiFullScreenModal title="人员与部门列表" :show-footer="false" content-scroll="inner" @back="goBack">
    <PerformancePeopleDepartmentTabs
      v-model="activeKey"
      :cycle-id="cycleId"
      :show-department="showDepartment"
      :people-count="peopleCount"
      :department-count="departmentCount"
    />
  </UiFullScreenModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import PerformancePeopleDepartmentTabs from '@/components/performance/PerformancePeopleDepartmentTabs.vue'

const route = useRoute()
const router = useRouter()

const cycleId = computed(() => Number(route.params.cycleId))
const showDepartment = computed(() => route.query.showDepartment !== 'false')
const peopleCount = computed(() => Number(route.query.peopleCount ?? 0))
const departmentCount = computed(() => Number(route.query.departmentCount ?? 0))
const activeKey = ref(String(route.query.activeKey ?? 'employee'))

watch(activeKey, key => {
  void router.replace({ query: { ...route.query, activeKey: key } })
})

function goBack() {
  void router.push({ name: 'PerformanceCycles' })
}
</script>
