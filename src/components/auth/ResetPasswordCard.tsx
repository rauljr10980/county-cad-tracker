import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, KeyRound, CheckCircle2 } from 'lucide-react';
import { resetPassword } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface ResetPasswordCardProps {
  token: string;
  onDone: () => void;
}

/**
 * The destination for a '#reset-password=<token>' link (see auth.js's
 * /forgot-password email). Rendered as the whole page rather than a modal —
 * reaching this link means the visitor can't log in, so there's no
 * underlying app view to show behind a dialog.
 */
export function ResetPasswordCard({ token, onDone }: ResetPasswordCardProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (error: any) {
      toast({
        title: 'Could not reset password',
        description: error?.message || 'This reset link may be invalid or expired',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Password updated</h1>
          <p className="text-muted-foreground">You can now log in with your new password.</p>
        </div>
        <Button className="w-full" size="lg" onClick={onDone}>
          Go to login
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full space-y-8">
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <KeyRound className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reset-password">New password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="reset-password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
              disabled={isLoading}
              autoFocus
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reset-confirm-password">Confirm new password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="reset-confirm-password"
              type="password"
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-9"
              disabled={isLoading}
            />
          </div>
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Updating...
            </>
          ) : (
            'Reset password'
          )}
        </Button>
      </form>
    </div>
  );
}
