/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ucpApi } from '@/api/ucp';
import CredentialForm from './components/CredentialForm.vue';
const items = ref([]);
const totalCount = ref(0);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const filterAuthType = ref('');
const formVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);
const showSecret = ref(false);
const secretKey = ref('');
const form = ref({
    id: 0,
    credential_code: '',
    credential_name: '',
    auth_type: '',
    description: '',
    secrets: {},
});
const activeCount = computed(() => items.value.filter(x => x.is_active).length);
const inactiveCount = computed(() => items.value.filter(x => !x.is_active).length);
const formatTime = (s) => (s ? formatDateTime(s) : '-');
const loadList = async () => {
    loading.value = true;
    try {
        const res = await ucpApi.credentials(filterAuthType.value || undefined);
        items.value = res.items || [];
        totalCount.value = res.total || 0;
    }
    catch (e) {
        ElMessage.error('加载凭证列表失败: ' + (e?.message || e));
    }
    finally {
        loading.value = false;
    }
};
const openCreateDialog = () => {
    isEdit.value = false;
    form.value = { id: 0, credential_code: '', credential_name: '', auth_type: '', description: '', secrets: {} };
    secretKey.value = '';
    formVisible.value = true;
};
const openEditDialog = async (row) => {
    isEdit.value = true;
    try {
        // 直接用行数据填充（secrets 不回显，需重新输入）
        form.value = {
            id: row.id,
            credential_code: row.credential_code,
            credential_name: row.credential_name || '',
            auth_type: row.auth_type || '',
            description: row.description || '',
            secrets: {},
        };
        formVisible.value = true;
    }
    catch (e) {
        ElMessage.error('加载详情失败: ' + (e?.message || e));
    }
};
const addSecretKey = () => {
    const key = prompt('请输入密钥字段名（如 username / password / api_key）：');
    if (key) {
        form.value.secrets[key] = '';
    }
};
const onSecretKeyChange = (oldKey, newKey) => {
    if (newKey && newKey !== oldKey) {
        const val = form.value.secrets[oldKey];
        delete form.value.secrets[oldKey];
        form.value.secrets[newKey] = val;
    }
};
const submitForm = async () => {
    if (!form.value.credential_code || !form.value.credential_name) {
        ElMessage.warning('请填写凭证编码和名称');
        return;
    }
    if (Object.keys(form.value.secrets).length === 0) {
        ElMessage.warning('请至少配置一个密钥字段');
        return;
    }
    submitting.value = true;
    try {
        if (isEdit.value) {
            await ucpApi.updateCredential(form.value.id, {
                credential_name: form.value.credential_name,
                auth_type: form.value.auth_type || undefined,
                description: form.value.description || undefined,
                secrets: Object.keys(form.value.secrets).length > 0 ? form.value.secrets : undefined,
            });
            ElMessage.success('凭证更新成功');
        }
        else {
            await ucpApi.createCredential({
                credential_code: form.value.credential_code,
                credential_name: form.value.credential_name,
                secrets: form.value.secrets,
                auth_type: form.value.auth_type || undefined,
                description: form.value.description || undefined,
            });
            ElMessage.success('凭证创建成功');
        }
        formVisible.value = false;
        loadList();
    }
    catch (e) {
        ElMessage.error('提交失败: ' + (e?.response?.data?.detail || e?.message || e));
    }
    finally {
        submitting.value = false;
    }
};
const toggleActive = async (row) => {
    const action = row.is_active ? '停用' : '启用';
    try {
        await ElMessageBox.confirm(`确认${action}凭证「${row.credential_name || row.credential_code}」？`, '提示', { type: 'warning' });
        await ucpApi.toggleCredential(row.id, !row.is_active);
        ElMessage.success(`${action}成功`);
        loadList();
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error(`${action}失败: ` + (e?.message || e));
    }
};
onMounted(() => {
    loadList();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "credential-list" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "desc" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-row" },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "stat-card" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value" },
});
(__VLS_ctx.totalCount);
var __VLS_3;
const __VLS_4 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ class: "stat-card" },
}));
const __VLS_6 = __VLS_5({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value text-success" },
});
(__VLS_ctx.activeCount);
var __VLS_7;
const __VLS_8 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ class: "stat-card" },
}));
const __VLS_10 = __VLS_9({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value text-danger" },
});
(__VLS_ctx.inactiveCount);
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar" },
});
const __VLS_12 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onClear': {} },
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "搜索凭证编码/名称",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_14 = __VLS_13({
    ...{ 'onClear': {} },
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "搜索凭证编码/名称",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onClear: (__VLS_ctx.loadList)
};
const __VLS_20 = {
    onKeyup: (__VLS_ctx.loadList)
};
var __VLS_15;
const __VLS_21 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterAuthType),
    placeholder: "认证方式",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_23 = __VLS_22({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterAuthType),
    placeholder: "认证方式",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
let __VLS_25;
let __VLS_26;
let __VLS_27;
const __VLS_28 = {
    onChange: (__VLS_ctx.loadList)
};
__VLS_24.slots.default;
const __VLS_29 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
    label: "Basic Auth",
    value: "basic",
}));
const __VLS_31 = __VLS_30({
    label: "Basic Auth",
    value: "basic",
}, ...__VLS_functionalComponentArgsRest(__VLS_30));
const __VLS_33 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
    label: "API Key",
    value: "api_key",
}));
const __VLS_35 = __VLS_34({
    label: "API Key",
    value: "api_key",
}, ...__VLS_functionalComponentArgsRest(__VLS_34));
const __VLS_37 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
    label: "OAuth2",
    value: "oauth2",
}));
const __VLS_39 = __VLS_38({
    label: "OAuth2",
    value: "oauth2",
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
const __VLS_41 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
    label: "Token",
    value: "token",
}));
const __VLS_43 = __VLS_42({
    label: "Token",
    value: "token",
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
const __VLS_45 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
    label: "HMAC-SHA256 时间戳签名",
    value: "hmac_sha256_timestamped",
}));
const __VLS_47 = __VLS_46({
    label: "HMAC-SHA256 时间戳签名",
    value: "hmac_sha256_timestamped",
}, ...__VLS_functionalComponentArgsRest(__VLS_46));
var __VLS_24;
const __VLS_49 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_51 = __VLS_50({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_50));
let __VLS_53;
let __VLS_54;
let __VLS_55;
const __VLS_56 = {
    onClick: (__VLS_ctx.loadList)
};
__VLS_52.slots.default;
var __VLS_52;
const __VLS_57 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Plus),
}));
const __VLS_59 = __VLS_58({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Plus),
}, ...__VLS_functionalComponentArgsRest(__VLS_58));
let __VLS_61;
let __VLS_62;
let __VLS_63;
const __VLS_64 = {
    onClick: (__VLS_ctx.openCreateDialog)
};
__VLS_60.slots.default;
var __VLS_60;
const __VLS_65 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}));
const __VLS_67 = __VLS_66({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_66));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_68.slots.default;
const __VLS_69 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
    prop: "id",
    label: "ID",
    width: "70",
}));
const __VLS_71 = __VLS_70({
    prop: "id",
    label: "ID",
    width: "70",
}, ...__VLS_functionalComponentArgsRest(__VLS_70));
const __VLS_73 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
    prop: "credential_code",
    label: "凭证编码",
    minWidth: "180",
    showOverflowTooltip: true,
}));
const __VLS_75 = __VLS_74({
    prop: "credential_code",
    label: "凭证编码",
    minWidth: "180",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_74));
