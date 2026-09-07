# Public Site Lead Capture Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every lead-capture form on the public marketing site sends its data to the private CRM — today only 4 of 13 form placements do.

**Architecture:** Converge every public-site form on the already-working `LeadCaptureForm` → `POST /api/public/submissions` pipeline. Delete the parallel `LeadForm` component, whose `onSubmit` only navigates to a thank-you page and never makes a network call. Add one optional `situationOptions` prop to `LeadCaptureForm` so the 4 generic pages keep their "what's your situation?" picker as a single field rather than a wizard step; the 9 solution-specific pages render no picker at all, since the page topic already says it.

**Tech Stack:** Backend — Express, Prisma, `express-validator`, `express-rate-limit` (county-cad-tracker repo). Frontend forms — React 19, React Hook Form, Zod, TanStack Router/Start (estate-site repo). CRM Inbox — React, Vitest, Testing Library (county-cad-tracker repo).

**Spec:** `docs/superpowers/specs/2026-09-06-public-site-lead-capture-design.md`

## Global Constraints

- **This plan spans two independent git repositories.** Tasks 1–2 operate in
  this repo (`county-cad-tracker`, wherever this plan's worktree/session is
  rooted). Tasks 3–6 operate in a **second, separate repository** at
  `C:\Users\Raulm\estate-site` (remote: `github.com/rauljr10980/estate-essentials-co`,
  currently on a clean `main`) — it is not a subdirectory or worktree of this
  repo, has its own git history, and needs its own feature branch (e.g.
  `feat/lead-capture-consolidation`) and its own commits. Whoever executes
  this plan must `cd` there (or open a second workspace) for Tasks 3–6.
- **estate-site has no test framework installed today** (no `vitest`, no
  `@testing-library/react`, no `test` script in `package.json`, and no
  existing `*.test.*` files under `src/`). Bootstrapping one is out of scope
  for this plan — it's a separate decision with its own footprint. Tasks in
  that repo are verified with `npm run build` (TanStack Start's Vite build,
  which runs the TypeScript checks that matter here) and by reading the
  diff carefully, not with an automated test run. This is a deliberate,
  known gap, not an oversight — flag it to your human partner if you think
  it should change, but don't add a test framework as a side effect of this
  plan.
- **Deployment order matters and is not part of this plan's tasks.**
  `county-cad-tracker` (Tasks 1–2) must deploy to Railway before
  `estate-site` (Tasks 3–6) does — a frontend that sends `sourcePage:
  "financing"` against a backend that hasn't yet added it to `SOURCE_PAGES`
  gets every one of those submissions rejected with a 400. Deploying either
  repo is an outward-facing action outside this plan's scope; stop and
  confirm with your human partner before deploying anything, in the order
  above.
- `PublicSubmission` is a distinct, deliberately lightweight triage table —
  not the CRM's `CrmLead`/Contacts model. Promoting an Inbox row into a full
  CRM contact is an existing manual step and out of scope here.
