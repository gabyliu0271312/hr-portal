<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { treesApi, type TreeNode } from '@/api/data'
import { useUserStore } from '@/stores/user'

const props = defineProps<{
  modelValue: boolean
  mode?: 'create' | 'edit' | 'addChild'
  initial?: { id: number; name: string; code: string; parent_id: number | null }
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [node: TreeNode]; updated: [node: TreeNode] }>()
const store = useUserStore()
const name = ref(''), code = ref(''), parentId = ref<number | undefined>()
const nodes = ref<TreeNode[]>([])
const pending = ref(false), loading = ref(false), error = ref(''), parentError = ref('')
const nameError = ref(''), codeError = ref('')
let generation = 0
onBeforeUnmount(() => { ++generation })
const title = computed(() => props.mode === 'edit' ? '编辑成本中心' : props.mode === 'addChild' ? '添加子成本中心' : '新建成本中心')
const canCreate = computed(() => store.hasOp('people.cost_center', props.mode === 'edit' ? 'U' : 'C'))
const disabled = computed(() => pending.value || loading.value || Boolean(parentError.value) || !canCreate.value)
const parentOptions = computed(() => {
  const walk = (list: TreeNode[], blocked = false): any[] => list.map(node => ({
    value: node.id, label: `${node.name}（${node.code}）`, disabled: blocked || !node.is_active,
    children: walk(node.children, blocked || !node.is_active),
  }))
  return walk(nodes.value)
})
function message(cause: any) {
  const detail = cause?.response?.data?.detail
  return (typeof detail === 'string' ? detail : detail?.message) || '保存失败，请重试。'
}
async function loadParents() {
  const current = ++generation
  loading.value = true; parentError.value = ''; nodes.value = []
  try {
    const data = await treesApi.costCenterDirectory(true)
    if (current === generation) {
      nodes.value = data.tree
      // 数据就绪后再回显上级：el-tree-select 需在 data 中存在对应节点才会显示
      const initial = props.initial
      parentId.value = props.mode === 'addChild'
        ? initial?.id
        : initial?.parent_id ?? undefined
    }
  } catch (cause) { if (current === generation) parentError.value = message(cause) }
  finally { if (current === generation) loading.value = false }
}
watch(() => props.modelValue, opened => {
  ++generation
  if (!opened) return
  const initial = props.initial
  // 添加子：名称/编码是新建子节点的填写项，置空；仅上级带出当前节点
  name.value = props.mode === 'addChild' ? '' : (initial?.name ?? '')
  code.value = props.mode === 'addChild' ? '' : (initial?.code ?? '')
  error.value = ''; nameError.value = ''; codeError.value = ''
  loadParents()
}, { immediate: true })
async function save() {
  if (disabled.value) return
  name.value = name.value.trim()
  if (props.mode === 'create' || props.mode === 'addChild') code.value = code.value.trim()
  nameError.value = !name.value ? '请输入成本中心名称' : name.value.length > 255 ? '名称不能超过255个字符' : ''
  codeError.value = props.mode === 'edit' ? '' : !code.value ? '请输入成本中心编码' : code.value.length > 64 ? '编码不能超过64个字符' : ''
  if (nameError.value || codeError.value) return
  pending.value = true; error.value = ''
  try {
    if (props.mode === 'edit' && props.initial) {
      const node = await treesApi.updateCostCenter(props.initial.id, { name: name.value, parent_id: parentId.value ?? null })
      emit('updated', node)
    } else {
      const node = await treesApi.createCostCenter({ name: name.value, code: code.value, parent_id: parentId.value ?? null })
      emit('created', node)
    }
    emit('update:modelValue', false)
  } catch (cause: any) {
    error.value = message(cause)
    if (cause?.response?.status === 409 && /编码/.test(error.value) && props.mode !== 'edit') codeError.value = error.value
  } finally { pending.value = false }
}
</script>

