export const PASSWORD_POLICY_HINT = '至少 8 位，且必须包含大写字母、小写字母、数字和特殊符号'

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SPECIALS = '!@#$%^&*()-_=+[]{};:,.?'
const ALL_PASSWORD_CHARS = LOWERCASE + UPPERCASE + DIGITS + SPECIALS

function randomChar(chars: string): string {
  const values = new Uint32Array(1)
  window.crypto.getRandomValues(values)
  return chars[values[0] % chars.length]
}

function shuffle(chars: string[]): string[] {
  const result = [...chars]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const values = new Uint32Array(1)
    window.crypto.getRandomValues(values)
    const j = values[0] % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function generateStrongPassword(length = 12): string {
  const safeLength = Math.max(length, 8)
  const chars = [
    randomChar(UPPERCASE),
    randomChar(LOWERCASE),
    randomChar(DIGITS),
    randomChar(SPECIALS),
  ]
  while (chars.length < safeLength) {
    chars.push(randomChar(ALL_PASSWORD_CHARS))
  }
  return shuffle(chars).join('')
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 8) return '密码至少 8 位'
  if (!/[A-Z]/.test(password)) return '密码必须包含大写字母'
  if (!/[a-z]/.test(password)) return '密码必须包含小写字母'
  if (!/[0-9]/.test(password)) return '密码必须包含数字'
  if (!/[!-\/:-@[-`{-~]/.test(password)) return '密码必须包含特殊符号'
  return null
}