- Backend is CommonJS; the CRM frontend and estate-site are both ESM/TSX.
- county-cad-tracker has no local database — never run `prisma db push` or
  any `migrate` command against a real database in this environment.
  `prisma validate`/`prisma generate` need `DATABASE_URL`; a dummy
  `postgresql://u:p@localhost:5432/db` works without connecting. Schema
  changes reach production through `functions/start.sh`'s own `prisma db
  push` at deploy time.
- Commit after every task, in the correct repo for that task.

---

## File Structure

| File | Repo | Responsibility |
| --- | --- | --- |
| `functions/prisma/schema.prisma` | county-cad-tracker | `PublicSubmission` gains `situation` |
| `functions/src/lib/publicIntake.js` | county-cad-tracker | `SOURCE_PAGES` allow-list, now 13 values |
| `functions/src/lib/publicIntake.test.js` | county-cad-tracker | Tests for the above |
| `functions/src/routes/publicIntake.js` | county-cad-tracker | Accepts and stores `situation` |
| `src/components/inbox/InboxView.tsx` | county-cad-tracker | Displays `situation`; labels/tones for all 13 source pages |
| `src/components/inbox/InboxView.test.tsx` | county-cad-tracker | Tests for the above |
| `src/components/site/LeadCaptureForm.tsx` | estate-site | Gains the optional `situationOptions` prop |
| `src/lib/crm.ts` | estate-site | `SourcePage` union grows to 13 values; `LeadSubmission` gains `situation` |
| `src/components/site/SolutionPage.tsx` | estate-site | Hero `LeadForm` removed |
| `src/content/site.ts` | estate-site | `financing`'s `leadForm` config removed |
| `src/routes/index.tsx`, `contact.tsx`, `schedule.tsx`, `find-a-solution.tsx` | estate-site | Rewired to `LeadCaptureForm` |
| `src/routes/financing.tsx`, `invest.tsx`, `realtor-partners.tsx`, `rental-strategy.tsx`, `tenant-problem.tsx` | estate-site | Gain a body `LeadCaptureForm` |
| `src/components/site/LeadForm.tsx` | estate-site | Deleted |

---

### Task 1: Backend accepts `situation` and 9 more source pages

**Files:**
- Modify: `functions/prisma/schema.prisma`
- Modify: `functions/src/lib/publicIntake.js`
- Modify: `functions/src/lib/publicIntake.test.js`
- Modify: `functions/src/routes/publicIntake.js`

**Interfaces:**
- Consumes: nothing
- Produces: `SOURCE_PAGES` (13-value array), `isValidSourcePage` (unchanged
  signature, now validates against the 13-value list), the
  `PublicSubmission.situation` column, `POST /api/public/submissions`
  accepting an optional `situation` field in its body

- [ ] **Step 1: Add the `situation` column**

In `functions/prisma/schema.prisma`, `model PublicSubmission`, add
immediately after `message`:

```prisma
  situation       String    @default("")
```

- [ ] **Step 2: Verify the schema**

```bash
cd functions
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma generate
```

Expected: valid, and `Generated Prisma Client`. Do not run `db push` or any
`migrate` command.

- [ ] **Step 3: Update the failing test for the expanded allow-list**

In `functions/src/lib/publicIntake.test.js`, the first test currently
asserts an exact 4-value array. Replace it:

```js
  it('lists exactly the thirteen known pages', () => {
    expect(SOURCE_PAGES).toEqual([
      'sell-property', 'distressed-property', 'inherited-property', 'landlord-help',
      'financing', 'invest', 'realtor-partners', 'rental-strategy', 'tenant-problem',
      'homepage', 'contact', 'schedule', 'find-a-solution',
    ]);
  });
```

The next test in the same file, `'accepts each known page'`, already loops
over `SOURCE_PAGES` — it needs no edit and will automatically cover all 13
once Step 4 updates the source array.

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run functions/src/lib/publicIntake.test.js`
Expected: FAIL — the exact-array assertion doesn't match the current
4-value `SOURCE_PAGES`.

- [ ] **Step 5: Expand `SOURCE_PAGES`**

In `functions/src/lib/publicIntake.js`, replace the `SOURCE_PAGES` constant
and update its preceding comment (the old comment names only the four
funnel pages, which is no longer accurate):

```js
// The thirteen pages on the public marketing site
// (rauljr10980/estate-essentials-co) that POST here — 9 solution-specific
// pages (the page itself is the situation) and 4 generic pages (Home,
// Contact, Schedule, Find a Solution) that carry their own `situation`
// picker instead. `sourcePage` is the Inbox's primary signal, so anything
// outside this list is rejected rather than stored as an arbitrary string.
const SOURCE_PAGES = [
  'sell-property', 'distressed-property', 'inherited-property', 'landlord-help',
  'financing', 'invest', 'realtor-partners', 'rental-strategy', 'tenant-problem',
  'homepage', 'contact', 'schedule', 'find-a-solution',
];
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run functions/src/lib/publicIntake.test.js`
Expected: PASS, all existing tests in this file green (35 assertions across
the file's existing `describe` blocks, unchanged in count except the one
edited in Step 3).

- [ ] **Step 7: Accept and store `situation` in the route**

In `functions/src/routes/publicIntake.js`, add one more validator to the
`POST /submissions` validator array, immediately after the `message`
validator:

