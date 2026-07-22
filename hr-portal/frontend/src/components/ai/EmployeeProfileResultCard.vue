<script>
import { defineComponent, h } from 'vue'

function fieldValue(fields, code) {
  const field = fields.find((item) => item.code === code)
  return field?.value
}

function profileHeader(data) {
  const fields = data.fields || []
  const employeeNo = data.employee_no || fieldValue(fields, 'employee_no')
  const employeeName = data.full_name || fieldValue(fields, 'full_name')
  if (employeeNo && employeeName) return `${employeeNo} -- ${employeeName}`
  return employeeName || employeeNo || '\u5458\u5de5\u57fa\u7840\u4fe1\u606f'
}

function detailFields(fields) {
  return fields.filter((field) => field.code !== 'full_name' && field.code !== 'employee_no')
}

function fieldNode(field, className) {
  return h('div', { class: className }, [
    h('dt', null, `${field.label}\uff1a`),
    h('dd', null, field.value),
  ])
}

export default defineComponent({
  name: 'EmployeeProfileResultCard',
  props: {
    result: { type: Object, required: true },
    loading: Boolean,
  },
  emits: ['select'],
  setup(props, { emit }) {
    return () => {
      if (props.result.type === 'employee_profile_result') {
        const fields = props.result.data.fields || []
        return h('section', { class: 'employee-profile-card', 'aria-label': 'employee-profile' }, [
          h('header', { class: 'employee-profile-header' }, [
            h('div', { class: 'employee-profile-kicker' }, [
              h('span', { class: 'employee-profile-kicker-mark' }),
              h('span', null, '\u5458\u5de5\u6863\u6848'),
            ]),
            h('h3', { class: 'employee-profile-title' }, profileHeader(props.result.data)),
          ]),
          h('div', { class: 'employee-profile-body' }, [
            h('div', { class: 'employee-profile-section-title' }, [
              h('span', { class: 'employee-profile-section-marker' }),
              h('span', null, '\u57fa\u7840\u8d44\u6599'),
            ]),
            h('dl', { class: 'employee-profile-fields' }, detailFields(fields).map((field) => fieldNode(field, 'employee-profile-field'))),
          ]),
        ])
      }

      return h('section', { class: 'employee-profile-card', 'aria-label': 'employee-profile-candidates' }, [
        h('div', { class: 'employee-profile-candidates' }, props.result.data.candidates.map((candidate) =>
          h('div', { class: 'employee-profile-candidate' }, [
            h('dl', null, candidate.display_fields.map((field) => fieldNode(field, 'employee-profile-candidate-field'))),
            h('button', {
              class: 'employee-profile-select',
              type: 'button',
              disabled: props.loading,
              onClick: () => emit('select', candidate.selection_handle),
            }, '\u9009\u62e9\u8be5\u5458\u5de5'),
          ]),
        )),
      ])
    }
  },
})
</script>

<style scoped>
.employee-profile-card { overflow: hidden; margin-top: 8px; border: 1px solid #d8e6d5; border-radius: 10px; background: #fff; box-shadow: 0 4px 14px rgb(31 93 47 / 7%); }
.employee-profile-header { display: grid; gap: 6px; padding: 15px 16px 14px; background: linear-gradient(120deg, #eefbe9 0%, #dff5dc 100%); border-bottom: 1px solid #d4eccc; }
.employee-profile-kicker { display: inline-flex; align-items: center; gap: 7px; color: #47844d; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
.employee-profile-kicker-mark { width: 7px; height: 7px; border-radius: 50%; background: #62a85a; box-shadow: 0 0 0 4px rgb(98 168 90 / 14%); }
.employee-profile-title { margin: 0; color: #1d6331; font-size: 18px; font-weight: 750; letter-spacing: .01em; line-height: 1.35; }
.employee-profile-body { padding: 14px 16px 12px; }
.employee-profile-section-title { display: inline-flex; align-items: center; gap: 7px; margin-bottom: 5px; color: #252b26; font-size: 14px; font-weight: 700; }
.employee-profile-section-marker { width: 3px; height: 15px; border-radius: 4px; background: #59a356; }
.employee-profile-fields { display: grid; gap: 0; margin: 0; }
.employee-profile-field { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 10px; padding: 11px 2px; border-bottom: 1px solid #edf1ed; }
.employee-profile-field:last-child { border-bottom: 0; }
dt { color: #758078; font-size: 13px; line-height: 1.45; }
dd { margin: 0; overflow-wrap: anywhere; color: #252b26; font-size: 13px; font-weight: 650; line-height: 1.45; }
.employee-profile-candidates { display: grid; gap: 8px; padding: 14px; }
.employee-profile-candidate { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 11px; border: 1px solid #e1ebe0; border-radius: 8px; background: #f9fcf8; }
.employee-profile-candidate dl { display: grid; gap: 4px; min-width: 0; margin: 0; }
.employee-profile-candidate-field { display: flex; gap: 6px; min-width: 0; }
.employee-profile-select { padding: 6px 10px; border: 0; border-radius: 5px; color: #fff; background: #4e964e; cursor: pointer; }
.employee-profile-select:disabled { cursor: not-allowed; opacity: .6; }
@media (max-width: 560px) { .employee-profile-field { grid-template-columns: 80px minmax(0, 1fr); } .employee-profile-candidate { grid-template-columns: 1fr; } }
</style>
