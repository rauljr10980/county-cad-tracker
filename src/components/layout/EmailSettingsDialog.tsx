import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail } from 'lucide-react';
import { getMyEmailSettings, setMyEmailSettings, clearMyEmailSettings, sendTestEmail } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface EmailSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Lets any signed-in user paste in their own Gmail address + App
 * Password so the "compose and send" feature goes out from their own
 * address instead of the shared system account. Not admin-gated —
 * every user's own setting.
 */
export default function EmailSettingsDialog({ isOpen, onClose }: EmailSettingsDialogProps) {
  const [configured, setConfigured] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpAppPassword, setSmtpAppPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setTestResult(null);
    getMyEmailSettings()
      .then((settings) => {
        setConfigured(settings.configured);
        setSmtpUsername(settings.smtpUsername ?? '');
      })
      .catch((err) => {
        toast({
          title: 'Failed to load email settings',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        });
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setMyEmailSettings(smtpUsername, smtpAppPassword);
      setConfigured(true);
      setSmtpAppPassword('');
      toast({ title: 'Email settings saved' });
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
      const result = await sendTestEmail();
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
      await clearMyEmailSettings();
      setConfigured(false);
      setSmtpUsername('');
      setSmtpAppPassword('');
      setTestResult(null);
      toast({ title: 'Email deactivated' });
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
            Email Settings
          </DialogTitle>
          <DialogDescription>
            Send emails from your own Gmail address instead of the shared account.
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
              <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !configured}>
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