```js
    body('situation').trim().optional({ checkFalsy: true }).isLength({ max: 200 }).withMessage('Situation is too long'),
```

Then in the handler, add `situation` to the destructure and to the
`prisma.publicSubmission.create` call:

```js
    const { name, email = '', phone = '', propertyAddress = '', message = '', situation = '', sourcePage } = req.body;
```

```js
      await prisma.publicSubmission.create({
        data: {
          sourcePage,
          name: String(name).trim(),
          email: String(email).trim(),
          phone: String(phone).trim(),
          propertyAddress: String(propertyAddress).trim(),
          message: String(message).trim(),
          situation: String(situation).trim(),
          userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
          ipHash: hashIp(req.ip),
        },
      });
```

`situation` is never required — a solution-specific page sends an empty
string, same as any other optional field here today.

- [ ] **Step 8: Verify the route**

```bash
node --check functions/src/routes/publicIntake.js
npm test
```

Expected: `node --check` exits 0 with no output. `npm test`'s total passes
unchanged from Step 6 — this route file requires Prisma at module scope
(same reason `functions/src/lib/pipelineQueues.js` documents for its own
pure-module split) and has no direct unit tests; its only new logic here is
one more optional field threaded through an existing pattern, verified by
reading the diff against Step 7's exact code.

- [ ] **Step 9: Commit**

```bash
git add functions/prisma/schema.prisma functions/src/lib/publicIntake.js functions/src/lib/publicIntake.test.js functions/src/routes/publicIntake.js
git commit -m "Accept situation field and 9 more source pages in public intake"
```

---

### Task 2: CRM Inbox displays `situation` and all 13 source pages

**Files:**
- Modify: `src/components/inbox/InboxView.tsx`
- Modify: `src/components/inbox/InboxView.test.tsx`

**Interfaces:**
- Consumes: nothing new from Task 1 at the type level (this is a separate
  frontend hitting the same JSON API; it only needs to agree on shape)
- Produces: `PublicSubmission` type now includes `situation: string`

- [ ] **Step 1: Extend the `PublicSubmission` type**

In `src/components/inbox/InboxView.tsx`, add to the `PublicSubmission`
type, after `message`:

```ts
  situation: string;
```

- [ ] **Step 2: Extend the label/tone maps**

