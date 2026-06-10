export type StickyNoteColor = 'amber' | 'sky' | 'emerald' | 'rose' | 'violet';

export interface StickyNote {
  body: string;
  color: StickyNoteColor;
  createdAt: string;
  id: string;
  sortOrder: number;
  updatedAt: string;
  userId: string;
}

export interface StickyNoteCreateInput {
  body: string;
  color?: StickyNoteColor;
}

export interface StickyNoteUpdateInput {
  body?: string;
  color?: StickyNoteColor;
  id: string;
  sortOrder?: number;
}
