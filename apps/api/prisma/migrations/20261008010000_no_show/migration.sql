-- The master can mark a past visit as missed; such visits stay in the history.
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';
