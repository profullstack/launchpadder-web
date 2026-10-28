/**
 * A tiny in-memory stand-in for the supabase-js query builder: just the calls
 * the webhooks supabaseStore makes (select/insert/update/delete, eq/neq/lt,
 * order, limit, maybeSingle) plus the claim RPC. Enough to run the real hub
 * end to end. Ported from ugig.net.
 */
export function fakeSupabase() {
  const tables = new Map();
  const rows = (t) => {
    if (!tables.has(t)) tables.set(t, []);
    return tables.get(t);
  };

  function from(table) {
    let op = 'select';
    let payload = null;
    const filters = [];
    let orderBy = null;
    let lim = null;
    let single = false;

    const run = () => {
      const all = rows(table);
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload];
        for (const r of list) {
          if (all.some((x) => x.id === r.id)) return { data: null, error: { message: 'duplicate key' } };
        }
        all.push(...list.map((r) => ({ ...r })));
        return { data: null, error: null };
      }
      const hit = all.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') {
        for (const r of hit) Object.assign(r, payload);
        return { data: null, error: null };
      }
      if (op === 'delete') {
        tables.set(table, all.filter((r) => !hit.includes(r)));
        return { data: null, error: null };
      }
      let out = hit.map((r) => ({ ...r }));
      if (orderBy) {
        const { col, asc } = orderBy;
        out.sort((a, b) => (Number(a[col]) - Number(b[col])) * (asc ? 1 : -1));
      }
      if (lim !== null) out = out.slice(0, lim);
      if (single) return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    };

    const q = {
      select: () => q,
      insert: (p) => ((op = 'insert'), (payload = p), q),
      update: (p) => ((op = 'update'), (payload = p), q),
      delete: () => ((op = 'delete'), q),
      eq: (c, v) => (filters.push((r) => r[c] === v), q),
      neq: (c, v) => (filters.push((r) => r[c] !== v), q),
      lt: (c, v) => (filters.push((r) => Number(r[c]) < v), q),
      order: (col, o = {}) => ((orderBy = { col, asc: o.ascending !== false }), q),
      limit: (n) => ((lim = n), q),
      maybeSingle: () => ((single = true), q),
      then: (res, rej) => Promise.resolve(run()).then(res, rej)
    };
    return q;
  }

  async function rpc(fn, args) {
    if (fn !== 'claim_hub_webhook_deliveries') return { data: null, error: { message: `no rpc ${fn}` } };
    const { p_now, p_limit, p_lease_until } = args;
    const due = rows('hub_webhook_deliveries')
      .filter((r) => r.status === 'pending' && Number(r.next_at) <= p_now)
      .sort((a, b) => Number(a.next_at) - Number(b.next_at))
      .slice(0, p_limit);
    for (const r of due) r.next_at = p_lease_until;
    return { data: due.map((r) => ({ ...r })), error: null };
  }

  return { from, rpc, tables, rows };
}
