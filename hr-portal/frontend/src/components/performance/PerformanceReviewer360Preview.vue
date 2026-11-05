<template>
  <div class="r360-preview" aria-label="360°评估详情">
    <!-- ud__card 白卡容器（REA：x=340.7 宽 631.3 白底 shadow-md，内容内缩 20） -->
    <div class="r360-card-wrap">
      <!-- 信息条：已评估 ：1/1 直属上级 1（REA 有冒号） -->
      <div class="r360-info">
        <span class="r360-info__label">已评估</span>
        <span class="r360-info__colon">：</span>
        <span class="r360-info__num">{{ evaluatedText }}</span>
        <span class="r360-info__relation">{{ relationLabel }}</span>
        <span class="r360-info__num">{{ evaluatedCount }}</span>
      </div>

      <!-- 表头：评估维度 / 员工关系 / 人员类型（REA 固定 3 列） -->
      <div class="r360-head">
        <span class="r360-head__col">评估维度</span>
        <span class="r360-head__col">员工关系</span>
        <span class="r360-head__col">人员类型</span>
      </div>

      <!-- 工具行：详情视图按钮（双图标）+ 排序 + 收起详情（100% REA ud__button--text 结构） -->
      <div class="r360-tools">
        <button type="button" class="r360-tools__btn r360-tools__btn--view" tabindex="-1">
          <span class="r360-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm2 0v16h16V4H4Z" fill="currentColor"/><path d="M12.5 7a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 8a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm6.5 3a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 12a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm6.5 3a1 1 0 1 0 0 2H17a1 1 0 1 0 0-2h-4.5ZM6 16a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Z" fill="currentColor"/></svg></span>
          <span class="r360-tools__view-text">详情视图</span>
          <span class="r360-icon r360-icon--end"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor"/></svg></span>
        </button>
        <span class="r360-tools__spacer"></span>
        <button type="button" class="r360-tools__btn r360-tools__btn--sort" tabindex="-1">
          <span class="r360-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 1.333h-1.803s-.419.137-.498.343l-3.664 9.598a.533.533 0 0 0 .498.724h.978a.533.533 0 0 0 .5-.347l.664-1.785h4.841l.663 1.786c.078.21.277.348.5.348h.987a.533.533 0 0 0 .498-.724l-3.666-9.6A.533.533 0 0 0 17 1.333Zm.725 6.4h-3.264l1.605-4.316h.05l1.61 4.316Zm-6.175 6.4c0-.294.238-.533.533-.533h8.522c.295 0 .534.239.534.534v.703c0 .154-.067.3-.183.402l-6.068 5.298h5.717c.295 0 .534.24.534.534v1.063a.533.533 0 0 1-.534.533h-8.522a.533.533 0 0 1-.534-.534v-.973c0-.154.067-.3.183-.402l5.763-5.027h-5.412a.533.533 0 0 1-.534-.534v-1.063Zm-8.923 2.534h2.705V3.2c0-.294.238-.533.533-.533h.933c.295 0 .534.239.534.533v19.16a.533.533 0 0 1-.965.314l-4-5.499a.32.32 0 0 1 .26-.508Z" fill="currentColor"/></svg></span>
          排序
        </button>
        <button type="button" class="r360-tools__btn r360-tools__btn--collapse" tabindex="-1">
          <svg class="r360-collapse-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M17.468 5a.25.25 0 0 1 .25.25v2.419h1.572a.2.2 0 0 1 .08.017l.036.02a.2.2 0 0 1 .076.222l-.028.057-2.307 3.265a.2.2 0 0 1-.282.045l-.044-.045-2.307-3.265a.2.2 0 0 1 .11-.308l.053-.007 1.572-.001V5.25a.25.25 0 0 1 .25-.25h.969Zm0 13.5a.25.25 0 0 0 .25-.25v-2.419h1.572a.2.2 0 0 0 .08-.017l.036-.02a.2.2 0 0 0 .076-.222l-.028-.057-2.307-3.265a.2.2 0 0 0-.282-.045l-.044.045-2.307 3.265a.2.2 0 0 0 .11.308l.053.007 1.572.001v2.419c0 .138.112.25.25.25h.969Zm-4.53-2.073c.18 0 .332.128.367.299l.007.076v.679a.375.375 0 0 1-.3.367l-.075.008H4.875a.375.375 0 0 1-.367-.3l-.008-.075v-.68c0-.18.129-.332.3-.367l.075-.007h8.062Zm0-5.479c.18 0 .332.129.367.3l.007.075v.68a.375.375 0 0 1-.3.367l-.075.007H4.875a.375.375 0 0 1-.367-.299l-.008-.076v-.679c0-.181.129-.332.3-.367l.075-.008h8.062Zm0-5.478c.18 0 .332.128.367.3l.007.075v.68a.375.375 0 0 1-.3.366l-.075.008H4.875a.375.375 0 0 1-.367-.3L4.5 6.525v-.68c0-.18.129-.331.3-.366l.075-.008h8.062z" fill="currentColor"/></svg>
          收起详情
        </button>
      </div>

      <!-- 卡片：展开图标 + 标题行 + 列描述（REA：直属上级 | 所属部门 | 系统默认邀请） -->
      <div class="r360-card">
        <button type="button" class="r360-card__toggle" tabindex="-1" aria-label="展开">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor"/></svg>
        </button>
        <div class="r360-card__body">
          <div class="r360-card__title">{{ relationLabel }}</div>
          <div class="r360-card__desc">{{ departmentLabel }} | 所属部门 | 系统默认邀请</div>
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
  </div>
</template>

