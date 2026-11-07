<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { performanceFocusGroupApi, performanceProjectApi } from '@/api/performance'
import type { PerformanceSearchSelectOption } from '@/components/performance/PerformanceSearchSelect.vue'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceSurfaceCard from '@/components/performance/PerformanceSurfaceCard.vue'
import PerformanceFormItem from '@/components/performance/PerformanceFormItem.vue'
import PerformanceLocalizedInput from '@/components/performance/PerformanceLocalizedInput.vue'
import PerformanceSearchSelect from '@/components/performance/PerformanceSearchSelect.vue'
import PerformanceCheckbox from '@/components/performance/PerformanceCheckbox.vue'

const route = useRoute()
const router = useRouter()
const cycleId = computed(() => {
  const value = Number(route.params.cycleId)
  return Number.isInteger(value) && value > 0 ? value : null
})
const groupId = computed(() => Number(route.params.groupId) || null)
const detailLoaded = ref(false)
const employeeNos = ref<string[]>([])
const detailError = ref('')
const nameZh = ref('')
const nameEn = ref('')
const descriptionZh = ref('')
const descriptionEn = ref('')
const nameHasEnglish = ref(false)
const descriptionHasEnglish = ref(false)
const projectIds = ref<string[]>([])
const projectOptions = ref<PerformanceSearchSelectOption[]>([])
const roles = ref({ leader: true, inner_leader: false, hrbp: false, activity_manager: false })
const saving = ref(false)

const roleLabels = {
  leader: '关联评估项目的被评估人的实线上级',
  inner_leader: '仅组内成员的实线上级',
  hrbp: '关联评估项目的被评估人的 HRBP',
  activity_manager: '关联评估项目的项目管理员',
} as const

function setRole(key: keyof typeof roles.value, value: boolean) {
  if (key === 'leader' && !value) roles.value.inner_leader = false
  roles.value[key] = value
}

// 「关联评估项目」下拉：与飞书一致，页面加载时一次性拉取有权限的评估项目（点击下拉不再发请求）
async function loadProjects() {
  if (!cycleId.value) return
  try {
    const result = await performanceProjectApi.list(cycleId.value, '', 1, 100)
    projectOptions.value = result.items.map(project => ({ value: String(project.id), label: project.name }))
  } catch {
    projectOptions.value = []
  }
}

async function loadDetail() {
  if (!cycleId.value || !groupId.value) return
  try {
    const group = await performanceFocusGroupApi.get(cycleId.value, groupId.value)
    nameZh.value = group.name
    nameEn.value = group.en_name
    nameHasEnglish.value = Boolean(group.en_name)
    descriptionZh.value = group.description['zh-CN'] || ''
    descriptionEn.value = group.description['en-US'] || ''
    descriptionHasEnglish.value = Boolean(descriptionEn.value)
    projectIds.value = group.activity_ids
    employeeNos.value = group.employee_nos
    for (const role of Object.keys(roles.value) as Array<keyof typeof roles.value>) roles.value[role] = group.roles_of_managing_scope.includes(role)
    detailLoaded.value = true
  } catch (error: any) {
    detailError.value = error?.response?.data?.detail || '人员组加载失败，请返回重试'
  }
}

