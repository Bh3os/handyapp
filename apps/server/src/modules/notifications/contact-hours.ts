// Daily contact hours (TSK-0047; HH-COM-09, FACT-HOURS, FACT-TIMEZONE). A released reminder whose cadence is held to
// contact hours sends only inside them; released outside them it waits for the next opening. The hours and the zone
// are configuration (`contact.hours`, `business.timezone`); while either is NOT CONFIGURED nothing is held back by a
// guessed window, and the caller decides (here: it sends at once and says so in the delivery row).

type Parts = { year: number; month: number; day: number; hour: number; minute: number }

function zonedParts(instant: Date, zone: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const p = Object.fromEntries(f.formatToParts(instant).map((x) => [x.type, x.value]))
  return {
    year: Number(p['year']),
    month: Number(p['month']),
    day: Number(p['day']),
    hour: Number(p['hour']),
    minute: Number(p['minute']),
  }
}

/** The UTC instant of a wall-clock time in a zone (two passes settle the offset across DST changes). */
export function zonedTimeToUtc(p: Parts, zone: string): Date {
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  let guess = wall
  for (let i = 0; i < 2; i++) {
    const seen = zonedParts(new Date(guess), zone)
    const seenWall = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute)
    guess += wall - seenWall
  }
  return new Date(guess)
}

const minutes = (hhmm: string) => {
  const [h = '0', m = '0'] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/** `now` when it is inside [open, close) local time, otherwise the next opening. */
export function nextContactTime(now: Date, hours: { open: string; close: string }, zone: string): Date {
  const local = zonedParts(now, zone)
  const at = local.hour * 60 + local.minute
  const open = minutes(hours.open)
  const close = minutes(hours.close)
  if (at >= open && at < close) return now
  const openParts = { ...local, hour: Math.floor(open / 60), minute: open % 60 }
  if (at < open) return zonedTimeToUtc(openParts, zone)
  // After closing: tomorrow's opening (calendar day arithmetic on the local date).
  const tomorrow = new Date(Date.UTC(local.year, local.month - 1, local.day + 1))
  return zonedTimeToUtc(
    { ...openParts, year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth() + 1, day: tomorrow.getUTCDate() },
    zone,
  )
}
