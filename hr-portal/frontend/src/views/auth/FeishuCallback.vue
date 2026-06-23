<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { AxiosError } from 'axios'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const errorMsg = ref<string | null>(null)

onMounted(async () => {
  const code = route.query.code as string | undefined
  const state = route.query.state as string | undefined
  const savedState = sessionStorage.getItem('feishu_oauth_state')
  const redirect = sessionStorage.getItem('feishu_oauth_redirect') || '/home'
  sessionStorage.removeItem('feishu_oauth_state')
  sessionStorage.removeItem('feishu_oauth_redirect')

  if (!code) {
    errorMsg.value = '飞书未返回授权码'
    return
  }
  if (!state || state !== savedState) {
    errorMsg.value = '登录校验失败，请重新登录'
    return
  }

  try {
    await userStore.loginByFeishu(code)
    router.replace(redirect)
  } catch (e) {
    const err = e as AxiosError<{ detail: string }>
    errorMsg.value = err.response?.data?.detail || '飞书登录失败'
  }
})

function backToLogin() {
  router.replace({ name: 'Login' })
}
</script>

<template>
  <div class="callback">
    <div v-if="!errorMsg" class="callback__loading">
      <span class="callback__spinner"></span>
      正在通过飞书登录…
    </div>
    <div v-else class="callback__error">
      <p class="callback__error-text">{{ errorMsg }}</p>
      <el-button type="primary" @click="backToLogin">返回登录</el-button>
    </div>
  </div>
</template>

<style scoped>
.callback {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--color-bg-page);
}
.callback__loading {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  color: var(--color-text-regular);
  font-size: var(--font-size-sm);
}
.callback__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.callback__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-4);
}
.callback__error-text {
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  margin: 0;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
