<template>
  <section class="performance-content-surface">
    <slot />
  </section>
</template>

<style scoped>
.performance-content-surface {
  box-sizing: border-box;
  width: 100%;
  min-height: 0;
  padding: var(--performance-content-surface-padding);
  border-radius: var(--performance-content-surface-radius);
  background: var(--performance-content-surface-background);
  box-shadow: var(--performance-content-surface-shadow);
}
</style>
