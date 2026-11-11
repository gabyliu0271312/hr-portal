import { ref } from 'vue'
import type { ReminderContext } from '@/components/performance/performanceReminder'

export function usePerformanceMemberReminder() {
  const reminderOpen = ref(false)
  const reminderContext = ref<ReminderContext | null>(null)
  function openMemberReminder(value: { projectId: number; cycleId?: number; employeeNo: string; displayName?: string; sourceTaskId?: number; nodeId?: string; taskId?: number }) {
    if (!value.projectId || !value.employeeNo) return
    reminderContext.value = {
      projectId: value.projectId, cycleId: value.cycleId || 0, employeeNo: value.employeeNo,
      sourceTaskId: value.sourceTaskId, targetTaskId: value.taskId,
      nodeId: value.nodeId || '', nodeType: 'member', reviewType: 'member-remind',
      title: value.displayName ? `${value.displayName} · 催办` : '催办', sectionTitle: '未完成的任务',
    }
    reminderOpen.value = true
  }
  return { reminderOpen, reminderContext, openMemberReminder }
}
