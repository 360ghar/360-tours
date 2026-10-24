/** Scenes in display order (by `order_index`), without mutating the input. */
export function sortScenes<T extends { order_index: number }>(scenes: readonly T[]): T[] {
  return [...scenes].sort((a, b) => a.order_index - b.order_index);
}
