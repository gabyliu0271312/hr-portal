import { config } from '@vue/test-utils'

config.global.stubs = {
  'el-alert': { template: '<div><slot /></div>' },
  'el-button': { template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>', props: ['disabled', 'loading'] },
  'el-icon': { template: '<i><slot /></i>' },
  'el-tag': { template: '<span><slot /></span>' },
}
