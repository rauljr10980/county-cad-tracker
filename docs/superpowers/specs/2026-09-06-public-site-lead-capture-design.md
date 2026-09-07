# Public Site Lead Capture Consolidation

**Date:** 2026-09-06
**Status:** Approved for planning

## Goal

Every lead-capture form on the public marketing site sends its data to the
private CRM. Today only 4 of 13 form placements do; the other 9 quietly
discard everything a visitor types.

## Why

The public site (`estate-essentials-co`, repo at `C:\Users\Raulm\estate-site`)
and the private CRM (`county-cad-tracker`, this repo) are two separate
deployments. A working, secure pipeline between them already exists —
`POST /api/public/submissions` on the CRM backend, feeding a live **Inbox**
tab (`src/components/inbox/InboxView.tsx`) — but only 4 pages use it. The
other 9 use an older form component (`src/components/site/LeadForm.tsx`,
estate-site repo) whose `onSubmit` only navigates to a thank-you page; it
never makes a network call. A visitor filling out one of those forms sees a
confirmation and believes they reached the business. Nothing was sent
anywhere.

Four of the nine broken placements sit on pages that *also* have a working
form elsewhere on the page (`sell-property`, `distressed-property`,
`inherited-property`, `landlord-help` each render both the broken hero form
and a working body form) — a visitor who only fills out the hero form still
gets nothing sent. The other five solution pages (`financing`, `invest`,
`realtor-partners`, `rental-strategy`, `tenant-problem`) and the four generic
pages (Home, Contact, Schedule, Find a Solution) have no working form at all.

## Scope

Both repos. `estate-site`: every page rendering `LeadForm` or `SolutionPage`.
`county-cad-tracker`: `functions/src/routes/publicIntake.js`,
`functions/src/lib/publicIntake.js`, `functions/prisma/schema.prisma`
(`PublicSubmission`), and `src/components/inbox/InboxView.tsx`. Not the CRM's
`CrmLead`/Contacts system — `PublicSubmission` is a separate, deliberately
lightweight triage table (see the existing `publicIntake.js` header comment);
promoting an Inbox submission into a full CRM contact is a distinct, existing
manual step and out of scope here.

## Decisions

**Converge on `LeadCaptureForm`, retire `LeadForm`.** `LeadCaptureForm`
(`src/components/site/LeadCaptureForm.tsx`) already does everything
`LeadForm` does except offer a "pick your situation" first step, and it does
it correctly — real submission, honeypot, rate-limit handling, inline
success/error states matching the server's actual response. Rather than
fixing a second, parallel implementation, `LeadForm.tsx` is deleted and every
one of its 13 call sites moves to `LeadCaptureForm`.

**The situation-picker survives as one optional field, not a wizard step.**
On the 9 solution-specific pages, the visitor already told you their
situation by navigating there — a "what's your situation?" step is
redundant, so those pages render no such field at all. On the 4 generic
pages (Home, Contact, Schedule, Find a Solution) the topic genuinely isn't
known yet, so `LeadCaptureForm` gains an optional `situationOptions` prop: a
label plus a list of choices, rendered as one required `<select>` ahead of
the Name field when the prop is passed, and rendering nothing when it isn't.
Schedule reuses the exact same prop for a "when's best to reach you?" picker
— same mechanism, different label and options, because the picker is
generically "one more classifying choice before contact info," not
specifically about property situations.

**One new backend field: `situation`, not a schema per page-type.** The
`situation` string travels in the same POST body and lands in one new
`PublicSubmission.situation` column, always present, empty string when the
page has no picker. No separate table or per-source-page shape — the Inbox
already keys plenty of per-`sourcePage` display behavior off one flat
`sourcePage` string, and this follows the same pattern.

**`SolutionPage.tsx`'s hero form is removed, not fixed.** Every route that
renders `SolutionPage` will have its own `LeadCaptureForm` in the page body
(the 4 that already do, plus 5 gaining one — see Data flow below), so a
second form squatting in the hero is redundant the moment it works, not just
while it's broken. Removing it also retires `content.leadForm` (the
"grouped card" layout config used only by the `financing` page's hero form)
and the `layout` prop-threading built solely to support it — dead code once
its only consumer is gone.

**`thank-you.$type.tsx` is left in place, not deleted.** It's possible an
external ad or bookmark links directly to it. Nothing in the app will
navigate to it programmatically anymore once `LeadForm` is gone — that's a
correct, silent consequence of the fix, not something requiring the route's
removal.

## Data model

`functions/prisma/schema.prisma`, `model PublicSubmission` — add one field,
placed after `message`:

