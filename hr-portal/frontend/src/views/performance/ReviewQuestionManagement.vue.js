/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { performanceReviewQuestionApi } from '@/api/performance';
import AddOutlinedIcon from '@/components/performance/AddOutlinedIcon.vue';
import PerformanceListPage from '@/components/performance/PerformanceListPage.vue';
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue';
import ReviewQuestionTable from '@/components/performance/ReviewQuestionTable.vue';
import ReviewRuleManagement from './ReviewRuleManagement.vue';
const route = useRoute();
const router = useRouter();
const activeTab = ref(route.query.tab === 'rule' ? 'rule' : 'question');
const keyword = ref('');
const loading = ref(false);
const questions = ref([]);
const page = ref(1);
const pageSize = ref(10);
async function loadQuestions() {
    loading.value = true;
    try {
        const items = await performanceReviewQuestionApi.list();
        questions.value = items.map((item) => ({
            id: String(item.id),
            name: item.name,
            type: item.type,
            creator: item.rule?.creator || '',
            createdAt: item.created_at,
            remark: item.remark,
            rule_id: item.rule_id,
            is_sub_question: item.is_sub_question,
            parent_question_id: item.parent_question_id,
        }));
    }
    catch {
        questions.value = [];
    }
    finally {
        loading.value = false;
    }
}
onMounted(() => { void loadQuestions(); });
function selectTab(tab) {
    activeTab.value = tab;
    void router.replace({
        query: {
            ...route.query,
            tab: tab === 'rule' ? 'rule' : undefined,
        },
    });
}
function handleRuleCreate() {
    void router.push({ name: 'ReviewRuleCreate' });
}
function handleRuleEdit(rule) {
    void router.push({
        name: 'ReviewRuleEdit',
        params: { id: rule.id },
        query: { name: rule.name },
    });
}
function handleCreate(command) {
    if (command === 'create-sub') {
        void router.push({ name: 'ReviewQuestionCreate', query: { isSub: null } });
        return;
    }
    void router.push({ name: 'ReviewQuestionCreate' });
}
function handleEdit(question) {
    void router.push({ name: 'ReviewQuestionEdit', params: { id: question.id }, query: { name: question.name, type: question.type, remark: question.remark } });
}
function handleRemove(question) {
    ElMessageBox.confirm(`确定删除「${question.name}」吗？`, '删除确认', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
    })
        .then(() => {
        questions.value = questions.value.filter((item) => item.id !== question.id);
        ElMessage.success('已删除');
    })
        .catch(() => { });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof PerformanceListPage, typeof PerformanceListPage, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceListPage, new PerformanceListPage({
    title: "评估题",
}));
const __VLS_1 = __VLS_0({
    title: "评估题",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
__VLS_2.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_2.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-tabs" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectTab('question');
            } },
        ...{ class: "tab" },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'question' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectTab('rule');
            } },
        ...{ class: "tab" },
        ...{ class: ({ active: __VLS_ctx.activeTab === 'rule' }) },
    });
}
if (__VLS_ctx.activeTab === 'question') {
    /** @type {[typeof PerformanceListToolbar, typeof PerformanceListToolbar, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PerformanceListToolbar, new PerformanceListToolbar({
        keyword: (__VLS_ctx.keyword),
    }));
    const __VLS_5 = __VLS_4({
        keyword: (__VLS_ctx.keyword),
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    __VLS_6.slots.default;
    {
        const { left: __VLS_thisSlot } = __VLS_6.slots;
        const __VLS_7 = {}.ElDropdown;
        /** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
            ...{ 'onCommand': {} },
            trigger: "click",
        }));
        const __VLS_9 = __VLS_8({
            ...{ 'onCommand': {} },
            trigger: "click",
        }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        let __VLS_11;
        let __VLS_12;
        let __VLS_13;
        const __VLS_14 = {
            onCommand: (__VLS_ctx.handleCreate)
        };
        __VLS_10.slots.default;
        const __VLS_15 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({
            type: "primary",
            ...{ class: "create-button" },
        }));
        const __VLS_17 = __VLS_16({
            type: "primary",
            ...{ class: "create-button" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_16));
        __VLS_18.slots.default;
        /** @type {[typeof AddOutlinedIcon, ]} */ ;
        // @ts-ignore
        const __VLS_19 = __VLS_asFunctionalComponent(AddOutlinedIcon, new AddOutlinedIcon({
            ...{ class: "create-icon" },
        }));
        const __VLS_20 = __VLS_19({
            ...{ class: "create-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_19));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "create-label" },
        });
        var __VLS_18;
        {
            const { dropdown: __VLS_thisSlot } = __VLS_10.slots;
            const __VLS_22 = {}.ElDropdownMenu;
            /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
            // @ts-ignore
            const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({}));
            const __VLS_24 = __VLS_23({}, ...__VLS_functionalComponentArgsRest(__VLS_23));
            __VLS_25.slots.default;
            const __VLS_26 = {}.ElDropdownItem;
            /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
            // @ts-ignore
            const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({
                command: "create",
            }));
            const __VLS_28 = __VLS_27({
                command: "create",
            }, ...__VLS_functionalComponentArgsRest(__VLS_27));
            __VLS_29.slots.default;
            var __VLS_29;
            const __VLS_30 = {}.ElDropdownItem;
            /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
            // @ts-ignore
            const __VLS_31 = __VLS_asFunctionalComponent(__VLS_30, new __VLS_30({
                command: "create-sub",
            }));
            const __VLS_32 = __VLS_31({
                command: "create-sub",
            }, ...__VLS_functionalComponentArgsRest(__VLS_31));
            __VLS_33.slots.default;
            var __VLS_33;
            var __VLS_25;
        }
        var __VLS_10;
    }
    var __VLS_6;
    /** @type {[typeof ReviewQuestionTable, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(ReviewQuestionTable, new ReviewQuestionTable({
        ...{ 'onPageChange': {} },
        ...{ 'onPageSizeChange': {} },
        ...{ 'onEdit': {} },
        ...{ 'onRemove': {} },
        questions: (__VLS_ctx.questions),
        loading: (__VLS_ctx.loading),
        page: (__VLS_ctx.page),
        pageSize: (__VLS_ctx.pageSize),
        total: (__VLS_ctx.questions.length),
    }));
    const __VLS_35 = __VLS_34({
        ...{ 'onPageChange': {} },
        ...{ 'onPageSizeChange': {} },
        ...{ 'onEdit': {} },
        ...{ 'onRemove': {} },
        questions: (__VLS_ctx.questions),
        loading: (__VLS_ctx.loading),
        page: (__VLS_ctx.page),
        pageSize: (__VLS_ctx.pageSize),
        total: (__VLS_ctx.questions.length),
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    let __VLS_37;
    let __VLS_38;
    let __VLS_39;
    const __VLS_40 = {
        onPageChange: (...[$event]) => {
            if (!(__VLS_ctx.activeTab === 'question'))
                return;
            __VLS_ctx.page = $event;
        }
    };
    const __VLS_41 = {
        onPageSizeChange: (...[$event]) => {
            if (!(__VLS_ctx.activeTab === 'question'))
                return;
            __VLS_ctx.pageSize = $event;
        }
    };
    const __VLS_42 = {
        onEdit: (__VLS_ctx.handleEdit)
    };
    const __VLS_43 = {
        onRemove: (__VLS_ctx.handleRemove)
    };
    var __VLS_36;
}
else {
    /** @type {[typeof ReviewRuleManagement, ]} */ ;
    // @ts-ignore
    const __VLS_44 = __VLS_asFunctionalComponent(ReviewRuleManagement, new ReviewRuleManagement({
        ...{ 'onCreate': {} },
        ...{ 'onEdit': {} },
    }));
    const __VLS_45 = __VLS_44({
        ...{ 'onCreate': {} },
        ...{ 'onEdit': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_44));
    let __VLS_47;
    let __VLS_48;
    let __VLS_49;
    const __VLS_50 = {
        onCreate: (__VLS_ctx.handleRuleCreate)
    };
    const __VLS_51 = {
        onEdit: (__VLS_ctx.handleRuleEdit)
    };
    var __VLS_46;
}
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['page-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['tab']} */ ;
/** @type {__VLS_StyleScopedClasses['create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['create-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['create-label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AddOutlinedIcon: AddOutlinedIcon,
            PerformanceListPage: PerformanceListPage,
            PerformanceListToolbar: PerformanceListToolbar,
            ReviewQuestionTable: ReviewQuestionTable,
            ReviewRuleManagement: ReviewRuleManagement,
            activeTab: activeTab,
            keyword: keyword,
            loading: loading,
            questions: questions,
            page: page,
            pageSize: pageSize,
            selectTab: selectTab,
            handleRuleCreate: handleRuleCreate,
            handleRuleEdit: handleRuleEdit,
            handleCreate: handleCreate,
            handleEdit: handleEdit,
            handleRemove: handleRemove,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
