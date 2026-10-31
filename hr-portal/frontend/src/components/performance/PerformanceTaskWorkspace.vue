<template>
  <div class="self-summary-page performance-task-workspace">
    <slot name="header" />
    <slot name="tabs" />
    <main class="summary-scroll"><slot /></main>
    <slot name="footer" />
  </div>
</template>

<style scoped>
:global(html:has(.performance-task-workspace)){scrollbar-gutter:auto}
.performance-task-workspace{
  display:flex;
  width:100%;
  height:100vh;
  height:100dvh;
  min-width:0;
  min-height:0;
  flex:1;
  flex-direction:column;
  overflow:hidden;
  background:var(--performance-review-page-bg,#f4f5f6);
  color:var(--color-text-primary);
  font-family:var(--font-sans);
}
.summary-scroll{
  display:flex;
  min-width:0;
  min-height:0;
  flex:1;
  flex-direction:column;
  overflow-y:auto;
  overflow-x:hidden;
  padding:12px;
}
.summary-scroll :slotted(*){flex:1 0 auto;min-width:0}
@media(max-width:640px){.summary-scroll{padding:12px 16px}}
</style>
