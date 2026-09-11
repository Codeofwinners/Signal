# Signal — Consumer AI Visibility

A manual AIO/GEO tracking workspace built with Next.js 16 App Router, TypeScript, Tailwind CSS 4, shadcn-style Radix UI components, Supabase Auth/PostgreSQL/Storage, Zod, and Recharts. Deployable to Vercel with pnpm.

A human performs every check in the **free, logged-out consumer interfaces** of **ChatGPT, Gemini, Perplexity, and Claude**. The app never queries AI services. There are no AI API integrations, scraping tools, browser automation, background workers, or scheduled jobs.

## Setup

Requires Node.js 22.16+ (Node 24 LTS recommended), pnpm 10, and a Supabase project. Development verification used Node 25.3.0.

1. Install dependencies: `pnpm install --frozen-lockfile`.
2. Create a Supabase project. In its SQL Editor, execute the complete file `supabase/migrations/202609100001_initial.sql` **once** against an empty project. Alternatively apply the migration using your existing Supabase CLI migration workflow.
3. In Supabase Authentication settings, disable public user signups for this internal app. Create each user's email/password account in the Supabase dashboard. This app supports password sign-in; administrators handle invitations and password resets. Each user sees only projects they own. There are no organization/team roles.
4. Copy `.env.example` to `.env.local` and set:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```

   Use the **publishable** key from Supabase's project API settings, never a secret or service-role key. Both values are intentionally browser-visible; RLS protects the data.

5. Run `pnpm dev`, then open `http://localhost:3000`.
6. Sign in, create a project with its target brand, add prompts, and create a tracking cycle.

Without environment variables, the app presents an unconfigured dashboard with empty values and a setup notice. It has no demo data and cannot save anything. Restart/rebuild after changing environment variables, because Next.js embeds public variables at build time.

## Manual workflow

- **Project settings:** edit project identity, domain, location, logo URL, target brand, and comma-separated aliases. Logo URLs must use HTTPS. Target and aliases share a stable brand ID.
- **Prompts:** add/edit prompt text, topic, intent, location, and active status. Set inactive to retire a prompt from future cycles. Existing cycle prompts remain visible and unchanged.
- **New cycle:** choose a name and measurement date. A single database transaction snapshots all active prompts and creates exactly four pending checks for each prompt. Empty cycles are rejected.
- **Entry:** click Pending or Next Pending, copy the prompt, manually perform the logged-out consumer check, and enter the result. Add competitors via autocomplete; type a new name to create a competitor inline. Target mention flags automatically create one target appearance; add the target to the brand list to enter repeated mention counts or recommendations.
- **Citations:** paste HTTP(S) URLs. Domains are normalized automatically. Record title, position, and associated brand where available.
- **Screenshots:** attach one or more PNG/JPEG/WebP files, at most 10 MB each. They upload to a private Supabase bucket. Existing evidence is retained during corrections. Result details show signed image previews.
- **Save & Next Pending:** saves and opens the next pending check in the selected cycle and engine/topic/search scope. Cmd/Ctrl+Enter performs the same action. Ordinary Save returns to the current view. Pending checks wrap around the list and skip complete/skipped/error entries.
- **Corrections:** open an existing check, then Correct result. Last-update checks prevent silent overwrites from another tab. Reload after a conflict.
- **Reports:** choose a cycle and export a CSV containing methodology, summary metrics, and individual runs. CSV cells are escaped and protected against spreadsheet formula injection. Competitors and Sources provide detailed breakdowns; History shows cycle comparisons.
- **Links:** result and brand detail routes can be copied and reopened by the same authenticated owner.

## Metric definitions

All analytics filter to `status = complete` before calculating denominators. Pending, skipped, and error checks do not lower visibility.

| Metric           | Definition                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| AI visibility    | Complete checks with target mentioned / complete checks × 100                                       |
| Average position | Mean target position among complete checks where the target was mentioned and ranked                |
| Top 3 presence   | Complete checks where the target was mentioned at position 1–3 / **all complete checks** × 100      |
| Citation rate    | Complete checks with target cited / complete checks × 100                                           |
| Share of voice   | Sum of target mention counts / sum of all tracked brand mention counts within complete checks × 100 |

A zero denominator displays **—**, never fabricated 0%. The Top 3 denominator is explicitly defined as all complete checks; an absent or unranked brand has no top-three presence. Competitor average position averages ranked appearances per run; competitor top-three appearances count runs, not repeated mention counts.

Current vs. previous uses the immediately preceding cycle ordered by measurement date, then creation time. Differences are **percentage points**. Incomplete coverage can differ between cycles; completion counts are displayed alongside comparisons.

Cycle status is pending until the first result, in_progress while any pending checks remain, and completed once every check is complete, skipped, or error. The visible **complete / total** progress percentage may be less than 100% for a resolved cycle containing skipped/error checks.

## Data and security

The migration defines the nine requested tables: `projects`, `brands`, `brand_aliases`, `prompts`, `tracking_cycles`, `prompt_runs`, `mentions`, `citations`, and `screenshots`.

