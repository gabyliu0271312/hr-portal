<script setup lang="ts">
/**
 * 「更多参考内容」类内置引用的预览骨架。
 *
 * 这类引用在内容设置里只登记关系（reference_kind='more'，value=okr/more_reference/team_stats），
 * 不产生内容条目（items 为空），真实数据要等填写页按被评估人拉取。
 * 预览按 REA 飞书绩效的内置骨架渲染占位（结构与配色取自 rea-extract 抓取的 DOM/CSS 实测）。
 */
import { computed } from 'vue'

const props = defineProps<{
  /** 引用值：okr / more_reference / team_stats */
  kind?: string
  label: string
  description?: string
}>()

/** 更多参考固定包含的三个信息单元（来源：GET /perf/review/template/references/settings） */
const MORE_REFERENCE_UNITS = ['绩效信息', '异动信息', '补充信息']

const normalized = computed(() => {
  const value = (props.kind || '').trim()
  if (value) return value
  const label = props.label.trim()
  if (label === 'OKR') return 'okr'
  if (label === '团队统计') return 'team_stats'
  return 'more_reference'
})

const periodLabel = computed(() => `${new Date().getFullYear()} 年度 OKR`)
</script>

<template>
  <div v-if="normalized === 'okr'" class="ref-okr">
    <div class="ref-okr__head">
      <span class="ref-okr__title">OKR 内容</span>
      <span class="ref-okr__period">
        {{ periodLabel }}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true"><path d="M1.5 3L4 5.5 6.5 3" stroke="#646a73" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <button type="button" class="ref-okr__detail" tabindex="-1">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="6" stroke="#3370ff" stroke-width="1.2"/><path d="M7 6.2v3.4" stroke="#3370ff" stroke-width="1.4" stroke-linecap="round"/><circle cx="7" cy="4.2" r=".8" fill="#3370ff"/></svg>
        OKR 详情
      </button>
    </div>

    <div class="ref-okr__body">
      <!-- 目标行 -->
      <div class="okr-objective">
        <div class="okr-objective__title">
          <span class="okr-tag">O1</span>
          <span class="okr-text">展示内容以实际数据为准</span>
        </div>
        <div class="okr-objective__metrics">
          <div class="okr-objective__head">
            <span>进度</span>
            <span>权重</span>
          </div>
          <div class="okr-objective__values">
            <span class="okr-cell"><span class="okr-empty">暂无</span></span>
            <span class="okr-cell okr-cell--right">100%</span>
          </div>
        </div>
      </div>

      <!-- 关键结果行 -->
      <div v-for="kr in ['KR1', 'KR2']" :key="kr" class="okr-kr">
        <div class="okr-kr__title">
          <span class="okr-tag okr-tag--kr">{{ kr }}</span>
          <span class="okr-text">展示内容以实际数据为准</span>
        </div>
        <div class="okr-kr__metrics">
          <div class="okr-kr__metrics-head">
            <span class="okr-kr__pct">100%</span>
            <span class="okr-badge">正常</span>
          </div>
          <div class="okr-progress" aria-hidden="true"><span class="okr-progress__bar"></span></div>
          <div class="okr-kr__range"><span>0%</span><span>100%</span></div>
        </div>
        <div class="okr-kr__weight">50.0%</div>
      </div>
    </div>
  </div>

  <div v-else class="ref-block">
    <div class="ref-block__title">{{ label }}</div>
    <p v-if="description && normalized !== 'more_reference'" class="ref-block__desc">{{ description }}</p>
    <template v-if="normalized === 'more_reference'">
      <div v-for="unit in MORE_REFERENCE_UNITS" :key="unit" class="ref-block__unit">
        <div class="ref-block__unit-title">{{ unit }}</div>
        <div class="ref-block__placeholder">展示内容以实际数据为准</div>
      </div>
    </template>
    <div v-else class="ref-block__placeholder">展示内容以实际数据为准</div>
  </div>
</template>

