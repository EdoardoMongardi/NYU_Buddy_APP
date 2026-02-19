'use client';

import { useState, useRef, useEffect } from 'react';
import { ACTIVITY_CATEGORIES, CATEGORY_LABELS, ActivityCategory } from '@/lib/schemas/activity';
import {
  Coffee,
  BookOpen,
  UtensilsCrossed,
  Calendar,
  Compass,
  Dumbbell,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 10);
      // Use a small buffer (2px) to account for fractional rounding
      setShowRightArrow(scrollLeft < (scrollWidth - clientWidth - 10));
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      // Run once on mount
      checkScroll();
      // Also run when categories might change or layout shifts
      const timeoutId = setTimeout(checkScroll, 100);

      return () => {
        el.removeEventListener('scroll', checkScroll);
        clearTimeout(timeoutId);
      };
    }
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 240;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="relative flex items-center group w-full">
      {/* Gradient Fades & Arrows (Instagram-ish) */}

      {showLeftArrow && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-white via-white/80 to-transparent z-10 pointer-events-none" />
          <button
            onClick={() => scroll('left')}
            className="absolute left-2 z-20 p-1 rounded-full bg-white shadow-md border border-gray-100 text-gray-600 hover:bg-gray-50 transition-all scale-90 active:scale-75"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto py-1 no-scrollbar scroll-smooth w-full px-4"
        onScroll={checkScroll}
      >
        <button
          onClick={() => onSelect(null)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${selected === null
            ? 'bg-violet-600 text-white shadow-sm'
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
              ? 'bg-violet-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
          >
            {CATEGORY_ICONS[cat]}
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {showRightArrow && (
        <>
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white via-white/80 to-transparent z-10 pointer-events-none" />
          <button
            onClick={() => scroll('right')}
            className="absolute right-2 z-20 p-1 rounded-full bg-white shadow-md border border-gray-100 text-gray-600 hover:bg-gray-50 transition-all scale-90 active:scale-75"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
