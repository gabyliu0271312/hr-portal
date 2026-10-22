<template>
  <section class="reviewer-360-content" :aria-label="`${pageTitle}预览`">
    <PerformanceTemplateSectionCard :title="pageTitle" :actions="[]" selectable :selected="headingSelected" @select="$emit('select-heading')" />
    <PerformanceContentSelectionFrame variant="root" :selected="rootSelected" class="reviewer-360-content__body" @click="$emit('select-root')">
      <div class="reviewer-360-content__content">
        <div class="reviewer-360-content__intro">
          <div>通过「搜索」添加 360° 评估人</div>
          <span>已邀请 0 人，除系统默认邀请外，仍需邀请至少 5 人。上级和 HRBP 也可以给员工邀请 360° 评估人。</span>
        </div>
        <div class="reviewer-360-content__search">搜索成员</div>
        <div class="reviewer-360-content__list-title">已邀请列表：当前共 0 人</div>
        <div class="reviewer-360-content__segmented" role="radiogroup" aria-label="邀请列表分组方式">
          <span class="is-checked" role="radio" aria-checked="true">按关系</span>
          <span role="radio" aria-checked="false">按邀请人</span>
        </div>
        <table class="reviewer-360-content__table">
          <colgroup><col class="reviewer-360-content__table-title" /><col /></colgroup>
          <tbody>
            <tr><td>相同上级同事</td><td></td></tr>
            <tr><td>不同上级同事</td><td></td></tr>
            <tr><td>虚线上级</td><td></td></tr>
            <tr><td>直属下级</td><td></td></tr>
          </tbody>
        </table>
      </div>
    </PerformanceContentSelectionFrame>
    <div v-if="showActions" class="reviewer-360-content__actions">
      <PerformanceTemplateOperateBar :actions="actions" @action="$emit('action', $event)" />
    </div>
  </section>
</template>

<script setup lang="ts">
import PerformanceContentSelectionFrame from './PerformanceContentSelectionFrame.vue'
import PerformanceTemplateOperateBar from './PerformanceTemplateOperateBar.vue'
import PerformanceTemplateSectionCard from './PerformanceTemplateSectionCard.vue'

defineProps<{
  pageTitle: string
  headingSelected: boolean
  rootSelected: boolean
  showActions: boolean
  actions: Array<{ key: string; label: string }>
}>()

defineEmits<{
  'select-heading': []
  'select-root': []
  action: [key: string]
}>()
</script>

<style scoped>
.reviewer-360-content{width:var(--performance-content-width);max-width:100%;color:var(--color-text-primary);font:400 14px/21px var(--font-sans)}
.reviewer-360-content__body{position:relative;background:var(--color-bg-card);border-radius:4px;cursor:pointer}
.reviewer-360-content__content{padding:24px 24px 0;pointer-events:none}
.reviewer-360-content__intro{margin-bottom:8px}
.reviewer-360-content__intro div,.reviewer-360-content__list-title{font-weight:600}
.reviewer-360-content__intro span{color:var(--color-text-secondary)}
.reviewer-360-content__search{display:flex;align-items:center;height:32px;padding:0 12px;box-sizing:border-box;border:1px solid rgba(187,191,196,.5);border-radius:6px;color:var(--color-text-placeholder)}
.reviewer-360-content__list-title{margin-top:20px}
.reviewer-360-content__segmented{display:inline-flex;height:32px;margin:8px 0 12px;border-radius:6px;background:var(--color-bg-card);vertical-align:top}
.reviewer-360-content__segmented span{display:block;padding:4px 16px;box-sizing:border-box;border:1px solid var(--color-border);border-radius:6px 0 0 6px;line-height:22px}
.reviewer-360-content__segmented span+span{border-left:0;border-radius:0 6px 6px 0}
.reviewer-360-content__segmented .is-checked{border-color:var(--color-primary);color:var(--performance-button-text-color);font-weight:500}
.reviewer-360-content__table{width:100%;border-collapse:collapse;table-layout:fixed;border-radius:6px;overflow:hidden;box-shadow:0 0 0 1px rgba(187,191,196,.5);color:var(--color-text-secondary)}
.reviewer-360-content__table-title{width:109px;background:#f5f6f7}
.reviewer-360-content__table td{height:52px;padding:15px 12px;box-sizing:border-box;border:1px solid #e4e5e7;line-height:21px}
.reviewer-360-content__actions{position:sticky;z-index:20;bottom:8px;border-radius:0 0 4px 4px;overflow:hidden}
</style>
