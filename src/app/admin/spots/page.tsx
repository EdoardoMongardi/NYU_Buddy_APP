'use client';

import { useState, useEffect } from 'react';

import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  MapPin,
  ToggleLeft,
  ToggleRight,
  Upload,
  X,
  Users,
} from 'lucide-react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';
import Image from 'next/image';
import * as geofire from 'geofire-common';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { getFirebaseDb, getFirebaseStorage } from '@/lib/firebase/client';

interface Place {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  geohash: string;
  tags: string[];
  allowedActivities: string[];
  active: boolean;
  priceRange?: string; // U11: e.g., "$20-$50"
  photoUrl?: string; // U11: Custom image URL for the place
  openingHours?: {
    periods: {
      open?: { day: number; time: string };
      close?: { day: number; time: string };
    }[];
    weekday_text: string[];
  } | null;
  source?: string; // 'user_custom' for user-submitted places
  timesSelected?: number; // How many times this place has been chosen by users
  submittedBy?: string; // UID of the user who first submitted this place
}

const CATEGORIES = [
  'Cafe',
  'Restaurant',
  'Library',
  'Park',
  'Study Space',
  'Other',
];

// Activities users can choose when setting availability
const ACTIVITIES = [
  'Coffee',
  'Lunch',
  'Dinner',
  'Study',
  'Walk',
];

// Default activity mapping based on category
const CATEGORY_DEFAULT_ACTIVITIES: Record<string, string[]> = {
  'Cafe': ['Coffee', 'Study', 'Lunch'],
  'Restaurant': ['Lunch', 'Dinner'],
  'Library': ['Study'],
  'Park': ['Walk'],
  'Study Space': ['Study'],
  'Other': [],
};

