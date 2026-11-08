<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    title="使用该模板的周期与项目"
    title-id="template-usage-dialog-title"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('close')"
  >
    <div class="template-usage" role="list" aria-label="使用该模板的周期与项目">
      <div v-for="semester in semesters" :key="semester.semester_id" class="template-usage__semester" :class="{ 'is-expanded': expanded.has(semester.semester_id) }">
        <button type="button" class="template-usage__semester-head" :aria-expanded="expanded.has(semester.semester_id)" @click="toggle(semester.semester_id)">
          <svg
            class="template-usage__arrow"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            data-icon="ExpandRightFilled"
          ><path d="M18.627 11.22a1 1 0 0 1 0 1.56L8.291 21.084a1 1 0 0 1-1.626-.78V3.696a1 1 0 0 1 1.626-.78l10.335 8.305Z" fill="currentColor" /></svg>
          <span class="template-usage__semester-name">{{ semester.semester_name }}</span>
        </button>
        <div v-if="expanded.has(semester.semester_id)" class="template-usage__activities">
          <div v-for="activity in semester.activities" :key="activity.project_id" class="template-usage__activity">
            <span class="template-usage__activity-name">{{ activity.project_name }}</span>
            <span class="template-usage__activity-badge" :class="`is-${statusClass(activity.status)}`"><i class="template-usage__activity-dot" aria-hidden="true" />{{ statusLabel(activity.status) }}</span>
          </div>
        </div>
      </div>
    </div>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import PerformanceDialogShell from '@/components/performance/PerformanceDialogShell.vue'
import type { PerformanceRefSemesterActivity } from '@/api/performance'

const props = defineProps<{
  modelValue: boolean
  semesters: PerformanceRefSemesterActivity[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; close: [] }>()

const expanded = ref<Set<number>>(new Set())

// 默认全部展开（REA 实测 ud__collapse-item-active）
watch(() => props.modelValue, (open) => {
  if (open) expanded.value = new Set(props.semesters.map((semester) => semester.semester_id))
}, { immediate: true })

function toggle(semesterId: number) {
  const next = new Set(expanded.value)
  if (next.has(semesterId)) next.delete(semesterId)
  else next.add(semesterId)
  expanded.value = next
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '待完成配置',
  STARTED: '已启动',
  ARCHIVED: '已结束',
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] || status
}

function statusClass(status: string) {
  if (status === 'STARTED') return 'started'
  if (status === 'ARCHIVED') return 'finished'
  return 'pending'
}
</script>

<style scoped>
.template-usage { display: flex; flex-direction: column; }
.template-usage__semester { border-bottom: 1px solid rgba(187, 191, 196, 0.5); }
.template-usage__semester:last-child { border-bottom: 0; }
.template-usage__semester-head { display: flex; align-items: center; height: 30px; width: 100%; padding: 0 12px; box-sizing: border-box; border: 0; background: #f5f6f7; color: var(--color-text-primary); font: 400 14px/22px var(--font-sans); cursor: pointer; }
.template-usage__semester-head:hover { background: var(--color-surface-disabled); }
.template-usage__arrow { margin-right: 8px; color: #646a73; transform: rotate(0); transition: transform var(--duration-fast) var(--ease-standard); }
.template-usage__semester.is-expanded .template-usage__arrow { transform: rotate(90deg); }
.template-usage__semester-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.template-usage__activities { padding-left: 7px; }
.template-usage__activity { display: flex; align-items: center; height: 54px; box-sizing: border-box; border-bottom: 1px solid rgba(187, 191, 196, 0.5); }
.template-usage__activity:last-child { border-bottom: 0; }
.template-usage__activity-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-primary); font: 400 14px/22px var(--font-sans); }
.template-usage__activity-badge { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; box-sizing: border-box; border-radius: 3px; background: #eff0f1; color: #1f2329; font: 400 14px/22px var(--font-sans); }
.template-usage__activity-dot { width: 6px; height: 6px; border-radius: 50%; }
.template-usage__activity-badge.is-started .template-usage__activity-dot { background: #32a645; }
.template-usage__activity-badge.is-finished .template-usage__activity-dot { background: #8f959e; }
.template-usage__activity-badge.is-pending .template-usage__activity-dot { background: var(--color-text-placeholder); }
</style>
