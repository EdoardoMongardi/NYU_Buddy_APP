import React, { useEffect } from 'react';
import useGooglePlaces from 'react-google-autocomplete/lib/usePlacesAutocompleteService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { PlaceCandidate } from '@/lib/firebase/functions';

// Safety polyfill to prevent `react-google-autocomplete` from crashing
// with "ReferenceError: google is not defined" if the component mounts
// before the script finishes injecting into the window object.
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

// Haversine distance in meters
function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // Earth radius in meters
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
    const [predictions, setPredictions] = React.useState<google.maps.places.AutocompletePrediction[]>([]);
    const [isFetchingDetails, setIsFetchingDetails] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState('');

    const { placesService, placePredictions, getPlacePredictions } = useGooglePlaces({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        options: {
            types: ['establishment'],
            input: '',
            // Bias results to 5km around the midpoint
            // The typing defines `locationBias` but might be strictly typed or missing if using older lib versions. Let's omit locationBias from options, or pass it if it works.
            // Wait, the error said input is missing. `getPlacePredictions` expects a full opt.
        },
    });

    // Handle typing to get predictions
    useEffect(() => {
        if (query.length > 2) {
            getPlacePredictions({
                input: query,
                types: ['establishment'],
                locationBias: `circle:5000@${userMidpointLat},${userMidpointLng}`,
            });
        }
    }, [query, getPlacePredictions, userMidpointLat, userMidpointLng]);

    // Update local predictions state when placePredictions changes
    useEffect(() => {
        setPredictions(placePredictions || []);
    }, [placePredictions]);

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

            // Strict Distance Check (Warning if > 5km from midpoint)
            const distanceToMidpoint = getDistanceInMeters(userMidpointLat, userMidpointLng, lat, lng);
            if (distanceToMidpoint > 5000) {
                setErrorMsg("This location is too far (>5km) from you and your match to easily commute.");
                setIsFetchingDetails(false);
                return; // Block selection
            }

            // Format for our PlaceCandidate schema
            const customPlace: PlaceCandidate = {
                placeId: placeId,
                name: details.name || description.split(',')[0],
                address: details.formatted_address || description,
                lat: lat,
                lng: lng,
                distance: Math.round(distanceToMidpoint), // Distance from midpoint for now
                rank: -1, // Denotes custom choice
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
            <DialogContent className="sm:max-w-md w-[95vw] rounded-2xl p-0 overflow-hidden bg-white">
                <div className="p-4 border-b">
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
                            className="pl-10 h-12 rounded-xl border-gray-200 focus:border-violet-500 focus:ring-violet-500"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                            }}
                        />
                    </div>
                    {errorMsg && (
                        <p className="text-sm text-red-500 mt-2 bg-red-50 p-2 rounded-lg">{errorMsg}</p>
                    )}
                </div>

                <div className="max-h-[50vh] overflow-y-auto w-full p-2 bg-gray-50/50">
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
                                    className="w-full text-left p-3 rounded-xl hover:bg-violet-50 transition-colors flex items-start space-x-3 group"
                                    onClick={() => handleSelectPrediction(p.place_id, p.description)}
                                >
                                    <div className="bg-gray-100 p-2 rounded-full group-hover:bg-violet-100 transition-colors shrink-0 mt-0.5">
                                        <MapPin className="h-4 w-4 text-gray-500 group-hover:text-violet-600" />
                                    </div>
                                    <div className="flex-1 min-w-0 pr-2">
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

                    {!isFetchingDetails && query.length > 2 && predictions.length === 0 && (
                        <div className="p-8 text-center">
                            <p className="text-sm text-gray-500 font-medium tracking-tight">No places found.</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