const __VLS_77 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
    prop: "credential_name",
    label: "名称",
    minWidth: "150",
    showOverflowTooltip: true,
}));
const __VLS_79 = __VLS_78({
    prop: "credential_name",
    label: "名称",
    minWidth: "150",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_78));
const __VLS_81 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
    prop: "auth_type",
    label: "认证方式",
    width: "120",
}));
const __VLS_83 = __VLS_82({
    prop: "auth_type",
    label: "认证方式",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_82));
__VLS_84.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_84.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_85 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
        size: "small",
    }));
    const __VLS_87 = __VLS_86({
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_86));
    __VLS_88.slots.default;
    (row.auth_type || '-');
    var __VLS_88;
}
var __VLS_84;
const __VLS_89 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
    prop: "is_active",
    label: "状态",
    width: "90",
    align: "center",
}));
const __VLS_91 = __VLS_90({
    prop: "is_active",
    label: "状态",
    width: "90",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_90));
__VLS_92.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_92.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_93 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
        size: "small",
        type: (row.is_active ? 'success' : 'info'),
    }));
    const __VLS_95 = __VLS_94({
        size: "small",
        type: (row.is_active ? 'success' : 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_94));
    __VLS_96.slots.default;
    (row.is_active ? '活跃' : '停用');
    var __VLS_96;
}
var __VLS_92;
const __VLS_97 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
    prop: "updated_at",
    label: "更新时间",
    width: "170",
}));
const __VLS_99 = __VLS_98({
    prop: "updated_at",
    label: "更新时间",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_98));