<template>
  <UiDialogShell :model-value="modelValue" :title="title" :loading="pending" dialog-class="cost-center-create" @update:model-value="emit('update:modelValue', $event)">
    <form id="cost-center-create-form" class="cost-center-form" novalidate @submit.prevent="save">
      <div class="cost-center-form__item">
        <label for="cc-name" class="cost-center-form__label">名称<span class="cost-center-form__required" aria-hidden="true">*</span></label>
        <input id="cc-name" v-model="name" class="cost-center-form__input" placeholder="请输入名称" maxlength="255" required :disabled="pending" :aria-invalid="Boolean(nameError)" :aria-describedby="nameError ? 'cc-name-error' : undefined" @input="nameError = ''" />
        <p v-if="nameError" id="cc-name-error" class="cost-center-form__error">{{ nameError }}</p>
      </div>
      <div class="cost-center-form__item">
        <label for="cc-code" class="cost-center-form__label">编码<span v-if="mode !== 'edit'" class="cost-center-form__required" aria-hidden="true">*</span></label>
        <input id="cc-code" v-model="code" class="cost-center-form__input" placeholder="请输入编码" maxlength="64" required :disabled="pending || mode === 'edit'" :aria-invalid="Boolean(codeError)" :aria-describedby="codeError ? 'cc-code-error' : undefined" @input="codeError = ''" />
        <p v-if="codeError" id="cc-code-error" class="cost-center-form__error">{{ codeError }}</p>
      </div>
      <div class="cost-center-form__item">
        <label for="cc-parent" class="cost-center-form__label">上级成本中心</label>
        <el-tree-select id="cc-parent" v-model="parentId" class="cost-center-form__tree" :data="parentOptions" check-strictly filterable clearable :disabled="pending || loading || Boolean(parentError)" :placeholder="loading ? '正在加载' : '请选择'" popper-class="ui-dialog-tree-popper" />
        <p v-if="parentError" class="cost-center-form__error" role="alert">{{ parentError }}</p>
        <PermissionButton v-if="parentError" menu="people.cost_center" op="V" link @click="loadParents">重新加载成本中心树</PermissionButton>
      </div>
      <p v-if="error" class="cost-center-form__error" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <div class="cost-center-form__actions">
        <PermissionButton menu="people.cost_center" op="V" :disabled="pending" @click="emit('update:modelValue', false)">取消</PermissionButton>
        <PermissionButton menu="people.cost_center" :op="mode === 'edit' ? 'U' : 'C'" type="primary" :disabled="disabled" :loading="pending" @click="save">确定</PermissionButton>
      </div>
    </template>
  </UiDialogShell>
</template>

<style scoped>
.cost-center-form { display: flex; flex-direction: column; gap: var(--ui-form-item-gap); }
.cost-center-form__item { display: flex; flex-direction: column; min-width: 0; gap: 0; }
.cost-center-form__label { display: flex; align-items: flex-start; min-height: var(--ui-form-label-height); box-sizing: border-box; padding-bottom: var(--ui-form-label-gap); gap: var(--ui-form-required-gap); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: var(--ui-form-label-weight); line-height: var(--ui-form-label-line-height); }
.cost-center-form__required, .cost-center-form__error { color: var(--color-text-danger-strong); }
.cost-center-form__input { width: 100%; height: var(--control-height); box-sizing: border-box; padding: var(--spacing-1) var(--input-padding-x); border: var(--ui-control-border-width) solid var(--control-border); border-radius: var(--ui-form-field-radius); background: var(--color-bg-card); color: var(--color-text-primary); font: inherit; font-size: var(--font-size-md); line-height: var(--input-line-height); outline: none; }
.cost-center-form__input::placeholder { color: var(--color-text-placeholder); }
.cost-center-form__input:focus { border-color: var(--control-focus-border); }
.cost-center-form__input[aria-invalid="true"] { border-color: var(--color-text-danger-strong); }
.cost-center-form__input:disabled { background: var(--color-surface-disabled); cursor: not-allowed; }
.cost-center-form__tree { width: 100%; --el-component-size: var(--control-height); --el-border-radius-base: var(--ui-form-field-radius); --el-border-color: var(--control-border); --el-color-primary: var(--control-focus-border); }
.cost-center-form__error { margin: 0; font-size: var(--font-size-sm); line-height: var(--ui-form-label-line-height); }
.cost-center-form__actions { display: flex; justify-content: flex-end; gap: var(--ui-dialog-footer-gap); }
.cost-center-form__actions :deep(.el-button) { margin: 0; min-width: var(--performance-button-min-width); height: var(--control-height); border-radius: var(--button-radius); }
</style>
