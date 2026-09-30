// PM-T010 团队统计参数采集脚本
// 用法：打开「周期概览 → 统计报表」，粘贴执行；依次点击「部门统计」和「团队统计」；最后执行 window.__pmT010TeamStatsCapture.stop()

(() => {
  const KEY = '__pmT010TeamStatsCapture'
  const previous = window[KEY]
  if (previous?.stop) previous.stop({ copy: false, silent: true })

  const state = {
    startedAt: new Date().toISOString(),
    startedHref: location.href,
    startedPerf: performance.now(),
    records: [],
    clicks: [],
    lastSection: null,
    sequence: 0,
    originals: {},
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const trim = (value, max = 4000) => {
    if (value == null) return null
    const text = String(value)
    return text.length > max ? `${text.slice(0, max)}…` : text
  }
  const normalize = (value) => String(value || '').replace(/\s+/g, '').trim()
  const sectionLabels = /^(部门统计|团队统计)$/
  const currentSection = () => {
    if (state.lastSection) return state.lastSection
    const candidates = [...document.querySelectorAll('*')].filter((el) => sectionLabels.test(normalize(el.textContent)))
    const active = candidates.find((el) => (
      el.getAttribute('aria-current') === 'location'
      || el.getAttribute('aria-selected') === 'true'
      || /(?:active|selected|current)/i.test(String(el.className || ''))
    ))
    return active ? normalize(active.textContent) : null
  }
  const clickedSection = (event) => {
    const path = event.composedPath ? event.composedPath() : []
    const exact = path.find((node) => node?.nodeType === 1 && sectionLabels.test(normalize(node.textContent)))
    if (exact) return normalize(exact.textContent)
    const fallback = path.find((node) => node?.nodeType === 1 && /部门统计|团队统计/.test(normalize(node.textContent)))
    return fallback ? (/团队统计/.test(normalize(fallback.textContent)) ? '团队统计' : '部门统计') : null
  }
  const parseParams = (url) => {
    const parsed = new URL(url, location.href)
    const query = Object.fromEntries(parsed.searchParams.entries())
    return {
      url: parsed.href,
      origin: parsed.origin,
      path: parsed.pathname,
      query,
    }
  }
  const parseBody = (body) => {
    if (body == null || body === '') return null
    if (typeof body === 'string') {
      try {
        const json = JSON.parse(body)
        return { type: 'json', value: json }
      } catch {
        try {
          return { type: 'form', value: Object.fromEntries(new URLSearchParams(body).entries()) }
        } catch {
          return { type: 'text', value: trim(body) }
        }
      }
    }
    if (body instanceof URLSearchParams) return { type: 'form', value: Object.fromEntries(body.entries()) }
    if (body instanceof FormData) return { type: 'form-data', value: Object.fromEntries([...body.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : `[${value.constructor.name}]`])) }
    if (body instanceof Blob) return { type: 'blob', value: `[${body.type || 'application/octet-stream'} ${body.size} bytes]` }
    return { type: typeof body, value: trim(body) }
  }
  const looksLikeRequest = (url) => {
    const parsed = new URL(url, location.href)
    if (!/^https?:$/.test(parsed.protocol)) return false
    if (/\.(?:js|css|map|png|jpe?g|gif|svg|ico|woff2?|ttf|webp|html)(?:$|\?)/i.test(parsed.pathname)) return false
    return true
  }
  const addRecord = (method, url, body, source) => {
    if (!looksLikeRequest(url)) return null
    const parsed = parseParams(url)
    const record = {
      id: ++state.sequence,
      source,
      method: String(method || 'GET').toUpperCase(),
      ...parsed,
      body: parseBody(body),
      activeSection: currentSection(),
      startedAt: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - state.startedPerf),
    }
    state.records.push(record)
    return record
  }

  const onClick = (event) => {
    const label = clickedSection(event)
    if (label) {
      state.lastSection = label
      state.clicks.push({ label, at: new Date().toISOString(), href: location.href })
      console.info('[PM-T010 capture] click:', label)
    }
  }
  document.addEventListener('click', onClick, true)
  state.originals.removeClick = () => document.removeEventListener('click', onClick, true)

  state.originals.fetch = window.fetch
  window.fetch = async function pmT010Fetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url
    const method = init?.method || input?.method || 'GET'
    const body = init?.body
    const record = url ? addRecord(method, url, body, 'fetch') : null
    try {
      const response = await state.originals.fetch.apply(this, arguments)
      if (record) {
        record.status = response.status
        record.statusText = response.statusText
        record.responseContentType = response.headers.get('content-type') || null
      }
      return response
    } catch (error) {
      if (record) record.error = trim(error?.message || error)
      throw error
    }
  }

  state.originals.xhrOpen = XMLHttpRequest.prototype.open
  state.originals.xhrSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function pmT010XhrOpen(method, url) {
    this.__pmT010 = { method, url }
    return state.originals.xhrOpen.apply(this, arguments)
  }
  XMLHttpRequest.prototype.send = function pmT010XhrSend(body) {
    const meta = this.__pmT010 || {}
    const record = meta.url ? addRecord(meta.method, meta.url, body, 'xhr') : null
    if (record) {
      this.addEventListener('loadend', () => {
        record.status = this.status
        record.statusText = this.statusText
        record.responseContentType = this.getResponseHeader('content-type') || null
      }, { once: true })
      this.addEventListener('error', () => { record.error = 'network error' }, { once: true })
      this.addEventListener('abort', () => { record.error = 'aborted' }, { once: true })
    }
    return state.originals.xhrSend.apply(this, arguments)
  }

  const stop = async ({ copy = true, silent = false } = {}) => {
    state.originals.fetch && (window.fetch = state.originals.fetch)
    state.originals.xhrOpen && (XMLHttpRequest.prototype.open = state.originals.xhrOpen)
    state.originals.xhrSend && (XMLHttpRequest.prototype.send = state.originals.xhrSend)
    state.originals.removeClick?.()

    await sleep(100)
    const result = {
      meta: {
        url: location.href,
        startedAt: state.startedAt,
        capturedAt: new Date().toISOString(),
        note: '只读采集 fetch/XHR 请求；未读取或修改认证信息，未修改页面数据。',
      },
      clicks: state.clicks,
      requests: state.records,
      comparison: {
        department: state.records.filter((item) => item.activeSection === '部门统计'),
        team: state.records.filter((item) => item.activeSection === '团队统计'),
      },
    }
    if (!silent) {
      const json = JSON.stringify(result, null, 2)
      console.log(json)
      if (copy) {
        try {
          await navigator.clipboard.writeText(json)
          console.log('%c✅ 已复制到剪贴板，请将 JSON 粘贴给 Claude', 'color:#16803c;font-weight:bold')
        } catch {
          console.warn('剪贴板写入失败，请手动复制上方 JSON')
        }
      }
    }
    return result
  }

  window[KEY] = { state, stop }
  console.info('%c✅ PM-T010 参数采集已启动', 'color:#3370ff;font-weight:bold')
  console.info('请依次点击「部门统计」和「团队统计」，每次等待数据加载完成；完成后执行：window.__pmT010TeamStatsCapture.stop()')
})()
