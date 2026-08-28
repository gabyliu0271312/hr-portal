<script setup lang="ts">
import { ArrowLeft, InfoFilled } from '@element-plus/icons-vue'

export interface WorkspaceStep {
  key: string
  label: string
  disabled?: boolean
}

withDefaults(defineProps<{
  title: string
  subtitle?: string
  description?: string
  steps?: WorkspaceStep[]
  activeStep?: string
  busy?: boolean
}>(), {
  subtitle: '',
  description: '',
  steps: () => [],
  activeStep: '',
  busy: false,
})

const emit = defineEmits<{
  back: []
  stepChange: [key: string]
}>()
</script>

<template>
  <Teleport to="body">
    <div class="fullscreen-workspace">
      <header class="workspace-header">
        <div class="workspace-header-left">
          <button class="workspace-back" type="button" :disabled="busy" @click="emit('back')">
            <el-icon><ArrowLeft /></el-icon><span>返回</span>
          </button>
          <div class="workspace-title-area">
            <div class="workspace-title-row">
              <h2 class="workspace-title">{{ title }}</h2>
              <el-tooltip v-if="description" :content="description" placement="bottom" :show-after="200">
                <button class="workspace-info" type="button" :aria-label="`查看${title}说明`">
                  <el-icon><InfoFilled /></el-icon>
                </button>
              </el-tooltip>
              <slot name="title-extra" />
            </div>
            <span v-if="subtitle" class="workspace-subtitle">{{ subtitle }}</span>
          </div>
        </div>

        <nav v-if="steps.length" class="workspace-steps" aria-label="流程步骤">
          <button
            v-for="(step, index) in steps"
            :key="step.key"
            type="button"
            class="workspace-step"
            :class="{ active: activeStep === step.key }"
            :disabled="busy || step.disabled"
            :aria-current="activeStep === step.key ? 'step' : undefined"
            @click="emit('stepChange', step.key)"
          >
            <span class="workspace-step-label">{{ step.label }}</span>
            <span v-if="index < steps.length - 1" class="workspace-step-arrow" aria-hidden="true">›</span>
          </button>
        </nav>

        <div class="workspace-actions"><slot name="actions" /></div>
      </header>

      <main class="workspace-content"><slot /></main>
    </div>
  </Teleport>
</template>

<style scoped>
.fullscreen-workspace {
  position: fixed;
  z-index: 2000;
  inset: 0;
  box-sizing: border-box;
  display: flex;
  width: 100vw;
  height: 100vh;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-gutter: stable;
  background: var(--color-bg-page);
}
.workspace-header {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 72px;
  padding: 12px 32px;
  flex: 0 0 auto;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-page);
  box-shadow: 0 2px 8px rgb(15 23 42 / 6%);
}
.workspace-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
}
.workspace-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 13px;
}
.workspace-back:hover:not(:disabled) { color: var(--color-primary); }
.workspace-back:disabled { cursor: default; opacity: 0.65; }
.workspace-title-area { display: grid; gap: 2px; min-width: 0; }
.workspace-title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.workspace-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-subtitle {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.workspace-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: help;
}
.workspace-info:hover { color: var(--color-primary); }
.workspace-info:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.workspace-steps {
  position: absolute;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 4px;
  transform: translateX(-50%);
}
.workspace-step {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 112px;
  min-height: 36px;
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
}
.workspace-step:hover:not(:disabled), .workspace-step.active { color: var(--color-primary); }
.workspace-step-label { padding-bottom: 4px; border-bottom: 2px solid transparent; }
.workspace-step.active .workspace-step-label { border-bottom-color: currentColor; }
.workspace-step:disabled { cursor: default; opacity: 0.65; }
.workspace-step-arrow { position: absolute; right: 0; color: var(--color-text-placeholder); font-size: 22px; line-height: 1; }
.workspace-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.workspace-content {
  box-sizing: border-box;
  min-height: 0;
  padding: 24px 32px;
  flex: 1 1 auto;
}
@media (max-width: 900px) {
  .workspace-header { gap: 10px; }
  .workspace-steps { position: static; min-width: 0; transform: none; overflow-x: auto; }
}
@media (max-width: 640px) {
  .workspace-header { flex-wrap: wrap; min-height: auto; padding: 12px 16px; }
  .workspace-header-left { flex: 1 1 auto; }
  .workspace-actions { flex: 0 0 auto; }
  .workspace-steps { order: 3; flex-basis: 100%; }
  .workspace-content { padding: 16px; }
}
</style>
