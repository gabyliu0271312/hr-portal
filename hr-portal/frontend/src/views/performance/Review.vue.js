/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { performanceReviewApi, } from '@/api/performance';
import PerformanceReviewCategorySidebar from '@/components/performance/PerformanceReviewCategorySidebar.vue';
import PerformanceReviewContent from '@/components/performance/PerformanceReviewContent.vue';
const route = useRoute();
const router = useRouter();
const overview = ref(null);
const activeProjectId = ref(Number(route.query.project_id) || undefined);
const selectedNodeId = ref(String(route.query.node || ''));
const loading = ref(true);
const error = ref('');
const emptyCategories = [
    { key: 'mine', label: '我的绩效', nodes: [] },
    { key: 'others', label: '给他人的评估', nodes: [] },
    { key: 'team', label: '我团队的绩效', nodes: [] },
    { key: 'other', label: '其他事项', nodes: [] },
];
const allNodes = computed(() => overview.value?.categories.flatMap(category => category.nodes) || []);
const selectedNode = computed(() => allNodes.value.find(node => node.node_id === selectedNodeId.value) || allNodes.value[0] || null);
async function loadOverview(projectId) {
    loading.value = true;
    error.value = '';
    try {
        overview.value = await performanceReviewApi.overview(projectId);
        activeProjectId.value = overview.value.active_project?.project_id;
        if (!allNodes.value.some(node => node.node_id === selectedNodeId.value)) {
            selectedNodeId.value = allNodes.value[0]?.node_id || '';
        }
    }
    catch {
        error.value = '绩效评估加载失败，请稍后重试';
    }
    finally {
        loading.value = false;
    }
}
async function selectProject(rawProjectId) {
    const projectId = Number(rawProjectId);
    if (!Number.isFinite(projectId))
        return;
    activeProjectId.value = projectId;
    selectedNodeId.value = '';
    await router.replace({ query: { project_id: String(projectId) } });
    await loadOverview(projectId);
}
async function selectNode(node) {
    selectedNodeId.value = node.node_id;
    await router.replace({ query: { project_id: String(activeProjectId.value || ''), node: node.node_id } });
}
function openNode(node) {
    router.push(node.action_url);
}
onMounted(() => loadOverview(activeProjectId.value));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['review-page']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "review-page" },
});
/** @type {[typeof PerformanceReviewCategorySidebar, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceReviewCategorySidebar, new PerformanceReviewCategorySidebar({
    ...{ 'onSelectProject': {} },
    ...{ 'onSelectNode': {} },
    categories: (__VLS_ctx.overview?.categories || __VLS_ctx.emptyCategories),
    projects: (__VLS_ctx.overview?.projects || []),
    activeProject: (__VLS_ctx.overview?.active_project || null),
    selectedNodeId: (__VLS_ctx.selectedNodeId),
    loading: (__VLS_ctx.loading),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onSelectProject': {} },
    ...{ 'onSelectNode': {} },
    categories: (__VLS_ctx.overview?.categories || __VLS_ctx.emptyCategories),
    projects: (__VLS_ctx.overview?.projects || []),
    activeProject: (__VLS_ctx.overview?.active_project || null),
    selectedNodeId: (__VLS_ctx.selectedNodeId),
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onSelectProject: (__VLS_ctx.selectProject)
};
const __VLS_7 = {
    onSelectNode: (__VLS_ctx.selectNode)
};
var __VLS_2;
/** @type {[typeof PerformanceReviewContent, ]} */ ;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent(PerformanceReviewContent, new PerformanceReviewContent({
    ...{ 'onRetry': {} },
    ...{ 'onOpenNode': {} },
    loading: (__VLS_ctx.loading),
    error: (__VLS_ctx.error),
    templateName: (__VLS_ctx.overview?.template_name || ''),
    node: (__VLS_ctx.selectedNode),
}));
const __VLS_9 = __VLS_8({
    ...{ 'onRetry': {} },
    ...{ 'onOpenNode': {} },
    loading: (__VLS_ctx.loading),
    error: (__VLS_ctx.error),
    templateName: (__VLS_ctx.overview?.template_name || ''),
    node: (__VLS_ctx.selectedNode),
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
let __VLS_11;
let __VLS_12;
let __VLS_13;
const __VLS_14 = {
    onRetry: (...[$event]) => {
        __VLS_ctx.loadOverview(__VLS_ctx.activeProjectId);
    }
};
const __VLS_15 = {
    onOpenNode: (__VLS_ctx.openNode)
};
var __VLS_10;
/** @type {__VLS_StyleScopedClasses['review-page']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceReviewCategorySidebar: PerformanceReviewCategorySidebar,
            PerformanceReviewContent: PerformanceReviewContent,
            overview: overview,
            activeProjectId: activeProjectId,
            selectedNodeId: selectedNodeId,
            loading: loading,
            error: error,
            emptyCategories: emptyCategories,
            selectedNode: selectedNode,
            loadOverview: loadOverview,
            selectProject: selectProject,
            selectNode: selectNode,
            openNode: openNode,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
