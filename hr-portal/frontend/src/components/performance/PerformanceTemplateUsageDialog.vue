<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    title="使用该模板的周期与项目"
    title-id="template-usage-dialog-title"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('close')"
  >
    <template #description>共 {{ summary?.cycle_count ?? 0 }} 个周期，{{ summary?.project_count ?? 0 }} 个项目</template>
    <div class="template-usage">
      <div class="template-usage__frame">
        <div class="template-usage__row template-usage__header">
          <span class="template-usage__col-name">项目名称</span>
          <span class="template-usage__col-status">项目状态</span>
        </div>
        <div v-for="semester in semesters" :key="semester.semester_id">
          <button
            type="button"
            class="template-usage__row template-usage__period"
            :class="{ 'is-expanded': expanded.has(semester.semester_id) }"
            :aria-expanded="expanded.has(semester.semester_id)"
            @click="toggle(semester.semester_id)"
          >
            <span class="template-usage__col-name">
              <svg
                class="template-usage__arrow"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                data-icon="ExpandRightFilled"
              ><path d="M18.627 11.22a1 1 0 0 1 0 1.56L8.291 21.084a1 1 0 0 1-1.626-.78V3.696a1 1 0 0 1 1.626-.78l10.335 8.305Z" fill="currentColor" /></svg>
              <span class="template-usage__period-name">{{ semester.semester_name }}</span>
            </span>
            <span class="template-usage__col-status" />
          </button>
          <div v-if="expanded.has(semester.semester_id)" class="template-usage__activities">
            <div v-for="activity in semester.activities" :key="activity.project_id" class="template-usage__row template-usage__activity">
              <span class="template-usage__col-name template-usage__activity-name">{{ activity.project_name }}</span>
              <span class="template-usage__col-status">
                <span class="template-usage__activity-badge" :class="`is-${statusClass(activity.status)}`"><i class="template-usage__activity-dot" aria-hidden="true" />{{ statusLabel(activity.status) }}</span>
              </span>
            </div>
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
  summary?: { cycle_count: number; project_count: number }
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
/* REA 坐标：弹窗内容区 x=674 起，主列 418px（表头文字 12px 内缩、数据 26px），状态列 120px（文本 14px 内缩） */
.template-usage { display: flex; min-width: 0; }
.template-usage__frame { flex: 1 1 auto; min-width: 0; box-sizing: border-box; border: 1px solid rgba(187, 191, 196, 0.5); border-bottom: 0; }
.template-usage__row { display: flex; align-items: center; box-sizing: border-box; width: 100%; border-bottom: 1px solid rgba(187, 191, 196, 0.5); }
.template-usage__col-name { flex: 0 0 418px; box-sizing: border-box; min-width: 0; padding-left: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.template-usage__col-status { flex: 1 1 120px; box-sizing: border-box; padding-left: 14px; padding-right: 12px; }
.template-usage__header { height: 54px; color: #646a73; font: 600 14px/22px var(--font-sans); }
.template-usage__period { height: 30px; padding: 0; border: 0; border-bottom: 1px solid rgba(187, 191, 196, 0.5); background: #f5f6f7; color: var(--color-text-primary); font: 400 14px/22px var(--font-sans); cursor: pointer; }
.template-usage__period:hover { background: var(--color-surface-disabled); }
.template-usage__period .template-usage__col-name { display: flex; align-items: center; gap: 4px; padding-left: 12px; }
.template-usage__arrow { flex: 0 0 10px; color: #646a73; transform: rotate(0); transition: transform var(--duration-fast) var(--ease-standard); }
.template-usage__period.is-expanded .template-usage__arrow { transform: rotate(90deg); }
.template-usage__period-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.template-usage__activity { height: 54px; }
.template-usage__activity .template-usage__col-name { padding-left: 26px; color: var(--color-text-primary); font: 400 14px/22px var(--font-sans); }
.template-usage__activity-badge { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; box-sizing: border-box; border-radius: 3px; background: #eff0f1; color: #1f2329; font: 400 14px/22px var(--font-sans); }
.template-usage__activity-dot { width: 6px; height: 6px; border-radius: 50%; }
.template-usage__activity-badge.is-started .template-usage__activity-dot { background: #32a645; }
.template-usage__activity-badge.is-finished .template-usage__activity-dot { background: #8f959e; }
.template-usage__activity-badge.is-pending .template-usage__activity-dot { background: var(--color-text-placeholder); }
</style>
