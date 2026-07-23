<template>
  <div class="scenario-list">
    <div class="page-header"><h2 class="page-title">场景方案</h2><span class="page-subtitle">基于数据连接平台包装的 HR 业务场景</span></div>
    <div class="scenario-cards">
      <div class="scenario-card" @click="router.push('/ucp/scenarios/oa-sync')">
        <div class="card-icon"><el-icon :size="32"><Connection /></el-icon></div>
        <div class="card-body"><h3 class="card-title">OA 组织同步</h3><p class="card-desc">同步组织架构、部门、员工数据到 OA 系统</p>
          <div class="card-meta"><el-tag size="small" :type="oaStatusTag">{{ oaLastStatus }}</el-tag><span class="meta-text" v-if="oaLastRun">最近运行：{{ oaLastRun }}</span></div></div>
        <div class="card-actions"><el-button size="small" @click.stop="router.push('/ucp/scenarios/oa-sync')">进入方案</el-button><el-button size="small" link @click.stop="router.push('/ucp/runs')">查看运行</el-button></div>
      </div>
      <div class="scenario-card" @click="router.push('/ucp/scenarios/external-accounts')">
        <div class="card-icon"><el-icon :size="32"><UserFilled /></el-icon></div>
        <div class="card-body"><h3 class="card-title">外部账号生命周期</h3><p class="card-desc">入职账号开通、离职账号回收、变更自动同步</p>
          <div class="card-meta"><el-tag size="small" type="info">已启用</el-tag></div></div>
        <div class="card-actions"><el-button size="small" @click.stop="router.push('/ucp/scenarios/external-accounts')">账号列表</el-button><el-button size="small" type="primary" plain @click.stop="router.push('/ucp/scenarios/account-lifecycle')">配置规则</el-button><el-button size="small" link @click.stop="router.push('/ucp/runs')">查看异常</el-button></div>
      </div>
      <div class="scenario-card" @click="router.push('/ucp/approvals')">
        <div class="card-icon"><el-icon :size="32"><Document /></el-icon></div>
        <div class="card-body"><h3 class="card-title">审批中心</h3><p class="card-desc">数据变更审批、高风险操作确认、流程授权</p>
          <div class="card-meta"><el-tag size="small" type="warning" v-if="pendingApprovalCount">{{ pendingApprovalCount }} 条待审批</el-tag><el-tag size="small" type="info" v-else>已启用</el-tag></div></div>
        <div class="card-actions"><el-button size="small" @click.stop="router.push('/ucp/approvals')">进入审批</el-button></div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'; import { useRouter } from 'vue-router'
import { Connection, UserFilled, Document } from '@element-plus/icons-vue'
import { oaSyncApi, approvalApi } from '@/api/ucp'
const router = useRouter(); const oaLastStatus = ref('--'); const oaLastRun = ref(''); const pendingApprovalCount = ref<number | null>(null); const oaStatusTag = ref<'success' | 'warning' | 'danger' | 'info'>('info')
async function loadStatus() {
  try {
    const [oaRuns, approvals] = await Promise.all([oaSyncApi.listRuns({ limit: 1 }).catch(() => null), approvalApi.myTodo().catch(() => null)])
    if (oaRuns) { const latest = (oaRuns as any).items?.[0]; if (latest) { oaLastStatus.value = latest.status || '--'; oaLastRun.value = latest.finished_at || latest.started_at || ''; const m: any = { SUCCESS: 'success', FAILED: 'danger', RUNNING: 'warning', PARTIAL_SUCCESS: 'warning' }; oaStatusTag.value = m[latest.status] || 'info' } }
    if (approvals) pendingApprovalCount.value = (approvals as any).count ?? null
  } catch {}
}
onMounted(() => loadStatus())
</script>
<style scoped>
.scenario-list { padding: 20px 24px; min-height: 100%; background: var(--color-bg-page) }
.page-header { margin-bottom: 24px } .page-title { font-size: 22px; font-weight: 600; color: var(--color-text-primary); margin: 0 0 8px 0 } .page-subtitle { font-size: 13px; color: var(--color-text-secondary) }
.scenario-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px }
.scenario-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 8px; padding: 24px; cursor: pointer; transition: box-shadow .2s, transform .15s; display: flex; flex-wrap: wrap }
.scenario-card:hover { box-shadow: 0 2px 16px rgba(0,0,0,.08); transform: translateY(-2px) }
.card-icon { width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; background: var(--color-primary-light, #ecf5ff); border-radius: 12px; color: var(--color-primary); flex-shrink: 0 }
.card-body { flex: 1; padding: 0 16px; min-width: 200px } .card-title { font-size: 16px; font-weight: 600; margin: 0 0 8px 0; color: var(--color-text-primary) } .card-desc { font-size: 13px; color: var(--color-text-secondary); margin: 0 0 12px 0 }
.card-meta { display: flex; align-items: center; gap: 12px } .meta-text { font-size: 12px; color: var(--color-text-placeholder) }
.card-actions { width: 100%; margin-top: 16px; display: flex; gap: 12px }
</style>