export default function AdminSpotsPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [tags, setTags] = useState('');
  const [allowedActivities, setAllowedActivities] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState(''); // U11: Price range input
  const [photoUrl, setPhotoUrl] = useState(''); // U11: Photo URL from upload or existing
  const [openingHoursJson, setOpeningHoursJson] = useState(''); // JSON representation

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Listen for places
  useEffect(() => {
    const q = query(collection(getFirebaseDb(), 'places'), orderBy('name'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const placesData: Place[] = [];
        snapshot.forEach((doc) => {
          placesData.push({ id: doc.id, ...doc.data() } as Place);
        });
        setPlaces(placesData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching places:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const resetForm = () => {
    setName('');
    setCategory('');
    setAddress('');
    setLat('');
    setLng('');
    setTags('');
    setAllowedActivities([]);
    setPriceRange(''); // U11
    setPhotoUrl(''); // U11
    setOpeningHoursJson('');
    setSelectedFile(null); // File upload
    setUploadProgress(0);
    setIsUploading(false);
    setEditingPlace(null);
  };

  // Handle file upload to Firebase Storage
  const handleFileUpload = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const storage = getFirebaseStorage();
        const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const storageRef = ref(storage, `place-images/${fileName}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        setIsUploading(true);

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(Math.round(progress));
          },
          (error) => {
            console.error('Upload error:', error);
            setIsUploading(false);
            reject(error);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              setIsUploading(false);
              setUploadProgress(100);
              resolve(downloadURL);
            } catch (error) {
              setIsUploading(false);
              reject(error);
            }
          }
        );
      } catch (error) {
        setIsUploading(false);
        reject(error);
      }
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (place: Place) => {
    setEditingPlace(place);
    setName(place.name);
    setCategory(place.category);
    setAddress(place.address);
    setLat(place.lat.toString());
    setLng(place.lng.toString());
    setTags(place.tags.join(', '));
    setAllowedActivities(place.allowedActivities || []);
    setPriceRange(place.priceRange || ''); // U11
    setPhotoUrl(place.photoUrl || ''); // U11
    setOpeningHoursJson(place.openingHours ? JSON.stringify(place.openingHours, null, 2) : '');
    setIsDialogOpen(true);
  };

  // Auto-set default activities when category changes (only for new places)
  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    if (!editingPlace) {
      setAllowedActivities(CATEGORY_DEFAULT_ACTIVITIES[newCategory] || []);
    }
  };

  const toggleActivity = (activity: string) => {
    setAllowedActivities((prev) =>
      prev.includes(activity)
        ? prev.filter((a) => a !== activity)
        : [...prev, activity]
    );
  };

  const handleSubmit = async () => {
    if (!name || !category || !address || !lat || !lng) {
      alert('Please fill in all required fields');
      return;
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      alert('Invalid coordinates');
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload file if selected
      let finalPhotoUrl = photoUrl.trim() || null;
      if (selectedFile) {
        try {
          finalPhotoUrl = await handleFileUpload(selectedFile);
        } catch (error) {
          console.error('Failed to upload image:', error);
          alert('Failed to upload image. Please try again.');
          setIsSubmitting(false);
          return;
        }
      }

      let parsedOpeningHours = null;
      if (openingHoursJson.trim()) {
        try {
          parsedOpeningHours = JSON.parse(openingHoursJson);
        } catch (err) {
          console.error(err);
          alert('Invalid JSON in Opening Hours field');
          setIsSubmitting(false);
          return;
        }
      }

      const geohash = geofire.geohashForLocation([latNum, lngNum]);
      const tagsArray = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t);

      const placeData = {
        name,
        category,
        address,
        lat: latNum,
        lng: lngNum,
        geohash,
        tags: tagsArray,
        allowedActivities,
        active: editingPlace?.active ?? true,
        priceRange: priceRange.trim() || null, // U11: Save price range (null if empty)
        photoUrl: finalPhotoUrl, // U11: Save uploaded photo URL or existing URL
        openingHours: parsedOpeningHours,
        updatedAt: serverTimestamp(),
      };

      if (editingPlace) {
        // Update existing
        await updateDoc(doc(getFirebaseDb(), 'places', editingPlace.id), placeData);
      } else {
        // Create new
        const newRef = doc(collection(getFirebaseDb(), 'places'));
        await setDoc(newRef, {
          ...placeData,
          createdAt: serverTimestamp(),
        });
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving place:', error);
      alert('Failed to save place');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (place: Place) => {
    try {
      await updateDoc(doc(getFirebaseDb(), 'places', place.id), {
        active: !place.active,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error toggling place:', error);
      alert('Failed to update place');
    }
  };

  const handleDelete = async (place: Place) => {
    if (!confirm(`Are you sure you want to delete "${place.name}"?`)) {
      return;
    }

    try {
      await deleteDoc(doc(getFirebaseDb(), 'places', place.id));
    } catch (error) {
      console.error('Error deleting place:', error);
      alert('Failed to delete place');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Manage Spots</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Spot
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingPlace ? 'Edit Spot' : 'Add New Spot'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Joe's Coffee"
                />
              </div>

              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={category} onValueChange={handleCategoryChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Allowed Activities</Label>
                <p className="text-xs text-gray-500">What activities can users do here?</p>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITIES.map((activity) => (
                    <Badge
                      key={activity}
                      variant={allowedActivities.includes(activity) ? 'default' : 'outline'}
                      className={`cursor-pointer transition-colors ${allowedActivities.includes(activity)
                        ? 'bg-violet-600 hover:bg-violet-700'
                        : 'hover:bg-gray-100'
                        }`}
                      onClick={() => toggleActivity(activity)}
                    >
                      {activity}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Address *</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Washington Square"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Latitude *</Label>
                  <Input
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="40.7295"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Longitude *</Label>
                  <Input
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="-73.9965"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="wifi, quiet, outdoor"
                />
              </div>

              {/* U11: Price Range Field */}
              <div className="space-y-2">
                <Label>Price Range</Label>
                <Input
                  value={priceRange}
                  onChange={(e) => setPriceRange(e.target.value)}
                  placeholder="e.g., $20-$50"
                />
                <p className="text-xs text-gray-500">
                  Displayed on place cards to help users budget
                </p>
              </div>

              {/* U11: Photo Upload Field */}
              <div className="space-y-2">
                <Label>Place Photo</Label>

                {/* Show existing photo if editing and no new file selected */}
                {photoUrl && !selectedFile && (
                  <div className="relative w-full h-32">
                    <Image
                      src={photoUrl}
                      alt="Current place photo"
                      fill
                      className="object-cover rounded-md"
                      sizes="(max-width: 768px) 100vw, 300px"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => setPhotoUrl('')}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* Show preview of selected file */}
                {selectedFile && (
                  <div className="relative w-full h-32">
                    <Image
                      src={URL.createObjectURL(selectedFile)}
                      alt="Preview"
                      fill
                      className="object-cover rounded-md"
                      sizes="(max-width: 768px) 100vw, 300px"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        setSelectedFile(null);
                        setUploadProgress(0);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* Upload progress bar */}
                {isUploading && (
                  <div className="space-y-1">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-violet-600 h-2 rounded-full transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 text-center">
                      Uploading... {uploadProgress}%
                    </p>
                  </div>
                )}

                {/* File input button */}
                {!selectedFile && !photoUrl && (
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-gray-500" />
                        <p className="mb-2 text-sm text-gray-500">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">PNG, JPG or WEBP (MAX. 5MB)</p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              alert('File size must be less than 5MB');
                              return;
                            }
                            setSelectedFile(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                )}

                {/* Change photo button when photo exists */}
                {(selectedFile || photoUrl) && !isUploading && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          if (file.size > 5 * 1024 * 1024) {
                            alert('File size must be less than 5MB');
                            return;
                          }
                          setSelectedFile(file);
                          setPhotoUrl(''); // Clear existing URL when selecting new file
                        }
                      };
                      input.click();
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Change Photo
                  </Button>
                )}

                <p className="text-xs text-gray-500">
                  Upload a photo for this place (uses default if not provided)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Opening Hours (JSON) *Optional*</Label>
                <textarea
                  value={openingHoursJson}
                  onChange={(e) => setOpeningHoursJson(e.target.value)}
                  placeholder={'{\n  "weekday_text": [\n    "Monday: 8:00 AM – 8:00 PM"\n  ]\n}'}
                  className="w-full h-32 p-2 border rounded-md text-sm font-mono text-gray-700 focus:ring-2 focus:ring-violet-600 focus:outline-none"
                />
                <p className="text-xs text-gray-500">
                  Paste the Google Places API opening_hours object here (valid JSON required).
                </p>
              </div>

              <div className="flex space-x-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : editingPlace ? (
                    'Update'
                  ) : (
                    'Create'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {places.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No spots yet. Add your first one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {places.map((place) => (
            <div
              key={place.id}
            >
              <Card
                className={`transition-opacity ${!place.active ? 'opacity-60' : ''
                  }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center flex-wrap gap-1.5">
                        <span>{place.name}</span>
                        {!place.active && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                        {place.source === 'user_custom' && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            User Submitted
                          </Badge>
                        )}
                        {place.openingHours && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Hours</Badge>
                        )}
                        {(place.timesSelected ?? 0) > 0 && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            {place.timesSelected}× chosen
                          </Badge>
                        )}
                      </CardTitle>
                      <p className="text-sm text-gray-500">{place.address}</p>
                    </div>
                    <Badge variant="outline">{place.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Allowed Activities */}
                    <div className="flex flex-wrap gap-1">
                      {(place.allowedActivities || []).map((activity) => (
                        <Badge key={activity} className="text-xs bg-violet-100 text-violet-700">
                          {activity}
                        </Badge>
                      ))}
                      {(!place.allowedActivities || place.allowedActivities.length === 0) && (
                        <span className="text-xs text-gray-400">No activities set</span>
                      )}
                    </div>

                    {/* Tags */}
                    {place.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {place.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end mt-3">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(place)}
                      >
                        {place.active ? (
                          <ToggleRight className="h-5 w-5 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-gray-400" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(place)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(place)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}