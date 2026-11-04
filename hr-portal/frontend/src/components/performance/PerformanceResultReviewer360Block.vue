<template>
  <section class="pr360-block" :aria-label="title">
    <!-- 标题行：20/30 600 + 展开详情按钮（absolute right） -->
    <div class="pr360-head">
      <h3 class="pr360-title">{{ title }}</h3>
      <button type="button" class="pr360-toggle" tabindex="-1" @click="expanded = !expanded">
        {{ expanded ? '收起详情' : '展开详情' }}
      </button>
    </div>

    <!-- 收起态：评论容器（时间戳 + 折叠图标），点行可展开 -->
    <div class="pr360-comment" :class="{ 'is-expanded': expanded }" role="button" tabindex="0" @click="expanded = !expanded" @keydown.enter.prevent="expanded = !expanded" @keydown.space.prevent="expanded = !expanded">
      <span class="pr360-comment__toggle" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 10.586 7.707 6.293l-1.414 1.414L12 13.414l5.707-5.707-1.414-1.414L12 10.586Z" fill="currentColor"/></svg>
      </span>
      <span class="pr360-comment__time">{{ submittedAt }}</span>
    </div>

    <!-- 展开态：评估条目（templateItemContainer → ReviewContent → 字段 + 值占位） -->
    <div v-if="expanded" class="pr360-items">
      <div v-for="item in items" :key="item.title" class="pr360-item">
        <div class="pr360-item__title">{{ item.title }}</div>
        <div class="pr360-field">
          <span class="pr360-field__name">{{ item.fieldName }}</span>
          <span class="pr360-field__value">这里展示用户填写的内容</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 查看绩效结果里的 360°反馈区块（REA 实测：09-查看绩效结果.json + 底层 readTemplates 反推）。
 *
 * 100% 按 REA DOM 实测参数还原：
 *   标题：360°反馈（自愿评估） 20/30 600，pt-8 pb-8（58 高）
 *   展开详情按钮：88×28，absolute right-0，ud button r6
 *   评论容器 CommentsWrapper：760×55.3 bg #fff r8
 *     折叠图标 20×20 r6 + 时间戳 text-N-600（12px 21 高）
 *   展开后条目：templateItemContainer 702.7×120 bg #f5f6f7 r4
 *     → ReviewContent → 条目标题 14/24 600 + EnhancedReviewField 702.7×52 r8
 *       → 字段名 14/22 600 + 值「这里展示用户填写的内容」（r6 22 高）
 *   底部留白 py-6 24 高
 */
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  title?: string
  /** 收起态时间戳（REA 预览态占位） */
  submittedAt?: string
  /** 展开态条目（REA：360°反馈 / 留言 两个 question 条目） */
  items?: Array<{ title: string; fieldName: string }>
}>(), {
  title: '360°反馈（自愿评估）',
  submittedAt: '这里展示提交时间',
  items: () => [
    { title: '360°反馈', fieldName: '360°反馈内容' },
    { title: '留言', fieldName: '留言内容' },
  ],
})

const expanded = ref(false)
void props
</script>

<style scoped>
.pr360-block { margin-bottom: 32px; color: #1f2329; }
.pr360-block:last-child { margin-bottom: 0; }

/* ---------- 标题行：20/30 600，58 高 ---------- */
.pr360-head { position: relative; display: flex; align-items: flex-start; min-height: 58px; box-sizing: border-box; padding: 16px 0; }
.pr360-title { margin: 0; font-size: 20px; font-weight: 600; line-height: 30px; color: #1f2329; }
.pr360-toggle {
  position: absolute; right: 0; top: 15px; display: inline-flex; align-items: center; justify-content: center;
  height: 28px; padding: 4px 11px; box-sizing: border-box; border: 0; border-radius: 6px;
  background: transparent; font-family: inherit; font-size: 14px; line-height: 22px; color: #1f2329; cursor: pointer;
}

/* ---------- 评论容器：760×55.3 bg #fff r8 ---------- */
.pr360-comment {
  display: flex; align-items: center; gap: 4px; width: 100%; min-height: 54px; padding: 8px;
  box-sizing: border-box; border-radius: 8px; background: #fff; cursor: pointer; user-select: none;
}
.pr360-comment__toggle {
  display: flex; align-items: center; justify-content: center; flex: none;
  width: 20px; height: 20px; border-radius: 6px; color: #646a73;
}
.pr360-comment__toggle svg { width: 12px; height: 12px; }
.pr360-comment__time { font-size: 12px; line-height: 21px; color: #646a73; }

/* ---------- 展开态条目 ---------- */
.pr360-items { margin-top: 8px; }
.pr360-item {
  padding: 8px 0 12px; box-sizing: border-box; border-radius: 4px; background: #f5f6f7;
}
.pr360-item + .pr360-item { border-top: 1px solid #dee0e3; border-top-left-radius: 0; border-top-right-radius: 0; }
.pr360-item__title { padding: 0 12px; font-size: 14px; font-weight: 600; line-height: 24px; color: #1f2329; }
.pr360-field { margin-top: 8px; padding: 8px 12px; box-sizing: border-box; border-radius: 8px; background: #f5f6f7; }
.pr360-field__name { display: block; font-size: 14px; font-weight: 600; line-height: 22px; color: #1f2329; }
.pr360-field__value { display: block; margin-top: 4px; padding: 8px 12px; box-sizing: border-box; border-radius: 6px; font-size: 14px; line-height: 22px; color: #1f2329; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
