import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, FileSpreadsheet, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useViewAs } from '@/contexts/ViewAsContext';
import { toast } from '@/hooks/use-toast';
import { addSheetsCrmRow, getSheetsCrmConnection, getSheetsCrmRows, updateSheetsCrmRow, type SheetsCrmRow } from './api';

const PRIMARY_COLUMNS: Record<number, string[]> = {
  46204754: ['Address', 'Owner Name', 'BCAD Appraised Value', 'Acquisition Stage', 'Contact Status', 'Next Action'],
  1602785828: ['Priority', 'Property / Area', 'Research Task', 'Status', 'Finding', 'Next Step'],
  2090779059: ['Address / Parcel ID', 'Owner', 'Stage', 'Follow-up Date', 'Next Action'],
};
const selectClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm';

export default function SheetsCrmView() {
  const { user } = useAuth();
  const { viewAsUserId } = useViewAs();
  const allowed = Boolean(user) && !viewAsUserId;
  const canWrite = user?.role === 'ADMIN' || user?.role === 'OPERATOR';
  const queryClient = useQueryClient();
  const [sheetId, setSheetId] = useState(46204754);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<{ row: SheetsCrmRow | null; values: string[] } | null>(null);
  const [saveError, setSaveError] = useState('');
  const key = ['sheets-crm', user?.id, sheetId];
  const connection = useQuery({ queryKey: ['sheets-crm-connection', user?.id], queryFn: getSheetsCrmConnection, enabled: allowed, retry: false });
  const grid = useQuery({ queryKey: key, queryFn: () => getSheetsCrmRows(sheetId), enabled: allowed && connection.data?.configured === true, retry: false, refetchOnWindowFocus: false });
  const data = grid.data;
  const statusIndex = data?.headers.findIndex((header) => ['Acquisition Stage', 'Status', 'Stage'].includes(header)) ?? -1;
  const statuses = useMemo(() => [...new Set(data?.rows.map((row) => row.cells[statusIndex]?.value).filter(Boolean) ?? [])].sort(), [data, statusIndex]);
  const filtered = useMemo(() => (data?.rows ?? []).filter((row) =>
    (stage === 'all' || row.cells[statusIndex]?.value === stage) &&
    (!search.trim() || row.cells.some((cell) => cell.value.toLowerCase().includes(search.trim().toLowerCase())))
  ), [data, search, stage, statusIndex]);
  const columnIndexes = useMemo(() => {
    if (!data) return [];
    const preferred = PRIMARY_COLUMNS[sheetId].map((name) => data.headers.indexOf(name)).filter((index) => index >= 0);
    return preferred.length ? preferred : data.headers.map((_, index) => index).slice(0, 6);
  }, [data, sheetId]);
  const maxPage = Math.max(0, Math.ceil(filtered.length / 25) - 1);
  const rows = filtered.slice(Math.min(page, maxPage) * 25, (Math.min(page, maxPage) + 1) * 25);
  useEffect(() => { setPage(0); }, [search, stage, sheetId]);
  useEffect(() => { setEditor(null); setSaveError(''); }, [sheetId, user?.id, viewAsUserId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!editor) return;
      if (editor.row) await updateSheetsCrmRow(sheetId, editor.row, editor.values);
      else await addSheetsCrmRow(sheetId, editor.values);
    },
    onSuccess: async () => {
      setEditor(null); setSaveError('');
      toast({ title: 'Saved to Google Sheets' });
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error) => setSaveError(error instanceof Error ? error.message : 'The record was not saved.'),
  });

  if (!allowed) return <div className="p-6 text-muted-foreground">{viewAsUserId ? 'Exit teammate view to open the Government Hill CRM.' : 'Sign in to open Government Hill.'}</div>;
  const error = connection.error || grid.error;
  const busy = connection.isFetching || grid.isFetching;
  const openEditor = (row: SheetsCrmRow | null) => {
    setSaveError('');
    setEditor({ row, values: row ? row.cells.map((cell) => cell.value) : (data?.headers ?? []).map(() => '') });
  };

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground"><FileSpreadsheet className="h-4 w-4" /> Google Sheets CRM</div>
          <h1 className="text-2xl font-semibold">Government Hill</h1>
          <p className="text-sm text-muted-foreground">Josephine–Nika acquisitions, parcel research, and owner outreach.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {connection.data && <Button asChild variant="outline"><a href={`${connection.data.spreadsheetUrl}#gid=${sheetId}`} target="_blank" rel="noopener noreferrer">Open sheet <ArrowUpRight className="ml-2 h-4 w-4" /></a></Button>}
          <Button variant="outline" disabled={busy} onClick={() => { void connection.refetch(); if (connection.data?.configured) void grid.refetch(); }}><RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Refresh</Button>
          <Button disabled={!canWrite || !data || Boolean(error)} onClick={() => openEditor(null)}><Plus className="mr-2 h-4 w-4" />Add record</Button>
        </div>
      </header>

      <section aria-label="Data connection status" className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
        <p><strong>Storage:</strong> Live Google Sheets</p>
        <p><strong>PostgreSQL transfer:</strong> Not configured. Worksheet records are not copied to PostgreSQL.</p>
        <p><strong>Refresh:</strong> When this view opens, after saving, or when you click Refresh. No scheduled background transfer.</p>
        <p><strong>Last successful read:</strong> {data ? new Date(data.refreshedAt).toLocaleString() : 'No successful read in this view yet.'}</p>
      </section>

      <div role="tablist" aria-label="Government Hill worksheets" className="flex gap-1 overflow-x-auto border-b">
        {(connection.data?.tabs ?? [{ sheetId: 46204754, title: 'Parcels' }, { sheetId: 1602785828, title: 'Research Queue' }, { sheetId: 2090779059, title: 'Outreach Pipeline' }]).map((tab) => <button key={tab.sheetId} role="tab" aria-selected={sheetId === tab.sheetId} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${sheetId === tab.sheetId ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} onClick={() => { setSheetId(tab.sheetId); setSearch(''); setStage('all'); }}>{tab.title}</button>)}
      </div>

      {connection.isPending && <div role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-5 w-5 animate-spin" />Connecting to Google Sheets…</div>}
      {connection.data && !connection.data.configured && <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">{connection.data.error || 'Google Sheets needs to be configured on the server.'}</div>}
      {error && <div role="alert" className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div><p className="font-medium">Could not load the worksheet</p><p className="text-sm">{error instanceof Error ? error.message : 'Please try again.'}</p>{connection.data?.serviceAccountEmail && <p className="mt-2 break-all text-xs text-muted-foreground">Connection account: {connection.data.serviceAccountEmail}</p>}</div></div>}
      {grid.isPending && connection.data?.configured && <div role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-5 w-5 animate-spin" />Loading records…</div>}

      {data && <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search Government Hill records" placeholder="Search addresses, owners, notes…" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full pl-9 sm:w-80" /></div>
            {statusIndex >= 0 && <select aria-label="Filter by status" className={selectClass} value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select>}
          </div>
          <p className="text-xs text-muted-foreground">{filtered.length} of {data.rows.length} records · Updated {new Date(data.refreshedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
        </div>
        {data.truncated && <p className="text-sm text-amber-700">Showing the first 1,000 sheet rows. Open Google Sheets for records beyond this range.</p>}
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="min-w-full text-left text-sm"><thead className="bg-muted/50"><tr>{columnIndexes.map((index) => <th key={index} className="whitespace-nowrap px-4 py-3 font-medium">{data.headers[index]}</th>)}<th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.rowNumber} className="border-t hover:bg-muted/20">{columnIndexes.map((index) => <td key={index} className="min-w-32 max-w-xs px-4 py-3 align-top"><span className={`block whitespace-pre-wrap break-words ${index === data.tab.keyColumn ? 'font-medium' : ''}`}>{row.cells[index]?.value || '—'}</span></td>)}<td className="px-4 py-3 align-top"><Button size="sm" variant="outline" onClick={() => openEditor(row)} disabled={!canWrite} aria-label={`Edit ${row.cells[data.tab.keyColumn]?.value || 'record'}`}>View / edit</Button></td></tr>)}
            {!rows.length && <tr><td colSpan={columnIndexes.length + 1} className="px-4 py-12 text-center text-muted-foreground">{data.rows.length ? 'No records match your search.' : 'No records yet. Add a record to get started.'}</td></tr>}</tbody>
          </table>
        </div>
        {maxPage > 0 && <div className="flex items-center justify-end gap-3 text-sm"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>Page {Math.min(page, maxPage) + 1} of {maxPage + 1}</span><Button variant="outline" size="sm" disabled={page >= maxPage} onClick={() => setPage((value) => value + 1)}>Next</Button></div>}
        <p className="text-xs text-muted-foreground">Records are stored in Google Sheets. Refresh to load changes made in the workbook.</p>
      </>}

      <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open && !save.isPending) setEditor(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editor?.row ? 'Record details' : 'Add record'} · {data?.tab.title}</DialogTitle><DialogDescription>Save updates directly to the connected worksheet.</DialogDescription></DialogHeader>
          {editor && data && <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">{data.headers.map((header, index) => {
              if (!header) return null;
              const cell = editor.row?.cells[index] ?? data.rows[0]?.cells[index];
              const editable = cell?.editable !== false;
              const options = cell?.checkbox ? ['TRUE', 'FALSE'] : cell?.options;
              const long = /notes|description|action|task|finding|response|next step|mailing/i.test(header);
              const id = `sheets-field-${index}`;
              const setValue = (value: string) => setEditor((current) => current ? { ...current, values: current.values.map((old, col) => col === index ? value : old) } : null);
              return <div key={index} className={long ? 'sm:col-span-2' : ''}><label htmlFor={id} className="mb-1 block text-sm font-medium">{header}{index === data.tab.keyColumn ? ' *' : ''}</label>
                {options ? <select id={id} disabled={!editable || save.isPending} className={`${selectClass} w-full`} value={editor.values[index]} onChange={(event) => setValue(event.target.value)} required={index === data.tab.keyColumn}><option value="">Choose…</option>{!options.includes(editor.values[index]) && editor.values[index] && <option value={editor.values[index]}>{editor.values[index]}</option>}{options.map((value) => <option key={value} value={value}>{value}</option>)}</select>
                : long ? <Textarea id={id} value={editor.values[index]} onChange={(event) => setValue(event.target.value)} readOnly={!editable} disabled={save.isPending} maxLength={10000} required={index === data.tab.keyColumn} />
                : <Input id={id} value={editor.values[index]} onChange={(event) => setValue(event.target.value)} readOnly={!editable} disabled={save.isPending} maxLength={10000} required={index === data.tab.keyColumn} />}
                {!editable && <p className="mt-1 text-xs text-muted-foreground">Managed in Google Sheets</p>}
              </div>;
            })}</div>
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" disabled={save.isPending || (Boolean(editor.row) && editor.values.every((value, index) => value === editor.row!.cells[index].value))}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save to sheet</Button></DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
