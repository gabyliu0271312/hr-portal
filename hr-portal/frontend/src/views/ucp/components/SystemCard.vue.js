import { computed } from 'vue';
import { CircleCheck, Plus, } from '@element-plus/icons-vue';
const props = withDefaults(defineProps(), { resources: () => [], credentials: () => [], overview: null, health: 'unconfigured' });
const __VLS_emit = defineEmits();
const HEALTH_LABEL = {
    ok: '健康',
    warn: '部分启用',
    offline: '停用',
    unconfigured: '未配置',
};
const healthLabel = computed(() => HEALTH_LABEL[props.health] || '未知');
const logoText = computed(() => {
    const name = props.system.system_name || props.system.system_code || '';
    return name.slice(0, 1);
});
// 哈希分配颜色,避免同色块
const PALETTE = ['#5B8FF9', '#5AD8A6', '#F6BD16', '#E86452', '#6DC8EC', '#945FB9', '#FF9D4D', '#269A99', '#FF99C3'];
const iconColor = computed(() => {
    const code = props.system.system_type || props.system.system_code || '';
    let hash = 0;
    for (let i = 0; i < code.length; i++)
        hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
    return PALETTE[hash % PALETTE.length];
});
const ownerLabel = computed(() => props.system.owner || props.system.owner_name || '未设置');
const hasCredential = computed(() => props.credentials.length > 0);
const credentialRiskLevel = computed(() => {
    if (!hasCredential.value)
        return 'warn';
    // Phase 4: 基于真实 expires_at 计算过期状态
    const now = Date.now();
    const DAY_MS = 86400000;
    for (const c of props.credentials) {
        if (c.expires_at) {
            const exp = new Date(c.expires_at).getTime();
            if (exp < now)
                return 'danger'; // 已过期
            if (exp - now < 7 * DAY_MS)
                return 'warn'; // 7 天内到期
        }
    }
    return 'ok';
});
const ov = computed(() => props.overview);
const statusTag = computed(() => {
    if (!props.system.is_active)
        return '已停用';
    const cred = ov.value?.credential_status;
    if (cred === 'expired')
        return '阻断';
    if (cred === 'warning')
        return '待续期';
    if (cred === 'none')
        return '未配凭证';
    return '健康';
});
const statusType = computed(() => {
    if (!props.system.is_active)
        return 'info';
    const cred = ov.value?.credential_status;
    if (cred === 'expired')
        return 'danger';
    if (cred === 'warning')
        return 'warning';
    if (cred === 'none')
        return 'warning';
    return 'success';
});
const operationalStatus = computed(() => {
    if (!props.system.is_active)
        return '已停用 · 不参与自动同步';
    const cred = ov.value?.credential_status;
    const health = ov.value?.health_status;
    const latest = ov.value?.latest_run_at;
    if (cred === 'expired')
        return '凭证已过期 · 流水线已阻断';
    if (cred === 'warning')
        return '即将到期 · 建议立即续期';
    if (health === 'failing')
        return '24h 全部失败 · 需排查';
    if (health === 'unconfigured')
        return '未配置凭证 · 无法执行同步';
    if (latest) {
        const ago = timeAgo(new Date(latest));
        return `运行中 · 最近同步 ${ago}`;
    }
    return '运行中';
});
const credentialHeaderText = computed(() => {
    const suffix = credentialRiskLevel.value === 'danger' ? ' · 已过期' : '';
    return `凭证（${props.credentials.length} 套${suffix}）`;
});
const credentialChips = computed(() => {
    if (!props.credentials.length)
        return [];
    return props.credentials.map((c, index) => {
        const env = c.env_tag || normalizeCredentialEnv(c.credential_name) || fallbackCredentialEnv(index);
        const isPrimary = !!c.is_primary || index === 0;
        const expired = credentialRiskLevel.value === 'danger' && isPrimary;
        return {
            key: c.id || `${env}-${index}`,
            text: `${isPrimary ? '●' : '○'} ${env}${expired ? ' (过期)' : ''}`,
            primary: isPrimary && !expired,
            expired,
        };
    });
});
function normalizeCredentialEnv(name) {
    const raw = String(name || '').toLowerCase();
    if (/prod|生产/.test(raw))
        return 'prod';
    if (/stag|stage|staging|预发/.test(raw))
        return 'staging';
    if (/dev|test|测试|开发/.test(raw))
        return 'dev';
    return '';
}
function fallbackCredentialEnv(index) {
    return ['prod', 'staging', 'dev'][index] || `env${index + 1}`;
}
const cardRiskClass = computed(() => {
    if (credentialRiskLevel.value === 'danger')
        return 'sys-card-danger';
    if (credentialRiskLevel.value === 'warn')
        return 'sys-card-warn';
    return 'sys-card-ok';
});
const pipelineCount = computed(() => ov.value?.pipeline_count ?? 0);
const metricLabel = computed(() => {
    const cred = ov.value?.credential_status;
    const dl = ov.value?.dead_letter_count ?? 0;
    if (dl > 0)
        return '死信';
    if (cred === 'expired')
        return '阻断';
    if (cred === 'warning')
        return '24h 同步';
    return '24h 成功率';
});
const metricValue = computed(() => {
    const dl = ov.value?.dead_letter_count ?? 0;
    if (dl > 0)
        return `${dl} 条`;
    const sync = ov.value?.sync_count_24h ?? 0;
    if (sync === 0)
        return '—';
    const rate = ov.value?.success_rate_24h;
    if (rate == null)
        return `${sync} 次`;
    return `${(rate * 100).toFixed(1)}%`;
});
const metricClass = computed(() => {
    const dl = ov.value?.dead_letter_count ?? 0;
    if (dl > 0)
        return 'metric-danger';
    const cred = ov.value?.credential_status;
    if (cred === 'expired')
        return 'metric-danger';
    if (cred === 'warning')
        return 'metric-warn';
    return 'metric-ok';
});
const activeCount = computed(() => ov.value?.active_count ?? props.resources.filter((r) => r.status === 1).length);
function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60)
        return '刚刚';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ resources: () => [], credentials: () => [], overview: null, health: 'unconfigured' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sys-card']} */ ;
