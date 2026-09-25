import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CheckCircle, Loader2 } from 'lucide-react';

export interface PreForeclosureVisitResult {
  condition: number;
  note: string;
  outcomeLabel: string;
}

interface PreForeclosureVisitWizardProps {
  onComplete: (result: PreForeclosureVisitResult) => Promise<void>;
  onSkip: () => Promise<void>;
  isPending: boolean;
}

export function PreForeclosureVisitWizard({ onComplete, onSkip, isPending }: PreForeclosureVisitWizardProps) {
  const [condition, setCondition] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const canSubmit = condition !== null;

  const handleSubmit = async () => {
    if (condition === null) return;

    const parts: string[] = [`Condition: ${condition}/10`];
    if (note.trim()) {
      parts.push(`Note: ${note.trim()}`);
    }

    await onComplete({
      condition,
      note: note.trim(),
      outcomeLabel: parts.join(' | '),
    });
  };

  return (
    <div className="space-y-3 overflow-x-hidden">
      {/* Condition */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Condition of Home</Label>
        <div className="grid grid-cols-5 gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <Button
              key={n}
              variant={condition === n ? 'default' : 'outline'}
              className={cn(
                'h-8 w-full font-medium text-xs',
                condition === n && n <= 3 && 'bg-red-600 hover:bg-red-700',
                condition === n && n >= 4 && n <= 6 && 'bg-amber-600 hover:bg-amber-700',
                condition === n && n >= 7 && 'bg-green-600 hover:bg-green-700',
              )}
              onClick={() => setCondition(n)}
            >
              {n}
            </Button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground px-1">
          <span>Poor</span>
          <span>Excellent</span>
        </div>
      </div>

      {/* Note */}
      <Input
        placeholder="Add a note (optional)..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="h-8 text-xs"
      />

      {/* Submit */}
      <div className="flex flex-col sm:flex-row gap-1.5 pt-2 border-t">
        <Button
          variant="ghost"
          className="h-8 text-xs text-muted-foreground sm:flex-1"
          onClick={onSkip}
          disabled={isPending}
        >
          Just Mark Visited (Skip)
        </Button>
        <Button
          className="h-8 text-xs sm:flex-1"
          disabled={!canSubmit || isPending}
          onClick={handleSubmit}
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
          Complete Visit
        </Button>
      </div>
    </div>
  );
}
