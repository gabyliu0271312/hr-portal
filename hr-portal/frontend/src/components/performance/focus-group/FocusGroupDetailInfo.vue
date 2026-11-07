<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { performanceUserAuthorizationApi, type PerformanceFocusGroup } from '@/api/performance'
import PerformanceFormItem from '@/components/performance/PerformanceFormItem.vue'
import PerformanceReadOnlySettingRow from '@/components/performance/PerformanceReadOnlySettingRow.vue'

const props = defineProps<{
  group: PerformanceFocusGroup
  isProject: boolean
}>()

const userNames = ref<Record<string, string>>({})
const loadingUsers = ref(false)

const scopeModeLabels: Record<number, string> = {
  0: '按规则维护人员范围',
  1: '手动维护人员范围',
  2: '仅API 写入',
}
const viewPermissionLabels: Record<number, string> = {
  0: '仅关注人可见',
  1: '有组内人员绩效查看权限的用户',
  2: '仅关注人可见',
}
const roleLabels: Record<string, string> = {
  leader: '实线上级',
  hrbp: 'HRBP',
  activity_manager: '项目管理员',
}

const nameZh = computed(() => props.group.name)
const descriptionZh = computed(() => props.group.description?.['zh-CN'] || '')
const followeeNames = computed(() => props.group.followee_user_ids.map(value => userNames.value[value] || value))
const selectedRoles = computed(() => (props.group.roles_of_managing_scope || []).map(role => roleLabels[role] || role))
const isManualScope = computed(() => props.group.scope_setting_mode === 1)
const communicateTimeText = computed(() => {
  if (!props.group.is_communicate_time) return '未设置'
  const format = (value: string) => {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value || '')
    return match ? `${match[1]} ${match[2]}` : value || '--'
  }
  return `${format(props.group.start_time || '')} ~ ${format(props.group.end_time || '')}`
})
const projectName = computed(() => props.group.activity_names?.join('、') || props.group.project_ref || '--')

watch(() => props.group.followee_user_ids, async ids => {
  if (!ids?.length) { userNames.value = {}; return }
  loadingUsers.value = true
  try {
    const result = await performanceUserAuthorizationApi.options()
    const map: Record<string, string> = {}
    for (const user of result.users) map[user.value] = user.label.replace(/（.+）/g, '')
    userNames.value = map
  } catch {
    userNames.value = {}
  } finally {
    loadingUsers.value = false
  }
}, { immediate: true })
</script>

<template>
  <div class="focus-group-detail-info">
    <section class="focus-group-detail-info__card">
      <div class="focus-group-detail-info__header">
        <h3 class="focus-group-detail-info__title">基本信息</h3>
        <slot name="header-action" />
      </div>
      <dl class="focus-group-detail-info__grid">
        <PerformanceFormItem label="人员组名称">
          <dd class="focus-group-detail-info__value">{{ nameZh }}</dd>
        </PerformanceFormItem>
        <PerformanceFormItem label="人员组说明">
          <dd class="focus-group-detail-info__value">{{ descriptionZh || '--' }}</dd>
        </PerformanceFormItem>
        <template v-if="isProject">
          <PerformanceFormItem label="关联评估项目">
            <dd class="focus-group-detail-info__value">{{ projectName }}</dd>
          </PerformanceFormItem>
          <PerformanceFormItem label="前台可管理人员范围的角色">
            <dd class="focus-group-detail-info__value focus-group-detail-info__roles">
              <span v-for="role in selectedRoles" :key="role" class="focus-group-detail-info__role-tag">{{ role }}</span>
              <span v-if="!selectedRoles.length">--</span>
            </dd>
          </PerformanceFormItem>
        </template>
        <template v-else>
          <PerformanceFormItem label="关注人">
            <dd class="focus-group-detail-info__value">
              <template v-if="loadingUsers && !followeeNames.length">…</template>
              <template v-else-if="followeeNames.length">{{ followeeNames.join('、') }}</template>
              <template v-else>--</template>
            </dd>
          </PerformanceFormItem>
          <PerformanceFormItem label="该人员组对谁可见">
            <dd class="focus-group-detail-info__value">{{ viewPermissionLabels[group.view_permission] || '--' }}</dd>
          </PerformanceFormItem>
          <PerformanceFormItem label="展示该人员组标签">
            <dd class="focus-group-detail-info__value">{{ group.show_group_tag ? '是' : '否' }}</dd>
          </PerformanceFormItem>
          <PerformanceFormItem label="人员范围设置方式">
            <dd class="focus-group-detail-info__value">{{ scopeModeLabels[group.scope_setting_mode] || `-- (${group.scope_setting_mode})` }}</dd>
          </PerformanceFormItem>
          <template v-if="isManualScope">
            <PerformanceFormItem label="前台可管理人员范围的角色">
              <dd class="focus-group-detail-info__roles-col">
                <PerformanceReadOnlySettingRow v-for="role in ['leader', 'hrbp', 'activity_manager']" :key="role" :label="roleLabels[role]" :checked="group.roles_of_managing_scope.includes(role)" :disabled="true" />
              </dd>
            </PerformanceFormItem>
          </template>
          <PerformanceFormItem label="独立结果沟通时间">
            <dd class="focus-group-detail-info__value">{{ communicateTimeText }}</dd>
          </PerformanceFormItem>
        </template>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.focus-group-detail-info {
  display: flex;
  flex: none;
  width: 100%;
}
.focus-group-detail-info__card {
  flex: 1 1 auto;
  min-width: 0;
  padding: 20px 20px 0;
  box-sizing: border-box;
  border-radius: var(--radius-lg);
  background: var(--color-surface-card);
  box-shadow: var(--shadow-dialog);
}
.focus-group-detail-info__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-4);
}
.focus-group-detail-info__title {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
  font-weight: 600;
  line-height: 24px;
}
.focus-group-detail-info__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  column-gap: 0;
  margin: 0;
}
.focus-group-detail-info__grid :deep(.performance-form-item) {
  min-width: 0;
  padding-right: 24px;
  box-sizing: border-box;
  margin-bottom: var(--performance-input-field-gap);
}
.focus-group-detail-info__grid :deep(.performance-form-item__label) {
  margin-bottom: 8px;
  font-weight: 500;
  color: #646a73;
  font-size: 14px;
  line-height: 22px;
}
.focus-group-detail-info__grid :deep(.performance-form-item__control) {
  margin-top: 0;
}
.focus-group-detail-info__value {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  font-weight: 400;
  line-height: var(--performance-input-line-height);
  overflow-wrap: anywhere;
  white-space: normal;
  overflow: visible;
}
.focus-group-detail-info__roles { display: flex; flex-wrap: wrap; gap: var(--spacing-2); }
.focus-group-detail-info__role-tag {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 var(--spacing-2);
  box-sizing: border-box;
  border-radius: var(--radius-sm);
  background: var(--performance-select-option-selected);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  line-height: 22px;
}
.focus-group-detail-info__roles-col { display: flex; flex-direction: column; gap: var(--spacing-1); margin: 0; }
</style>