<script setup lang="ts">
/**
 * 参考区「360°反馈」页签预览（REA 实测：360°评估详情视图，DOM 二次精准核对）。
 *
 * REA（rea-extract/out/domspec1x/参考区-360反馈-直接上级评估.json + 实时按钮 DOM）：
 *   外层 ud__card 白卡（x=340.7 宽 631.3 bg #fff shadow-md），内容内缩 20（x=360.7）
 *   信息条：「已评估 ：1/1 直属上级 1」，14/24，#646a73，数字 #3370ff（有冒号）
 *   表头：评估维度/员工关系/人员类型 固定 3 列（14/22 #1f2329）
 *   工具行（100% REA ud__button--text，buttons-full.json 实测）：
 *     详情视图按钮 98×26 pd2/4 inline-flex：span(SheetBitableOutlined 14×14, m 0 4 0 0) + span(文字 56×22) + span(DownBoldOutlined 12×12, m 0 0 0 4)
 *     排序按钮 54×26 pd2/4 flex：span(SorAToZOutlined 14×14, m 0 4 0 0) + 文字
 *     收起详情按钮 88×28 pd2/4 flex：svg 直接子级 24×24（text-N-800 #1f2329，归位图标）
 *     全部 hover rgba(31,35,41,.1)、r6
 *   卡片：展开按钮 ud__button--icon 20×20 pd4 r6 #646a73（ExpandDownFilled 12×12）
 *       + 标题 + 描述「直属上级 | 所属部门 | 系统默认邀请」（竖线分隔 12/20 #646a73）
 *   表单区：591.3×244.7 bg #f5f6f7 r6 px-6；评估条目 567.3×120 bg #f5f6f7 r4
 */
withDefaults(defineProps<{
  /** 信息条「已评估 N / M」的评估人关系文案（默认「直属上级」） */
  relationLabel?: string
  /** 已评估数（信息条右侧数字） */
  evaluatedCount?: number
  /** 已评估文本「N / M」（默认「1 / 1」） */
  evaluatedText?: string
  /** 卡片描述部门文案（REA：直属上级 | 所属部门 | 系统默认邀请） */
  departmentLabel?: string
  /** 表单区评估条目数（REA 模板预览默认 2 个空条目） */
  entryCount?: number
}>(), {
  relationLabel: '直属上级',
  evaluatedCount: 1,
  evaluatedText: '1 / 1',
  departmentLabel: '直属上级',
  entryCount: 2,
})
</script>

<style scoped>
/* 与模板预览字体栈一致（REA 正文 14/21 #1f2329） */
.r360-preview { color: #1f2329; font-family: inherit; font-size: 14px; line-height: 21px; }

/* ---------- ud__card 白卡容器（REA：x=340.7 宽 631.3 白底 shadow-md r4，内容内缩 20） ---------- */
.r360-card-wrap {
  box-sizing: border-box;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 20px;
}

/* ---------- 信息条：y≈297，14/24，有冒号 ---------- */
.r360-info { display: flex; align-items: center; min-height: 24px; line-height: 24px; }
.r360-info__label { color: #646a73; }
.r360-info__colon { margin-left: 4px; color: #646a73; }
.r360-info__num { margin-left: 4px; color: #3370ff; }
.r360-info__relation { margin-left: 4px; color: #646a73; }

/* ---------- 表头：y≈336，14/22，固定 3 列（REA：368.7/466.7/564.7，间距 98） ---------- */
.r360-head { display: flex; margin-top: 16px; }
.r360-head__col { flex: 1; min-width: 0; line-height: 22px; color: #1f2329; }

/* ---------- 工具行：y≈368 ---------- */
.r360-tools { display: flex; align-items: center; margin-top: 16px; }
.r360-tools__spacer { flex: 1; }
/* REA ud__button--text：pd 2px 4px、r6、hover rgba(31,35,41,.1) */
.r360-tools__btn {
  display: inline-flex; align-items: center; box-sizing: border-box;
  border: 0; border-radius: 6px; background: transparent; padding: 2px 4px;
  font-family: inherit; font-size: 14px; line-height: 22px; color: #1f2329; cursor: pointer;
  transition: background-color .1s ease-in;
}
.r360-tools__btn:hover { background: rgba(31, 35, 41, 0.1); }
.r360-tools__btn + .r360-tools__btn { margin-left: 8px; }
/* 图标 span（REA ud__button__icon-inline：block、start margin 0 4px 0 0、end margin 0 0 0 4px） */
.r360-icon { display: block; flex: none; }
.r360-tools__btn--view .r360-icon:first-child { margin: 0 4px 0 0; }
.r360-tools__btn--view .r360-icon--end { margin: 0 0 0 4px; }
.r360-tools__btn--view .r360-icon--end svg { display: block; color: #646a73; }
.r360-tools__btn--sort .r360-icon { margin: 0 4px 0 0; }
.r360-tools__btn--sort .r360-icon svg { display: block; }
/* 详情视图按钮（REA 98×26） */
.r360-tools__btn--view { height: 26px; }
.r360-tools__view-text { display: block; }
/* 排序按钮（REA 54×26） */
.r360-tools__btn--sort { height: 26px; }
/* 收起详情按钮（REA 88×28，svg 直接子级 24×24 text-N-800） */
.r360-tools__btn--collapse { height: 28px; }
.r360-collapse-icon { display: block; color: #1f2329; }

/* ---------- 卡片：591.3×66.2 ---------- */
.r360-card { display: flex; align-items: flex-start; margin-top: 16px; }
.r360-card__toggle {
  display: flex; align-items: center; justify-content: center; flex: none;
  width: 20px; height: 20px; padding: 4px; box-sizing: border-box; border: 0;
  border-radius: 6px; background: transparent; color: #646a73; cursor: pointer;
}
.r360-card__toggle svg { display: block; width: 12px; height: 12px; }
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
