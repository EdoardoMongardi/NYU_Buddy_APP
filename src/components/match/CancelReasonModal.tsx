'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface CancelReasonModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirmCancel: (reason: string, details?: string) => void;
    isCancelling: boolean;
}

// PRD v2.4: User-facing cancellation reasons (excluding system reasons)
const CANCEL_REASONS = [
    { id: 'time_conflict', label: 'Time conflict / Something came up' },
    { id: 'not_responding', label: 'My buddy is not responding' },
    { id: 'changed_mind', label: 'Changed my mind' },
    { id: 'safety_concern', label: 'Safety concern' },
    { id: 'other', label: 'Other' },
];

export function CancelReasonModal({
    open,
    onOpenChange,
    onConfirmCancel,
    isCancelling,
}: CancelReasonModalProps) {
    const [selectedReason, setSelectedReason] = useState<string>('time_conflict');
    const [otherDetails, setOtherDetails] = useState('');

    const handleConfirm = () => {
        // Validation could go here
        onConfirmCancel(selectedReason, selectedReason === 'other' ? otherDetails : undefined);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="w-5 h-5" />
                        Cancel Match?
                    </DialogTitle>
                    <DialogDescription>
                        Please tell us why you need to cancel. Frequent cancellations may affect your reliability score.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <RadioGroup
                        value={selectedReason}
                        onValueChange={setSelectedReason}
                        className="space-y-2"
                    >
                        {CANCEL_REASONS.map((reason) => (
                            <div key={reason.id} className="flex items-center space-x-2">
                                <RadioGroupItem value={reason.id} id={reason.id} />
                                <Label htmlFor={reason.id} className="cursor-pointer font-normal">
                                    {reason.label}
                                </Label>
                            </div>
                        ))}
                    </RadioGroup>

                    {selectedReason === 'other' && (
                        <Textarea
                            placeholder="Please provide more details..."
                            value={otherDetails}
                            onChange={(e) => setOtherDetails(e.target.value)}
                            className="resize-none h-20"
                            maxLength={100}
                        />
                    )}
                </div>

                <DialogFooter className="sm:justify-between gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isCancelling}
                    >
                        Keep Match
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={isCancelling}
                    >
                        {isCancelling && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        Confirm Cancellation
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
