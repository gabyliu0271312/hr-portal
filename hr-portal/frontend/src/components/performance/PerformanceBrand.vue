<template>
  <div class="performance-brand" :class="`performance-brand--${theme}`" :aria-label="label">
    <span class="brand-mark" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g clip-path="url(#performance-brand-clip)">
          <path d="M5.988 13.97a2.708 2.708 0 1 0 0-5.415 2.708 2.708 0 0 0 0 5.416ZM14.329 7.416a2.708 2.708 0 1 0 0-5.416 2.708 2.708 0 0 0 0 5.416Z" fill="#3370FF"/>
          <path d="M22.704 10.974a2.708 2.708 0 1 0 0-5.416 2.708 2.708 0 0 0 0 5.416ZM8.979 24.425C7.126 23.902 3 21.567 3 18.085v.088c0-1.914 1.389-3.376 3.13-3.376 1.74 0 2.849 1.41 2.849 3.14v6.488ZM17.349 25.107a9.6 9.6 0 0 1-6.04 0v-13.85a3.02 3.02 0 1 1 6.04 0v13.85Z" fill="#3370FF"/>
          <path d="M19.684 24.416V14.82a3.022 3.022 0 0 1 3.029-3.02 3.02 3.02 0 0 1 3.02 3.02v.949c-.007 5.292-2.713 7.497-6.049 8.648Z" fill="#00D6B9"/>
        </g>
        <defs><clipPath id="performance-brand-clip"><path fill="#fff" d="M0 0h28v28H0z"/></clipPath></defs>
      </svg>
    </span>
    <span class="brand-divider" aria-hidden="true"></span>
    <span class="brand-name">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label?: string; theme?: 'light' | 'dark' }>(), {
  label: '创梦绩效',
  theme: 'light',
})
</script>

<style scoped>
.performance-brand { display: inline-flex; align-items: center; gap: 0; margin: 0 8px; white-space: nowrap; }
.brand-mark { display: block; width: 28px; height: 28px; }
.brand-mark svg { display: block; width: 28px; height: 28px; }
.brand-divider { width: 1px; height: 28px; margin: 0 8px; background: rgba(31, 35, 41, 0.15); }
.brand-name { color: #1f2329; }
.performance-brand--dark .brand-mark i { background: #fff; }
.performance-brand--dark .brand-divider { background: rgba(255,255,255,.55); }
.performance-brand--dark .brand-name { color: rgba(255,255,255,.92); }
</style>
