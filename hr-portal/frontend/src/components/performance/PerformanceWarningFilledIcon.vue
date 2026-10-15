<template>
  <span class="performance-warning-filled-icon" aria-hidden="true">
    <span class="performance-warning-filled-icon__glyph">
      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="WarningFilled">
        <path d="M23 12c0 6.075-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1s11 4.925 11 11ZM12 7a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" fill="currentColor" />
      </svg>
    </span>
  </span>
</template>

<style scoped>
.performance-warning-filled-icon {
  display: block;
  align-self: center;
  box-sizing: border-box;
  font-size: 24px;
  font-weight: 600;
  line-height: 0;
  color: var(--performance-dialog-warning-icon);
}

.performance-warning-filled-icon__glyph {
  display: inline-block;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  font-size: 24px;
  font-weight: 600;
  line-height: 0;
  text-align: center;
  color: inherit;
}

.performance-warning-filled-icon svg {
  display: inline-block;
  overflow: hidden;
  width: 24px;
  height: 24px;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  line-height: 24px;
}
</style>
