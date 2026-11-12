import { useEffect, useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { setOwnerLlc, type PropertyLabelTarget } from '@/lib/api';

export function OwnerLlcButton({ target, initialValue = false, onChanged }: { target: PropertyLabelTarget; initialValue?: boolean; onChanged?: (value: boolean) => void }) {
  const [marked, setMarked] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const client = useQueryClient();
  useEffect(() => { setMarked(initialValue); }, [target.type, target.id, initialValue]);
  return <Button type="button" size="sm" variant={marked ? 'default' : 'outline'} aria-pressed={marked} disabled={saving} className="h-8 text-xs" onClick={async () => {
    setSaving(true);
    try {
      const result = await setOwnerLlc(target, !marked);
      setMarked(result.ownerIsLlc); onChanged?.(result.ownerIsLlc);
      for (const queryKey of ['properties', 'preforeclosure', 'driving-leads']) void client.invalidateQueries({ queryKey: [queryKey] });
      toast({ title: result.ownerIsLlc ? 'Owner labeled as LLC' : 'LLC label removed' });
    } catch (error) { toast({ title: 'LLC label was not saved', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
    finally { setSaving(false); }
  }}>{saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Building2 className="mr-1.5 h-3.5 w-3.5" />}{marked ? 'LLC owner' : 'Label as LLC'}</Button>;
}
