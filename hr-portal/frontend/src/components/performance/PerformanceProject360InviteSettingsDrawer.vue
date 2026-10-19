<template>
  <PerformanceDrawerShell
    v-model="open"
    width="680px"
    variant="captured-invite"
    aria-label="360°评估人设置"
    body-class="performance-drawer__body--invite"
    @close="cancel"
  >
    <template #header>
      <div class="invite-settings-drawer__header-content">
        <div class="invite-settings-drawer__title">
          <strong>360°评估人设置</strong>
          <span>该配置对所有 360° 相关环节生效</span>
        </div>
      </div>
    </template>

    <div class="invite-settings-drawer" aria-label="360°评估人设置内容">
      <section class="invite-settings-section" aria-labelledby="default-invite-title">
        <div class="invite-settings-section__header">
          <h3 id="default-invite-title">默认邀请</h3>
          <div class="invite-settings-section__description">
            <p v-for="item in defaultInviteNotes" :key="item"><span aria-hidden="true" />{{ item }}</p>
          </div>
        </div>
        <div class="invite-settings-section__body">
          <div class="invite-settings-field-label">按与被评估人的关系邀请</div>
          <div class="invite-settings-surface">
            <div class="invite-settings-field-label">选择与被评估人的关系</div>
            <PerformanceSelectShell
              v-model="relationDraft"
              :selected-items="selectedRelations"
              placeholder="请选择"
              aria-label="选择与被评估人的关系"
              popup-label="与被评估人的关系选项"
            >
              <template #default="{ query, focus }">
                <button v-for="option in relationOptions.filter(item => item.label.includes(query.trim()))" :key="option.value" class="invite-settings-option" type="button" role="option" :aria-selected="relationDraft.includes(option.value)" @click="toggleRelation(option.value, focus)">
                  <span class="invite-settings-option__checkbox" :class="{ 'is-selected': relationDraft.includes(option.value) }">{{ relationDraft.includes(option.value) ? '✓' : '' }}</span>{{ option.label }}
                </button>
              </template>
            </PerformanceSelectShell>
          </div>
        </div>
      </section>

      <section class="invite-settings-section invite-settings-section--spaced" aria-labelledby="invite-scope-title">
        <h3 id="invite-scope-title">限定默认邀请范围</h3>
        <p class="invite-settings-muted">针对默认邀请的直属下级，限定默认邀请的人员范围</p>
        <div class="invite-settings-surface invite-settings-surface--settings">
          <div class="invite-settings-switch-line">
            <span>只邀请在职人员</span>
            <PerformanceSwitch v-model="activeOnly" aria-label="只邀请在职人员" />
          </div>
          <div class="invite-settings-switch-line">
            <span>直属下级不计入邀请人数限制</span>
            <PerformanceSwitch v-model="draft.exclude_default_invite_from_limit" aria-label="直属下级不计入邀请人数限制" />
          </div>
        </div>
      </section>

      <section class="invite-settings-section invite-settings-section--spaced" aria-labelledby="import-invite-title">
        <h3 id="import-invite-title">导入默认邀请名单</h3>
        <div class="invite-settings-surface invite-settings-surface--import">
          <PerformanceButton variant="secondary" aria-label="导入默认邀请名单" @click="importInviteList">
            <span class="invite-settings-import-icon" aria-hidden="true">↥</span>导入默认邀请名单
          </PerformanceButton>
        </div>
      </section>

      <section class="invite-settings-section invite-settings-section--spaced" aria-labelledby="recommended-title">
        <div class="invite-settings-section__header">
          <h3 id="recommended-title">推荐邀请</h3>
        </div>
        <div class="invite-settings-check-group">
          <PerformanceCheckbox
            :model-value="recommendedRoles.includes('DOTTED_SUBORDINATES')"
            label="虚线下级"
            @update:model-value="toggleRecommended('DOTTED_SUBORDINATES', $event)"
          />
          <PerformanceCheckbox
            :model-value="recommendedRoles.includes('SMART_RECOMMENDATION')"
            label="智能推荐"
            @update:model-value="toggleRecommended('SMART_RECOMMENDATION', $event)"
          />
          <p>勾选后，系统将为用户自动推荐 360° 评估人。</p>
        </div>
      </section>

      <section class="invite-settings-section invite-settings-section--spaced" aria-labelledby="limit-title">
        <h3 id="limit-title">邀请人数限制</h3>
        <div class="invite-settings-subsection">
          <div class="invite-settings-field-label">邀请人数上下限</div>
          <div class="invite-settings-surface invite-settings-surface--limits">
            <label class="invite-settings-number-field">
              <span>最少邀请人数<span class="invite-settings-required">*</span></span>
              <small>未邀请到此人数时，系统将提示「任务未完成」</small>
              <PerformanceNumberInput
                :model-value="minimumInviteCount"
                width="240px"
                control-height="31px"
                :min="0"
                :max="100"
                aria-label="最少邀请人数"
                @update:model-value="minimumInviteCount = $event"
              />
            </label>
            <div class="invite-settings-number-field">
              <span>最多邀请人数</span>
              <small>邀请到此人数时，系统将进行提示</small>
              <div class="invite-settings-number-with-prefix">
                <PerformanceSelectShell
                  v-model="maxInviteModeValues"
                  :selected-items="selectedMaxInviteModeItems"
                  selection-style="plain"
                  :open-on-focus="false"
                  placeholder="建议值"
                  aria-label="最多邀请人数提示方式"
                  popup-label="最多邀请人数提示方式选项"
                  :popup-width="240"
                  :popup-height="157.333"
                  class="invite-settings-prefix-select"
                >
                  <template #default="{ close }">
                    <button class="invite-settings-prefix-option" type="button" role="option" :aria-selected="maxInviteModeValues.includes('SUGGESTED')" @click="selectMaxInviteMode('SUGGESTED', close)">
                      <span>建议值<small>到达建议值后，被评估人仍可继续邀请 360° 评估人</small></span>
                      <svg v-if="maxInviteModeValues.includes('SUGGESTED')" width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="ListCheckBoldOutlined" aria-hidden="true"><path d="M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z" fill="currentColor" /></svg>
                    </button>
                    <button class="invite-settings-prefix-option invite-settings-prefix-option--limit" type="button" role="option" :aria-selected="maxInviteModeValues.includes('LIMIT')" @click="selectMaxInviteMode('LIMIT', close)"><span>限制值<small>到达限制值后，被评估人不可继续邀请 360° 评估人</small></span><svg v-if="maxInviteModeValues.includes('LIMIT')" width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="ListCheckBoldOutlined" aria-hidden="true"><path d="M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z" fill="currentColor" /></svg></button>
                  </template>
                </PerformanceSelectShell>
                <PerformanceNumberInput
                  v-model="maximumInvitedCount"
                  width="150px"
                  control-height="33px"
                  :min="0"
                  :max="100"
                  :invalid="Boolean(maximumInviteError)"
                  aria-label="最多邀请人数"
                />
              </div>
              <span v-if="maximumInviteError" class="invite-settings-error" role="alert">{{ maximumInviteError }}</span>
            </div>
            <PerformanceCheckbox
              :model-value="secondPromptEnabled"
              label="邀请到指定人数后二次触发提示"
              :disabled="secondPromptDisabled"
              @update:model-value="secondPromptEnabled = $event"
            />
            <div v-if="secondPromptEnabled" class="invite-settings-number-field invite-settings-second-prompt">
              <div class="invite-settings-number-with-prefix">
                <PerformanceSelectShell
                  v-model="secondPromptModeValues"
                  :selected-items="selectedSecondPromptModeItems"
                  selection-style="plain"
                  :open-on-focus="false"
                  placeholder="建议值"
                  aria-label="二次触发提示方式"
                  popup-label="二次触发提示方式选项"
                  :popup-width="240"
                  :popup-height="157.333"
                  class="invite-settings-prefix-select"
                >
                  <template #default="{ close }">
                    <button class="invite-settings-prefix-option" type="button" role="option" :aria-selected="secondPromptModeValues.includes('SUGGESTED')" @click="selectSecondPromptMode('SUGGESTED', close)">
                      <span>建议值<small>到达建议值后，被评估人仍可继续邀请 360° 评估人</small></span>
                      <svg v-if="secondPromptModeValues.includes('SUGGESTED')" width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="ListCheckBoldOutlined" aria-hidden="true"><path d="M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z" fill="currentColor" /></svg>
                    </button>
                    <button class="invite-settings-prefix-option invite-settings-prefix-option--limit" type="button" role="option" :aria-selected="secondPromptModeValues.includes('LIMIT')" @click="selectSecondPromptMode('LIMIT', close)"><span>限制值<small>到达限制值后，被评估人不可继续邀请 360° 评估人</small></span><svg v-if="secondPromptModeValues.includes('LIMIT')" width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="ListCheckBoldOutlined" aria-hidden="true"><path d="M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z" fill="currentColor" /></svg></button>
                  </template>
                </PerformanceSelectShell>
                <PerformanceNumberInput
                  v-model="secondPromptCount"
                  width="150px"
                  control-height="33px"
                  :min="0"
                  :max="100"
                  :invalid="Boolean(secondPromptError)"
                  aria-label="二次触发提示人数"
                />
              </div>
              <span v-if="secondPromptError" class="invite-settings-error" role="alert">{{ secondPromptError }}</span>
            </div>
            <PerformanceCheckbox
              :model-value="draft.exclude_default_invite_from_limit"
              label="不计入邀请人数限制的角色"
              @update:model-value="draft.exclude_default_invite_from_limit = $event"
            />
            <div class="invite-settings-role-list">
              <PerformanceCheckbox :model-value="draft.exclude_default_invite_from_limit" label="直属下级" @update:model-value="draft.exclude_default_invite_from_limit = $event" />
              <PerformanceCheckbox :model-value="false" label="虚线下级" />
            </div>
          </div>
        </div>
      </section>

      <section class="invite-settings-section invite-settings-section--spaced" aria-labelledby="voluntary-title">
        <div class="invite-settings-switch-line invite-settings-switch-line--section-title">
          <h3 id="voluntary-title">允许自愿评估</h3>
          <PerformanceSwitch v-model="draft.allow_voluntary_evaluation" aria-label="允许自愿评估" />
        </div>
        <p class="invite-settings-muted">开启后，所有人可主动选择本项目中未邀请自己的被评估人进行评估</p>
      </section>
    </div>

    <template #footer>
      <p v-if="saveError" class="invite-settings-save-error" role="alert">{{ saveError }}</p>
      <PerformanceDrawerFooter variant="captured-invite" :confirm-disabled="saving" @confirm="confirm" @cancel="cancel" />
    </template>
  </PerformanceDrawerShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { PerformanceProjectFlowSettings } from '@/api/performance'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceDrawerFooter from './PerformanceDrawerFooter.vue'
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import PerformanceSelectShell from './PerformanceSelectShell.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'

