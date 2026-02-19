'use client';

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

export default function CreatePostFAB() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push('/post/create')}
      className="fixed right-5 z-40 w-14 h-14 bg-violet-600 hover:bg-violet-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 touch-scale md:hidden"
      style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
      aria-label="Create Activity Post"
    >
      <Plus className="w-6 h-6" />
    </button>
  );
}
