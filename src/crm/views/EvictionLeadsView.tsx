import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import { extractContacts } from '@/lib/contactParser';
import {
  normalizeContacts,
  recordAttempt,
  setDisposition as setContactDisposition,
  setPhoneNote,
  setEmailNote,
  type NormalizedContacts,
} from '@/lib/contactsModel';
import { truePeopleSearchUrl, taxAssessorUrl, landRecordsUrl } from '@/lib/researchLinks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, ChevronLeft, ChevronRight, ExternalLink, Loader2, Search, Upload, User } from 'lucide-react';
import { STAGES, SERVICE_INTERESTS, mapLegacyStage, type Stage } from '@/crm-evictions/constants';
import { SendEmailPanel } from '@/components/email/SendEmailPanel';
import { recipientsFromEmailRows, type EmailRecipient } from '@/components/email/emailTemplate';

type Landlord = {
  id: string; name: string; isCorporate: boolean; contactStage: string; serviceInterests: string[]; contacts: NormalizedContacts; notes: string;
  lastContactedAt?: string; nextFollowUpAt?: string;
  filingCount: number; addressCount: number; ownedPropertyCount: number; latestFilingDate?: string; nextTask?: { dueAt: string };
};
type Detail = Landlord & {
  addresses: { id: string; address: string; city: string; state: string; zip: string }[];
  ownedProperties?: { id: string; address: string; city: string; state: string; zip: string; notes: string }[];
  filings: { id: string; caseNumber: string; filedDate?: string; caseStatus: string; precinct: string; disposition: string; dispositionDate?: string; plaintiffAddress: string }[];
  activities: { id: string; kind: string; body: string; createdAt: string }[];
  tasks: { id: string; type: string; dueAt: string; completed: boolean; notes: string }[];
};
// What `GET /landlords` actually returns per row: `contacts` is the raw,
// unvalidated JSON column — never pre-normalised — so typing it as anything
// other than `unknown` here would be the same lie that let a raw payload into
// `NormalizedContacts`-typed state undetected (see the `setItems` call below).
type RawLandlord = Omit<Landlord, 'contacts'> & { contacts: unknown };

const request = async (path: string, init?: RequestInit) => {
  const headers = { ...getAuthHeaders(), ...(init?.headers || {}) } as Record<string, string>;
  if (init?.body instanceof FormData) delete headers['Content-Type'];

  const res = await fetch(`${API_BASE_URL}/api/evictions${path}`, { ...init, headers });
  const text = await res.text();
  let body = JSON.parse('{}');

  try {
    if (text) body = JSON.parse(text);
  } catch {
    body = { error: text || `Request failed (${res.status})` };
  }

  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
};
const fmt = (value?: string) => value ? new Date(value).toLocaleDateString() : '—';
// Pill tone keyword per stage, translated to Tailwind classes via
// PILL_TONE_CLASSES below. Kept as its own keyword vocabulary (rather than
// reusing the Tailwind classes in STAGE_TONE from crm-evictions/constants.ts)
// because stageTone()'s test coverage asserts these exact keyword strings.
const STAGE_PILL_TONE: Record<Stage, string> = {
  'New Lead': 'grey',
  Researching: 'warn',
  'Ready to Contact': 'blue',
  'Attempted Contact': 'blue',
  Contacted: 'blue',
  'Follow-Up': 'warn',
  'Appointment Scheduled': 'blue',
  Interested: '',
  'Not Interested': 'danger',
  'Under Contract': '',
  Closed: '',
  'Do Not Contact': 'danger',
};
export const stageTone = (stage: string) => STAGE_PILL_TONE[stage as Stage] ?? 'grey';

// Shared pill styling: layout stays fixed, tone controls background/text.
const PILL_BASE = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold';
const PILL_TONE_CLASSES: Record<string, string> = {
  '': 'bg-muted text-muted-foreground',
  grey: 'bg-muted text-muted-foreground',
  blue: 'bg-primary/15 text-primary',
  warn: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
};
const pillClass = (tone: string) => `${PILL_BASE} ${PILL_TONE_CLASSES[tone] ?? PILL_TONE_CLASSES.grey}`;

