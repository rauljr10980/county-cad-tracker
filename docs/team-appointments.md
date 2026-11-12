# LLC labels and team appointments

Property details, pre-foreclosure details, and driving-lead details offer a saved LLC owner label. Admins and operators can add or remove it through `PATCH /api/property-labels/llc`.

“Wants to Make a Deal” and “Appt Set” open a date picker with a local time, duration, and notes. Canceling does not change the record. Saving posts explicit timezone timestamps to `POST /api/appointments`, creating a timed, team-visible FollowUp. A pre-foreclosure deal status changes in the same database transaction as the meeting. Appointment activity statistics are recorded in that transaction as well. Repeated requests from the same dialog use an idempotency key.

Every authenticated teammate can see team appointments in Calendar. Other follow-ups retain their existing visibility. The organizer and admins can move, complete, or delete an appointment; viewers cannot change one. The open calendar refreshes every minute. Appointments use the CRM calendar and database; Google Calendar credentials are not required.

The additive Prisma schema update adds `ownerIsLlc` on properties, foreclosed records, and driving leads, and `isTeamAppointment`, `appointmentKind`, and `endAt` on follow-ups. Existing records default to an unmarked LLC label and a personal follow-up. Railway's existing startup schema synchronization applies these columns. An equivalent additive migration is included for environments using Prisma migrations.

Validation: appointment input/transaction/idempotency/visibility tests; endpoint authorization and LLC persistence tests; UI label/scheduler/retry/cancel tests; property action entry-point tests; calendar timestamp tests; Vite build; Prisma 5 schema validation. The repository-wide TypeScript check has existing errors outside this feature.
