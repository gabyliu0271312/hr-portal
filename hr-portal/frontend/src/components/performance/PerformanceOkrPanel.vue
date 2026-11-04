<script setup lang="ts">
/**
 * OKR 参考内容面板（内容设置「配置参考内容 → 更多参考内容 → OKR」）。
 *
 * 100% 按 REA 飞书绩效 DOM 实测参数还原（rea-extract/out/probe-okr*.json）：
 *   卡片：白底 r8、padding 16/20、无边框无阴影；头部行高 32
 *   标题 16/24 600｜周期选择器 216×32（32 + 152 + 32，边框 #d0d3d4，r6）｜OKR 详情按钮 100.5×32
 *   内容区：距头部 16，灰块 #f8f9fa r8 padding 8/12/12
 *     O 行：tag 20 高 r32 #4e83fd / 文案 14/22 600；右侧 进度、权重 两列各 70（表头 12/24 600 #8f959e）
 *     KR 行：border-top 1px #dee0e3，padding 8/0；tag 18 高 #f0f4ff；右侧 250 = 进度列 180 + 权重列 70
 *       进度列：百分比 12/20 #245bdb + 状态胶囊 16 高，进度条 180×4 r100（轨道 #eff0f1、填充 #3370ff），0%/100% 12/20 #646a73
 *
 * 三种状态共用一套结构：有数据 / placeholder（模板预览骨架）/ 空态。
 */
import { computed } from 'vue'
import type { PerformanceOkrObjective, PerformanceOkrStatus, PerformanceOkrView } from '@/api/performance'

const props = withDefaults(defineProps<{
  okr?: PerformanceOkrView | null
  title?: string
  placeholder?: boolean
}>(), {
  okr: null,
  title: 'OKR 内容',
  placeholder: false,
})

const STATUS_LABEL: Record<string, string> = {
  normal: '正常',
  risk: '有风险',
  extended: '已延期',
  unset: '未更新',
}

const PLACEHOLDER_TEXT = '展示内容以实际数据为准'

const periodLabel = computed(() => props.okr?.period_label || `${new Date().getFullYear()} 年度 OKR`)
const objectives = computed<PerformanceOkrObjective[]>(() => props.okr?.objectives || [])
const isEmpty = computed(() => objectives.value.length === 0)

/** 占位骨架：1 个 O + 2 个 KR（与 REA 模板预览一致：O 进度暂无、权重 100%；KR 进度 100%、权重 50.0%、状态正常） */
const placeholderObjectives = computed<PerformanceOkrObjective[]>(() => [
  {
    id: 'placeholder-o1',
    content: PLACEHOLDER_TEXT,
    weight: 100,
    percent: null,
    status: null,
    key_results: ['1', '2'].map(suffix => ({
      id: `placeholder-kr-${suffix}`,
      content: PLACEHOLDER_TEXT,
      weight: 50,
      percent: 100,
      status: 'normal',
    })),
  } as PerformanceOkrObjective,
])

const displayObjectives = computed(() => (isEmpty.value && props.placeholder ? placeholderObjectives.value : objectives.value))

function statusLabel(status?: PerformanceOkrStatus | null) {
  if (!status) return ''
  return STATUS_LABEL[status] || status
}

function formatPercent(value?: number | null) {
  return typeof value === 'number' ? `${Math.round(value * 10) / 10}%` : ''
}

