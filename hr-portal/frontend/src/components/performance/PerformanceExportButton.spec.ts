import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PerformanceExportButton from './PerformanceExportButton.vue'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('PerformanceExportButton', () => {
  it('downloads a UTF-8 CSV, escapes cells, protects formulas and releases the URL', async () => {
    let csv = ''
    class CsvBlob {
      constructor(parts: string[]) { csv = parts.join('') }
    }
    vi.stubGlobal('Blob', CsvBlob)
    const create = vi.fn().mockReturnValue('blob:export')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    let filename = ''
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download })
    const wrapper = mount(PerformanceExportButton, { props: { filename: '人员/名单', loadRows: async () => [['姓名', '说明'], ['张三', 'a,"b"\n下一行'], ['=1+1', ' @SUM(A1)']] } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(csv).toBe('﻿"姓名","说明"\r\n"张三","a,""b""\n下一行"\r\n"\'=1+1","\' @SUM(A1)"')
    expect(click).toHaveBeenCalledTimes(1)
    expect(filename).toBe('人员_名单.csv')
    expect(revoke).toHaveBeenCalledWith('blob:export')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(wrapper.emitted('success')).toHaveLength(1)
  })

  it('blocks duplicate exports and reports failures without downloading', async () => {
    let reject!: (error: Error) => void
    const loadRows = vi.fn().mockImplementation(() => new Promise<string[][]>((_resolve, fail) => { reject = fail }))
    const create = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
    const wrapper = mount(PerformanceExportButton, { props: { filename: '人员', loadRows } })
    await wrapper.get('button').trigger('click')
    await wrapper.get('button').trigger('click')
    expect(loadRows).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    reject(new Error('network'))
    await flushPromises()
    expect(create).not.toHaveBeenCalled()
    expect(wrapper.emitted('error')).toHaveLength(1)
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })
})
