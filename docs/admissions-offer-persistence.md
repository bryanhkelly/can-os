# Admissions offers: persistence foundation

Migration 0003 adds program-and-school-year seat pool rows and durable admissions offers. A seat pool has a unique (program, school year) boundary. Offers record actor IDs, issue/response timestamps, expiry, and an idempotency key. The migration adds database checks for nonnegative seat capacity, valid waitlist flags, valid offer statuses, and a partial unique index preventing multiple simultaneously active offers for an application and school year. These constraints must be applied and verified before offer writes are enabled.

**This migration is not yet applied automatically to production.** It must be applied through the project's controlled deployment process before using the new tables.

Required next step: a command service with real staff/guardian authorization and a single transaction that locks the seat pool row, validates the application and school-year/program relationship, counts active enrollments plus still-valid held offers, issues or accepts the offer, and emits audit events. The check and write must happen under the same seat-pool lock. Enrollment activation must use the same lock and ensure accepted-offer ownership before inserting an enrollment.

Current capacity previews and the older activation command are not authoritative seat-allocation workflows; do not enable real-family enrollment until those checks and integration tests are in place.
