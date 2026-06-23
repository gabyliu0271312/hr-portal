<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { AxiosError } from 'axios'
import { useUserStore } from '@/stores/user'
import { authApi } from '@/api/auth'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loginName = ref('')
const password = ref('')
const submitting = ref(false)
const ssoLoading = ref(false)
const errorMsg = ref<string | null>(null)

async function onSubmit() {
  if (!loginName.value || !password.value) {
    errorMsg.value = '请输入账号和密码'
    return
  }
  errorMsg.value = null
  submitting.value = true
  try {
    await userStore.login(loginName.value, password.value)
    const redirect = (route.query.redirect as string) || '/home'
    router.push(redirect)
  } catch (e) {
    const err = e as AxiosError<{ detail: string }>
    errorMsg.value = err.response?.data?.detail || '登录失败'
  } finally {
    submitting.value = false
  }
}

async function onFeishuLogin() {
  ssoLoading.value = true
  try {
    const { url, state } = await authApi.feishuUrl()
    sessionStorage.setItem('feishu_oauth_state', state)
    const redirect = (route.query.redirect as string) || '/home'
    sessionStorage.setItem('feishu_oauth_redirect', redirect)
    window.location.href = url
  } catch (e) {
    const err = e as AxiosError<{ detail: string }>
    ElMessage.error(err.response?.data?.detail || '飞书登录暂不可用')
    ssoLoading.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login__bg" aria-hidden="true"></div>

    <div class="login__inner">
      <header class="login__brand">
        <span class="login__brand-mark">▎</span>
        <div>
          <h1 class="login__brand-name">HR PORTAL</h1>
          <p class="login__brand-sub">人力资源门户</p>
        </div>
      </header>

      <main class="login__panel">
        <div class="login__eyebrow">01 / 登录</div>
        <h2 class="login__title">使用账号密码进入系统</h2>

        <form class="login__form" @submit.prevent="onSubmit">
          <label class="login__field">
            <span class="login__label">账号</span>
            <el-input
              v-model="loginName"
              size="large"
              placeholder="登录名"
              autocomplete="username"
            />
          </label>

          <label class="login__field">
            <span class="login__label">密码</span>
            <el-input
              v-model="password"
              type="password"
              size="large"
              show-password
              placeholder="密码"
              autocomplete="current-password"
              @keyup.enter="onSubmit"
            />
          </label>

          <transition name="fade">
            <div v-if="errorMsg" class="login__error">
              <span class="login__error-bar"></span>
              {{ errorMsg }}
            </div>
          </transition>

          <el-button
            type="primary"
            size="large"
            class="login__submit"
            native-type="submit"
            :loading="submitting"
          >
            登 录
          </el-button>
        </form>

        <div class="login__divider">
          <span>或</span>
        </div>

        <button
          class="login__sso"
          type="button"
          :disabled="ssoLoading"
          @click="onFeishuLogin"
        >
          <span class="login__sso-icon">⌬</span>
          {{ ssoLoading ? '正在跳转飞书…' : '飞书登录' }}
        </button>
      </main>
    </div>
  </div>
</template>

<style scoped>
.login {
  position: relative;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--color-bg-page);
  overflow: hidden;
}

.login__bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--color-border-lighter) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-border-lighter) 1px, transparent 1px);
  background-size: 32px 32px;
  background-position: -1px -1px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, #000 30%, transparent 80%);
  pointer-events: none;
}

.login__inner {
  position: relative;
  width: min(420px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: var(--spacing-7);
  z-index: 1;
}

.login__brand {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}
.login__brand-mark {
  color: var(--color-primary);
  font-size: 32px;
  letter-spacing: 0;
  line-height: 1;
}
.login__brand-name {
  font-size: var(--font-size-xl);
  font-weight: 700;
  letter-spacing: 0;
  margin: 0;
}
.login__brand-sub {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin: 2px 0 0;
}

.login__panel {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-8) var(--spacing-7);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-5);
}

.login__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: 600;
  letter-spacing: 0;
}

.login__eyebrow::before {
  content: '';
  width: 18px;
  height: 1px;
  background: currentColor;
}

.login__title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin: 0;
  letter-spacing: 0;
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  margin-top: var(--spacing-1);
}
.login__field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}
.login__label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-text-regular);
  letter-spacing: 0;
  font-family: var(--font-mono);
}

.login__error {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border-left: 3px solid var(--color-danger);
  background: var(--color-danger-light);
  color: var(--color-danger);
  font-size: var(--font-size-xs);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.login__error-bar { display: none; }

.login__submit {
  margin-top: var(--spacing-2);
  width: 100%;
  letter-spacing: 0;
  font-weight: 600;
}

.login__divider {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  color: var(--color-text-placeholder);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  letter-spacing: 0;
}
.login__divider::before,
.login__divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border-light);
}

.login__sso {
  width: 100%;
  height: 40px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--color-text-regular);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  letter-spacing: 0;
  transition: border-color var(--duration-base) var(--ease-standard);
}
.login__sso:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.login__sso:disabled {
  color: var(--color-text-placeholder);
  cursor: not-allowed;
}
.login__sso-icon {
  font-size: 16px;
  color: var(--color-primary);
}

.fade-enter-active,
.fade-leave-active { transition: all var(--duration-base) var(--ease-standard); }
.fade-enter-from,
.fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
