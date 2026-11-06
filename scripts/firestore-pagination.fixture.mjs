export function paginationDb(rows, reads = []) {
  const records = rows.map((row, index) => ({ orden: index + 1, ...row }));
  function query(filters = [], after, limit, orders = []) {
    return {
      where: (key, op, value) => query([...filters, [key, op, value]], after, limit, orders),
      select: () => query(filters, after, limit, orders),
      orderBy: (key, direction) => query(filters, after, limit, [...orders, [key, direction]]),
      startAfter: (...values) => query(filters, values, limit, orders),
      limit: size => query(filters, after, size, orders),
      doc: () => ({ get: async () => ({ exists: false }) }),
      get: async () => {
        if (!limit) throw new Error('Unbounded Firestore read');
        let found = records.filter(row => filters.every(([key, op, value]) => op === 'in' ? value.includes(row[key]) : row[key] === value));
        found.sort((a, b) => b.orden - a.orden || b.id.localeCompare(a.id));
        if (after) found = found.filter(row => row.orden < after[0] || row.orden === after[0] && row.id < after[1]);
        found = found.slice(0, limit);
        reads.push({ filters, orders, limit, count: found.length });
        return { empty: !found.length, docs: found.map(row => ({ id: row.id, data: () => row })) };
      },
    };
  }
  return { collection: () => query() };
}
