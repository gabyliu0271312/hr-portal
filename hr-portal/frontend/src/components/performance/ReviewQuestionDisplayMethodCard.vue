<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'
import ReviewQuestionOrderSection from './ReviewQuestionOrderSection.vue'

const props = withDefaults(defineProps<{
  ruleType: '评级' | '评分' | '评分映射等级型'
  config: Record<string, unknown>
  displayMode?: '标签样式' | '下拉样式'
  showOptions?: boolean
  showOrder?: boolean
}>(), {
  showOptions: true,
  showOrder: false,
})

const emit = defineEmits<{
  'update:displayMode': [value: '标签样式' | '下拉样式']
}>()

function valueOf(camel: string, snake: string): unknown {
  return props.config[camel] ?? props.config[snake]
}

function booleanValue(camel: string, snake: string): boolean {
  const value = valueOf(camel, snake)
  return value === true || value === 'true' || value === 1 || value === '1'
}

const gradeParticipatesInCalculation = computed(() => booleanValue('gradeParticipatesInCalculation', 'grade_participates_in_calculation'))
const hideGradeQuantifiedScore = computed(() => booleanValue('hideGradeQuantifiedScore', 'hide_grade_quantified_score'))
const displayMode = computed<'标签样式' | '下拉样式'>(() => {
  const value = props.displayMode ?? valueOf('displayMode', 'display_mode')
  return value === '下拉样式' ? '下拉样式' : '标签样式'
})
const showHideScoreOption = computed(() => props.ruleType === '评级' && gradeParticipatesInCalculation.value)
const selectedDisplayMode = ref<'标签样式' | '下拉样式'>(displayMode.value)
const localHideGradeQuantifiedScore = ref(hideGradeQuantifiedScore.value)

watch([() => props.displayMode, () => props.config], () => {
  selectedDisplayMode.value = displayMode.value
  localHideGradeQuantifiedScore.value = hideGradeQuantifiedScore.value
}, { deep: true })

function selectDisplayMode(value: '标签样式' | '下拉样式') {
  selectedDisplayMode.value = value
  emit('update:displayMode', value)
}
</script>

