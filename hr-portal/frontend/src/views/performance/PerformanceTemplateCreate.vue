<template>
  <div class="full-screen-modal">
    <header class="full-screen-modal-header">
      <div class="full-screen-modal-header-left">
        <button class="full-screen-modal-header-back" type="button" @click="goBackToList">
          <span class="universe-icon full-screen-modal-header-back-icon" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="SpaceLeftOutlined"><path d="M1.293 11.293a1 1 0 0 0 0 1.414l7 7a1 1 0 0 0 1.414-1.414L4.414 13H21a1 1 0 1 0 0-2H4.414l5.293-5.293a1 1 0 0 0-1.414-1.414l-7 7Z" fill="currentColor" /></svg></span>
          <span class="full-screen-modal-header-back-text">返回</span>
        </button>
        <div class="full-screen-modal-header-gap" aria-hidden="true"></div>
        <div class="full-screen-modal-header-title">{{ currentStep === 0 ? '新建绩效模板' : '编辑绩效模板' }}</div>
        <div class="full-screen-modal-header-subtitle" aria-hidden="true"></div>
      </div>
      <div class="full-screen-modal-header-right">
        <div class="full-screen-modal-header-actions">
          <nav class="step-flow" aria-label="创建步骤">
            <template v-for="(step, index) in steps" :key="step.key">
              <span class="step-item" :class="{ current: index === currentStep }">{{ step.label }}</span>
              <span v-if="index < steps.length - 1" class="step-separator" aria-hidden="true">›</span>
            </template>
          </nav>
          <button v-if="currentStep > 0" class="previous-button" type="button" @click="goBack">上一步</button>
          <button class="next-button" type="button" @click="handleNext">下一步</button>
        </div>
      </div>
    </header>
    <main class="full-screen-modal-content">
      <section v-if="currentStep === 0" class="basic-info-panel" aria-labelledby="basic-info-title">
        <h1 id="basic-info-title">基本信息</h1><p class="panel-description">请填写绩效模板基本信息</p>
        <form class="basic-info-form" @submit.prevent="goNext">
          <fieldset class="form-item language-field">
            <legend class="field-label">模板语言</legend>
            <p class="field-hint">请确认是否配置双语，进入下一步后，将无法调整</p>
            <div class="language-options">
              <label class="checkbox-row fixed-checkbox"><input checked disabled type="checkbox" /><span class="checkbox-box checked">✓</span><span class="checkbox-label">中文</span></label>
              <label class="checkbox-row"><input v-model="englishEnabled" type="checkbox" /><span class="checkbox-box" :class="{ checked: englishEnabled }">{{ englishEnabled ? '✓' : '' }}</span><span class="checkbox-label">英文</span></label>
            </div>
          </fieldset>
          <label class="form-item" :class="{ invalid: nameError }"><span class="field-label">名称<span class="required-mark">*</span></span><input v-model="templateName" class="native-input" maxlength="100" placeholder="请输入模板名称" aria-label="模板名称" /><span v-if="nameError" class="field-error">{{ nameError }}</span></label>
          <label class="form-item"><span class="field-label">描述</span><span class="textarea-wrap"><textarea v-model="description" class="native-textarea" maxlength="2000" placeholder="请输入模板描述" aria-label="模板描述" /><span class="character-count">{{ description.length }}/2000</span></span></label>
          <fieldset class="form-item calculation-field" :class="{ invalid: calculationError }">
            <div class="calculation-heading"><span>配置「计算规则」</span><PerformanceSwitch :model-value="calculationEnabled" aria-label="配置计算规则" @update:model-value="toggleCalculation" /></div>
            <div class="calculation-hint">开启后，可为评估项配置计算规则</div>
            <div v-if="calculationEnabled" class="calculation-options"><label v-for="option in calculationOptions" :key="option.key" class="checkbox-row option-row"><input v-model="selectedRules" type="checkbox" :value="option.key" /><span class="checkbox-box" :class="{ checked: selectedRules.includes(option.key) }">{{ selectedRules.includes(option.key) ? '✓' : '' }}</span><span class="option-copy"><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span></label></div>
            <span v-if="calculationError" class="field-error">如果开启计算规则配置，则至少配置一个计算规则</span>
          </fieldset>
        </form>
      </section>
      <PerformanceTemplateWorkflowSettings v-if="currentStep === 1" ref="workflowRef" :template-id="activeTemplateId" @back="goBack" @next="goNext" />
      <PerformanceTemplateContentSettings v-else-if="currentStep === 2" :template-id="activeTemplateId" />
      <section v-else-if="currentStep >= 3" class="placeholder-panel" aria-live="polite"><h1>{{ steps[currentStep].label }}</h1><p>当前为前端原型，后续配置功能开放。</p></section>
    </main><div v-if="notice" class="notice" role="alert">{{ notice }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PerformanceSwitch from '@/components/performance/PerformanceSwitch.vue'
import { performanceTemplateApi } from '@/api/performance'
import PerformanceTemplateWorkflowSettings from './PerformanceTemplateWorkflowSettings.vue'
import PerformanceTemplateContentSettings from './PerformanceTemplateContentSettings.vue'

const router = useRouter()
const workflowRef = ref<InstanceType<typeof PerformanceTemplateWorkflowSettings> | null>(null)
const templateId = Number(router.currentRoute.value.query.template_id || 0) || null
const activeTemplateId = ref<number | null>(templateId)
const templateName = ref('')
const description = ref('')
const englishEnabled = ref(false)
const calculationEnabled = ref(false)
const selectedRules = ref<string[]>([])
const currentStep = ref(0)
const nameError = ref('')
const calculationError = ref(false)
const notice = ref('')
const saving = ref(false)
const mockTemplateNames = ['11', '半年度绩效评估（2026模板）', '全年度绩效评估', '半年度绩效评估']
const calculationOptions = [{ key: 'content', label: '按评估内容计算', description: '可配置环节内的各个评估项评分计算得到环节内的总分' }, { key: 'role', label: '按评估角色计算', description: '可配置不同环节的评估项评分计算得到最终结果' }]
const steps = computed(() => { const result = [{ key: 'basic', label: '基本信息' }, { key: 'flow', label: '流程设置' }, { key: 'content', label: '内容设置' }]; if (calculationEnabled.value) result.push({ key: 'calculation', label: '计算规则' }); result.push({ key: 'preview', label: '模板预览' }); return result })
function toggleCalculation(value: boolean) { calculationEnabled.value = value; calculationError.value = false; selectedRules.value = [] }
function validate() { const name = templateName.value.trim(); if (!name) { nameError.value = '名称为必填'; return false }; if (mockTemplateNames.includes(name)) { nameError.value = '该模板名称已存在，请重新输入'; notice.value = nameError.value; return false }; nameError.value = ''; if (calculationEnabled.value && selectedRules.value.length === 0) { calculationError.value = true; return false }; calculationError.value = false; return true }
async function handleNext() { if (currentStep.value === 1) { await workflowRef.value?.save(); return }; await goNext() }
async function goNext() {
  if (currentStep.value === 0) {
    if (!validate() || saving.value) return
    saving.value = true
    try {
      if (!activeTemplateId.value) {
        const created = await performanceTemplateApi.create({
          name: templateName.value.trim(),
          description: description.value,
          language: 'zh-CN',
          english_enabled: englishEnabled.value,
          calculation_enabled: calculationEnabled.value,
          selected_rules: selectedRules.value,
        })
        activeTemplateId.value = created.template_id
      }
      localStorage.setItem('performance-template-draft', JSON.stringify({ name: templateName.value.trim(), description: description.value, englishEnabled: englishEnabled.value, calculationEnabled: calculationEnabled.value, selectedRules: selectedRules.value, templateId: activeTemplateId.value }))
      currentStep.value = Math.min(currentStep.value + 1, steps.value.length - 1)
    } catch (error: any) {
      notice.value = error?.response?.data?.detail?.message || '模板保存失败，请稍后重试'
    } finally {
      saving.value = false
    }
    return
  }
  currentStep.value = Math.min(currentStep.value + 1, steps.value.length - 1)
}
function goBackToList() { void router.push({ name: 'PerformanceTemplates' }) }
function goBack() { if (currentStep.value === 0) goBackToList(); else currentStep.value -= 1 }

onMounted(() => { document.body.style.overflow = 'hidden'; const step = router.currentRoute.value.query.step; if (step === 'workflow') currentStep.value = 1; if (step === 'content') currentStep.value = 2 })
onBeforeUnmount(() => { document.body.style.overflow = '' })
</script>

<style scoped>
.template-create-page{min-height:calc(100vh - 56px);background:#f5f6f7;color:#1f2329;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}.create-header{position:relative;display:flex;align-items:center;height:64px;padding:0 24px;background:#fff;border-bottom:1px solid #e5e6eb}.back-button{display:flex;align-items:center;gap:8px;border:0;padding:0;background:transparent;color:#1f2329;font-size:16px;font-weight:600;cursor:pointer}.create-title{margin-left:24px}.step-flow{position:absolute;left:50%;display:flex;align-items:center;transform:translateX(-50%);white-space:nowrap;font-size:14px}.step-item{color:#8f959e}.step-item.current{color:#3370ff;font-weight:600}.step-separator{margin:0 16px;color:#bbbfc4}.next-button{min-width:80px;height:32px;margin-left:auto;border:0;border-radius:6px;background:#3370ff;color:#fff;cursor:pointer}.create-body{display:flex;justify-content:center;padding:32px 24px}.basic-info-panel,.placeholder-panel{width:min(100%,720px);padding:24px 40px 40px;background:#fff;border-radius:8px}h1{margin:0;font-size:20px}.panel-description,.placeholder-panel p{margin:8px 0 28px;color:#646a73;font-size:14px}.basic-info-form{width:640px;max-width:100%}.form-item{display:block;margin:0 0 24px;border:0;padding:0}.field-label{display:block;margin-bottom:8px;font-size:14px;font-weight:600}.required-mark{margin-left:4px;color:#f54a45}.native-input,.native-textarea{width:100%;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;outline:0;font:inherit;font-size:14px}.native-input{height:32px;padding:4px 11px}.native-textarea{min-height:72px;padding:8px 11px 24px;resize:vertical}.invalid .native-input,.calculation-field.invalid{border-color:#f54a45}.field-error{display:block;margin-top:2px;color:#f54a45;font-size:14px;line-height:21px}.textarea-wrap{position:relative;display:block}.character-count{position:absolute;right:10px;bottom:6px;color:#8f959e;font-size:12px}.field-hint{margin:-2px 0 10px;color:#646a73;font-size:14px}.checkbox-row{position:relative;display:flex;align-items:flex-start;gap:8px;margin:8px 0;font-size:14px;line-height:22px;cursor:pointer}.checkbox-row input{position:absolute;width:16px;height:16px;opacity:0}.checkbox-box{display:grid;place-items:center;width:16px;height:16px;margin-top:3px;border:1px solid #bbbfc4;border-radius:3px;color:#fff;font-size:12px}.checkbox-box.checked{border-color:#3370ff;background:#3370ff}.option-copy{display:flex;flex-direction:column;gap:2px}.option-copy strong{font-weight:400}.option-copy small{color:#646a73;font-size:14px}.switch-row{display:flex;align-items:center;gap:10px;color:#646a73;font-size:14px}.switch{width:36px;height:20px;padding:2px;border:0;border-radius:10px;background:#bbbfc4;cursor:pointer}.switch.on{background:#3370ff}.switch-thumb{display:block;width:16px;height:16px;border-radius:50%;background:#fff}.switch.on .switch-thumb{transform:translateX(16px)}.calculation-options{margin-top:12px}.notice{position:fixed;right:24px;bottom:24px;padding:12px 16px;border:1px solid #ffccc7;border-radius:6px;background:#fff2f0;color:#f54a45;font-size:14px}@media(max-width:640px){.create-header{height:auto;min-height:112px;flex-wrap:wrap;padding:16px;gap:16px}.step-flow{position:static;order:3;width:100%;transform:none;justify-content:center}.next-button{order:2}.create-body{padding:16px}.basic-info-panel,.placeholder-panel{padding:20px 16px}}
.full-screen-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  min-width: 1300px;
  padding-top: 56px;
  overflow: auto;
  background: #f5f6f7;
  color: #1f2329;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
}
.full-screen-modal-header {
  position: absolute;
  inset: 0 0 auto;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 1300px;
  height: 56px;
  padding: 0 20px 0 16px;
  box-sizing: border-box;
  background: #fff;
  border-bottom: 0.666667px solid rgba(31, 35, 41, 0.15);
}
.full-screen-modal-header-left {
  display: flex;
  align-items: center;
  flex: 0 0 209px;
  width: 209px;
  height: 28px;
}
.full-screen-modal-header-back {
  display: flex;
  align-items: center;
  width: 68px;
  height: 28px;
  flex: 0 0 68px;
  padding: 2px 4px;
  box-sizing: border-box;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1f2329;
  font: 600 16px/24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  cursor: pointer;
}
.full-screen-modal-header-back:hover { background: rgba(31, 35, 41, 0.15); }
.full-screen-modal-header-back-icon { display: block; width: 20px; height: 20px; flex: 0 0 20px; color: #1f2329; line-height: 20px; }
.full-screen-modal-header-back-icon svg { display: block; width: 20px; height: 20px; }
.full-screen-modal-header-back-text { display: block; margin-left: 8px; line-height: 24px; }
.full-screen-modal-header-gap { width: 1px; height: 16px; margin: 0 16px 0 12px; background: rgba(31, 35, 41, 0.15); }
.full-screen-modal-header-title { overflow: hidden; min-width: 0; color: #1f2329; font: 600 16px/24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; white-space: nowrap; }
.full-screen-modal-header-subtitle { display: none; }
.full-screen-modal-header-right { display: flex; align-items: center; width: 1035px; height: 32px; }
.full-screen-modal-header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; width: 100%; height: 32px; }
.full-screen-modal-header .step-flow { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; transform: none; white-space: nowrap; font-size: 14px; line-height: 24px; pointer-events: none; }
.full-screen-modal-header .step-item { color: #646a73; }
.full-screen-modal-header .step-item.current { color: #3370ff; font-weight: 600; }
.full-screen-modal-header .step-separator { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin: 0 8px; color: #bbbfc4; font-size: 0; line-height: 14px; }
.full-screen-modal-header .step-separator::before { width: 8px; height: 8px; border-top: 2px solid currentColor; border-right: 2px solid currentColor; content: ''; transform: rotate(45deg); }
.full-screen-modal-header .previous-button, .full-screen-modal-header .next-button { position: relative; z-index: 1; display: inline-flex; flex: 0 0 80px; align-items: center; justify-content: center; width: 80px; min-width: 80px; height: 32px; padding: 4px 11px; box-sizing: border-box; border-radius: 6px; font: 400 14px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif; white-space: nowrap; cursor: pointer; }
.full-screen-modal-header .previous-button { border: .666667px solid #d0d3d6; background: #eff0f1; color: #1f2329; }
.full-screen-modal-header .next-button { margin-left: 0; border: .666667px solid #245bdb; background: #245bdb; color: #fff; }
.full-screen-modal-content { display: flex; flex: 1 1 auto; min-width: 1300px; overflow: auto; background: #fff; }
.full-screen-modal-content .basic-info-panel, .full-screen-modal-content .placeholder-panel { width: auto; min-width: 640px; margin: 20px 280px 0; padding: 0; border-radius: 0; background: transparent; }
.full-screen-modal-content .basic-info-panel h1, .full-screen-modal-content .panel-description { display: none; }
.full-screen-modal-content .basic-info-form { width: 640px; }
.language-options { display: inline-flex; flex-wrap: wrap; column-gap: 24px; }
.language-field .checkbox-row { margin: 0; }
.language-field .fixed-checkbox { cursor: not-allowed; }
.language-field .fixed-checkbox .checkbox-box.checked { border-color: #bbbfc4; background: #bbbfc4; color: #eff0f1; }
.language-field .fixed-checkbox .checkbox-label { color: #bbbfc4; }
.full-screen-modal-content .form-item { margin-bottom: 20px; }
.full-screen-modal-content .field-label { margin-bottom: 8px; line-height: 22px; }
.full-screen-modal-content .native-input { height: 32px; }
.full-screen-modal-content .native-textarea { min-height: 49px; }
.full-screen-modal-content .switch { width: 28px; height: 16px; padding: 2px; }
.full-screen-modal-content .switch-thumb { width: 12px; height: 12px; }
.full-screen-modal-content .switch.on .switch-thumb { transform: translateX(12px); }
.calculation-heading { display: flex; align-items: center; min-height: 22px; }
.calculation-heading > span { margin-right: 8px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.calculation-field .switch { position: relative; min-width: 28px; width: 28px; height: 16px; padding: 1px 6px; border: 0; border-radius: 999999px; background: #d0d3d6; }
.calculation-field .switch-thumb { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 999999px; background: #fff; transition: left .12s cubic-bezier(.4, .8, .74, 1); }
.calculation-field .switch.on { background: #3370ff; }
.calculation-field .switch.on .switch-thumb { transform: none; left: 14px; }
.calculation-hint { margin-top: 4px; color: #646a73; font-size: 14px; font-weight: 400; line-height: 22px; }
.full-screen-modal-content .notice { z-index: 101; }
@media (max-width: 1299px) { .full-screen-modal, .full-screen-modal-header, .full-screen-modal-content { min-width: 1300px; } .full-screen-modal-content .basic-info-panel, .full-screen-modal-content .placeholder-panel { margin-right: 280px; margin-left: 280px; } }</style>





