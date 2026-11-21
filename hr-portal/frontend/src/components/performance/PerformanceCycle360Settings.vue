<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElInputNumber } from 'element-plus'
import type { PerformanceCyclePayload } from '@/api/performance'
import UiCheckbox from '../ui/UiCheckbox.vue'
import UiSwitch from '../ui/UiSwitch.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'

const props = withDefaults(defineProps<{ languages: string[]; disabled?: boolean }>(), { disabled: false })
const anonymous = defineModel<NonNullable<PerformanceCyclePayload['anonymous_360_config']>>('anonymous', { required: true })
const invitation = defineModel<NonNullable<PerformanceCyclePayload['invitation_out_of_range_tips_config']>>('invitation', { required: true })
const allowDelete = defineModel<boolean>('allowDelete', { required: true })
const lowLimitEnabled = ref(anonymous.value.anonymous_low_limit > 0)
const previousLowLimit = ref(anonymous.value.anonymous_low_limit || 3)
const error = ref('')
watch(() => anonymous.value, value => {
  lowLimitEnabled.value = value.anonymous_low_limit > 0
  previousLowLimit.value = value.anonymous_low_limit || 3
})
watch(() => anonymous.value.anonymous_low_limit, value => {
  if (Number.isInteger(value) && value > 0) previousLowLimit.value = value
})
function toggleLowLimit(enabled: boolean) {
  lowLimitEnabled.value = enabled
  anonymous.value.anonymous_low_limit = enabled ? previousLowLimit.value : 0
}
function validInteger(value: unknown, minimum: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= 99
}
function validate() {
  error.value = ''
  if (anonymous.value.enable) {
    if (!['all', 'reviewee'].includes(anonymous.value.anonymous_object)) error.value = '请选择 360° 评估内容的匿名范围'
    else if (!validInteger(anonymous.value.anonymous_low_limit, lowLimitEnabled.value ? 1 : 0)) error.value = lowLimitEnabled.value ? '匿名下限须为 1–99 的整数' : '匿名下限须为 0–99 的整数'
  }
  if (!error.value && invitation.value.enable) {
    if (!validInteger(invitation.value.range_count, 0)) error.value = '邀请提示数量须为 0–99 的整数'
    else for (const language of props.languages) {
      const text = invitation.value.tips[language as 'zh-CN' | 'en-US']?.trim() || ''
      if (!text || text.length > 5000) {
        error.value = `${language === 'en-US' ? '英文' : '中文'}提示内容须为 1–5000 字，不能仅包含空白`
        break
      }
    }
  }
  return error.value
}
defineExpose({ validate })
</script>

