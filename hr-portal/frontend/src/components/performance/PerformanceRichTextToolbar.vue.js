/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
const __VLS_props = withDefaults(defineProps(), { readonly: false, active: () => ({}) });
const __VLS_emit = defineEmits();
const commands = [
    { key: 'bold', label: '粗体', title: '粗体(Ctrl+B)', markdown: 'Markdown: **文本** 空格', icon: 'BoldOutlined' }, { key: 'italic', label: '斜体', title: '斜体(Ctrl+I)', markdown: 'Markdown: *文本* 空格', icon: 'ItalicOutlined' }, { key: 'underline', label: '下划线', title: '下划线(Ctrl+U)', markdown: 'Markdown: ~文本~ 空格', icon: 'UnderlineOutlined' }, { key: 'insertOrderedList', label: '有序列表', title: '有序列表(Ctrl+Shift+7)', markdown: 'Markdown: 1. 空格', icon: 'OrderListOutlined' }, { key: 'insertUnorderedList', label: '无序列表', title: '无序列表(Ctrl+Shift+8)', markdown: 'Markdown: - 空格', icon: 'DisorderListOutlined' }, { key: 'link', label: '超链接', title: '超链接(Ctrl+K)', icon: 'GlobalLinkOutlined' },
];
const paths = {
    bold: 'M5 2.709C5 2.317 5.317 2 5.709 2h6.734a5.317 5.317 0 0 1 3.686 9.148 5.671 5.671 0 0 1-2.623 10.7H5.71a.709.709 0 0 1-.71-.707V2.71Zm2 7.798h5.443a3.19 3.19 0 0 0 3.19-3.19c0-1.762-1.428-3.317-3.19-3.317H7v6.507Zm0 2.126v7.09h6.507a3.544 3.544 0 0 0 0-7.09H7Z', italic: 'M14.825 5.077 11.19 18.923h4.052a1.038 1.038 0 1 1 0 2.077H4.954a1.038 1.038 0 1 1 0-2.077h4.053l3.636-13.846H8.591A1.038 1.038 0 1 1 8.59 3h10.287a1.038 1.038 0 0 1 0 2.077h-4.053Z', underline: 'M7.361 3.052a.99.99 0 0 0-.989-.994.998.998 0 0 0-.999.994v5.765c0 4.205 2.601 7.29 6.627 7.29s6.627-3.085 6.627-7.29V3.052a.996.996 0 0 0-.996-.994.992.992 0 0 0-.992.994v5.765c0 3.003-1.763 5.302-4.639 5.302-2.876 0-4.639-2.299-4.639-5.302V3.052ZM3.054 19.42a.988.988 0 0 0-.994.988 1 1 0 0 0 .994 1h17.892a.988.988 0 0 0 .994-1.002.987.987 0 0 0-.994-.986H3.054Z',
    insertOrderedList: 'M4.577 1.809a.543.543 0 0 0-.819-.469l-.502.296-.004.003-.309.187c-.342.207-.858.519-1.142.701a.573.573 0 0 0-.261.485c0 .482.544.774.948.522.227-.141.465-.287.642-.395v3.478a.723.723 0 1 0 1.447 0V1.81Zm-.899 7.128c-1.233 0-2.056.817-2.056 1.84a.25.25 0 0 0 .25.251h.891a.259.259 0 0 0 .26-.259c0-.32.227-.589.608-.589a.62.62 0 0 1 .428.15.52.52 0 0 1 .16.396c0 .315-.188.579-.538.949l-1.815 1.968a.672.672 0 0 0 .494 1.127h3.003a.63.63 0 0 0 0-1.26H3.744l.933-1.047c.61-.652.99-1.127.99-1.834a1.57 1.57 0 0 0-.563-1.226c-.356-.3-.852-.466-1.426-.466Zm.015 7.429c-1.006 0-1.692.478-1.946 1.178a.541.541 0 0 0 .107.553c.122.137.307.22.503.22a.773.773 0 0 0 .478-.18c.125-.098.23-.222.312-.33.096-.124.257-.224.511-.224.21 0 .37.063.472.152a.46.46 0 0 1 .16.359v.002a.503.503 0 0 1-.165.391.71.71 0 0 1-.483.16h-.14a.606.606 0 1 0 0 1.213h.168c.275 0 .468.074.59.178a.538.538 0 0 1 .186.42.554.554 0 0 1-.185.435c-.122.107-.314.184-.583.184-.32 0-.528-.114-.644-.264a1.776 1.776 0 0 0-.308-.323.766.766 0 0 0-.47-.174.678.678 0 0 0-.504.22.549.549 0 0 0-.114.55c.244.717.926 1.22 2.012 1.22.602 0 1.161-.168 1.575-.478.416-.311.683-.768.676-1.323-.01-.69-.376-1.122-.793-1.332.34-.231.63-.644.621-1.224-.019-.962-.92-1.583-2.036-1.583ZM8 4a1 1 0 0 1 1-1h13a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1Zm0 8a1 1 0 0 1 1-1h13a1 1 0 0 1 0 2H9a1 1 0 0 1-1-1Zm0 8a1 1 0 0 1 1-1h13a1 1 0 0 1 0 2H9a1 1 0 0 1-1-1Z',
    insertUnorderedList: 'M3.5 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM9 3a1 1 0 0 0 0 2h13a1 1 0 1 0 0-2H9Zm0 8a1 1 0 1 0 0 2h13a1 1 0 1 0 0-2H9Zm-1 9a1 1 0 0 1 1-1h13a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1Zm-3-8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
    link: 'M18.849 2.699a5.037 5.037 0 0 0-7.1.97L8.97 7.372a4.784 4.784 0 0 0 .957 6.699l.972.729a1 1 0 0 0 1.2-1.6l-.972-.73a2.784 2.784 0 0 1-.557-3.898l2.777-3.703a3.037 3.037 0 1 1 4.8 3.72l-1.429 1.786a1 1 0 1 0 1.562 1.25l1.43-1.788a5.037 5.037 0 0 0-.862-7.138ZM5.152 21.301a5.037 5.037 0 0 0 7.1-.97l2.777-3.703a4.784 4.784 0 0 0 .957-6.699L13.1 9.2a1 1 0 0 0-1.2 1.6l.973.73a2.784 2.784 0 0 0 .556 3.898l-2.777 3.703a3.037 3.037 0 1 1-4.8-3.72l1.429-1.786a1 1 0 0 0-1.562-1.25l-1.43 1.787a5.037 5.037 0 0 0 .863 7.14Z',
};
const tooltip = ref(null);
function showTooltip(command, event) { const r = event.currentTarget.getBoundingClientRect(); tooltip.value = { title: command.title, markdown: command.markdown, x: r.left + r.width / 2, y: r.top - 10 }; }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ readonly: false, active: () => ({}) });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-toolbar-tooltip']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-rich-toolbar" },
    ...{ class: ({ 'is-readonly': __VLS_ctx.readonly }) },
    role: (__VLS_ctx.readonly ? undefined : 'toolbar'),
});
for (const [command] of __VLS_getVForSourceType((__VLS_ctx.commands))) {
    (command.key);
    if (__VLS_ctx.readonly) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "rich-toolbar-icon" },
            'data-icon': (command.icon),
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'data-icon': (command.icon),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: (__VLS_ctx.paths[command.key]),
            fill: "currentColor",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onMousedown: (...[$event]) => {
                    if (!!(__VLS_ctx.readonly))
                        return;
                    __VLS_ctx.$emit('before-command', command.key);
                } },
            ...{ onMouseenter: (...[$event]) => {
                    if (!!(__VLS_ctx.readonly))
                        return;
                    __VLS_ctx.showTooltip(command, $event);
                } },
            ...{ onMouseleave: (...[$event]) => {
                    if (!!(__VLS_ctx.readonly))
                        return;
                    __VLS_ctx.tooltip = null;
                } },
            ...{ onFocus: (...[$event]) => {
                    if (!!(__VLS_ctx.readonly))
                        return;
                    __VLS_ctx.showTooltip(command, $event);
                } },
            ...{ onBlur: (...[$event]) => {
                    if (!!(__VLS_ctx.readonly))
                        return;
                    __VLS_ctx.tooltip = null;
                } },
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.readonly))
                        return;
                    __VLS_ctx.$emit('command', command.key);
                } },
            type: "button",
            ...{ class: ({ active: !!__VLS_ctx.active[command.key] }) },
            'plugin-key': (command.key === 'link' ? 'hyperlink' : command.key),
            'plugin-disabled': "false",
            'data-icon': (command.icon),
            'aria-label': (command.label),
            'aria-pressed': (!!__VLS_ctx.active[command.key]),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            viewBox: "0 0 24 24",
            'data-icon': (command.icon),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: (__VLS_ctx.paths[command.key]),
            fill: "currentColor",
        });
    }
}
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (__VLS_ctx.tooltip) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rich-toolbar-tooltip" },
        role: "tooltip",
        ...{ style: ({ left: `${__VLS_ctx.tooltip.x}px`, top: `${__VLS_ctx.tooltip.y}px` }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ud__tooltip-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    (__VLS_ctx.tooltip.title);
    if (__VLS_ctx.tooltip.markdown) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (__VLS_ctx.tooltip.markdown);
    }
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['performance-rich-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-toolbar-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-toolbar-tooltip']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__tooltip-content']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            commands: commands,
            paths: paths,
            tooltip: tooltip,
            showTooltip: showTooltip,
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
