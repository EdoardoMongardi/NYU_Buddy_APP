'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc, where } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { Loader2, Check, X, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Report {
  reportId: string;
  reporterUid: string;
  reportedUid: string;
  reportType: string;
  context: string;
  contextId: string;
  description: string | null;
  status: string;
  createdAt: Date | null;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  harassment: 'Harassment',
  spam: 'Spam',
  inappropriate_content: 'Inappropriate',
  impersonation: 'Impersonation',
  no_show: 'No Show',
  other: 'Other',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-blue-100 text-blue-700',
  action_taken: 'bg-green-100 text-green-700',
  dismissed: 'bg-gray-100 text-gray-600',
};

export default function AdminReportsPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const firestore = getFirebaseDb();
      let q;
      if (filter === 'all') {
        q = query(
          collection(firestore, 'activityReports'),
          orderBy('createdAt', 'desc')
        );
      } else {
        q = query(
          collection(firestore, 'activityReports'),
          where('status', '==', filter),
          orderBy('createdAt', 'desc')
        );
      }
      
      const snapshot = await getDocs(q);
      const reportsData: Report[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          reportId: d.id,
          reporterUid: data.reporterUid,
          reportedUid: data.reportedUid,
          reportType: data.reportType,
          context: data.context,
          contextId: data.contextId,
          description: data.description,
          status: data.status,
          createdAt: data.createdAt?.toDate() || null,
        };
      });
      setReports(reportsData);
    } catch (err) {
      console.error('[AdminReports] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleUpdateStatus = async (reportId: string, newStatus: string) => {
    setUpdating(reportId);
    try {
      await updateDoc(doc(getFirebaseDb(), 'activityReports', reportId), {
        status: newStatus,
        reviewedAt: new Date(),
      });
      await fetchReports();
    } catch (err) {
      console.error('[AdminReports] Update error:', err);
    } finally {
      setUpdating(null);
    }
  };

  // Simple admin check
  const isAdmin = userProfile?.email && ['edoardo.mongardi18@gmail.com', '468327494@qq.com'].includes(userProfile.email);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <p className="text-gray-500">Access denied. Admin only.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8">
      <div className="flex items-center gap-3 py-4">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Activity Reports</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {['pending', 'reviewed', 'action_taken', 'dismissed', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap ${
              filter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : reports.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No reports found</p>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report.reportId} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[report.status] || 'bg-gray-100 text-gray-600'}`}>
                    {report.status.replace('_', ' ')}
                  </span>
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-600">
                    {REPORT_TYPE_LABELS[report.reportType] || report.reportType}
                  </span>
                </div>
                <span className="text-[11px] text-gray-400">
                  {report.createdAt?.toLocaleDateString()}
                </span>
              </div>

              <div className="text-[13px] text-gray-600 space-y-1 mb-3">
                <p><span className="font-medium">Reporter:</span> {report.reporterUid.substring(0, 12)}...</p>
                <p><span className="font-medium">Reported:</span> {report.reportedUid.substring(0, 12)}...</p>
                <p><span className="font-medium">Context:</span> {report.context} / {report.contextId.substring(0, 12)}...</p>
                {report.description && (
                  <p className="mt-1 text-gray-700">&ldquo;{report.description}&rdquo;</p>
                )}
              </div>

              {report.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateStatus(report.reportId, 'reviewed')}
                    disabled={updating === report.reportId}
                    className="flex-1 py-2 rounded-lg text-[13px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center justify-center gap-1"
                  >
                    {updating === report.reportId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Mark Reviewed
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(report.reportId, 'dismissed')}
                    disabled={updating === report.reportId}
                    className="flex-1 py-2 rounded-lg text-[13px] font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 flex items-center justify-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
