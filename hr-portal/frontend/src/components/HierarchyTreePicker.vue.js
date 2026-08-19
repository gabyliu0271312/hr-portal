/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
/**
 * 通用层级树勾选器 + 每节点"包含下级"开关
 *
 * Props:
 *   modelValue: ScopeSelection[]    勾选的节点 + 包含下级状态
 *   tree:       TreeNode[]          树数据
 *   loading:    boolean
 * Emits:
 *   update:modelValue
 */
import { computed, ref, watch } from 'vue';
import { ElIcon, ElCheckbox, ElSwitch, ElTooltip, ElInput } from 'element-plus';
import { CaretRight, CaretBottom, Search } from '@element-plus/icons-vue';
import { defineComponent, h } from 'vue';
export const TreeNodeRow = defineComponent({
    name: 'TreeNodeRow',
    props: {
        node: { type: Object, required: true },
        depth: { type: Number, required: true },
        expanded: { type: Object, required: true },
        isSelected: { type: Function, required: true },
        includeDesc: { type: Function, required: true },
    },
    emits: ['toggle-select', 'toggle-include', 'toggle-expand'],
    setup(props, { emit }) {
        return () => {
            const isOpen = props.expanded.has(props.node.id);
            const hasChildren = (props.node.children?.length ?? 0) > 0;
            const selected = props.isSelected(props.node);
            return h('div', { class: 'tree-row-wrap' }, [
                h('div', {
                    class: 'tree-row',
                    style: { paddingLeft: `${props.depth * 18}px` },
                }, [
                    h('span', {
                        class: 'tree-toggle',
                        onClick: () => hasChildren && emit('toggle-expand', props.node.id),
                        style: { visibility: hasChildren ? 'visible' : 'hidden' },
                    }, [h(ElIcon, {}, () => h(isOpen ? CaretBottom : CaretRight))]),
                    h(ElCheckbox, {
                        modelValue: selected,
                        'onUpdate:modelValue': (v) => emit('toggle-select', props.node, !!v),
                        size: 'small',
                    }),
                    h('span', {
                        class: ['tree-label', !props.node.is_active ? 'tree-label--inactive' : ''],
                        onClick: () => emit('toggle-select', props.node, !selected),
                    }, [
                        props.node.name,
                        h('span', { class: 'tree-code' }, ` (${props.node.code})${!props.node.is_active ? ' · 已失效' : ''}`),
                    ]),
                    selected
                        ? h(ElTooltip, { content: '勾选后此节点的所有子级数据也会被纳入', placement: 'top' }, () => h(ElSwitch, {
                            modelValue: props.includeDesc(props.node),
                            'onUpdate:modelValue': (v) => emit('toggle-include', props.node, !!v),
                            size: 'small',
                            'active-text': '含下级',
                            inlinePrompt: true,
                            style: 'margin-left: 12px',
                        }))
                        : null,
                ]),
                isOpen && hasChildren
                    ? props.node.children.map((c) => h(TreeNodeRow, {
                        key: c.id,
                        node: c,
                        depth: props.depth + 1,
                        expanded: props.expanded,
                        isSelected: props.isSelected,
                        includeDesc: props.includeDesc,
                        onToggleSelect: (n, v) => emit('toggle-select', n, v),
                        onToggleInclude: (n, v) => emit('toggle-include', n, v),
                        onToggleExpand: (id) => emit('toggle-expand', id),
                    }))
                    : null,
            ]);
        };
    },
});
debugger; /* PartiallyEnd: #3632/both.vue */
export default await (async () => {
    const props = defineProps();
    const emit = defineEmits();
    const expanded = ref(new Set());
    const keyword = ref('');
    const selectedMap = computed(() => {
        const m = new Map();
        for (const s of props.modelValue || []) {
            if (s.node_id !== null && s.node_id !== undefined)
                m.set(s.node_id, s);
        }
        return m;
    });
    function isSelected(node) {
        return selectedMap.value.has(node.id);
    }
    function includeDesc(node) {
        return selectedMap.value.get(node.id)?.include_descendants ?? false;
    }
    function toggleSelect(node, val) {
        const next = [...(props.modelValue || [])].filter((s) => s.node_id !== node.id);
        if (val)
            next.push({ node_id: node.id, include_descendants: false });
        emit('update:modelValue', next);
    }
    function toggleInclude(node, val) {
        const next = (props.modelValue || []).map((s) => s.node_id === node.id ? { ...s, include_descendants: val } : s);
        emit('update:modelValue', next);
    }
    function toggleExpand(id) {
        const s = new Set(expanded.value);
        s.has(id) ? s.delete(id) : s.add(id);
        expanded.value = s;
    }
    const filteredTree = computed(() => {
        if (!keyword.value)
            return props.tree;
        const kw = keyword.value.toLowerCase();
        function filterRec(node) {
            const matched = node.name.toLowerCase().includes(kw) || node.code.toLowerCase().includes(kw);
            const filteredChildren = node.children
                .map(filterRec)
                .filter((c) => c !== null);
            if (matched || filteredChildren.length) {
                return { ...node, children: filteredChildren };
            }
            return null;
        }
        return props.tree.map(filterRec).filter((c) => c !== null);
    });
    // 搜索时自动展开命中的祖先
    watch(keyword, (v) => {
        if (!v)
            return;
        const ids = new Set();
        function collect(node, ancestors) {
            const matched = node.name.toLowerCase().includes(v.toLowerCase()) ||
                node.code.toLowerCase().includes(v.toLowerCase());
            if (matched)
                ancestors.forEach((id) => ids.add(id));
            for (const c of node.children)
                collect(c, [...ancestors, node.id]);
        }
        for (const t of props.tree)
            collect(t, []);
        expanded.value = new Set([...expanded.value, ...ids]);
    });
    debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
    const __VLS_ctx = {};
    let __VLS_components;
    let __VLS_directives;
    /** @type {__VLS_StyleScopedClasses['tree-row']} */ ;
    // CSS variable injection 
    // CSS variable injection end 
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tree-picker" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    const __VLS_0 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        modelValue: (__VLS_ctx.keyword),
        placeholder: "搜索节点名 / 编码",
        clearable: true,
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_2 = __VLS_1({
        modelValue: (__VLS_ctx.keyword),
        placeholder: "搜索节点名 / 编码",
        clearable: true,
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    {
        const { prefix: __VLS_thisSlot } = __VLS_3.slots;
        const __VLS_4 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
        const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
        __VLS_7.slots.default;
        const __VLS_8 = {}.Search;
        /** @type {[typeof __VLS_components.Search, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
        const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
        var __VLS_7;
    }
    var __VLS_3;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tree-body" },
    });
    for (const [n] of __VLS_getVForSourceType((__VLS_ctx.filteredTree))) {
        const __VLS_12 = {}.TreeNodeRow;
        /** @type {[typeof __VLS_components.TreeNodeRow, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            ...{ 'onToggleSelect': {} },
            ...{ 'onToggleInclude': {} },
            ...{ 'onToggleExpand': {} },
            key: (n.id),
            node: (n),
            depth: (0),
            expanded: (__VLS_ctx.expanded),
            isSelected: (__VLS_ctx.isSelected),
            includeDesc: (__VLS_ctx.includeDesc),
        }));
        const __VLS_14 = __VLS_13({
            ...{ 'onToggleSelect': {} },
            ...{ 'onToggleInclude': {} },
            ...{ 'onToggleExpand': {} },
            key: (n.id),
            node: (n),
            depth: (0),
            expanded: (__VLS_ctx.expanded),
            isSelected: (__VLS_ctx.isSelected),
            includeDesc: (__VLS_ctx.includeDesc),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        let __VLS_16;
        let __VLS_17;
        let __VLS_18;
        const __VLS_19 = {
            onToggleSelect: (__VLS_ctx.toggleSelect)
        };
        const __VLS_20 = {
            onToggleInclude: (__VLS_ctx.toggleInclude)
        };
        const __VLS_21 = {
            onToggleExpand: (__VLS_ctx.toggleExpand)
        };
        var __VLS_15;
    }
    if (!__VLS_ctx.filteredTree.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty" },
        });
    }
    /** @type {__VLS_StyleScopedClasses['tree-picker']} */ ;
    /** @type {__VLS_StyleScopedClasses['tree-body']} */ ;
    /** @type {__VLS_StyleScopedClasses['empty']} */ ;
    var __VLS_dollars;
    const __VLS_self = (await import('vue')).defineComponent({
        setup() {
            return {
                ElIcon: ElIcon,
                ElInput: ElInput,
                Search: Search,
                expanded: expanded,
                keyword: keyword,
                isSelected: isSelected,
                includeDesc: includeDesc,
                toggleSelect: toggleSelect,
                toggleInclude: toggleInclude,
                toggleExpand: toggleExpand,
                filteredTree: filteredTree,
                TreeNodeRow: TreeNodeRow,
            };
        },
        __typeEmits: {},
        __typeProps: {},
    });
    return (await import('vue')).defineComponent({
        setup() {
            return {};
        },
        __typeEmits: {},
        __typeProps: {},
    });
})(); /* PartiallyEnd: #4569/main.vue */
