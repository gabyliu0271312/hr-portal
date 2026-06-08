<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Connection, Refresh } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { aiFormulaApi, type AiConfigItem, type AiConfigTestResult } from '@/api/aiFormula'

const MENU = 'system.ai_config'
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const configs = ref<AiConfigItem[]>([])
const testResult = ref<AiConfigTestResult | null>(null)
const testError = ref('')

const form = reactive({
  provider: 'openai_compatible',
  name: 'OpenAI Compatible',
  base_url: '',
  api_key: '',
  model_fast_json: '',
  model_reasoning: '',
  timeout_seconds: 30,
  is_enabled: false,
})

const canTest = computed(() => !!form.model_fast_json.trim())

async function load() {
  loading.value = true
  try {
    configs.value = await aiFormulaApi.configs()
    const current = configs.value[0]
    if (current) {
      Object.assign(form, {
        provider: current.provider,
        name: current.name,
        base_url: current.base_url || '',
        api_key: '',
        model_fast_json: current.model_fast_json || '',
        model_reasoning: current.model_reasoning || '',
        timeout_seconds: current.timeout_seconds || 30,
        is_enabled: current.is_enabled,
      })
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载 AI 配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('配置名称必填')
    return
  }
  if (form.is_enabled && !form.model_fast_json.trim()) {
    ElMessage.warning('启用前请填写公式草稿模型')
    return
  }
  saving.value = true
  try {
    await aiFormulaApi.saveConfig({
      provider: form.provider,
      name: form.name.trim(),
      base_url: form.base_url.trim() || null,
      api_key: form.api_key || null,
      model_fast_json: form.model_fast_json.trim() || null,
      model_reasoning: form.model_reasoning.trim() || null,
      timeout_seconds: form.timeout_seconds,
      is_enabled: form.is_enabled,
      extra_config: {},
    })
    form.api_key = ''
    ElMessage.success('AI 基础配置已保存')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function testModel() {
  if (!form.model_fast_json.trim()) {
    ElMessage.warning('请先填写要测试的模型名称')
    return
  }
  testResult.value = null
  testError.value = ''
  testing.value = true
  try {
    const result = await aiFormulaApi.testConfig({
      provider: form.provider,
      base_url: form.base_url.trim() || null,
      api_key: form.api_key || null,
      model: form.model_fast_json.trim(),
      timeout_seconds: form.timeout_seconds,
    })
    testResult.value = result
    ElMessage.success(`模型测试通过，耗时 ${result.latency_ms}ms`)
  } catch (e: any) {
    testError.value = e?.response?.data?.detail || '模型测试失败'
    ElMessage.error(testError.value)
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <el-card v-loading="loading">
      <template #header>
        <div class="page-head">
          <div>
            <div class="page-title">AI 基础配置</div>
            <div class="page-subtitle">配置模型供应商、模型名称和启用状态，供公式助手等 AI 能力调用。</div>
          </div>
          <el-button :icon="Refresh" @click="load">刷新</el-button>
        </div>
      </template>

      <el-form label-position="top" class="config-form">
        <div class="form-grid">
          <el-form-item label="Provider">
            <el-select v-model="form.provider">
              <el-option label="OpenAI Compatible" value="openai_compatible" />
            </el-select>
          </el-form-item>
          <el-form-item label="配置名称" required>
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item label="Base URL">
            <el-input v-model="form.base_url" placeholder="https://api.example.com/v1" />
            <div class="field-tip">填写 OpenAI-compatible API 根地址，不是供应商官网或控制台地址。</div>
          </el-form-item>
          <el-form-item label="API Key">
            <el-input v-model="form.api_key" type="password" show-password placeholder="留空则保持原密钥" />
          </el-form-item>
          <el-form-item label="公式草稿模型" required>
            <el-input v-model="form.model_fast_json" placeholder="如 gpt-4o-mini" />
          </el-form-item>
          <el-form-item label="推理模型">
            <el-input v-model="form.model_reasoning" placeholder="可选" />
          </el-form-item>
          <el-form-item label="超时秒数">
            <el-input-number v-model="form.timeout_seconds" :min="5" :max="120" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.is_enabled" active-text="启用" inactive-text="停用" />
          </el-form-item>
        </div>
        <div class="action-row">
          <PermissionButton :menu="MENU" op="V" plain :disabled="!canTest" :loading="testing" @click="testModel">
            <el-icon><Connection /></el-icon>
            测试模型
          </PermissionButton>
          <PermissionButton :menu="MENU" op="C" type="primary" :loading="saving" @click="save">
            <el-icon><Check /></el-icon>
            保存配置
          </PermissionButton>
        </div>

        <div v-if="testResult || testError" class="test-panel" :class="{ ok: !!testResult, bad: !!testError }">
          <template v-if="testResult">
            <div class="test-title">模型测试通过</div>
            <div class="test-grid">
              <span>模型</span><strong>{{ testResult.model }}</strong>
              <span>Base URL</span><strong>{{ testResult.base_url }}</strong>
              <span>耗时</span><strong>{{ testResult.latency_ms }}ms</strong>
              <span>返回</span><strong>{{ testResult.message }}</strong>
            </div>
          </template>
          <template v-else>
            <div class="test-title">模型测试失败</div>
            <div class="test-error">{{ testError }}</div>
          </template>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  padding: 24px;
}
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
}
.page-subtitle {
  margin-top: 4px;
  color: var(--color-text-placeholder);
  font-size: 13px;
}
.config-form {
  max-width: 920px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: 0 16px;
}
.field-tip {
  margin-top: 6px;
  color: var(--color-text-placeholder);
  font-size: 12px;
  line-height: 1.5;
}
.action-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.test-panel {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  background: var(--color-bg-subtle);
}
.test-panel.ok {
  border-color: var(--color-success-border);
  background: var(--color-success-light);
}
.test-panel.bad {
  border-color: var(--color-danger-border);
  background: var(--color-danger-light);
}
.test-title {
  margin-bottom: 8px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 700;
}
.test-grid {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 6px 10px;
  font-size: 12px;
}
.test-grid span {
  color: var(--color-text-secondary);
}
.test-grid strong,
.test-error {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--color-text-primary);
  font-size: 12px;
}
@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
