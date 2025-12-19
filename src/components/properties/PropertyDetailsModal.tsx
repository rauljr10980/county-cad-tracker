import { useState } from 'react';
import { X, ExternalLink, MapPin, DollarSign, Calendar, FileText, TrendingUp, StickyNote, Edit2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Property } from '@/types/property';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Textarea } from '@/components/ui/textarea';
import { updatePropertyNotes } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface PropertyDetailsModalProps {
  property: Property | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PropertyDetailsModal({ property, isOpen, onClose }: PropertyDetailsModalProps) {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  if (!property) return null;

  // Initialize notes from property when modal opens
  if (isOpen && notes === '' && property.notes !== notes) {
    setNotes(property.notes || '');
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await updatePropertyNotes(property.id, notes);
      toast({
        title: "Notes Saved",
        description: `Notes saved for ${property.accountNumber}`,
      });
      setIsEditingNotes(false);
      // Update property object directly (will be refreshed on next load)
      property.notes = notes;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save notes",
        variant: "destructive",
      });
    } finally {
      setSavingNotes(false);
    }
  };

  const paymentChartData = property.paymentHistory?.map(p => ({
    date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    amount: p.amount,
  })).reverse() || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold flex items-center gap-3">
                Property Details
                <StatusBadge status={property.status} />
                {property.previousStatus && (
                  <span className="text-sm font-normal text-muted-foreground">
                    (was {property.previousStatus})
                  </span>
                )}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1 font-mono">
                Account: {property.accountNumber}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Property Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-primary mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Property Address</p>
                  <p className="font-medium">{property.propertyAddress}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-primary mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Legal Description</p>
                  <p className="text-sm">{property.legalDescription || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-primary mt-1 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Owner</p>
                  <p className="font-medium">{property.ownerName}</p>
                  <p className="text-sm text-muted-foreground">{property.mailingAddress}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Financial Summary</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount Due</p>
                    <p className="text-lg font-semibold font-mono text-judgment">
                      {formatCurrency(property.totalAmountDue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Market Value</p>
                    <p className="text-lg font-semibold font-mono">
                      {property.marketValue ? formatCurrency(property.marketValue) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Land Value</p>
                    <p className="font-mono">
                      {property.landValue ? formatCurrency(property.landValue) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Improvement Value</p>
                    <p className="font-mono">
                      {property.improvementValue ? formatCurrency(property.improvementValue) : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Tax Percentage</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(property.totalPercentage, 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm">{property.totalPercentage}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment History Chart */}
          {paymentChartData.length > 0 && (
            <div className="bg-secondary/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Payment History</span>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={paymentChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [formatCurrency(value), 'Amount']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Payment History Table */}
          {property.paymentHistory && property.paymentHistory.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Payment Records</h3>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="text-right">Amount</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {property.paymentHistory.slice(0, 10).map((payment, index) => (
                      <tr key={index}>
                        <td className="font-mono text-sm">{payment.date}</td>
                        <td className="text-right font-mono">{formatCurrency(payment.amount)}</td>
                        <td className="text-muted-foreground">{payment.description || 'Tax Payment'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes Section */}
          <div className="bg-secondary/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Notes</span>
              </div>
              {!isEditingNotes && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingNotes(true)}
                  className="h-7"
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  {notes ? 'Edit' : 'Add Notes'}
                </Button>
              )}
            </div>
            {isEditingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add your notes here..."
                  className="min-h-[120px]"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditingNotes(false);
                      setNotes(property.notes || '');
                    }}
                    disabled={savingNotes}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                  >
                    {savingNotes ? 'Saving...' : 'Save Notes'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground min-h-[60px] whitespace-pre-wrap">
                {notes || 'No notes added yet. Click "Add Notes" to add notes for this property.'}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button asChild>
              <a 
                href="https://bexar.acttax.com/act_webdev/bexar/index.jsp"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View on Bexar County
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
