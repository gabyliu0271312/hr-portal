<template>
  <button
    class="performance-icon-button"
    :class="{ 'is-active': active, 'is-disabled': disabled, 'is-static': static }"
    type="button"
    :aria-label="label"
    :aria-expanded="expanded === undefined ? undefined : expanded"
    :disabled="disabled"
    :data-icon="icon"
    @click="$emit('click', $event)"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" :data-icon="icon">
      <path :d="paths[icon] || paths.more" fill="currentColor" />
    </svg>
  </button>
</template>

<script setup lang="ts">
defineProps<{ icon: string; label: string; disabled?: boolean; active?: boolean; expanded?: boolean; static?: boolean }>()
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
  more: 'M5 12h14',
}
</script>

<style scoped>
.performance-icon-button { display: grid; place-items: center; width: var(--performance-icon-button-size, var(--performance-button-icon-size)); height: var(--performance-icon-button-size, var(--performance-button-icon-size)); padding: var(--spacing-1); border: 0; border-radius: var(--performance-button-radius); background: transparent; color: var(--color-text-secondary); cursor: pointer; transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard); }
.performance-icon-button:hover, .performance-icon-button:focus-visible, .performance-icon-button.is-active { background: var(--color-surface-disabled); color: var(--color-action-primary-hover); outline: 0; }
.performance-icon-button:focus-visible { box-shadow: var(--performance-button-focus-ring); }
.performance-icon-button:disabled, .performance-icon-button.is-disabled { opacity: .5; cursor: default; }
.performance-icon-button.is-static { cursor: default; pointer-events: none; }
</style>

