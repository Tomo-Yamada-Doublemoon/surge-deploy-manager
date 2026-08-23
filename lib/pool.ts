export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items.length) return []
  const results = new Array<R>(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index] as T, index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  )
  return results
}
