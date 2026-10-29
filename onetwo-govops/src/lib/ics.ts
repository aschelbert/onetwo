/**
 * Generate a valid .ics (iCalendar) string for a single event.
 * The caller can create a Blob + trigger download via URL.createObjectURL.
 */
export function generateICS(event: {
  title: string
  description?: string
  location?: string
  startsAt: Date
  endsAt?: Date
  allDay?: boolean
}): string {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@onetwo`
  const now = formatDateUTC(new Date())

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ONE two//Case Ops//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
  ]

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(event.startsAt)}`)
    if (event.endsAt) {
      lines.push(`DTEND;VALUE=DATE:${formatDateOnly(event.endsAt)}`)
    }
  } else {
    lines.push(`DTSTART:${formatDateUTC(event.startsAt)}`)
    if (event.endsAt) {
      lines.push(`DTEND:${formatDateUTC(event.endsAt)}`)
    }
  }

  lines.push(`SUMMARY:${escapeICS(event.title)}`)

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICS(event.description)}`)
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeICS(event.location)}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')

  return lines.join('\r\n')
}

/** Format Date as UTC iCalendar timestamp: 20260115T143000Z */
function formatDateUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Format Date as iCalendar date-only value: 20260115 */
function formatDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** Escape special characters for iCalendar text values */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/** Helper: trigger a .ics file download in the browser */
export function downloadICS(icsContent: string, filename: string) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
