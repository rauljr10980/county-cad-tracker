import { useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { pillClass } from '@/lib/pillBadge';
import {
  createInvite,
  getInvites,
  getUsers,
  revokeInvite,
  setUserActive,
  type TeamInvite,
  type TeamMember,
} from '@/lib/api';

const INVITE_STATUS_TONE: Record<TeamInvite['status'], string> = {
  pending: 'warn',
  used: 'success',
  expired: 'grey',
  revoked: 'danger',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TeamView() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = async () => {
    const [invitesRes, usersRes] = await Promise.all([getInvites(), getUsers()]);
    setInvites(invitesRes.invites);
    setMembers(usersRes.users);
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => {
        toast({ title: 'Failed to load team data', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      await createInvite(email.trim());
      setEmail('');
      toast({ title: 'Invite sent' });
      await load();
    } catch (err) {
      toast({ title: 'Failed to send invite', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeInvite(id);
      await load();
    } catch (err) {
      toast({ title: 'Failed to revoke invite', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setRevokingId(null);
    }
  };

  const handleToggleActive = async (member: TeamMember) => {
    setTogglingId(member.id);
    try {
      await setUserActive(member.id, !member.isActive);
      await load();
    } catch (err) {
      toast({ title: 'Failed to update account status', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground">Invite new teammates and manage who has access.</p>
      </div>

      <section className="space-y-3 rounded-md border border-border/70 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-medium">Invite a teammate</h2>
        <form onSubmit={handleSendInvite} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1 space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
            />
          </div>
          <Button type="submit" disabled={sending || !email.trim()}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Send Invite
          </Button>
        </form>

        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Invited By</th>
                <th className="px-4 py-2 text-left font-medium">Sent</th>
                <th className="px-4 py-2 text-left font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id} className="border-t">
                  <td className="px-4 py-2">{invite.email}</td>
                  <td className="px-4 py-2">
                    <span className={pillClass(INVITE_STATUS_TONE[invite.status])}>{invite.status}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{invite.invitedBy.username}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(invite.createdAt)}</td>
                  <td className="px-4 py-2">
                    {invite.status === 'pending' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={revokingId === invite.id}
                        onClick={() => handleRevoke(invite.id)}
                      >
                        {revokingId === invite.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Revoke'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No invites yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-border/70 bg-card p-4 shadow-sm">
        <h2 className="text-sm font-medium">Team members</h2>
        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Role</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Joined</th>
                <th className="px-4 py-2 text-left font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.id === user?.id;
                return (
                  <tr key={member.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{member.username}</td>
                    <td className="px-4 py-2 text-muted-foreground">{member.email}</td>
                    <td className="px-4 py-2 text-muted-foreground">{member.role}</td>
                    <td className="px-4 py-2">
                      <span className={pillClass(member.isActive ? 'success' : 'grey')}>
                        {member.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{formatDate(member.createdAt)}</td>
                    <td className="px-4 py-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSelf || togglingId === member.id}
                        title={isSelf ? "You can't deactivate your own account" : undefined}
                        aria-label={member.isActive ? `Deactivate ${member.username}` : `Activate ${member.username}`}
                        onClick={() => handleToggleActive(member)}
                      >
                        {togglingId === member.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : member.isActive ? (
                          'Deactivate'
                        ) : (
                          'Activate'
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