Additional fields serve necessary integrity requirements:

- `projects.owner_id`: simple authenticated ownership for RLS.
- `prompt_runs.prompt_snapshot` / `topic_snapshot`: preserve original cycle wording and topic after prompt edits.

Foreign keys enforce project/cycle/prompt relationships. A partial unique index allows one target brand per project; project creation inserts that target atomically. Mention and citation triggers reject brands from another project. The target identity cannot be deleted or reassigned. Existing prompts with runs cannot be deleted through their foreign keys; use inactive status instead.

RLS scopes every table to the authenticated project owner. Cycles, results, mentions, citations, and screenshot metadata have read-only client policies; writes occur through ownership-checked transactional RPCs. Save operations serialize within each cycle and atomically replace mentions/citations, attach screenshots, and recalculate cycle status. Failed transactions leave old results intact. Project edits and alias replacement are transactional as well.

The `screenshots` bucket is private with server-enforced size/MIME limits. Object paths are `project_id/run_id/random_uuid.ext`. Storage policies validate both IDs against an owned run. Screenshots are attached only if their object exists. Failed saves clean up uncommitted uploads where possible. A network interruption may leave an unattached object; an administrator can remove it later. Linked screenshot evidence cannot be deleted by the client. Signed preview URLs expire after one hour; reload the detail page to renew them.

No privileged key is needed by the app. The browser authenticates with Supabase and accesses data directly through RLS. Raw response text is rendered as text, not HTML. Loading uses paginated Supabase reads to avoid silently truncating results at the default row cap. The MVP loads the selected project's history into memory; very large multi-year workspaces may eventually need server-side aggregation.

## Architecture

- `app/`: Next.js App Router entry points, error states, global responsive styling.
- `components/workspace.tsx`: authenticated workspace and navigation.
- `components/forms.tsx`: validated project, prompt, competitor, and cycle forms.
- `components/result-entry.tsx`: fast manual capture with keyboard workflow.
- `components/analytics.tsx`: overview, competitors, sources, history, and result evidence.
- `components/ui/`: shadcn-compatible Button and Radix Dialog primitives, including focus trapping and accessible dialogs.
- `lib/types.ts`: domain types and exactly four supported engines.
- `lib/validation.ts`: Zod schemas, safe domain extraction, and screenshot validation.
- `lib/metrics.ts`: reusable, UI-independent metric/progress/navigation functions.
- `lib/repository.ts`: paginated data loading, storage, RPC saves, and CSV export.
- `supabase/migrations/`: schema, integrity rules, RLS, bucket, and RPCs.
- `tests/`: metric tests, migration tests on real embedded PostgreSQL (PGlite), and result-editor integration using an in-memory DOM.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The tests cover completed-only denominators, empty datasets, all four engines, next-pending wraparound, percentage-point changes, normalized URLs, invalid result inputs, historical prompt snapshots, database access isolation, cycle completion, optimistic conflict handling, cross-project references, screenshot attachment rollback/policies, and the editor's save/upload/keyboard workflow. UI integration uses simulated Supabase responses; it does not query external services or run browser automation. Synthetic records exist only in tests.

**Before production use, verify against your actual Supabase project:**

1. Sign in as two users and verify project isolation.
2. Create a project and two active prompts; create a cycle and verify eight pending checks.
3. Enter checks on each engine, attach real screenshots, and verify image previews after reload.
4. Use Save & Next Pending and Cmd/Ctrl+Enter, including the last pending check.
5. Mark checks skipped/error and confirm they do not enter metrics.
6. Edit a prompt and start another cycle; verify old wording/results remain intact.
7. Check desktop (1440 px), tablet (768 px), and mobile (390 px) layouts manually. The sidebar becomes a drawer, cards stack, forms collapse, and wide tables scroll horizontally.
8. Review CSV output, source filters, historical deltas, direct detail links, and sign-out.

Connected-service verification passed for password authentication, project/cycle creation across all four engines, real PNG upload and signed preview retrieval, cross-user database/storage isolation, conflict rejection, historical cycles, and the exact repository joins. All temporary test accounts, records, and screenshot objects were removed. Public signups are disabled on the connected project. Desktop/mobile visual review remains a manual check.

For administrative project removal, delete that project’s tracking cycles before deleting the project so historical brand references are removed in foreign-key order. Project deletion is intentionally not exposed in the app.

## Vercel

Import this repository into Vercel with the Next.js preset. Select Node 24.x, install with `pnpm install --frozen-lockfile`, and build with `pnpm build`. Add both `NEXT_PUBLIC_SUPABASE_*` values to the appropriate Vercel environments **before** the build. Apply the database migration to the associated Supabase project and create your internal user accounts before use. Set the Supabase Site URL to your deployed URL. No Vercel cron configuration or additional infrastructure is required.

This workspace includes deployment-ready source; creating a Vercel deployment requires your Vercel project/account and is not performed by the app itself.
