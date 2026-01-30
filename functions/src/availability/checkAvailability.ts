/**
 * checkAvailabilityForUser - Pre-match availability check
 * PRD: Check place availability before allowing user to search/create offers
 * Returns available=false with NO_PLACES_AVAILABLE if 0 candidates
 */

import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
    getPlaceCandidates,
    getUserLocation,
    SEARCH_RADII_KM,
} from '../utils/places';

interface CheckAvailabilityData {
    activityType?: string;
}

interface CheckAvailabilityResponse {
    ok: boolean;
    available: boolean;
    candidateCount: number;
    code?: 'OK' | 'NO_PLACES_AVAILABLE' | 'LOCATION_STALE' | 'LOCATION_MISSING';
    message?: string;
    details?: {
        activityType: string | null;
        radiusTriedKm: number[];
        suggestedActions: string[];
    };
}

export async function checkAvailabilityForUserHandler(
    request: CallableRequest<CheckAvailabilityData>
): Promise<CheckAvailabilityResponse> {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const uid = request.auth.uid;
    const { activityType } = request.data || {};

    // Get user's location from presence
    const location = await getUserLocation(uid);

    if (!location) {
        return {
            ok: false,
            available: false,
            candidateCount: 0,
            code: 'LOCATION_MISSING',
            message: 'Unable to determine your location. Please enable location services.',
            details: {
                activityType: activityType || null,
                radiusTriedKm: [],
                suggestedActions: ['enable_location'],
            },
        };
    }

    if (location.isStale) {
        return {
            ok: false,
            available: false,
            candidateCount: 0,
            code: 'LOCATION_STALE',
            message: 'Your location is outdated. Please refresh the app.',
            details: {
                activityType: activityType || null,
                radiusTriedKm: [],
                suggestedActions: ['refresh_location'],
            },
        };
    }

    // Get place candidates
    const candidates = await getPlaceCandidates({
        center: [location.lat, location.lng],
        activityType: activityType || null,
    });

    if (candidates.length === 0) {
        return {
            ok: false,
            available: false,
            candidateCount: 0,
            code: 'NO_PLACES_AVAILABLE',
            message: `No meetup spots found nearby for ${activityType || 'any activity'} (within 5km).`,
            details: {
                activityType: activityType || null,
                radiusTriedKm: SEARCH_RADII_KM,
                suggestedActions: ['switch_activity', 'expand_radius'],
            },
        };
    }

    return {
        ok: true,
        available: true,
        candidateCount: candidates.length,
        code: 'OK',
    };
}
