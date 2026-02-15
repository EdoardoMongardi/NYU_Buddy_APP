import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import {
  REPORT_TYPE,
  REPORT_CONTEXT,
  REPORT_STATUS,
  ACTIVITY_LIMITS,
  ReportType,
  ReportContext,
} from '../constants/activityState';

interface SubmitReportData {
  reportedUid: string;
  reportType: string;
  context: string;
  contextId: string;
  description?: string | null;
}

const VALID_REPORT_TYPES = Object.values(REPORT_TYPE);
const VALID_REPORT_CONTEXTS = Object.values(REPORT_CONTEXT);

export async function reportSubmitHandler(
  request: CallableRequest<SubmitReportData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const data = request.data;
  const db = admin.firestore();

  // 1. Validation
  if (!data.reportedUid) {
    throw new HttpsError('invalid-argument', 'Reported user ID is required');
  }
  if (data.reportedUid === uid) {
    throw new HttpsError('invalid-argument', 'Cannot report yourself');
  }
  if (!data.reportType || !VALID_REPORT_TYPES.includes(data.reportType as ReportType)) {
    throw new HttpsError('invalid-argument', 'Invalid report type');
  }
  if (!data.context || !VALID_REPORT_CONTEXTS.includes(data.context as ReportContext)) {
    throw new HttpsError('invalid-argument', 'Invalid report context');
  }
  if (!data.contextId) {
    throw new HttpsError('invalid-argument', 'Context ID is required');
  }
  if (data.description && data.description.length > ACTIVITY_LIMITS.REPORT_DESCRIPTION_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Description must be at most ${ACTIVITY_LIMITS.REPORT_DESCRIPTION_MAX_LENGTH} characters`
    );
  }

  // 2. Rate limit: max 5 reports per day
  const oneDayAgo = admin.firestore.Timestamp.fromMillis(
    admin.firestore.Timestamp.now().toMillis() - 24 * 60 * 60 * 1000
  );

  const recentReports = await db
    .collection('activityReports')
    .where('reporterUid', '==', uid)
    .where('createdAt', '>', oneDayAgo)
    .get();

  if (recentReports.size >= ACTIVITY_LIMITS.MAX_REPORTS_PER_DAY) {
    throw new HttpsError(
      'resource-exhausted',
      `Maximum ${ACTIVITY_LIMITS.MAX_REPORTS_PER_DAY} reports per day`
    );
  }

  // 3. Create report (goes to admin queue for manual review)
  const reportRef = db.collection('activityReports').doc();

  await reportRef.set({
    reportId: reportRef.id,
    reporterUid: uid,
    reportedUid: data.reportedUid,
    reportType: data.reportType,
    context: data.context,
    contextId: data.contextId,
    description: data.description?.trim() || null,
    status: REPORT_STATUS.PENDING,
    reviewedBy: null,
    reviewedAt: null,
    actionTaken: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(
    `[Report] User ${uid} reported ${data.reportedUid} for ${data.reportType} ` +
    `in context ${data.context}/${data.contextId}`
  );

  return { reportId: reportRef.id };
}