<template>
  <section class="cycle-360-settings" aria-label="360° 评估设置">
    <h3>360° 评估设置</h3>
    <div class="cycle-360-option cycle-360-anonymous">
      <UiCheckbox v-model="anonymous.enable" :disabled="disabled">360° 匿名评估</UiCheckbox>
      <p class="cycle-360-description">开启后，指定的角色在查看 360° 评估结果时，仅可见匿名结果。</p>
      <p class="cycle-360-description">匿名配置在项目启动时固定；后续修改仅对之后新启动的项目生效，不影响已启动项目。</p>
      <div v-if="anonymous.enable" class="cycle-360-details">
        <fieldset :disabled="disabled">
          <legend><PerformanceRequiredLabel label="360° 评估内容的匿名范围" /></legend>
          <label class="cycle-360-radio"><input v-model="anonymous.anonymous_object" type="radio" value="all" name="cycle-anonymous-object" />对全部查看者匿名</label>
          <label class="cycle-360-radio"><input v-model="anonymous.anonymous_object" type="radio" value="reviewee" name="cycle-anonymous-object" />仅对被评估人匿名</label>
        </fieldset>
        <div class="cycle-360-limit">
          <div class="cycle-360-limit-heading"><strong>匿名下限</strong><PerformanceInfoPopover content="收到的有效 360° 评价人数不足匿名下限时，匿名对象不能查看结果；关系组人数不足下限时，不显示该组关系信息。" aria-label="匿名下限说明" /><UiSwitch :model-value="lowLimitEnabled" :disabled="disabled" aria-label="启用匿名下限" @update:model-value="toggleLowLimit" /></div>
          <ElInputNumber v-if="lowLimitEnabled" v-model="anonymous.anonymous_low_limit" :min="1" :max="99" :precision="0" :disabled="disabled" controls-position="right" aria-label="匿名下限人数" />
        </div>
        <fieldset :disabled="disabled">
          <legend><PerformanceRequiredLabel label="查看时，是否显示匿名 360° 评估人的描述信息" /></legend>
          <p class="cycle-360-description">360°评估人的描述信息包含：部门、序列、与被评估人的汇报关系、360°评估人标签、由谁邀请</p>
          <label class="cycle-360-radio"><input v-model="anonymous.reviewer_tag_visibility_mode" type="radio" value="visibleOverLowLimit" name="cycle-anonymous-description" />显示。如开启了匿名下限，则仅显示人数达到匿名下限的信息。</label>
          <label class="cycle-360-radio"><input v-model="anonymous.reviewer_tag_visibility_mode" type="radio" value="notVisible" name="cycle-anonymous-description" />隐藏</label>
        </fieldset>
      </div>
    </div>
    <div class="cycle-360-option cycle-360-delete">
      <UiCheckbox v-model="allowDelete" :disabled="disabled">允许删除被评估人的 360° 评估人</UiCheckbox>
      <p class="cycle-360-description">开启后，确认环节配置的上级可在环节开放时间内删除尚未提交评价的非默认评估人。本人可在合法再编辑时删除自己邀请的有效、未提交评估人，不受此开关限制；系统默认邀请和已提交评价不可删除。</p>
    </div>
    <div class="cycle-360-option cycle-360-invitation">
      <UiCheckbox v-model="invitation.enable" :disabled="disabled">向收到过多 360° 邀请的评估人显示提示说明</UiCheckbox>
      <p class="cycle-360-description">当评估邀请数量超过一定量时，可以向 360° 评估人显示提示说明。</p>
      <div v-if="invitation.enable" class="cycle-360-details cycle-360-invitation-details">
        <label class="cycle-360-field-label" for="cycle-invitation-count"><PerformanceRequiredLabel label="显示条件" /></label>
        <div class="cycle-360-condition">当 360° 评估人收到超过 <ElInputNumber id="cycle-invitation-count" v-model="invitation.range_count" :min="0" :max="99" :precision="0" :disabled="disabled" controls-position="right" aria-label="邀请提示数量" /> 个 360° 邀请时提示</div>
        <div v-for="language in languages" :key="language" class="cycle-360-tip-field">
          <label class="cycle-360-field-label" :for="`cycle-invitation-tip-${language}`"><PerformanceRequiredLabel :label="languages.length > 1 ? `提示内容（${language === 'en-US' ? '英文' : '中文'}）` : '提示内容'" /></label>
          <textarea :id="`cycle-invitation-tip-${language}`" v-model="invitation.tips[language as 'zh-CN' | 'en-US']" :disabled="disabled" maxlength="5000" rows="1" placeholder="请输入" :aria-label="`${language === 'en-US' ? '英文' : '中文'}邀请提示内容`" />
        </div>
      </div>
    </div>
    <p v-if="error" class="cycle-360-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.cycle-360-settings { margin-top: var(--spacing-4); color: var(--color-text-primary); font: var(--font-size-md)/22px var(--font-sans); }
h3 { margin: 0 0 var(--spacing-2); font-size: var(--font-size-md); font-weight: var(--font-weight-semibold); }
.cycle-360-option + .cycle-360-option { margin-top: var(--spacing-3); }
.cycle-360-option :deep(.ui-checkbox) { min-height: 22px; align-items: flex-start; font-weight: var(--font-weight-normal); }
.cycle-360-option :deep(.ui-checkbox__control) { margin-top: 3px; }
.cycle-360-description { margin: 0; color: var(--color-text-secondary); font-weight: var(--font-weight-normal); }
.cycle-360-option > .cycle-360-description { margin-left: 24px; }
.cycle-360-details { margin: var(--spacing-2) 0 0 24px; padding: var(--spacing-4); border-radius: var(--radius-lg); background: var(--color-bg-subtle); }
fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
legend, .cycle-360-field-label { display: block; width: 100%; margin-bottom: var(--spacing-1); padding: 0; font-weight: var(--font-weight-semibold); }
.cycle-360-radio { display: flex; align-items: baseline; gap: var(--spacing-2); margin-top: var(--spacing-2); font-weight: var(--font-weight-normal); }
.cycle-360-radio input { flex: none; width: 16px; height: 16px; margin: 0; accent-color: var(--ui-checkbox-checked); }
.cycle-360-limit { margin: var(--spacing-5) 0 var(--spacing-4); }
.cycle-360-limit-heading { display: flex; align-items: center; gap: var(--spacing-2); margin-bottom: var(--spacing-2); }
.cycle-360-limit :deep(.el-input-number) { width: 150px; }
.cycle-360-condition { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-2); }
.cycle-360-condition :deep(.el-input-number) { width: 100px; }
.cycle-360-tip-field { margin-top: var(--spacing-3); }
textarea { display: block; width: 100%; min-height: 32px; padding: 4px 11px; box-sizing: border-box; resize: vertical; border: 1px solid var(--color-line-control); border-radius: var(--radius-md); background: var(--color-bg-card); color: var(--color-text-primary); font: inherit; }
textarea:focus-visible { outline: 1px solid var(--color-primary); border-color: var(--color-primary); }
.cycle-360-error { margin: var(--performance-field-error-gap) 0 0; color: var(--performance-field-error-color); }
</style>
