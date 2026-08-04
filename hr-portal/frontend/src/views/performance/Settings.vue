<template>
  <section class="settings-page">
    <h1>{{ sectionLabel }}</h1>
    <div class="settings-placeholder" role="status">
      <div class="empty-illustration" aria-hidden="true">
        <span class="ball"></span><span class="paper"></span><span class="pencil"></span><span class="scribble"></span>
      </div>
      <div class="empty-title">该功能正在建设中</div>
      <div class="empty-description">后续将按已确认的原子任务逐步开放</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  DEFAULT_PERFORMANCE_ADMIN_SECTION,
  getPerformanceAdminSectionLabel,
  type PerformanceAdminSection,
} from '@/utils/performanceAdminNavigation'

const props = withDefaults(defineProps<{ section?: PerformanceAdminSection }>(), {
  section: DEFAULT_PERFORMANCE_ADMIN_SECTION,
})
const sectionLabel = computed(() => getPerformanceAdminSectionLabel(props.section))
</script>

<style scoped>
.settings-page { min-height: calc(100vh - 92px); }.settings-page h1 { margin: 0 0 16px; color: #182536; font-size: 20px; line-height: 28px; }.settings-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 600px; border-radius: 8px; background: #fff; color: #8793a6; text-align: center; }.empty-illustration { position: relative; width: 112px; height: 96px; margin-bottom: 16px; }.paper { position: absolute; top: 24px; left: 29px; width: 57px; height: 47px; transform: rotate(42deg); border-radius: 5px; background: #d4dae5; }.paper::before, .paper::after { position: absolute; left: 10px; width: 35px; height: 2px; content: ''; background: #fff; }.paper::before { top: 16px; }.paper::after { top: 25px; }.ball { position: absolute; top: 50px; left: 18px; width: 44px; height: 44px; border-radius: 50%; background: #bcc6d4; }.pencil { position: absolute; top: 8px; left: 16px; width: 9px; height: 77px; transform: rotate(12deg); background: #ffbd21; }.pencil::before { position: absolute; top: -12px; left: 0; border-right: 4.5px solid transparent; border-bottom: 12px solid #31445f; border-left: 4.5px solid transparent; content: ''; }.scribble { position: absolute; top: 0; right: 9px; width: 40px; height: 26px; border: 2px solid #445677; border-radius: 50%; transform: rotate(25deg); }.empty-title { color: #65748a; font-size: 15px; }.empty-description { margin-top: 8px; color: #9da8b8; font-size: 13px; }
</style>
