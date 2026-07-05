// Shared formatting helpers used across the decision, hardware, and sovereign views.

export function money(n) {
  if (!isFinite(n)) return '—'
  if (n >= 1000) return '$' + Math.round(n).toLocaleString()
  if (n >= 1) return '$' + n.toFixed(2)
  return '$' + n.toFixed(3)
}

export function compact(n) {
  if (!isFinite(n)) return '—'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return Math.round(n).toString()
}
