<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PerformanceReview360InvitedReviewer } from '@/api/performance'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'

const props = withDefaults(defineProps<{
  items?: PerformanceReview360InvitedReviewer[]
  total?: number
  minimumHint?: string
  limitHint?: string
  interactive?: boolean
  editable?: boolean
}>(), {
  items: () => [], total: 0,
  minimumHint: '除系统默认邀请外，建议至少邀请 5 人。上级和 HRBP 也可以给员工邀请 360° 评估人',
  limitHint: '', interactive: false, editable: false,
})
const groupBy = ref<'relationship' | 'inviter'>('relationship')
function inviterGroup(item: PerformanceReview360InvitedReviewer) {
  if (item.source_type === 'DEFAULT') return '系统默认邀请'
  if (item.source_type === 'SELF') return '自己邀请'
  if (item.source_type === 'MANAGER') return '上级邀请'
  return 'HRBP 或其他人邀请'
}
const groups = computed(() => {
  const grouped = new Map<string, PerformanceReview360InvitedReviewer[]>()
  const labels = groupBy.value === 'relationship'
    ? ['不同上级同事', '相同上级同事']
    : ['系统默认邀请', '自己邀请', '上级邀请', 'HRBP 或其他人邀请']
  for (const label of labels) grouped.set(label, [])
  for (const item of props.items) {
    const label = groupBy.value === 'relationship' ? item.relationship || '关系未提供' : inviterGroup(item)
    if (!grouped.has(label)) grouped.set(label, [])
    grouped.get(label)!.push(item)
  }
  return [...grouped].map(([label, rows]) => ({ label, rows }))
})
</script>

<template>
  <div class="reviewer-360-invite-body">
    <div class="reviewer-360-content__intro">
      <div>通过「搜索」添加 360° 评估人</div>
      <span>{{ minimumHint }}。</span>
      <div v-if="limitHint" class="reviewer-360-content__limit">{{ limitHint }}</div>
    </div>
    <slot name="search"><div class="reviewer-360-content__search">搜索成员</div></slot>
    <div class="reviewer-360-content__list-title">已邀请列表：当前共 {{ total }} 人</div>
    <div class="reviewer-360-content__segmented" role="radiogroup" aria-label="邀请列表分组方式">
      <template v-if="interactive">
        <button type="button" role="radio" :aria-checked="groupBy === 'relationship'" :class="{ 'is-checked': groupBy === 'relationship' }" @click="groupBy = 'relationship'">按关系</button>
        <button type="button" role="radio" :aria-checked="groupBy === 'inviter'" :class="{ 'is-checked': groupBy === 'inviter' }" @click="groupBy = 'inviter'">按邀请人</button>
      </template>
      <template v-else>
        <span class="is-checked" role="radio" aria-checked="true">按关系</span>
        <span role="radio" aria-checked="false">按邀请人</span>
      </template>
    </div>
    <table class="reviewer-360-content__table" aria-label="360° 评估邀请列表">
      <colgroup><col class="reviewer-360-content__table-title" /><col /></colgroup>
      <tbody>
        <tr v-for="group in groups" :key="group.label">
          <td>{{ group.label }}</td>
          <td>
            <div class="reviewer-360-content__people">
              <div v-for="row in group.rows" :key="row.employee_no" class="reviewer-360-content__person" :class="{ 'is-removable': editable && row.can_revoke === true }" :title="row.can_revoke ? undefined : row.revoke_disabled_reason || undefined">
                <slot name="row-person" :row="row"><PerformanceMemberIdentity size="sm" :display-name="row.display_name" :identity-status="row.identity_status" /></slot>
                <slot v-if="editable && row.can_revoke === true" name="actions" :row="row" />
              </div>
              <span v-if="!group.rows.length" class="reviewer-360-content__empty">暂无人员</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.reviewer-360-invite-body{min-width:0;color:var(--color-text-primary);font:400 var(--font-size-md)/21px var(--font-sans)}
.reviewer-360-content__intro{margin-bottom:var(--spacing-2)}
.reviewer-360-content__intro>div:first-child,.reviewer-360-content__list-title{font-weight:600}
.reviewer-360-content__intro span,.reviewer-360-content__limit{color:var(--color-text-secondary)}
.reviewer-360-content__search{display:flex;align-items:center;height:var(--performance-button-height);padding:0 var(--spacing-3);box-sizing:border-box;border:1px solid var(--color-border);border-radius:var(--performance-control-radius);color:var(--color-text-placeholder)}
.reviewer-360-content__list-title{margin-top:var(--spacing-5)}
.reviewer-360-content__segmented{display:inline-flex;height:32px;margin:8px 0 12px;border-radius:var(--performance-control-radius);background:var(--color-bg-card);vertical-align:top}
.reviewer-360-content__segmented span,.reviewer-360-content__segmented button{display:block;padding:4px 16px;box-sizing:border-box;border:1px solid var(--color-border);border-radius:6px 0 0 6px;background:var(--color-bg-card);color:inherit;font:inherit;line-height:22px}
.reviewer-360-content__segmented button{cursor:pointer}
.reviewer-360-content__segmented span+span,.reviewer-360-content__segmented button+button{border-left:0;border-radius:0 6px 6px 0}
.reviewer-360-content__segmented .is-checked{border-color:var(--color-primary);color:var(--performance-button-text-color);font-weight:500}
.reviewer-360-content__table{width:100%;border-collapse:collapse;table-layout:fixed;border-radius:var(--performance-control-radius);overflow:hidden;box-shadow:0 0 0 1px var(--color-border);color:var(--color-text-secondary)}
.reviewer-360-content__table-title{width:var(--performance-invite-group-width);background:var(--performance-review-readonly-surface)}
.reviewer-360-content__table td{height:52px;padding:15px 12px;box-sizing:border-box;border:1px solid var(--color-border);line-height:21px;overflow-wrap:anywhere}
.reviewer-360-content__table td:first-child{white-space:nowrap}
.reviewer-360-content__people{display:flex;flex-wrap:wrap;gap:var(--spacing-2);min-width:0}
.reviewer-360-content__person{display:flex;align-items:center;gap:var(--spacing-1);min-width:0;max-width:100%;padding:2px var(--spacing-2) 2px 2px;border-radius:var(--radius-pill);background:var(--performance-invite-tag-background);color:var(--color-text-primary)}
.reviewer-360-content__person.is-removable{background:var(--performance-invite-tag-editable-background)}
.reviewer-360-content__empty{color:var(--color-text-placeholder)}
</style>
