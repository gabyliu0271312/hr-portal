<template>
  <button class="performance-report-comment-button" type="button">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" data-icon="AddCommentOutlined">
      <path d="M7 11a1 1 0 1 1 1-1h8a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z" fill="currentColor" />
      <path d="M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-3.812a.5.5 0 0 0-.33.124l-2.541 2.224a.5.5 0 0 1-2.634 0l-2.542-2.224a.5.5 0 0 0-.329-.124H4a2 2 0 0 1-2-2V5Zm2 0v11.5h3.812a2.5 2.5 0 0 1 1.646.619L12 19.343l2.542-2.224a2.5 2.5 0 0 1 1.646-.619H20V5H4Z" fill="currentColor" />
    </svg>
    <span>添加备注（仅自己可见）</span>
  </button>
</template>

<style scoped>
.performance-report-comment-button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 26px; margin-top: 16px; padding: 2px 4px; border: 0; border-radius: 6px; background: transparent; color: #646a73; cursor: pointer; font: inherit; }
.performance-report-comment-button:hover { background: #eff0f1; }
.performance-report-comment-button svg { flex: 0 0 14px; width: 14px; height: 14px; }
</style>
