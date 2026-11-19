import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function useProjectReportNavigation(root: Ref<HTMLElement | null>) {
  const activeKey = ref('overview')
  const visibleKeys = ref<string[]>([])
  const menuHeight = ref(408)
  let scroller: HTMLElement | null = null
  let observer: ResizeObserver | null = null
  let frame = 0
  let disposed = false
  const offset = () => Number.parseFloat(root.value ? getComputedStyle(root.value).getPropertyValue('--report-sticky-offset') : '') || 68
  const sections = () => [...(root.value?.querySelectorAll<HTMLElement>('[data-report-section]') || [])]

  function measure() {
    if (!root.value) return
    root.value.style.setProperty('--report-scroll-padding', scroller ? getComputedStyle(scroller).paddingTop : '0px')
    const items = sections().filter(item => item.getBoundingClientRect().height > 0)
    const top = scroller?.getBoundingClientRect().top ?? 0
    const bottom = scroller ? Math.min(window.innerHeight, top + scroller.clientHeight) : window.innerHeight
    const threshold = top + offset() + 48 + 1
    let selected: HTMLElement | undefined = items[0]
    const visible: string[] = []
    for (const item of items) {
      const box = item.getBoundingClientRect()
      if (box.top <= threshold) selected = item
      if (box.bottom > Math.max(top, 0) && box.top < bottom && box.height > 0) visible.push(item.dataset.reportSection || '')
    }
    const scrollTop = scroller?.scrollTop ?? window.scrollY
    const scrollHeight = scroller?.scrollHeight ?? document.documentElement.scrollHeight
    const clientHeight = scroller?.clientHeight ?? window.innerHeight
    if (scrollTop > 0 && scrollHeight - clientHeight - scrollTop <= 2) selected = items.at(-1)
    if (selected) activeKey.value = selected.dataset.reportSection || 'overview'
    if (visible.join('|') !== visibleKeys.value.join('|')) visibleKeys.value = visible
    const nav = root.value.querySelector<HTMLElement>('.report-navigation')
    if (nav) menuHeight.value = Math.max(68, window.innerHeight - nav.getBoundingClientRect().top - 32 - 24)
  }

  function schedule() {
    if (disposed) return
    if (frame) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { frame = 0; measure() })
  }

  function select(key: string) {
    const target = sections().find(item => item.dataset.reportSection === key)
    if (!target) return
    activeKey.value = key
    const top = (scroller?.scrollTop ?? window.scrollY) + target.getBoundingClientRect().top - (scroller?.getBoundingClientRect().top ?? 0) - offset() - 40
    if (scroller) scroller.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
    else window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
    schedule()
  }

  async function refresh() {
    await nextTick()
    if (disposed) return
    observer?.disconnect()
    if (root.value) observer?.observe(root.value)
    sections().forEach(item => observer?.observe(item))
    schedule()
  }

  onMounted(() => {
    for (let el = root.value?.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) { scroller = el; break }
    }
    if (scroller && root.value) root.value.dataset.reportScroll = 'true'
    ;(scroller || window).addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    if (typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(schedule)
    void refresh()
  })

  onBeforeUnmount(() => {
    disposed = true
    if (frame) cancelAnimationFrame(frame)
    observer?.disconnect()
    ;(scroller || window).removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
  })

  return { activeKey, visibleKeys, menuHeight, select, refresh }
}
