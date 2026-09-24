<template>
  <div class="performance-review-person-header">
    <div class="performance-review-person-header__identity">
      <img v-if="person.avatar_url" class="performance-review-person-header__avatar" :src="person.avatar_url" :alt="person.display_name || person.employee_no">
      <span v-else class="performance-review-person-header__avatar performance-review-person-header__avatar--fallback" aria-hidden="true">{{ initial }}</span>
      <div class="performance-review-person-header__info">
        <strong>{{ person.display_name || person.employee_no }}</strong>
        <span class="performance-review-person-header__profile-line">
          <template v-for="(part, index) in profileParts" :key="`${part}-${index}`">
            <span class="performance-review-person-header__profile-value">{{ part }}</span>
            <i v-if="index < profileParts.length - 1" class="performance-review-person-header__profile-separator" aria-hidden="true"></i>
          </template>
        </span>
      </div>
    </div>
    <div class="performance-review-person-header__actions" aria-label="人员详情工具">
      <div class="performance-review-person-header__translate">
        <button type="button" class="performance-review-person-header__action performance-review-person-header__translate-main" aria-label="翻译成简体中文" @click="emit('translate')">
          <span aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="TranslateOutlined"><path d="M18.656 9.5h1.47a8.504 8.504 0 0 0-16.252 0H1.799c1.122-4.592 5.264-8 10.201-8 4.938 0 9.079 3.408 10.2 8h1.644a.16.16 0 0 1 .156.162.166.166 0 0 1-.046.115l-2.539 2.652a.226.226 0 0 1-.33 0l-2.54-2.652a.167.167 0 0 1 0-.23.152.152 0 0 1 .11-.047Zm-13.312 5h-1.47a8.504 8.504 0 0 0 16.252 0h2.075c-1.122 4.592-5.264 8-10.201 8s-9.079-3.408-10.2-8H.155a.152.152 0 0 1-.11-.048.168.168 0 0 1 0-.23l2.539-2.65a.226.226 0 0 1 .33 0l2.54 2.65a.169.169 0 0 1 .045.116.16.16 0 0 1-.156.162Z" fill="currentColor"/><path d="M13.015 7.5H11.01l-3.51 9h2.016l1.025-2.484H13.4l1.116 2.484H16.5l-3.485-9ZM12.93 12h-1.873l.958-2.52.915 2.52Z" fill="currentColor"/></svg></span>
          翻译成简体中文
        </button>
        <button type="button" class="performance-review-person-header__action performance-review-person-header__translate-menu" aria-label="选择翻译语言" @click="emit('translate-menu')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="DownOutlined"><path d="M2.293 7.707a1 1 0 0 1 1.414 0L12 16l8.293-8.293a1 1 0 1 1 1.414 1.414l-8.293 8.293a2 2 0 0 1-2.828 0L2.293 9.121a1 1 0 0 1 0-1.414Z" fill="currentColor"/></svg></button>
      </div>
      <button type="button" class="performance-review-person-header__action" aria-label="复制链接" @click="emit('copy-link')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="GlobalLinkOutlined"><path d="M18.849 2.699a5.037 5.037 0 0 0-7.1.97L8.97 7.372a4.784 4.784 0 0 0 .957 6.699l.972.729a1 1 0 0 0 1.2-1.6l-.972-.73a2.784 2.784 0 0 1-.557-3.898l2.777-3.703a3.037 3.037 0 1 1 4.8 3.72l-1.429 1.786a1 1 0 1 0 1.562 1.25l1.43-1.788a5.037 5.037 0 0 0-.862-7.138Z" fill="currentColor"/><path d="M5.152 21.301a5.037 5.037 0 0 0 7.1-.97l2.777-3.703a4.784 4.784 0 0 0-.957-6.699L13.1 9.2a1 1 0 0 0-1.2 1.6l.973.73a2.784 2.784 0 0 1 .556 3.898l-2.777 3.703a3.037 3.037 0 1 1-4.8-3.72l1.429-1.786a1 1 0 1 0-1.562-1.25l-1.43 1.787a5.037 5.037 0 0 1-.863 7.14Z" fill="currentColor"/></svg><span>复制链接</span></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceReviewMemberContext, SelfSummaryPerson } from '@/api/performance'

type Person = SelfSummaryPerson & PerformanceReviewMemberContext
const props = defineProps<{ person: Person }>()
const emit = defineEmits<{ translate: []; 'translate-menu': []; 'copy-link': [] }>()
const initial = computed(() => (props.person.display_name || props.person.employee_no).trim().slice(0, 1) || '人')
const profileParts = computed(() => Array.isArray(props.person.profile_fields)
  ? props.person.profile_fields.map(field => field.value).filter(Boolean)
  : [
      props.person.department,
      props.person.job_sequence,
      props.person.position_level,
      props.person.direct_supervisor_name ? `直属上级：${props.person.direct_supervisor_name}` : '',
      props.person.hire_date ? `${props.person.hire_date} 入职` : '',
    ].filter(Boolean))
</script>

<style scoped>
.performance-review-person-header{display:flex;min-width:0;flex:1;align-items:flex-start}.performance-review-person-header__identity{display:flex;min-width:0;flex:1;align-items:center}.performance-review-person-header__avatar{display:block;width:40px;height:40px;flex:0 0 40px;overflow:hidden;border-radius:50%;object-fit:cover}.performance-review-person-header__avatar--fallback{display:grid;place-items:center;background:#dbe4f5;color:#1456f0;font-size:14px;font-weight:600}.performance-review-person-header__info{min-width:0;margin-left:12px}.performance-review-person-header__info strong,.performance-review-person-header__info span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.performance-review-person-header__info strong{color:#1d252f;font-size:16px;font-weight:600;line-height:24px}.performance-review-person-header__info span{max-width:650px;color:#646a73;font-size:14px;line-height:21px}.performance-review-person-header__profile-line{display:flex!important;align-items:center}.performance-review-person-header__profile-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.performance-review-person-header__profile-separator{display:inline-block;width:1px;height:24px;flex:0 0 1px;margin:2px 8px;box-sizing:border-box;background:#bbbfc4;content:''}.performance-review-person-header__actions{display:flex;align-items:center;gap:8px;margin-left:16px;color:#646a73}.performance-review-person-header__translate{display:flex;align-items:center}.performance-review-person-header__action{display:inline-flex;align-items:center;justify-content:center;height:26px;padding:2px 4px;border:0;border-radius:6px;background:transparent;color:#1f2329;cursor:pointer;font:400 14px/22px var(--font-sans);white-space:nowrap}.performance-review-person-header__action:hover,.performance-review-person-header__action:focus-visible{background:rgba(31,35,41,.1);outline:0}.performance-review-person-header__action span{display:block;margin-right:4px;line-height:0}.performance-review-person-header__action svg{display:block;flex:0 0 14px}.performance-review-person-header__translate-main{border-radius:6px 0 0 6px}.performance-review-person-header__translate-menu{margin-left:-8px;border-radius:0 6px 6px 0}.performance-review-person-header__translate-menu svg{width:14px;height:14px}.performance-review-person-header__actions::before{width:1px;height:16px;background:rgba(31,35,41,.15);content:''}.performance-review-person-header__actions::before{order:1}.performance-review-person-header__translate{order:0}.performance-review-person-header__actions>.performance-review-person-header__action:last-child{order:2}
</style>
