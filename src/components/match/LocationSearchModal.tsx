import React, { useEffect, useRef } from 'react';
import useGooglePlaces from 'react-google-autocomplete/lib/usePlacesAutocompleteService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MapPin, Search, Loader2, AlertTriangle } from 'lucide-react';
import { PlaceCandidate } from '@/lib/firebase/functions';

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

    const handleSelectPrediction = async (placeId: string, description: string) => {
        setIsFetchingDetails(true);
        setErrorMsg('');

        try {
            if (!placesService) throw new Error("Google Maps not ready");

            const details = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
                placesService.getDetails({
                    placeId: placeId,
                    fields: ['name', 'formatted_address', 'geometry', 'types', 'price_level', 'photos']
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
            if (distanceToMidpoint > 5000) {
                setErrorMsg("This location is too far (>5km) from you and your match to easily commute.");
                setIsFetchingDetails(false);
                return;
            }

            const customPlace: PlaceCandidate = {
                placeId: placeId,
                name: details.name || description.split(',')[0],
                address: details.formatted_address || description,
                lat: lat,
                lng: lng,
                distance: Math.round(distanceToMidpoint),
                rank: -1,
                tags: details.types ? details.types.filter((t: string) => !['establishment', 'point_of_interest'].includes(t)).slice(0, 3) : [],
                priceLevel: details.price_level,
                photoUrl: details.photos && details.photos.length > 0 ? details.photos[0].getUrl({ maxWidth: 400 }) : undefined,
            };

            onSelectPlace(customPlace);
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
            if (!open) { setQuery(''); setErrorMsg(''); onClose(); }
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

                        {!isFetchingDetails && predictions.length > 0 && (
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

                        {apiReady && !isFetchingDetails && query.length > 2 && predictions.length === 0 && (
                            <div className="p-8 text-center">
                                <p className="text-sm text-gray-500 font-medium tracking-tight">No places found.</p>
                            </div>
                        )}

                        {apiReady && !isFetchingDetails && query.length <= 2 && predictions.length === 0 && (
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
