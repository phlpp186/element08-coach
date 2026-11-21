/**
 * Drag and drop inside the plan calendar. Our own type, so a session dragged
 * over the session editor is not read as an exercise (that list takes plain
 * text drops from the exercise library). An exercise from the rail carries
 * both: plain text for the editor, our type for the calendar.
 */
import type { DragEvent } from 'react';

export const DND_TYPE = 'application/x-e08-plan';

export type DragItem =
  | { k: 'session'; id: string }
  | { k: 'template'; id: string }
  | { k: 'week'; id: string }
  | { k: 'exercise'; d: string };

// What is being dragged, for the drop hints: a dragover cannot read the data.
let current: DragItem | null = null;

export function startDrag(e: DragEvent, item: DragItem, text?: string): void {
  e.dataTransfer.setData(DND_TYPE, JSON.stringify(item));
  if (text) e.dataTransfer.setData('text/plain', text);
  e.dataTransfer.effectAllowed = 'copyMove';
  current = item;
}

export const dragging = (): DragItem | null => current;
export const endDrag = (): void => {
  current = null;
};

export const isOurs = (e: DragEvent): boolean => e.dataTransfer.types.includes(DND_TYPE);

export function readDrag(e: DragEvent): DragItem | null {
  try {
    const v = JSON.parse(e.dataTransfer.getData(DND_TYPE)) as DragItem;
    return v && typeof v === 'object' && 'k' in v ? v : null;
  } catch {
    return current;
  }
}
