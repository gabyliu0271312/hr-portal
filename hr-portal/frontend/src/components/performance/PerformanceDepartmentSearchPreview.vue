<script setup lang="ts">
import UiCheckbox from '@/components/ui/UiCheckbox.vue'

defineProps<{ tree: boolean }>()
</script>

<template>
  <div class="department-preview" aria-hidden="true" inert>
    <div class="department-preview__panel">
      <div class="department-preview__search">
        <span>{{ tree ? '二级部门' : '三级部门' }}</span>
        <span class="department-preview__search-icons"><span v-if="tree">⊗</span><span class="department-preview__up" /></span>
      </div>
      <div class="department-preview__results" :class="{ 'department-preview__results--tree': tree }">
        <template v-if="tree">
          <div class="department-preview__tree-row"><span class="department-preview__arrow" /><UiCheckbox :model-value="false">一级部门</UiCheckbox></div>
          <div class="department-preview__tree-row department-preview__tree-row--second"><span class="department-preview__arrow" /><UiCheckbox :model-value="true"><span class="department-preview__highlight">二级部门</span></UiCheckbox></div>
          <div class="department-preview__tree-row department-preview__tree-row--third"><span class="department-preview__arrow" /><UiCheckbox :model-value="false">三级部门</UiCheckbox></div>
        </template>
        <template v-else>
          <div class="department-preview__result department-preview__result--active"><div><span class="department-preview__highlight">三级部门</span> A</div><div class="department-preview__path">一级部门/二级部门</div></div>
          <div class="department-preview__result"><div><span class="department-preview__highlight">三级部门</span> B</div><div class="department-preview__path">一级部门/二级部门</div></div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.department-preview { display: flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: calc(var(--spacing-8) * 5 + var(--spacing-6)); padding: var(--spacing-4); background: var(--performance-review-readonly-surface); pointer-events: none; user-select: none; }
.department-preview__panel { width: 100%; padding: var(--spacing-3); box-sizing: border-box; border-radius: var(--radius-lg); background: var(--ui-surface-background); box-shadow: var(--shadow-dialog); color: var(--color-text-primary); font-size: var(--font-size-md); line-height: var(--performance-settings-help-line-height); }
.department-preview__search { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-2); padding: var(--spacing-1) var(--spacing-3); border: var(--ui-control-border-width) solid var(--color-primary); border-radius: var(--radius-md); }
.department-preview__search-icons { display: flex; align-items: center; gap: var(--spacing-3); color: var(--color-text-tertiary); }
.department-preview__up { width: var(--spacing-2); height: var(--spacing-2); border-top: var(--ui-control-border-width) solid currentColor; border-left: var(--ui-control-border-width) solid currentColor; transform: translateY(25%) rotate(45deg); }
.department-preview__results { margin-top: var(--spacing-1); padding: var(--spacing-1); border: var(--ui-control-border-width) solid var(--color-line-divider); border-radius: var(--radius-md); }
.department-preview__results--tree { padding: var(--spacing-2) var(--spacing-3); box-shadow: var(--shadow-popover); }
.department-preview__tree-row { display: flex; align-items: center; gap: var(--spacing-2); }
.department-preview__tree-row--second { padding-left: var(--spacing-4); }
.department-preview__tree-row--third { padding-left: var(--spacing-7); }
.department-preview__arrow { width: 0; height: 0; border-left: var(--spacing-1) solid transparent; border-right: var(--spacing-1) solid transparent; border-top: var(--spacing-1) solid var(--color-text-tertiary); }
.department-preview__highlight { color: var(--color-primary); }
.department-preview__result { padding: var(--spacing-1) var(--spacing-2); border-radius: var(--radius-sm); }
.department-preview__result--active { background: var(--performance-review-readonly-surface); }
.department-preview__path { color: var(--color-text-placeholder); font-size: var(--font-size-sm); }
</style>
