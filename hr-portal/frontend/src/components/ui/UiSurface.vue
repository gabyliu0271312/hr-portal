<template>
  <div class="ui-surface" :class="`ui-surface--radius-${radius}`" :style="surfaceStyle">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * UiSurface —— 全局白色容器。
 * 默认规格对齐飞书人事组织架构页（REA 实测）：padding 20px、仅上圆角 8px、无阴影。
 * 业务侧不要再手写 background/radius/box-shadow。
 */
const props = withDefaults(defineProps<{
  /** 内边距，默认 20px；传 '0' 可让表格贴边 */
  padding?: string
  /** 圆角：top = 仅上圆角（表格长卡片），all = 全圆角，none = 直角 */
  radius?: 'top' | 'all' | 'none'
  /** 是否带投影；默认 false（REA 无阴影） */
  shadow?: boolean
  /** 最小宽度，表格类容器默认 980px */
  minWidth?: string
}>(), {
  padding: 'var(--ui-surface-padding)',
  radius: 'top',
  shadow: false,
  minWidth: 'var(--ui-surface-min-width)',
})

const surfaceStyle = computed(() => ({
  padding: props.padding,
  minWidth: props.minWidth,
  boxShadow: props.shadow ? 'var(--ui-surface-shadow-raised)' : 'var(--ui-surface-shadow)',
}))
</script>

<style scoped>
.ui-surface {
  box-sizing: border-box;
  background: var(--ui-surface-background);
}
.ui-surface--radius-all { border-radius: var(--ui-surface-radius-all); }
.ui-surface--radius-top { border-radius: var(--ui-surface-radius-top); }
.ui-surface--radius-none { border-radius: 0; }
</style>
