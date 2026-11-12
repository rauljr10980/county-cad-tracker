# Per-member tab subscriptions

Open Manager Settings, expand a tab, and select its subscribers. All members and
No members are bulk shortcuts for that tab. Save assignments writes every tab's
user-ID list to PostgreSQL's `app_settings` row keyed `tabMembers`. Manager roles
still apply to Dashboard and team administration. The Public Website selection
controls the navigation link; the website itself remains public.

The previous username-based MLS exception has been removed. The initial production
assignment preserves existing availability (including MLS for the former pilot
account and Government Hill for existing managers) until a manager chooses members.
New accounts are not automatically included in saved membership lists.

Signed-in sessions fetch their resolved subscriptions when opening or refreshing
the CRM, on a manager view-as change, and every minute while the app remains open.
Saving Manager Settings updates the current navigation immediately. Unsubscribed
sections do not render through direct hash links. MLS and Government Hill APIs
check subscriptions on every request; MLS search results use the same rule.
This does not change the underlying property-sharing model or per-user MLS data
ownership. Manager Settings and team administration remain accessible to managers
even if they are not subscribed to other tabs.

`GET /api/settings/hidden-tabs` returns only the current effective user's resolved
hidden tabs. Managers use `GET`/`PUT /api/settings/tab-members` to read and save the
full assignment grid. Existing legacy `hiddenTabs` defaults only apply to tabs
without an explicit membership list. No schema migration is needed.

Government Hill reads and writes the original Google Sheet. Its records do not
currently sync into PostgreSQL. Its connection panel reports this and shows the
last successful worksheet read time.
