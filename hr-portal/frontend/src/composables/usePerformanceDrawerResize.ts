import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const STORAGE_NAMESPACE = 'RESIZABLE-DRAWER-LOCKR-NS'
type DrawerResizeProps = {
  modelValue: boolean
  width: string
  initialWidth?: number
  resizable: boolean
  minWidth: number
  maxWidth: number
  oppositeLimitDistance: number
  cacheKey: string
  lang: string
}

export function usePerformanceDrawerResize(props: DrawerResizeProps, onResize: (width: number) => void) {
  const viewportWidth = ref(window.innerWidth)
  const widthValue = ref(Number.parseFloat(props.width) || 480)
  const resizing = ref(false)
  const effectiveMinWidth = computed(() => Math.min(props.minWidth, viewportWidth.value))
  const effectiveMaxWidth = computed(() => Math.max(effectiveMinWidth.value, Math.min(props.maxWidth, viewportWidth.value - props.oppositeLimitDistance)))
  const panelWidth = computed(() => props.resizable ? `${clampWidth(widthValue.value)}px` : props.width)
  let openingViewportWidth = viewportWidth.value
  let previousUserSelect = ''
  let moveTimer: ReturnType<typeof setTimeout> | undefined
  let viewportTimer: ReturnType<typeof setTimeout> | undefined
  let pendingClientX: number | undefined
  let lastMoveAt = -Infinity

  function clampWidth(value: number) {
    return Math.min(Math.max(value, effectiveMinWidth.value), effectiveMaxWidth.value)
  }
  function cachedWidths() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_NAMESPACE) || '{}')
      return stored?.data && typeof stored.data === 'object' && !Array.isArray(stored.data) ? stored.data : {}
    } catch { return {} }
  }
  function ensureCacheDefaults(initial: number) {
    if (!props.cacheKey) return
    const all = cachedWidths()
    const key = `resizable-drawer-${props.cacheKey}`
    const current = all[key] || {}
    const data = { ...all, [key]: { 'zh-CN': current['zh-CN'] ?? initial, 'en-US': current['en-US'] ?? initial } }
    try { localStorage.setItem(STORAGE_NAMESPACE, JSON.stringify({ data })) } catch {}
  }
  function saveWidth() {
    if (!props.cacheKey || !props.resizable) return
    const all = cachedWidths()
    const key = `resizable-drawer-${props.cacheKey}`
    const initial = props.initialWidth ?? Number.parseFloat(props.width)
    const current = all[key] || { 'zh-CN': initial, 'en-US': initial }
    try { localStorage.setItem(STORAGE_NAMESPACE, JSON.stringify({ data: { ...all, [key]: { ...current, [props.lang === 'zh-CN' ? 'zh-CN' : 'en-US']: widthValue.value } } })) } catch {}
  }
  function initialize() {
    stopResize()
    viewportWidth.value = window.innerWidth
    openingViewportWidth = viewportWidth.value
    const initial = props.resizable ? props.initialWidth ?? Number.parseFloat(props.width) : Number.parseFloat(props.width)
    if (props.resizable) ensureCacheDefaults(initial)
    const stored = props.cacheKey ? cachedWidths()[`resizable-drawer-${props.cacheKey}`]?.[props.lang === 'zh-CN' ? 'zh-CN' : 'en-US'] : null
    widthValue.value = props.resizable ? clampWidth(typeof stored === 'number' && Number.isFinite(stored) && stored > 0 && viewportWidth.value > stored ? stored : initial) : initial
  }
  function updateWidth(value: number) {
    const next = clampWidth(value)
    if (next === widthValue.value) return
    widthValue.value = next
    onResize(next)
  }
  function applyMove() {
    moveTimer = undefined
    if (!resizing.value || pendingClientX === undefined) return
    const clientX = pendingClientX
    pendingClientX = undefined
    lastMoveAt = Date.now()
    const bodyWidth = document.body.offsetWidth || viewportWidth.value
    updateWidth(bodyWidth - (clientX - document.body.offsetLeft))
  }
  function moveResize(event: MouseEvent) {
    if (!resizing.value) return
    pendingClientX = event.clientX
    const elapsed = Date.now() - lastMoveAt
    if (elapsed >= 50) {
      if (moveTimer !== undefined) clearTimeout(moveTimer)
      applyMove()
    } else if (moveTimer === undefined) moveTimer = setTimeout(applyMove, 50 - elapsed)
  }
  function startResize(event: MouseEvent) {
    if (!props.resizable || event.button !== 0 || resizing.value) return
    event.preventDefault()
    event.stopPropagation()
    lastMoveAt = -Infinity
    previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    resizing.value = true
    document.addEventListener('mousemove', moveResize)
    document.addEventListener('mouseup', stopResize)
    window.addEventListener('blur', stopResize)
  }
  function stopResize() {
    if (moveTimer !== undefined) clearTimeout(moveTimer)
    if (!resizing.value) return
    applyMove()
    resizing.value = false
    document.body.style.userSelect = previousUserSelect
    saveWidth()
    document.removeEventListener('mousemove', moveResize)
    document.removeEventListener('mouseup', stopResize)
    window.removeEventListener('blur', stopResize)
  }
  function measureViewport() {
    stopResize()
    const next = window.innerWidth
    viewportWidth.value = next
    if (!props.resizable || next >= openingViewportWidth || widthValue.value < next - props.oppositeLimitDistance) return
    const available = next - props.oppositeLimitDistance
    updateWidth(available <= props.minWidth ? effectiveMinWidth.value : Math.max(props.minWidth, widthValue.value / (openingViewportWidth - props.oppositeLimitDistance) * available))
    saveWidth()
  }
  function scheduleViewportResize() {
    if (viewportTimer !== undefined) clearTimeout(viewportTimer)
    viewportTimer = setTimeout(measureViewport, 300)
  }
  function onDraggerKeydown(event: KeyboardEvent) {
    if (!props.resizable || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    updateWidth(event.key === 'Home' ? effectiveMinWidth.value : event.key === 'End' ? effectiveMaxWidth.value : clampWidth(widthValue.value) + (event.key === 'ArrowLeft' ? 16 : -16))
    saveWidth()
  }
  watch(() => [props.modelValue, props.width, props.initialWidth, props.cacheKey, props.lang], () => {
    if (props.modelValue) initialize()
    else stopResize()
  }, { immediate: true })
  onMounted(() => window.addEventListener('resize', scheduleViewportResize))
  onBeforeUnmount(() => {
    stopResize()
    if (viewportTimer !== undefined) clearTimeout(viewportTimer)
    window.removeEventListener('resize', scheduleViewportResize)
  })
  return { resizing, effectiveMinWidth, effectiveMaxWidth, widthValue, panelWidth, clampWidth, startResize, stopResize, onDraggerKeydown }
}
