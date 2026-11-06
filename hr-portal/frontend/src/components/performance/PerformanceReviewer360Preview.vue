<template>
  <div class="r360-preview" aria-label="360°评估详情">
    <!-- ud__card 白卡容器（REA：x=341 宽 631、bg #fff、radius 8、pd 16/20、无 border 无 shadow） -->
    <div class="r360-card-wrap">
      <!-- 信息条：已评估 1/1：直属上级 1 -->
      <div class="r360-info">
        <span class="r360-info__label">已评估</span>
        <span ref="evaluatedAnchor" class="r360-info__num" tabindex="0" @mouseenter="evaluatedTooltipOpen = true" @mouseleave="evaluatedTooltipOpen = false" @focusin="evaluatedTooltipOpen = true" @focusout="evaluatedTooltipOpen = false">{{ evaluatedProgress }}</span>
        <span class="r360-info__colon">：</span>
        <span class="r360-info__relation">{{ relationLabel }}</span>
        <span ref="relationAnchor" class="r360-info__num" tabindex="0" @mouseenter="relationTooltipOpen = true" @mouseleave="relationTooltipOpen = false" @focusin="relationTooltipOpen = true" @focusout="relationTooltipOpen = false">{{ relationTotal }}</span>
      </div>
      <PerformancePopover :visible="evaluatedTooltipOpen" :anchor="evaluatedAnchor" width="auto" :gap="8" name="r360-evaluated-tooltip" class="is-dark" @close="evaluatedTooltipOpen = false">
        <div class="r360-tooltip__stat">已评估: {{ evaluatedCount }}</div>
        <div class="r360-tooltip__people" aria-hidden="true"><ReviewerAvatar v-for="(row, index) in visibleEvaluatedReviewers" :key="`evaluated-${index}`" :row="row" /></div>
      </PerformancePopover>
      <PerformancePopover :visible="relationTooltipOpen" :anchor="relationAnchor" width="auto" :gap="8" name="r360-relation-tooltip" class="is-dark" @close="relationTooltipOpen = false">
        <div class="r360-tooltip__people" aria-label="直属上级人员"><ReviewerAvatar v-for="(row, index) in visibleReviewers" :key="`relation-${index}`" :row="row" /></div>
      </PerformancePopover>

      <!-- 表头：默认灰底黑字，打开后浅蓝底蓝字；同一时刻只打开一个 -->
      <div ref="filterRoot" class="r360-head">
        <div v-for="filter in filters" :key="filter.key" class="r360-head__filter-wrap">
          <button type="button" class="r360-head__filter" :class="{ 'is-open': openFilter === filter.key }" :aria-expanded="openFilter === filter.key" :aria-controls="`r360-filter-${filter.key}`" @click="toggleFilter(filter.key)">
            <span class="r360-head__filter-text">{{ filter.label }}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor"/></svg>
          </button>
          <div v-if="openFilter === filter.key" :id="`r360-filter-${filter.key}`" class="r360-head__menu" role="listbox" :aria-label="filter.label">
            <button type="button" class="r360-head__option" role="option" aria-selected="true" @click="selectAllFilter">
              <span>全部</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 工具行：详情视图下拉 + 排序 + 收起详情（REA ud__button--text） -->
      <div class="r360-tools">
        <div class="r360-view-dropdown">
          <button type="button" class="r360-tools__btn r360-tools__btn--view" tabindex="-1" @click="viewMenuOpen = !viewMenuOpen">
            <span class="r360-icon">
              <svg v-if="viewMode === 'card'" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm2 0v16h16V4H4Z" fill="currentColor"/><path d="M12.5 7a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 8a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm6.5 3a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 12a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm6.5 3a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 16a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Z" fill="currentColor"/></svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm7.5 0v4H20V4H9.5Zm0 6v4H20v-4H9.5Zm-2 4v-4H4v4h3.5ZM4 16v4h3.5v-4H4Zm5.5 0v4H20v-4H9.5Zm-2-12H4v4h3.5V4Z" fill="currentColor"/></svg>
            </span>
            <span class="r360-tools__view-text">{{ viewMode === 'card' ? '详情视图' : '表格视图' }}</span>
            <span class="r360-icon r360-icon--end"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor"/></svg></span>
          </button>
          <div v-if="viewMenuOpen" class="r360-view-menu" role="menu">
            <button type="button" class="r360-view-menu__item" :class="{ 'is-active': viewMode === 'card' }" role="menuitem" @click="switchView('card')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm2 0v16h16V4H4Z" fill="currentColor"/><path d="M12.5 7a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 8a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm6.5 3a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 12a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2Zm6.5 3a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 16a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2Z" fill="currentColor"/></svg>
              <span>详情视图</span><svg v-if="viewMode === 'card'" class="r360-view-menu__check" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z" fill="currentColor"/></svg>
            </button>
            <button type="button" class="r360-view-menu__item" :class="{ 'is-active': viewMode === 'table' }" role="menuitem" @click="switchView('table')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm7.5 0v4H20V4H9.5Zm0 6v4H20v-4H9.5Zm-2 4v-4H4v4h3.5ZM4 16v4h3.5v-4H4Zm5.5 0v4H20v-4H9.5Zm-2-12H4v4h3.5V4Z" fill="currentColor"/></svg>
              <span>表格视图</span><svg v-if="viewMode === 'table'" class="r360-view-menu__check" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
        <span class="r360-tools__spacer"></span>
        <button type="button" class="r360-tools__btn r360-tools__btn--sort" tabindex="-1">
          <span class="r360-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 1.333h-1.803s-.419.137-.498.343l-3.664 9.598a.533.533 0 0 0 .498.724h.978a.533.533 0 0 0 .5-.347l.664-1.785h4.841l.663 1.786c.078.21.277.348.5.348h.987a.533.533 0 0 0 .498-.724l-3.666-9.6A.533.533 0 0 0 17 1.333Zm.725 6.4h-3.264l1.605-4.316h.05l1.61 4.316Zm-6.175 6.4c0-.294.238-.533.533-.533h8.522c.295 0 .534.239.534.534v.703c0 .154-.067.3-.183.402l-6.068 5.298h5.717c.295 0 .534.24.534.534v1.063a.533.533 0 0 1-.534.533h-8.522a.533.533 0 0 1-.534-.534v-.973c0-.154.067-.3.183-.402l5.763-5.027h-5.412a.533.533 0 0 1-.534-.534v-1.063Zm-8.923 2.534h2.705V3.2c0-.294.238-.533.533-.533h.933c.295 0 .534.239.534.533v19.16a.533.533 0 0 1-.965.314l-4-5.499a.32.32 0 0 1 .26-.508Z" fill="currentColor"/></svg></span>
          排序
        </button>
        <button type="button" class="r360-tools__btn r360-tools__btn--collapse" :aria-expanded="expanded" :aria-label="expanded ? '收起详情' : '展开详情'" @click="toggleExpanded">
          <svg v-if="expanded" class="r360-collapse-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M17.468 5a.25.25 0 0 1 .25.25v2.419h1.572a.2.2 0 0 1 .08.017l.036.02a.2.2 0 0 1 .076.222l-.028.057-2.307 3.265a.2.2 0 0 1-.282.045l-.044-.045-2.307-3.265a.2.2 0 0 1 .11-.308l.053-.007 1.572-.001V5.25a.25.25 0 0 1 .25-.25h.969Zm0 13.5a.25.25 0 0 0 .25-.25v-2.419h1.572a.2.2 0 0 0 .08-.017l.036-.02a.2.2 0 0 0 .076-.222l-.028-.057-2.307-3.265a.2.2 0 0 0-.282-.045l-.044.045-2.307 3.265a.2.2 0 0 0 .11.308l.053.007 1.572.001v2.419c0 .138.112.25.25.25h.969Zm-4.53-2.073c.18 0 .332.128.367.299l.007.076v.679a.375.375 0 0 1-.3.367l-.075.008H4.875a.375.375 0 0 1-.367-.3l-.008-.075v-.68c0-.18.129-.332.3-.367l.075-.007h8.062Zm0-5.479c.18 0 .332.129.367.3l.007.075v.68a.375.375 0 0 1-.3.367l-.075.007H4.875a.375.375 0 0 1-.367-.299l-.008-.076v-.679c0-.181.129-.332.3-.367l.075-.008h8.062Zm0-5.478c.18 0 .332.128.367.3l.007.075v.68a.375.375 0 0 1-.3.366l-.075.008H4.875a.375.375 0 0 1-.367-.3L4.5 6.525v-.68c0-.18.129-.331.3-.366l.075-.008h8.062z" fill="currentColor"/></svg>
          <svg v-else class="r360-collapse-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M17.468 11a.25.25 0 0 0 .25-.25V8.665h1.572a.2.2 0 0 0 .08-.017l.036-.02a.2.2 0 0 0 .076-.221l-.028-.058-2.307-3.264a.201.201 0 0 0-.282-.046l-.044.046-2.307 3.264a.2.2 0 0 0 .11.308l.053.008h1.572v2.085c0 .138.112.25.25.25h.969Zm0 1.5a.25.25 0 0 1 .25.25v2.085h1.572a.2.2 0 0 1 .08.017l.036.02a.2.2 0 0 1 .076.222l-.028.057-2.307 3.265a.2.2 0 0 1-.282.046l-.044-.046-2.307-3.265a.2.2 0 0 1 .11-.308l.053-.007h1.572V12.75a.25.25 0 0 1 .25-.25h.969Zm-4.53 3.927c.18 0 .332.128.367.299l.007.076v.679a.375.375 0 0 1-.3.367l-.075.008H4.875a.375.375 0 0 1-.367-.3l-.008-.075v-.68c0-.18.129-.332.3-.367l.075-.007h8.062Zm0-5.479c.18 0 .332.129.367.3l.007.075v.68a.375.375 0 0 1-.3.367l-.075.007H4.875a.375.375 0 0 1-.367-.299l-.008-.076v-.679c0-.181.129-.332.3-.367l.075-.008h8.062Zm0-5.478c.18 0 .332.128.367.3l.007.075v.68a.375.375 0 0 1-.3.366l-.075.008H4.875a.375.375 0 0 1-.367-.3L4.5 6.525v-.68c0-.18.129-.331.3-.366l.075-.008h8.062Z" fill="currentColor"/></svg>
          {{ expanded ? '收起详情' : '展开详情' }}
        </button>
      </div>

      <!-- 卡片视图：三角按钮与信息主体共享 expanded；头像第一行，描述下一行并同左缘 -->
      <div v-if="viewMode === 'card'" class="r360-card">
        <button type="button" class="r360-card__toggle" :aria-expanded="expanded" :aria-label="expanded ? '收起详情' : '展开详情'" @click="toggleExpanded">
          <svg v-if="expanded" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor"/></svg>
          <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.627 11.22a1 1 0 0 1 0 1.56L8.291 21.084a1 1 0 0 1-1.626-.78V3.696a1 1 0 0 1 1.626-.78l10.335 8.305Z" fill="currentColor"/></svg>
        </button>
        <div class="r360-card__body" role="button" tabindex="0" :aria-expanded="expanded" :aria-label="expanded ? '收起详情' : '展开详情'" @click="toggleExpanded" @keydown.enter.prevent="toggleExpanded" @keydown.space.prevent="toggleExpanded">
          <div class="r360-card__first">
            <ReviewerAvatar :row="visibleReviewers[0]" />
          </div>
          <div class="r360-card__desc">{{ relationLabel }} | 所属部门 | 系统默认邀请</div>
        </div>
      </div>

      <!-- 表格视图：REA 固定591宽、46px表头、57px人员行，详情作为第二行 -->
      <div v-if="viewMode === 'table'" class="r360-table-wrap">
        <table class="r360-table" style="table-layout: fixed;">
          <colgroup><col class="r360-table__expand-col"><col></colgroup>
          <thead><tr><th class="r360-table__expand-cell"></th><th class="r360-table__head-cell">姓名</th></tr></thead>
          <tbody>
            <template v-for="(row, index) in visibleReviewers" :key="index">
              <tr class="r360-table__row" role="button" tabindex="0" :aria-expanded="expanded" @click="toggleExpanded" @keydown.enter.prevent="toggleExpanded" @keydown.space.prevent="toggleExpanded">
                <td class="r360-table__expand-cell">
                  <button type="button" class="r360-table__expand-btn" :aria-expanded="expanded" :aria-label="expanded ? '收起详情' : '展开详情'" @click.stop="toggleExpanded">
                    <svg v-if="expanded" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor"/></svg>
                    <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.627 11.22a1 1 0 0 1 0 1.56L8.291 21.084a1 1 0 0 1-1.626-.78V3.696a1 1 0 0 1 1.626-.78l10.335 8.305Z" fill="currentColor"/></svg>
                  </button>
                </td>
                <td class="r360-table__cell">
                  <div class="r360-table__person">
                    <img v-if="row.avatarUrl" class="r360-table__avatar" :src="row.avatarUrl" alt="">
                    <span v-else class="r360-table__avatar r360-table__avatar--fallback" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 13H9c-2.761 0-6 1.931-6 5.4V20c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-1.6c0-3.471-3.239-5.4-6-5.4ZM7 7a5 5 0 1 0 10 0A5 5 0 0 0 7 7Z" fill="currentColor"/></svg></span>
                    <div class="r360-table__info"><div class="r360-table__name">{{ row.name }}</div><div class="r360-table__sub">{{ row.sub }}</div></div>
                  </div>
                </td>
              </tr>
              <tr class="r360-table__expanded-row" :class="{ 'is-expanded': expanded }"><td colspan="2"><div v-show="expanded" class="r360-table__details"><div v-for="content in contents" :key="contentKey(content)" class="r360-form__item"><div class="r360-form__review"><div class="r360-form__root"><div class="r360-form__root-title">{{ content.name }}</div><div v-if="contentDescription(content)" class="r360-form__root-description">{{ contentDescription(content) }}</div></div><PerformanceTemplateRenderer mode="readonly" :show-header="false" :sections="sectionsFor(content)" :answers="{}" /></div></div></div></td></tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- 表单区：保留 REA 的灰底条目外壳，内部复用普通参考内容的 root 标题与 readonly renderer -->
      <div v-show="expanded && viewMode === 'card'" class="r360-form">
        <div v-for="content in contents" :key="contentKey(content)" class="r360-form__item">
          <div class="r360-form__review">
            <div class="r360-form__root">
              <div class="r360-form__root-title">{{ content.name }}</div>
              <div v-if="contentDescription(content)" class="r360-form__root-description">{{ contentDescription(content) }}</div>
            </div>
            <PerformanceTemplateRenderer
              mode="readonly"
              :show-header="false"
              :sections="sectionsFor(content)"
              :answers="{}"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 参考区「360°反馈」页签预览（REA 实测：360°评估详情视图 + 表格视图切换 + 收起/展开交互）。
 *
 * 360°只拥有自己的统计、筛选和人员卡片外壳；展开后的内容仍然消费来源
 * root/content 与统一 readonly sections，不能在这里伪造固定数量的占位条目。
 */
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, type PropType } from 'vue'
import type { PerformanceTemplateContent, PerformanceTemplateSection } from '@/api/performance'
import PerformancePopover from './PerformancePopover.vue'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'

