import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import { extractContacts } from '@/lib/contactParser';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, ChevronLeft, ChevronRight, ExternalLink, Loader2, Search, Upload, User } from 'lucide-react';
import { STAGES, SERVICE_INTERESTS } from '@/crm-evictions/constants';
import '@/styles/corporate.css';

type Phone = { number: string; status?: string; type?: string; source?: string };
type Contacts = { phoneRows?: { name: string; phones: Phone[] }[]; emailRows?: { name: string; emails: string[] }[] };
type Landlord = {
  id: string; name: string; isCorporate: boolean; contactStage: string; serviceInterests: string[]; contacts: Contacts; notes: string;
  lastContactedAt?: string; nextFollowUpAt?: string;
  filingCount: number; addressCount: number; latestFilingDate?: string; nextTask?: { dueAt: string };
};
type Detail = Landlord & {
  addresses: { id: string; address: string; city: string; state: string; zip: string }[];
  filings: { id: string; caseNumber: string; filedDate?: string; caseStatus: string; precinct: string; disposition: string; dispositionDate?: string; plaintiffAddress: string }[];
  activities: { id: string; kind: string; body: string; createdAt: string }[];
  tasks: { id: string; type: string; dueAt: string; completed: boolean; notes: string }[];
};

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
const stageTone = (stage: string) => {
  if (stage === 'Qualified') return '';
  if (stage === 'Contacted' || stage === 'Follow Up') return 'blue';
  if (stage === 'Researching') return 'warn';
  if (stage === 'Not Interested' || stage === 'Do Not Call') return 'danger';
  return 'grey';
};

