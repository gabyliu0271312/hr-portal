<template>
  <section class="notification-methods-card">
    <div class="notification-methods-card__group">
      <div class="notification-methods-card__title">通知方式</div>
      <div class="notification-methods-card__description">系统通知（待办提醒、催办等）的推送方式</div>
      <div class="notification-methods-card__method">
        <PerformanceCheckbox
          :model-value="true"
          label="飞书推送"
          disabled
        />
      </div>
      <div class="notification-methods-card__method">
        <PerformanceCheckbox
          :model-value="emailEnabled"
          label="邮件"
          :disabled="loading"
          @update:model-value="$emit('update:emailEnabled', $event)"
        />
        <div class="notification-methods-card__helper">勾选后，邮件通知将会发送到参评人员在飞书中配置的邮箱。</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import PerformanceCheckbox from './PerformanceCheckbox.vue'

withDefaults(defineProps<{ emailEnabled: boolean; loading?: boolean }>(), {
  loading: false,
})

defineEmits<{
  (event: 'update:emailEnabled', value: boolean): void
}>()
</script>

<style scoped>
.notification-methods-card{box-sizing:border-box;width:100%;margin-bottom:16px;padding:20px;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px;color:#1f2329;font-family:var(--font-sans)}
.notification-methods-card__group{min-width:0}
.notification-methods-card__title{font-size:16px;font-weight:600;line-height:24px;color:#1f2329}
.notification-methods-card__description{font-size:14px;font-weight:400;line-height:22px;color:#646a73}
.notification-methods-card__method{margin-top:8px;font-size:14px;line-height:21px}
.notification-methods-card__method :deep(.performance-checkbox){width:auto}
.notification-methods-card__helper{margin-left:24px;color:#646a73;font-size:12px;font-weight:400;line-height:22px}
@media (max-width:720px){.notification-methods-card{padding:16px}}
</style>