type ReviewerRow = { name: string; sub: string; avatarUrl?: string }
type FilterKey = 'dimension' | 'relation' | 'personType'

const ReviewerAvatar = defineComponent({
  props: { row: { type: Object as PropType<ReviewerRow>, required: false } },
  setup(props) {
    return () => props.row?.avatarUrl
      ? h('img', { class: 'r360-avatar', src: props.row.avatarUrl, alt: '' })
      : h('span', { class: 'r360-avatar r360-avatar--fallback', 'aria-hidden': 'true' }, [h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none' }, [h('path', { d: 'M15 13H9c-2.761 0-6 1.931-6 5.4V20c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-1.6c0-3.471-3.239-5.4-6-5.4ZM7 7a5 5 0 1 0 10 0A5 5 0 0 0 7 7Z', fill: 'currentColor' })])])
  },
})

const props = withDefaults(defineProps<{
  relationLabel?: string
  evaluatedCount?: number
  expectedCount?: number
  relationTotal?: number
  avatarUrl?: string
  tableRows?: ReviewerRow[]
  evaluatedReviewers?: ReviewerRow[]
  contents?: PerformanceTemplateContent[]
  readonlySections?: Record<string, PerformanceTemplateSection[]>
}>(), {
  relationLabel: '直属上级',
  evaluatedCount: 1,
  expectedCount: 1,
  relationTotal: 1,
  avatarUrl: '',
  tableRows: () => [],
  evaluatedReviewers: () => [],
  contents: () => [],
  readonlySections: () => ({}),
})

/** REA 默认展开态（按钮「收起详情」） */
const expanded = ref(true)
const filters: Array<{ key: FilterKey; label: string }> = [
  { key: 'dimension', label: '评估维度' },
  { key: 'relation', label: '员工关系' },
  { key: 'personType', label: '人员类型' },
]
const openFilter = ref<FilterKey | null>(null)
const filterRoot = ref<HTMLElement | null>(null)
const evaluatedAnchor = ref<HTMLElement | null>(null)
const relationAnchor = ref<HTMLElement | null>(null)
const evaluatedTooltipOpen = ref(false)
const relationTooltipOpen = ref(false)
const evaluatedProgress = computed(() => `${props.evaluatedCount}/${props.expectedCount}`)
const visibleReviewers = computed<ReviewerRow[]>(() => props.tableRows.length ? props.tableRows : [{ name: '评估人', sub: `${props.relationLabel}  |  所属部门  |  系统默认邀请`, avatarUrl: props.avatarUrl }])
const visibleEvaluatedReviewers = computed<ReviewerRow[]>(() => props.evaluatedReviewers.length ? props.evaluatedReviewers : visibleReviewers.value.slice(0, props.evaluatedCount))
/** 视图模式：card（详情视图）/ table（表格视图），REA 默认详情视图 */
const viewMode = ref<'card' | 'table'>('card')
const viewMenuOpen = ref(false)
function toggleExpanded() { expanded.value = !expanded.value }
function toggleFilter(key: FilterKey) { openFilter.value = openFilter.value === key ? null : key }
function selectAllFilter() { openFilter.value = null }
function closeFilter(event: MouseEvent) {
  if (filterRoot.value && !filterRoot.value.contains(event.target as Node)) openFilter.value = null
}
onMounted(() => document.addEventListener('click', closeFilter))
onBeforeUnmount(() => document.removeEventListener('click', closeFilter))
function switchView(mode: 'card' | 'table') {
  viewMode.value = mode
  expanded.value = mode === 'card'
  viewMenuOpen.value = false
}
function contentKey(content: PerformanceTemplateContent) {
  return String(content.content_id || content.id || content.name || '')
}
function contentDescription(content: PerformanceTemplateContent) {
  return content.settings?.hideDescription ? '' : content.description || ''
}
function sectionsFor(content: PerformanceTemplateContent) {
  return props.readonlySections[contentKey(content)] || []
}
</script>

<style scoped>
/* 与模板预览字体栈一致（REA 正文 14/21 #1f2329） */
.r360-preview { color: #1f2329; font-family: inherit; font-size: 14px; line-height: 21px; }

/* ---------- ud__card 白卡容器（REA：x=341 宽 631 白底 radius 8 pd 16/20，无 border 无 shadow） ---------- */
.r360-card-wrap {
  box-sizing: border-box;
  border: 0;
  border-radius: 8px;
  background: #fff;
  padding: 16px 20px;
}

/* ---------- 信息条：y≈297，14/24；数字独立浮层 ---------- */
.r360-info { display: flex; align-items: center; min-height: 24px; line-height: 24px; }
.r360-info__label { color: #646a73; }
.r360-info__colon { color: #646a73; }
.r360-info__num { margin-left: 0; color: #3370ff; cursor: default; outline: none; }
.r360-info__label + .r360-info__num { margin-left: 4px; }
.r360-info__relation { margin-left: 4px; color: #646a73; }
.r360-tooltip__stat { white-space: nowrap; }
.r360-tooltip__people { display: flex; align-items: center; min-height: 20px; margin-top: 4px; }
.r360-relation-tooltip .r360-tooltip__people { margin-top: 0; }
.r360-tooltip__people :deep(.r360-avatar + .r360-avatar) { margin-left: -4px; }

/* ---------- 表头：默认 N-200/黑字；hover/open 才进入 B-100/B-500 ---------- */
.r360-head { display: flex; align-items: center; margin-top: 8px; }
.r360-head__filter-wrap { position: relative; }
.r360-head__filter-wrap + .r360-head__filter-wrap { margin-left: 8px; }
.r360-head__filter {
  display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 4px 8px;
  box-sizing: border-box; border: 0; border-radius: 6px; background: #eff0f1;
  font-family: inherit; font-size: 14px; line-height: 22px; color: #1f2329; cursor: pointer;
  transition: background-color .2s ease-in-out, color .2s ease-in-out;
}
.r360-head__filter:hover, .r360-head__filter.is-open { background: #e8f1ff; color: #3370ff; }
.r360-head__filter svg { display: block; color: currentColor; }
.r360-head__menu { position: absolute; top: 38px; left: 4px; z-index: 30; width: 82px; padding: 0; border-radius: 6px; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.12); }
.r360-head__option { display: flex; align-items: center; justify-content: space-between; width: 82px; height: 30px; padding: 4px 8px; box-sizing: border-box; border: 0; border-radius: 4px; background: transparent; color: #1f2329; font: inherit; line-height: 22px; cursor: pointer; }
.r360-head__option:hover { background: rgba(31,35,41,.08); }
.r360-head__option svg { color: #3370ff; }

/* ---------- 工具行：y≈368 ---------- */
.r360-tools { display: flex; align-items: center; margin-top: 16px; }
.r360-tools__spacer { flex: 1; }
.r360-tools__btn {
  display: inline-flex; align-items: center; box-sizing: border-box;
  border: 0; border-radius: 6px; background: transparent; padding: 2px 4px;
  font-family: inherit; font-size: 14px; line-height: 22px; color: #1f2329; cursor: pointer;
  transition: background-color .1s ease-in;
}
.r360-tools__btn:hover { background: rgba(31, 35, 41, 0.1); }
.r360-tools__btn + .r360-tools__btn { margin-left: 8px; }
.r360-icon { display: block; flex: none; }
.r360-icon svg { display: block; }
.r360-tools__btn--view .r360-icon:first-child { margin: 0 4px 0 0; }
.r360-tools__btn--view .r360-icon--end { margin: 0 0 0 4px; }
.r360-tools__btn--view .r360-icon--end svg { color: #646a73; }
.r360-tools__btn--sort .r360-icon { margin: 0 4px 0 0; }
.r360-view-dropdown { position: relative; }
.r360-tools__btn--view { height: 26px; }
.r360-tools__view-text { display: block; }
.r360-view-menu {
  position: absolute; top: 32px; left: 0; z-index: 30; min-width: 124px;
  box-sizing: border-box; padding: 4px; border-radius: 6px; background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.r360-view-menu__item { display: flex; align-items: center; gap: 8px; position: relative; width: 100%; padding: 4px 8px; box-sizing: border-box; border: 0; border-radius: 4px; background: transparent; text-align: left; font-family: inherit; font-size: 14px; line-height: 22px; color: #1f2329; cursor: pointer; }
.r360-view-menu__item:hover { background: rgba(31, 35, 41, 0.06); }
.r360-view-menu__item.is-active { color: #3370ff; background: #e8f1ff; }
.r360-view-menu__item > svg:first-child { flex: none; color: currentColor; }
.r360-view-menu__check { margin-left: auto; flex: none; color: #3370ff; }
.r360-tools__btn--sort { height: 26px; }
.r360-tools__btn--collapse { height: 28px; }
.r360-collapse-icon { display: block; color: #1f2329; }

/* ---------- 卡片视图：591.3×66.2 ---------- */
.r360-card { display: flex; align-items: flex-start; margin-top: 16px; }
.r360-card__toggle {
  display: flex; align-items: center; justify-content: center; flex: none;
  width: 20px; height: 20px; margin-top: 14px; padding: 4px; box-sizing: border-box; border: 0;
  border-radius: 6px; background: transparent; color: #646a73; cursor: pointer;
}
.r360-card__toggle svg { display: block; width: 12px; height: 12px; }
.r360-avatar {
  display: inline-flex; flex: none; width: 20px; height: 20px;
  overflow: hidden; border-radius: 50%; object-fit: cover; background: #dbe4f5;
  color: #3370ff; vertical-align: top;
}
.r360-avatar--fallback { align-items: center; justify-content: center; }
.r360-card__body { flex: 1; min-width: 0; padding: 12px 0 4px 8px; cursor: pointer; outline: none; }
.r360-card__body:focus-visible { border-radius: 6px; box-shadow: 0 0 0 2px rgba(51,112,255,.3); }
.r360-card__first { display: flex; align-items: center; min-height: 22px; }
.r360-card__desc { margin-top: 4px; font-size: 12px; line-height: 20px; color: #646a73; }

/* ---------- 表格视图：REA x=361 w=591；表头46、人员行57、展开列0 ---------- */
.r360-table-wrap { margin-top: 16px; }
.r360-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.r360-table__expand-col { width: 0; }
.r360-table__expand-cell { position: relative; width: 0; padding: 0; border: 0; text-align: left; vertical-align: middle; }
.r360-table__head-cell {
  height: 46px; padding: 12px; box-sizing: border-box; background: #f5f6f7;
  border: 0; font-weight: 500; font-size: 14px; line-height: 22px; color: #646a73; text-align: left;
}
.r360-table__row { height: 57px; cursor: default; outline: none; }
.r360-table__row td { height: 57px; border: 0; background: transparent; transition: background-color .1s ease-in; }
.r360-table__row:hover td { background: #eff0f1; }
.r360-table__row:focus-visible td { background: #eff0f1; }
.r360-table__cell { height: 57px; padding: 8px 12px; box-sizing: border-box; text-align: left; vertical-align: middle; }
.r360-table__expand-btn {
  position: absolute; z-index: 2; left: 2px; top: 18px; display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 4px; box-sizing: border-box; border: 0; border-radius: 6px;
  background: transparent; color: #646a73; cursor: pointer;
}
.r360-table__expand-btn svg { display: block; width: 12px; height: 12px; }
.r360-table__person { display: flex; align-items: center; min-width: 0; height: 40px; margin-left: 12px; overflow: hidden; }
.r360-table__avatar {
  display: block; flex: none; width: 26px; height: 26px; overflow: hidden;
  border-radius: 50%; object-fit: cover; background: #dee0e3; color: #646a73; cursor: pointer;
}
.r360-table__avatar--fallback { display: inline-flex; align-items: center; justify-content: center; }
.r360-table__info { width: calc(100% - 32px); min-width: 0; margin-left: 12px; }
.r360-table__name { max-width: 300px; font-size: 12px; line-height: 20px; font-weight: 500; color: #1f2329; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r360-table__sub { font-size: 12px; line-height: 20px; color: #646a73; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r360-table__expanded-row { height: 0; }
.r360-table__expanded-row > td { height: 0; padding: 0; border: 0; background: transparent; }
.r360-table__expanded-row.is-expanded > td { height: auto; }
.r360-table__details { padding: 0 24px; box-sizing: border-box; border-radius: 6px; background: #f5f6f7; }

/* ---------- 表单区：REA 591.3px 灰底，root/item 仍走统一 readonly 内容链 ---------- */
.r360-form { margin-top: 16px; padding: 0 24px; box-sizing: border-box; border-radius: 6px; background: #f5f6f7; }
.r360-form__item { padding: 16px 12px; border-bottom: .666667px dashed rgba(31, 35, 41, .15); box-sizing: border-box; border-radius: 4px 4px 0 0; background: #f5f6f7; }
.r360-form__item:last-child { padding-bottom: 12px; border-bottom: 0; border-radius: 4px; }
.r360-form__review { box-sizing: border-box; border-radius: 4px; background: #f5f6f7; }
.r360-form__root { margin-bottom: 16px; }
.r360-form__root-title { color: #1f2329; font-size: 14px; font-weight: 600; line-height: 24px; overflow-wrap: anywhere; }
.r360-form__root-description { margin-top: 2px; color: #646a73; font-size: 14px; line-height: 22px; white-space: pre-wrap; overflow-wrap: anywhere; }
.r360-form :deep(.performance-template-renderer--readonly) { padding: 0; background: transparent; }
.r360-form :deep(.performance-template-section) { margin-bottom: 0; }
.r360-form :deep(.performance-template-field) { margin-bottom: 16px; }
.r360-form :deep(.performance-template-field:last-child) { margin-bottom: 0; }
.r360-form :deep(.performance-item-title) { font-family: inherit; }
.r360-form :deep(.template-field-label em) { display: none; }
.r360-table__details :deep(.rich-answer) { padding: 0; min-height: 22px; line-height: 22px; }
.r360-table__details :deep(.performance-template-section) { margin-bottom: 0; }
.r360-table__details :deep(.performance-item-title) { font-family: inherit; }
.r360-table__details :deep(.rich-answer), .r360-table__details :deep(.readonly-tag-panel) { background: #f5f6f7; }
.r360-form :deep(.rich-answer),
.r360-form :deep(.readonly-tag-panel) { background: #f5f6f7; }
</style>