Replace `SOURCE_PAGE_LABELS` and `SOURCE_PAGE_TONE` with the 13-entry
versions (also update the preceding comment, which currently says "same
four funnel pages"):

```ts
// The thirteen source pages the public marketing site's forms POST from —
// see functions/src/lib/publicIntake.js's SOURCE_PAGES, which the backend
// enforces as an allow-list. Kept in sync by hand: this is a display map on
// the frontend, that one is validation on the backend.
const SOURCE_PAGE_LABELS: Record<string, string> = {
  'sell-property': 'Sell Property',
  'distressed-property': 'Distressed Property',
  'inherited-property': 'Inherited Property',
  'landlord-help': 'Landlord Help',
  'financing': 'Financing',
  'invest': 'Invest',
  'realtor-partners': 'Realtor Partners',
  'rental-strategy': 'Rental Strategy',
  'tenant-problem': 'Tenant Problem',
  'homepage': 'Homepage',
  'contact': 'Contact',
  'schedule': 'Schedule',
  'find-a-solution': 'Find a Solution',
};
const sourcePageLabel = (page: string) => SOURCE_PAGE_LABELS[page] ?? page;

const SOURCE_PAGE_TONE: Record<string, string> = {
  'sell-property': 'blue',
  'distressed-property': 'danger',
  'inherited-property': 'warn',
  'landlord-help': 'success',
  'financing': 'blue',
  'invest': 'success',
  'realtor-partners': 'warn',
  'rental-strategy': 'blue',
  'tenant-problem': 'danger',
  'homepage': 'grey',
  'contact': 'grey',
  'schedule': 'grey',
  'find-a-solution': 'grey',
};
```

- [ ] **Step 3: Fix the empty-state copy**

The `'none'`-kind branch of `EmptyState` currently hardcodes "four forms"
and names them by name — no longer accurate at 13. Replace its paragraph,
keeping the exact phrase `none of those forms are live on the site yet`
intact (an existing test asserts on it):

```tsx
        <p className="mx-auto mt-1.5 max-w-md text-muted-foreground">
          The inbox fills automatically from every lead-capture form on the marketing site. None
          of those forms are live on the site yet, so nothing has come in. Submissions will show
          up here as soon as they launch.
        </p>
```

- [ ] **Step 4: Add the Situation row to the detail dialog**

In `SubmissionDetails`, inside the first `<section>` (phone/email grid,
followed by the Property Address block), add a conditional row right after
the phone/email grid `<div>` and before the Property Address `<div>`:

```tsx
        {submission.situation && (
          <div>
            <p className="label">SITUATION</p>
            <p className="record">{submission.situation}</p>
          </div>
        )}
```

- [ ] **Step 5: Write the failing test for the new dialog row**

In `src/components/inbox/InboxView.test.tsx`, `makeSubmission`'s default
object needs `situation: overrides.situation ?? ''` added (alongside the
other defaulted fields) so every existing test keeps compiling and passing
with the new required field present.

Then add a new test in the `'InboxView rows'` describe block:

```tsx
  it('shows the Situation row in the detail dialog only when one was submitted', async () => {
    const withSituation = makeSubmission({ id: 'with-situation', name: 'Has Situation', situation: 'I need to sell a property' });
    vi.stubGlobal('fetch', mockFetchRouter({
      statusTotals: { new: 1, contacted: 0, converted: 0, spam: 0 },
      bulkItems: [withSituation],
      mainList: () => [withSituation],
    }));

    render(<InboxView />);

    await waitFor(() => expect(screen.getByText('Has Situation')).toBeTruthy());
    fireEvent.click(screen.getByText('Has Situation'));

    await waitFor(() => expect(screen.getByText('I need to sell a property')).toBeTruthy());
    expect(screen.queryByText('SITUATION')).toBeTruthy();
  });
```

- [ ] **Step 6: Run the tests to verify the new one fails, then passes**

Run: `npx vitest run src/components/inbox/InboxView.test.tsx`
Expected first: FAIL — `situation` isn't rendered yet if Step 4 hasn't
landed, or the type doesn't compile yet if Step 1 hasn't. Apply Steps 1–4
if not already done, then re-run.
Expected after: PASS, all tests in the file green (previous count + 1).

- [ ] **Step 7: Run the full suite**

```bash
npm test
```

Expected: total test count is Task 1's backend total plus this file's new
total, with nothing else changed. Report the exact before/after numbers you
observe.

- [ ] **Step 8: Commit**

```bash
git add src/components/inbox/InboxView.tsx src/components/inbox/InboxView.test.tsx
git commit -m "Show situation and all 13 source pages in the CRM Inbox"
```

---

### Task 3: `LeadCaptureForm` gains an optional situation picker

**Repo:** estate-site (`C:\Users\Raulm\estate-site`). Before starting, create
a feature branch: `git checkout -b feat/lead-capture-consolidation` from a
clean `main`.

**Files:**
- Modify: `src/components/site/LeadCaptureForm.tsx`
- Modify: `src/lib/crm.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `LeadCaptureForm`'s props gain `situationOptions?: { label:
  string; options: readonly string[] }`; `SourcePage` (13-value union);
  `LeadSubmission` gains `situation: string`

- [ ] **Step 1: Expand `SourcePage` and `LeadSubmission`**

In `src/lib/crm.ts`, replace the `SourcePage` type:

```ts
/** The page a submission came from. Must match the server's SOURCE_PAGES exactly. */
export type SourcePage =
  | "sell-property" | "distressed-property" | "inherited-property" | "landlord-help"
  | "financing" | "invest" | "realtor-partners" | "rental-strategy" | "tenant-problem"
  | "homepage" | "contact" | "schedule" | "find-a-solution";
```

Add `situation` to `LeadSubmission`, after `propertyAddress`:

```ts
  situation: string;
```

- [ ] **Step 2: Add the `situation` field to the form schema**

In `src/components/site/LeadCaptureForm.tsx`, add to `leadFormSchema`'s
object, after `propertyAddress`:

```ts
    situation: z.string().trim(),
```

- [ ] **Step 3: Add the `situationOptions` prop and require a value when it's passed**

Add to the component's props type, after `messageLabel`:

```ts
  /** When provided, renders a required "pick one" field above Name using this label and list — e.g. a situation category or a preferred contact time. Omit on pages where the topic is already known. */
  situationOptions?: {
    label: string;
    options: readonly string[];
  };
```

Destructure `situationOptions` in the function signature, alongside the
existing props. In `onSubmit`'s `superRefine` (the block currently checking
`!data.email && !data.phone`), add a check gated on the closed-over
`situationOptions`:

```ts
    if (situationOptions && !data.situation) {
      ctx.addIssue({ code: "custom", message: "Please choose one.", path: ["situation"] });
    }
```

Because this refine needs to see `situationOptions` (a prop, not form
data), and `leadFormSchema` is currently declared as a module-level
constant, move the `.superRefine(...)` call's schema construction inside
the component function body (or wrap it in a small factory called with
`situationOptions` at render time) so the refine closes over the prop
correctly. The exact code:

```ts
const leadFormSchema = (situationOptions: { label: string; options: readonly string[] } | undefined) =>
  z
    .object({
      name: z.string().trim().min(1, "Enter your name.").max(120, "Name must be 120 characters or fewer."),
      email: z.string().trim(),
      phone: z.string().trim().max(40, "Phone must be 40 characters or fewer."),
      propertyAddress: z.string().trim().max(300, "Address must be 300 characters or fewer."),
      situation: z.string().trim(),
      message: z.string().trim().max(4000, "Message must be 4000 characters or fewer."),
      website: z.string(),
    })
    .superRefine((data, ctx) => {
      if (!data.email && !data.phone) {
        const message = "Enter an email address or phone number so we can reach you.";
        ctx.addIssue({ code: "custom", message, path: ["email"] });
        ctx.addIssue({ code: "custom", message, path: ["phone"] });
      }
      if (data.email && !emailPattern.test(data.email)) {
        ctx.addIssue({ code: "custom", message: "Enter a valid email address.", path: ["email"] });
      }
      if (situationOptions && !data.situation) {
        ctx.addIssue({ code: "custom", message: "Please choose one.", path: ["situation"] });
      }
    });

type LeadFormValues = z.infer<ReturnType<typeof leadFormSchema>>;
```

Inside the component, build the resolver from this factory:

```ts
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema(situationOptions)),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      propertyAddress: "",
      situation: "",
      message: "",
      website: "",
    },
    mode: "onBlur",
  });