type InviteSettings = NonNullable<PerformanceProjectFlowSettings['node_settings'][string]['invite']>
type PeopleOption = { value: string; label: string }

const props = withDefaults(defineProps<{
  modelValue: boolean
  settings: InviteSettings
  peopleOptions?: PeopleOption[]
  saving?: boolean
  saveError?: string
}>(), { peopleOptions: () => [], saving: false, saveError: '' })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [value: InviteSettings]
}>()

const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const draft = reactive<InviteSettings>(createDraft(props.settings))
const relationDraft = ref<string[]>([])
const recommendedRoles = ref<string[]>([])
const activeOnly = ref(true)
const maximumInvitedCount = ref('')
const secondPromptEnabled = ref(false)
const secondPromptCount = ref('')
const validationVisible = ref(false)
const hasMaximumInvite = computed(() => Number.isInteger(Number(maximumInvitedCount.value)) && maximumInvitedCount.value !== '' && Number(maximumInvitedCount.value) > 0)
const secondPromptDisabled = computed(() => !hasMaximumInvite.value || maxInviteModeValues.value.includes('LIMIT'))
const maximumInviteError = computed(() => validationVisible.value && maximumInvitedCount.value !== '' && Number(maximumInvitedCount.value) <= draft.minimum_invited_count ? '需大于最少邀请人数' : '')
const secondPromptError = computed(() => validationVisible.value && secondPromptEnabled.value && secondPromptCount.value !== '' && Number(secondPromptCount.value) <= Number(maximumInvitedCount.value) ? '需大于最多邀请人数' : '')
const minimumInviteCount = computed({
  get: () => String(draft.minimum_invited_count),
  set: value => { draft.minimum_invited_count = Number(value) || 0 },
})
const maxInviteModeValues = ref(['SUGGESTED'])
const secondPromptModeValues = ref(['SUGGESTED'])
const maxInviteModeItems = [{ value: 'SUGGESTED', label: '建议值' }, { value: 'LIMIT', label: '限制值' }]
const selectedMaxInviteModeItems = computed(() => maxInviteModeItems.filter(item => maxInviteModeValues.value.includes(item.value)))
const selectedSecondPromptModeItems = computed(() => maxInviteModeItems.filter(item => secondPromptModeValues.value.includes(item.value)))

