// Plain-text number boxes: accept Arabic digits (٣٫٥) and commas, keep only a valid amount.

const ARABIC_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' }

function toLatinDigits(value) {
  return value
    .replace(/[٠-٩]/g, d => ARABIC_DIGITS[d])
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
}

// "12.5", "١٢٫٥" or "12,5" -> "12.5" (at most 2 decimals)
export function cleanAmount(value) {
  const normalized = toLatinDigits(value).replace(/[٫,]/g, '.').replace(/[^\d.]/g, '')
  const [whole, ...rest] = normalized.split('.')
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole
}

// "١٤" -> "14"
export function cleanWholeNumber(value, maxDigits = 3) {
  return toLatinDigits(value).replace(/\D/g, '').slice(0, maxDigits)
}
