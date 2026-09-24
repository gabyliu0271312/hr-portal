<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    title="设置项目角色"
    width="600px"
    dialog-class="performance-dialog--auto-header"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #description>
      在后台模板配置、前台筛选中选择「项目角色」时，角色顺序将与当前的顺序保持一致。项目角色支持修改名称，修改后，已引用角色的地方将同步展示最新名称。
    </template>

    <div class="project-role-dialog__inner" data-source-state-id="SNAPSPEC-PM-T015-ROLE-EDIT-20260924">
      <div class="project-role-dialog__droppable" data-rbd-droppable-id="pdt-role-config">
        <PerformanceSortableList
          :items="roles"
          item-key="id"
          :gap="8"
          class="project-role-dialog__role-list"
          @reorder="reorderRoles"
        >
          <template #default="{ item: role, index, dragging, itemStyle }">
            <div class="project-role-dialog__role-row" :class="{ 'project-role-dialog__role-row--multiple': roles.length >= 2 }" :data-sortable-index="index" :style="itemStyle">
              <PerformanceDragHandle
                v-if="roles.length >= 2"
                class="project-role-dialog__drag"
                :dragging="dragging"
                :label="`拖拽第${index + 1}个项目角色`"
              />
              <div class="project-role-dialog__role-field">
                <PerformanceTextField
                  v-model="role.name"
                  variant="feishu-input"
                  placeholder="请输入中文角色名称"
                  aria-label="项目角色名称"
                >
                  <template #suffix><span class="project-role-dialog__language-tag">中文</span></template>
                </PerformanceTextField>
                <div class="project-role-dialog__role-error" />
              </div>
              <div v-if="roles.length >= 2" class="project-role-dialog__delete">
                <PerformanceIconButton icon="DeleteTrashOutlined" :label="`删除第${index + 1}个项目角色`" @click="removeRole(role.id)" />
              </div>
            </div>
          </template>
        </PerformanceSortableList>
      </div>
      <PerformanceTextButton class="project-role-dialog__add" label="添加角色" aria-label="添加项目角色" @click="addRole">
        <template #icon><AddOutlinedIcon /></template>
      </PerformanceTextButton>
      <div class="project-role-dialog__language">
        <button class="project-role-dialog__language-button" type="button" aria-label="多语言设置">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="LanguageOutlined" aria-hidden="true">
            <path d="M12 1c6.075 0 11 4.925 11 11s-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1ZM8.66 3.64A9.009 9.009 0 0 0 3.054 11h3.964c.015-3.2.981-6 1.64-7.36ZM20.944 11a9.009 9.009 0 0 0-5.604-7.36C16 5 16.966 8.2 16.98 11h3.964ZM12 3c-1.5 0-3 4.5-2.98 8h5.96C15 7.5 13.5 3 12 3Zm3.34 17.36A9.009 9.009 0 0 0 20.946 13h-3.964c-.015 3.2-.981 6-1.64 7.36ZM3.056 13a9.009 9.009 0 0 0 5.604 7.36C8 19 7.034 15.8 7.02 13H3.055ZM12 21c1.5 0 3-4.5 2.98-8H9.02C9 16.5 10.5 21 12 21Z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>

    <template #footer>
      <div class="project-role-dialog__footer-buttons">
        <button class="project-role-dialog__confirm" type="button" @click="$emit('update:modelValue', false)">确定</button>
        <button class="project-role-dialog__cancel" type="button" @click="$emit('update:modelValue', false)">取消</button>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceDragHandle from './PerformanceDragHandle.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceSortableList from './PerformanceSortableList.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
import PerformanceTextField from './PerformanceTextField.vue'
import AddOutlinedIcon from './AddOutlinedIcon.vue'

const roles = ref<{ id: number; name: string }[]>([])
let nextRoleId = 0

function addRole() {
  roles.value.push({ id: ++nextRoleId, name: '' })
}

function removeRole(id: number) {
  roles.value = roles.value.filter(role => role.id !== id)
}

