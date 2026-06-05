<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { AxiosError } from 'axios'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loginName = ref('')
const password = ref('')
const submitting = ref(false)
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

function showSsoHint() {
  ElMessage.info('飞书 SSO 即将上线，请使用账号密码登录')
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
          <p class="login__brand-sub">权限管理 · 报表中台</p>
        </div>
      </header>

      <main class="login__panel">
        <div class="hp-eyebrow">01 / 登录</div>
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

        <button class="login__sso" disabled @click="showSsoHint">
          <span class="login__sso-icon">⌬</span>
          飞书登录（即将上线）
        </button>
      </main>

      <footer class="login__footer">
        <span class="hp-eyebrow" style="font-size: 10px">v0.1.0 · Phase 2</span>
        <span class="login__footer-hint">
          首次登录请使用 admin 账号；密码见 .env 中的 ADMIN_INIT_PASSWORD
        </span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.login {
  position: relative;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--ink-0);
  overflow: hidden;
}

/* 背景：极淡的网格 + 一抹靛蓝色块，远离常见的渐变 hero */
.login__bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--ink-100) 1px, transparent 1px),
    linear-gradient(90deg, var(--ink-100) 1px, transparent 1px);
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
  gap: var(--space-9);
  z-index: 1;
}

.login__brand {
  display: flex;
  align-items: center;
  gap: var(--space-5);
}
.login__brand-mark {
  color: var(--brand-500);
  font-size: 32px;
  letter-spacing: -0.05em;
  line-height: 1;
}
.login__brand-name {
  font-size: var(--fs-xl);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  margin: 0;
}
.login__brand-sub {
  font-size: var(--fs-xs);
  color: var(--ink-500);
  margin: 2px 0 0;
}

.login__panel {
  background: #fff;
  border: var(--border-default);
  border-radius: var(--r-lg);
  padding: var(--space-10) var(--space-9);
  box-shadow: var(--shadow-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

.login__title {
  font-size: var(--fs-lg);
  font-weight: 600;
  margin: 0;
  letter-spacing: var(--tracking-tight);
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  margin-top: var(--space-3);
}
.login__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.login__label {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--ink-700);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  font-family: var(--font-mono);
}

.login__error {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-left: var(--bw-bar) solid var(--danger-500);
  background: var(--danger-50);
  color: var(--danger-700);
  font-size: var(--fs-xs);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
}
.login__error-bar { display: none; }

.login__submit {
  margin-top: var(--space-4);
  width: 100%;
  letter-spacing: 0.1em;
  font-weight: 600;
}

.login__divider {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  color: var(--ink-400);
  font-size: var(--fs-xs);
  font-family: var(--font-mono);
  letter-spacing: var(--tracking-wide);
}
.login__divider::before,
.login__divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ink-150);
}

.login__sso {
  width: 100%;
  height: 40px;
  background: #fff;
  border: var(--border-default);
  border-radius: var(--r-sm);
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  color: var(--ink-400);
  cursor: not-allowed;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  letter-spacing: 0.05em;
}
.login__sso-icon {
  font-size: 16px;
  color: var(--ink-300);
}

.login__footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  text-align: left;
  padding: 0 var(--space-3);
}
.login__footer-hint {
  font-size: var(--fs-2xs);
  color: var(--ink-500);
  line-height: var(--lh-loose);
  font-family: var(--font-mono);
}

.fade-enter-active,
.fade-leave-active { transition: all var(--duration-base) var(--easing-out); }
.fade-enter-from,
.fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>