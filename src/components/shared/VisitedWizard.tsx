import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CheckCircle, X, Phone, Check, Loader2 } from 'lucide-react';
import type { WorkflowStage } from '@/types/property';

export interface VisitedWizardResult {
  ownerAnswered: boolean;
  phoneProvided: boolean;
  phoneNumber: string;
  solvedForeclosure: boolean;
  propertyType: 'primary' | 'rental' | 'vacant';
  condition: number;
  note: string;
  nextWorkflowStage: WorkflowStage;
  outcomeLabel: string;
}

interface VisitedWizardProps {
  address: string;
  onComplete: (result: VisitedWizardResult) => Promise<void>;
  onSkip: () => Promise<void>;
  isPending: boolean;
}

export function VisitedWizard({ address, onComplete, onSkip, isPending }: VisitedWizardProps) {
  const [step, setStep] = useState(1);
  const [ownerAnswered, setOwnerAnswered] = useState<boolean | null>(null);
  const [phoneProvided, setPhoneProvided] = useState<boolean | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [solvedForeclosure, setSolvedForeclosure] = useState<boolean | null>(null);
  const [propertyType, setPropertyType] = useState<'primary' | 'rental' | 'vacant' | null>(null);
  const [condition, setCondition] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const totalSteps = ownerAnswered === false ? 4 : 5;
  const getDisplayStep = (s: number) => {
    if (ownerAnswered === false && s >= 3) return s - 1;
    return s;
  };

  const handleSubmit = async () => {
    if (!propertyType || condition === null) return;

    let nextStage: WorkflowStage;
    if (solvedForeclosure) {
      nextStage = 'dead_end';
    } else if (ownerAnswered && propertyType === 'primary') {
      nextStage = 'negotiating';
    } else {
      nextStage = 'people_search';
    }

    const parts: string[] = [];
    parts.push(`Owner answered: ${ownerAnswered ? 'Yes' : 'No'}`);
    if (ownerAnswered && phoneProvided) {
      parts.push(`Phone: ${phoneNumber.trim()}`);
    } else if (ownerAnswered) {
      parts.push('No phone provided');
    }
    parts.push(`Foreclosure solved: ${solvedForeclosure ? 'Yes' : 'No'}`);
    parts.push(`Property: ${propertyType === 'primary' ? 'Primary Home' : propertyType === 'rental' ? 'Rental' : 'Vacant'}`);
    parts.push(`Condition: ${condition}/10`);
    if (note.trim()) {
      parts.push(`Note: ${note.trim()}`);
    }

    await onComplete({
      ownerAnswered: ownerAnswered!,
      phoneProvided: phoneProvided || false,
      phoneNumber: phoneNumber.trim(),
      solvedForeclosure: solvedForeclosure!,
      propertyType,
      condition,
      note: note.trim(),
      nextWorkflowStage: nextStage,
      outcomeLabel: parts.join(' | '),
    });
  };

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((displayNum) => {
          const currentDisplay = getDisplayStep(step);
          const isActive = displayNum === currentDisplay;
          const isDone = displayNum < currentDisplay;
          return (
            <div key={displayNum} className="flex items-center">
              {displayNum > 1 && (
                <div className={cn('w-6 h-0.5 mx-0.5', isDone ? 'bg-primary/50' : 'bg-secondary')} />
              )}
              <div className={cn(
                'h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-medium',
                isActive && 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background',
                isDone && 'bg-primary/20 text-primary',
                !isActive && !isDone && 'bg-secondary text-muted-foreground',
              )}>
                {isDone ? <Check className="h-3 w-3" /> : displayNum}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 1: Did owner answer the door? */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Did owner answer the door?</p>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="justify-start" onClick={() => { setOwnerAnswered(true); setStep(2); }}>
              <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> Yes
            </Button>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => { setOwnerAnswered(false); setPhoneProvided(null); setPhoneNumber(''); setStep(3); }}>
              <X className="h-4 w-4 mr-2 text-red-500" /> No
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Phone number (only if owner answered) */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Did they provide a phone number?</p>
          <div className="flex flex-col gap-2">
            <Button variant={phoneProvided === true ? 'default' : 'outline'} size="sm" className="justify-start" onClick={() => setPhoneProvided(true)}>
              <Phone className="h-4 w-4 mr-2" /> Yes
            </Button>
            <Button variant={phoneProvided === false ? 'default' : 'outline'} size="sm" className="justify-start" onClick={() => { setPhoneProvided(false); setPhoneNumber(''); }}>
              <X className="h-4 w-4 mr-2" /> No
            </Button>
          </div>
          {phoneProvided === true && (
            <div className="space-y-1">
              <Label className="text-xs">Phone Number</Label>
              <Input type="tel" placeholder="Enter phone number..." value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
            </div>
          )}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>Back</Button>
            <Button size="sm" disabled={phoneProvided === null || (phoneProvided === true && !phoneNumber.trim())} onClick={() => setStep(3)}>Next</Button>
          </div>
        </div>
      )}

      {/* Step 3: Did they solve foreclosure? */}
      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Did they solve the foreclosure?</p>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="justify-start" onClick={() => { setSolvedForeclosure(true); setStep(4); }}>
              <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> Yes
            </Button>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => { setSolvedForeclosure(false); setStep(4); }}>
              <X className="h-4 w-4 mr-2 text-red-500" /> No
            </Button>
          </div>
          <div className="flex justify-start pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(ownerAnswered ? 2 : 1)}>Back</Button>
          </div>
        </div>
      )}

      {/* Step 4: Property type */}
      {step === 4 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">What type of property is this?</p>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="justify-start" onClick={() => { setPropertyType('primary'); setStep(5); }}>Primary Home</Button>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => { setPropertyType('rental'); setStep(5); }}>Rental</Button>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => { setPropertyType('vacant'); setStep(5); }}>Vacant</Button>
          </div>
          <div className="flex justify-start pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(3)}>Back</Button>
          </div>
        </div>
      )}

      {/* Step 5: Condition + note + submit */}
      {step === 5 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Condition of Home</p>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <Button
                key={n}
                size="sm"
                variant={condition === n ? 'default' : 'outline'}
                className={cn(
                  'h-9 w-full font-medium',
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
          <Input placeholder="Add a note (optional)..." value={note} onChange={(e) => setNote(e.target.value)} className="text-sm" />

          {/* Summary */}
          <div className="bg-secondary/30 rounded-lg p-3 text-xs space-y-1">
            <p><span className="text-muted-foreground">Owner answered:</span> {ownerAnswered ? 'Yes' : 'No'}</p>
            {ownerAnswered && phoneProvided && <p><span className="text-muted-foreground">Phone:</span> {phoneNumber}</p>}
            <p><span className="text-muted-foreground">Foreclosure solved:</span> {solvedForeclosure ? 'Yes' : 'No'}</p>
            <p><span className="text-muted-foreground">Property:</span> {propertyType === 'primary' ? 'Primary Home' : propertyType === 'rental' ? 'Rental' : 'Vacant'}</p>
            {condition !== null && <p><span className="text-muted-foreground">Condition:</span> {condition}/10</p>}
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(4)}>Back</Button>
            <Button size="sm" disabled={condition === null || isPending} onClick={handleSubmit}>
              {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Complete Visit
            </Button>
          </div>
        </div>
      )}

      {/* Skip wizard option */}
      <div className="border-t pt-3">
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onSkip} disabled={isPending}>
          Just Mark Visited (Skip Questions)
        </Button>
      </div>
    </div>
  );
}