function reorderRoles(from: number, to: number) {
  if (from === to) return
  const next = roles.value.slice()
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(to, 0, moved)
  roles.value = next
}

defineProps<{ modelValue: boolean }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<style scoped>
.project-role-dialog__inner { min-width: 0; min-height: 62px; max-height: 365px; margin-left: -4px; box-sizing: border-box; color: #1f2329; font: 400 14px/22px var(--font-sans); }
.project-role-dialog__droppable { min-width: 0; min-height: 0; padding-right: 10px; padding-left: 4px; box-sizing: border-box; }
.project-role-dialog__role-row { display: flex; min-width: 0; min-height: 32px; box-sizing: border-box; }
.project-role-dialog__drag, .project-role-dialog__delete { display: none; }
.project-role-dialog__role-row--multiple .project-role-dialog__drag { display: inline-flex; }
.project-role-dialog__role-row--multiple .project-role-dialog__delete { display: flex; }
.project-role-dialog__role-field { min-width: 0; width: 0; flex: 1 1 0%; margin-bottom: 8px; border-radius: 8px; }
.project-role-dialog__role-field :deep(.performance-text-field) { width: 100%; }
.project-role-dialog__role-field :deep(.feishu-input-wrap) { width: 100%; height: 32px; }
.project-role-dialog__role-field :deep(.feishu-input-wrap .native-input) { width: auto; flex: 1 1 auto; min-width: 20px; height: 22px; }
.project-role-dialog__language-tag { display: inline-flex; align-items: center; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: 4px; background: rgba(31,35,41,.1); color: #646a73; font-size: 12px; font-weight: 500; line-height: 20px; white-space: nowrap; }
.project-role-dialog__role-error { min-height: 0; margin-top: 2px; color: #f54a45; font-size: 14px; line-height: 22px; }
.project-role-dialog__delete { display: none; align-items: center; flex: 0 0 48px; height: 32px; margin-top: 4px; outline: 0; }
.project-role-dialog__language-button { display: inline-flex; justify-content: center; align-items: center; min-width: 0; min-height: 0; padding: 2px 4px; box-sizing: border-box; border: 0; border-radius: 6px; background: transparent; color: #3370ff; line-height: 18px; cursor: pointer; transition: color .1s ease-in, background-color .1s ease-in, border-color .1s ease-in; }
.project-role-dialog__add { margin-top: 4px; column-gap: 4px; }
.project-role-dialog__language-button:hover, .project-role-dialog__language-button:focus-visible { outline: 0; background: #f0f5ff; color: #1456f0; }
.project-role-dialog__language { position: absolute; bottom: 24px; left: 20px; width: 96px; height: 22px; box-sizing: border-box; }
.project-role-dialog__language-button { color: #3370ff; }
.project-role-dialog__add :deep(svg) { width: 14px; height: 14px; }
.project-role-dialog__footer-buttons { display: flex; flex-direction: row-reverse; flex-wrap: wrap; overflow: hidden; margin-bottom: -12px; }
.project-role-dialog__confirm, .project-role-dialog__cancel { display: flex; justify-content: center; align-items: center; min-width: 80px; height: 32px; margin-bottom: 12px; margin-left: 12px; padding: 4px 11px; box-sizing: border-box; border-radius: 6px; font: 400 14px/22px var(--font-sans); white-space: nowrap; cursor: pointer; transition: color .1s ease-in, background-color .1s ease-in, border-color .1s ease-in; }
.project-role-dialog__confirm { border: .666667px solid #1456f0; background: #1456f0; color: #fff; }
.project-role-dialog__cancel { border: .666667px solid #d0d3d6; background: #fff; color: #1f2329; }
.project-role-dialog__confirm:hover { background: #3370ff; border-color: #3370ff; }
.project-role-dialog__cancel:hover { background: #f5f6f7; }
.project-role-dialog__confirm:focus-visible, .project-role-dialog__cancel:focus-visible { outline: 2px solid rgba(51,112,255,.35); outline-offset: 1px; }
</style>
