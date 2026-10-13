import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function useProjectReportNavigation(root: Ref<HTMLElement | null>) {
  const activeKey = ref('overview')
  const menuHeight = ref(408)
  let scroller: HTMLElement | null = null
  let observer: ResizeObserver | null = null
  let frame = 0
  let disposed = false
  const offset = () => Number.parseFloat(root.value ? getComputedStyle(root.value).getPropertyValue('--report-sticky-offset') : '') || 68
  const sections = () => [...(root.value?.querySelectorAll<HTMLElement>('[data-report-section]') || [])]

  function measure() {
    if (!scroller || !root.value) return
    root.value.style.setProperty('--report-scroll-padding', getComputedStyle(scroller).paddingTop)
    const items = sections()
    const threshold = scroller.getBoundingClientRect().top + offset() + 48 + 1
    let selected: HTMLElement | undefined = items[0]
    for (const item of items) {
      if (item.getBoundingClientRect().top <= threshold) selected = item
    }
    if (scroller.scrollTop > 0 && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 2) selected = items.at(-1)
    if (selected) activeKey.value = selected.dataset.reportSection || 'overview'
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
    if (!scroller) return
    const top = scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset() - 40
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
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
    for (let el = root.value?.parentElement; el; el = el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) { scroller = el; break }
    }
    scroller?.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    if (typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(schedule)
    void refresh()
  })

  onBeforeUnmount(() => {
    disposed = true
    if (frame) cancelAnimationFrame(frame)
    observer?.disconnect()
    scroller?.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
  })

  return { activeKey, menuHeight, select, refresh }
}
