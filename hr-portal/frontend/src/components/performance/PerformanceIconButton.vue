<template>
  <button
    class="performance-icon-button"
    :class="{ 'is-active': active, 'is-disabled': disabled, 'is-static': static, 'is-outlined': variant === 'outlined' }"
    type="button"
    :aria-label="label"
    :aria-expanded="expanded === undefined ? undefined : expanded"
    :disabled="disabled"
    :data-icon="icon"
    @click="!disabled && $emit('click', $event)"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" :data-icon="icon">
      <path :d="paths[icon] || paths.more" fill="currentColor" />
    </svg>
    <span v-if="text" class="performance-icon-button__text">{{ text }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{ icon: string; label: string; disabled?: boolean; active?: boolean; expanded?: boolean; static?: boolean; variant?: 'default' | 'outlined'; text?: string }>()
defineEmits<{ click: [event: MouseEvent] }>()

const paths: Record<string, string> = {
  ExpandRightFilled: 'M18.627 11.22a1 1 0 0 1 0 1.56L8.291 21.084a1 1 0 0 1-1.626-.78V3.696a1 1 0 0 1 1.626-.78l10.335 8.305Z',
  UpLeftOutlined: 'm10.65 17.637-5.636-5.636 5.943-5.943.835-.84a1 1 0 1 0-1.418-1.41l-.663.668-6.819 6.818a1 1 0 0 0 0 1.414l6.473 6.472 1.011 1.014a1 1 0 0 0 1.416-1.41 1595.32 1595.32 0 0 0-1.142-1.147Z M19.558 17.637l-5.636-5.636 5.943-5.943.835-.84a1 1 0 1 0-1.419-1.41l-.663.668-6.818 6.818a1 1 0 0 0 0 1.414l6.473 6.472 1.011 1.014a1 1 0 0 0 1.416-1.41l-1.142-1.147Z',
  DownBoldOutlined: 'm5 9 7 7 7-7',
  UpBoldOutlined: 'm5 15 7-7 7 7',
  SpaceUpOutlined: 'M12.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L11 5.414V22a1 1 0 1 0 2 0V5.414l5.293 5.293a1 1 0 0 0 1.414-1.414l-7-7Z',
  SpaceDownOutlined: 'M11.293 21.707a1 1 0 0 0 1.414 0l7-7a1 1 0 0 0-1.414-1.414L13 18.586V2a1 1 0 1 0-2 0v16.586l-5.293-5.293a1 1 0 0 0-1.414 1.414l7 7Z',
  EditOutlined: 'm17.57 7.244-.006-.006.37-.37a1 1 0 0 0 .001-1.412l-3.434-3.453-.002-.002a1 1 0 0 0-1.414 0l-.705.706.01.01L2 13.186V17a1 1 0 0 0 1 1h3.814L17.57 7.244Zm-3.273.389-2.015-2.015 1.487-1.515 2.023 2.034-1.495 1.496Zm-3.415-.587 2.002 2.002-6.913 6.92h-.004l-1.934-1.935v-.003l6.849-6.984ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z',
  DeleteTrashOutlined: 'M8 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2h5a1 1 0 1 1 0 2h-1v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6H3a1 1 0 0 1 0-2h5ZM6 6v14h12V6H6Zm4 3a1 1 0 1 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Zm4 0a1 1 0 1 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z',
  CloseOutlined: 'm6 6 12 12M18 6 6 18',
  LockOutlined: 'M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1Zm2 0h6V7a3 3 0 0 0-6 0v3Zm-3 2v8h12v-8H6Z',
  DragOutlined: 'M8.25 6.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm0 7.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm1.75 5.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0ZM14.753 6.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM16.5 12a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Zm-1.747 9a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z',
  TeamAddOutlined: 'M15 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm2.5 4.5a2.5 2.5 0 1 0-5.001.001A2.5 2.5 0 0 0 17.5 6.5ZM12.335 12H14.5v2h-2.165C10.515 14 9 15.498 9 17.4V19h5.5v2H9c-1.1 0-2-.9-2-2v-1.6c0-2.982 2.39-5.4 5.335-5.4ZM1 20h4.135v-2H2v-.6c0-1.002.845-1.9 2-1.9h1.31a5.46 5.46 0 0 1 .985-2H4c-2.21 0-4 1.746-4 3.9V19c0 .55.45 1 1 1ZM9 9a3.001 3.001 0 0 0-6 0 3.001 3.001 0 0 0 6 0ZM6 8a1.001 1.001 0 0 1 0 2 1.001 1.001 0 0 1 0-2Zm13.5 13a1 1 0 0 1-1-1v-2h-2a1 1 0 1 1 0-2h2v-2a1 1 0 1 1 2 0v2h2a1 1 0 1 1 0 2h-2v2a1 1 0 0 1-1 1Z',
  UserSwitchOutlined: 'M8.687 4.022a.6.6 0 01.424-.735l.585-.157a3.334 3.334 0 00-4.053.513A.667.667 0 114.7 2.7a4.667 4.667 0 015.482-.825l-.08-.303a.6.6 0 011.158-.31l.345 1.288c.181.675-.22 1.37-.895 1.551l-1.288.345a.6.6 0 01-.735-.424zm-2.02 3.311a2.667 2.667 0 11-5.334 0 2.667 2.667 0 015.334 0zm-4 0a1.333 1.333 0 102.666 0 1.333 1.333 0 00-2.666 0zm.666 3.334a2.667 2.667 0 00-2.666 2.666V14c0 .733.6 1.333 1.333 1.333h4c.733 0 1.333-.6 1.333-1.333v-.667a2.667 2.667 0 00-2.666-2.666H3.333zM2 13.333C2 12.597 2.597 12 3.333 12h1.334C5.403 12 6 12.597 6 13.333V14H2v-.667zm6.667 0a2.667 2.667 0 012.666-2.666h1.334a2.667 2.667 0 012.666 2.666V14c0 .733-.6 1.333-1.333 1.333h-4c-.733 0-1.333-.6-1.333-1.333v-.667zm1.333 0V14h4v-.667c0-.736-.597-1.333-1.333-1.333h-1.334c-.736 0-1.333.597-1.333 1.333zm2-8.666A2.667 2.667 0 1112 10a2.667 2.667 0 010-5.333zm0 4A1.333 1.333 0 1012 6a1.333 1.333 0 000 2.667z',
  more: 'M5 12h14',
}
</script>

<style scoped>
.performance-icon-button { display: inline-flex; align-items: center; justify-content: center; width: var(--performance-icon-button-size, var(--performance-button-icon-size)); height: var(--performance-icon-button-size, var(--performance-button-icon-size)); padding: var(--spacing-1); border: 0; border-radius: var(--performance-button-radius); background: transparent; color: var(--color-text-secondary); cursor: pointer; transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard); }
.performance-icon-button:hover, .performance-icon-button:focus-visible, .performance-icon-button.is-active { background: var(--color-surface-disabled); color: var(--color-action-primary-hover); outline: 0; }
.performance-icon-button:focus-visible { box-shadow: var(--performance-button-focus-ring); }
.performance-icon-button:disabled, .performance-icon-button.is-disabled { background: transparent; color: var(--performance-button-link-disabled-color); cursor: not-allowed; box-shadow: none; }
.performance-icon-button.is-static { cursor: default; pointer-events: none; }
.performance-icon-button.is-outlined { width: var(--performance-button-min-width); height: var(--performance-button-height); border: 1px solid var(--performance-button-secondary-border); background: var(--performance-button-secondary-background); color: var(--color-text-primary); }
.performance-icon-button.is-outlined svg { width: 14px; height: 14px; }
.performance-icon-button__text { margin-left: var(--spacing-2); font: var(--performance-button-font-weight) var(--performance-button-font-size)/var(--performance-button-line-height) var(--font-sans); white-space: nowrap; }
.performance-icon-button.is-outlined:hover:not(:disabled) { background: var(--performance-button-secondary-hover-background); }
.performance-icon-button.is-outlined:disabled { background: var(--performance-button-secondary-background); border-color: var(--performance-button-secondary-border); color: var(--performance-button-link-disabled-color); }
</style>

