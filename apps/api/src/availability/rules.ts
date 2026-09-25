import { Temporal } from '@js-temporal/polyfill';
export interface Window {
  weekday: number;
  startTime: string;
  endTime: string;
}
export interface Interval {
  startsAt: Date;
  endsAt: Date;
}
export interface AvailabilityInput {
  date: string;
  zone: string;
  now: Date;
  durationMinutes: number;
  bufferAfterMinutes: number;
  workingHours: Window[];
  breaks: Window[];
  timeOffs: Interval[];
  appointments: { startsAt: Date; occupiedUntil: Date; status: string }[];
}
export function localInstant(date: string, time: string, zone: string): Date {
  const value = Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(zone, {
    disambiguation: 'reject',
  });
  return new Date(value.epochMilliseconds);
}
export function startOfDay(date: string, zone: string): Date {
  // Query boundaries use the first valid instant of the date, even when midnight is skipped.
  // Appointment wall times still use localInstant with explicit DST rejection.
  return new Date(Temporal.PlainDate.from(date).toZonedDateTime(zone).epochMilliseconds);
}
export function salonDate(value: Date, zone: string): string {
  return Temporal.Instant.from(value.toISOString())
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}
export function overlaps(start: Date, end: Date, otherStart: Date, otherEnd: Date): boolean {
  return start < otherEnd && end > otherStart;
}
export function fitsSchedule(
  start: Date,
  end: Date,
  input: Pick<AvailabilityInput, 'zone' | 'workingHours' | 'breaks' | 'timeOffs'>,
): boolean {
  const date = salonDate(start, input.zone);
  const weekday = Temporal.PlainDate.from(date).dayOfWeek;
  const w = input.workingHours.find((w) => w.weekday === weekday);
  if (!w) return false;
  try {
    if (
      start < localInstant(date, w.startTime, input.zone) ||
      end > localInstant(date, w.endTime, input.zone)
    )
      return false;
    if (
      input.breaks.some(
        (b) =>
          b.weekday === weekday &&
          overlaps(
            start,
            end,
            localInstant(date, b.startTime, input.zone),
            localInstant(date, b.endTime, input.zone),
          ),
      )
    )
      return false;
  } catch {
    return false;
  }
  return !input.timeOffs.some((o) => overlaps(start, end, o.startsAt, o.endsAt));
}
export function slotsForDay(
  input: AvailabilityInput,
): { startsAt: string; endsAt: string; occupiedUntil: string }[] {
  const date = Temporal.PlainDate.from(input.date);
  const today = Temporal.PlainDate.from(salonDate(input.now, input.zone));
  if (
    Temporal.PlainDate.compare(date, today) < 0 ||
    Temporal.PlainDate.compare(date, today.add({ days: 59 })) > 0
  )
    return [];
  const w = input.workingHours.find((w) => w.weekday === date.dayOfWeek);
  if (!w) return [];
  const slots = [];
  // Walk the local grid; reject ambiguous/nonexistent wall times, never silently shift them.
  let wall = Temporal.PlainDateTime.from(`${input.date}T${w.startTime}`);
  const stop = Temporal.PlainDateTime.from(`${input.date}T${w.endTime}`);
  while (Temporal.PlainDateTime.compare(wall, stop) < 0) {
    try {
      const start = localInstant(input.date, wall.toPlainTime().toString(), input.zone);
      const end = new Date(+start + input.durationMinutes * 60000);
      const occupied = new Date(+end + input.bufferAfterMinutes * 60000);
      if (
        +start >= +input.now + 30 * 60000 &&
        fitsSchedule(start, occupied, input) &&
        !input.appointments.some(
          (a) => a.status !== 'CANCELLED' && overlaps(start, occupied, a.startsAt, a.occupiedUntil),
        )
      )
        slots.push({
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          occupiedUntil: occupied.toISOString(),
        });
    } catch {
      /* DST-invalid local slot is deliberately unavailable. */
    }
    wall = wall.add({ minutes: 15 });
  }
  return slots;
}
