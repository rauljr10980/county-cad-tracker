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
    <div className="space-y-4">
      {/* Q1: Did owner answer the door? */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">1. Did owner answer the door?</Label>
        <div className="flex gap-2">
          <Button
            variant={ownerAnswered === true ? 'default' : 'outline'}
            size="sm"
            className={cn('flex-1', ownerAnswered === true && 'bg-green-600 hover:bg-green-700')}
            onClick={() => { setOwnerAnswered(true); setDroppedFlyer(null); }}
          >
            <CheckCircle className="h-4 w-4 mr-1.5" /> Yes
          </Button>
          <Button
            variant={ownerAnswered === false ? 'default' : 'outline'}
            size="sm"
            className={cn('flex-1', ownerAnswered === false && 'bg-red-600 hover:bg-red-700')}
            onClick={() => { setOwnerAnswered(false); setDroppedFlyer(null); setPhoneProvided(null); setPhoneNumber(''); }}
          >
            <X className="h-4 w-4 mr-1.5" /> No
          </Button>
        </div>
      </div>

      {/* Q: Dropped flyer? (only if owner didn't answer) */}
      {ownerAnswered === false && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">2. Did you drop off a flyer?</Label>
          <div className="flex gap-2">
            <Button
              variant={droppedFlyer === true ? 'default' : 'outline'}
              size="sm"
              className={cn('flex-1', droppedFlyer === true && 'bg-green-600 hover:bg-green-700')}
              onClick={() => setDroppedFlyer(true)}
            >
              <FileText className="h-4 w-4 mr-1.5" /> Yes
            </Button>
            <Button
              variant={droppedFlyer === false ? 'default' : 'outline'}
              size="sm"
              className={cn('flex-1', droppedFlyer === false && 'bg-red-600 hover:bg-red-700')}
              onClick={() => setDroppedFlyer(false)}
            >
              <X className="h-4 w-4 mr-1.5" /> No
            </Button>
          </div>
        </div>
      )}

      {/* Q: Phone number (only if owner answered yes) */}
      {ownerAnswered === true && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">2. Did they provide a phone number?</Label>
          <div className="flex gap-2">
            <Button
              variant={phoneProvided === true ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => { setPhoneProvided(true); setGaveMyNumber(null); }}
            >
              <Phone className="h-4 w-4 mr-1.5" /> Yes
            </Button>
            <Button
              variant={phoneProvided === false ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => { setPhoneProvided(false); setPhoneNumber(''); setGaveMyNumber(null); }}
            >
              <X className="h-4 w-4 mr-1.5" /> No
            </Button>
          </div>
          {phoneProvided === true && (
            <Input
              type="tel"
              placeholder="Enter phone number..."
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          )}
          {phoneProvided === false && (
            <div className="space-y-2 mt-2 pl-4 border-l-2 border-primary/30">
              <Label className="text-xs font-medium text-muted-foreground">Did you give them your number?</Label>
              <div className="flex gap-2">
                <Button
                  variant={gaveMyNumber === true ? 'default' : 'outline'}
                  size="sm"
                  className={cn('flex-1', gaveMyNumber === true && 'bg-green-600 hover:bg-green-700')}
                  onClick={() => setGaveMyNumber(true)}
                >
                  <Phone className="h-4 w-4 mr-1.5" /> Yes - Waiting for call
                </Button>
                <Button
                  variant={gaveMyNumber === false ? 'default' : 'outline'}
                  size="sm"
                  className={cn('flex-1', gaveMyNumber === false && 'bg-red-600 hover:bg-red-700')}
                  onClick={() => setGaveMyNumber(false)}
                >
                  <X className="h-4 w-4 mr-1.5" /> No
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Q3: Did they solve foreclosure? */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          3. Did they solve the foreclosure?
        </Label>
        <div className="flex gap-2">
          <Button
            variant={solvedForeclosure === true ? 'default' : 'outline'}
            size="sm"
            className={cn('flex-1', solvedForeclosure === true && 'bg-green-600 hover:bg-green-700')}
            onClick={() => setSolvedForeclosure(true)}
          >
            <CheckCircle className="h-4 w-4 mr-1.5" /> Yes
          </Button>
          <Button
            variant={solvedForeclosure === false ? 'default' : 'outline'}
            size="sm"
            className={cn('flex-1', solvedForeclosure === false && 'bg-red-600 hover:bg-red-700')}
            onClick={() => setSolvedForeclosure(false)}
          >
            <X className="h-4 w-4 mr-1.5" /> No
          </Button>
        </div>
      </div>

      {/* Q4: Property type */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          4. What type of property?
        </Label>
        <div className="flex gap-2">
          <Button
            variant={propertyType === 'primary' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => setPropertyType('primary')}
          >
            <Home className="h-4 w-4 mr-1.5" /> Primary
          </Button>
          <Button
            variant={propertyType === 'rental' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => setPropertyType('rental')}
          >
            <Building className="h-4 w-4 mr-1.5" /> Rental
          </Button>
          <Button
            variant={propertyType === 'vacant' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => setPropertyType('vacant')}
          >
            <AlertTriangle className="h-4 w-4 mr-1.5" /> Vacant
          </Button>
        </div>
      </div>

      {/* Q5: Condition */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          5. Condition of Home
        </Label>
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
      </div>

      {/* Note */}
      <Input
        placeholder="Add a note (optional)..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="text-sm"
      />

      {/* Submit */}
      <div className="flex justify-between pt-2 border-t">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onSkip} disabled={isPending}>
          Just Mark Visited (Skip)
        </Button>
        <Button size="sm" disabled={!canSubmit || isPending} onClick={handleSubmit}>
          {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
          Complete Visit
        </Button>
      </div>
    </div>
  );
}
