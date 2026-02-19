'use client';

import { ACTIVITY_CATEGORIES, CATEGORY_LABELS, ActivityCategory } from '@/lib/schemas/activity';
import { Coffee, BookOpen, UtensilsCrossed, Calendar, Compass, Dumbbell, MoreHorizontal } from 'lucide-react';

const CATEGORY_ICONS: Record<ActivityCategory, React.ReactNode> = {
  coffee: <Coffee className="w-3.5 h-3.5" />,
  study: <BookOpen className="w-3.5 h-3.5" />,
  food: <UtensilsCrossed className="w-3.5 h-3.5" />,
  event: <Calendar className="w-3.5 h-3.5" />,
  explore: <Compass className="w-3.5 h-3.5" />,
  sports: <Dumbbell className="w-3.5 h-3.5" />,
  other: <MoreHorizontal className="w-3.5 h-3.5" />,
};

interface CategoryFilterProps {
  selected: string | null;
  onSelect: (category: string | null) => void;
}

export default function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      <button
        onClick={() => onSelect(null)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${selected === null
          ? 'bg-violet-600 text-white'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
      >
        All
      </button>
      {ACTIVITY_CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(selected === cat ? null : cat)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${selected === cat
            ? 'bg-violet-600 text-white'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
        >
          {CATEGORY_ICONS[cat]}
          {CATEGORY_LABELS[cat]}
        </button>
      ))}
    </div>
  );
}
