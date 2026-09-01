import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, getAuthHeaders } from '@/lib/api';
import { Building2, ChevronLeft, ChevronRight, Loader2, Search, Upload, User } from 'lucide-react';
import MlsLeadDetails from './MlsLeadDetails';

export type MlsContactOfficer = { name: string; title: string; address: string };

export type MlsContact = {
  id: string;
  role: string;
  name: string;
  nameKind: string;
  searchName: string;
  mailingAddress: string;
  phoneNumbers: string[];
  emails: string[];
  // Raw, unvalidated JSON column — same { phoneRows, emailRows } shape as
  // EvictionLandlord.contacts, but never pre-normalised by the API. Typed as
  // `unknown` rather than NormalizedContacts so a reader can't skip
  // normalizeContacts and let a raw payload through untyped.
  contacts: unknown;
  entityTaxpayerNumber: string;
  entityFileNumber: string;
  entityStatus: string;
  entityLookupAt: string | null;
  entityLookupStatus: string | null;
  registeredAgentName: string;
  registeredOfficeAddress: string;
  stateOfFormation: string;
  sosRegistrationStatus: string;
  sosRegistrationDate: string;
  rightToTransact: string;
  officers: MlsContactOfficer[];
  workflowStage: string;
  notes: string;
};

export type MlsLead = {
  id: string;
  mlsNumber: string;
  status: string;
  previousStatus: string | null;
  statusChangedAt: string | null;
  address: string;
  streetNumber: string;
  streetDir: string;
  streetName: string;
  zip: string;
  zipPlus: string;
  county: string;
  state: string;
  areaCode: string;
  price: number | null;
  daysOnMarket: number | null;
  totalUnits: number | null;
  squareFeet: number | null;
  yearBuilt: number | null;
  propertyType: string;
  construction: string;
  builderName: string;
  legalDescription: string;
  legalLot: string;
  countyAccountNumber: string;
  taxPropId: string;
  countyTax: string;
  listAgent: string;
  listAgentPhone: string;
  sellingAgent: string;
  sellingAgentPhone: string;
  lreaLreb: string;
  mlsOwnerRaw: string;
  cadLookupAt: string | null;
  cadLookupStatus: string | null;
  notes: string;
  hidden: boolean;
  hiddenAt: string | null;
  contacts: MlsContact[];
};

type ImportSummary = { created: number; updated: number; statusChanges: number; total: number };

const request = async (path: string, init?: RequestInit) => {
  const headers = { ...getAuthHeaders(), ...(init?.headers || {}) } as Record<string, string>;
  if (init?.body instanceof FormData) delete headers['Content-Type'];

  const res = await fetch(`${API_BASE_URL}/api/mls-leads${path}`, { ...init, headers });
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

export const fmtMoney = (value?: number | null) => (value == null ? '—' : `$${value.toLocaleString()}`);
export const fmtDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString() : '—');

// Pill tone keyword, translated to Tailwind classes via PILL_TONE_CLASSES.
const PILL_BASE = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold';
const PILL_TONE_CLASSES: Record<string, string> = {
  '': 'bg-muted text-muted-foreground',
  grey: 'bg-muted text-muted-foreground',
  blue: 'bg-primary/15 text-primary',
  warn: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
  success: 'bg-success/15 text-success',
};
export const pillClass = (tone: string) => `${PILL_BASE} ${PILL_TONE_CLASSES[tone] ?? PILL_TONE_CLASSES.grey}`;

// connectMLS statuses aren't a closed enum in the data we've seen, so unknown
// codes fall back to grey rather than breaking the pill.
const STATUS_PILL_TONE: Record<string, string> = { ACT: 'blue', SLD: 'success', PEND: 'warn', EXP: 'danger', WD: 'danger', CS: 'grey' };
export const statusTone = (status: string) => STATUS_PILL_TONE[status] ?? 'grey';

