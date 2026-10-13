<template>
  <div class="performance-reminder-placeholder">
    <section class="performance-reminder-placeholder__card">
      <h1>催办任务</h1>
      <p>催办表单功能正在建设中，当前仅展示跳转上下文。</p>
      <dl>
        <div><dt>项目</dt><dd>{{ route.query.project_id || '—' }}</dd></div>
        <div><dt>环节</dt><dd>{{ route.query.node_id || '—' }}</dd></div>
        <div><dt>任务</dt><dd>{{ route.query.task_id || '—' }}</dd></div>
        <div><dt>被评估人</dt><dd>{{ route.query.employee_no || '—' }}</dd></div>
      </dl>
      <button type="button" @click="router.back()">返回</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
</script>

<style scoped>
.performance-reminder-placeholder{display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f4f5f6;color:#1f2329}.performance-reminder-placeholder__card{width:min(520px,calc(100% - 48px));padding:32px;box-sizing:border-box;border-radius:8px;background:#fff;box-shadow:0 4px 16px rgba(31,35,41,.08)}h1{margin:0 0 12px;font-size:20px;line-height:28px}.performance-reminder-placeholder p{margin:0 0 24px;color:#646a73;font-size:14px;line-height:22px}.performance-reminder-placeholder dl{margin:0 0 24px}.performance-reminder-placeholder dl div{display:flex;padding:8px 0;border-bottom:1px solid #f0f1f2;font-size:14px;line-height:22px}.performance-reminder-placeholder dt{width:88px;color:#646a73}.performance-reminder-placeholder dd{margin:0;color:#1f2329;word-break:break-all}.performance-reminder-placeholder button{height:32px;padding:4px 16px;border:0;border-radius:6px;background:#3370ff;color:#fff;cursor:pointer;font:400 14px/22px var(--font-sans)}
</style>
