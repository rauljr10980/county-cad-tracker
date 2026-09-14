import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pillClass } from '@/lib/pillBadge';
import EmailSettingsDialog from '@/components/layout/EmailSettingsDialog';
import { getTeamEmailSettings, type TeamEmailStatus } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const ROLE_LABELS: Record<'ADMIN' | 'OPERATOR' | 'VIEWER', string> = {
  ADMIN: 'Manager',
  OPERATOR: 'Team Member',
  VIEWER: 'Viewer',
};

export default function ManagementView() {
  const [members, setMembers] = useState<TeamEmailStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TeamEmailStatus | null>(null);

  const load = async () => {
    const { users } = await getTeamEmailSettings();
    setMembers(users);
  };

  const reload = () => {
    load().catch((err) => {
      toast({ title: 'Failed to load team email settings', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    });
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => {
        toast({ title: 'Failed to load team email settings', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, []);

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
        <h1 className="text-2xl font-semibold">Management</h1>
        <p className="text-sm text-muted-foreground">Set up or clear a teammate's email-sending credentials.</p>
      </div>

      <section className="space-y-3 rounded-md border border-border/70 bg-card p-4 shadow-sm">
        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Role</th>
                <th className="px-4 py-2 text-left font-medium">Email sending</th>
                <th className="px-4 py-2 text-left font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{member.username}</td>
                  <td className="px-4 py-2 text-muted-foreground">{ROLE_LABELS[member.role]}</td>
                  <td className="px-4 py-2">
                    <span className={pillClass(member.smtpConfigured ? 'success' : 'grey')}>
                      {member.smtpConfigured ? 'Configured' : 'Not configured'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(member)}>
                      Manage email
                    </Button>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No teammates yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <EmailSettingsDialog
          isOpen
          onClose={() => setEditing(null)}
          targetUser={editing}
          onChanged={reload}
        />
      )}
    </div>
  );
}
