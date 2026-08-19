<template>
  <div class="workflow-fixed-executor-field ud__row ud__form__item">
    <div class="workflow-fixed-executor-field__label ud__col ud__form__item__label">
      <label class="workflow-fixed-executor-field__label-text ud__text"><h4>{{ label }}</h4></label>
      <span v-if="required" class="workflow-fixed-executor-field__required ud__text ud__form__item__required-mark">*</span>
    </div>
    <div class="workflow-fixed-executor-field__control ud__col ud__form__item__control">
      <div class="workflow-fixed-executor-field__content">
        <PerformanceExecutorTag :executor="executor" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PerformanceExecutorTag from './PerformanceExecutorTag.vue'
import type { PerformanceExecutorOption } from './performanceExecutorOptions'

withDefaults(defineProps<{
  executor: PerformanceExecutorOption
  label?: string
  required?: boolean
}>(), {
  label: '环节执行人',
  required: true,
})
</script>

<style scoped>
.workflow-fixed-executor-field{display:flex;flex-direction:column;flex-wrap:wrap;align-items:stretch;gap:8px;width:100%;min-width:0;min-height:54px;margin:0 0 20px;box-sizing:border-box;color:#1f2329;font:400 14px/22.001px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
.workflow-fixed-executor-field__label{display:flex;position:relative;justify-content:flex-start;align-items:baseline;min-height:22px;max-width:100%;box-sizing:border-box}
.workflow-fixed-executor-field__label-text{display:flex;align-items:center;overflow:hidden;min-width:min-content;box-sizing:border-box;color:#1f2329;cursor:default}
.workflow-fixed-executor-field__label-text h4{margin:0;box-sizing:border-box;color:rgba(0,0,0,.85);font:600 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;cursor:default}
.workflow-fixed-executor-field__required{display:flex;align-items:center;margin-left:2px;box-sizing:border-box;color:#f54a45;font:400 14px/22px SimSun,sans-serif}
.workflow-fixed-executor-field__control{display:flex;position:relative;justify-content:flex-start;align-items:baseline;min-height:23px;max-width:100%;box-sizing:border-box}
.workflow-fixed-executor-field__content{display:flex;flex-wrap:wrap;align-items:baseline;max-width:100%;box-sizing:border-box}
</style>