const relationOptions = [{ value: 'DIRECT_SUBORDINATES', label: '直属下级' }]
const selectedRelations = computed(() => relationOptions.filter(option => relationDraft.value.includes(option.value)))
const defaultInviteNotes = [
  '如果有 360° 邀请/确认环节：系统将在 360° 邀请/确认提交后，自动邀请默认人员。',
  '如果没有 360° 邀请/确认环节，系统将在 360° 评估环节开始时，自动邀请默认人员。',
  '邀请时，系统会自动剔除已离职的 360° 评估人。',
]

function createDraft(value: InviteSettings): InviteSettings {
  return {
    default_invite: value.default_invite || 'DIRECT_SUBORDINATES',
    minimum_invited_count: Number.isFinite(value.minimum_invited_count) ? value.minimum_invited_count : 0,
    maximum_invited_count: value.maximum_invited_count ?? null,
    maximum_invite_mode: value.maximum_invite_mode || 'SUGGESTED',
    second_prompt_enabled: Boolean(value.second_prompt_enabled),
    second_prompt_count: value.second_prompt_count ?? null,
    second_prompt_mode: value.second_prompt_mode || 'SUGGESTED',
    exclude_default_invite_from_limit: Boolean(value.exclude_default_invite_from_limit),
    recommended_invite: [...(value.recommended_invite || [])],
    allow_voluntary_evaluation: Boolean(value.allow_voluntary_evaluation),
  }
}
function hydrate(value: InviteSettings) {
  Object.assign(draft, createDraft(value))
  validationVisible.value = false
  maximumInvitedCount.value = value.maximum_invited_count == null ? '' : String(value.maximum_invited_count)
  secondPromptEnabled.value = Boolean(value.second_prompt_enabled)
  secondPromptCount.value = value.second_prompt_count == null ? '' : String(value.second_prompt_count)
  maxInviteModeValues.value = [value.maximum_invite_mode || 'SUGGESTED']
  secondPromptModeValues.value = [value.second_prompt_mode || 'SUGGESTED']
  relationDraft.value = draft.default_invite === 'DIRECT_SUBORDINATES' ? ['DIRECT_SUBORDINATES'] : []
  recommendedRoles.value = [...draft.recommended_invite]
}
function toggleRelation(value: string, focus: () => void) {
  relationDraft.value = relationDraft.value.includes(value) ? relationDraft.value.filter(item => item !== value) : [...relationDraft.value, value]
  focus()
}
function toggleRecommended(value: string, enabled: boolean) {
  recommendedRoles.value = enabled
    ? [...new Set([...recommendedRoles.value, value])]
    : recommendedRoles.value.filter(item => item !== value)
  draft.recommended_invite = [...recommendedRoles.value]
}
function importInviteList() {}
function selectMaxInviteMode(value: 'SUGGESTED' | 'LIMIT', close: () => void) {
  maxInviteModeValues.value = [value]
  close()
}
function selectSecondPromptMode(value: 'SUGGESTED' | 'LIMIT', close: () => void) {
  secondPromptModeValues.value = [value]
  close()
}
function confirm() {
  if (props.saving) return
  validationVisible.value = true
  if (secondPromptEnabled.value && secondPromptCount.value === '') return
  if (maximumInviteError.value || secondPromptError.value) return
  draft.default_invite = relationDraft.value.includes('DIRECT_SUBORDINATES') ? 'DIRECT_SUBORDINATES' : 'NONE'
  draft.recommended_invite = [...recommendedRoles.value]
  draft.maximum_invited_count = maximumInvitedCount.value === '' ? null : Number(maximumInvitedCount.value)
  draft.maximum_invite_mode = maxInviteModeValues.value[0] as 'SUGGESTED' | 'LIMIT'
  draft.second_prompt_enabled = secondPromptEnabled.value
  draft.second_prompt_count = secondPromptEnabled.value ? Number(secondPromptCount.value) : null
  draft.second_prompt_mode = secondPromptModeValues.value[0] as 'SUGGESTED' | 'LIMIT'
  emit('confirm', { ...draft, recommended_invite: [...draft.recommended_invite] })
}
function cancel() { if (!props.saving) open.value = false }

