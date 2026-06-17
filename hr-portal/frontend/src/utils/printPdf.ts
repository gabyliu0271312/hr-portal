// 把 PDF Blob 通过隐藏 iframe 静默调起浏览器打印(协议、收入证明等共用)
export function printPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.src = url
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => {
      URL.revokeObjectURL(url)
      frame.remove()
    }, 3000)
  }
  document.body.appendChild(frame)
}
