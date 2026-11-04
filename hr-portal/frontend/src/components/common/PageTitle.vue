<template>
  <div class="page-title">
    <div class="page-title-row"><h3 class="page-title-text" :title="title">{{ title }}</h3></div>
    <div v-if="description" class="page-title-row"><span class="page-title-desc">{{ description }}</span></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
}>(), { description: '' })
</script>

<style scoped>
/* 结构 1:1 对齐 REA 标题描述头（Xd_zZTJnreFiFZB06_s4）：
   头部块 > 行容器（title 行 h3 / description 行 span）；
   无描述时整行不渲染自动上移；行内单行省略。 */
.page-title { min-width: 0; }
.page-title-row { max-width: 100%; }
.page-title-text { box-sizing: border-box; margin: 0; overflow: hidden; color: var(--page-title-color); font-size: var(--page-title-size); font-weight: var(--page-title-weight); line-height: var(--page-title-line-height); text-overflow: ellipsis; white-space: nowrap; }
.page-title-desc { display: inline-block; vertical-align: bottom; box-sizing: border-box; overflow: hidden; max-width: 100%; color: var(--page-title-desc-color); font-size: var(--page-title-desc-size); font-weight: var(--page-title-desc-weight); line-height: var(--page-title-desc-line-height); margin: var(--page-title-gap-with-desc) 0 var(--page-title-gap-bottom); text-overflow: ellipsis; white-space: nowrap; }
</style>
