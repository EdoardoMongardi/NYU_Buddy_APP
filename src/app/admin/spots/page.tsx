'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  MapPin,
  ToggleLeft,
  ToggleRight,
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

import { getFirebaseDb } from '@/lib/firebase/client';

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
    setEditingPlace(null);
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
                      className={`cursor-pointer transition-colors ${
                        allowedActivities.includes(activity)
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
            <motion.div
              key={place.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card
                className={`transition-opacity ${
                  !place.active ? 'opacity-60' : ''
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <span>{place.name}</span>
                        {!place.active && (
                          <Badge variant="secondary">Inactive</Badge>
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
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}