export default function EvictionLeadsView() {
  const [items, setItems] = useState<Landlord[]>([]), [total, setTotal] = useState(0), [pages, setPages] = useState(1), [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true), [uploading, setUploading] = useState(false), [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [search, setSearch] = useState(''), [stage, setStage] = useState(''), [service, setService] = useState('');
  const [dateFrom, setDateFrom] = useState(''), [dateTo, setDateTo] = useState(''), [status, setStatus] = useState(''), [disposition, setDisposition] = useState(''), [precinct, setPrecinct] = useState(''), [satisfied, setSatisfied] = useState('');
  const [selected, setSelected] = useState<Detail | null>(null), [rawText, setRawText] = useState(''), [saving, setSaving] = useState(false);
  const [activityBody, setActivityBody] = useState(''), [activityKind, setActivityKind] = useState('call'), [taskDue, setTaskDue] = useState('');
  const [opAddress, setOpAddress] = useState(''), [opCity, setOpCity] = useState(''), [opState, setOpState] = useState(''), [opZip, setOpZip] = useState(''), [opNotes, setOpNotes] = useState('');
  // Seeded from the landlord's contacts.emailRows on open (below) and edited
  // freely in the Send Email panel. Name/address edits here are session-only
  // scratch state for this task — only per-email notes persist, via
  // onNoteChange -> emailNote -> saveContacts, same as phone notes.
  const [emailRecipients, setEmailRecipients] = useState<EmailRecipient[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    Object.entries({ search, stage, service, dateFrom, dateTo, status, disposition, precinct, satisfied }).forEach(([k, v]) => v && params.set(k, v));
    try { const data = await request(`/landlords?${params}`); setItems(data.items.map((item: RawLandlord) => ({ ...item, contactStage: mapLegacyStage(item.contactStage), contacts: normalizeContacts(item.contacts) }))); setTotal(data.total); setPages(data.pages || 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load eviction leads'); } finally { setLoading(false); }
  }, [page, search, stage, service, dateFrom, dateTo, status, disposition, precinct, satisfied]);
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  const open = async (id: string) => {
    const detail = await request(`/landlords/${id}`);
    const contacts = normalizeContacts(detail.contacts);
    // Reset the freshness ref to what the server just returned, so edits on a
    // newly opened landlord never build on the previous one's blob.
    contactsRef.current = contacts;
    setSelected({ ...detail, contactStage: mapLegacyStage(detail.contactStage), contacts });
    setRawText('');
    // Seed one Send Email recipient per existing emailRow — not padded with
    // blank rows. A landlord with none yet gets a single blank row so the
    // panel is still usable to add a first address.
    const seeded = recipientsFromEmailRows(contacts.emailRows);
    setEmailRecipients(seeded.length > 0 ? seeded : [{ name: '', emails: [''] }]);
  };
  const patch = async (data: Partial<Detail>) => {
    if (!selected) return; setSaving(true);
    try { await request(`/landlords/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); setSelected({ ...selected, ...data }); await load(); }
    finally { setSaving(false); }
  };
  const uploadFile = async (file?: File) => {
    if (!file) return;
    setUploading(true); setError(''); setUploadProgress('Preparing upload…');
    try {
      const chunkSize = 256 * 1024;
      const totalChunks = Math.ceil(file.size / chunkSize);
      const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let jobId = '';
      for (let index = 0; index < totalChunks; index++) {
        const form = new FormData();
        form.append('chunk', file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)), `${file.name}.part${index}`);
        form.append('uploadId', uploadId); form.append('index', String(index)); form.append('totalChunks', String(totalChunks));
        form.append('totalSize', String(file.size)); form.append('filename', file.name);
        let response: { jobId?: string } | undefined;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try { response = await request('/upload-chunk', { method: 'POST', body: form }); break; }
          catch (chunkError) { if (attempt === 3) throw chunkError; await new Promise((resolve) => setTimeout(resolve, attempt * 750)); }
        }
        if (response?.jobId) jobId = response.jobId;
        setUploadProgress(`Uploading ${Math.round(((index + 1) / totalChunks) * 100)}%`);
      }
      if (!jobId) throw new Error('Upload finished but no import job was created');
      setUploadProgress('Processing workbook in Railway…');
      let result: { createdRows: number; updatedRows: number; rejectedRows: number } | undefined;
      for (let poll = 0; poll < 900; poll++) {
        const job = await request(`/jobs/${jobId}`);
        if (job.status === 'completed') { result = job.result; break; }
        if (job.status === 'failed') throw new Error(job.details || job.error || 'Import failed');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!result) throw new Error('Import is still processing. Refresh the list in a few minutes.');
      alert(`Import complete: ${result.createdRows.toLocaleString()} new cases, ${result.updatedRows.toLocaleString()} updated, ${result.rejectedRows.toLocaleString()} rejected.`);
      setPage(1); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed'); }
    finally { setUploading(false); setUploadProgress(''); }
  };
  const toggleService = (value: string) => {
    if (!selected) return; let next = selected.serviceInterests || ['Undecided'];
    if (value === 'Undecided') next = ['Undecided'];
    else { next = next.filter((x) => x !== 'Undecided'); next = next.includes(value) ? next.filter((x) => x !== value) : [...next, value]; if (!next.length) next = ['Undecided']; }
    patch({ serviceInterests: next });
  };
  const extract = async () => {
    if (!selected || !rawText.trim()) return; const found = extractContacts(rawText); const contacts = selected.contacts;
    const phoneRows = [...contacts.phoneRows], emailRows = [...contacts.emailRows];
    const knownPhones = new Set(phoneRows.flatMap((r) => r.phones.map((p) => p.number.replace(/\D/g, '').slice(-10))));
    const knownEmails = new Set(emailRows.flatMap((r) => r.emails.map((e) => e.address.toLowerCase())));
    const phones = found.phones.filter((p) => !knownPhones.has(p.replace(/\D/g, '').slice(-10))).map((number) => ({ number, status: '', source: 'TruePeopleSearch', attempts: 0, lastAttemptAt: null }));
    const emails = found.emails.filter((e) => !knownEmails.has(e.toLowerCase())).map((address) => ({ address }));
    if (phones.length) phoneRows.push({ name: found.name || selected.name, phones });
    if (emails.length) emailRows.push({ name: found.name || selected.name, emails });
    await patch({ contacts: { phoneRows, emailRows } }); setRawText('');
  };

  // Each control derives its next contacts blob from the one in state and
  // PATCHes the whole thing. Two edits inside one round trip would both start
  // from the same stale blob, so the second silently reverts the first —
  // marking a number wrong and then typing a note loses the disposition.
  // The ref holds the freshest blob, updated synchronously before the request,
  // so a later edit builds on the earlier one instead of racing it.
  const contactsRef = useRef<NormalizedContacts | null>(null);
  const currentContacts = () => contactsRef.current ?? selected?.contacts ?? { phoneRows: [], emailRows: [] };
  const saveContacts = async (contacts: NormalizedContacts) => {
    contactsRef.current = contacts;
    await patch({ contacts });
  };

  const callNumber = async (ri: number, pi: number, number: string) => {
    if (!selected) return;
    window.open(`tel:${number}`, '_self');
    try {
      await saveContacts(recordAttempt(currentContacts(), ri, pi, new Date()));
      await request(`/landlords/${selected.id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'call', body: `Called ${number}` }),
      });
      await patch({
        lastContactedAt: new Date().toISOString(),
        contactStage: selected.contactStage === 'New Lead' ? 'Contacted' : selected.contactStage,
      });
      await open(selected.id);
    } catch (e) {
      // Partial failure here (attempt saved but the activity log or stage
      // bump fails) must not fail silently — callNumber is the primary call
      // action, so an unhandled rejection here is easy to miss entirely.
      setError(e instanceof Error ? e.message : 'Unable to record this call. Refresh and try again.');
    }
  };

  const setPhoneDisposition = (ri: number, pi: number, status: string) =>
    selected && saveContacts(setContactDisposition(currentContacts(), ri, pi, status));

  const phoneNote = (ri: number, pi: number, note: string) =>
    selected && saveContacts(setPhoneNote(currentContacts(), ri, pi, note));

  const emailNote = (ri: number, ei: number, note: string) =>
    selected && saveContacts(setEmailNote(currentContacts(), ri, ei, note));

  const addOwnedProperty = async () => {
    if (!selected || !opAddress.trim()) return;
    await request(`/landlords/${selected.id}/owned-properties`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: opAddress, city: opCity, state: opState, zip: opZip, notes: opNotes }),
    });
    setOpAddress(''); setOpCity(''); setOpState(''); setOpZip(''); setOpNotes('');
    await open(selected.id);
    await load();
  };

  const removeOwnedProperty = async (id: string) => {
    if (!selected) return;
    await request(`/owned-properties/${id}`, { method: 'DELETE' });
    await open(selected.id);
    await load();
  };

  const addActivity = async () => {
    if (!selected || !activityBody.trim()) return;
    await request(`/landlords/${selected.id}/activities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: activityKind, body: activityBody }) });
    if (activityKind === 'call') await patch({ lastContactedAt: new Date().toISOString(), contactStage: selected.contactStage === 'New Lead' ? 'Contacted' : selected.contactStage });
    setActivityBody(''); await open(selected.id);
  };
  const addTask = async () => {
    if (!selected || !taskDue) return;
    await request(`/landlords/${selected.id}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'Call', dueAt: new Date(taskDue).toISOString(), notes: 'Eviction lead follow-up' }) });
    await patch({ nextFollowUpAt: new Date(taskDue).toISOString(), contactStage: 'Follow-Up' }); setTaskDue(''); await open(selected.id);
  };

  return <div className="min-h-full p-6 md:p-8 text-sm">
    <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
      <div>
        <p className="label">CLIENT PIPELINE</p>
        <h1 className="text-2xl font-semibold">Eviction Leads</h1>
        <p className="mt-1 text-muted-foreground"><span className="record">{total.toLocaleString()}</span> landlord prospects grouped from eviction filings</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <label>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0])} disabled={uploading}/>
          <span className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer aria-disabled:opacity-50 aria-disabled:pointer-events-none" role="button" aria-disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Upload className="h-4 w-4"/>}
            {uploading ? uploadProgress || 'Uploading…' : 'Import Eviction Workbook'}
          </span>
        </label>
        {uploading && <span className="text-xs text-muted-foreground">Keep this page open while the import runs.</span>}
      </div>
    </div>

    <div className="rounded border bg-card grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.7fr_repeat(4,1fr)] gap-[11px] p-4 mb-[18px]">
      <label className="grid gap-1.5">
        <span className="label">SEARCH</span>
        <span className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
          <input className="h-10 w-full rounded border bg-card pl-8 pr-3 text-sm" placeholder="Landlord or address" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/>
        </span>
      </label>
      <label className="grid gap-1.5">
        <span className="label">CONTACT STAGE</span>
        <select className="h-10 w-full rounded border bg-card px-3 text-sm" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}><option value="">All stages</option>{STAGES.map((x) => <option key={x}>{x}</option>)}</select>
      </label>
      <label className="grid gap-1.5">
        <span className="label">SERVICE INTEREST</span>
        <select className="h-10 w-full rounded border bg-card px-3 text-sm" value={service} onChange={(e) => { setService(e.target.value); setPage(1); }}><option value="">All services</option>{SERVICE_INTERESTS.map((x) => <option key={x}>{x}</option>)}</select>
      </label>
      <label className="grid gap-1.5">
        <span className="label">FILED FROM</span>
        <input className="h-10 w-full rounded border bg-card px-3 text-sm" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}/>
      </label>
      <label className="grid gap-1.5">
        <span className="label">FILED THROUGH</span>
        <input className="h-10 w-full rounded border bg-card px-3 text-sm" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}/>
      </label>
      <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[11px]">
        <label className="grid gap-1.5">
          <span className="label">CASE STATUS</span>
          <input className="h-10 w-full rounded border bg-card px-3 text-sm" placeholder="Exact status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}/>
        </label>
        <label className="grid gap-1.5">
          <span className="label">DISPOSITION</span>
          <input className="h-10 w-full rounded border bg-card px-3 text-sm" placeholder="Contains…" value={disposition} onChange={(e) => { setDisposition(e.target.value); setPage(1); }}/>
        </label>
        <label className="grid gap-1.5">
          <span className="label">PRECINCT</span>
          <input className="h-10 w-full rounded border bg-card px-3 text-sm" placeholder="Exact precinct" value={precinct} onChange={(e) => { setPrecinct(e.target.value); setPage(1); }}/>
        </label>
        <label className="grid gap-1.5">
          <span className="label">SATISFIED FLAG</span>
          <select className="h-10 w-full rounded border bg-card px-3 text-sm" value={satisfied} onChange={(e) => { setSatisfied(e.target.value); setPage(1); }}><option value="">Any</option><option value="true">Satisfied</option><option value="false">Not satisfied</option></select>
        </label>
      </div>
    </div>

    {error && <div className="mb-[18px] rounded-r-md border-l-[3px] border-destructive bg-destructive/10 px-3.5 py-3 text-destructive">{error}</div>}

    <div className="rounded border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr>{['Landlord', 'Entity', 'Filings', 'Addresses Represented', 'Properties', 'Latest Filing', 'Contact Stage', 'Service Interest', 'Next Follow-up'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="py-[45px] px-2.5 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></td></tr> : items.map((item) => <tr key={item.id} className="cursor-pointer" onClick={() => open(item.id)}>
              <td className="font-semibold min-w-[240px]">{item.name}</td>
              <td><span className={pillClass('grey')}>{item.isCorporate ? <Building2 className="h-3 w-3"/> : <User className="h-3 w-3"/>}{item.isCorporate ? 'Corporate' : 'Person'}</span></td>
              <td className="record">{item.filingCount}</td>
              <td className="record">{item.addressCount}</td>
              <td className="record">{item.ownedPropertyCount}</td>
              <td className="whitespace-nowrap record">{fmt(item.latestFilingDate)}</td>
              <td><span className={pillClass(stageTone(item.contactStage))}>{item.contactStage}</span></td>
              <td className="min-w-[170px] text-muted-foreground">{item.serviceInterests?.join(', ')}</td>
              <td className="whitespace-nowrap record">{fmt(item.nextTask?.dueAt)}</td>
            </tr>)}
            {!loading && !items.length && <tr><td colSpan={9} className="py-[45px] px-2.5 text-center text-muted-foreground">No eviction leads match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    <div className="flex items-center justify-between pt-3.5 text-xs text-muted-foreground">
      <span>Page {page} of {pages}</span>
      <span className="flex gap-2">
        <button className="inline-flex items-center gap-1.5 rounded border bg-card px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50 disabled:pointer-events-none" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4"/></button>
        <button className="inline-flex items-center gap-1.5 rounded border bg-card px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50 disabled:pointer-events-none" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4"/></button>
      </span>
    </div>

    <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}><DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">{selected && <>
      <DialogHeader>
        <p className="label">LANDLORD</p>
        <DialogTitle className="pr-8">{selected.name}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-wrap gap-2">
        <span className={pillClass('blue')}>{selected.filings.length} filings loaded</span>
        <span className={pillClass('grey')}>{selected.addresses.length} Addresses Represented</span>
        {selected.isCorporate && <span className={pillClass('warn')}>Business plaintiff — identify an owner or manager for people search</span>}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="rounded border bg-card p-3.5 space-y-3">
          <h3 className="text-base font-semibold">Prospecting</h3>
          <select className="h-10 w-full rounded border bg-card px-3 text-sm" value={selected.contactStage} onChange={(e) => patch({ contactStage: e.target.value })}>{STAGES.map((x) => <option key={x}>{x}</option>)}</select>
          <div className="flex flex-wrap gap-2">{SERVICE_INTERESTS.map((x) => <button key={x} className={`inline-block rounded-md border px-2.5 py-1.5 text-xs transition-colors ${selected.serviceInterests?.includes(x) ? 'border-primary bg-primary text-primary-foreground font-semibold' : 'bg-card text-muted-foreground hover:border-primary/40'}`} onClick={() => toggleService(x)}>{x}</button>)}</div>
          <textarea className="min-h-[72px] w-full resize-y rounded border bg-card px-3 py-2 text-sm" placeholder="Landlord notes" value={selected.notes || ''} onChange={(e) => setSelected({ ...selected, notes: e.target.value })} onBlur={() => patch({ notes: selected.notes })}/>
        </section>
        <section className="rounded border bg-card p-3.5 space-y-3">
          <h3 className="text-base font-semibold">TruePeopleSearch Contact Extractor</h3>
          <textarea className="min-h-[120px] w-full resize-y rounded border bg-card px-3 py-2 font-mono text-xs" placeholder="Paste all text from TruePeopleSearch; name, phones, and emails will be extracted." value={rawText} onChange={(e) => setRawText(e.target.value)}/>
          <button className="inline-flex items-center gap-1.5 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none" onClick={extract} disabled={!rawText.trim() || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : null}Extract and save</button>
        </section>
      </div>

      <section className="rounded border bg-card p-3.5 space-y-2">
        <h3 className="text-base font-semibold">Phone Numbers</h3>
        {!selected.contacts.phoneRows.some((r) => r.phones.length) && (
          <p className="text-sm text-muted-foreground">No phone numbers yet. Paste a TruePeopleSearch result above to extract them.</p>
        )}
        {selected.contacts.phoneRows.map((row, ri) => row.phones.map((phone, pi) => (
          <div key={`${ri}-${pi}`} className={`grid gap-2 md:grid-cols-[minmax(0,180px)_auto_auto_minmax(0,1fr)] items-center ${phone.status === 'wrong' ? 'opacity-50' : ''}`}>
            <button
              className="text-left text-primary record hover:underline disabled:opacity-50 disabled:pointer-events-none"
              onClick={() => callNumber(ri, pi, phone.number)}
              disabled={saving}
            >
              {phone.number}
            </button>
            <span className="text-xs text-muted-foreground record" title="Call attempts">
              {phone.attempts ? `${phone.attempts} tried` : 'not tried'}
            </span>
            <span className="flex gap-1">
              <button
                className={`rounded border px-2 py-1 text-xs disabled:opacity-50 disabled:pointer-events-none ${phone.status === 'right' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}
                aria-pressed={phone.status === 'right'}
                onClick={() => setPhoneDisposition(ri, pi, phone.status === 'right' ? '' : 'right')}
                disabled={saving}
              >Right number</button>
              <button
                className={`rounded border px-2 py-1 text-xs disabled:opacity-50 disabled:pointer-events-none ${phone.status === 'wrong' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}
                aria-pressed={phone.status === 'wrong'}
                onClick={() => setPhoneDisposition(ri, pi, phone.status === 'wrong' ? '' : 'wrong')}
                disabled={saving}
              >Wrong number</button>
            </span>
            <input
              className="h-9 w-full rounded border bg-card px-2 text-sm disabled:opacity-50"
              placeholder="Note for this number"
              defaultValue={phone.note || ''}
              onBlur={(e) => phoneNote(ri, pi, e.target.value)}
              disabled={saving}
            />
          </div>
        )))}
      </section>

      <section className="rounded border bg-card p-3.5 space-y-2">
        <h3 className="text-base font-semibold">Emails</h3>
        {!selected.contacts.emailRows.some((r) => r.emails.length) && (
          <p className="text-sm text-muted-foreground">No emails yet.</p>
        )}
        {/* Name/address edits made in this panel are session-only for now —
            only the per-email notes persist, through onNoteChange below. */}
        <SendEmailPanel
          recipients={emailRecipients}
          onRecipientsChange={setEmailRecipients}
          propertyAddress={selected.addresses[0]
            ? `${selected.addresses[0].address}, ${selected.addresses[0].city}, ${selected.addresses[0].state} ${selected.addresses[0].zip}`
            : ''}
          owner={selected.name}
          showNotes
          onNoteChange={(ri, ei, note) => emailNote(ri, ei, note)}
        />
      </section>

      <section className="rounded border bg-card p-3.5 space-y-3">
        <h3 className="text-base font-semibold">Outreach &amp; Follow-up</h3>
        <div className="grid grid-cols-1 md:grid-cols-[160px_minmax(0,1fr)_auto] items-center gap-[9px]">
          <select className="h-10 w-full rounded border bg-card px-3 text-sm" value={activityKind} onChange={(e) => setActivityKind(e.target.value)}><option value="call">Call outcome</option><option value="text">Text</option><option value="email">Email</option><option value="note">Note</option></select>
          <input className="h-10 w-full rounded border bg-card px-3 text-sm" placeholder="Outcome or activity notes" value={activityBody} onChange={(e) => setActivityBody(e.target.value)}/>
          <button className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none" onClick={addActivity} disabled={!activityBody.trim()}>Log activity</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,260px)_auto] justify-start items-center gap-[9px]">
          <input className="h-10 w-full rounded border bg-card px-3 text-sm" type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)}/>
          <button className="inline-flex items-center gap-2 rounded border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-50 disabled:pointer-events-none" onClick={addTask} disabled={!taskDue}>Schedule call</button>
        </div>
        {selected.tasks.filter((t) => !t.completed).map((t) => <div key={t.id} className="text-sm text-muted-foreground">Upcoming {t.type}: <span className="record">{new Date(t.dueAt).toLocaleString()}</span> — {t.notes}</div>)}
        {selected.activities.slice(0, 8).map((a) => <div key={a.id} className="grid grid-cols-[8px_1fr] gap-2.5 text-sm"><span className="mt-1.5 h-[7px] w-[7px] rounded-full bg-accent"/><span><span className="font-semibold capitalize">{a.kind}</span> · <span className="record">{fmt(a.createdAt)}</span><div className="text-muted-foreground">{a.body}</div></span></div>)}
      </section>

      <section className="rounded border bg-card p-3.5">
        <h3 className="mb-2 text-base font-semibold">Addresses Represented</h3>
        <div className="grid md:grid-cols-2 gap-2">{selected.addresses.map((a) => (
          <div key={a.id} className="rounded bg-muted p-2 text-sm space-y-2">
            <p className="record">{a.address}, {a.city}, {a.state} {a.zip}</p>
            <div className="flex flex-wrap gap-1.5">
              <a className="inline-flex items-center gap-1 rounded border bg-card px-2 py-1 text-xs hover:bg-background" href={truePeopleSearchUrl(a)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5"/>People search</a>
              <a className="inline-flex items-center gap-1 rounded border bg-card px-2 py-1 text-xs hover:bg-background" href={taxAssessorUrl()} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5"/>Tax assessor</a>
              <a className="inline-flex items-center gap-1 rounded border bg-card px-2 py-1 text-xs hover:bg-background" href={landRecordsUrl(a)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5"/>Land records</a>
            </div>
          </div>
        ))}</div>
      </section>

      <section className="rounded border bg-card p-3.5 space-y-3">
        <h3 className="text-base font-semibold">Properties They Own</h3>
        <p className="text-xs text-muted-foreground">Recorded from what the landlord tells you. The addresses above are where their mail goes, not what they own.</p>
        {!(selected.ownedProperties || []).length && (
          <p className="text-sm text-muted-foreground">None recorded yet.</p>
        )}
        {(selected.ownedProperties || []).map((p) => (
          <div key={p.id} className="flex items-start justify-between gap-2 rounded bg-muted p-2">
            <div>
              <p className="record text-sm">{[p.address, p.city, p.state, p.zip].filter(Boolean).join(', ')}</p>
              {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
            </div>
            <button className="rounded border bg-card px-2 py-1 text-xs hover:bg-background" onClick={() => removeOwnedProperty(p.id)}>Remove</button>
          </div>
        ))}
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_60px_90px_auto]">
          <input className="h-9 rounded border bg-card px-2 text-sm" placeholder="Address" value={opAddress} onChange={(e) => setOpAddress(e.target.value)}/>
          <input className="h-9 rounded border bg-card px-2 text-sm" placeholder="City" value={opCity} onChange={(e) => setOpCity(e.target.value)}/>
          <input className="h-9 rounded border bg-card px-2 text-sm" placeholder="ST" value={opState} onChange={(e) => setOpState(e.target.value)}/>
          <input className="h-9 rounded border bg-card px-2 text-sm" placeholder="ZIP" value={opZip} onChange={(e) => setOpZip(e.target.value)}/>
          <button className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none" onClick={addOwnedProperty} disabled={!opAddress.trim()}>Add</button>
        </div>
        <input className="h-9 w-full rounded border bg-card px-2 text-sm" placeholder="Notes about this property" value={opNotes} onChange={(e) => setOpNotes(e.target.value)}/>
      </section>

      <section className="rounded border bg-card p-3.5">
        <h3 className="mb-2 text-base font-semibold">Eviction Filings</h3>
        <div className="max-h-72 overflow-auto">
          <table className="data-table text-xs">
            <thead><tr>{['Case', 'Filed', 'Status', 'Precinct', 'Disposition', 'Plaintiff Address'].map((x) => <th key={x}>{x}</th>)}</tr></thead>
            <tbody>{selected.filings.map((f) => <tr key={f.id} style={{ cursor: 'default' }}><td className="record">{f.caseNumber}</td><td className="whitespace-nowrap record">{fmt(f.filedDate)}</td><td>{f.caseStatus}</td><td>{f.precinct}</td><td>{f.disposition}</td><td className="record">{f.plaintiffAddress}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>}</DialogContent></Dialog>
  </div>;
}
