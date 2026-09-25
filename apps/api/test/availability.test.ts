import { describe, it, expect } from 'vitest';
import { slotsForDay, localInstant, startOfDay } from '../src/availability/rules';

const base = {
  date: '2030-01-07',
  zone: 'Asia/Almaty',
  now: new Date('2030-01-06T00:00:00Z'),
  durationMinutes: 60,
  bufferAfterMinutes: 15,
  workingHours: [{ weekday: 1, startTime: '10:00', endTime: '18:00' }],
  breaks: [],
  timeOffs: [],
  appointments: [],
};
describe('availability uses half-open occupied intervals', () => {
  it('includes buffer and permits adjacent intervals', () => {
    const slots = slotsForDay({
      ...base,
      appointments: [
        {
          startsAt: new Date('2030-01-07T05:00Z'),
          occupiedUntil: new Date('2030-01-07T06:15Z'),
          status: 'CONFIRMED',
        },
      ],
    });
    expect(slots[0]).toEqual({
      startsAt: '2030-01-07T06:15:00.000Z',
      endsAt: '2030-01-07T07:15:00.000Z',
      occupiedUntil: '2030-01-07T07:30:00.000Z',
    });
    expect(slots.at(-1)?.occupiedUntil).toBe('2030-01-07T13:00:00.000Z');
  });
  it('handles short and long services without rounding to hours', () => {
    expect(slotsForDay({ ...base, durationMinutes: 30, bufferAfterMinutes: 0 })).toHaveLength(31);
    expect(
      slotsForDay({ ...base, durationMinutes: 150, bufferAfterMinutes: 15 }).at(-1)?.startsAt,
    ).toBe('2030-01-07T10:15:00.000Z');
  });
  it('excludes a lunch break including preparation time', () => {
    const slots = slotsForDay({
      ...base,
      breaks: [{ weekday: 1, startTime: '12:00', endTime: '13:00' }],
    });
    expect(slots.some((s) => s.startsAt === '2030-01-07T06:00:00.000Z')).toBe(false);
    expect(slots.some((s) => s.startsAt === '2030-01-07T08:00:00.000Z')).toBe(true);
  });
  it('blocks absences and days off', () => {
    expect(slotsForDay({ ...base, workingHours: [] })).toEqual([]);
    expect(
      slotsForDay({
        ...base,
        timeOffs: [
          { startsAt: new Date('2030-01-07T00:00Z'), endsAt: new Date('2030-01-08T00:00Z') },
        ],
      }),
    ).toEqual([]);
  });
  it('enforces 30 minute lead time inclusively', () => {
    expect(slotsForDay({ ...base, now: new Date('2030-01-07T04:30Z') })[0]?.startsAt).toBe(
      '2030-01-07T05:00:00.000Z',
    );
    expect(slotsForDay({ ...base, now: new Date('2030-01-07T04:30:01Z') })[0]?.startsAt).toBe(
      '2030-01-07T05:15:00.000Z',
    );
  });
  it('limits to today and the next 59 calendar dates in salon zone', () => {
    expect(slotsForDay({ ...base, date: '2030-03-08' })).toEqual([]);
    expect(slotsForDay({ ...base, date: '2030-01-05' })).toEqual([]);
    expect(
      slotsForDay({
        ...base,
        date: '2030-03-06',
        workingHours: [{ weekday: 3, startTime: '10:00', endTime: '18:00' }],
      }).length,
    ).toBeGreaterThan(0);
  });
  it('cancelled visits release time; partial overlap stays occupied', () => {
    expect(
      slotsForDay({
        ...base,
        appointments: [
          {
            startsAt: new Date('2030-01-07T05:30Z'),
            occupiedUntil: new Date('2030-01-07T06:30Z'),
            status: 'CANCELLED',
          },
        ],
      })[0]?.startsAt,
    ).toBe('2030-01-07T05:00:00.000Z');
    expect(
      slotsForDay({
        ...base,
        appointments: [
          {
            startsAt: new Date('2030-01-07T05:30Z'),
            occupiedUntil: new Date('2030-01-07T06:30Z'),
            status: 'CONFIRMED',
          },
        ],
      })[0]?.startsAt,
    ).toBe('2030-01-07T06:30:00.000Z');
  });
  it('uses earliest valid day boundary when DST changes at midnight', () => {
    expect(startOfDay('2030-03-10', 'America/Havana').toISOString()).toBe(
      '2030-03-10T05:00:00.000Z',
    );
    expect(startOfDay('2030-11-03', 'America/Havana').toISOString()).toBe(
      '2030-11-03T04:00:00.000Z',
    );
  });
  it('rejects nonexistent and ambiguous local instants explicitly', () => {
    expect(() => localInstant('2030-03-10', '02:30', 'America/New_York')).toThrow();
    expect(() => localInstant('2030-11-03', '01:30', 'America/New_York')).toThrow();
  });
});