```

- [ ] **Step 4: Include `situation` in the submitted payload**

In `onSubmit`, add `situation: values.situation` to the `submitLead(...)`
call, alongside the other fields.

- [ ] **Step 5: Render the field**

Immediately before the existing `name` `FormField`, add:

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
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

- [ ] **Step 6: Verify**

```bash
npm run build
```

Expected: exits 0. This is the verification for this task (see Global
Constraints — no test framework exists in this repo yet). Read the diff
once more against Steps 1–5 before moving on: confirm `situationOptions`
renders nothing when omitted (the 9 solution-specific pages, wired in Task
6, pass no such prop and must see no new field), and that
`defaultValues.situation` is always `""` so the payload's `situation` field
is never `undefined`.

- [ ] **Step 7: Commit**

```bash
git add src/components/site/LeadCaptureForm.tsx src/lib/crm.ts
git commit -m "Add optional situation picker to LeadCaptureForm"
```

---

### Task 4: Remove the dead hero form from `SolutionPage`

**Repo:** estate-site, same branch as Task 3.

**Files:**
- Modify: `src/components/site/SolutionPage.tsx`
- Modify: `src/content/site.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `SolutionPage`'s hero no longer renders any lead form; every
  route using it keeps working (their own body forms are unaffected)

- [ ] **Step 1: Remove the hero `LeadForm` and its supporting code**

In `src/components/site/SolutionPage.tsx`:

