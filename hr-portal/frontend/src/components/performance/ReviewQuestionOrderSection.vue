<script setup lang="ts">
import { ref } from 'vue'
import ReviewQuestionOrderPreview from './ReviewQuestionOrderPreview.vue'

const props = withDefaults(defineProps<{
  fillOrder?: 'top' | 'bottom'
  viewOrder?: 'top' | 'bottom'
}>(), { fillOrder: 'top', viewOrder: 'top' })

const emit = defineEmits<{
  'update:fillOrder': [value: 'top' | 'bottom']
  'update:viewOrder': [value: 'top' | 'bottom']
}>()

const fillOrder = ref(props.fillOrder)
const viewOrder = ref(props.viewOrder)
const orderOptions = [
  { value: 'top' as const, label: '总项在上' },
  { value: 'bottom' as const, label: '总项在下' },
]

function selectFillOrder(value: 'top' | 'bottom') {
  fillOrder.value = value
  emit('update:fillOrder', value)
}

function selectViewOrder(value: 'top' | 'bottom') {
  viewOrder.value = value
  emit('update:viewOrder', value)
}
</script>

<template>
  <div class="order-section" data-component="review-question-order-section">
    <div class="order-section-title">评估项的填写和查看顺序</div>
    <div class="order-columns">
      <div class="order-column">
        <div class="order-label">填写顺序</div>
        <div class="order-options" role="radiogroup" aria-label="填写顺序">
          <button v-for="option in orderOptions" :key="option.value" class="order-option" :class="{ selected: fillOrder === option.value }" type="button" role="radio" :aria-checked="fillOrder === option.value" @click="selectFillOrder(option.value)">
            <span class="order-option-title"><span class="radio-dot" aria-hidden="true" />{{ option.label }}</span>
            <span class="order-option-seam" :style="{ backgroundColor: fillOrder === option.value ? '#f0f4ff' : '#dee0e3' }" aria-hidden="true" />
            <span class="order-preview"><ReviewQuestionOrderPreview :total-position="option.value" /></span>
          </button>
        </div>
      </div>
      <div class="order-column">
        <div class="order-label">查看顺序</div>
        <div class="order-options" role="radiogroup" aria-label="查看顺序">
          <button v-for="option in orderOptions" :key="option.value" class="order-option" :class="{ selected: viewOrder === option.value }" type="button" role="radio" :aria-checked="viewOrder === option.value" @click="selectViewOrder(option.value)">
            <span class="order-option-title"><span class="radio-dot" aria-hidden="true" />{{ option.label }}</span>
            <span class="order-option-seam" :style="{ backgroundColor: viewOrder === option.value ? '#f0f4ff' : '#dee0e3' }" aria-hidden="true" />
            <span class="order-preview"><ReviewQuestionOrderPreview :total-position="option.value" /></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.order-section { width: 758px; max-width: 100%; margin-top: 24px; color: #1f2329; }
.order-section-title { display: flex; align-items: center; width: 100%; height: 22px; margin-bottom: 4px; font-size: 14px; font-weight: 600; line-height: 22px; }
.order-columns { display: grid; grid-template-columns: 371px 371px; gap: 16px; width: 758px; max-width: 100%; }
.order-column { min-width: 0; }
.order-label { width: 371px; max-width: 100%; height: 22px; margin-bottom: 8px; font-size: 14px; font-weight: 400; line-height: 22px; }
.order-options { display: grid; grid-template-columns: 180px 180px; gap: 8px; width: 368px; }
.order-option { position: relative; display: flex; flex-direction: column; width: 180px; height: 134px; min-width: 0; padding: 0; overflow: hidden; box-sizing: border-box; border: 1px solid #dee0e3; border-radius: 8px; background: #fff; color: #1f2329; text-align: left; cursor: pointer; }
.order-option.selected { border-color: #3370ff; }
.order-option-title { display: flex; flex: 0 0 40px; align-items: center; gap: 8px; width: 180px; height: 40px; padding: 8px 12px; box-sizing: border-box; font-size: 14px; font-weight: 400; line-height: 22px; }
.order-option.selected .order-option-title { background: #f0f4ff; }
.order-option-seam { position: absolute; z-index: 1; top: 39px; left: 0; display: block; width: 100%; height: 1px; pointer-events: none; }
.radio-dot { display: inline-block; flex: 0 0 16px; width: 16px; height: 16px; box-sizing: border-box; border: 1px solid #8f959e; border-radius: 50%; background: #fff; }
.order-option.selected .radio-dot { border: 5px solid #3370ff; }
.order-preview { display: flex; flex: 0 0 92px; align-items: center; justify-content: center; width: 178px; height: 92px; box-sizing: border-box; background: #fff; }
@media (max-width: 820px) {
  .order-columns { grid-template-columns: minmax(0, 1fr); }
}
</style>
