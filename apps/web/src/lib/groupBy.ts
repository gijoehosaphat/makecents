export function groupBy<T, K extends keyof any>(items: T[], getGroup: (item: T) => K) {
  return items.reduce((previous, currentItem) => {
    const group = getGroup(currentItem)
    if (!previous[group]) {
      previous[group] = []
    }
    previous[group].push(currentItem)
    return previous
  }, {} as Record<K, T[]>)
}