- Remove the import: `import { LeadForm } from "./LeadForm";`
- Remove the line `const layout = content.leadForm;`
- In the `<PageHero .../>` call, remove the `wideAside={Boolean(layout)}`
  prop and the entire `aside={...}` prop (the whole block containing
  `<LeadForm ... />`).

The result should read:

```tsx
export function SolutionPage({ content }: { content: SolutionContent }) {
  return (
    <>
      <PageHero
        eyebrow={content.eyebrow}
        title={content.headline}
        intro={content.empathy}
        note={`Serving ${site.serviceArea}.`}
        actions={
          <>
            <Button asChild variant="cta" size="xl">
              <Link to="/schedule">
                Schedule a Conversation <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl">
              <a href={site.phoneHref}>
                <Phone /> Call {site.phoneDisplay}
              </a>
            </Button>
          </>
        }
        {...(content.slug === "financing" ? { backdrop: financingHero } : {})}
      />
      <TrustBar />
```

(Everything below `<TrustBar />` in this file is unrelated to the lead form
and stays exactly as it is.)

- [ ] **Step 2: Remove `financing`'s now-orphaned `leadForm` config**

In `src/content/site.ts`, remove the `leadForm: { ... }` block (the
"grouped card" layout, currently the last field before the closing `},` of
the `financing` entry in the `solutions` array) — its only consumer was the
hero form just removed in Step 1.

Leave `SolutionContent`'s `leadForm?` field declaration, and the
`ctaLabel`/`situationLabel`/`situations`/`thankYou` fields on every solution
entry, in place. They become unused by this change but removing them from
all 9 entries is unrelated cleanup outside this plan's scope — see the
spec's Decisions section.

- [ ] **Step 3: Verify**

```bash
npm run build
```

