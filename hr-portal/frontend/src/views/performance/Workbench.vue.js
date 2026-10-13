/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { ArrowDown, ArrowRight, Document, Tickets, User } from '@element-plus/icons-vue';
import PerformanceWorkbenchTimeline from '@/components/performance/PerformanceWorkbenchTimeline.vue';
import { performanceWorkbenchApi } from '@/api/performance';
const router = useRouter();
const todoTab = ref('pending');
const projects = ref([]);
const activeProjectId = ref(null);
const visibleNodes = ref([]);
const pendingTodos = ref([]);
const completedTodos = ref([]);
const loading = ref(true);
const activeProject = computed(() => projects.value.find((project) => project.project_id === activeProjectId.value) || projects.value[0]);
const visibleTodos = computed(() => (todoTab.value === 'pending' ? pendingTodos.value : completedTodos.value).map((todo) => ({ ...todo, completed: todoTab.value === 'completed', icon: todo.node_type.includes('communication') ? Tickets : todo.node_type.includes('evaluation') ? User : Document })));
const pendingCount = computed(() => pendingTodos.value.reduce((sum, todo) => sum + todo.pending_count, 0));
const completedCount = computed(() => completedTodos.value.reduce((sum, todo) => sum + todo.completed_count, 0));
const announcements = [{ title: '2026半年度个人绩效评估方案', time: '2个月前' }, { title: '管理者绩效面谈指引', time: '9个月前' }];
function formatDateTime(value) {
    if (!value)
        return null;
    const date = new Date(value);
    const pad = (number) => String(number).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function formatRange(startAt, endAt) {
    if (!startAt && !endAt)
        return '时间待配置';
    return `${formatDateTime(startAt) || '--'} - ${formatDateTime(endAt) || '--'}`;
}
async function loadProject(projectId) {
    const [timeline, pending, completed] = await Promise.all([
        performanceWorkbenchApi.timeline(projectId),
        performanceWorkbenchApi.tasks(projectId, 'pending'),
        performanceWorkbenchApi.tasks(projectId, 'completed'),
    ]);
    visibleNodes.value = timeline.map((node, index) => ({ ...node, range: formatRange(node.start_at, node.end_at), completed: node.status === 'completed', current: node.status === 'pending' && index === 0 }));
    pendingTodos.value = pending;
    completedTodos.value = completed;
}
async function selectProject(rawId) {
    const id = Number(rawId);
    if (!Number.isFinite(id))
        return;
    activeProjectId.value = id;
    try {
        await loadProject(id);
    }
    catch {
        ElMessage.error('工作台数据加载失败');
    }
}
function goToResults() { router.push({ name: 'PerformanceReview', query: { entry: 'results' } }); }
function openTeam() { router.push({ name: 'PerformanceReview', query: { entry: 'team' } }); }
function openTodo(todo) {
    const query = new URLSearchParams({ node: String(todo.node_id), project_id: String(activeProjectId.value || '') });
    if (todo.node_type === 'work_summary' && todo.task_id) {
        window.location.assign(`/performance/review/self-summary?task_id=${encodeURIComponent(String(todo.task_id))}&project_id=${encodeURIComponent(String(activeProjectId.value || ''))}`);
        return;
    }
    window.location.assign(`${todo.action_url || '/performance/review'}?${query.toString()}`);
}
onMounted(async () => {
    try {
        projects.value = await performanceWorkbenchApi.listProjects();
        if (projects.value.length)
            await selectProject(projects.value[0].project_id);
    }
    catch {
        ElMessage.error('工作台数据加载失败');
    }
    finally {
        loading.value = false;
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['timeline-card']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-track']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-node']} */ ;
/** @type {__VLS_StyleScopedClasses['current']} */ ;
/** @type {__VLS_StyleScopedClasses['completed']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-node']} */ ;
/** @type {__VLS_StyleScopedClasses['current']} */ ;
/** @type {__VLS_StyleScopedClasses['completed']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-node']} */ ;
/** @type {__VLS_StyleScopedClasses['completed']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-node']} */ ;
/** @type {__VLS_StyleScopedClasses['completed']} */ ;
/** @type {__VLS_StyleScopedClasses['node-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-node']} */ ;
/** @type {__VLS_StyleScopedClasses['current']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-node']} */ ;
/** @type {__VLS_StyleScopedClasses['completed']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['result-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['result-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['result-card']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-section']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-content']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-content']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-content']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-content']} */ ;
/** @type {__VLS_StyleScopedClasses['side-card']} */ ;
/** @type {__VLS_StyleScopedClasses['side-card']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-group']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-group']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-group']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-group']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-group']} */ ;
/** @type {__VLS_StyleScopedClasses['announcement-card']} */ ;
/** @type {__VLS_StyleScopedClasses['announcement-card']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench-page']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench-main']} */ ;
/** @type {__VLS_StyleScopedClasses['side-card']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench-side']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench-page']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench-side']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-card']} */ ;
/** @type {__VLS_StyleScopedClasses['result-card']} */ ;
/** @type {__VLS_StyleScopedClasses['result-card']} */ ;
/** @type {__VLS_StyleScopedClasses['el-button']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-action']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workbench-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "workbench-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cycle-picker-row" },
});
const __VLS_0 = {}.ElDropdown;
/** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onCommand': {} },
    trigger: "click",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onCommand': {} },
    trigger: "click",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onCommand: (__VLS_ctx.selectProject)
};
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "cycle-picker" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.activeProject?.cycle_name || '我的绩效项目');
const __VLS_8 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.ArrowDown;
/** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
var __VLS_11;
{
    const { dropdown: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_16 = {}.ElDropdownMenu;
    /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        ...{ class: "project-menu" },
    }));
    const __VLS_18 = __VLS_17({
        ...{ class: "project-menu" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_19.slots.default;
    for (const [project] of __VLS_getVForSourceType((__VLS_ctx.projects))) {
        const __VLS_20 = {}.ElDropdownItem;
        /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            key: (project.project_id),
            command: (project.project_id),
            ...{ class: ({ selected: project.project_id === __VLS_ctx.activeProject?.project_id }) },
        }));
        const __VLS_22 = __VLS_21({
            key: (project.project_id),
            command: (project.project_id),
            ...{ class: ({ selected: project.project_id === __VLS_ctx.activeProject?.project_id }) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        __VLS_23.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "project-option" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (project.project_name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.formatRange(project.cycle_start_at, project.cycle_end_at));
        if (project.project_id === __VLS_ctx.activeProject?.project_id) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
            (project.project_status === 'STARTED' ? '进行中' : project.project_status);
        }
        var __VLS_23;
    }
    var __VLS_19;
}
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "timeline-card" },
});
/** @type {[typeof PerformanceWorkbenchTimeline, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(PerformanceWorkbenchTimeline, new PerformanceWorkbenchTimeline({
    key: (__VLS_ctx.activeProjectId ?? 'empty'),
    nodes: (__VLS_ctx.visibleNodes),
}));
const __VLS_25 = __VLS_24({
    key: (__VLS_ctx.activeProjectId ?? 'empty'),
    nodes: (__VLS_ctx.visibleNodes),
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
if (__VLS_ctx.activeProject?.result_published) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "result-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "result-icon" },
    });
    const __VLS_27 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({}));
    const __VLS_29 = __VLS_28({}, ...__VLS_functionalComponentArgsRest(__VLS_28));
    __VLS_30.slots.default;
    const __VLS_31 = {}.Document;
    /** @type {[typeof __VLS_components.Document, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({}));
    const __VLS_33 = __VLS_32({}, ...__VLS_functionalComponentArgsRest(__VLS_32));
    var __VLS_30;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "result-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_35 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
        ...{ 'onClick': {} },
        plain: true,
    }));
    const __VLS_37 = __VLS_36({
        ...{ 'onClick': {} },
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    let __VLS_39;
    let __VLS_40;
    let __VLS_41;
    const __VLS_42 = {
        onClick: (__VLS_ctx.goToResults)
    };
    __VLS_38.slots.default;
    var __VLS_38;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "todo-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "todo-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "todo-tabs" },
    role: "tablist",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.todoTab = 'pending';
        } },
    ...{ class: ({ active: __VLS_ctx.todoTab === 'pending' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
(__VLS_ctx.pendingCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.todoTab = 'completed';
        } },
    ...{ class: ({ active: __VLS_ctx.todoTab === 'completed' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
(__VLS_ctx.completedCount);
if (__VLS_ctx.visibleTodos.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "todo-list" },
    });
    for (const [todo] of __VLS_getVForSourceType((__VLS_ctx.visibleTodos))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.visibleTodos.length))
                        return;
                    __VLS_ctx.openTodo(todo);
                } },
            key: (todo.node_id),
            ...{ class: "todo-item" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "todo-icon" },
        });
        const __VLS_43 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({}));
        const __VLS_45 = __VLS_44({}, ...__VLS_functionalComponentArgsRest(__VLS_44));
        __VLS_46.slots.default;
        const __VLS_47 = ((todo.icon));
        // @ts-ignore
        const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({}));
        const __VLS_49 = __VLS_48({}, ...__VLS_functionalComponentArgsRest(__VLS_48));
        var __VLS_46;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "todo-content" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (todo.node_name);
        if (todo.overdue_count) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
            (todo.overdue_count);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (todo.due_at || '未配置');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
        (todo.pending_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "todo-action" },
        });
        (__VLS_ctx.todoTab === 'pending' ? '去完成' : '查看');
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "todo-empty" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "workbench-side" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "side-card quick-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "quick-group" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.goToResults) },
    type: "button",
});
const __VLS_51 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({}));
const __VLS_53 = __VLS_52({}, ...__VLS_functionalComponentArgsRest(__VLS_52));
__VLS_54.slots.default;
const __VLS_55 = {}.Document;
/** @type {[typeof __VLS_components.Document, ]} */ ;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({}));
const __VLS_57 = __VLS_56({}, ...__VLS_functionalComponentArgsRest(__VLS_56));
var __VLS_54;
const __VLS_59 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
    ...{ class: "chevron" },
}));
const __VLS_61 = __VLS_60({
    ...{ class: "chevron" },
}, ...__VLS_functionalComponentArgsRest(__VLS_60));
__VLS_62.slots.default;
const __VLS_63 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({}));
const __VLS_65 = __VLS_64({}, ...__VLS_functionalComponentArgsRest(__VLS_64));
var __VLS_62;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "quick-group" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openTeam) },
    type: "button",
});
const __VLS_67 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({}));
const __VLS_69 = __VLS_68({}, ...__VLS_functionalComponentArgsRest(__VLS_68));
__VLS_70.slots.default;
const __VLS_71 = {}.User;
/** @type {[typeof __VLS_components.User, ]} */ ;
// @ts-ignore
const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({}));
const __VLS_73 = __VLS_72({}, ...__VLS_functionalComponentArgsRest(__VLS_72));
var __VLS_70;
const __VLS_75 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
    ...{ class: "chevron" },
}));
const __VLS_77 = __VLS_76({
    ...{ class: "chevron" },
}, ...__VLS_functionalComponentArgsRest(__VLS_76));
__VLS_78.slots.default;
const __VLS_79 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({}));
const __VLS_81 = __VLS_80({}, ...__VLS_functionalComponentArgsRest(__VLS_80));
var __VLS_78;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "quick-group" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openTeam) },
    type: "button",
});
const __VLS_83 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
    ...{ class: "orange" },
}));
const __VLS_85 = __VLS_84({
    ...{ class: "orange" },
}, ...__VLS_functionalComponentArgsRest(__VLS_84));
__VLS_86.slots.default;
const __VLS_87 = {}.Tickets;
/** @type {[typeof __VLS_components.Tickets, ]} */ ;
// @ts-ignore
const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({}));
const __VLS_89 = __VLS_88({}, ...__VLS_functionalComponentArgsRest(__VLS_88));
var __VLS_86;
const __VLS_91 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
    ...{ class: "chevron" },
}));
const __VLS_93 = __VLS_92({
    ...{ class: "chevron" },
}, ...__VLS_functionalComponentArgsRest(__VLS_92));
__VLS_94.slots.default;
const __VLS_95 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({}));
const __VLS_97 = __VLS_96({}, ...__VLS_functionalComponentArgsRest(__VLS_96));
var __VLS_94;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openTeam) },
    type: "button",
});
const __VLS_99 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({}));
const __VLS_101 = __VLS_100({}, ...__VLS_functionalComponentArgsRest(__VLS_100));
__VLS_102.slots.default;
const __VLS_103 = {}.User;
/** @type {[typeof __VLS_components.User, ]} */ ;
// @ts-ignore
const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({}));
const __VLS_105 = __VLS_104({}, ...__VLS_functionalComponentArgsRest(__VLS_104));
var __VLS_102;
const __VLS_107 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_108 = __VLS_asFunctionalComponent(__VLS_107, new __VLS_107({
    ...{ class: "chevron" },
}));
const __VLS_109 = __VLS_108({
    ...{ class: "chevron" },
}, ...__VLS_functionalComponentArgsRest(__VLS_108));
__VLS_110.slots.default;
const __VLS_111 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({}));
const __VLS_113 = __VLS_112({}, ...__VLS_functionalComponentArgsRest(__VLS_112));
var __VLS_110;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "side-card announcement-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
for (const [announcement] of __VLS_getVForSourceType((__VLS_ctx.announcements))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        key: (announcement.title),
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (announcement.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.time, __VLS_intrinsicElements.time)({});
    (announcement.time);
}
/** @type {__VLS_StyleScopedClasses['workbench-page']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench-main']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-picker-row']} */ ;
/** @type {__VLS_StyleScopedClasses['cycle-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['project-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['project-option']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-card']} */ ;
/** @type {__VLS_StyleScopedClasses['result-card']} */ ;
/** @type {__VLS_StyleScopedClasses['result-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['result-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-section']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-card']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-list']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-item']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-content']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-action']} */ ;
/** @type {__VLS_StyleScopedClasses['todo-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench-side']} */ ;
/** @type {__VLS_StyleScopedClasses['side-card']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-card']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-group']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-group']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-group']} */ ;
/** @type {__VLS_StyleScopedClasses['orange']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['side-card']} */ ;
/** @type {__VLS_StyleScopedClasses['announcement-card']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowDown: ArrowDown,
            ArrowRight: ArrowRight,
            Document: Document,
            Tickets: Tickets,
            User: User,
            PerformanceWorkbenchTimeline: PerformanceWorkbenchTimeline,
            todoTab: todoTab,
            projects: projects,
            activeProjectId: activeProjectId,
            visibleNodes: visibleNodes,
            activeProject: activeProject,
            visibleTodos: visibleTodos,
            pendingCount: pendingCount,
            completedCount: completedCount,
            announcements: announcements,
            formatRange: formatRange,
            selectProject: selectProject,
            goToResults: goToResults,
            openTeam: openTeam,
            openTodo: openTodo,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