```prisma
  situation       String    @default("")
```

`functions/src/lib/publicIntake.js`, `SOURCE_PAGES` — grows from 4 to 13:

```js
const SOURCE_PAGES = [
  // Solution-specific pages — the page itself is the situation.
  'sell-property', 'distressed-property', 'inherited-property', 'landlord-help',
  'financing', 'invest', 'realtor-partners', 'rental-strategy', 'tenant-problem',
  // Generic pages — situation comes from the form's own picker.
  'homepage', 'contact', 'schedule', 'find-a-solution',
];
```

## Backend: accepting `situation`

`functions/src/routes/publicIntake.js`'s `POST /submissions` validation gains
one more optional field, alongside the existing `propertyAddress`/`message`
validators:

```js
body('situation').trim().optional({ checkFalsy: true }).isLength({ max: 200 }).withMessage('Situation is too long'),
```

And in the handler, destructure and store it the same way `propertyAddress`
already is:

```js
const { name, email = '', phone = '', propertyAddress = '', message = '', situation = '', sourcePage } = req.body;
...
    await prisma.publicSubmission.create({
      data: {
        sourcePage,
        name: String(name).trim(),
        email: String(email).trim(),
        phone: String(phone).trim(),
        propertyAddress: String(propertyAddress).trim(),
        message: String(message).trim(),
        situation: String(situation).trim(),
        userAgent: ...,
        ipHash: ...,
      },
    });
```