function formatWeight(value?: number | null) {
  if (typeof value !== 'number') return '-'
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`
}

/** KR 权重按一位小数展示（与 REA 一致：50.0%），O 权重为整数（100%） */
function formatKrWeight(value?: number | null) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : '-'
}

function barStyle(status?: PerformanceOkrStatus | null, percent?: number | null) {
  const width = typeof percent === 'number' ? Math.max(0, Math.min(100, percent)) : 0
  return { width: `${width}%`, background: barColor(status) }
}

function barColor(status?: PerformanceOkrStatus | null) {
  if (status === 'risk') return '#f54a45'
  if (status === 'extended') return '#ff8800'
  if (status === 'unset') return '#bbbfc4'
  return '#3370ff'
}
</script>

<template>
  <div class="okr-card">
    <div class="okr-card__head">
      <span class="okr-card__title">{{ title }}</span>
      <span class="okr-period" aria-hidden="true">
        <span class="okr-period__cursor okr-period__cursor--prev">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M16.293 2.293a1 1 0 0 1 0 1.414L8 12l8.293 8.293a1 1 0 0 1-1.414 1.414l-8.293-8.293a2 2 0 0 1 0-2.828l8.293-8.293a1 1 0 0 1 1.414 0Z" fill="currentColor"/></svg>
        </span>
        <span class="okr-period__label">{{ periodLabel }}</span>
        <!-- 右按钮与 REA DOM 同构：自身仍是「左圆角 + 无右边框」，靠整体 rotate(180deg) 翻到右侧。
             千万不能先把边框 / 圆角手动镜像再旋转——两次镜像会互相抵消，边框跑到错误一侧。 -->
        <span class="okr-period__cursor okr-period__cursor--next">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M16.293 2.293a1 1 0 0 1 0 1.414L8 12l8.293 8.293a1 1 0 0 1-1.414 1.414l-8.293-8.293a2 2 0 0 1 0-2.828l8.293-8.293a1 1 0 0 1 1.414 0Z" fill="currentColor"/></svg>
        </span>
      </span>
      <button type="button" class="okr-detail" tabindex="-1">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 0a7 7 0 1 0 0 14A7 7 0 0 0 7 0Zm2.707 7A2.71 2.71 0 0 1 7 9.707 2.71 2.71 0 0 1 4.293 7 2.71 2.71 0 0 1 7 4.293 2.71 2.71 0 0 1 9.707 7ZM7 1.352C4.362 2.912 3.39 5.114 3.3 5.33a4.057 4.057 0 0 0-.046 3.237A9.435 9.435 0 0 1 1.36 6.99l-.008.007A5.654 5.654 0 0 1 7 1.352ZM1.8 9.204c2.31 1.74 4.47 1.855 5.002 1.855l.096-.001H7c1.493 0 2.8-.81 3.505-2.013a8.57 8.57 0 0 1-.199 1.29 5.653 5.653 0 0 1-9.014-.685 8.63 8.63 0 0 1 .508-.446Z" fill="#3370ff"/></svg>
        OKR 详情
      </button>
    </div>

    <div v-if="isEmpty && !placeholder" class="okr-empty">
      <span class="okr-empty__image" aria-hidden="true">
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="44" fill="#f2f3f5"/><rect x="36" y="46" width="48" height="5" rx="2.5" fill="#e0e2e6"/><rect x="36" y="58" width="40" height="5" rx="2.5" fill="#e9ebee"/><rect x="36" y="70" width="30" height="5" rx="2.5" fill="#e9ebee"/><circle cx="86" cy="86" r="14" fill="#eff0f1"/><path d="M86 80v7m0 5v.5" stroke="#c9cdd4" stroke-width="2.4" stroke-linecap="round"/></svg>
      </span>
      <p class="okr-empty__desc">暂无 OKR 内容</p>
    </div>

    <div v-else class="okr-body">
      <div v-for="(objective, index) in displayObjectives" :key="objective.id || index" class="okr-subsection">
        <div class="okr-objective">
          <div class="okr-objective__left">
            <span class="okr-objective__tag"><span>O</span><span>{{ index + 1 }}</span></span>
            <span class="okr-objective__text">{{ objective.content }}</span>
          </div>
          <div class="okr-o-metrics">
            <div class="okr-o-col">
              <div class="okr-o-col__label">进度</div>
              <div class="okr-o-col__value">
                <span v-if="typeof objective.percent === 'number'">{{ formatPercent(objective.percent) }}</span>
                <span v-else class="okr-pending">暂无</span>
              </div>
            </div>
            <div class="okr-o-col">
              <div class="okr-o-col__label">权重</div>
              <div class="okr-o-col__value">{{ formatWeight(objective.weight) }}</div>
            </div>
          </div>
        </div>

        <div v-for="(kr, krIndex) in objective.key_results" :key="kr.id || krIndex" class="okr-kr">
          <div class="okr-kr__main">
            <span class="okr-kr__tag"><span>KR</span><span>{{ krIndex + 1 }}</span></span>
            <span class="okr-kr__text">{{ kr.content }}</span>
          </div>
          <div class="okr-kr__metrics">
            <div class="okr-kr__col">
              <div class="okr-kr__status">
                <span class="okr-kr__percent">{{ formatPercent(kr.percent) }}</span>
                <span v-if="statusLabel(kr.status)" class="okr-kr__badge" :class="`okr-kr__badge--${kr.status}`">{{ statusLabel(kr.status) }}</span>
              </div>
              <div class="okr-progress" aria-hidden="true"><span class="okr-progress__bar" :style="barStyle(kr.status, kr.percent)"></span></div>
              <div class="okr-kr__range"><span>0%</span><span>100%</span></div>
            </div>
            <div class="okr-kr__weight">{{ formatKrWeight(kr.weight) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 卡片：白底 r8、padding 16/20、无边框无阴影（实测 box-shadow: none） */
.okr-card { --okr-bw: .666667px; padding: 16px 20px; border-radius: 8px; background: #fff; }

/* 头部行 32：标题 16/24 600；周期选择器 216×32；详情按钮 100.5×32
   REA 实测：头部是 flex，宽度不足时周期选择器整体收缩、文本省略，不允许换行。 */
.okr-card__head { display: flex; align-items: center; min-width: 0; height: 32px; }
.okr-card__title { flex: none; font-size: 16px; font-weight: 600; line-height: 24px; color: #1f2329; white-space: nowrap; }
.okr-period { display: flex; flex: 0 1 216px; width: 216px; min-width: 0; height: 32px; margin-left: auto; margin-right: 10px; border-radius: 4px; }
/* 左右按钮同构（REA 实测两层完全相同）：只有 top/left/bottom 三条边，无右边框，圆角在左上/左下；
   右按钮靠 rotate(180deg) 翻到右侧，边框与圆角随之镜像到正确的方向。 */
.okr-period__cursor { display: flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; box-sizing: border-box; border: var(--okr-bw) solid #d0d3d6; border-right: 0; border-radius: 6px 0 0 6px; background: #fff; color: #bbbfc4; }
.okr-period__cursor--next { transform: rotate(180deg); }
.okr-period__label { flex: 1 1 auto; width: auto; min-width: 0; height: 32px; box-sizing: border-box; padding: 0 12px; border: var(--okr-bw) solid #d0d3d6; background: #fff; font-size: 14px; line-height: 32px; color: #1f2329; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.okr-detail { display: inline-flex; align-items: center; flex: none; gap: 4px; height: 32px; padding: 4px 11px; box-sizing: border-box; border: var(--okr-bw) solid #d0d3d6; border-radius: 6px; background: #fff; font-family: inherit; font-feature-settings: normal; font-variant-numeric: normal; font-size: 14px; line-height: 22px; color: #1f2329; white-space: nowrap; cursor: pointer; }

/* 空态 */
.okr-empty { display: flex; flex-direction: column; align-items: center; padding: 24px 0 8px; }
.okr-empty__image { display: block; width: 120px; height: 120px; }
.okr-empty__desc { margin: 16px 0 0; font-size: 14px; line-height: 22px; color: #646a73; }

/* 内容区：距头部 16 */
.okr-body { display: flow-root; margin-top: 16px; }
/* 灰块：8 上留白 + px12 pb12（实测 #f8f9fa r8） */
.okr-subsection { margin-bottom: 8px; padding: 8px 12px 12px; border-radius: 8px; background: #f8f9fa; }

/* O 行：左侧 padding-top 16（文案 14/22 600），右侧 两列各 70 */
.okr-objective { display: flex; align-items: flex-start; margin-bottom: 12px; }
.okr-objective__left { display: flex; flex: 1; min-width: 0; padding-top: 16px; margin-right: 6px; }
.okr-objective__tag { display: inline-flex; align-items: center; justify-content: center; height: 20px; padding: 0 8px; box-sizing: border-box; margin: 4px 8px 0 0; flex: none; border-radius: 32px; background: #4e83fd; color: #fff; font-size: 14px; font-weight: 600; line-height: 24px; }
.okr-objective__text { margin-top: 3px; font-size: 14px; font-weight: 600; line-height: 22px; color: #1f2329; overflow-wrap: anywhere; }
.okr-o-metrics { display: flex; width: 140px; flex: none; }
.okr-o-col { width: 70px; text-align: right; }
.okr-o-col__label { font-size: 12px; font-weight: 600; line-height: 24px; color: #8f959e; }
.okr-o-col__value { height: 24px; margin-top: 8px; font-size: 12px; line-height: 24px; color: #1f2329; }
.okr-pending { display: inline-block; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 4px; background: #e7e9e9; color: #646a73; font-size: 12px; line-height: 16px; }

/* KR 行：border-top 1px #dee0e3，padding 8/0；左文 14/22，右 250（180 + 70） */
.okr-kr { display: flex; align-items: flex-start; padding: 8px 0; border-top: var(--okr-bw) solid #dee0e3; line-height: 22px; }
.okr-kr:last-child { padding-bottom: 0; }
.okr-kr__main { display: flex; flex: 1; min-width: 0; margin-right: 20px; }
.okr-kr__tag { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 18px; padding: 0 4px; box-sizing: border-box; margin: 2px 8px 0 0; flex: none; border-radius: 32px; background: #f0f4ff; color: #3370ff; font-size: 12px; font-weight: 400; line-height: 22px; }
.okr-kr__text { font-size: 14px; font-weight: 400; line-height: 22px; color: #1f2329; overflow-wrap: anywhere; }
.okr-kr__metrics { display: flex; width: 250px; flex: none; }
.okr-kr__col { width: 180px; }
.okr-kr__status { display: flex; align-items: center; justify-content: space-between; height: 20px; }
.okr-kr__percent { font-size: 12px; line-height: 20px; color: #245bdb; white-space: nowrap; }
.okr-kr__badge { display: inline-block; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 4px; background: rgba(51, 112, 255, .2); color: #245bdb; font-size: 12px; line-height: 16px; white-space: nowrap; }
.okr-kr__badge--risk { background: rgba(245, 74, 69, .2); color: #d83931; }
.okr-kr__badge--extended { background: rgba(255, 136, 0, .2); color: #d9730d; }
.okr-kr__badge--unset { background: #e7e9e9; color: #646a73; }
.okr-progress { height: 4px; margin-top: 4px; border-radius: 100px; background: #eff0f1; overflow: hidden; }
.okr-progress__bar { display: block; height: 100%; border-radius: 100px; background: #3370ff; }
.okr-kr__range { display: flex; justify-content: space-between; margin-top: 4px; font-size: 12px; line-height: 20px; color: #646a73; }
.okr-kr__weight { width: 70px; flex: none; align-self: center; text-align: right; font-size: 12px; line-height: 22px; color: #1f2329; }
</style>
