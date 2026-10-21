import { Prisma } from "@prisma/client";

/**
 * A JS time as a naive UTC `timestamp`, whatever the database session's TimeZone is. The tables' timestamp columns carry no zone
 * (prisma db push makes TIMESTAMP(3)), and a raw Date parameter is converted through the SESSION zone on its way in: with a
 * non-UTC session zone every stored time, every age and every cutoff would be off by the zone's offset (Neon defaults to UTC, but
 * nothing here may depend on that). Used for every write and every comparison; reads come back as UTC.
 */
export const utcTimestamp = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
