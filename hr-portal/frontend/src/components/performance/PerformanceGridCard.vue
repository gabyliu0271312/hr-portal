<template>
  <div class="grid-card">
    <slot />
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.grid-card { display: flex; min-width: 300px; min-height: 0; flex-direction: column; box-sizing: border-box; padding: var(--grid-card-padding, 16px); border: 1px solid #dee0e3; border-radius: 8px; font-size: 14px; line-height: 21px; color: #1f2329; }
</style>
