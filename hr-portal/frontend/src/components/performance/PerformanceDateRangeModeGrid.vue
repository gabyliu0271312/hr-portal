<template>
  <div
    class="performance-date-range-picker__mode-body"
    :class="`performance-date-range-picker__mode-body--${mode}`"
    role="grid"
  >
    <button
      v-for="cell in cells"
      :key="cell.value"
      class="performance-date-range-picker__mode-cell"
      type="button"
      role="gridcell"
      @click="emit('pick', cell.value)"
    >
      <span class="performance-date-range-picker__mode-cell-inner">{{ cell.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
export type ModeCell = { value: number; label: string }

defineProps<{
  mode: 'month' | 'year'
  cells: ModeCell[]
}>()

const emit = defineEmits<{ pick: [value: number] }>()
</script>

<style scoped>
.performance-date-range-picker__mode-body { display: grid; height: var(--performance-date-panel-body-height); align-content: space-between; justify-content: space-between; }
.performance-date-range-picker__mode-body--month { grid-template-columns: repeat(3, var(--performance-date-mode-cell-width)); }
.performance-date-range-picker__mode-body--year { grid-template-columns: repeat(4, var(--performance-date-mode-cell-width)); }
.performance-date-range-picker__mode-cell { display: flex; align-items: center; justify-content: center; width: var(--performance-date-mode-cell-width); height: var(--performance-date-panel-cell-size); padding: 0; border: 0; background: transparent; color: var(--color-text-primary); font: inherit; cursor: pointer; }
.performance-date-range-picker__mode-cell-inner { display: flex; align-items: center; justify-content: center; width: var(--performance-date-mode-cell-width); height: var(--performance-date-panel-cell-size); border-radius: var(--performance-date-panel-cell-radius); font-size: var(--font-size-md); line-height: var(--performance-date-panel-cell-size); transition: background-color var(--duration-base) var(--ease-standard); }
.performance-date-range-picker__mode-cell:hover .performance-date-range-picker__mode-cell-inner { background: var(--performance-date-panel-range-background); }
</style>
