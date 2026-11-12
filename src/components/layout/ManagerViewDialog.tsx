import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Settings } from 'lucide-react';
import { manageableNavItems } from './navItems';
import { getHiddenTabs, getTabAssignments, saveTabAssignments, type TabAssignments } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface ManagerViewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onHiddenTabsSaved: (hiddenTabIds: Set<string>) => void;
}

export function ManagerViewDialog({ isOpen, onClose, onHiddenTabsSaved }: ManagerViewDialogProps) {
  const [users, setUsers] = useState<TabAssignments['users']>([]);
  const [members, setMembers] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true); setError(''); setUsers([]); setMembers({});
    getTabAssignments().then(data => {
      if (cancelled) return;
      setUsers(data.users);
      const active = new Set(data.users.map(user => user.id));
      setMembers(Object.fromEntries(manageableNavItems.map(item => [item.id,
        (data.tabMembers[item.id] ?? (data.hiddenTabs.includes(item.id) ? [] : data.users.map(user => user.id))).filter(id => active.has(id)),
      ])));
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load assignments.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  const toggle = (tab: string, id: string) => setMembers(previous => {
    const selected = previous[tab] ?? [];
    return { ...previous, [tab]: selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] };
  });
  const save = async () => {
    setSaving(true); setError('');
    try {
      await saveTabAssignments(members);
      onHiddenTabsSaved(new Set(await getHiddenTabs()));
      toast({ title: 'Team tab assignments saved', description: 'Teammates receive the changes within one minute or when they refresh.' });
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save assignments.'); }
    finally { setSaving(false); }
  };

  return <Dialog open={isOpen} onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Manager Settings</DialogTitle><DialogDescription>Choose which team members are subscribed to each tab.</DialogDescription></DialogHeader>
      <p className="text-xs text-muted-foreground">Expand a tab and select its members. Unchecked members will not see or open that section. Dashboard still requires a manager role. New members start unsubscribed after assignments are saved.</p>
      {loading ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : !error || users.length > 0 ? <div className="space-y-2">{manageableNavItems.map(item => {
        const selected = members[item.id] ?? [];
        return <details key={item.id} className="rounded-md border p-3"><summary className="cursor-pointer"><span className="inline-flex items-center gap-2 text-sm font-medium"><item.icon className="h-4 w-4" />{item.label}<span className="text-xs font-normal text-muted-foreground">{selected.length}/{users.length} members</span></span><span className="mt-1 block text-xs text-muted-foreground">{users.filter(user => selected.includes(user.id)).map(user => user.username).join(', ') || 'No members subscribed'}</span></summary>
          <div className="mt-3 space-y-2 border-t pt-3"><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setMembers(previous => ({ ...previous, [item.id]: users.map(user => user.id) }))}>All members</Button><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setMembers(previous => ({ ...previous, [item.id]: [] }))}>No members</Button></div>
            {users.map(user => <label key={user.id} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox aria-label={`${item.label}: ${user.username}`} checked={selected.includes(user.id)} disabled={saving} onCheckedChange={() => toggle(item.id, user.id)} />{user.username}<span className="text-xs text-muted-foreground">{user.role === 'ADMIN' ? 'Manager' : user.role === 'VIEWER' ? 'Viewer' : 'Team member'}</span></label>)}
          </div></details>;
      })}</div> : null}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={save} disabled={loading || saving || !users.length}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save assignments</Button>
    </DialogContent>
  </Dialog>;
}
