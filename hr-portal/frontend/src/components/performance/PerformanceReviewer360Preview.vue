<template>
  <div class="r360-preview" aria-label="360°评估详情">
    <!-- 信息条：已评估 1 / 1 直属上级 1 -->
    <div class="r360-info">
      <span class="r360-info__label">已评估</span>
      <span class="r360-info__num">1 / 1</span>
      <span class="r360-info__relation">{{ relationLabel }}</span>
      <span class="r360-info__num">{{ evaluatedCount }}</span>
    </div>

    <!-- 表头：评估维度 / 员工关系 / 人员类型 -->
    <div class="r360-head">
      <span class="r360-head__col">评估维度</span>
      <span class="r360-head__col">员工关系</span>
      <span class="r360-head__col">人员类型</span>
    </div>

    <!-- 工具行：详情视图 + 排序 + 收起详情 -->
    <div class="r360-tools">
      <span class="r360-tools__title">详情视图</span>
      <span class="r360-tools__spacer"></span>
      <button type="button" class="r360-tools__btn" tabindex="-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z" fill="currentColor"/></svg>
        排序
      </button>
      <button type="button" class="r360-tools__btn" tabindex="-1">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 10.586 7.707 6.293l-1.414 1.414L12 13.414l5.707-5.707-1.414-1.414L12 10.586Z" fill="currentColor"/></svg>
        收起详情
      </button>
    </div>

    <!-- 卡片：展开图标 + 标题行 + 列描述 -->
    <div class="r360-card">
      <button type="button" class="r360-card__toggle" tabindex="-1" aria-label="展开">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 10.586 7.707 6.293l-1.414 1.414L12 13.414l5.707-5.707-1.414-1.414L12 10.586Z" fill="currentColor"/></svg>
      </button>
      <div class="r360-card__body">
        <div class="r360-card__title">{{ relationLabel }}</div>
        <div class="r360-card__desc">所属部门 · 系统默认邀请</div>
      </div>
    </div>

    <!-- 表单区：灰底，内嵌空评估条目 -->
    <div class="r360-form">
      <div v-for="index in entryCount" :key="index" class="r360-form__item">
        <div class="r360-form__review">
          <div class="r360-form__empty">这里展示用户填写的内容</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 参考区「360°反馈」页签预览（REA 实测：360°评估详情视图）。
 *
 * 100% 按 REA 飞书绩效 DOM 实测参数还原（rea-extract/out/domspec1x/参考区-360反馈-直接上级评估.json）：
 *   信息条：14/24，#646a73，数字 #3370ff
 *   表头：评估维度 / 员工关系 / 人员类型，14/22 #1f2329
 *   工具行：详情视图 14/22 + 排序 / 收起详情 ud button 28 高 r6
 *   卡片：591.3×66.2，展开图标 20×20 r6 + 标题 + 列描述 12/20 #646a73
 *   表单区：591.3×244.7 bg #f5f6f7 r6 px-6；评估条目 567.3×120 bg #f5f6f7 r4
 */
withDefaults(defineProps<{
  /** 信息条「已评估 N / M」的评估人关系文案（默认「直属上级」） */
  relationLabel?: string
  /** 已评估人数（信息条右侧数字） */
  evaluatedCount?: number
  /** 表单区评估条目数（REA 模板预览默认 2 个空条目） */
  entryCount?: number
}>(), {
  relationLabel: '直属上级',
  evaluatedCount: 1,
  entryCount: 2,
})
</script>

<style scoped>
/* 与模板预览字体栈一致（REA 正文 14/21 #1f2329） */
.r360-preview { color: #1f2329; font-family: inherit; font-size: 14px; line-height: 21px; }

/* ---------- 信息条：y≈297，14/24 ---------- */
.r360-info { display: flex; align-items: center; min-height: 24px; line-height: 24px; }
.r360-info__label { color: #646a73; }
.r360-info__num { margin-left: 4px; color: #3370ff; }
.r360-info__relation { margin-left: 4px; color: #646a73; }

/* ---------- 表头：y≈336，14/22，3 列 ---------- */
.r360-head { display: flex; margin-top: 16px; }
.r360-head__col { flex: 1; min-width: 0; line-height: 22px; color: #1f2329; }

/* ---------- 工具行：y≈368，28 高 ---------- */
.r360-tools { display: flex; align-items: center; margin-top: 16px; }
.r360-tools__title { font-size: 14px; line-height: 22px; color: #1f2329; }
.r360-tools__spacer { flex: 1; }
.r360-tools__btn {
  display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 4px 11px;
  box-sizing: border-box; border: 0; border-radius: 6px; background: transparent;
  font-family: inherit; font-size: 14px; line-height: 22px; color: #1f2329; cursor: pointer;
}
.r360-tools__btn + .r360-tools__btn { margin-left: 8px; }

/* ---------- 卡片：591.3×66.2 ---------- */
.r360-card { display: flex; align-items: flex-start; margin-top: 16px; }
.r360-card__toggle {
  display: flex; align-items: center; justify-content: center; flex: none;
  width: 20px; height: 20px; padding: 0; box-sizing: border-box; border: 0;
  border-radius: 6px; background: transparent; color: #646a73; cursor: pointer;
}
.r360-card__toggle svg { width: 12px; height: 12px; }
.r360-card__body { flex: 1; min-width: 0; padding-left: 16px; }
.r360-card__title { font-size: 14px; line-height: 22px; color: #1f2329; }
.r360-card__desc { margin-top: 4px; font-size: 12px; line-height: 20px; color: #646a73; }

/* ---------- 表单区：591.3×244.7 bg #f5f6f7 r6 px-6 ---------- */
.r360-form { margin-top: 16px; padding: 0 24px; box-sizing: border-box; border-radius: 6px; background: #f5f6f7; }
.r360-form__item { padding: 8px 0 12px; }
.r360-form__item + .r360-form__item { border-top: 1px solid #dee0e3; }
.r360-form__review { padding: 16px 20px; box-sizing: border-box; border-radius: 4px; background: #f5f6f7; }
.r360-form__empty { font-size: 14px; line-height: 22px; color: #1f2329; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
