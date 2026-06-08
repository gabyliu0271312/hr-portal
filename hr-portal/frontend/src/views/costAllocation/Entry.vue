<template>
  <div class="entry-page">
    <section class="page-head">
      <div>
        <div class="eyebrow">独立应用</div>
        <h1>{{ pageTitle }}</h1>
        <p>{{ normalizedTargetUrl ? '正在跳转到生产环境' : 'HR Portal 控制入口权限，成本分摊系统继续控制内部角色、流程和数据范围。' }}</p>
      </div>
      <el-tag type="primary" effect="plain">已接入</el-tag>
    </section>

    <section class="entry-grid">
      <el-card class="entry-card" shadow="never">
        <div class="card-title">
          <span class="card-icon">
            <el-icon><Histogram /></el-icon>
          </span>
          <div>
            <h2>{{ cardTitle }}</h2>
            <p>{{ cardDesc }}</p>
          </div>
        </div>

        <div class="action-row">
          <el-button type="primary" :loading="loading" @click="openCurrentTab">
            <el-icon><Link /></el-icon>
            进入系统
          </el-button>
          <el-button :loading="loading" @click="openNewTab">
            新窗口打开
          </el-button>
        </div>

        <el-alert
          v-if="!normalizedTargetUrl"
          class="config-alert"
          type="warning"
          :closable="false"
          show-icon
          title="未配置成本分摊系统地址"
          description="请配置 VITE_COST_ALLOCATION_APP_URL，后台入口可选配置 VITE_COST_ALLOCATION_ADMIN_URL，然后重新构建前端。"
        />
      </el-card>

      <el-card class="info-card" shadow="never">
        <div class="info-title">
          <el-icon><Setting /></el-icon>
          <span>接入信息</span>
        </div>
        <dl>
          <div>
            <dt>入口权限</dt>
            <dd>{{ accessCode }}</dd>
          </div>
          <div>
            <dt>目标地址</dt>
            <dd>{{ normalizedTargetUrl || '未配置' }}</dd>
          </div>
          <div>
            <dt>系统文档</dt>
            <dd>C:\Users\gaby.liu\.claude\projects\成本分摊系统</dd>
          </div>
        </dl>
      </el-card>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Histogram, Link, Setting } from '@element-plus/icons-vue'
import { api } from '@/api/client'

const route = useRoute()

const DEFAULT_PRODUCTION_APP_URL = 'http://192.168.10.13:37800/'

const appUrl = (import.meta.env.VITE_COST_ALLOCATION_APP_URL || DEFAULT_PRODUCTION_APP_URL).trim()
const configuredAdminUrl = (import.meta.env.VITE_COST_ALLOCATION_ADMIN_URL || '').trim()
const loading = ref(false)

const isAdminEntry = computed(() => route.meta.entryType === 'admin')
const adminUrl = computed(() => configuredAdminUrl || joinUrl(appUrl, '/admin/workbench'))
const targetUrl = computed(() => (isAdminEntry.value ? adminUrl.value : appUrl))
const normalizedTargetUrl = computed(() => normalizeUrl(targetUrl.value))
const entryType = computed(() => (isAdminEntry.value ? 'admin' : 'app'))

const pageTitle = computed(() => (isAdminEntry.value ? '成本分摊后台入口' : '人力成本分摊系统'))
const cardTitle = computed(() => (isAdminEntry.value ? '打开成本分摊后台' : '打开成本分摊系统'))
const cardDesc = computed(() =>
  isAdminEntry.value
    ? '将直接进入生产环境的成本分摊系统后台。'
    : '将直接进入生产环境的人力成本分摊系统。',
)
const accessCode = computed(() => (isAdminEntry.value ? 'cost_allocation.admin' : 'cost_allocation.app'))

onMounted(() => {
  redirectToProduction()
})

watch(
  () => route.fullPath,
  () => {
    redirectToProduction()
  },
)

function normalizeUrl(url: string) {
  const value = url.trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

function joinUrl(base: string, path: string) {
  if (!base) return ''
  return `${base.replace(/\/+$/, '')}${path}`
}

function openCurrentTab() {
  redirectToProduction()
}

async function openNewTab() {
  const url = await getSsoUrl()
  if (!url) {
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

async function redirectToProduction() {
  const url = await getSsoUrl()
  if (!url) return
  window.location.replace(url)
}

async function getSsoUrl() {
  if (loading.value) return ''
  loading.value = true
  try {
    const resp = await api.get<{ url: string; target_url: string }>('/cost-allocation/external-sso-url', {
      params: { entry_type: entryType.value },
    })
    return resp.data.url
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail || '获取成本分摊飞书登录地址失败')
    return ''
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.entry-page {
  padding: 24px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.eyebrow {
  margin-bottom: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

h1 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 22px;
}

.page-head p,
.card-title p {
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.entry-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.8fr);
  gap: 16px;
}

.entry-card,
.info-card {
  border-radius: 8px;
}

.card-title {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 8px;
  color: var(--color-primary);
  background: var(--color-primary-light);
  font-size: 20px;
}

h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 18px;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}

.config-alert {
  margin-top: 18px;
}

.info-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--color-text-primary);
  font-weight: 600;
}

dl {
  display: grid;
  gap: 12px;
  margin: 0;
}

dl > div {
  display: grid;
  gap: 4px;
}

dt {
  color: var(--color-text-secondary);
  font-size: 12px;
}

dd {
  margin: 0;
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .entry-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
