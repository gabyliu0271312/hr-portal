<template>
  <div class="field-preview">
    <div class="field-preview__window">
      <div class="field-preview__bar">
        <span class="field-preview__dots" aria-hidden="true">
          <span class="field-preview__dot field-preview__dot--red" />
          <span class="field-preview__dot field-preview__dot--yellow" />
          <span class="field-preview__dot field-preview__dot--green" />
        </span>
      </div>
      <div class="field-preview__body">
        <img v-if="avatarUrl" class="field-preview__avatar" :src="avatarUrl" :alt="name" />
        <span v-else class="field-preview__avatar field-preview__avatar--fallback" aria-hidden="true">{{ initial }}</span>
        <div class="field-preview__info">
          <div class="field-preview__name">{{ name }}</div>
          <p class="field-preview__fields">
            <span v-for="field in fields" :key="field" class="field-preview__field">{{ field }}</span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ name: string; fields: string[]; avatarUrl?: string }>()

const initial = computed(() => props.name.slice(-1))
</script>

<style scoped>
.field-preview { box-sizing: border-box; padding: var(--performance-preview-padding) var(--performance-preview-padding) 0; border: var(--ui-control-border-width) solid var(--performance-preview-border); border-radius: var(--performance-preview-radius); }
.field-preview__window { position: relative; box-sizing: border-box; border: var(--ui-control-border-width) solid var(--performance-preview-border); border-bottom-color: transparent; border-radius: var(--performance-preview-radius) var(--performance-preview-radius) 0 0; background: var(--color-bg-card); box-shadow: var(--performance-preview-shadow); }
.field-preview__bar { position: relative; box-sizing: border-box; height: var(--performance-preview-bar-height); border-bottom: var(--ui-control-border-width) solid var(--performance-preview-border); border-radius: var(--performance-preview-radius) var(--performance-preview-radius) 0 0; background: var(--performance-preview-bar-background); }
.field-preview__dots { position: absolute; top: var(--performance-preview-dot-inset-top); left: var(--performance-preview-dot-inset-left); display: flex; gap: var(--performance-preview-dot-gap); }
.field-preview__dot { display: block; width: var(--performance-preview-dot-size); height: var(--performance-preview-dot-size); border-radius: 50%; }
.field-preview__dot--red { background: var(--performance-preview-dot-red); }
.field-preview__dot--yellow { background: var(--performance-preview-dot-yellow); }
.field-preview__dot--green { background: var(--performance-preview-dot-green); }
.field-preview__body { display: flex; padding: var(--performance-preview-body-padding); }
.field-preview__avatar { display: block; flex: 0 0 var(--performance-preview-avatar-size); width: var(--performance-preview-avatar-size); height: var(--performance-preview-avatar-size); object-fit: cover; }
.field-preview__avatar--fallback { display: grid; place-items: center; background: var(--performance-preview-avatar-fallback-background); color: var(--performance-preview-avatar-fallback-color); font-size: var(--font-size-md); }
.field-preview__info { min-width: 0; margin-left: var(--performance-preview-avatar-gap); }
.field-preview__name { color: var(--color-text-primary); font-size: var(--font-size-lg); font-weight: 600; line-height: var(--performance-preview-name-line-height); }
.field-preview__fields { margin: 0; color: var(--performance-preview-fields-color); font-size: var(--font-size-md); line-height: var(--input-line-height); }
.field-preview__field + .field-preview__field::before { content: ''; display: inline-block; position: relative; top: var(--performance-preview-divider-offset); width: var(--performance-preview-divider-width); height: var(--performance-preview-divider-height); margin: 0 var(--performance-preview-divider-gap); vertical-align: middle; background: var(--performance-preview-divider-color); }
</style>
