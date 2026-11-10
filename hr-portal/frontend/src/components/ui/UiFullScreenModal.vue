<script setup lang="ts">
import UiFixedActionBar from './UiFixedActionBar.vue'
import UiPageHeader from './UiPageHeader.vue'

withDefaults(defineProps<{
  title: string
  showFooter?: boolean
  submitting?: boolean
  contentScroll?: 'page' | 'inner'
}>(), {
  showFooter: true,
  submitting: false,
  contentScroll: 'page',
})

const emit = defineEmits<{
  back: []
  submit: []
  preview: []
  cancel: []
}>()
</script>

<template>
  <div class="full-screen-modal">
    <UiPageHeader :title="title" @back="emit('back')">
      <template #subtitle><slot name="subtitle" /></template>
      <template #actions><slot name="actions" /></template>
    </UiPageHeader>

    <main class="full-screen-modal-content" :class="{ 'full-screen-modal-content--inner': contentScroll === 'inner' }">
      <slot />
    </main>

    <UiFixedActionBar v-if="showFooter" :submitting="submitting" @submit="emit('submit')" @preview="emit('preview')" @cancel="emit('cancel')">
      <template v-if="$slots.footer" #default><slot name="footer" /></template>
    </UiFixedActionBar>
  </div>
</template>

<style scoped>
.full-screen-modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-index-drawer);
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100vh;
  padding-top: var(--layout-topbar-height);
  box-sizing: border-box;
  overflow: clip;
  background: var(--ui-fullscreen-background);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}
.full-screen-modal-content {
  min-width: auto;
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  overflow: auto;
  padding-bottom: var(--performance-fullscreen-content-bottom-space);
  box-sizing: border-box;
  background: var(--ui-fullscreen-background);
}
.full-screen-modal-content--inner {
  min-width: 0;
  overflow: hidden;
  padding-bottom: 0;
}
</style>

