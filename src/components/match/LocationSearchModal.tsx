import React, { useEffect, useRef } from 'react';
import useGooglePlaces from 'react-google-autocomplete/lib/usePlacesAutocompleteService';
import { doc, getDoc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Search, Loader2, AlertTriangle } from 'lucide-react';
import { PlaceCandidate } from '@/lib/firebase/functions';
import { getFirebaseDb } from '@/lib/firebase/client';

if (typeof window !== 'undefined' && typeof (window as unknown as Record<string, unknown>).google === 'undefined') {
    (window as unknown as Record<string, unknown>).google = undefined;
}

interface LocationSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectPlace: (place: PlaceCandidate) => void;
    userMidpointLat: number;
    userMidpointLng: number;
}

const PLACE_TYPE_LABELS: Record<string, string> = {
    cafe: 'Cafe',
    coffee_shop: 'Coffee',
    tea_house: 'Tea',
    bubble_tea_shop: 'Bubble Tea',
    juice_bar: 'Juice Bar',
    smoothie_shop: 'Smoothies',
    ice_cream_shop: 'Ice Cream',
    dessert_shop: 'Desserts',
    dessert_restaurant: 'Desserts',
    bakery: 'Bakery',
    bar: 'Bar',
    wine_bar: 'Wine Bar',
    cocktail_bar: 'Cocktail Bar',
    night_club: 'Night Club',
    restaurant: 'Restaurant',
    fast_food_restaurant: 'Fast Food',
    meal_takeaway: 'Takeaway',
    pizza_restaurant: 'Pizza',
    sushi_restaurant: 'Sushi',
    ramen_restaurant: 'Ramen',
    chinese_restaurant: 'Chinese',
    japanese_restaurant: 'Japanese',
    korean_restaurant: 'Korean',
    american_restaurant: 'American',
    italian_restaurant: 'Italian',
    mexican_restaurant: 'Mexican',
    library: 'Library',
    university: 'University',
    park: 'Park',
    gym: 'Gym',
    shopping_mall: 'Mall',
    supermarket: 'Supermarket',
    convenience_store: 'Convenience',
    book_store: 'Bookstore',
    movie_theater: 'Cinema',
    museum: 'Museum',
    art_gallery: 'Gallery',
};

const SKIP_TYPES = new Set([
    'establishment', 'point_of_interest', 'food', 'store', 'locality',
    'political', 'geocode', 'premise', 'subpremise',
]);

function deriveTagsFromTypes(types: string[]): string[] {
    const labels: string[] = [];
    for (const t of types) {
        if (SKIP_TYPES.has(t)) continue;
        const label = PLACE_TYPE_LABELS[t];
        if (label && !labels.includes(label)) labels.push(label);
        // Include raw type as a tag if no label mapping but still meaningful
        else if (!label && !SKIP_TYPES.has(t) && labels.length < 5) {
            const readable = t.replace(/_/g, ' ');
            if (!labels.includes(readable)) labels.push(readable);
        }
        if (labels.length >= 4) break;
    }
    return labels;
}

function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
        Math.cos(p1) * Math.cos(p2) *
        Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function isOpenNow(openingHours: PlaceCandidate['openingHours']): boolean {
    if (!openingHours || !openingHours.periods || openingHours.periods.length === 0) return true;

    const now = new Date();
    const dayStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
    const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
    });
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentDay = dayMap[dayStr] ?? 0;
    const [rawH, rawM] = timeStr.split(':').map(Number);
    const currentTime = (rawH >= 24 ? 0 : rawH) * 100 + rawM;

    for (const period of openingHours.periods) {
        const { open, close } = period;
        if (open && open.day === 0 && open.time === '0000' && !close) return true;
        if (!open || !close) continue;
        const openDay = open.day, closeDay = close.day;
        const openTime = parseInt(open.time, 10), closeTime = parseInt(close.time, 10);
        if (openDay === closeDay) {
            if (currentDay === openDay && currentTime >= openTime && currentTime < closeTime) return true;
        } else {
            if (currentDay === openDay  && currentTime >= openTime)  return true;
            if (currentDay === closeDay && currentTime <  closeTime) return true;
        }
    }
    return false;
}

