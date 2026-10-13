<template>
  <section class="assessment-project-card" data-source-state-id="SNAPSPEC-PM-T015-DEFAULT-20260923">
    <PerformanceAssessmentMethodHeader
      class="assessment-project-card__header"
      title="项目制考核"
      description="可在模板中设置由项目上级评估的环节，并在周期中导入各成员间的业务项目合作关系"
      help-href="https://bytedance.feishu.cn/docx/PNtJd308uoghHAxx3DschCZPnrf"
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', $event)"
    />

    <template v-if="modelValue">
      <div class="assessment-project-card__divider" />

    <div class="assessment-project-card__section">
      <div class="assessment-project-card__section-title">项目合作关系来源</div>
      <div class="assessment-project-card__source-row">
        <PerformanceCheckbox
          class="assessment-project-card__source-checkbox"
          :model-value="true"
          label=""
          disabled
        />
        <div class="assessment-project-card__source-content">
          <div class="assessment-project-card__source-label">管理员在周期中手动导入</div>
          <div class="assessment-project-card__role-summary">
            <div class="assessment-project-card__role-summary-header">
              <span>导入时可选的项目角色</span>
              <button type="button" class="assessment-project-card__edit" aria-label="编辑导入时可选的项目角色" @click="$emit('edit-roles')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="EditOutlined"><path d="m17.57 7.244-.006-.006.37-.37a1 1 0 0 0 .001-1.412l-3.434-3.453-.002-.002a1 1 0 0 0-1.414 0l-.705.706.01.01L2 13.186V17a1 1 0 0 0 1 1h3.814L17.57 7.244Zm-3.273.389-2.015-2.015 1.487-1.515 2.023 2.034-1.495 1.496Zm-3.415-.587 2.002 2.002-6.913 6.92h-.004l-1.934-1.935v-.003l.808-.808.004.003 6.849-6.984ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z" fill="currentColor" /></svg>
                <span>编辑</span>
              </button>
            </div>
            <div>--</div>
          </div>
        </div>
      </div>
    </div>

    <div class="assessment-project-card__divider assessment-project-card__divider--dashed" />

    <div class="assessment-project-card__section assessment-project-card__visibility-section">
      <div class="assessment-project-card__section-title">查看项目团队绩效结果的入口可见性设置</div>
      <div class="assessment-project-card__visibility-row">
        <PerformanceCheckbox
          class="assessment-project-card__visibility-checkbox"
          :model-value="projectResultVisible"
          label=""
          aria-label="项目上级可查看项目团队绩效结果"
          @update:model-value="$emit('update:projectResultVisible', $event)"
        />
        <div class="assessment-project-card__visibility-copy">
          <div>项目上级可查看「项目团队绩效结果」</div>
          <div class="assessment-project-card__visibility-description">开启后，项目上级可在「查看项目团队绩效结果」中汇总查看所负责的各级项目下级的绩效数据，具体内容以模板配置为准</div>
          <button type="button" class="assessment-project-card__example" @click="$emit('show-example')">查看功能示例</button>
        </div>
      </div>
    </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import PerformanceAssessmentMethodHeader from './PerformanceAssessmentMethodHeader.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'

defineProps<{
  modelValue: boolean
  projectResultVisible: boolean
}>()

defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'update:projectResultVisible', value: boolean): void
  (event: 'edit-roles'): void
  (event: 'show-example'): void
}>()
</script>

<style scoped>
.assessment-project-card{box-sizing:border-box;width:100%;margin-bottom:16px;padding:20px;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.03) 0 4px 16px 4px,rgba(31,35,41,.02) 0 4px 8px,rgba(31,35,41,.02) 0 2px 4px -4px;color:#1f2329;font-family:var(--font-sans)}
.assessment-project-card__help,.assessment-project-card__example{display:inline-flex;align-items:center;padding:0;border:0;background:transparent;color:#1456f0;font:400 14px/22px var(--font-sans);text-decoration:none;cursor:pointer}
.assessment-project-card__help:hover,.assessment-project-card__example:hover{color:#3370ff}
.assessment-project-card__divider{height:0;margin:20px 0;border-top:1px solid rgba(31,35,41,.15)}
.assessment-project-card__divider--dashed{border-top-style:dashed}
.assessment-project-card__section{display:flex;flex-direction:column;gap:12px}
.assessment-project-card__section-title{font-size:14px;font-weight:600;line-height:21px;color:#1f2329}
.assessment-project-card__source-row,.assessment-project-card__visibility-row{display:flex;align-items:flex-start;gap:8px}
.assessment-project-card__source-checkbox{width:16px;flex:0 0 16px}
.assessment-project-card__source-content{min-width:0;flex:1}
.assessment-project-card__source-label{margin-bottom:4px;font-size:14px;line-height:21px;color:#1f2329}
.assessment-project-card__role-summary{padding:16px 12px;border-radius:6px;background:#f8f9fa;font-size:14px;line-height:21px;color:#1f2329}
.assessment-project-card__role-summary-header{display:flex;align-items:center;justify-content:space-between;color:#646a73}
.assessment-project-card__edit{display:inline-flex;align-items:center;gap:4px;padding:2px 4px;border:0;background:transparent;color:#1456f0;cursor:pointer}
.assessment-project-card__edit:hover{color:#3370ff}
.assessment-project-card__visibility-checkbox{width:16px;flex:0 0 16px}
.assessment-project-card__visibility-copy{margin-left:0;font-size:14px;line-height:21px;color:#1f2329}
.assessment-project-card__visibility-description{color:#8f959e;font-size:14px;line-height:21px}
.assessment-project-card__example{margin-top:2px}
</style>
