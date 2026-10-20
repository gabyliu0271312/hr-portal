<template>
  <PerformanceOtherSettingsCard title="任务逾期限制">
    <div v-for="(item, index) in items" :key="item.label" class="overdue-setting__item" :class="{ 'is-first': index === 0 }">
      <PerformanceReadOnlySettingRow :checked="checked[index] ?? false" :disabled="disabled" :label="item.label" @update:checked="updateChecked(index, $event)" />
      <p class="overdue-setting__helper" :class="{ 'is-link-line': item.link }">
        <template v-if="item.link">勾选后，可在<span class="overdue-setting__link">周期设置</span>关闭逾期任务提交机会</template>
        <template v-else>{{ item.helper }}</template>
      </p>
    </div>
  </PerformanceOtherSettingsCard>
</template>

<script setup lang="ts">
import PerformanceOtherSettingsCard from './PerformanceOtherSettingsCard.vue'
import PerformanceReadOnlySettingRow from './PerformanceReadOnlySettingRow.vue'

const props = defineProps<{ checked: boolean[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:checked': [value: boolean[]] }>()

function updateChecked(index: number, value: boolean) {
  const next = [...props.checked]
  next[index] = value
  emit('update:checked', next)
}

const items = [
  { label: '环节截止后，未提交的任务仍有 1 次提交机会', helper: '勾选后，若任务执行人未提交过内容，则仍可以在逾期后提交 1 次。但无法编辑已提交的内容，也无法在校准环节修改结果。' },
  { label: '360° 评估截止后，允许添加新的自愿评估任务，并有 1 次提交机会', helper: '勾选后，对于开启自愿评估的项目，即使 360° 评估环节已经截止，成员仍可选择被评估人发起自愿评估' },
  { label: '允许按周期关闭逾期任务提交机会', link: true },
]
</script>

<style scoped>
.overdue-setting__item { margin-top: var(--spacing-5); }
.overdue-setting__item.is-first { margin-top: 0; }
.overdue-setting__helper { margin: 0 0 0 24px; color: var(--performance-settings-text-secondary); font-size: var(--font-size-md); line-height: 20px; }
.overdue-setting__link { color: var(--color-primary); }
</style>
