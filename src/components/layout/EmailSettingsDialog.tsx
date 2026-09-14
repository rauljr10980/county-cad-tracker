import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail } from 'lucide-react';
import {
  getMyEmailSettings, setMyEmailSettings, clearMyEmailSettings, sendTestEmail,
  setUserEmailSettings, clearUserEmailSettings, sendTestEmailForUser,
  type TeamEmailStatus,
} from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface EmailSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Admin-only: edit this teammate's credentials instead of the caller's own. */
  targetUser?: Pick<TeamEmailStatus, 'id' | 'username' | 'email' | 'smtpUsername' | 'smtpConfigured'>;
  /** Admin-only: called after a successful save or deactivate, so the roster badge can refresh. */
  onChanged?: () => void;
}

export default function EmailSettingsDialog({ isOpen, onClose, targetUser, onChanged }: EmailSettingsDialogProps) {
  const [configured, setConfigured] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpAppPassword, setSmtpAppPassword] = useState('');
  const [testTo, setTestTo] = useState('');
  const [loading, setLoading] = useState(!targetUser);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTestResult(null);

    if (targetUser) {
      setConfigured(targetUser.smtpConfigured);
      setSmtpUsername(targetUser.smtpUsername ?? '');
      setSmtpAppPassword('');
      setTestTo(targetUser.smtpUsername ?? targetUser.email);
      setLoading(false);
      return;
    }

    setLoading(true);
    getMyEmailSettings()
      .then((settings) => {
        setConfigured(settings.configured);
        setSmtpUsername(settings.smtpUsername ?? '');
        setTestTo(settings.smtpUsername ?? '');
      })
      .catch((err) => {
        toast({
          title: 'Failed to load email settings',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        });
      })
      .finally(() => setLoading(false));
  }, [isOpen, targetUser]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (targetUser) {
        await setUserEmailSettings(targetUser.id, smtpUsername, smtpAppPassword);
      } else {
        await setMyEmailSettings(smtpUsername, smtpAppPassword);
      }
      setConfigured(true);
      setSmtpAppPassword('');
      toast({ title: 'Email settings saved' });
      onChanged?.();
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

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = targetUser
        ? await sendTestEmailForUser(targetUser.id, testTo)
        : await sendTestEmail(testTo);
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Failed to send test email' });
    } finally {
      setTesting(false);
    }
  };

  const handleDeactivate = async () => {
    setSaving(true);
    try {
      if (targetUser) {
        await clearUserEmailSettings(targetUser.id);
      } else {
        await clearMyEmailSettings();
      }
      setConfigured(false);
      setSmtpUsername('');
      setSmtpAppPassword('');
      setTestTo('');
      setTestResult(null);
      toast({ title: 'Email deactivated' });
      onChanged?.();
    } catch (err) {
      toast({
        title: 'Failed to deactivate',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {targetUser ? `Email Settings — ${targetUser.username}` : 'Email Settings'}
          </DialogTitle>
          <DialogDescription>
            {targetUser
              ? `Set or clear ${targetUser.username}'s Gmail address and App Password for sending email.`
              : 'Send emails from your own Gmail address instead of the shared account.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-username">Gmail address</Label>
              <Input
                id="smtp-username"
                type="email"
                value={smtpUsername}
                onChange={(e) => setSmtpUsername(e.target.value)}
                placeholder="you@gmail.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-app-password">App password</Label>
              <Input
                id="smtp-app-password"
                type="password"
                value={smtpAppPassword}
                onChange={(e) => setSmtpAppPassword(e.target.value)}
                placeholder={configured ? 'Enter a new app password to change it' : '16-character app password'}
              />
            </div>

            {configured && (
              <div className="space-y-1.5">
                <Label htmlFor="test-email-to">Send test to</Label>
                <Input
                  id="test-email-to"
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            )}

            {testResult && (
              <p className={testResult.success ? 'text-sm text-green-600' : 'text-sm text-destructive'}>
                {testResult.success ? 'Test email sent successfully.' : testResult.error}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={handleSave}
                disabled={saving || !smtpUsername || !smtpAppPassword}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !configured || !testTo}>
                {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Send test email
              </Button>
            </div>

            {configured && (
              <Button size="sm" variant="ghost" className="w-full text-destructive" onClick={handleDeactivate} disabled={saving}>
                Deactivate
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
