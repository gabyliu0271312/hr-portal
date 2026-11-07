<template>
  <div class="ui-option-detail"><slot /></div>
</template>

<style scoped>
.ui-option-detail { align-self: stretch; margin: 0 0 var(--spacing-4) var(--ui-option-detail-inset); padding: var(--ui-option-detail-padding); border-radius: var(--ui-option-detail-radius); background: var(--ui-option-detail-background); }
.ui-option-detail :deep(.performance-form-item) { margin-bottom: 0; }
.ui-option-detail :deep(.performance-form-item__control) { display: flex; flex-direction: column; gap: var(--spacing-2); }
.ui-option-detail :deep(.performance-checkbox) { min-height: var(--performance-input-line-height); }
</style>
