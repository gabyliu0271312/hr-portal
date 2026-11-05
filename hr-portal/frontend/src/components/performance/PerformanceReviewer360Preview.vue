<template>
  <div class="r360-preview" aria-label="360°评估详情">
    <!-- ud__card 白卡容器（REA：x=341 宽 631、bg #fff、radius 8、pd 16/20、无 border 无 shadow） -->
    <div class="r360-card-wrap">
      <!-- 信息条：已评估 ：1/1 直属上级 1（REA 有冒号） -->
      <div class="r360-info">
        <span class="r360-info__label">已评估</span>
        <span class="r360-info__colon">：</span>
        <span class="r360-info__num">{{ evaluatedText }}</span>
        <span class="r360-info__relation">{{ relationLabel }}</span>
        <span class="r360-info__num">{{ evaluatedCount }}</span>
      </div>

      <!-- 表头：评估维度 / 员工关系 / 人员类型（REA ud__select 下拉触发器） -->
      <div class="r360-head">
        <button type="button" class="r360-head__filter" tabindex="-1">
          <span class="r360-head__filter-text">评估维度</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor"/></svg>
        </button>
        <button type="button" class="r360-head__filter" tabindex="-1">
          <span class="r360-head__filter-text">员工关系</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor"/></svg>
        </button>
        <button type="button" class="r360-head__filter" tabindex="-1">
          <span class="r360-head__filter-text">人员类型</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor"/></svg>
        </button>
      </div>

      <!-- 工具行：详情视图下拉 + 排序 + 收起详情（REA ud__button--text） -->
      <div class="r360-tools">
        <div class="r360-view-dropdown">
          <button type="button" class="r360-tools__btn r360-tools__btn--view" tabindex="-1" @click="viewMenuOpen = !viewMenuOpen">
            <span class="r360-icon">
              <svg v-if="viewMode === 'card'" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm2 0v16h16V4H4Z" fill="currentColor"/><path d="M12.5 7a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 8a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm6.5 3a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 12a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm6.5 3a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 16a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Z" fill="currentColor"/></svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm7.5 0v4H20V4H9.5Zm0 6v4H20v-4H9.5Zm-2 4V6H4v8h3.5ZM4 18h7v-4H4v4Zm9 0h7v-4h-7v4Z" fill="currentColor"/></svg>
            </span>
            <span class="r360-tools__view-text">{{ viewMode === 'card' ? '详情视图' : '表格视图' }}</span>
            <span class="r360-icon r360-icon--end"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor"/></svg></span>
          </button>
          <div v-if="viewMenuOpen" class="r360-view-menu">
            <button type="button" class="r360-view-menu__item" :class="{ 'is-active': viewMode === 'card' }" @click="switchView('card')">详情视图</button>
            <button type="button" class="r360-view-menu__item" :class="{ 'is-active': viewMode === 'table' }" @click="switchView('table')">表格视图</button>
          </div>
        </div>
        <span class="r360-tools__spacer"></span>
        <button type="button" class="r360-tools__btn r360-tools__btn--sort" tabindex="-1">
          <span class="r360-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 1.333h-1.803s-.419.137-.498.343l-3.664 9.598a.533.533 0 0 0 .498.724h.978a.533.533 0 0 0 .5-.347l.664-1.785h4.841l.663 1.786c.078.21.277.348.5.348h.987a.533.533 0 0 0 .498-.724l-3.666-9.6A.533.533 0 0 0 17 1.333Zm.725 6.4h-3.264l1.605-4.316h.05l1.61 4.316Zm-6.175 6.4c0-.294.238-.533.533-.533h8.522c.295 0 .534.239.534.534v.703c0 .154-.067.3-.183.402l-6.068 5.298h5.717c.295 0 .534.24.534.534v1.063a.533.533 0 0 1-.534.533h-8.522a.533.533 0 0 1-.534-.534v-.973c0-.154.067-.3.183-.402l5.763-5.027h-5.412a.533.533 0 0 1-.534-.534v-1.063Zm-8.923 2.534h2.705V3.2c0-.294.238-.533.533-.533h.933c.295 0 .534.239.534.533v19.16a.533.533 0 0 1-.965.314l-4-5.499a.32.32 0 0 1 .26-.508Z" fill="currentColor"/></svg></span>
          排序
        </button>
        <button type="button" class="r360-tools__btn r360-tools__btn--collapse" tabindex="-1" @click="expanded = !expanded">
          <svg v-if="expanded" class="r360-collapse-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M17.468 5a.25.25 0 0 1 .25.25v2.419h1.572a.2.2 0 0 1 .08.017l.036.02a.2.2 0 0 1 .076.222l-.028.057-2.307 3.265a.2.2 0 0 1-.282.045l-.044-.045-2.307-3.265a.2.2 0 0 1 .11-.308l.053-.007 1.572-.001V5.25a.25.25 0 0 1 .25-.25h.969Zm0 13.5a.25.25 0 0 0 .25-.25v-2.419h1.572a.2.2 0 0 0 .08-.017l.036-.02a.2.2 0 0 0 .076-.222l-.028-.057-2.307-3.265a.2.2 0 0 0-.282-.045l-.044.045-2.307 3.265a.2.2 0 0 0 .11.308l.053.007 1.572.001v2.419c0 .138.112.25.25.25h.969Zm-4.53-2.073c.18 0 .332.128.367.299l.007.076v.679a.375.375 0 0 1-.3.367l-.075.008H4.875a.375.375 0 0 1-.367-.3l-.008-.075v-.68c0-.18.129-.332.3-.367l.075-.007h8.062Zm0-5.479c.18 0 .332.129.367.3l.007.075v.68a.375.375 0 0 1-.3.367l-.075.007H4.875a.375.375 0 0 1-.367-.299l-.008-.076v-.679c0-.181.129-.332.3-.367l.075-.008h8.062Zm0-5.478c.18 0 .332.128.367.3l.007.075v.68a.375.375 0 0 1-.3.366l-.075.008H4.875a.375.375 0 0 1-.367-.3L4.5 6.525v-.68c0-.18.129-.331.3-.366l.075-.008h8.062z" fill="currentColor"/></svg>
          <svg v-else class="r360-collapse-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M17.468 11a.25.25 0 0 0 .25-.25V8.331h1.572a.2.2 0 0 0 .08-.017l.036-.02a.2.2 0 0 0 .076-.222l-.028-.057-2.307-3.265a.2.2 0 0 0-.282-.045l-.044.045-2.307 3.265a.2.2 0 0 0 .11.308l.053.007 1.572.001v2.419c0 .138.112.25.25.25h.969Zm0-13.5a.25.25 0 0 1 .25.25v2.419h1.572a.2.2 0 0 1 .08.017l.036.02a.2.2 0 0 1 .076.222l-.028.057-2.307 3.265a.2.2 0 0 1-.282.045l-.044-.045-2.307-3.265a.2.2 0 0 1 .11-.308l.053-.007 1.572-.001V5.25a.25.25 0 0 1 .25-.25h.969Zm-4.53 2.073c.18 0 .332-.128.367-.299l.007-.076v-.679a.375.375 0 0 0-.3-.367l-.075-.008H4.875a.375.375 0 0 0-.367.3l-.008.075v.68c0 .18.129.332.3.367l.075.007h8.062Zm0 5.479c.18 0 .332-.129.367-.3l.007-.075v-.68a.375.375 0 0 0-.3-.367l-.075-.007H4.875a.375.375 0 0 0-.367.299l-.008.076v.679c0 .181.129.332.3.367l.075.008h8.062Zm0 5.478c.18 0 .332-.128.367-.3l.007-.075v-.68a.375.375 0 0 0-.3-.366l-.075-.008H4.875a.375.375 0 0 0-.367.3L4.5 6.525v.68c0 .18.129.331.3.366l.075.008h8.062z" fill="currentColor"/></svg>
          {{ expanded ? '收起详情' : '展开详情' }}
        </button>
      </div>

      <!-- 卡片视图：展开图标 + 头像 + 标题行 + 列描述（REA：头像 20×20 + 直属上级 | 所属部门 | 系统默认邀请） -->
      <!-- 卡片视图：展开图标 + 头像 + 标题行 + 列描述（REA：头像 20×20 + 直属上级 | 所属部门 | 系统默认邀请） -->
      <div v-show="viewMode === 'card'" class="r360-card">
        <button type="button" class="r360-card__toggle" tabindex="-1" aria-label="展开">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor"/></svg>
        </button>
        <!-- REA ud__avatar 20×20（卡片描述左侧，MemberFilled 占位/头像图） -->
        <img v-if="avatarUrl" class="r360-avatar" :src="avatarUrl" alt="">
        <span v-else class="r360-avatar r360-avatar--fallback" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15 13H9c-2.761 0-6 1.931-6 5.4V20c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-1.6c0-3.471-3.239-5.4-6-5.4ZM7 7a5 5 0 1 0 10 0A5 5 0 0 0 7 7Z" fill="currentColor"/></svg></span>
        <div class="r360-card__body">
          <div class="r360-card__title">{{ relationLabel }}</div>
          <div class="r360-card__desc">{{ departmentLabel }} | 所属部门 | 系统默认邀请</div>
        </div>
      </div>

      <!-- 表格视图：ud__table（REA：姓名表头 py-6 bg-N-100 + 评估人 26×26 头像 + 展开按钮） -->
      <div v-show="viewMode === 'table'" class="r360-table-wrap">
        <table class="r360-table" style="table-layout: fixed;">
          <colgroup>
            <col class="r360-table__expand-col">
            <col style="width: 302px; min-width: 302px;">
          </colgroup>
          <thead>
            <tr>
              <th class="r360-table__expand-cell"></th>
              <th class="r360-table__head-cell">姓名</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in tableRows" :key="index" class="r360-table__row">
              <td class="r360-table__expand-cell">
                <button type="button" class="r360-table__expand-btn" tabindex="-1" aria-label="展开">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.627 11.22a1 1 0 0 1 0 1.56L8.291 21.084a1 1 0 0 1-1.626-.78V3.696a1 1 0 0 1 1.626-.78l10.335 8.305Z" fill="currentColor"/></svg>
                </button>
              </td>
              <td class="r360-table__cell">
                <div class="r360-table__person">
                  <img v-if="row.avatarUrl" class="r360-table__avatar" :src="row.avatarUrl" alt="">
                  <span v-else class="r360-table__avatar r360-table__avatar--fallback" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 13H9c-2.761 0-6 1.931-6 5.4V20c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-1.6c0-3.471-3.239-5.4-6-5.4ZM7 7a5 5 0 1 0 10 0A5 5 0 0 0 7 7Z" fill="currentColor"/></svg></span>
                  <div class="r360-table__info">
                    <div class="r360-table__name">{{ row.name }}</div>
                    <div class="r360-table__sub">{{ row.sub }}</div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 表单区：灰底，内嵌空评估条目（REA：默认展开，收起点击「展开详情」后显示） -->
      <div v-show="expanded && viewMode === 'card'" class="r360-form">
        <div v-for="index in entryCount" :key="index" class="r360-form__item">
          <div class="r360-form__review">
            <div class="r360-form__empty">这里展示用户填写的内容</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 参考区「360°反馈」页签预览（REA 实测：360°评估详情视图 + 表格视图切换 + 收起/展开交互）。
 */
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  relationLabel?: string
  evaluatedCount?: number
  evaluatedText?: string
  departmentLabel?: string
  avatarUrl?: string
  tableRows?: Array<{ name: string; sub: string; avatarUrl?: string }>
  entryCount?: number
}>(), {
  relationLabel: '直属上级',
  evaluatedCount: 1,
  evaluatedText: '1 / 1',
  departmentLabel: '直属上级',
  avatarUrl: '',
  tableRows: () => [{ name: '评估人', sub: '直属上级  |  所属部门  |  系统默认邀请' }],
  entryCount: 2,
})