/** @type {__VLS_StyleScopedClasses['sys-card']} */ ;
/** @type {__VLS_StyleScopedClasses['cred-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['cred-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['cred-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['cred-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-item']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-strip']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    ...{ class: "sys-card" },
    ...{ class: (['sys-type-' + (__VLS_ctx.system.system_type || 'CUSTOM'), __VLS_ctx.cardRiskClass]) },
    shadow: "hover",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    ...{ class: "sys-card" },
    ...{ class: (['sys-type-' + (__VLS_ctx.system.system_type || 'CUSTOM'), __VLS_ctx.cardRiskClass]) },
    shadow: "hover",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (...[$event]) => {
        __VLS_ctx.$emit('open');
    }
};
var __VLS_8 = {};
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "sc-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "sc-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "system-icon" },
    ...{ style: ({ background: __VLS_ctx.iconColor }) },
});
(__VLS_ctx.logoText);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "system-name" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "health-dot" },
    ...{ class: ('health-' + __VLS_ctx.health) },
    title: (__VLS_ctx.healthLabel),
});
(__VLS_ctx.system.system_name);
const __VLS_9 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
    type: (__VLS_ctx.statusType),
    size: "small",
    effect: "light",
}));
const __VLS_11 = __VLS_10({
    type: (__VLS_ctx.statusType),
    size: "small",
    effect: "light",
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_12.slots.default;
(__VLS_ctx.statusTag);
var __VLS_12;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "system-code" },
});
(__VLS_ctx.system.system_code);
(__VLS_ctx.system.system_type || 'CUSTOM');
(__VLS_ctx.ownerLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "system-status-line" },
});
(__VLS_ctx.operationalStatus);
if (!__VLS_ctx.system.is_active) {
    const __VLS_13 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
        type: "info",
        size: "small",
    }));
    const __VLS_15 = __VLS_14({
        type: "info",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    __VLS_16.slots.default;
    var __VLS_16;
}
const __VLS_17 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
    ...{ style: {} },
}));
const __VLS_19 = __VLS_18({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "credential-label" },
});
(__VLS_ctx.credentialHeaderText);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "creds" },
});
for (const [chip] of __VLS_getVForSourceType((__VLS_ctx.credentialChips))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.$emit('open');
            } },
        key: (chip.key),
        ...{ class: "cred-chip" },
        ...{ class: ({ primary: chip.primary, expired: chip.expired }) },
    });
    (chip.text);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('open');
        } },
    ...{ class: "cred-chip add" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "metric-strip" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
(__VLS_ctx.resources.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
(__VLS_ctx.pipelineCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.metricLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({
    ...{ class: (__VLS_ctx.metricClass) },
});
(__VLS_ctx.metricValue);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "card-footer" },
});
const __VLS_21 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
    ...{ 'onClick': {} },
    size: "small",
    link: true,
    type: "primary",
}));
const __VLS_23 = __VLS_22({
    ...{ 'onClick': {} },
    size: "small",
    link: true,
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
let __VLS_25;
let __VLS_26;
let __VLS_27;
const __VLS_28 = {
    onClick: (...[$event]) => {
        __VLS_ctx.$emit('addResource');
    }
};
__VLS_24.slots.default;
const __VLS_29 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({}));
const __VLS_31 = __VLS_30({}, ...__VLS_functionalComponentArgsRest(__VLS_30));
__VLS_32.slots.default;
const __VLS_33 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({}));
const __VLS_35 = __VLS_34({}, ...__VLS_functionalComponentArgsRest(__VLS_34));
var __VLS_32;
var __VLS_24;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "counter-row" },
});
const __VLS_37 = {}.ElTooltip;
/** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
    content: "启用 / 总资源",
}));
const __VLS_39 = __VLS_38({
    content: "启用 / 总资源",
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
__VLS_40.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "counter" },
});
const __VLS_41 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({}));
const __VLS_43 = __VLS_42({}, ...__VLS_functionalComponentArgsRest(__VLS_42));
__VLS_44.slots.default;
const __VLS_45 = {}.CircleCheck;
/** @type {[typeof __VLS_components.CircleCheck, ]} */ ;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({}));
const __VLS_47 = __VLS_46({}, ...__VLS_functionalComponentArgsRest(__VLS_46));
var __VLS_44;
(__VLS_ctx.activeCount);
(__VLS_ctx.resources.length);
var __VLS_40;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['sys-card']} */ ;
/** @type {__VLS_StyleScopedClasses['sc-header']} */ ;
/** @type {__VLS_StyleScopedClasses['sc-title']} */ ;
/** @type {__VLS_StyleScopedClasses['system-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['system-name']} */ ;
/** @type {__VLS_StyleScopedClasses['health-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['system-code']} */ ;
/** @type {__VLS_StyleScopedClasses['system-status-line']} */ ;
/** @type {__VLS_StyleScopedClasses['credential-label']} */ ;
/** @type {__VLS_StyleScopedClasses['creds']} */ ;
/** @type {__VLS_StyleScopedClasses['cred-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['cred-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['add']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-strip']} */ ;
/** @type {__VLS_StyleScopedClasses['card-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['counter-row']} */ ;
/** @type {__VLS_StyleScopedClasses['counter']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CircleCheck: CircleCheck,
            Plus: Plus,
            healthLabel: healthLabel,
            logoText: logoText,
            iconColor: iconColor,
            ownerLabel: ownerLabel,
            statusTag: statusTag,
            statusType: statusType,
            operationalStatus: operationalStatus,
            credentialHeaderText: credentialHeaderText,
            credentialChips: credentialChips,
            cardRiskClass: cardRiskClass,
            pipelineCount: pipelineCount,
            metricLabel: metricLabel,
            metricValue: metricValue,
            metricClass: metricClass,
            activeCount: activeCount,
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