export default function EvictionLeadsView() {
  const [items, setItems] = useState<Landlord[]>([]), [total, setTotal] = useState(0), [pages, setPages] = useState(1), [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true), [uploading, setUploading] = useState(false), [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [search, setSearch] = useState(''), [stage, setStage] = useState(''), [service, setService] = useState('');
  const [dateFrom, setDateFrom] = useState(''), [dateTo, setDateTo] = useState(''), [status, setStatus] = useState(''), [disposition, setDisposition] = useState(''), [precinct, setPrecinct] = useState(''), [satisfied, setSatisfied] = useState('');
  const [selected, setSelected] = useState<Detail | null>(null), [rawText, setRawText] = useState(''), [saving, setSaving] = useState(false);
  const [activityBody, setActivityBody] = useState(''), [activityKind, setActivityKind] = useState('call'), [taskDue, setTaskDue] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    Object.entries({ search, stage, service, dateFrom, dateTo, status, disposition, precinct, satisfied }).forEach(([k, v]) => v && params.set(k, v));
    try { const data = await request(`/landlords?${params}`); setItems(data.items); setTotal(data.total); setPages(data.pages || 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load eviction leads'); } finally { setLoading(false); }
  }, [page, search, stage, service, dateFrom, dateTo, status, disposition, precinct, satisfied]);
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  const open = async (id: string) => { setSelected(await request(`/landlords/${id}`)); setRawText(''); };
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
    if (!selected || !rawText.trim()) return; const found = extractContacts(rawText); const contacts = selected.contacts || {};
    const phoneRows = [...(contacts.phoneRows || [])], emailRows = [...(contacts.emailRows || [])];
    const knownPhones = new Set(phoneRows.flatMap((r) => r.phones.map((p) => p.number.replace(/\D/g, '').slice(-10))));
    const knownEmails = new Set(emailRows.flatMap((r) => r.emails.map((e) => e.toLowerCase())));
    const phones = found.phones.filter((p) => !knownPhones.has(p.replace(/\D/g, '').slice(-10))).map((number) => ({ number, status: '', source: 'TruePeopleSearch' }));
    const emails = found.emails.filter((e) => !knownEmails.has(e.toLowerCase()));
    if (phones.length) phoneRows.push({ name: found.name || selected.name, phones });
    if (emails.length) emailRows.push({ name: found.name || selected.name, emails });
    await patch({ contacts: { phoneRows, emailRows } }); setRawText('');
  };
  const truePeopleSearch = () => {
    if (!selected) return; const a = selected.addresses[0]; const location = a ? `${a.address}, ${a.city}, ${a.state} ${a.zip}` : '';
    window.open(`https://www.truepeoplesearch.com/results?name=${encodeURIComponent(selected.name)}&citystatezip=${encodeURIComponent(location)}`, '_blank', 'noopener,noreferrer');
  };
  const addActivity = async () => {
    if (!selected || !activityBody.trim()) return;
    await request(`/landlords/${selected.id}/activities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: activityKind, body: activityBody }) });
    if (activityKind === 'call') await patch({ lastContactedAt: new Date().toISOString(), contactStage: selected.contactStage === 'New' ? 'Contacted' : selected.contactStage });
    setActivityBody(''); await open(selected.id);
  };
  const addTask = async () => {
    if (!selected || !taskDue) return;
    await request(`/landlords/${selected.id}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'Call', dueAt: new Date(taskDue).toISOString(), notes: 'Eviction lead follow-up' }) });
    await patch({ nextFollowUpAt: new Date(taskDue).toISOString(), contactStage: 'Follow Up' }); setTaskDue(''); await open(selected.id);
  };

  return <div className="urg min-h-full p-6 md:p-8">
    <div className="urg-toolbar">
      <div>
        <p className="urg-eyebrow">CLIENT PIPELINE</p>
        <h1>Eviction Leads</h1>
        <p>{total.toLocaleString()} landlord prospects grouped from eviction filings</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <label>
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0])} disabled={uploading}/>
          <span className="urg-btn" role="button" aria-disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Upload className="h-4 w-4"/>}
            {uploading ? uploadProgress || 'Uploading…' : 'Import Eviction Workbook'}
          </span>
        </label>
        {uploading && <span className="text-xs urg-muted">Keep this page open while the import runs.</span>}
      </div>
    </div>

    <div className="urg-panel urg-filters">
      <label className="urg-field">
        <span>SEARCH</span>
        <span className="urg-search">
          <Search className="h-4 w-4"/>
          <input className="urg-input" placeholder="Landlord or address" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/>
        </span>
      </label>
      <label className="urg-field">
        <span>CONTACT STAGE</span>
        <select className="urg-input" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }}><option value="">All stages</option>{STAGES.map((x) => <option key={x}>{x}</option>)}</select>
      </label>
      <label className="urg-field">
        <span>SERVICE INTEREST</span>
        <select className="urg-input" value={service} onChange={(e) => { setService(e.target.value); setPage(1); }}><option value="">All services</option>{SERVICE_INTERESTS.map((x) => <option key={x}>{x}</option>)}</select>
      </label>
      <label className="urg-field">
        <span>FILED FROM</span>
        <input className="urg-input" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}/>
      </label>
      <label className="urg-field">
        <span>FILED THROUGH</span>
        <input className="urg-input" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}/>
      </label>
      <div className="urg-filters-row2">
        <label className="urg-field">
          <span>CASE STATUS</span>
          <input className="urg-input" placeholder="Exact status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}/>
        </label>
        <label className="urg-field">
          <span>DISPOSITION</span>
          <input className="urg-input" placeholder="Contains…" value={disposition} onChange={(e) => { setDisposition(e.target.value); setPage(1); }}/>
        </label>
        <label className="urg-field">
          <span>PRECINCT</span>
          <input className="urg-input" placeholder="Exact precinct" value={precinct} onChange={(e) => { setPrecinct(e.target.value); setPage(1); }}/>
        </label>
        <label className="urg-field">
          <span>SATISFIED FLAG</span>
          <select className="urg-input" value={satisfied} onChange={(e) => { setSatisfied(e.target.value); setPage(1); }}><option value="">Any</option><option value="true">Satisfied</option><option value="false">Not satisfied</option></select>
        </label>
      </div>
    </div>

    {error && <div className="urg-notice">{error}</div>}

    <div className="urg-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="urg-table">
          <thead><tr>{['Landlord', 'Entity', 'Filings', 'Addresses Represented', 'Latest Filing', 'Contact Stage', 'Service Interest', 'Next Follow-up'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="urg-empty"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></td></tr> : items.map((item) => <tr key={item.id} onClick={() => open(item.id)}>
              <td className="urg-who min-w-[240px]">{item.name}</td>
              <td><span className="urg-pill grey">{item.isCorporate ? <Building2 className="h-3 w-3"/> : <User className="h-3 w-3"/>}{item.isCorporate ? 'Corporate' : 'Person'}</span></td>
              <td>{item.filingCount}</td>
              <td>{item.addressCount}</td>
              <td className="whitespace-nowrap">{fmt(item.latestFilingDate)}</td>
              <td><span className={`urg-pill ${stageTone(item.contactStage)}`}>{item.contactStage}</span></td>
              <td className="min-w-[170px] urg-muted">{item.serviceInterests?.join(', ')}</td>
              <td className="whitespace-nowrap">{fmt(item.nextTask?.dueAt)}</td>
            </tr>)}
            {!loading && !items.length && <tr><td colSpan={8} className="urg-empty">No eviction leads match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    <div className="urg-pager">
      <span>Page {page} of {pages}</span>
      <span className="flex gap-2">
        <button className="urg-btn secondary small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4"/></button>
        <button className="urg-btn secondary small" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4"/></button>
      </span>
    </div>

    <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}><DialogContent className="urg urg-dialog max-w-5xl max-h-[90vh] overflow-y-auto">{selected && <>
      <DialogHeader>
        <p className="urg-eyebrow">LANDLORD</p>
        <DialogTitle className="pr-8">{selected.name}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-wrap gap-2">
        <span className="urg-pill blue">{selected.filings.length} filings loaded</span>
        <span className="urg-pill grey">{selected.addresses.length} Addresses Represented</span>
        {selected.isCorporate && <span className="urg-pill warn">Business plaintiff — identify an owner or manager for people search</span>}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="urg-sub space-y-3">
          <h3>Prospecting</h3>
          <select className="urg-input" value={selected.contactStage} onChange={(e) => patch({ contactStage: e.target.value })}>{STAGES.map((x) => <option key={x}>{x}</option>)}</select>
          <div className="flex flex-wrap gap-2">{SERVICE_INTERESTS.map((x) => <button key={x} className={`urg-chip ${selected.serviceInterests?.includes(x) ? 'on' : ''}`} onClick={() => toggleService(x)}>{x}</button>)}</div>
          <textarea className="urg-input" placeholder="Landlord notes" value={selected.notes || ''} onChange={(e) => setSelected({ ...selected, notes: e.target.value })} onBlur={() => patch({ notes: selected.notes })}/>
        </section>
        <section className="urg-sub space-y-3">
          <div className="flex justify-between items-center gap-2">
            <h3>TruePeopleSearch Contact Extractor</h3>
            <button className="urg-btn secondary small" onClick={truePeopleSearch}><ExternalLink className="h-4 w-4"/>Open search</button>
          </div>
          <textarea className="urg-input min-h-[120px] font-mono text-xs" placeholder="Paste all text from TruePeopleSearch; name, phones, and emails will be extracted." value={rawText} onChange={(e) => setRawText(e.target.value)}/>
          <button className="urg-btn small" onClick={extract} disabled={!rawText.trim() || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : null}Extract and save</button>
        </section>
      </div>

      <section className="urg-sub space-y-2">
        <h3>Contacts</h3>
        {(selected.contacts?.phoneRows || []).flatMap((r) => r.phones.map((p, i) => <div key={`${r.name}-${i}`} className="flex gap-2 text-sm"><span className="font-semibold">{r.name || selected.name}</span><a style={{ color: 'var(--urg-blue)' }} href={`tel:${p.number}`}>{p.number}</a><span className="urg-muted">{p.type || ''} {p.source ? `· ${p.source}` : ''}</span></div>))}
        {(selected.contacts?.emailRows || []).flatMap((r) => r.emails.map((e) => <div key={e} className="text-sm"><span className="font-semibold mr-2">{r.name}</span><a style={{ color: 'var(--urg-blue)' }} href={`mailto:${e}`}>{e}</a></div>))}
      </section>

      <section className="urg-sub space-y-3">
        <h3>Outreach &amp; Follow-up</h3>
        <div className="urg-row-outreach">
          <select className="urg-input" value={activityKind} onChange={(e) => setActivityKind(e.target.value)}><option value="call">Call outcome</option><option value="text">Text</option><option value="email">Email</option><option value="note">Note</option></select>
          <input className="urg-input" placeholder="Outcome or activity notes" value={activityBody} onChange={(e) => setActivityBody(e.target.value)}/>
          <button className="urg-btn" onClick={addActivity} disabled={!activityBody.trim()}>Log activity</button>
        </div>
        <div className="urg-row-task">
          <input className="urg-input" type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)}/>
          <button className="urg-btn secondary" onClick={addTask} disabled={!taskDue}>Schedule call</button>
        </div>
        {selected.tasks.filter((t) => !t.completed).map((t) => <div key={t.id} className="text-sm urg-muted">Upcoming {t.type}: {new Date(t.dueAt).toLocaleString()} — {t.notes}</div>)}
        {selected.activities.slice(0, 8).map((a) => <div key={a.id} className="urg-activity text-sm"><span className="urg-dot"/><span><span className="font-semibold capitalize">{a.kind}</span> · {fmt(a.createdAt)}<div className="urg-muted">{a.body}</div></span></div>)}
      </section>

      <section className="urg-sub">
        <h3 className="mb-2">Addresses Represented</h3>
        <div className="grid md:grid-cols-2 gap-2">{selected.addresses.map((a) => <div key={a.id} className="rounded p-2 text-sm" style={{ background: '#f4f7fb' }}>{a.address}, {a.city}, {a.state} {a.zip}</div>)}</div>
      </section>

      <section className="urg-sub">
        <h3 className="mb-2">Eviction Filings</h3>
        <div className="max-h-72 overflow-auto">
          <table className="urg-table text-xs">
            <thead><tr>{['Case', 'Filed', 'Status', 'Precinct', 'Disposition', 'Plaintiff Address'].map((x) => <th key={x}>{x}</th>)}</tr></thead>
            <tbody>{selected.filings.map((f) => <tr key={f.id} style={{ cursor: 'default' }}><td>{f.caseNumber}</td><td className="whitespace-nowrap">{fmt(f.filedDate)}</td><td>{f.caseStatus}</td><td>{f.precinct}</td><td>{f.disposition}</td><td>{f.plaintiffAddress}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>}</DialogContent></Dialog>
  </div>;
}
