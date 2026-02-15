'use client';

import { useState } from 'react';
import { Loader2, Flag, X } from 'lucide-react';
import { reportSubmit } from '@/lib/firebase/functions';
import { REPORT_TYPES, REPORT_CONTEXTS } from '@/lib/schemas/activity';
import { useToast } from '@/hooks/use-toast';

const REPORT_TYPE_LABELS: Record<string, string> = {
  harassment: 'Harassment',
  spam: 'Spam',
  inappropriate_content: 'Inappropriate Content',
  impersonation: 'Impersonation',
  no_show: 'No Show',
  other: 'Other',
};

interface ReportSheetProps {
  reportedUid: string;
  context: typeof REPORT_CONTEXTS[number];
  contextId: string;
  onClose: () => void;
}

export default function ReportSheet({
  reportedUid,
  context,
  contextId,
  onClose,
}: ReportSheetProps) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string>('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedType || submitting) return;
    setSubmitting(true);
    try {
      await reportSubmit({
        reportedUid,
        reportType: selectedType,
        context,
        contextId,
        description: description.trim() || null,
      });
      toast({
        title: 'Report submitted',
        description: 'We will review your report. Thank you for helping keep the community safe.',
      });
      onClose();
    } catch (err) {
      toast({
        title: 'Failed to submit report',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-8 animate-in slide-in-from-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900">Report</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Report type selection */}
        <div className="space-y-2 mb-4">
          <p className="text-sm text-gray-600 font-medium">What&apos;s the issue?</p>
          <div className="grid grid-cols-2 gap-2">
            {REPORT_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`py-2.5 px-3 rounded-xl text-[13px] font-medium transition-all text-left ${
                  selectedType === type
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {REPORT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="mb-5">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional details (optional, max 500 chars)..."
            rows={3}
            maxLength={500}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selectedType || submitting}
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
            selectedType && !submitting
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          ) : (
            'Submit Report'
          )}
        </button>
      </div>
    </div>
  );
}
