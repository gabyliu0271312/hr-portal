import { computed } from 'vue';
const props = withDefaults(defineProps(), { disabled: false, peopleOptions: () => [], error: '' });
const emit = defineEmits();
const roleOrder = ['REAL_LINE_MANAGER', 'HRBP', 'DEPARTMENT_HEAD', 'SPECIFIED_PERSON'];
const roleLabels = { REAL_LINE_MANAGER: '实线上级', HRBP: 'HRBP', DEPARTMENT_HEAD: '部门负责人', SPECIFIED_PERSON: '指定人员' };
const managerLevels = [{ value: 'DIRECT_MANAGER', label: '直属上级' }, { value: 'LEVEL_1_MANAGER', label: '隔 1 级上级' }];
const departmentLevels = [{ value: 'CURRENT_DEPARTMENT', label: '所属部门负责人' }, { value: 'PARENT_DEPARTMENT', label: '隔级部门负责人' }, { value: 'LEVEL_1_DEPARTMENT', label: '所属一级部门负责人' }];
const roles = computed(() => props.modelValue.roles);
const people = computed(() => (roles.value.find((role) => role.type === 'SPECIFIED_PERSON')?.people || []));
const selectedPersonNo = computed(() => people.value[0]?.employee_no || '');
const departmentLevel = computed(() => (roles.value.find((role) => role.type === 'DEPARTMENT_HEAD')?.levels[0] || 'CURRENT_DEPARTMENT'));
function hasRole(type) { return roles.value.some((role) => role.type === type); }
function hasLevel(type, value) { const role = roles.value.find((item) => item.type === type); return !!role && 'levels' in role && role.levels.includes(value); }
function update(nextRoles) { emit('update:modelValue', { mode: 'MULTI_ROLE', roles: nextRoles }); }
function toggleRole(type, checked) {
    const next = roles.value.filter((role) => role.type !== type);
    if (checked) {
        next.push(type === 'HRBP' ? { type } : type === 'REAL_LINE_MANAGER' ? { type, levels: ['DIRECT_MANAGER'] } : type === 'DEPARTMENT_HEAD' ? { type, levels: ['CURRENT_DEPARTMENT'] } : { type, people: props.peopleOptions.slice(0, 1) });
    }
    update(next);
}
function toggleLevel(type, value, checked) {
    const role = roles.value.find((item) => item.type === type);
    if (!role)
        return;
    const levels = checked ? [...new Set([...role.levels, value])] : role.levels.filter((item) => item !== value);
    update(roles.value.map((item) => item.type === type ? { type, levels } : item));
}
function setDepartmentLevel(value) { update(roles.value.map((item) => item.type === 'DEPARTMENT_HEAD' ? { type: item.type, levels: [value] } : item)); }
function setPerson(employeeNo) { const person = props.peopleOptions.find((item) => item.employee_no === employeeNo); if (!person)
    return; update(roles.value.map((item) => item.type === 'SPECIFIED_PERSON' ? { type: item.type, people: [person] } : item)); }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ disabled: false, peopleOptions: () => [], error: '' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['check-wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['nested-select']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "multi-executor-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "multi-executor-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "required-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "multi-executor-help" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "executor-role-list" },
});
for (const [role] of __VLS_getVForSourceType((__VLS_ctx.roleOrder))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (role),
        ...{ class: "executor-role" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "check-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (...[$event]) => {
                __VLS_ctx.toggleRole(role, $event.target.checked);
            } },
        ...{ class: "sr-input" },
        type: "checkbox",
        checked: (__VLS_ctx.hasRole(role)),
        disabled: (__VLS_ctx.disabled),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "check-wallpaper" },
        ...{ class: ({ checked: __VLS_ctx.hasRole(role) }) },
        'aria-hidden': "true",
    });
    if (__VLS_ctx.hasRole(role)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "12",
            height: "12",
            viewBox: "0 0 12 12",
            fill: "none",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z",
            fill: "currentColor",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.roleLabels[role]);
    if (role === 'REAL_LINE_MANAGER' && __VLS_ctx.hasRole(role)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "nested-options" },
        });
        for (const [level] of __VLS_getVForSourceType((__VLS_ctx.managerLevels))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                key: (level.value),
                ...{ class: "check-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                ...{ onChange: (...[$event]) => {
                        if (!(role === 'REAL_LINE_MANAGER' && __VLS_ctx.hasRole(role)))
                            return;
                        __VLS_ctx.toggleLevel(role, level.value, $event.target.checked);
                    } },
                ...{ class: "sr-input" },
                type: "checkbox",
                checked: (__VLS_ctx.hasLevel(role, level.value)),
                disabled: (__VLS_ctx.disabled),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "check-wallpaper" },
                ...{ class: ({ checked: __VLS_ctx.hasLevel(role, level.value) }) },
                'aria-hidden': "true",
            });
            if (__VLS_ctx.hasLevel(role, level.value)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                    width: "12",
                    height: "12",
                    viewBox: "0 0 12 12",
                    fill: "none",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                    d: "M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z",
                    fill: "currentColor",
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (level.label);
        }
    }
    if (role === 'DEPARTMENT_HEAD' && __VLS_ctx.hasRole(role)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "nested-select" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            ...{ onChange: (...[$event]) => {
                    if (!(role === 'DEPARTMENT_HEAD' && __VLS_ctx.hasRole(role)))
                        return;
                    __VLS_ctx.setDepartmentLevel($event.target.value);
                } },
            value: (__VLS_ctx.departmentLevel),
            disabled: (__VLS_ctx.disabled),
            'aria-label': "部门负责人层级",
        });
        for (const [level] of __VLS_getVForSourceType((__VLS_ctx.departmentLevels))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                key: (level.value),
                value: (level.value),
            });
            (level.label);
        }
    }
    if (role === 'SPECIFIED_PERSON' && __VLS_ctx.hasRole(role)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "nested-select" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
            ...{ onChange: (...[$event]) => {
                    if (!(role === 'SPECIFIED_PERSON' && __VLS_ctx.hasRole(role)))
                        return;
                    __VLS_ctx.setPerson($event.target.value);
                } },
            value: (__VLS_ctx.selectedPersonNo),
            disabled: (__VLS_ctx.disabled || __VLS_ctx.peopleOptions.length === 0),
            'aria-label': "指定人员",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            value: "",
        });
        for (const [person] of __VLS_getVForSourceType((__VLS_ctx.peopleOptions))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                key: (person.employee_no),
                value: (person.employee_no),
            });
            (person.display_name);
        }
        if (__VLS_ctx.people.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "selected-people" },
            });
            (__VLS_ctx.people.map((person) => person.display_name).join('、'));
        }
    }
}
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "executor-error" },
    });
    (__VLS_ctx.error);
}
/** @type {__VLS_StyleScopedClasses['multi-executor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['multi-executor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['multi-executor-help']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-role-list']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-role']} */ ;
/** @type {__VLS_StyleScopedClasses['check-row']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-input']} */ ;
/** @type {__VLS_StyleScopedClasses['check-wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['nested-options']} */ ;
/** @type {__VLS_StyleScopedClasses['check-row']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-input']} */ ;
/** @type {__VLS_StyleScopedClasses['check-wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['nested-select']} */ ;
/** @type {__VLS_StyleScopedClasses['nested-select']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-people']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-error']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            roleOrder: roleOrder,
            roleLabels: roleLabels,
            managerLevels: managerLevels,
            departmentLevels: departmentLevels,
            people: people,
            selectedPersonNo: selectedPersonNo,
            departmentLevel: departmentLevel,
            hasRole: hasRole,
            hasLevel: hasLevel,
            toggleRole: toggleRole,
            toggleLevel: toggleLevel,
            setDepartmentLevel: setDepartmentLevel,
            setPerson: setPerson,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
