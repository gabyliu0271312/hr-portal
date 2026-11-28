<template>
  <span class="ui-tag ud__tag ud__tag-md ud__tag-rect ud__tag-neutral-option">
    <span class="ui-tag__content ud__tag__content"><slot /></span>
  </span>
</template>

<style scoped>
.ui-tag { display: inline-flex; align-items: center; overflow: hidden; min-width: 0; min-height: var(--ui-tag-height); max-width: 100%; padding: 0 var(--ui-tag-padding-x); box-sizing: border-box; border-radius: var(--ui-tag-radius); background: var(--ui-tag-background); color: var(--ui-tag-text); font: var(--font-weight-normal) var(--ui-tag-font-size)/var(--ui-tag-line-height) var(--font-sans); white-space: nowrap; cursor: text; transition: var(--duration-base) var(--ease-standard); }
.ui-tag__content { display: block; overflow: hidden; min-width: 0; box-sizing: border-box; color: inherit; font: inherit; line-height: var(--ui-tag-line-height); text-overflow: ellipsis; white-space: nowrap; word-break: keep-all; }
</style>