<template>
  <section class="question-card display-method-card" :class="{ 'is-quantified': showHideScoreOption, 'has-options': props.showOptions, 'has-order': props.showOrder }" aria-label="展示方式">
    <h2>展示方式</h2>
    <div class="additional-label">选项样式<span class="required-mark">*</span></div>
    <div class="display-options">
      <template v-if="props.showOptions">
        <p class="display-hint">配置仅对评级/固定评分题生效</p>
        <div class="display-option-grid">
          <label class="display-option" :class="{ selected: selectedDisplayMode === '标签样式' }" style="cursor: pointer" role="radio" :aria-checked="selectedDisplayMode === '标签样式'" tabindex="0" @click.prevent="selectDisplayMode('标签样式')" @keydown.enter.prevent="selectDisplayMode('标签样式')" @keydown.space.prevent="selectDisplayMode('标签样式')">
            <div class="display-option-choice">
              <input type="radio" tabindex="-1" aria-hidden="true" :checked="selectedDisplayMode === '标签样式'" name="display-mode" />
              <span class="radio-dot" aria-hidden="true" />
              <span class="display-copy"><strong>标签样式</strong><small>建议字数较少时选择（仅支持网页端）</small></span>
            </div>
            <span class="display-option-divider" :style="{ backgroundColor: selectedDisplayMode === '标签样式' ? '#f0f4ff' : '#dee0e3' }" aria-hidden="true" />
            <div class="display-option-preview">
              <div class="label-style-preview" aria-label="标签样式预览">
                <svg width="336" height="32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect width="48" height="32" rx="16" fill="#F5F6F7" />
                  <path d="M24.2 10.808c-1.596 0-2.8.518-3.64 1.582-.756.938-1.12 2.142-1.12 3.626 0 1.512.35 2.716 1.078 3.612.826 1.036 2.058 1.568 3.696 1.568 1.078 0 2.002-.308 2.772-.924.826-.658 1.344-1.568 1.568-2.73H27.07c-.196.784-.546 1.372-1.05 1.764-.476.364-1.092.546-1.82.546-1.12 0-1.946-.35-2.478-1.05-.504-.658-.756-1.582-.756-2.786 0-1.162.252-2.086.77-2.758.546-.742 1.358-1.106 2.436-1.106.728 0 1.316.154 1.792.476.476.322.798.826.966 1.498h1.484c-.154-1.008-.602-1.82-1.33-2.408-.756-.616-1.722-.91-2.884-.91z" fill="#646A73" />
                  <path fill="#DEE0E3" d="M48 15.5h48v1H48z" />
                  <rect x="96" width="48" height="32" rx="16" fill="#F5F6F7" />
                  <path d="M116.174 11.004V21h4.564c1.064 0 1.89-.196 2.478-.588.686-.476 1.036-1.204 1.036-2.212 0-.672-.168-1.218-.504-1.624-.336-.406-.84-.672-1.498-.798a2.484 2.484 0 001.162-.826c.28-.392.42-.868.42-1.428 0-.77-.266-1.372-.798-1.82-.56-.476-1.316-.7-2.296-.7h-4.564zm1.526 1.26h2.66c.672 0 1.176.112 1.484.35.308.224.462.588.462 1.092 0 .532-.154.924-.462 1.176-.308.238-.812.364-1.512.364H117.7v-2.982zm0 4.228h2.87c.728 0 1.274.126 1.624.392.35.266.532.7.532 1.288 0 .574-.238.994-.686 1.26-.364.196-.868.308-1.512.308H117.7v-3.248z" fill="#646A73" />
                  <path fill="#DEE0E3" d="M144 15.5h48v1H144z" />
                  <rect x="192" width="48" height="32" rx="16" fill="#F5F6F7" />
                  <path d="M215.133 11.004L211.283 21h1.624l.938-2.576h4.298l.938 2.576h1.638l-3.85-9.996h-1.736zm-.826 6.16l1.666-4.522h.056l1.652 4.522h-3.374z" fill="#646A73" />
                  <path fill="#DEE0E3" d="M240 15.5h48v1H240z" />
                  <rect x="288" width="48" height="32" rx="16" fill="#F5F6F7" />
                  <path d="M311.948 10.808c-1.064 0-1.946.238-2.646.714-.742.504-1.106 1.19-1.106 2.072 0 .868.378 1.54 1.148 2.002.308.168 1.064.434 2.296.826 1.106.336 1.764.56 1.988.672.63.322.952.756.952 1.316 0 .448-.224.798-.672 1.05-.448.252-1.05.392-1.806.392-.84 0-1.456-.154-1.862-.462-.448-.336-.728-.91-.84-1.694h-1.512c.084 1.26.532 2.184 1.358 2.772.686.476 1.638.728 2.856.728 1.26 0 2.24-.252 2.94-.756.7-.518 1.05-1.218 1.05-2.114 0-.924-.434-1.638-1.288-2.156-.392-.238-1.274-.56-2.618-.98-.938-.28-1.512-.49-1.736-.616-.504-.266-.742-.616-.742-1.064 0-.504.21-.868.644-1.092.35-.196.854-.294 1.512-.294.756 0 1.316.14 1.708.434.392.28.644.756.784 1.4h1.512c-.098-1.092-.49-1.89-1.19-2.408-.658-.504-1.568-.742-2.73-.742z" fill="#646A73" />
                </svg>
              </div>
            </div>
          </label>
          <label class="display-option" :class="{ selected: selectedDisplayMode === '下拉样式' }" style="cursor: pointer" role="radio" :aria-checked="selectedDisplayMode === '下拉样式'" tabindex="0" @click.prevent="selectDisplayMode('下拉样式')" @keydown.enter.prevent="selectDisplayMode('下拉样式')" @keydown.space.prevent="selectDisplayMode('下拉样式')">
            <div class="display-option-choice">
              <input type="radio" tabindex="-1" aria-hidden="true" :checked="selectedDisplayMode === '下拉样式'" name="display-mode" />
              <span class="radio-dot" aria-hidden="true" />
              <span class="display-copy"><strong>下拉样式</strong><small>建议字数较多时选择</small></span>
            </div>
            <span class="display-option-divider" :style="{ backgroundColor: selectedDisplayMode === '下拉样式' ? '#f0f4ff' : '#dee0e3' }" aria-hidden="true" />
            <div class="display-option-preview">
              <div class="select-preview" aria-label="下拉样式预览"><span>请选择等级</span><DownBoldOutlinedIcon class="select-preview-arrow" :size="12" /></div>
            </div>
          </label>
        </div>
      </template>
      <div v-if="showHideScoreOption" class="hide-score-option">
        <div class="hide-score-heading">
          <strong>隐藏等级量化分</strong>
          <PerformanceSwitch :model-value="localHideGradeQuantifiedScore" aria-label="隐藏等级量化分" @update:model-value="localHideGradeQuantifiedScore = $event" />
        </div>
        <small class="hide-score-description">开启后，前台参与计算时不展示等级量化分</small>
      </div>
    </div>
    <ReviewQuestionOrderSection v-if="props.showOrder" />
  </section>
