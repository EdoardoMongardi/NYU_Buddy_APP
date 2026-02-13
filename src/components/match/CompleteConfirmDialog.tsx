'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CompleteConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    isLoading: boolean;
}

/**
 * Confirmation dialog shown before marking a match as complete.
 * Prevents accidental completions — the action navigates the user away.
 */
export function CompleteConfirmDialog({
    open,
    onOpenChange,
    onConfirm,
    isLoading,
}: CompleteConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[320px] rounded-2xl p-6">
                <DialogHeader className="items-center text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                    </div>
                    <DialogTitle className="text-base">
                        Complete this match?
                    </DialogTitle>
                    <DialogDescription className="text-sm text-gray-500">
                        This will end the match and take you back to Home.
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter className="flex-col gap-2 sm:flex-col mt-2">
                    <Button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl h-10"
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        Complete
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isLoading}
                        className="w-full rounded-xl h-10"
                    >
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}