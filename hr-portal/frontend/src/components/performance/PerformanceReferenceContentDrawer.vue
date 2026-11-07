<template>
  <UiDrawerShell :model-value="open" title="选择参考内容" width="var(--drawer-wide-width)" variant="captured" body-class="performance-drawer__body--flush" :keyboard="false" @close="close('cancel')">
        <div class="reference-drawer__content">
          <div class="reference-drawer__scroll">
            <section class="reference-drawer__group">
              <h3 class="reference-drawer__group-title">评估环节内容</h3>
              <div class="reference-drawer__list">
                  <PerformanceContentOptionCard v-for="option in nodeCandidates" :key="option.value" tag="label" class="reference-option-card" :class="{ 'reference-option-card--checked': selectedValues.includes(option.value) }">
                    <template #leading>
                      <span class="reference-option-card__checkbox" aria-hidden="true">
                        <span class="reference-option-card__wallpaper" :class="{ 'reference-option-card__wallpaper--checked': selectedValues.includes(option.value) }">
                          <svg v-if="selectedValues.includes(option.value)" width="12" height="12" viewBox="0 0 12 12" fill="none" class="reference-option-card__checked-svg"><path d="M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z" fill="currentColor"></path></svg>
                        </span>
                      </span>
                      <input class="reference-option-card__input" type="checkbox" :value="option.value" :checked="selectedValues.includes(option.value)" @change="toggle(option.value)" />
                    </template>
                    <span class="reference-option-card__text">{{ option.label }}</span>
                  </PerformanceContentOptionCard>
              </div>
            </section>
            <section class="reference-drawer__group">
              <h3 class="reference-drawer__group-title">更多参考内容</h3>
              <div class="reference-drawer__list">
                  <label v-for="option in moreOptions" :key="option.value" class="reference-option-card reference-option-card--legacy reference-option-card--multiline" :class="{ 'reference-option-card--checked': selectedValues.includes(option.value) }">
                  <span class="reference-option-card__checkbox" aria-hidden="true">
                    <span class="reference-option-card__wallpaper" :class="{ 'reference-option-card__wallpaper--checked': selectedValues.includes(option.value) }">
                      <svg v-if="selectedValues.includes(option.value)" width="12" height="12" viewBox="0 0 12 12" fill="none" class="reference-option-card__checked-svg"><path d="M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z" fill="currentColor"></path></svg>
                    </span>
                  </span>
                  <input class="reference-option-card__input" type="checkbox" :value="option.value" :checked="selectedValues.includes(option.value)" @change="toggle(option.value)" />
                  <span class="reference-option-card__body">
                    <span class="reference-option-card__text">{{ option.label }}</span>
                    <span class="reference-option-card__description" v-if="option.description">{{ option.description }}</span>
                  </span>
                </label>
              </div>
            </section>
          </div>
          <footer class="reference-drawer__footer">
            <button class="reference-drawer__confirm" type="button" @click="$emit('confirm', [...selectedValues])">确认</button>
            <button class="reference-drawer__cancel" type="button" @click="close('cancel')">取消</button>
          </footer>
        </div>
  </UiDrawerShell>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import PerformanceContentOptionCard from './PerformanceContentOptionCard.vue'
import UiDrawerShell from '../ui/UiDrawerShell.vue'

export interface ReferenceOption {
  value: string
  label: string
  description?: string
}

const props = defineProps<{
  open: boolean
  nodeCandidates: ReferenceOption[]
  moreOptions: ReferenceOption[]
  selected?: string[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [selected: string[]]
  cancel: []
}>()

const selectedValues = ref<string[]>([...(props.selected || [])])

watch(() => props.open, (open) => { if (open) selectedValues.value = [...(props.selected || [])] })

function toggle(value: string) {
  selectedValues.value = selectedValues.value.includes(value)
    ? selectedValues.value.filter((item) => item !== value)
    : [...selectedValues.value, value]
}

function close(reason: 'cancel') {
  if (reason === 'cancel') emit('cancel')
  emit('update:open', false)
}
</script>

<style scoped>
.reference-drawer__content { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; }
.reference-drawer__scroll { flex: 1; overflow: auto; padding: var(--spacing-6); box-sizing: border-box; }
.reference-drawer__footer { position: relative; flex-shrink: 0; height: 62px; padding: 10px 0 20px 24px; z-index: 2; box-sizing: border-box; background: var(--color-bg-card); }
.reference-drawer__group + .reference-drawer__group { margin-top: 20px; }
.reference-drawer__group-title { margin: 0 0 12px; font-size: 14px; font-weight: 600; line-height: 22px; color: #1f2329; }
.reference-drawer__list { display: flex; flex-direction: column; gap: var(--performance-content-option-card-list-gap); }

.reference-option-card--legacy { position: relative; display: flex; align-items: center; min-height: 54px; padding: 0 16px; box-sizing: border-box; border: 1px solid #dee0e3; border-radius: 6px; background: transparent; }
.reference-option-card--multiline { min-height: 0; padding-top: 12px; padding-bottom: 12px; }
.reference-option-card:hover { border-color: #3370ff; }
.reference-option-card:hover .reference-option-card__text { color: #3370ff; }
.reference-option-card__input { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }

.reference-option-card__checkbox { position: relative; flex: 0 0 16px; width: 16px; height: 16px; }
.reference-option-card__wallpaper { position: absolute; inset: 0; display: block; box-sizing: border-box; border: 1px solid #8f959e; border-radius: 4px; background: #fff; color: #fff; transition: 0.2s cubic-bezier(0.34, 0.69, 0.1, 1); }
.reference-option-card__wallpaper--checked { border-color: transparent; background: var(--color-primary); }
.reference-option-card__checked-svg { position: absolute; top: 50%; left: 50%; width: 12px; height: 12px; overflow: hidden; transform: translate(-50%, -50%); }

.reference-option-card__text { display: block; margin-left: 12px; font-size: 14px; font-weight: 400; line-height: 21px; color: #1f2329; }
.reference-option-card__body { display: flex; flex-direction: column; min-width: 0; margin-left: 12px; }
.reference-option-card__description { display: block; margin-top: 4px; font-size: 14px; line-height: 21px; color: #646a73; }

.reference-drawer__confirm { display: inline-flex; justify-content: center; align-items: center; min-width: 80px; height: 32px; margin-right: 12px; padding: 4px 11px; box-sizing: border-box; border: 1px solid var(--color-primary); border-radius: 6px; background: var(--color-primary); color: #fff; font-size: 14px; font-weight: 400; line-height: 22px; white-space: nowrap; cursor: pointer; transition: color 0.1s ease-in, background-color 0.1s ease-in, border-color 0.1s ease-in; }
.reference-drawer__confirm:active { background: #0442d2; border-color: #0442d2; }
.reference-drawer__cancel { display: inline-flex; justify-content: center; align-items: center; min-width: 80px; height: 32px; padding: 4px 11px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; font-size: 14px; font-weight: 400; line-height: 22px; white-space: nowrap; cursor: pointer; transition: color 0.1s ease-in, background-color 0.1s ease-in, border-color 0.1s ease-in; }
.reference-drawer__cancel:hover { background: #eff0f1; }
</style>
