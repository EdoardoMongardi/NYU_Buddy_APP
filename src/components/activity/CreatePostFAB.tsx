'use client';

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

export default function CreatePostFAB() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push('/post/create')}
      className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-violet-600 hover:bg-violet-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 touch-scale"
      aria-label="Create Activity Post"
    >
      <Plus className="w-6 h-6" />
    </button>
  );
}
