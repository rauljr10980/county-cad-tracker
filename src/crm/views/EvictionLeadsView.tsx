import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import { extractContacts } from '@/lib/contactParser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, ChevronLeft, ChevronRight, ExternalLink, Loader2, Search, Upload, User } from 'lucide-react';

type Phone = { number: string; status?: string; type?: string; source?: string };
type Contacts = { phoneRows?: { name: string; phones: Phone[] }[]; emailRows?: { name: string; emails: string[] }[] };
type Landlord = {
  id: string; name: string; isCorporate: boolean; contactStage: string; serviceInterests: string[]; contacts: Contacts; notes: string;
  filingCount: number; addressCount: number; latestFilingDate?: string; nextTask?: { dueAt: string };
};
type Detail = Landlord & {
  addresses: { id: string; address: string; city: string; state: string; zip: string }[];
  filings: { id: string; caseNumber: string; filedDate?: string; caseStatus: string; precinct: string; disposition: string; dispositionDate?: string; plaintiffAddress: string }[];
  activities: { id: string; kind: string; body: string; createdAt: string }[];
  tasks: { id: string; type: string; dueAt: string; completed: boolean; notes: string }[];
};

const stages = ['New', 'Researching', 'Contacted', 'Follow Up', 'Qualified', 'Not Interested', 'Do Not Call'];
const services = ['Undecided', 'Acquisition / Sell to Us', 'Listing', 'Property Management'];
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

