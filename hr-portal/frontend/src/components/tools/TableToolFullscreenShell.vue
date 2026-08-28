<script setup lang="ts">
import { ArrowLeft, InfoFilled } from '@element-plus/icons-vue'

export interface WorkflowStep {
  key: string
  label: string
  disabled?: boolean
}

withDefaults(defineProps<{
  title: string
  description?: string
  steps?: WorkflowStep[]
  activeStep?: string
  busy?: boolean
}>(), {
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
    <div class="table-tool-fullscreen">
      <header class="table-tool-header">
        <div class="table-tool-header-left">
          <button class="table-tool-back" type="button" :disabled="busy" @click="emit('back')">
            <el-icon><ArrowLeft /></el-icon>
            <span>返回</span>
          </button>
          <div class="table-tool-title-wrap">
            <h2 class="table-tool-title">{{ title }}</h2>
            <el-tooltip v-if="description" :content="description" placement="bottom" :show-after="200">
              <button class="table-tool-info" type="button" :aria-label="`查看${title}说明`">
                <el-icon><InfoFilled /></el-icon>
              </button>
            </el-tooltip>
          </div>
        </div>

        <nav v-if="steps.length" class="table-tool-steps" aria-label="流程步骤">
          <button
            v-for="(step, index) in steps"
            :key="step.key"
            type="button"
            class="table-tool-step"
            :class="{ active: activeStep === step.key }"
            :disabled="busy || step.disabled"
            :aria-current="activeStep === step.key ? 'step' : undefined"
            @click="emit('stepChange', step.key)"
          >
            <span>{{ step.label }}</span>
            <span v-if="index < steps.length - 1" class="table-tool-step-arrow" aria-hidden="true">›</span>
          </button>
        </nav>

        <div class="table-tool-actions">
          <slot name="actions" />
        </div>
      </header>

      <main class="table-tool-content">
        <slot />
      </main>
    </div>
  </Teleport>
</template>

<style scoped>
.table-tool-fullscreen {
  position: fixed;
  z-index: 2000;
  inset: 0;
  box-sizing: border-box;
  width: 100vw;
  height: 100vh;
  overflow-y: auto;
  background: var(--color-bg-page);
}
.table-tool-header {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 72px;
  padding: 16px 32px;
  background: var(--color-bg-page);
  border-bottom: 1px solid var(--color-border);
  box-shadow: 0 2px 8px rgb(15 23 42 / 6%);
}
.table-tool-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
}
.table-tool-back {
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
.table-tool-back:hover:not(:disabled) { color: var(--color-primary); }
.table-tool-back:disabled { cursor: default; opacity: 0.65; }
.table-tool-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: 17px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table-tool-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.table-tool-info {
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
.table-tool-info:hover { color: var(--color-primary); }
.table-tool-info:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.table-tool-steps {
  position: absolute;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 4px;
  transform: translateX(-50%);
}
.table-tool-step {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
}
.table-tool-step:hover:not(:disabled), .table-tool-step.active { color: var(--color-primary); }
.table-tool-step.active { font-weight: 600; }
.table-tool-step:disabled { cursor: default; opacity: 0.65; }
.table-tool-step-arrow { color: var(--color-text-placeholder); font-size: 22px; line-height: 1; }
.table-tool-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.table-tool-content { padding: 24px 32px; }

@media (max-width: 900px) {
  .table-tool-header { gap: 10px; }
  .table-tool-steps {
    position: static;
    min-width: 0;
    transform: none;
    overflow-x: auto;
  }
}
@media (max-width: 640px) {
  .table-tool-header { flex-wrap: wrap; min-height: auto; padding: 12px 16px; }
  .table-tool-header-left { flex: 1 1 auto; }
  .table-tool-actions { flex: 0 0 auto; }
  .table-tool-steps { order: 3; flex-basis: 100%; }
  .table-tool-content { padding: 16px; }
}
</style>
