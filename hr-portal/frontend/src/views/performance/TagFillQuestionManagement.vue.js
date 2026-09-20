/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import AddOutlinedIcon from '@/components/performance/AddOutlinedIcon.vue';
import PerformanceListPage from '@/components/performance/PerformanceListPage.vue';
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue';
import TagFillQuestionTable from '@/components/performance/TagFillQuestionTable.vue';
import { TAG_FILL_QUESTION_FIXTURES } from '@/components/performance/tagFillQuestionFixtures';
const router = useRouter();
const keyword = ref('');
const page = ref(1);
const pageSize = ref(10);
const questions = ref(TAG_FILL_QUESTION_FIXTURES.map((item) => ({ ...item, tags: item.tags.map((tag) => ({ ...tag })) })));
const filteredQuestions = computed(() => {
    const value = keyword.value.trim().toLowerCase();
    if (!value)
        return questions.value;
    return questions.value.filter((item) => [item.name, item.remark, item.description].some((text) => text.toLowerCase().includes(value)));
});
function create() {
    void router.push({ name: 'TaggedFillQuestionCreate' });
}
function edit(question) {
    void router.push({ name: 'TaggedFillQuestionEdit', params: { id: question.id }, query: { from: 'list' } });
}
function remove(question) {
    questions.value = questions.value.filter((item) => item.id !== question.id);
    ElMessage.success('已删除本地示例');
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof PerformanceListPage, typeof PerformanceListPage, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceListPage, new PerformanceListPage({
    title: "标签型填写题",
}));
const __VLS_1 = __VLS_0({
    title: "标签型填写题",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
__VLS_2.slots.default;
/** @type {[typeof PerformanceListToolbar, typeof PerformanceListToolbar, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(PerformanceListToolbar, new PerformanceListToolbar({
    ...{ 'onFilter': {} },
    keyword: (__VLS_ctx.keyword),
}));
const __VLS_5 = __VLS_4({
    ...{ 'onFilter': {} },
    keyword: (__VLS_ctx.keyword),
}, ...__VLS_functionalComponentArgsRest(__VLS_4));
let __VLS_7;
let __VLS_8;
let __VLS_9;
const __VLS_10 = {
    onFilter: (...[$event]) => {
        __VLS_ctx.ElMessage.info('筛选面板将在真实 API 契约冻结后接入');
    }
};
__VLS_6.slots.default;
{
    const { left: __VLS_thisSlot } = __VLS_6.slots;
    const __VLS_11 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
        ...{ 'onClick': {} },
        type: "primary",
        ...{ class: "create-button" },
    }));
    const __VLS_13 = __VLS_12({
        ...{ 'onClick': {} },
        type: "primary",
        ...{ class: "create-button" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    let __VLS_15;
    let __VLS_16;
    let __VLS_17;
    const __VLS_18 = {
        onClick: (__VLS_ctx.create)
    };
    __VLS_14.slots.default;
    /** @type {[typeof AddOutlinedIcon, ]} */ ;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent(AddOutlinedIcon, new AddOutlinedIcon({
        ...{ class: "create-icon" },
        'aria-hidden': "true",
    }));
    const __VLS_20 = __VLS_19({
        ...{ class: "create-icon" },
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
    var __VLS_14;
}
var __VLS_6;
/** @type {[typeof TagFillQuestionTable, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(TagFillQuestionTable, new TagFillQuestionTable({
    ...{ 'onPageChange': {} },
    ...{ 'onPageSizeChange': {} },
    ...{ 'onEdit': {} },
    ...{ 'onRemove': {} },
    questions: (__VLS_ctx.filteredQuestions),
    page: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.filteredQuestions.length),
}));
const __VLS_23 = __VLS_22({
    ...{ 'onPageChange': {} },
    ...{ 'onPageSizeChange': {} },
    ...{ 'onEdit': {} },
    ...{ 'onRemove': {} },
    questions: (__VLS_ctx.filteredQuestions),
    page: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.filteredQuestions.length),
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
let __VLS_25;
let __VLS_26;
let __VLS_27;
const __VLS_28 = {
    onPageChange: (...[$event]) => {
        __VLS_ctx.page = $event;
    }
};
const __VLS_29 = {
    onPageSizeChange: (...[$event]) => {
        __VLS_ctx.pageSize = $event;
    }
};
const __VLS_30 = {
    onEdit: (__VLS_ctx.edit)
};
const __VLS_31 = {
    onRemove: (__VLS_ctx.remove)
};
var __VLS_24;
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['create-icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ElMessage: ElMessage,
            AddOutlinedIcon: AddOutlinedIcon,
            PerformanceListPage: PerformanceListPage,
            PerformanceListToolbar: PerformanceListToolbar,
            TagFillQuestionTable: TagFillQuestionTable,
            keyword: keyword,
            page: page,
            pageSize: pageSize,
            filteredQuestions: filteredQuestions,
            create: create,
            edit: edit,
            remove: remove,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
