export const TAG_FILL_QUESTION_FIXTURES = [
    {
        id: '7173973572648894465',
        name: '价值观',
        description: '对创新价值观正直、开放、专业、进取的认同度和行为表现作评价，反映工作过程中采用的方式方法。',
        creator: 'alice.xiao肖惠方',
        createdAt: '2022-12-06 18:06',
        remark: '',
        tags: [{ id: 'value-1', name: '价值观测评语', description: '', prompt: '' }],
    },
    {
        id: '7173973572648894466',
        name: '投入度',
        description: '',
        creator: 'alice.xiao肖惠方',
        createdAt: '2022-06-21 19:13',
        remark: '',
        tags: [{ id: 'input-1', name: '投入度评价', description: '', prompt: '' }],
    },
    {
        id: '7173973572648894467',
        name: '价值贡献',
        description: '',
        creator: 'alice.xiao肖惠方',
        createdAt: '2022-06-21 18:27',
        remark: '',
        tags: [{ id: 'contribution-1', name: '价值贡献评价', description: '', prompt: '' }],
    },
];
export function cloneTagFillQuestion(record) {
    return {
        ...record,
        tags: record.tags.map((tag) => ({ ...tag })),
    };
}
