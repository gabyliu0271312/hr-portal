/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { defineComponent, h } from 'vue';
function fieldValue(fields, code) {
    const field = fields.find((item) => item.code === code);
    return field?.value;
}
function profileHeader(data) {
    const fields = data.fields || [];
    const employeeNo = data.employee_no || fieldValue(fields, 'employee_no');
    const employeeName = data.full_name || fieldValue(fields, 'full_name');
    if (employeeNo && employeeName)
        return `${employeeNo} -- ${employeeName}`;
    return employeeName || employeeNo || '\u5458\u5de5\u57fa\u7840\u4fe1\u606f';
}
function detailFields(fields) {
    return fields.filter((field) => field.code !== 'full_name' && field.code !== 'employee_no');
}
function fieldNode(field, className) {
    return h('div', { class: className }, [
        h('dt', null, `${field.label}\uff1a`),
        h('dd', null, field.value),
    ]);
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
                const fields = props.result.data.fields || [];
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
                ]);
            }
            return h('section', { class: 'employee-profile-card', 'aria-label': 'employee-profile-candidates' }, [
                h('div', { class: 'employee-profile-candidates' }, props.result.data.candidates.map((candidate) => h('div', { class: 'employee-profile-candidate' }, [
                    h('dl', null, candidate.display_fields.map((field) => fieldNode(field, 'employee-profile-candidate-field'))),
                    h('button', {
                        class: 'employee-profile-select',
                        type: 'button',
                        disabled: props.loading,
                        onClick: () => emit('select', candidate.selection_handle),
                    }, '\u9009\u62e9\u8be5\u5458\u5de5'),
                ]))),
            ]);
        };
    },
});
debugger; /* PartiallyEnd: #3632/script.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['employee-profile-field']} */ ;
/** @type {__VLS_StyleScopedClasses['employee-profile-candidate']} */ ;
/** @type {__VLS_StyleScopedClasses['employee-profile-select']} */ ;
/** @type {__VLS_StyleScopedClasses['employee-profile-field']} */ ;
/** @type {__VLS_StyleScopedClasses['employee-profile-candidate']} */ ;
let __VLS_self;
