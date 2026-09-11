import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, Settings, Copy, Check } from 'lucide-react';
import { manageableNavItems } from './navItems';
import { getHiddenTabs, setHiddenTabs as saveHiddenTabs, getInviteLink } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface ManagerViewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Lets Index.tsx update NavRail immediately after a save, without a reload. */
  onHiddenTabsSaved: (hiddenTabIds: Set<string>) => void;
}

/**
 * ADMIN-only. One account-wide setting a manager controls for the whole
 * team (see navItems.ts and functions/src/routes/settings.js) plus a
 * shareable signup link, so neither requires a code change to maintain.
 */
export function ManagerViewDialog({ isOpen, onClose, onHiddenTabsSaved }: ManagerViewDialogProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loadingTabs, setLoadingTabs] = useState(true);
  const [saving, setSaving] = useState(false);

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteError, setInviteError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setLoadingTabs(true);
    getHiddenTabs()
      .then((ids) => setHidden(new Set(ids)))
      .catch((err) => {
        toast({
          title: 'Failed to load tab settings',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        });
      })
      .finally(() => setLoadingTabs(false));

    setInviteLoading(true);
    setInviteError(false);
    getInviteLink()
      .then((data) => setInviteLink(data.signupUrl))
      .catch(() => setInviteError(true))
      .finally(() => setInviteLoading(false));
  }, [isOpen]);

  const toggle = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ids = Array.from(hidden);
      await saveHiddenTabs(ids);
      onHiddenTabsSaved(new Set(ids));
      toast({ title: 'Tab settings saved' });
      onClose();
    } catch (err) {
      toast({
        title: 'Failed to save',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manager Settings
          </DialogTitle>
          <DialogDescription>
            Control what the whole team sees, and invite new teammates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Visible tabs</h3>
            {loadingTabs ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {manageableNavItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`tab-${item.id}`}
                      checked={!hidden.has(item.id)}
                      onCheckedChange={() => toggle(item.id)}
                    />
                    <Label
                      htmlFor={`tab-${item.id}`}
                      className="flex items-center gap-2 text-sm font-normal cursor-pointer"
                    >
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      {item.label}
                    </Label>
                  </div>
                ))}
              </div>
            )}
            <Button size="sm" className="w-full" onClick={handleSave} disabled={loadingTabs || saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </section>

          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-medium">Invite a teammate</h3>
            <p className="text-xs text-muted-foreground">Anyone with this link can create an account.</p>
            {inviteLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : inviteLink ? (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={inviteLink}
                  className="text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" size="icon" variant="outline" onClick={handleCopyInvite} title="Copy invite link">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-destructive">
                {inviteError ? "Couldn't load the invite link." : 'No invite link available.'}
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
