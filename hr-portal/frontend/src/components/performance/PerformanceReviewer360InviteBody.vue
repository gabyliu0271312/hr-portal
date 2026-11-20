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
}>(), {
  items: () => [], total: 0,
  minimumHint: '除系统默认邀请外，仍需邀请至少 5 人。上级和 HRBP 也可以给员工邀请 360° 评估人',
  limitHint: '', interactive: false,
})
const groupBy = ref<'relationship' | 'inviter'>('relationship')
const groups = computed(() => {
  const grouped = new Map<string, PerformanceReview360InvitedReviewer[]>()
  if (groupBy.value === 'relationship') {
    for (const label of ['相同上级同事', '不同上级同事', '虚线上级', '直属下级']) grouped.set(label, [])
  }
  for (const item of props.items) {
    const label = groupBy.value === 'relationship' ? item.relationship || '关系未提供' : item.source_label || '邀请来源未提供'
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
      <span>已邀请 {{ total }} 人，{{ minimumHint }}。</span>
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
              <div v-for="row in group.rows" :key="row.employee_no" class="reviewer-360-content__person">
                <slot name="row-person" :row="row"><PerformanceMemberIdentity :display-name="row.display_name" :identity-status="row.identity_status" /></slot>
                <slot name="actions" :row="row" />
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.reviewer-360-invite-body{min-width:0;color:var(--color-text-primary);font:400 14px/21px var(--font-sans)}
.reviewer-360-content__intro{margin-bottom:8px}
.reviewer-360-content__intro>div:first-child,.reviewer-360-content__list-title{font-weight:600}
.reviewer-360-content__intro span,.reviewer-360-content__limit{color:var(--color-text-secondary)}
.reviewer-360-content__search{display:flex;align-items:center;height:32px;padding:0 12px;box-sizing:border-box;border:1px solid rgba(187,191,196,.5);border-radius:6px;color:var(--color-text-placeholder)}
.reviewer-360-content__list-title{margin-top:20px}
.reviewer-360-content__segmented{display:inline-flex;height:32px;margin:8px 0 12px;border-radius:6px;background:var(--color-bg-card);vertical-align:top}
.reviewer-360-content__segmented span,.reviewer-360-content__segmented button{display:block;padding:4px 16px;box-sizing:border-box;border:1px solid var(--color-border);border-radius:6px 0 0 6px;background:var(--color-bg-card);color:inherit;font:inherit;line-height:22px}
.reviewer-360-content__segmented button{cursor:pointer}
.reviewer-360-content__segmented span+span,.reviewer-360-content__segmented button+button{border-left:0;border-radius:0 6px 6px 0}
.reviewer-360-content__segmented .is-checked{border-color:var(--color-primary);color:var(--performance-button-text-color);font-weight:500}
.reviewer-360-content__table{width:100%;border-collapse:collapse;table-layout:fixed;border-radius:6px;overflow:hidden;box-shadow:0 0 0 1px rgba(187,191,196,.5);color:var(--color-text-secondary)}
.reviewer-360-content__table-title{width:109px;background:#f5f6f7}
.reviewer-360-content__table td{height:52px;padding:15px 12px;box-sizing:border-box;border:1px solid var(--color-border);line-height:21px;overflow-wrap:anywhere}
.reviewer-360-content__people{display:flex;flex-wrap:wrap;gap:12px 20px;min-width:0}
.reviewer-360-content__person{display:flex;align-items:center;gap:8px;min-width:0;max-width:100%}
</style>
