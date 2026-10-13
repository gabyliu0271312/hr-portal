<template>
  <div class="reference-entry-bar">
    <button class="reference-entry-bar__button" type="button" @click="$emit('select')">
      <span class="reference-entry-bar__icon-inline" aria-hidden="true">
        <span class="reference-entry-bar__icon">
          <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="AddEntryOutlined"><path d="M5 3h14v10h2V3a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h7v-2H5V3Z" fill="currentColor"></path><path d="M7 8a1 1 0 0 1 1-1h3a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2H8Zm9 5a1 1 0 1 1 2 0v2h2a1 1 0 1 1 0 2h-2v2a1 1 0 1 1-2 0v-2h-2a1 1 0 1 1 0-2h2v-2Z" fill="currentColor"></path></svg>
        </span>
      </span>选择参考内容
    </button>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ select: [] }>()
</script>

<style scoped>
.reference-entry-bar {
  display: flex;
  position: sticky;
  bottom: 8px;
  z-index: 20;
  justify-content: center;
  align-items: center;
  min-width: 0;
  min-height: 0;
  height: 54px;
  margin-bottom: 24px;
  box-sizing: border-box;
  background-color: var(--color-bg-card);
  border-radius: var(--performance-button-radius);
}

.reference-entry-bar__button {
  display: flex;
  position: relative;
  justify-content: center;
  align-items: center;
  padding: 2px 4px;
  box-sizing: border-box;
  height: 22px;
  border: 0;
  background-color: transparent;
  border-radius: var(--performance-button-radius);
  font: var(--performance-button-font-weight) var(--performance-button-font-size)/18px var(--font-sans);
  text-align: center;
  white-space: nowrap;
  color: var(--performance-button-text-color);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), width var(--duration-base) var(--ease-standard);
}

.reference-entry-bar__button:hover {
  background-color: var(--performance-button-text-hover-background);
}

.reference-entry-bar__icon-inline {
  display: block;
  margin-right: 4px;
  box-sizing: border-box;
  line-height: 0;
}

.reference-entry-bar__icon {
  display: inline-block;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  line-height: 0;
}

.reference-entry-bar__icon svg {
  display: inline-block;
  overflow: hidden;
  width: 14px;
  height: 14px;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  line-height: 14px;
}
</style>