/** REA 默认展开态（按钮「收起详情」） */
const expanded = ref(true)
/** 视图模式：card（详情视图）/ table（表格视图），REA 默认详情视图 */
const viewMode = ref<'card' | 'table'>('card')
const viewMenuOpen = ref(false)
function switchView(mode: 'card' | 'table') {
  viewMode.value = mode
  viewMenuOpen.value = false
}
void props
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

/* ---------- 信息条：y≈297，14/24，有冒号 ---------- */
.r360-info { display: flex; align-items: center; min-height: 24px; line-height: 24px; }
.r360-info__label { color: #646a73; }
.r360-info__colon { margin-left: 4px; color: #646a73; }
.r360-info__num { margin-left: 4px; color: #3370ff; }
.r360-info__relation { margin-left: 4px; color: #646a73; }

/* ---------- 表头：REA ud__select 触发器（90×30 px-4 py-2 r6 text-B-500 bg-B-100） ---------- */
.r360-head { display: flex; align-items: center; margin-top: 8px; }
.r360-head__filter {
  display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 4px 8px;
  box-sizing: border-box; border: 0; border-radius: 6px; background: #e8f1ff;
  font-family: inherit; font-size: 14px; line-height: 22px; color: #3370ff; cursor: pointer;
}
.r360-head__filter + .r360-head__filter { margin-left: 8px; }
.r360-head__filter svg { display: block; color: #3370ff; }

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
.r360-view-menu__item {
  display: block; width: 100%; padding: 6px 12px; box-sizing: border-box; border: 0;
  border-radius: 4px; background: transparent; text-align: left;
  font-family: inherit; font-size: 14px; line-height: 22px; color: #1f2329; cursor: pointer;
}
.r360-view-menu__item:hover { background: rgba(31, 35, 41, 0.06); }
.r360-view-menu__item.is-active { color: #3370ff; background: #e8f1ff; }
.r360-tools__btn--sort { height: 26px; }
.r360-tools__btn--collapse { height: 28px; }
.r360-collapse-icon { display: block; color: #1f2329; }

/* ---------- 卡片视图：591.3×66.2 ---------- */
.r360-card { display: flex; align-items: flex-start; margin-top: 16px; }
.r360-card__toggle {
  display: flex; align-items: center; justify-content: center; flex: none;
  width: 20px; height: 20px; padding: 4px; box-sizing: border-box; border: 0;
  border-radius: 6px; background: transparent; color: #646a73; cursor: pointer;
}
.r360-card__toggle svg { display: block; width: 12px; height: 12px; }
.r360-avatar {
  display: block; flex: none; width: 20px; height: 20px; margin-right: 8px;
  overflow: hidden; border-radius: 50%; object-fit: cover; background: #dbe4f5;
  color: #3370ff;
}
.r360-avatar--fallback { display: inline-flex; align-items: center; justify-content: center; }
.r360-card__body { flex: 1; min-width: 0; }
.r360-card__title { font-size: 14px; line-height: 22px; color: #1f2329; }
.r360-card__desc { margin-top: 4px; font-size: 12px; line-height: 20px; color: #646a73; }

/* ---------- 表格视图：ud__table（REA x=361 w=591） ---------- */
.r360-table-wrap { margin-top: 16px; }
.r360-table { width: 100%; border-collapse: collapse; }
.r360-table__expand-col { width: 44px; }
.r360-table__expand-cell { width: 44px; padding: 0; border: 0; text-align: left; vertical-align: middle; }
.r360-table__head-cell {
  padding: 6px 8px; box-sizing: border-box; background: #f5f6f7;
  border: 0; font-weight: 500; font-size: 14px; line-height: 22px; color: #646a73; text-align: left;
}
.r360-table__row td { border: 0; }
.r360-table__cell { padding: 8px; box-sizing: border-box; text-align: left; vertical-align: middle; }
.r360-table__expand-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
  padding: 4px; box-sizing: border-box; border: 0; border-radius: 6px; background: transparent; color: #646a73; cursor: pointer;
}
.r360-table__expand-btn svg { display: block; width: 12px; height: 12px; }
.r360-table__person { display: flex; align-items: center; min-width: 0; }
.r360-table__avatar {
  display: block; flex: none; width: 26px; height: 26px; overflow: hidden;
  border-radius: 50%; object-fit: cover; background: #dbe4f5; color: #3370ff;
}
.r360-table__avatar--fallback { display: inline-flex; align-items: center; justify-content: center; }
.r360-table__info { min-width: 0; margin-left: 12px; }
.r360-table__name { font-size: 12px; line-height: 20px; font-weight: 500; color: #1f2329; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r360-table__sub { font-size: 12px; line-height: 20px; color: #646a73; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---------- 表单区：591.3×244.7 bg #f5f6f7 r6 px-6 ---------- */
.r360-form { margin-top: 16px; padding: 0 24px; box-sizing: border-box; border-radius: 6px; background: #f5f6f7; }
.r360-form__item { padding: 8px 0 12px; }
.r360-form__item + .r360-form__item { border-top: 1px solid #dee0e3; }
.r360-form__review { padding: 16px 20px; box-sizing: border-box; border-radius: 4px; background: #f5f6f7; }
.r360-form__empty { font-size: 14px; line-height: 22px; color: #1f2329; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
