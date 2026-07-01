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

/** A row of dots, one per category (an exercise can carry up to 3). */
export function CatDots({ names, size = 8 }: { names?: string[]; size?: number }) {
  const list = names ?? [];
  if (list.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {list.map((n, i) => (
        <CatDot key={`${n}-${i}`} name={n} size={size} />
      ))}
    </span>
  );
}
