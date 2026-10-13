/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { performanceReviewRuleApi } from '@/api/performance';
import AddOutlinedIcon from '@/components/performance/AddOutlinedIcon.vue';
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue';
import ReviewRuleTable from '@/components/performance/ReviewRuleTable.vue';
const emit = defineEmits();
const keyword = ref('');
const loading = ref(false);
const rules = ref([]);
const page = ref(1);
const pageSize = ref(10);
async function loadRules() {
    loading.value = true;
    try {
        const items = await performanceReviewRuleApi.list();
        rules.value = items.map((item) => ({
            id: String(item.id),
            name: item.name,
            method: item.review_type === '评级' ? 'rating' : item.review_type === '评分' ? 'score' : 'score_mapping',
            creator: item.creator,
            createdAt: item.created_at,
            remark: item.remark,
            deletable: item.deletable,
            isUsed: item.is_used,
        }));
    }
    catch {
        rules.value = [];
    }
    finally {
        loading.value = false;
    }
}
async function removeRule(rule) {
    try {
        await ElMessageBox.confirm(`确定删除「${rule.name}」吗？`, '删除确认', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
        });
        await performanceReviewRuleApi.remove(Number(rule.id));
        ElMessage.success('评估规则已删除');
        await loadRules();
    }
    catch (error) {
        if (error === 'cancel' || error === 'close')
            return;
        ElMessage.error(error?.response?.data?.detail?.message || '评估规则删除失败，请稍后重试');
    }
}
onMounted(() => { void loadRules(); });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "review-rule-management" },
});
/** @type {[typeof PerformanceListToolbar, typeof PerformanceListToolbar, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceListToolbar, new PerformanceListToolbar({
    ...{ 'onFilter': {} },
    keyword: (__VLS_ctx.keyword),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onFilter': {} },
    keyword: (__VLS_ctx.keyword),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onFilter: (...[$event]) => {
        __VLS_ctx.emit('filter');
    }
};
__VLS_2.slots.default;
{
    const { left: __VLS_thisSlot } = __VLS_2.slots;
    const __VLS_7 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
        ...{ 'onClick': {} },
        type: "primary",
        ...{ class: "rule-create-button" },
    }));
    const __VLS_9 = __VLS_8({
        ...{ 'onClick': {} },
        type: "primary",
        ...{ class: "rule-create-button" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    let __VLS_11;
    let __VLS_12;
    let __VLS_13;
    const __VLS_14 = {
        onClick: (...[$event]) => {
            __VLS_ctx.emit('create');
        }
    };
    __VLS_10.slots.default;
    /** @type {[typeof AddOutlinedIcon, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(AddOutlinedIcon, new AddOutlinedIcon({
        ...{ class: "rule-create-icon" },
    }));
    const __VLS_16 = __VLS_15({
        ...{ class: "rule-create-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "rule-create-label" },
    });
    var __VLS_10;
}
var __VLS_2;
/** @type {[typeof ReviewRuleTable, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(ReviewRuleTable, new ReviewRuleTable({
    ...{ 'onEdit': {} },
    ...{ 'onRemove': {} },
    ...{ 'onPageChange': {} },
    ...{ 'onPageSizeChange': {} },
    rules: (__VLS_ctx.rules),
    loading: (__VLS_ctx.loading),
    page: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.rules.length),
}));
const __VLS_19 = __VLS_18({
    ...{ 'onEdit': {} },
    ...{ 'onRemove': {} },
    ...{ 'onPageChange': {} },
    ...{ 'onPageSizeChange': {} },
    rules: (__VLS_ctx.rules),
    loading: (__VLS_ctx.loading),
    page: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.rules.length),
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
let __VLS_21;
let __VLS_22;
let __VLS_23;
const __VLS_24 = {
    onEdit: (...[$event]) => {
        __VLS_ctx.emit('edit', $event);
    }
};
const __VLS_25 = {
    onRemove: (__VLS_ctx.removeRule)
};
const __VLS_26 = {
    onPageChange: (...[$event]) => {
        __VLS_ctx.page = $event;
    }
};
const __VLS_27 = {
    onPageSizeChange: (...[$event]) => {
        __VLS_ctx.pageSize = $event;
    }
};
var __VLS_20;
/** @type {__VLS_StyleScopedClasses['review-rule-management']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-create-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-create-label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AddOutlinedIcon: AddOutlinedIcon,
            PerformanceListToolbar: PerformanceListToolbar,
            ReviewRuleTable: ReviewRuleTable,
            emit: emit,
            keyword: keyword,
            loading: loading,
            rules: rules,
            page: page,
            pageSize: pageSize,
            removeRule: removeRule,
        };
    },
    __typeEmits: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
});
; /* PartiallyEnd: #4569/main.vue */
