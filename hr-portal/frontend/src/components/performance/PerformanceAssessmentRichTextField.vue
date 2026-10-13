<template>
  <section class="performance-assessment-rich-text-field">
    <label class="performance-assessment-rich-text-field__label">{{ label || '未命名填写题' }}<i v-if="required">*</i></label>
    <div class="performance-assessment-rich-text-field__control"><slot /></div>
  </section>
</template>
<script setup lang="ts">
defineProps<{ label?: string; required?: boolean }>()
</script>
<style scoped>
.performance-assessment-rich-text-field{position:relative;margin:16px 0 0}.performance-assessment-rich-text-field__label{display:block;margin:0 0 10px;font-size:16px;font-weight:600;line-height:22px}.performance-assessment-rich-text-field__label i{margin-left:3px;color:#f54a45;font-style:normal}.performance-assessment-rich-text-field__control{min-width:0}
</style>
