<script setup lang="ts">
interface FixedScoreOption { [key: string]: unknown }

defineProps<{
  options: FixedScoreOption[]
}>()

function display(value: unknown): string {
  return value === undefined || value === null || value === '' ? '—' : String(value)
}
</script>

<template>
  <div class="fixed-score-options-summary sub-fixed-score-options" data-component="fixed-score-options-summary" aria-label="分值选项">
    <div class="config-field-label">分值选项</div>
    <div class="fixed-score-option-list sub-fixed-option-list">
      <div v-for="(option, index) in options" :key="String(option.id ?? index)" class="fixed-score-option sub-fixed-option bg-B-100 px-4 text-14 min-w-23 text-center">{{ display(option.value) }}</div>
    </div>
  </div>
</template>

<style scoped>
.fixed-score-options-summary { width: 100%; min-width: 0; }
.config-field-label { height: 22px; margin-bottom: 8px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.fixed-score-option-list { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; width: 100%; min-width: 0; }
.fixed-score-option { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: max-content; min-width: 46px; height: 21px; min-height: 0; padding: 0 8px; box-sizing: border-box; border: 0; border-radius: 1000px; background-color: #e1eaff; color: #0c296e; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; font-size: 14px; font-weight: 400; line-height: 21px; text-align: center; }
</style>
