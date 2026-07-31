import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ShieldCheck } from 'lucide-react';
import { verifyPassword } from '../api/evictionsCrm';

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onGranted: () => void };

export function PasswordGateDialog({ open, onOpenChange, onGranted }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checking) return;
    if (!password) return;
    setChecking(true); setError('');
    try {
      await verifyPassword(password);
      setPassword('');
      onGranted();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setPassword(''); setError(''); } onOpenChange(next); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Evictions CRM
          </DialogTitle>
          <DialogDescription>
            Re-enter your password to open the CRM workspace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="password"
            autoFocus
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            disabled={checking}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={!password || checking}>
            {checking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enter workspace
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
