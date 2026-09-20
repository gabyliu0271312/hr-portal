/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const __VLS_props = defineProps();
const emit = defineEmits();
const statusLabel = {
    pending: '待完成',
    not_started: '未开始',
    overdue: '已逾期',
};
function formatDeadline(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    const remaining = date.getTime() - Date.now();
    if (remaining > 0) {
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        return `${hours} 小时 ${minutes} 分钟后`;
    }
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function formatStartTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}（GMT+8）`;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['review-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['heading-status']} */ ;
/** @type {__VLS_StyleScopedClasses['heading-status']} */ ;
/** @type {__VLS_StyleScopedClasses['review-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['review-state']} */ ;
/** @type {__VLS_StyleScopedClasses['review-state']} */ ;
/** @type {__VLS_StyleScopedClasses['review-content']} */ ;
/** @type {__VLS_StyleScopedClasses['review-panel']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "review-content" },
    'aria-live': "polite",
});
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "review-state" },
    });
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "review-state error-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.error);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!(__VLS_ctx.error))
                    return;
                __VLS_ctx.emit('retry');
            } },
        type: "button",
    });
}
else if (!__VLS_ctx.node) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "review-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-illustration" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.templateName ? '当前模板暂无可处理节点' : '暂无已启动的绩效评估');
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "review-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    (__VLS_ctx.node.node_name);
    if (__VLS_ctx.node.status === 'not_started' && __VLS_ctx.node.start_at) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "review-deadline" },
        });
        (__VLS_ctx.formatStartTime(__VLS_ctx.node.start_at));
    }
    else if (__VLS_ctx.node.end_at) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "review-deadline" },
        });
        (__VLS_ctx.formatDeadline(__VLS_ctx.node.end_at));
    }
    else if (__VLS_ctx.templateName) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "review-deadline" },
        });
        (__VLS_ctx.templateName);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "review-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "review-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "state-illustration" },
        'aria-hidden': "true",
    });
    if (__VLS_ctx.node.status === 'not_started') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img, __VLS_intrinsicElements.img)({
            src: "/performance-not-started.svg",
            alt: "",
            width: "120",
            height: "121",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            width: "120",
            height: "120",
            viewBox: "0 0 120 120",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M76.543 70.079l-.216-.099-14.469 11.05a4 4 0 01-4.137.438L7.719 57.835c-1.36-.643-1.55-2.502-.347-3.407L21.06 44.142l21.08-36.53a4 4 0 015.175-1.617l51.362 24.281a4 4 0 01.975.65l14.776 13.376a4 4 0 01.781 4.964l-3.377 5.853-18.03 31.225-2.846 15.935c-.276 1.545-2.144 2.185-3.31 1.132l-13.33-12.042a4 4 0 01-1.242-3.746l3.478-17.535-.01-.009z",
            fill: "#BBBFC4",
            'fill-opacity': ".45",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M99.111 30.555a.5.5 0 00-.682.186l-22.1 38.56a.5.5 0 00.867.496l22.1-38.56a.5.5 0 00-.185-.682zM22.65 44.609a.5.5 0 01.663-.244l50.87 23.6a.5.5 0 01-.42.907l-50.87-23.6a.5.5 0 01-.244-.663zm55.94 26.106a.5.5 0 01.706 0l13.63 13.64a.5.5 0 01-.707.707l-13.63-13.64a.5.5 0 010-.707z",
            fill: "#8F959E",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M11.797 85.076c.096.265.382.41.638.324l13.99-4.695a.486.486 0 00.29-.635.515.515 0 00-.637-.324l-13.99 4.695a.486.486 0 00-.29.635zm16.86 8.06a.48.48 0 00.674-.168l3.574-6.425a.523.523 0 00-.194-.694.478.478 0 00-.674.168l-3.574 6.425a.523.523 0 00.194.694zm11.693 5.218a.472.472 0 00.604-.335l1.753-6.816a.53.53 0 00-.356-.63.473.473 0 00-.604.335l-1.753 6.816a.53.53 0 00.356.63zM21.545 15.237c-.237.733-1.515 4.842-2.65 10.987 2.172-9.38 11.841-10.024 18.856-10.958l3.906-6.82C28.54 6.833 22.7 12.754 21.545 15.236z",
            fill: "#0C296E",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M20.423 22.535c.128.519.289 1.031.482 1.538 1.09 2.859 3.17 5.435 5.97 7.907 5.131 4.532 12.937 8.92 22.25 14.157l1.377.774-3.766 4.694c-10.434-5.964-17.9-10.53-22.445-14.687-2.317-2.12-3.805-4.074-4.558-5.983-.74-1.879-.793-3.778-.122-5.87l.812-2.53zm-1.764 2.225c-2.949 9.19 6.726 15.819 28.323 28.137l5.037-6.279a1470.103 1470.103 0 00-2.364-1.33c-16.44-9.246-27.794-15.63-28.564-24.836-.144-1.711.079-3.52.702-5.463l-3.134 9.771zm96.069 61.305c-.439-2.174-7.212-11.455-12.955-13.49l3.138-5.455c5.669 2.65 9.792 7.27 9.799 10.05.007 2.861.064 6.394.018 8.895z",
            fill: "#0C296E",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M83.16 91.966l-.015-6.781c6.087.82 11.591 1.8 19.848 1.244 8.343-.56 11.725-4.535 11.716-8.563l.02 8.528c-.429 2.506-4.331 6.553-11.285 6.832-6.954.28-13.357-.145-20.283-1.26z",
            fill: "#00D6B9",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M66.162 105.194c-4.152-1.24-7.07-2.422-9.09-3.412l-.139-7.075c2.953 1.806 6.434 2.833 9.873 3.745 3.507.93 8.526 2.211 13.766 3.46l.016 6.817c-5.258-1.133-10.572-2.382-14.426-3.535zm18.538 4.352l-.016-6.782c6.088.82 11.592 1.8 19.849 1.245 8.342-.561 11.725-4.535 11.715-8.564l.021 8.529c-.429 2.506-4.331 6.553-11.285 6.832-6.954.279-13.358-.145-20.284-1.26z",
            fill: "#3370FF",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.node.status === 'not_started' ? '暂未启动' : __VLS_ctx.node.status === 'overdue' ? '该环节已逾期' : '暂未填写');
    if (__VLS_ctx.node.status !== 'not_started') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.node))
                        return;
                    if (!(__VLS_ctx.node.status !== 'not_started'))
                        return;
                    __VLS_ctx.emit('open-node', __VLS_ctx.node);
                } },
            type: "button",
            ...{ class: "primary-button" },
        });
    }
}
/** @type {__VLS_StyleScopedClasses['review-content']} */ ;
/** @type {__VLS_StyleScopedClasses['review-state']} */ ;
/** @type {__VLS_StyleScopedClasses['review-state']} */ ;
/** @type {__VLS_StyleScopedClasses['error-state']} */ ;
/** @type {__VLS_StyleScopedClasses['review-state']} */ ;
/** @type {__VLS_StyleScopedClasses['state-illustration']} */ ;
/** @type {__VLS_StyleScopedClasses['review-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['review-deadline']} */ ;
/** @type {__VLS_StyleScopedClasses['review-deadline']} */ ;
/** @type {__VLS_StyleScopedClasses['review-deadline']} */ ;
/** @type {__VLS_StyleScopedClasses['review-body']} */ ;
/** @type {__VLS_StyleScopedClasses['review-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['state-illustration']} */ ;
/** @type {__VLS_StyleScopedClasses['primary-button']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            formatDeadline: formatDeadline,
            formatStartTime: formatStartTime,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
