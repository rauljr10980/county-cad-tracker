import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CheckCircle, X, Phone, Loader2, Home, Building, AlertTriangle, FileText } from 'lucide-react';
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
  const [ownerAnswered, setOwnerAnswered] = useState<boolean | null>(null);
  const [droppedFlyer, setDroppedFlyer] = useState<boolean | null>(null);
  const [phoneProvided, setPhoneProvided] = useState<boolean | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gaveMyNumber, setGaveMyNumber] = useState<boolean | null>(null);
  const [solvedForeclosure, setSolvedForeclosure] = useState<boolean | null>(null);
  const [propertyType, setPropertyType] = useState<'primary' | 'rental' | 'vacant' | null>(null);
  const [condition, setCondition] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const canSubmit =
    ownerAnswered !== null &&
    solvedForeclosure !== null &&
    propertyType !== null &&
    condition !== null &&
    (ownerAnswered === true || droppedFlyer !== null) &&
    (ownerAnswered === false || phoneProvided !== null) &&
    (!(ownerAnswered && phoneProvided) || phoneNumber.trim());

  const handleSubmit = async () => {
    if (!canSubmit || !propertyType || condition === null) return;

    let nextStage: WorkflowStage;
    if (solvedForeclosure) {
      nextStage = 'dead_end';
    } else if (!ownerAnswered && droppedFlyer) {
      nextStage = 'waiting_to_be_contacted';
    } else if (ownerAnswered && !phoneProvided && gaveMyNumber) {
      nextStage = 'waiting_to_be_contacted';
    } else if (ownerAnswered && propertyType === 'primary') {
      nextStage = 'negotiating';
    } else {
      nextStage = 'people_search';
    }

    const parts: string[] = [];
    parts.push(`Owner answered: ${ownerAnswered ? 'Yes' : 'No'}`);
    if (!ownerAnswered && droppedFlyer) {
      parts.push('Dropped flyer');
    }
    if (ownerAnswered && phoneProvided) {
      parts.push(`Phone: ${phoneNumber.trim()}`);
    } else if (ownerAnswered && gaveMyNumber) {
      parts.push('Gave them my number - waiting');
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
    <div className="space-y-3 overflow-x-hidden">
      {/* Q1: Did owner answer the door? */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">1. Did owner answer the door?</Label>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant={ownerAnswered === true ? 'default' : 'outline'}
            className={cn('h-8 text-xs', ownerAnswered === true && 'bg-green-600 hover:bg-green-700')}
            onClick={() => { setOwnerAnswered(true); setDroppedFlyer(null); }}
          >
            <CheckCircle className="h-3.5 w-3.5 mr-1 shrink-0" /> Yes
          </Button>
          <Button
            variant={ownerAnswered === false ? 'default' : 'outline'}
            className={cn('h-8 text-xs', ownerAnswered === false && 'bg-red-600 hover:bg-red-700')}
            onClick={() => { setOwnerAnswered(false); setDroppedFlyer(null); setPhoneProvided(null); setPhoneNumber(''); }}
          >
            <X className="h-3.5 w-3.5 mr-1 shrink-0" /> No
          </Button>
        </div>
      </div>

      {/* Q: Dropped flyer? (only if owner didn't answer) */}
      {ownerAnswered === false && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">2. Drop off a flyer?</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant={droppedFlyer === true ? 'default' : 'outline'}
              className={cn('h-8 text-xs', droppedFlyer === true && 'bg-green-600 hover:bg-green-700')}
              onClick={() => setDroppedFlyer(true)}
            >
              <FileText className="h-3.5 w-3.5 mr-1 shrink-0" /> Yes
            </Button>
            <Button
              variant={droppedFlyer === false ? 'default' : 'outline'}
              className={cn('h-8 text-xs', droppedFlyer === false && 'bg-red-600 hover:bg-red-700')}
              onClick={() => setDroppedFlyer(false)}
            >
              <X className="h-3.5 w-3.5 mr-1 shrink-0" /> No
            </Button>
          </div>
        </div>
      )}

      {/* Q: Phone number (only if owner answered yes) */}
      {ownerAnswered === true && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">2. Did they provide a phone number?</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant={phoneProvided === true ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => { setPhoneProvided(true); setGaveMyNumber(null); }}
            >
              <Phone className="h-3.5 w-3.5 mr-1 shrink-0" /> Yes
            </Button>
            <Button
              variant={phoneProvided === false ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => { setPhoneProvided(false); setPhoneNumber(''); setGaveMyNumber(null); }}
            >
              <X className="h-3.5 w-3.5 mr-1 shrink-0" /> No
            </Button>
          </div>
          {phoneProvided === true && (
            <Input
              type="tel"
              placeholder="Enter phone number..."
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="h-8 text-xs"
            />
          )}
          {phoneProvided === false && (
            <div className="space-y-1.5 mt-1.5 pl-2.5 border-l-2 border-primary/30">
              <Label className="text-[11px] font-medium text-muted-foreground">Gave them your number?</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  variant={gaveMyNumber === true ? 'default' : 'outline'}
                  className={cn('h-8 text-xs', gaveMyNumber === true && 'bg-green-600 hover:bg-green-700')}
                  onClick={() => setGaveMyNumber(true)}
                >
                  <Phone className="h-3.5 w-3.5 mr-1 shrink-0" /> Yes
                </Button>
                <Button
                  variant={gaveMyNumber === false ? 'default' : 'outline'}
                  className={cn('h-8 text-xs', gaveMyNumber === false && 'bg-red-600 hover:bg-red-700')}
                  onClick={() => setGaveMyNumber(false)}
                >
                  <X className="h-3.5 w-3.5 mr-1 shrink-0" /> No
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Q3: Did they solve foreclosure? */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">3. Did they solve the foreclosure?</Label>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant={solvedForeclosure === true ? 'default' : 'outline'}
            className={cn('h-8 text-xs', solvedForeclosure === true && 'bg-green-600 hover:bg-green-700')}
            onClick={() => setSolvedForeclosure(true)}
          >
            <CheckCircle className="h-3.5 w-3.5 mr-1 shrink-0" /> Yes
          </Button>
          <Button
            variant={solvedForeclosure === false ? 'default' : 'outline'}
            className={cn('h-8 text-xs', solvedForeclosure === false && 'bg-red-600 hover:bg-red-700')}
            onClick={() => setSolvedForeclosure(false)}
          >
            <X className="h-3.5 w-3.5 mr-1 shrink-0" /> No
          </Button>
        </div>
      </div>

      {/* Q4: Property type */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">4. What type of property?</Label>
        <div className="grid grid-cols-3 gap-1.5">
          <Button
            variant={propertyType === 'primary' ? 'default' : 'outline'}
            className="h-8 text-[11px]"
            onClick={() => setPropertyType('primary')}
          >
            <Home className="h-3.5 w-3.5 mr-0.5 shrink-0" /> Primary
          </Button>
          <Button
            variant={propertyType === 'rental' ? 'default' : 'outline'}
            className="h-8 text-[11px]"
            onClick={() => setPropertyType('rental')}
          >
            <Building className="h-3.5 w-3.5 mr-0.5 shrink-0" /> Rental
          </Button>
          <Button
            variant={propertyType === 'vacant' ? 'default' : 'outline'}
            className="h-8 text-[11px]"
            onClick={() => setPropertyType('vacant')}
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-0.5 shrink-0" /> Vacant
          </Button>
        </div>
      </div>

      {/* Q5: Condition */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">5. Condition of Home</Label>
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