async function submit() {
  if (!cycleId.value || saving.value || (groupId.value && !detailLoaded.value)) return
  if (!nameZh.value.trim()) {
    ElMessage.warning('请填写人员组名称')
    return
  }
  if (!projectIds.value.length) {
    ElMessage.warning('请选择关联评估项目')
    return
  }
  saving.value = true
  try {
    const save = groupId.value
      ? (payload: Parameters<typeof performanceFocusGroupApi.create>[1]) => performanceFocusGroupApi.update(cycleId.value!, groupId.value!, payload)
      : (payload: Parameters<typeof performanceFocusGroupApi.create>[1]) => performanceFocusGroupApi.create(cycleId.value!, payload)
    await save({
      name: nameZh.value.trim(),
      en_name: nameEn.value.trim(),
      tab: 'project',
      description: { 'zh-CN': descriptionZh.value.trim(), 'en-US': descriptionEn.value.trim() },
      employee_nos: employeeNos.value,
      scope_mode: 'manual',
      activity_ids: projectIds.value,
      roles_of_managing_scope: Object.entries(roles.value).filter(([, checked]) => checked).map(([role]) => role),
    })
    ElMessage.success('人员组已创建')
    void router.push({ name: 'PerformanceCycleFocusPeople', params: { cycleId: cycleId.value } })
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '创建失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

function goBack() {
  void router.push({ name: 'PerformanceCycleFocusPeople', params: { cycleId: cycleId.value } })
}

onMounted(() => { void loadProjects(); void loadDetail() })
</script>

<template>
  <UiFullScreenModal :title="groupId ? '编辑人员组' : '新建人员组'" :submitting="saving" @submit="submit" @cancel="goBack" @back="goBack">
    <div class="focus-group-project-page">
      <p v-if="detailError" role="alert">{{ detailError }}</p>
      <PerformanceSurfaceCard title="基本信息" class="focus-group-project-card">
        <PerformanceLocalizedInput v-model="nameZh" label="人员组名称" input-id="focus-group-project-name-zh" placeholder="请输入中文名称" required @add-language="nameHasEnglish = true" />
        <PerformanceLocalizedInput v-if="nameHasEnglish" v-model="nameEn" label="英文名称" input-id="focus-group-project-name-en" placeholder="请输入英文名称" />
        <PerformanceLocalizedInput v-model="descriptionZh" label="人员组说明" input-id="focus-group-project-description-zh" placeholder="请输入人员组说明" @add-language="descriptionHasEnglish = true" />
        <PerformanceLocalizedInput v-if="descriptionHasEnglish" v-model="descriptionEn" label="英文说明" input-id="focus-group-project-description-en" placeholder="请输入英文说明" />
        <PerformanceFormItem label="关联评估项目" required>
          <template #description>仅可关联你有管理权限的评估项目，关联后，仅可圈入所关联项目的被评估人。</template>
          <PerformanceSearchSelect
            v-model="projectIds"
            :options="projectOptions"
            placeholder="请选择"
            empty-text="暂无可选项"
            multiple
            aria-label="关联评估项目"
          />
        </PerformanceFormItem>
      </PerformanceSurfaceCard>

      <PerformanceSurfaceCard title="人员范围设置" class="focus-group-project-card">
        <p class="focus-group-project-desc">人员组创建后，有所关联项目的管理权限的用户，可在后续页面手动维护人员范围，人员范围不支持动态更新。</p>
        <PerformanceFormItem label="前台可管理人员范围的角色">
          <template #description>若勾选下述角色，则授权该角色可在前台管理该人员组人员范围。</template>
          <div class="focus-group-project-roles">
            <PerformanceCheckbox v-model="roles.leader" :label="roleLabels.leader" @update:model-value="setRole('leader', $event)" />
            <div v-if="roles.leader" class="focus-group-project-roles__sub">
              <PerformanceCheckbox v-model="roles.inner_leader" :label="roleLabels.inner_leader" @update:model-value="setRole('inner_leader', $event)" />
            </div>
            <PerformanceCheckbox v-model="roles.hrbp" :label="roleLabels.hrbp" @update:model-value="setRole('hrbp', $event)" />
            <PerformanceCheckbox v-model="roles.activity_manager" :label="roleLabels.activity_manager" @update:model-value="setRole('activity_manager', $event)" />
          </div>
        </PerformanceFormItem>
      </PerformanceSurfaceCard>
    </div>
    <template #footer>
      <UiButton variant="primary" class="focus-group-project-ok" :loading="saving" @click="submit">确定</UiButton>
      <UiButton variant="secondary" class="focus-group-project-cancel" @click="goBack">取消</UiButton>
    </template>
  </UiFullScreenModal>
</template>

<style scoped>
.focus-group-project-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--performance-content-width);
  margin: 0 auto;
  padding: var(--spacing-5);
  box-sizing: border-box;
  gap: var(--spacing-4);
  --performance-input-field-gap: var(--spacing-4);
}
.focus-group-project-card {
  padding: var(--spacing-5);
}
.focus-group-project-card :deep(.performance-form-item:last-child) {
  margin-bottom: 0;
}
.focus-group-project-desc {
  margin: 0 0 var(--spacing-4);
  color: var(--performance-text-secondary);
  font-size: var(--font-size-md);
  line-height: var(--performance-input-line-height);
}
.focus-group-project-roles {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}
.focus-group-project-roles__sub {
  padding-left: var(--spacing-6);
}
.focus-group-project-ok,
.focus-group-project-cancel {
  min-width: var(--performance-button-min-width);
}
</style>
