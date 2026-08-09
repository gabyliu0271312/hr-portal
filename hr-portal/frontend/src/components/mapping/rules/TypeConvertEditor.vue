<template>
  <div class="rule-editor">
    <el-form label-width="90px" size="small">
      <el-row :gutter="12">
        <el-col :span="8">
          <el-form-item label="来源字段">
            <el-select
              v-model="rule.sourceFields[0]"
              filterable
              allow-create
              placeholder="选择来源字段"
              @change="changed"
            >
              <el-option
                v-for="field in sourceFields"
                :key="field.code"
                :label="field.label || field.code"
                :value="field.code"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="目标字段">
            <el-select
              v-model="rule.targetFields[0]"
              filterable
              allow-create
              placeholder="选择目标字段"
              @change="changed"
            >
              <el-option
                v-for="field in targetFields"
                :key="field.code"
                :label="field.label || field.code"
                :value="field.code"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="目标类型">
            <el-select v-model="config.targetType" @change="changed">
              <el-option label="字符串" value="string" />
              <el-option label="数字" value="number" />
              <el-option label="整数" value="integer" />
              <el-option label="布尔值" value="boolean" />
              <el-option label="日期" value="date" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="失败策略">
        <el-radio-group v-model="config.onError" @change="changed">
          <el-radio value="keep">保留原值</el-radio>
          <el-radio value="set_null">置空</el-radio>
          <el-radio value="flag">标记异常</el-radio>
          <el-radio value="reject">拒绝该行</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  rule: any
  sourceFields: Array<{ code: string; label: string; type?: string }>
  targetFields: Array<{ code: string; label: string; type?: string }>
  policy: any
}>()

const emit = defineEmits<{ change: [] }>()
const rule = props.rule
const sourceFields = props.sourceFields || []
const targetFields = props.targetFields || []
const config = computed(() => rule.config)

if (!Array.isArray(rule.sourceFields)) rule.sourceFields = []
if (!Array.isArray(rule.targetFields)) rule.targetFields = []
if (!rule.config) rule.config = { targetType: 'string', onError: 'reject' }

function changed() {
  emit('change')
}
</script>

<style scoped>
.rule-editor {
  padding: 4px 0;
}
</style>
