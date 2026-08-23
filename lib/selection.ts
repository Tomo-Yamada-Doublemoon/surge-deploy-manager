export function updateSelection(
  prev: Set<string>,
  domains: Iterable<string>,
  checked: boolean
): Set<string> {
  const next = new Set(prev)
  for (const domain of domains) {
    if (checked) next.add(domain)
    else next.delete(domain)
  }
  return next
}