watch(() => [maximumInvitedCount.value, secondPromptCount.value, draft.minimum_invited_count], () => {
  if (maximumInvitedCount.value || secondPromptCount.value) validationVisible.value = true
})
watch(maxInviteModeValues, values => { if (values.includes('LIMIT')) secondPromptEnabled.value = false })
watch(hasMaximumInvite, value => { if (!value) secondPromptEnabled.value = false })
watch(() => [props.modelValue, props.settings], ([visible]) => { if (visible) hydrate(props.settings) }, { deep: true, immediate: true })
</script>

<style scoped>
.invite-settings-drawer__header-content{display:flex;min-width:0;align-items:center}.invite-settings-drawer__title{display:flex;flex-direction:column;min-width:0}.invite-settings-drawer__title strong{color:var(--color-text-primary);font-size:16px;font-weight:600;line-height:24px}.invite-settings-drawer__title span{color:var(--color-text-secondary);font-size:14px;font-weight:400;line-height:24px}.invite-settings-drawer{width:624px;max-width:100%;min-width:0;color:var(--color-text-primary);font:400 var(--font-size-md)/22px var(--font-sans)}.invite-settings-section{min-width:0}.invite-settings-section--spaced{margin-top:var(--spacing-7)}.invite-settings-section h3{position:relative;margin:0;padding-left:8px;box-sizing:border-box;color:var(--color-text-primary);font-size:16px;font-weight:600;line-height:24px}.invite-settings-section h3::before{display:block;position:absolute;top:5px;left:0;width:2px;height:14px;content:"";background:var(--color-primary)}.invite-settings-section__header{display:flex;flex-direction:column}.invite-settings-section__description{max-width:600px;margin-top:var(--spacing-2);color:var(--color-text-secondary);font-size:14px;line-height:22px}.invite-settings-section__description p{display:flex;align-items:flex-start;margin:0}.invite-settings-section__description p+p{margin-top:var(--spacing-1)}.invite-settings-section__description p>span{display:block;flex:0 0 4px;width:4px;height:4px;margin:10px 8px 0 0;overflow:hidden;box-sizing:border-box;border:2px solid var(--color-text-placeholder);border-radius:var(--radius-pill);color:var(--color-text-secondary)}.invite-settings-section__body{margin-top:var(--spacing-4)}.invite-settings-field-label{margin-bottom:var(--spacing-2);color:var(--color-text-primary);font-weight:600;line-height:22px}.invite-settings-surface{width:100%;padding:var(--spacing-4);box-sizing:border-box;border-radius:var(--radius-md);background:var(--performance-review-readonly-surface)}.invite-settings-surface .invite-settings-field-label{font-weight:400}.invite-settings-surface :deep(.performance-select-shell){width:100%}.invite-settings-switch-line{display:flex;align-items:center;justify-content:space-between;min-height:22px;color:var(--color-text-primary);font-size:14px;line-height:22px}.invite-settings-switch-line+.invite-settings-switch-line{margin-top:var(--spacing-4)}.invite-settings-switch-line--section-title{justify-content:flex-start;gap:var(--spacing-2)}.invite-settings-switch-line--section-title h3{margin:0;font-size:16px}.invite-settings-muted{margin:var(--spacing-2) 0 0;color:var(--color-text-secondary);font-size:14px;line-height:22px}.invite-settings-surface--import{display:flex;align-items:center;height:64px}.invite-settings-surface--settings{min-height:90px}.invite-settings-surface--limits{min-height:346px}.invite-settings-import-icon{margin-right:var(--spacing-1);font-size:16px;line-height:0}.invite-settings-check-group{display:flex;flex-direction:column;gap:var(--spacing-2);margin-top:var(--spacing-3)}.invite-settings-check-group p{margin:calc(var(--spacing-1) * -1) 0 0 24px;color:var(--color-text-secondary);font-size:14px;line-height:22px}.invite-settings-subsection{margin-top:var(--spacing-4)}.invite-settings-surface--limits{display:flex;flex-direction:column;gap:var(--spacing-4)}.invite-settings-number-field{display:grid;grid-template-columns:1fr;gap:var(--spacing-1);color:var(--color-text-primary);font-size:14px;line-height:22px}.invite-settings-number-field small{color:var(--color-text-secondary);font-size:14px;line-height:22px}.invite-settings-number-with-prefix{display:flex;align-items:stretch;width:max-content;max-width:100%}.invite-settings-number-with-prefix :deep(.performance-select-shell){width:90px;flex:0 0 90px}.invite-settings-number-with-prefix :deep(.performance-select-shell__selector.invite-settings-prefix-select){height:33px;min-height:33px;padding-left:11px;border-radius:var(--radius-md) 0 0 var(--radius-md)}.invite-settings-number-with-prefix :deep(.performance-select-shell__selector.invite-settings-prefix-select:hover),.invite-settings-number-with-prefix :deep(.performance-select-shell.is-open .performance-select-shell__selector.invite-settings-prefix-select){border-color:var(--color-primary)}.invite-settings-number-with-prefix :deep(.performance-select-shell__tag){color:var(--color-text-primary)}.invite-settings-number-with-prefix :deep(.performance-select-shell__tag-content){overflow:visible}.invite-settings-number-with-prefix :deep(.performance-number-input){border-radius:0 var(--radius-md) var(--radius-md) 0}.invite-settings-prefix-option{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;width:calc(100% - 6px);min-height:74px;margin:1px 3px;padding:4px 8px;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--color-text-primary);font:400 var(--font-size-md)/22px var(--font-sans);text-align:left;cursor:pointer}.invite-settings-prefix-option[aria-selected="true"]{background:rgba(31,35,41,.08);color:var(--color-primary-hover)}.invite-settings-prefix-option[aria-selected="true"] small{color:var(--color-text-placeholder)}.invite-settings-prefix-option--limit{color:var(--color-text-primary);cursor:pointer}.invite-settings-prefix-option>span{display:flex;flex-direction:column;min-width:0}.invite-settings-prefix-option small{color:var(--color-text-placeholder);font:inherit;white-space:normal}.invite-settings-prefix-option svg{flex:0 0 12px;align-self:center;color:var(--color-primary-hover)}.invite-settings-prefix-option--disabled{color:var(--color-border);cursor:not-allowed}.invite-settings-prefix-option--disabled small{color:var(--color-border)}.invite-settings-required{margin-left:var(--spacing-1);color:var(--color-text-danger-strong)}.invite-settings-error{display:block;margin-top:var(--spacing-1);color:var(--performance-field-error-color);font-size:var(--performance-field-error-font-size);line-height:var(--performance-field-error-line-height)}.invite-settings-second-prompt{margin-top:var(--spacing-2)}.invite-settings-checkbox-line{display:flex;align-items:center;gap:var(--spacing-2);min-height:22px;color:var(--color-text-primary);font-size:14px;line-height:22px}.invite-settings-checkbox-line input{width:16px;height:16px;margin:0;accent-color:var(--color-primary-hover)}.invite-settings-checkbox-line--disabled{color:var(--color-text-placeholder)}.invite-settings-role-list{display:flex;flex-direction:column;gap:var(--spacing-2);margin-left:24px}.invite-settings-option{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:5px 10px;border:0;background:transparent;color:var(--color-text-primary);font:400 14px/22px var(--font-sans);text-align:left;cursor:pointer}.invite-settings-option:hover{background:var(--color-bg-page)}.invite-settings-option__checkbox{display:grid;place-items:center;width:16px;height:16px;box-sizing:border-box;border:1px solid var(--color-border);border-radius:var(--radius-sm);color:var(--color-bg-card);font-size:12px}.invite-settings-option__checkbox.is-selected{border-color:var(--color-primary-hover);background:var(--color-primary-hover)}.invite-settings-drawer__body :deep(.performance-drawer__body){overflow:auto;padding:24px 24px 40px;box-sizing:border-box}@media (max-width:700px){.invite-settings-drawer__body :deep(.performance-drawer__panel){width:min(680px,100vw)!important}.invite-settings-surface{padding:var(--spacing-3)}.invite-settings-section--spaced{margin-top:var(--spacing-6)}}
</style>
