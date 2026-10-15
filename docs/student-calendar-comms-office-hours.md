# Student Site calendar, communications and office hours

## Synthetic release data

File: `scripts/seeds/student-calendar-comms-office-hours.sql`

Idempotently seeds the following deterministic fixture records within the existing synthetic CAN Site:
- Two unread Notifications, one Site announcement and one network/program announcement.
- One teacher office-hour ConferenceSeries with three available ConferenceSlots.
- A distinct synthetic guardian and GuardianRelationship for the synthetic student.

The fixture has been inserted into the connected Neon database. The real browser route at `/student/experiences` loads these through server functions and renders them above the older in-memory demonstrations.

## Working persistence

- **Site schedule exception:** changes a synthetic CalendarEvent's `metadata.demoStatus` to scheduled/moved/cancelled and reloads it from Neon. `moved` is deliberately a status simulation: actual start/end timestamps are not changed.
- **Announcement acknowledgement:** updates the synthetic recipient Notification to `read`, with a timestamp.
- **Office-hour selection:** atomically reserves one ConferenceSlot and creates a ConferenceBooking for the separate synthetic guardian/student. A previously reserved slot cannot be reserved again.

## Boundaries

Only reserved fixture IDs are accepted in these server mutation handlers. This release is a synthetic operating demonstration, not general staff calendar management, real student permissions, an actual meeting delivery mechanism, or a notification fan-out engine. The older in-memory cards still exist below the live Neon panel.

## Reset

Re-running the fixture uses `ON CONFLICT DO NOTHING` and will not reset previously acknowledged notices or booked slots. To reset, explicitly restore only synthetic fixture records through an authorized development maintenance script. Do not delete bookings or alter real records in a future mixed-data environment.

## Next increment

1. Convert the in-memory duplicate experiences to use persisted records.
2. Update actual Site event dates/times for rescheduling.
3. Add notifications caused by Site changes, properly audience-scoped.
4. Offer office-hour cancellation/rescheduling.
5. Add synthetic Site personas for both Washington and Florida.
