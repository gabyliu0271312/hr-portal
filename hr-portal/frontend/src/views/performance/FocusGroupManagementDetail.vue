<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { performanceFocusGroupApi, type PerformanceFocusGroup } from '@/api/performance'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'
import FocusGroupDetailInfo from '@/components/performance/focus-group/FocusGroupDetailInfo.vue'
import FocusGroupMembersPanel from '@/components/performance/focus-group/FocusGroupMembersPanel.vue'
import FocusGroupChangeLogPanel from '@/components/performance/focus-group/FocusGroupChangeLogPanel.vue'

const route = useRoute()
const router = useRouter()

const cycleId = computed(() => {
  const value = Number(route.params.cycleId)
  return Number.isInteger(value) && value > 0 ? value : null
})
const groupId = computed(() => {
  const value = Number(route.params.groupId)
  return Number.isInteger(value) && value > 0 ? value : null
})
/** 项目版路由 activity-focus-people/:groupId 的 tab 是 project，否则周期版 */
const isProject = computed(() => route.name === 'PerformanceActivityFocusPeopleDetail')
const group = ref<PerformanceFocusGroup | null>(null)
const loading = ref(false)
const error = ref('')
const activeTab = ref<'members' | 'change-log'>('members')
const tabs = [
  { key: 'members', label: '人员列表' },
  { key: 'change-log', label: '变更记录' },
]

async function load() {
  if (!cycleId.value || !groupId.value) return
  loading.value = true
  error.value = ''
  try {
    group.value = await performanceFocusGroupApi.get(cycleId.value, groupId.value)
  } catch (e: any) {
    group.value = null
    error.value = e?.response?.data?.detail || '人员组加载失败'
  } finally {
    loading.value = false
  }
}

function goBack() {
  const tab = isProject.value ? 'project' : 'semester'
  void router.push({ name: 'PerformanceCycleFocusPeople', params: { cycleId: cycleId.value }, query: { tab } })
}

function goEdit() {
  if (!cycleId.value || !groupId.value) return
  // 周期版/项目版共用编辑表单路由（FocusPeopleGroupCreate 按 query.tab 渲染对应表单）
  void router.push({ name: 'PerformanceCycleFocusPeopleEdit', params: { cycleId: cycleId.value, groupId: groupId.value }, query: { tab: isProject.value ? 'project' : 'semester' } })
}

onMounted(() => {
  void load()
  activeTab.value = 'members'
})
watch(groupId, () => {
  void load()
})
</script>

<template>
  <UiFullScreenModal :title="`人员组管理`" :show-footer="false" @back="goBack">
    <div class="focus-group-detail-page">
      <p v-if="error" class="focus-group-detail-error" role="alert">{{ error }}</p>
      <FocusGroupDetailInfo v-if="group" :group="group" :is-project="isProject">
        <template #header-action>
          <UiButton v-if="!loading" variant="secondary" class="focus-group-detail-edit" :disabled="error !== ''" @click="goEdit">编辑</UiButton>
        </template>
      </FocusGroupDetailInfo>
      <PerformanceLineTabs v-if="group" v-model="activeTab" :tabs="tabs" fill class="focus-group-detail-tabs">
        <FocusGroupMembersPanel v-if="activeTab === 'members'" :cycle-id="cycleId" :group-id="groupId" :group-name="group.name" />
        <FocusGroupChangeLogPanel v-else :cycle-id="cycleId" :group-id="groupId" />
      </PerformanceLineTabs>
    </div>
  </UiFullScreenModal>
</template>

<style scoped>
.focus-group-detail-page {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  min-height: 0;
  align-self: stretch;
  width: 100%;
  box-sizing: border-box;
  gap: var(--spacing-4);
  padding: var(--spacing-5) var(--spacing-6);
  overflow: hidden;
}
.focus-group-detail-error { margin: 0; color: var(--performance-field-error-color); font-size: var(--font-size-md); line-height: 22px; }
.focus-group-detail-tabs { flex: 1 1 auto; min-height: 0; width: 100%; --performance-line-tabs-surface: transparent; }
</style>
