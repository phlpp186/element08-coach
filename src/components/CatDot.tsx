/** A small round colour swatch for an exercise category, shared across the
 *  Exercises tab and the plan-builder palette so categories read consistently. */
import { categoryColor } from '../lib/categoryColor';

export function CatDot({ name, size = 9 }: { name?: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: categoryColor(name) }}
    />
  );
}