__VLS_100.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_100.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatTime(row.updated_at));
}
var __VLS_100;
const __VLS_101 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
    label: "操作",
    width: "180",
    fixed: "right",
}));
const __VLS_103 = __VLS_102({
    label: "操作",
    width: "180",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_102));
__VLS_104.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_104.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_105 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }));
    const __VLS_107 = __VLS_106({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_106));
    let __VLS_109;
    let __VLS_110;
    let __VLS_111;
    const __VLS_112 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEditDialog(row);
        }
    };
    __VLS_108.slots.default;
    var __VLS_108;
    const __VLS_113 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: (row.is_active ? 'warning' : 'success'),
    }));
    const __VLS_115 = __VLS_114({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: (row.is_active ? 'warning' : 'success'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_114));
    let __VLS_117;
    let __VLS_118;
    let __VLS_119;
    const __VLS_120 = {
        onClick: (...[$event]) => {
            __VLS_ctx.toggleActive(row);
        }
    };
    __VLS_116.slots.default;
    (row.is_active ? '停用' : '启用');
    var __VLS_116;
}
var __VLS_104;
var __VLS_68;
const __VLS_121 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "pager" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.totalCount),
    pageSizes: ([20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}));
const __VLS_123 = __VLS_122({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "pager" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.totalCount),
    pageSizes: ([20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}, ...__VLS_functionalComponentArgsRest(__VLS_122));
let __VLS_125;
let __VLS_126;
let __VLS_127;
const __VLS_128 = {
    onCurrentChange: (__VLS_ctx.loadList)
};
const __VLS_129 = {
    onSizeChange: (__VLS_ctx.loadList)
};
var __VLS_124;
const __VLS_130 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_131 = __VLS_asFunctionalComponent(__VLS_130, new __VLS_130({
    modelValue: (__VLS_ctx.formVisible),
    title: (__VLS_ctx.isEdit ? '编辑凭证' : '创建凭证'),
    width: "560px",
}));
const __VLS_132 = __VLS_131({
    modelValue: (__VLS_ctx.formVisible),
    title: (__VLS_ctx.isEdit ? '编辑凭证' : '创建凭证'),
    width: "560px",
}, ...__VLS_functionalComponentArgsRest(__VLS_131));
__VLS_133.slots.default;
const __VLS_134 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_135 = __VLS_asFunctionalComponent(__VLS_134, new __VLS_134({
    model: (__VLS_ctx.form),
    labelWidth: "100px",
}));
const __VLS_136 = __VLS_135({
    model: (__VLS_ctx.form),
    labelWidth: "100px",
}, ...__VLS_functionalComponentArgsRest(__VLS_135));
__VLS_137.slots.default;
const __VLS_138 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_139 = __VLS_asFunctionalComponent(__VLS_138, new __VLS_138({
    label: "凭证编码",
    required: true,
}));
const __VLS_140 = __VLS_139({
    label: "凭证编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_139));
__VLS_141.slots.default;
const __VLS_142 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_143 = __VLS_asFunctionalComponent(__VLS_142, new __VLS_142({
    modelValue: (__VLS_ctx.form.credential_code),
    disabled: (__VLS_ctx.isEdit),
    placeholder: "CRED-001",
}));
const __VLS_144 = __VLS_143({
    modelValue: (__VLS_ctx.form.credential_code),
    disabled: (__VLS_ctx.isEdit),
    placeholder: "CRED-001",
}, ...__VLS_functionalComponentArgsRest(__VLS_143));
var __VLS_141;
const __VLS_146 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_147 = __VLS_asFunctionalComponent(__VLS_146, new __VLS_146({
    label: "名称",
    required: true,
}));
const __VLS_148 = __VLS_147({
    label: "名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_147));
__VLS_149.slots.default;
const __VLS_150 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_151 = __VLS_asFunctionalComponent(__VLS_150, new __VLS_150({
    modelValue: (__VLS_ctx.form.credential_name),
    placeholder: "北森生产凭证",
}));
const __VLS_152 = __VLS_151({
    modelValue: (__VLS_ctx.form.credential_name),
    placeholder: "北森生产凭证",
}, ...__VLS_functionalComponentArgsRest(__VLS_151));
var __VLS_149;
/** @type {[typeof CredentialForm, ]} */ ;
// @ts-ignore
const __VLS_154 = __VLS_asFunctionalComponent(CredentialForm, new CredentialForm({
    modelValue: (__VLS_ctx.form),
    editMode: (__VLS_ctx.isEdit),
}));
const __VLS_155 = __VLS_154({
    modelValue: (__VLS_ctx.form),
    editMode: (__VLS_ctx.isEdit),
}, ...__VLS_functionalComponentArgsRest(__VLS_154));
const __VLS_157 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
    label: "描述",
}));
const __VLS_159 = __VLS_158({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_158));
__VLS_160.slots.default;
const __VLS_161 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "可选描述",
}));
const __VLS_163 = __VLS_162({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "可选描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_162));
var __VLS_160;
var __VLS_137;
{
    const { footer: __VLS_thisSlot } = __VLS_133.slots;
    const __VLS_165 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({
        ...{ 'onClick': {} },
    }));
    const __VLS_167 = __VLS_166({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_166));
    let __VLS_169;
    let __VLS_170;
    let __VLS_171;
    const __VLS_172 = {
        onClick: (...[$event]) => {
            __VLS_ctx.formVisible = false;
        }
    };
    __VLS_168.slots.default;
    var __VLS_168;
    const __VLS_173 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }));
    const __VLS_175 = __VLS_174({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_174));
    let __VLS_177;
    let __VLS_178;
    let __VLS_179;
    const __VLS_180 = {
        onClick: (__VLS_ctx.submitForm)
    };
    __VLS_176.slots.default;
    var __VLS_176;
}
var __VLS_133;
/** @type {__VLS_StyleScopedClasses['credential-list']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['desc']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-row']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-success']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['pager']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Refresh: Refresh,
            CredentialForm: CredentialForm,
            items: items,
            totalCount: totalCount,
            loading: loading,
            page: page,
            pageSize: pageSize,
            keyword: keyword,
            filterAuthType: filterAuthType,
            formVisible: formVisible,
            isEdit: isEdit,
            submitting: submitting,
            form: form,
            activeCount: activeCount,
            inactiveCount: inactiveCount,
            formatTime: formatTime,
            loadList: loadList,
            openCreateDialog: openCreateDialog,
            openEditDialog: openEditDialog,
            submitForm: submitForm,
            toggleActive: toggleActive,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