Expected: exits 0. Confirm by reading the diff that no other file still
references `content.leadForm` or the removed `layout`/`wideAside` values
(only `SolutionPage.tsx` and `content.ts`'s `financing` entry touched them).

- [ ] **Step 4: Commit**

```bash
git add src/components/site/SolutionPage.tsx src/content/site.ts
git commit -m "Remove the non-functional hero lead form from SolutionPage"
```

---

### Task 5: Rewire the 4 generic pages and delete `LeadForm`

**Repo:** estate-site, same branch.

**Files:**
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/contact.tsx`
- Modify: `src/routes/schedule.tsx`
- Modify: `src/routes/find-a-solution.tsx`
- Delete: `src/components/site/LeadForm.tsx`

**Interfaces:**
- Consumes: `LeadCaptureForm` with `situationOptions` (Task 3)
- Produces: nothing new — this is the last task that touches `LeadForm`'s
  importers

- [ ] **Step 1: Rewire the homepage**

In `src/routes/index.tsx`:
- Replace the import `import { LeadForm } from "@/components/site/LeadForm";`
  with `import { LeadCaptureForm } from "@/components/site/LeadCaptureForm";`
- Replace the `<LeadForm ... />` call (inside `<Section tone="dark">`) with:

```tsx
          <LeadCaptureForm
            sourcePage="homepage"
            heading="Tell us what's happening"
            blurb="Share a few details and we'll follow up with clear next steps."
            messageLabel="Anything else we should know?"
            situationOptions={{
              label: "What best describes your situation?",
              options: problemCards.map((c) => c.title),
            }}
          />
```

`problemCards` is already imported in this file.

- [ ] **Step 2: Rewire Contact**

In `src/routes/contact.tsx`:
- Replace the import the same way.
- Replace the `<LeadForm ... />` call with:

```tsx
        <LeadCaptureForm
          sourcePage="contact"
          heading="Send us the details"
          blurb="Call, text, or send the details below. A real person reviews every submission."
          messageLabel="What's happening?"
          situationOptions={{
            label: "What best describes your situation?",
            options: problemCards.map((c) => c.title),
          }}
        />
```

`problemCards` is already imported in this file.

- [ ] **Step 3: Rewire Schedule**

In `src/routes/schedule.tsx`:
- Replace the import the same way.
- Replace the `<LeadForm ... />` call with:

```tsx
        <LeadCaptureForm
          sourcePage="schedule"
          heading="Request your consultation"
          blurb="Tell us when works and what the conversation is about. We'll confirm a time by your preferred contact method."
          messageLabel="What would you like to talk through?"
          situationOptions={{
            label: "When is the best time to reach you?",
            options: times,
          }}
        />
```

`times` is already defined at the top of this file.

- [ ] **Step 4: Rewire Find a Solution**

In `src/routes/find-a-solution.tsx`:
- Replace the import the same way.
- Replace the `<LeadForm tone="dark" ... />` call (inside `<PageHero
  aside={...}>`) with:

```tsx
          <LeadCaptureForm
            sourcePage="find-a-solution"
            heading="Review my situation"
            blurb="Tell us what's happening and we'll point you to the right next step."
            messageLabel="Anything else we should know?"
            situationOptions={{
              label: "What best describes your situation?",
              options: problemCards.map((c) => c.title),
            }}
          />
```

`problemCards` is already imported in this file. `LeadCaptureForm` has no
`tone` prop — its card styling is self-contained and reads correctly
against both the light hero background here and the dark section on the
homepage (Step 1), matching the pattern `PageHero`'s own light "reveal"
column already uses against a dark backdrop elsewhere on the site.

- [ ] **Step 5: Confirm no importers remain, then delete `LeadForm.tsx`**

```bash
grep -rn "LeadForm\b" src --include="*.tsx" --include="*.ts" | grep -v "LeadCaptureForm\|LeadFormValues\|leadFormSchema"
```

Expected: no output (every remaining match should be `LeadCaptureForm`,
`LeadFormValues`, or `leadFormSchema` — all inside `LeadCaptureForm.tsx`
itself, none of them the deleted component).

```bash
rm src/components/site/LeadForm.tsx
```

- [ ] **Step 6: Verify**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Rewire generic pages to LeadCaptureForm and delete LeadForm"
```

---

### Task 6: Add a working form to the 5 pages that have none

**Repo:** estate-site, same branch.

**Files:**
- Modify: `src/routes/financing.tsx`
- Modify: `src/routes/invest.tsx`
- Modify: `src/routes/realtor-partners.tsx`
- Modify: `src/routes/rental-strategy.tsx`
- Modify: `src/routes/tenant-problem.tsx`

**Interfaces:**
- Consumes: `LeadCaptureForm` (Task 3), `sourcePage` values `financing`,
  `invest`, `realtor-partners`, `rental-strategy`, `tenant-problem` (all
  already valid per Task 3's `SourcePage` union; accepted server-side once
  Task 1 is deployed)
- Produces: nothing new — every `SolutionPage`-rendering route now has
  exactly one working form, matching `sell-property.tsx`'s existing pattern

- [ ] **Step 1: Add the form to each page**

Each of these 5 files currently has the exact same one-line body (`return
<SolutionPage content={solutionBySlug["<slug>"]!} />;`). For each, add the
import and body form, following `sell-property.tsx`'s exact structure:

`src/routes/financing.tsx` — add imports
`import { LeadCaptureForm } from "@/components/site/LeadCaptureForm";` and
`import { Section } from "@/components/site/Section";`, then replace the
`Page` function body:

```tsx
function Page() {
  return (
    <>
      <SolutionPage content={solutionBySlug["financing"]!} />
      <Section>
        <LeadCaptureForm
          sourcePage="financing"
          heading="Talk to a financing partner"
          blurb="Tell us what you're trying to finance and we'll connect you with the right program through Certified Home Loans."
          messageLabel="Anything about your financing goals or timeline we should know?"
        />
      </Section>
    </>
  );
}
```

`src/routes/invest.tsx` — same two imports, then:

```tsx
function Page() {
  return (
    <>
      <SolutionPage content={solutionBySlug["invest"]!} />
      <Section>
        <LeadCaptureForm
          sourcePage="invest"
          heading="Start building your portfolio"
          blurb="Tell us about your investing goals and we'll help you find the right acquisition strategy."
          messageLabel="What are you hoping to buy or grow toward?"
        />
      </Section>
    </>
  );
}
```

`src/routes/realtor-partners.tsx` — same two imports, then:

```tsx
function Page() {
  return (
    <>
      <SolutionPage content={solutionBySlug["realtor-partners"]!} />
      <Section>
        <LeadCaptureForm
          sourcePage="realtor-partners"
          heading="Bring us a referral"
          blurb="Tell us about the situation you're referring and we'll take it from there."
          messageLabel="What's the property situation you're referring to us?"
        />
      </Section>
    </>
  );
}
```

`src/routes/rental-strategy.tsx` — same two imports, then:

```tsx
function Page() {
  return (
    <>
      <SolutionPage content={solutionBySlug["rental-strategy"]!} />
      <Section>
        <LeadCaptureForm
          sourcePage="rental-strategy"
          heading="Find the right rental strategy"
          blurb="Tell us about the property and we'll help you compare strategies before you commit to one."
          messageLabel="What's the property, and what are you weighing?"
        />
      </Section>
    </>
  );
}
```

`src/routes/tenant-problem.tsx` — same two imports, then:

```tsx
function Page() {
  return (
    <>
      <SolutionPage content={solutionBySlug["tenant-problem"]!} />
      <Section>
        <LeadCaptureForm
          sourcePage="tenant-problem"
          heading="Talk through your tenant situation"
          blurb="Tell us what's going on with the lease or tenant and we'll walk you through your options."
          messageLabel="What's happening with the tenant or lease?"
        />
      </Section>
    </>
  );
}
```

None of these five pass `situationOptions` — the page topic already is the
situation, matching `sell-property.tsx`'s existing body form exactly.

- [ ] **Step 2: Verify**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/routes/financing.tsx src/routes/invest.tsx src/routes/realtor-partners.tsx src/routes/rental-strategy.tsx src/routes/tenant-problem.tsx
git commit -m "Add working lead forms to the 5 pages that had none"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| `PublicSubmission.situation` column | 1 |
| `SOURCE_PAGES` grows to 13 | 1 |
| Route accepts/stores `situation` | 1 |
| Inbox shows `situation`, all 13 labels/tones | 2 |
| Inbox empty-state copy no longer says "four forms" | 2 |
| `LeadCaptureForm`'s optional `situationOptions` prop | 3 |
| `SourcePage`/`LeadSubmission` type updates | 3 |
| `SolutionPage`'s hero form removed | 4 |
| `financing`'s `leadForm` config removed | 4 |
| 4 generic pages rewired, `situationOptions` used | 5 |
| `LeadForm.tsx` deleted | 5 |
| 5 solution pages gain a working body form | 6 |
| Deployment-order risk | Called out in Global Constraints, not a task (deploying is outside this plan's scope) |

**Placeholder scan:** clean — every step has literal, complete code. The one
explicit scope boundary (leaving `ctaLabel`/`situationLabel`/`situations`/
`thankYou` on `SolutionContent`) is stated as a deliberate decision with its
reasoning, not a TBD.

**Type consistency:** `SourcePage` (Task 3) lists the same 13 values, in the
same grouping, as `SOURCE_PAGES` (Task 1) and `SOURCE_PAGE_LABELS`/`
SOURCE_PAGE_TONE` (Task 2) — solution-specific pages first, generic pages
last, exact string values matching across all three. `situationOptions`'s
shape (`{ label: string; options: readonly string[] }`) is identical
everywhere it's referenced (Task 3's prop type, every call site in Tasks 5
and 6's absence of it).

**A sequencing note:** Task 4 must run before Task 5's deletion step (Task 4
removes `SolutionPage.tsx`'s import of `LeadForm`; Task 5 verifies via grep
that no importers remain before deleting the file — if Task 4 hasn't run,
that grep will find `SolutionPage.tsx` and Task 5's deletion step is wrong
to proceed). Task 3 must run before Tasks 5 and 6, both of which use
`LeadCaptureForm` props or `sourcePage` values Task 3 introduces. Tasks 1–2
(county-cad-tracker) have no code dependency on Tasks 3–6 (estate-site) or
vice versa — only the deployment-order constraint in Global Constraints
connects them.
