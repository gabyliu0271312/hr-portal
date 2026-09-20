<script setup lang="ts">
import { ref } from 'vue'
import InfoOutlinedIcon from './InfoOutlinedIcon.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const options = ['评级', '评分', '评分映射等级型']
const inputRefs = ref<HTMLInputElement[]>([])

function setRef(element: HTMLInputElement | null, index: number) {
  if (element) inputRefs.value[index] = element
}
</script>

<template>
  <div class="review-type-radio-group" role="radiogroup" aria-label="评估类型">
    <label v-for="(option, index) in options" :key="option" class="review-type-option" :class="{ checked: modelValue === option, disabled }">
      <input
        :ref="(element) => setRef(element as HTMLInputElement | null, index)"
        type="radio"
        name="review-type"
        :value="option"
        :checked="modelValue === option"
        :disabled="disabled"
        @change="emit('update:modelValue', option)"
      />
      <span class="radio-wallpaper" aria-hidden="true"></span>
      <span>{{ option }}</span>
      <InfoOutlinedIcon class="info-icon" />
    </label>
  </div>
</template>

<style scoped>
.review-type-radio-group {
  display: inline-flex;
  align-items: center;
  gap: 24px;
  min-height: 22px;
}
.review-type-option {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 22px;
  color: #1f2329;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
}
.review-type-option input {
  position: absolute;
  width: 16px;
  height: 16px;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.radio-wallpaper {
  width: 16px;
  height: 16px;
  margin-right: 8px;
  box-sizing: border-box;
  border: 1px solid #8f959e;
  border-radius: 50%;
  background: #fff;
}
.review-type-option.checked .radio-wallpaper {
  border: 5px solid #3370ff;
}
.review-type-option input:focus-visible + .radio-wallpaper {
  outline: 2px solid #3370ff;
  outline-offset: 2px;
}
.review-type-option.disabled {
  color: #8f959e;
  cursor: not-allowed;
}
.info-icon {
  display: block;
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  margin-left: 4px;
  color: #646a73;
}
</style>
