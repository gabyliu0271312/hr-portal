export const QUESTION_TYPE_OPTIONS = [
    { key: 'regular', label: '常规评估项' },
    { key: 'okr', label: 'OKR 评估项' },
    { key: 'bonus', label: '加分项' },
    { key: 'deduction', label: '减分项' },
];
export function questionTypeLabel(type) {
    return QUESTION_TYPE_OPTIONS.find((item) => item.key === type)?.label ?? type;
}
