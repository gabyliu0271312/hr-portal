<template>
  <header class="self-summary-header">
    <button class="back-button" type="button" aria-label="返回" @click="$emit('back')">
      <SpaceLeftOutlinedIcon class="back-icon" />
    </button>
    <span class="person-avatar" aria-hidden="true">{{ initial }}</span>
    <div class="person-info">
      <strong>{{ person.display_name }}</strong>
      <span v-if="profileParts.length" class="person-meta">
        <template v-for="(part, index) in profileParts" :key="`${part}-${index}`">
          <span class="person-meta__value">{{ part }}</span>
          <i v-if="index < profileParts.length - 1" class="person-meta__separator" aria-hidden="true"></i>
        </template>
      </span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SelfSummaryPerson } from '@/api/performance'
import SpaceLeftOutlinedIcon from '@/components/performance/SpaceLeftOutlinedIcon.vue'

const props = defineProps<{ person: SelfSummaryPerson }>()
defineEmits<{ back: [] }>()
const initial = computed(() => props.person.display_name.trim().slice(0, 1) || '我')
const profileParts = computed(() => Array.isArray(props.person.profile_fields)
  ? props.person.profile_fields.map(field => field.value).filter(Boolean)
  : [props.person.department, props.person.direct_supervisor_name].filter(Boolean))
</script>

<style scoped>
.self-summary-header{display:flex;min-height:64px;flex:none;align-items:center;padding:10px 20px 10px 16px;box-sizing:border-box;border-bottom:1px solid var(--color-line-divider);background:var(--color-bg-card);color:var(--color-text-primary)}
.back-button{display:flex;width:28px;height:24px;flex:0 0 28px;align-items:center;justify-content:center;margin-right:16px;padding:2px 4px;box-sizing:border-box;border:0;border-radius:0;background:transparent;color:inherit;cursor:pointer;font:600 16px/24px var(--font-sans)}
.back-button:hover{background:var(--color-bg-hover)}
.back-button:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.back-icon{display:block;width:20px;height:20px;flex:0 0 20px;color:inherit;line-height:20px}
.person-avatar{display:grid;width:40px;height:40px;flex:0 0 40px;place-items:center;border-radius:50%;background:var(--color-primary-light);color:var(--color-primary);font-size:14px;font-weight:600}
.person-info{min-width:0;margin-left:12px}
.person-info strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-text-primary);font-size:16px;line-height:24px}
.person-meta{display:flex;align-items:center;min-width:0;max-width:100%;color:var(--color-text-secondary);font-size:14px;line-height:20px}
.person-meta__value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.person-meta__separator{display:inline-block;width:1px;height:16px;flex:0 0 1px;margin:2px 8px;background:var(--color-line-divider)}
@media(max-width:640px){.self-summary-header{padding-inline:16px}.back-button{margin-right:10px}.person-info{margin-left:10px}.person-meta{flex-wrap:wrap;row-gap:4px}.person-meta__value{white-space:normal;overflow-wrap:anywhere}.person-meta__separator{margin-inline:6px}}
</style>
