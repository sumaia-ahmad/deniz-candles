// Order statuses (FR-16) with the labels shown to customers (Arabic) and in the dashboard (English).

export const STATUS = {
  pending_review: { ar: 'قيد المراجعة', en: 'Pending review', tone: 'new' },
  changes_proposed: { ar: 'في اقتراح تعديل', en: 'Changes proposed', tone: 'warn' },
  approved: { ar: 'مقبول', en: 'Approved', tone: 'ok' },
  awaiting_deposit: { ar: 'بانتظار العربون', en: 'Awaiting deposit', tone: 'warn' },
  confirmed: { ar: 'مؤكد', en: 'Confirmed', tone: 'ok' },
  in_progress: { ar: 'قيد التحضير', en: 'In progress', tone: 'ok' },
  ready: { ar: 'جاهز', en: 'Ready', tone: 'ok' },
  delivered: { ar: 'تم التسليم', en: 'Delivered', tone: 'done' },
  rejected: { ar: 'مرفوض', en: 'Rejected', tone: 'closed' },
  cancelled: { ar: 'ملغي', en: 'Cancelled', tone: 'closed' },
}

// The main path a successful order follows, used for the progress steps on the tracking page.
export const STEPS = ['pending_review', 'approved', 'confirmed', 'in_progress', 'ready', 'delivered']

export function formatMoney(value) {
  return value === null || value === undefined ? null : `$${Number(value).toFixed(2).replace(/\.00$/, '')}`
}

export function formatDate(iso, locale = 'ar-SY') {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
