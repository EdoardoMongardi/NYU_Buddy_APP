'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface CreatePostContextType {
  isCreateOpen: boolean;
  openCreate: () => void;
  closeCreate: () => void;
}

const CreatePostContext = createContext<CreatePostContextType | undefined>(undefined);

export function CreatePostProvider({ children }: { children: ReactNode }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  return (
    <CreatePostContext.Provider value={{
      isCreateOpen,
      openCreate: () => setIsCreateOpen(true),
      closeCreate: () => setIsCreateOpen(false),
    }}>
      {children}
    </CreatePostContext.Provider>
  );
}

export function useCreatePost() {
  const context = useContext(CreatePostContext);
  if (context === undefined) throw new Error('useCreatePost must be used within a CreatePostProvider');
  return context;
}