export function LocationSearchModal({
    isOpen,
    onClose,
    onSelectPlace,
    userMidpointLat,
    userMidpointLng
}: LocationSearchModalProps) {
    const [query, setQuery] = React.useState('');
    const [isFetchingDetails, setIsFetchingDetails] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState('');
    const [apiReady, setApiReady] = React.useState(false);
    // Holds a place that has non-blocking warnings (too far / closed) pending user confirmation
    const [pendingPlace, setPendingPlace] = React.useState<PlaceCandidate | null>(null);
    const [warningMsgs, setWarningMsgs] = React.useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const { placesService, placePredictions, getPlacePredictions } = useGooglePlaces({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        options: {
            types: ['establishment'],
            input: '',
        },
    });

    const predictions = placePredictions || [];

    // Poll until the Google Maps Places library is loaded and ready
    useEffect(() => {
        const check = () => {
            try {
                if (typeof google !== 'undefined' && google.maps?.places) {
                    setApiReady(true);
                }
            } catch {
                // google not defined yet
            }
        };
        check();
        const timer = setInterval(check, 500);
        return () => clearInterval(timer);
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps -- getPlacePredictions is unstable (recreated every render by the hook)
    useEffect(() => {
        if (query.length > 2 && apiReady) {
            getPlacePredictions({
                input: query,
                types: ['establishment'],
            });
        }
    }, [query, apiReady, userMidpointLat, userMidpointLng]);

    const confirmPendingPlace = () => {
        if (!pendingPlace) return;
        onSelectPlace(pendingPlace);
        onClose();
        setQuery('');
        setPendingPlace(null);
        setWarningMsgs([]);
    };

    const cancelPendingPlace = () => {
        setPendingPlace(null);
        setWarningMsgs([]);
    };

    const handleSelectPrediction = async (placeId: string, description: string) => {
        setIsFetchingDetails(true);
        setErrorMsg('');
        setPendingPlace(null);
        setWarningMsgs([]);

        try {
            // 1. Check if this place is already stored in the global places collection.
            //    If so, use the stored (and potentially admin-curated) data directly —
            //    no extra Google Places API call, no duplicate DB entry.
            const storedSnap = await getDoc(doc(getFirebaseDb(), 'places', placeId));

            if (storedSnap.exists()) {
                const stored = storedSnap.data();
                const distanceToMidpoint = getDistanceInMeters(userMidpointLat, userMidpointLng, stored.lat, stored.lng);
                const place: PlaceCandidate = {
                    placeId,
                    name: stored.name,
                    address: stored.address,
                    lat: stored.lat,
                    lng: stored.lng,
                    distance: Math.round(distanceToMidpoint),
                    rank: -1,
                    tags: stored.tags || [],
                    priceLevel: stored.priceLevel ?? undefined,
                    priceRange: stored.priceRange || undefined,
                    photoUrl: stored.photoUrl || undefined,
                    openingHours: stored.openingHours || null,
                };
                const warnings: string[] = [];
                if (distanceToMidpoint > 5000) warnings.push("This place is more than 5km away — it may be a long commute for both of you.");
                if (!isOpenNow(place.openingHours)) warnings.push("This place appears to be closed right now.");
                if (warnings.length > 0) {
                    setPendingPlace(place);
                    setWarningMsgs(warnings);
                    return;
                }
                onSelectPlace(place);
                onClose();
                setQuery('');
                return;
            }

            // 2. Not in DB yet — fetch full details from Google Places API.
            if (!placesService) throw new Error("Google Maps not ready");

            const details = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
                placesService.getDetails({
                    placeId,
                    fields: ['name', 'formatted_address', 'geometry', 'types', 'price_level', 'photos', 'opening_hours']
                }, (res, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && res) resolve(res);
                    else reject(status);
                });
            });

            if (!details.geometry || !details.geometry.location) {
                throw new Error("No location data found for this place.");
            }

            const lat = details.geometry.location.lat();
            const lng = details.geometry.location.lng();
            const distanceToMidpoint = getDistanceInMeters(userMidpointLat, userMidpointLng, lat, lng);

            const openingHours = details.opening_hours ? {
                periods: (details.opening_hours.periods || []).map((p) => ({
                    open: p.open ? { day: p.open.day, time: p.open.time } : undefined,
                    close: p.close ? { day: p.close.day, time: p.close.time } : undefined,
                })),
                weekday_text: details.opening_hours.weekday_text || [],
            } : null;

            const place: PlaceCandidate = {
                placeId,
                name: details.name || description.split(',')[0],
                address: details.formatted_address || description,
                lat,
                lng,
                distance: Math.round(distanceToMidpoint),
                rank: -1,
                tags: details.types ? deriveTagsFromTypes(details.types) : [],
                priceLevel: details.price_level,
                photoUrl: details.photos && details.photos.length > 0
                    ? details.photos[0].getUrl({ maxWidth: 400 })
                    : undefined,
                openingHours,
            };

            const warnings: string[] = [];
            if (distanceToMidpoint > 5000) warnings.push("This place is more than 5km away — it may be a long commute for both of you.");
            if (!isOpenNow(openingHours)) warnings.push("This place appears to be closed right now.");

            if (warnings.length > 0) {
                setPendingPlace(place);
                setWarningMsgs(warnings);
                return;
            }

            onSelectPlace(place);
            onClose();
            setQuery('');
        } catch (err: unknown) {
            console.error("Failed to fetch custom place details:", err);
            setErrorMsg("Failed to load details for that location. Please try another.");
        } finally {
            setIsFetchingDetails(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) { setQuery(''); setErrorMsg(''); setPendingPlace(null); setWarningMsgs([]); onClose(); }
        }}>
            <DialogContent
                className="
                    w-full max-w-[100vw] rounded-none p-0 overflow-hidden bg-white
                    top-0 translate-y-0 h-[100dvh]
                    sm:max-w-md sm:w-[95vw] sm:rounded-2xl sm:top-[50%] sm:translate-y-[-50%] sm:h-auto sm:max-h-[85vh]
                "
            >
                <div className="flex flex-col h-full sm:h-auto sm:max-h-[85vh] min-w-0 overflow-hidden">
                    {/* Sticky header with search input */}
                    <div className="flex-shrink-0 p-4 pt-12 sm:pt-4 border-b min-w-0">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                                Search for a Place
                            </DialogTitle>
                            <DialogDescription className="text-sm text-gray-500">
                                Find a custom spot near you and your match.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="relative mt-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <Input
                                ref={inputRef}
                                className="pl-10 h-12 rounded-xl border-gray-200 focus:border-violet-500 focus:ring-violet-500"
                                placeholder="Coffee shop, restaurant..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                autoFocus
                            />
                        </div>
                        {errorMsg && (
                            <p className="text-sm text-red-500 mt-2 bg-red-50 p-2 rounded-lg">{errorMsg}</p>
                        )}
                    </div>

                    {/* Scrollable results area */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 w-full p-2 bg-gray-50/50">
                        {/* API not ready warning */}
                        {!apiReady && (
                            <div className="flex flex-col items-center justify-center p-8 space-y-3">
                                <AlertTriangle className="h-8 w-8 text-amber-500" />
                                <p className="text-sm text-amber-700 font-medium text-center">
                                    Google Maps is loading...
                                </p>
                                <p className="text-xs text-gray-500 text-center max-w-[280px]">
                                    If this persists, the Maps JavaScript API may not be enabled for this project.
                                </p>
                            </div>
                        )}

                        {isFetchingDetails && (
                            <div className="flex flex-col items-center justify-center p-8 space-y-4">
                                <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                                <p className="text-sm text-gray-500 font-medium tracking-tight">Verifying location...</p>
                            </div>
                        )}

                        {/* Warning confirmation step — place has warnings but user can still add it */}
                        {!isFetchingDetails && pendingPlace && warningMsgs.length > 0 && (
                            <div className="p-4 space-y-4">
                                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                                        <p className="text-sm font-semibold text-red-700">Heads up</p>
                                    </div>
                                    {warningMsgs.map((msg, i) => (
                                        <p key={i} className="text-sm text-red-600 pl-6">{msg}</p>
                                    ))}
                                </div>
                                <div className="bg-white border border-gray-100 rounded-xl p-3 flex items-start gap-3">
                                    <div className="bg-gray-100 p-2 rounded-full shrink-0 mt-0.5">
                                        <MapPin className="h-4 w-4 text-gray-500" />
                                    </div>
                                    <div className="min-w-0 overflow-hidden">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{pendingPlace.name}</p>
                                        <p className="text-xs text-gray-500 truncate">{pendingPlace.address}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        className="flex-1 rounded-xl border-gray-200 text-gray-600"
                                        onClick={cancelPendingPlace}
                                    >
                                        Choose another
                                    </Button>
                                    <Button
                                        className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
                                        onClick={confirmPendingPlace}
                                    >
                                        Add anyway
                                    </Button>
                                </div>
                            </div>
                        )}

                        {!isFetchingDetails && !pendingPlace && predictions.length > 0 && (
                            <div className="space-y-1">
                                {predictions.map((p) => (
                                    <button
                                        key={p.place_id}
                                        className="w-full text-left p-3 rounded-xl hover:bg-violet-50 active:bg-violet-100 transition-colors flex items-start gap-3 group overflow-hidden"
                                        onClick={() => handleSelectPrediction(p.place_id, p.description)}
                                    >
                                        <div className="bg-gray-100 p-2 rounded-full group-hover:bg-violet-100 transition-colors shrink-0 mt-0.5">
                                            <MapPin className="h-4 w-4 text-gray-500 group-hover:text-violet-600" />
                                        </div>
                                        <div className="flex-1 min-w-0 overflow-hidden">
                                            <p className="text-sm font-semibold text-gray-900 truncate">
                                                {p.structured_formatting?.main_text || p.description}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {p.structured_formatting?.secondary_text || ''}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {apiReady && !isFetchingDetails && !pendingPlace && query.length > 2 && predictions.length === 0 && (
                            <div className="p-8 text-center">
                                <p className="text-sm text-gray-500 font-medium tracking-tight">No places found.</p>
                            </div>
                        )}

                        {apiReady && !isFetchingDetails && !pendingPlace && query.length <= 2 && predictions.length === 0 && (
                            <div className="p-8 text-center">
                                <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                                <p className="text-sm text-gray-400 font-medium">Type at least 3 characters to search</p>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