`situation` is never required server-side (unlike `name` or "at least one
contact method") — it's advisory triage data, not a gate. A solution-specific
page sends an empty string; the server stores it as such, same as any other
optional field here today.

## Frontend: `LeadCaptureForm`'s new prop

`src/components/site/LeadCaptureForm.tsx` (estate-site repo)'s props object
type gains one field, alongside the existing `sourcePage` / `heading` /
`blurb` / `messageLabel` / `className`:

```ts
situationOptions?: {
  label: string;
  options: readonly string[];
};
```

Zod schema: add `situation: z.string().trim()` to `leadFormSchema`'s base
object, then in the existing `.superRefine`, require it only when the prop
was passed — the refine needs access to whether `situationOptions` exists,
so the schema itself is built inside the component (or the refine reads a
value the component only enforces in its own submit handler; either is
acceptable — the point requirement is: a component instance rendered with
`situationOptions` must not submit without a value in that field, and a
component instance rendered without it must not require one).

The rendered field is a `<select>` (matching this file's own `Form`/`FormField`
pattern already used for the other fields), rendered conditionally on
`situationOptions` being passed, placed before the `name` field:

```tsx
{situationOptions && (
  <FormField
    control={form.control}
    name="situation"
    render={({ field }) => (
      <FormItem>
        <FormLabel>{situationOptions.label}</FormLabel>
        <FormControl>
          <select
            {...field}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Choose one
            </option>
            {situationOptions.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
)}
```

The submitted payload (the `submitLead()` call in `onSubmit`) includes
`situation: values.situation` always — an empty string when the field never
rendered, since the schema's default value for `situation` is `""`.

`src/lib/crm.ts`'s `LeadSubmission` type gains `situation: string`, and
`SourcePage` grows to the full 13-value union matching the backend's
`SOURCE_PAGES` exactly:

```ts
export type SourcePage =
  | "sell-property" | "distressed-property" | "inherited-property" | "landlord-help"
  | "financing" | "invest" | "realtor-partners" | "rental-strategy" | "tenant-problem"
  | "homepage" | "contact" | "schedule" | "find-a-solution";
```

## Per-page wiring

| Page | File | Change |
| --- | --- | --- |
| Home | `src/routes/index.tsx` | Replace `<LeadForm situationLabel="What best describes your situation?" situations={problemCards.map(c => c.title)} ctaLabel="Review My Situation" thankYou="general" />` with `<LeadCaptureForm sourcePage="homepage" heading="Tell us what's happening" blurb="Share a few details and we'll follow up with clear next steps." situationOptions={{ label: "What best describes your situation?", options: problemCards.map(c => c.title) }} />` |
| Contact | `src/routes/contact.tsx` | Same `situationOptions`; `sourcePage="contact"`; heading/blurb drawn from the page's existing copy ("Tell us what's happening" / the page's own intro line) |
| Find a Solution | `src/routes/find-a-solution.tsx` | Same `situationOptions`; `sourcePage="find-a-solution"`; rendered where the hero `aside` `<LeadForm>` was |
| Schedule | `src/routes/schedule.tsx` | `situationOptions={{ label: "When is the best time to reach you?", options: times }}`; `sourcePage="schedule"`; heading "Book a conversation" |
| `SolutionPage.tsx` | `src/components/site/SolutionPage.tsx` | Remove the `<LeadForm>` from the hero `aside` entirely, and the `layout`/`content.leadForm` plumbing that fed it. `PageHero`'s `wideAside`/`aside` props simply stop being passed a lead form — confirm `PageHero` still renders sensibly with no `aside` (it should already support that; other pages may already omit it) |
| `sell-property`, `distressed-property`, `inherited-property`, `landlord-help` | their route files | No change — each already has a working `<LeadCaptureForm sourcePage="..." .../>` in the body; only the hero form (removed above, in `SolutionPage.tsx`) goes away |
| `financing`, `invest`, `realtor-partners`, `rental-strategy`, `tenant-problem` | their route files | Add a `<Section><LeadCaptureForm sourcePage="<slug>" heading="..." blurb="..." messageLabel="..." /></Section>` after `<SolutionPage content={...} />`, matching `sell-property.tsx`'s exact structure. Copy tailored per page (e.g. financing: heading "Talk to a financing partner", messageLabel "Anything about your financing goals we should know?") |
| `content/site.ts` | — | Remove the `leadForm:` config block on the `financing` entry (only consumer was the now-deleted hero form) |
| `LeadForm.tsx` | `src/components/site/LeadForm.tsx` | Delete |

## Inbox

`src/components/inbox/InboxView.tsx`:

- `PublicSubmission` type gains `situation: string`.
- `SOURCE_PAGE_LABELS` and `SOURCE_PAGE_TONE` grow to cover all 13 values
  (the 9 new ones need a label each — e.g. `'homepage': 'Homepage'`,
  `'financing': 'Financing'` — and a tone; reuse the existing tone palette,
  assigning by rough category rather than inventing new colors).
- `SubmissionDetails`'s detail dialog shows a "Situation" row — same visual
  treatment as the existing "Property Address" row — rendered only when
  `submission.situation` is non-empty, immediately after the phone/email
  grid and before the Property Address block.

## Error handling

Once wired to `LeadCaptureForm`, all 13 placements get the exact behavior
`LeadCaptureForm` already has on the 4 working pages today: an in-place
success card on `2xx`, an inline "you've already reached out" alert on
`429`, and an inline error alert (with the server's message when available)
on any other failure. No page navigates away on submit anymore. This is
strictly better than today's behavior on the 9 broken placements, where a
network failure was invisible — the visitor always saw "thank you," working
or not.

## Testing

Backend (`functions/src/lib/publicIntake.test.js`, already exists and is
dependency-free per its own header comment):

- `isValidSourcePage` accepts each of the 9 newly added source pages
- `isValidSourcePage` still rejects an arbitrary string
- (in the route-level behavior, exercised indirectly, or noted if only unit
  tested at the `isValidSourcePage` level): a submission with `situation`
  omitted stores an empty string; one with `situation` provided stores it
  trimmed

Frontend (estate-site repo, new or extended test file for
`LeadCaptureForm.tsx`):

- renders no situation field when `situationOptions` is omitted
- renders a `<select>` with the given label and options when
  `situationOptions` is passed
- blocks submission with a validation message when `situationOptions` is
  passed and no option was chosen
- includes the chosen `situation` value in the `submitLead()` call
- includes `situation: ""` in the `submitLead()` call when `situationOptions`
  was never passed

## Risks

**Two repos, one feature.** `estate-site` and `county-cad-tracker` deploy
independently (Railway CLI, separately). The backend's `situation`
field and expanded `SOURCE_PAGES` allow-list must ship *before* or
*alongside* the frontend changes that send them — a frontend deploy that
starts sending `sourcePage: "financing"` against a backend that hasn't yet
added it to `SOURCE_PAGES` gets every financing-page submission rejected
with a 400. Backend deploys first; this is a real sequencing constraint the
implementation plan must call out explicitly, not an implementation detail
to leave implicit.

**Copy for the 5 newly-added body forms is being written now, not lifted
from an existing source.** `sell-property.tsx`'s heading/blurb/messageLabel
were presumably written with care for that specific page; the same needs to
happen for `financing`, `invest`, `realtor-partners`, `rental-strategy`, and
`tenant-problem` rather than reusing one generic string across all five —
copy that's specific to the page performs better and reads less like a
template was stamped down.

**No migration path for submissions already sitting in the Inbox from
before this change.** Existing rows get `situation: ""` via the column's
default — indistinguishable from a solution-specific-page submission that
never had one. This is expected and not a problem: nothing retroactively
needed a situation value that didn't ask for one at submission time.