</template>

<style scoped>
.question-card { width: 800px; max-width: 100%; margin-bottom: 16px; padding: 20px 20px 0 21px; box-sizing: border-box; border-radius: 8px; background: #fff; box-shadow: rgba(31,35,41,0.02) 0 1px 2px -2px, rgba(31,35,41,0.02) 0 2px 4px 0, rgba(31,35,41,0.02) 0 2px 8px 2px; }
.display-method-card { height: 263px; }
.display-method-card.is-quantified { height: 325px; }
.display-method-card:not(.has-options) { height: 124px; }
.display-method-card:not(.has-options) > .additional-label { display: none; }
.display-method-card.has-order { height: auto; min-height: 325px; padding-bottom: 20px; }
.question-card h2 { margin: 0 0 16px; color: #1f2329; font-size: 16px; font-weight: 600; line-height: 24px; }
.additional-label { height: 22px; margin-bottom: 8px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.required-mark { margin-left: 4px; color: #f54a45; font-family: SimSun, sans-serif; font-weight: 400; }
.display-options { width: 100%; min-width: 0; }
.display-hint { height: 22px; margin: 0 0 8px; color: #646a73; font-size: 14px; line-height: 22px; }
.display-option-grid { display: grid; grid-template-columns: 368px 368px; gap: 16px; width: 752px; }
.display-option { position: relative; display: flex; flex-direction: column; align-items: stretch; width: 368px; height: 125px; padding: 0; overflow: hidden; box-sizing: border-box; border: 1px solid #dee0e3; border-radius: 8px; color: #1f2329; cursor: pointer !important; }
.display-option.selected { border-color: #3370ff; }
.display-option input { position: absolute; opacity: 0; pointer-events: none; }
.radio-dot { width: 16px; height: 16px; flex: 0 0 16px; box-sizing: border-box; border: 1px solid #bbbfc4; border-radius: 50%; background: #fff; }
.display-option input:checked + .radio-dot { border: 4px solid #3370ff; }
.display-option-choice { display: flex; align-items: flex-start; gap: 16px; width: 100%; height: 59.33px; padding: 8px 11px; box-sizing: border-box; border: 0; border-radius: 0; background: transparent; }
.display-option.selected .display-option-choice { background: #f0f4ff; }
.display-option-divider { position: absolute; z-index: 1; top: 58.33px; left: 0; display: block; width: 100%; height: 1px; background: #dee0e3; pointer-events: none; }
.display-option-preview { display: flex; align-items: center; width: 100%; height: 65.67px; padding: 0; box-sizing: border-box; border: 0; border-radius: 0; background: transparent; }
.display-copy { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.display-copy strong { font-size: 14px; font-weight: 400; line-height: 22px; }
.display-copy small { color: #646a73; font-size: 12px; line-height: 20px; }
.label-style-preview { width: 336px; height: 32px; margin-left: 15px; }
.label-style-preview svg { display: block; width: 336px; height: 32px; }
.select-preview { display: flex; align-items: center; justify-content: space-between; width: 336px; height: 32px; margin-left: 15px; padding: 4px 12px; box-sizing: border-box; border-radius: 6px; background: #f5f6f7; color: #8f959e; font-size: 14px; line-height: 22px; }
.select-preview-arrow { display: block; flex: 0 0 12px; width: 12px; height: 12px; color: #646a73; overflow: hidden; }
.hide-score-option { display: block; width: 100%; height: 42px; margin-top: 16px; color: #1f2329; }
.hide-score-heading { display: flex; align-items: center; width: 100%; height: 21px; }
.hide-score-heading strong { width: 98px; height: 21px; margin-right: 8px; font-size: 14px; font-weight: 600; line-height: 21px; }
.hide-score-description { display: block; width: 100%; height: 21px; color: #646a73; font-size: 14px; font-weight: 400; line-height: 21px; }
</style>