export default function EvictionLeadsView() {
  const [items, setItems] = useState<Landlord[]>([]), [total, setTotal] = useState(0), [pages, setPages] = useState(1), [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true), [uploading, setUploading] = useState(false), [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [search, setSearch] = useState(''), [corporate, setCorporate] = useState(''), [stage, setStage] = useState(''), [service, setService] = useState('');
  const [dateFrom, setDateFrom] = useState(''), [dateTo, setDateTo] = useState(''), [status, setStatus] = useState(''), [disposition, setDisposition] = useState(''), [precinct, setPrecinct] = useState(''), [satisfied, setSatisfied] = useState('');
  const [selected, setSelected] = useState<Detail | null>(null), [rawText, setRawText] = useState(''), [saving, setSaving] = useState(false);
  const [activityBody, setActivityBody] = useState(''), [activityKind, setActivityKind] = useState('call'), [taskDue, setTaskDue] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    Object.entries({ search, corporate, stage, service, dateFrom, dateTo, status, disposition, precinct, satisfied }).forEach(([k, v]) => v && params.set(k, v));
    try { const data = await request(`/landlords?${params}`); setItems(data.items); setTotal(data.total); setPages(data.pages || 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load eviction leads'); } finally { setLoading(false); }
  }, [page, search, corporate, stage, service, dateFrom, dateTo, status, disposition, precinct, satisfied]);
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

  return <div className="p-4 md:p-6 space-y-4">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Eviction Leads</h1><p className="text-sm text-muted-foreground">{total.toLocaleString()} landlord prospects grouped from eviction filings</p></div>
      <div className="flex flex-col items-end gap-1"><label className="inline-flex"><input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0])} disabled={uploading}/><Button asChild disabled={uploading}><span>{uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Upload className="h-4 w-4 mr-2"/>}{uploading ? uploadProgress || 'Uploading…' : 'Import Eviction Workbook'}</span></Button></label>{uploading && <span className="text-xs text-muted-foreground">Keep this page open while the import runs.</span>}</div>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-7 gap-2 rounded-lg border bg-card/30 p-3">
      <div className="relative col-span-2"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-8" placeholder="Landlord or address" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/></div>
      <select className="h-10 rounded-md border bg-background px-2 text-sm" value={corporate} onChange={(e) => {setCorporate(e.target.value);setPage(1)}}><option value="">Individuals only</option></select>
      <select className="h-10 rounded-md border bg-background px-2 text-sm" value={stage} onChange={(e) => {setStage(e.target.value);setPage(1)}}><option value="">All contact stages</option>{stages.map((x)=><option key={x}>{x}</option>)}</select>
      <select className="h-10 rounded-md border bg-background px-2 text-sm" value={service} onChange={(e) => {setService(e.target.value);setPage(1)}}><option value="">All services</option>{services.map((x)=><option key={x}>{x}</option>)}</select>
      <Input type="date" title="Filed from" value={dateFrom} onChange={(e)=>{setDateFrom(e.target.value);setPage(1)}}/><Input type="date" title="Filed through" value={dateTo} onChange={(e)=>{setDateTo(e.target.value);setPage(1)}}/>
      <Input placeholder="Case status" value={status} onChange={(e)=>{setStatus(e.target.value);setPage(1)}}/>
      <Input placeholder="Disposition contains" value={disposition} onChange={(e)=>{setDisposition(e.target.value);setPage(1)}}/>
      <Input placeholder="Precinct (exact)" value={precinct} onChange={(e)=>{setPrecinct(e.target.value);setPage(1)}}/>
      <select className="h-10 rounded-md border bg-background px-2 text-sm" value={satisfied} onChange={(e)=>{setSatisfied(e.target.value);setPage(1)}}><option value="">Any satisfied flag</option><option value="true">Satisfied</option><option value="false">Not satisfied</option></select>
    </div>
    {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    <div className="rounded-lg border overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr>{['Landlord','Entity','Filings','Addresses Represented','Latest Filing','Contact Stage','Service Interest','Next Follow-up'].map((h)=><th key={h} className="px-3 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr></thead><tbody>
      {loading ? <tr><td colSpan={8} className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></td></tr> : items.map((item)=><tr key={item.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={()=>open(item.id)}><td className="px-3 py-3 font-medium min-w-[260px]">{item.name}</td><td className="px-3 py-3"><Badge variant="outline">{item.isCorporate ? <Building2 className="h-3 w-3 mr-1"/> : <User className="h-3 w-3 mr-1"/>}{item.isCorporate?'Corporate':'Person'}</Badge></td><td className="px-3 py-3">{item.filingCount}</td><td className="px-3 py-3">{item.addressCount}</td><td className="px-3 py-3 whitespace-nowrap">{fmt(item.latestFilingDate)}</td><td className="px-3 py-3">{item.contactStage}</td><td className="px-3 py-3 min-w-[180px]">{item.serviceInterests?.join(', ')}</td><td className="px-3 py-3 whitespace-nowrap">{fmt(item.nextTask?.dueAt)}</td></tr>)}
      {!loading && !items.length && <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">No eviction leads match these filters.</td></tr>}
    </tbody></table></div></div>
    <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Page {page} of {pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1} onClick={()=>setPage((p)=>p-1)}><ChevronLeft className="h-4 w-4"/></Button><Button size="sm" variant="outline" disabled={page>=pages} onClick={()=>setPage((p)=>p+1)}><ChevronRight className="h-4 w-4"/></Button></div></div>

    <Dialog open={!!selected} onOpenChange={(v)=>!v&&setSelected(null)}><DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">{selected && <>
      <DialogHeader><DialogTitle className="pr-8">{selected.name}</DialogTitle></DialogHeader>
      <div className="flex flex-wrap gap-2"><Badge>{selected.filings.length} filings loaded</Badge><Badge variant="outline">{selected.addresses.length} Addresses Represented</Badge>{selected.isCorporate&&<Badge variant="secondary">Business plaintiff — identify an owner or manager for people search</Badge>}</div>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="space-y-3 rounded-lg border p-3"><h3 className="font-medium">Prospecting</h3><select className="h-10 w-full rounded-md border bg-background px-2" value={selected.contactStage} onChange={(e)=>patch({contactStage:e.target.value})}>{stages.map((x)=><option key={x}>{x}</option>)}</select><div className="flex flex-wrap gap-2">{services.map((x)=><Button key={x} size="sm" variant={selected.serviceInterests?.includes(x)?'default':'outline'} onClick={()=>toggleService(x)}>{x}</Button>)}</div><Textarea placeholder="Landlord notes" value={selected.notes||''} onChange={(e)=>setSelected({...selected,notes:e.target.value})} onBlur={()=>patch({notes:selected.notes})}/></section>
        <section className="space-y-3 rounded-lg border p-3"><div className="flex justify-between"><h3 className="font-medium">TruePeopleSearch Contact Extractor</h3><Button size="sm" variant="outline" onClick={truePeopleSearch}><ExternalLink className="h-4 w-4 mr-1"/>Open search</Button></div><Textarea className="min-h-[120px] font-mono text-xs" placeholder="Paste all text from TruePeopleSearch; name, phones, and emails will be extracted." value={rawText} onChange={(e)=>setRawText(e.target.value)}/><Button size="sm" onClick={extract} disabled={!rawText.trim()||saving}>{saving?<Loader2 className="h-4 w-4 mr-1 animate-spin"/>:null}Extract and save</Button></section>
      </div>
      <section className="rounded-lg border p-3 space-y-2"><h3 className="font-medium">Contacts</h3>{(selected.contacts?.phoneRows||[]).flatMap((r)=>r.phones.map((p,i)=><div key={`${r.name}-${i}`} className="flex gap-2 text-sm"><span className="font-medium">{r.name||selected.name}</span><a className="text-primary" href={`tel:${p.number}`}>{p.number}</a><span className="text-muted-foreground">{p.type||''} {p.source?`· ${p.source}`:''}</span></div>))}{(selected.contacts?.emailRows||[]).flatMap((r)=>r.emails.map((e)=><div key={e} className="text-sm"><span className="font-medium mr-2">{r.name}</span><a className="text-primary" href={`mailto:${e}`}>{e}</a></div>))}</section>
      <section className="rounded-lg border p-3 space-y-3"><h3 className="font-medium">Outreach & Follow-up</h3><div className="flex flex-col md:flex-row gap-2"><select className="h-10 rounded-md border bg-background px-2" value={activityKind} onChange={(e)=>setActivityKind(e.target.value)}><option value="call">Call outcome</option><option value="text">Text</option><option value="email">Email</option><option value="note">Note</option></select><Input className="flex-1" placeholder="Outcome or activity notes" value={activityBody} onChange={(e)=>setActivityBody(e.target.value)}/><Button onClick={addActivity} disabled={!activityBody.trim()}>Log activity</Button></div><div className="flex gap-2"><Input type="datetime-local" value={taskDue} onChange={(e)=>setTaskDue(e.target.value)}/><Button variant="outline" onClick={addTask} disabled={!taskDue}>Schedule call</Button></div>{selected.tasks.filter((t)=>!t.completed).map((t)=><div key={t.id} className="text-sm text-muted-foreground">Upcoming {t.type}: {new Date(t.dueAt).toLocaleString()} — {t.notes}</div>)}{selected.activities.slice(0,8).map((a)=><div key={a.id} className="text-sm border-l-2 pl-2"><span className="font-medium capitalize">{a.kind}</span> · {fmt(a.createdAt)}<div className="text-muted-foreground">{a.body}</div></div>)}</section>
      <section className="rounded-lg border p-3"><h3 className="font-medium mb-2">Addresses Represented</h3><div className="grid md:grid-cols-2 gap-2">{selected.addresses.map((a)=><div key={a.id} className="rounded bg-muted/40 p-2 text-sm">{a.address}, {a.city}, {a.state} {a.zip}</div>)}</div></section>
      <section className="rounded-lg border p-3"><h3 className="font-medium mb-2">Eviction Filings</h3><div className="max-h-72 overflow-auto"><table className="w-full text-xs"><thead><tr>{['Case','Filed','Status','Precinct','Disposition','Plaintiff Address'].map((x)=><th key={x} className="text-left p-2">{x}</th>)}</tr></thead><tbody>{selected.filings.map((f)=><tr key={f.id} className="border-t"><td className="p-2">{f.caseNumber}</td><td className="p-2 whitespace-nowrap">{fmt(f.filedDate)}</td><td className="p-2">{f.caseStatus}</td><td className="p-2">{f.precinct}</td><td className="p-2">{f.disposition}</td><td className="p-2">{f.plaintiffAddress}</td></tr>)}</tbody></table></div></section>
    </>}</DialogContent></Dialog>
  </div>;
}