<style scoped>
/* ---------- OKR 卡片 ---------- */
.ref-okr { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(31, 35, 41, .06); padding: 16px 20px 20px; }
.ref-okr__head { display: flex; align-items: center; margin-bottom: 16px; }
.ref-okr__title { font-size: 16px; font-weight: 500; color: #1f2329; line-height: 24px; }
.ref-okr__period { display: inline-flex; align-items: center; justify-content: space-between; gap: 6px; width: 152px; height: 28px; margin-left: 16px; padding: 0 8px; border: 1px solid #dee0e3; border-radius: 6px; font-size: 14px; color: #1f2329; }
.ref-okr__detail { display: inline-flex; align-items: center; gap: 4px; height: 28px; margin-left: auto; padding: 0 10px; border: 1px solid #dee0e3; border-radius: 6px; background: #fff; font-size: 14px; color: #1f2329; cursor: default; }

.ref-okr__body { display: flex; flex-direction: column; }

/* ---------- 目标行 ---------- */
.okr-objective { display: flex; gap: 12px; align-items: flex-start; padding-bottom: 4px; }
.okr-objective__title { flex: 1; min-width: 0; display: flex; align-items: flex-start; }
.okr-objective__metrics { flex: none; width: 280px; }
.okr-objective__head { display: flex; justify-content: flex-end; font-size: 12px; color: #646a73; line-height: 20px; margin-bottom: 2px; }
.okr-objective__head span { width: 140px; text-align: right; }
.okr-objective__values { display: flex; justify-content: flex-end; align-items: center; height: 20px; }
.okr-cell { width: 140px; }
.okr-cell--right { text-align: right; font-size: 12px; color: #1f2329; }

/* ---------- 标签 ---------- */
.okr-tag { display: inline-flex; align-items: center; justify-content: center; flex: none; height: 20px; min-width: 32px; padding: 0 8px; margin: 4px 8px 0 0; border-radius: 32px; background: #4e83fd; color: #fff; font-size: 14px; font-weight: 600; }
.okr-tag--kr { height: 18px; min-width: 32px; padding: 0 4px; margin-top: 2px; border-radius: 32px; background: #f0f4ff; color: #3370ff; font-size: 12px; font-weight: 400; }
.okr-text { font-size: 14px; font-weight: 600; line-height: 24px; color: #1f2329; word-break: break-word; }

/* ---------- 徽标 ---------- */
.okr-empty { display: inline-block; height: 16px; padding: 0 8px; border-radius: 4px; background: #e7e9e9; color: #646a73; font-size: 12px; line-height: 16px; }
.okr-badge { display: inline-block; height: 16px; padding: 0 8px; border-radius: 4px; background: rgba(51, 112, 255, .2); color: #245bdb; font-size: 12px; line-height: 16px; }

/* ---------- 关键结果行 ---------- */
.okr-kr { display: flex; gap: 12px; align-items: flex-start; padding: 8px 0; border-top: 1px solid #dee0e3; color: #373c43; }
.okr-kr:last-child { padding-bottom: 0; }
.okr-kr__title { flex: 1; min-width: 0; display: flex; align-items: flex-start; }
.okr-kr__title .okr-text { font-weight: 400; line-height: 22px; color: #373c43; }
.okr-kr__metrics { flex: none; width: 180px; }
.okr-kr__metrics-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
.okr-kr__pct { font-size: 12px; line-height: 20px; color: #245bdb; }
.okr-progress { width: 100%; height: 6px; border-radius: 4px; background: #eff0f1; overflow: hidden; }
.okr-progress__bar { display: block; width: 100%; height: 100%; border-radius: 4px; background: #34c724; }
.okr-kr__range { display: flex; justify-content: space-between; margin-top: 2px; font-size: 12px; line-height: 20px; color: #646a73; }
.okr-kr__weight { flex: none; width: 70px; align-self: flex-end; text-align: right; font-size: 12px; line-height: 20px; color: #1f2329; }

/* ---------- 更多参考 / 团队统计 ---------- */
.ref-block { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(31, 35, 41, .06); padding: 16px 20px 20px; }
.ref-block__title { font-size: 16px; font-weight: 500; color: #1f2329; line-height: 24px; }
.ref-block__desc { margin: 4px 0 0; font-size: 14px; color: #646a73; line-height: 22px; }
.ref-block__unit { margin-top: 16px; }
.ref-block__unit-title { font-size: 14px; font-weight: 600; color: #1f2329; line-height: 22px; }
.ref-block__placeholder { margin-top: 8px; padding: 12px; border-radius: 8px; background: #f5f6f7; font-size: 14px; color: #646a73; line-height: 22px; }
</style>