export default function MlsLeadsView() {
  const [items, setItems] = useState<MlsLead[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [county, setCounty] = useState('');
  const [minUnits, setMinUnits] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  const [selected, setSelected] = useState<MlsLead | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    Object.entries({ search, status, county, minUnits }).forEach(([k, v]) => v && params.set(k, v));
    if (showHidden) params.set('showHidden', 'true');
    try {
      const data = await request(`/?${params}`);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load MLS leads');
    } finally {
      setLoading(false);
    }
  }, [page, search, status, county, minUnits, showHidden]);
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  const open = async (id: string) => {
    const detail = await request(`/${id}`);
    setSelected(detail);
  };

  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setUploading(true); setError(''); setImportResult(null);
    try {
      const form = new FormData();
      Array.from(fileList).forEach((file) => form.append('files', file));
      const result = await request('/import', { method: 'POST', body: form });
      setImportResult({ created: result.created, updated: result.updated, statusChanges: result.statusChanges, total: result.total });
      setPage(1);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  const toggleHidden = async (item: MlsLead, e: React.MouseEvent) => {
    e.stopPropagation();
    const hidden = !item.hidden;
    await request(`/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden }) });
    setSelected((prev) => (prev && prev.id === item.id ? { ...prev, hidden } : prev));
    await load();
  };

  const saveNotes = async (notes: string) => {
    if (!selected) return;
    await request(`/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) });
    setSelected((prev) => (prev ? { ...prev, notes } : prev));
    await load();
  };

  return <div className="min-h-full p-6 md:p-8 text-sm">
    <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
      <div>
        <p className="label">MULTIFAMILY LEAD LIST</p>
        <h1 className="text-2xl font-semibold">Custom MLS Leads</h1>
        <p className="mt-1 text-muted-foreground"><span className="record">{total.toLocaleString()}</span> listings imported from connectMLS</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <label>
          <input type="file" accept=".xls" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} disabled={uploading}/>
          <span className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer aria-disabled:opacity-50 aria-disabled:pointer-events-none" role="button" aria-disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Upload className="h-4 w-4"/>}
            {uploading ? 'Importing…' : 'Import connectMLS Export'}
          </span>
        </label>
        {uploading && <span className="text-xs text-muted-foreground">Keep this page open while the import runs.</span>}
      </div>
    </div>

    {importResult && (
      <div className="mb-[18px] flex items-center justify-between gap-3 rounded-r-md border-l-[3px] border-primary bg-primary/10 px-3.5 py-3">
        <span>
          Imported <span className="record">{importResult.total}</span> rows — <span className="record">{importResult.created}</span> new,{' '}
          <span className="record">{importResult.updated}</span> updated, <span className="record">{importResult.statusChanges}</span> status changes.
        </span>
        <button className="text-xs text-muted-foreground underline shrink-0" onClick={() => setImportResult(null)}>Dismiss</button>
      </div>
    )}

    <div className="rounded border bg-card grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.7fr_repeat(3,1fr)_auto] gap-[11px] p-4 mb-[18px] items-end">
      <label className="grid gap-1.5">
        <span className="label">SEARCH</span>
        <span className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
          <input className="h-10 w-full rounded border bg-card pl-8 pr-3 text-sm" placeholder="Address, owner, or MLS#" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/>
        </span>
      </label>
      <label className="grid gap-1.5">
        <span className="label">STATUS</span>
        <input className="h-10 w-full rounded border bg-card px-3 text-sm" placeholder="e.g. ACT, SLD" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}/>
      </label>
      <label className="grid gap-1.5">
        <span className="label">COUNTY</span>
        <input className="h-10 w-full rounded border bg-card px-3 text-sm" placeholder="Exact county" value={county} onChange={(e) => { setCounty(e.target.value); setPage(1); }}/>
      </label>
      <label className="grid gap-1.5">
        <span className="label">MIN UNITS</span>
        <input className="h-10 w-full rounded border bg-card px-3 text-sm" type="number" min={0} value={minUnits} onChange={(e) => { setMinUnits(e.target.value); setPage(1); }}/>
      </label>
      <label className="flex h-10 items-center gap-2 whitespace-nowrap">
        <input type="checkbox" checked={showHidden} onChange={(e) => { setShowHidden(e.target.checked); setPage(1); }}/>
        <span className="label">SHOW HIDDEN</span>
      </label>
    </div>

    {error && <div className="mb-[18px] rounded-r-md border-l-[3px] border-destructive bg-destructive/10 px-3.5 py-3 text-destructive">{error}</div>}

    <div className="rounded border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr>{['Address', 'Status', 'Units', 'Price', 'County', 'Owner', ''].map((h) => <th key={h || 'actions'}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="py-[45px] px-2.5 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></td></tr> : items.map((item) => {
              const owner = item.contacts?.find((c) => c.role === 'mls_owner');
              return <tr key={item.id} className="cursor-pointer" onClick={() => open(item.id)}>
                <td className="record min-w-[220px]">{item.address || '—'}</td>
                <td>
                  <span className={pillClass(statusTone(item.status))}>{item.status || '—'}</span>
                  {item.previousStatus && <div className="mt-1 text-[10px] text-muted-foreground">was {item.previousStatus}</div>}
                </td>
                <td className="record">{item.totalUnits ?? '—'}</td>
                <td>
                  <div className="text-[10px] text-muted-foreground">{item.status === 'SLD' ? 'Sale price' : 'List price'}</div>
                  <div className="record">{fmtMoney(item.price)}</div>
                </td>
                <td>{item.county || '—'}</td>
                <td className="min-w-[200px]">
                  {owner ? (
                    <span className="flex items-center gap-1.5">
                      <span>{owner.name}</span>
                      <span className={pillClass('grey')}>
                        {owner.nameKind === 'entity' ? <Building2 className="h-3 w-3"/> : <User className="h-3 w-3"/>}
                        {owner.nameKind === 'entity' ? 'Entity' : 'Person'}
                      </span>
                    </span>
                  ) : <span className="text-muted-foreground">{item.mlsOwnerRaw || '—'}</span>}
                </td>
                <td>
                  <button className="rounded border bg-card px-2 py-1 text-xs hover:bg-muted" onClick={(e) => toggleHidden(item, e)}>{item.hidden ? 'Unhide' : 'Hide'}</button>
                </td>
              </tr>;
            })}
            {!loading && !items.length && <tr><td colSpan={7} className="py-[45px] px-2.5 text-center text-muted-foreground">No MLS leads match these filters.</td></tr>}
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

    <MlsLeadDetails lead={selected} onClose={() => setSelected(null)} onSaveNotes={saveNotes}/>
  </div>;
}
