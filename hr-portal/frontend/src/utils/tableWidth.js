/**
 * 用 canvas 测量文本像素宽度，用于动态计算 el-table 列宽
 * 参考成本分摊系统验证过的方案：避免 EP min-width 静态值被反向压缩
 *
 * 用法：
 *   const widths = calcColWidths(rows, [
 *     ['employee_id', '工号', r => r.employee_id ?? ''],
 *     ['name', '姓名', r => r.name],
 *   ])
 *   // 在模板里：<el-table-column :min-width="widths['name'] ?? 100" />
 */
let _canvas = null;
export function measureText(text, font = '14px sans-serif') {
    if (!_canvas)
        _canvas = document.createElement('canvas');
    const ctx = _canvas.getContext('2d');
    ctx.font = font;
    return Math.ceil(ctx.measureText(text).width) + 24; // +24 for cell padding
}
export function calcColWidths(rows, cols, options = {}) {
    const max = options.max ?? 300;
    const widths = {};
    if (!rows.length)
        return widths;
    for (const [key, label, getter] of cols) {
        let w = measureText(label, 'bold 14px sans-serif');
        for (const row of rows) {
            const val = getter(row);
            if (val)
                w = Math.max(w, measureText(val));
        }
        widths[key] = Math.min(w, max);
    }
    return widths;
}
