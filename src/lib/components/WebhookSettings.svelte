<script>
  /**
   * Customer webhooks: list, add (pick events), send a test, rotate the secret,
   * remove, and recent deliveries. Talks to /api/v1/webhooks with the session
   * cookie. A signing secret is shown once, right after create or rotate.
   */
  import { onMount } from 'svelte';

  const API = '/api/v1/webhooks';

  let endpoints = [];
  let eventTypes = [];
  let deliveries = [];
  let loading = true;
  let busy = false;
  let error = null;
  let notice = null;
  let revealed = null; // { id, secret }

  let newUrl = '';
  let newDescription = '';
  let newEvents = [];

  async function call(path, init = {}) {
    const res = await fetch(API + path, {
      credentials: 'same-origin',
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  async function load() {
    error = null;
    try {
      const body = await call('');
      endpoints = body.endpoints || [];
      eventTypes = body.event_types || [];
      const d = await call('/deliveries?limit=20');
      deliveries = d.deliveries || [];
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function run(fn) {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    try {
      await fn();
    } catch (err) {
      error = err.message;
    } finally {
      busy = false;
    }
  }

  const add = () =>
    run(async () => {
      const body = await call('', {
        method: 'POST',
        body: JSON.stringify({
          url: newUrl.trim(),
          description: newDescription.trim(),
          events: newEvents.length ? newEvents : ['*']
        })
      });
      revealed = { id: body.endpoint.id, secret: body.secret };
      newUrl = '';
      newDescription = '';
      newEvents = [];
      await load();
    });

  const test = (id) =>
    run(async () => {
      const r = await call(`/${id}/test`, { method: 'POST' });
      notice = r.ok ? `Test delivered (HTTP ${r.status}).` : `Test failed: ${r.error || 'HTTP ' + r.status}`;
      await load();
    });

  const rotate = (id) =>
    run(async () => {
      if (!confirm('Rotate the signing secret? The old one stops working at once.')) return;
      const r = await call(`/${id}/rotate`, { method: 'POST' });
      revealed = { id, secret: r.secret };
    });

  const toggle = (ep) =>
    run(async () => {
      await call(`/${ep.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !ep.enabled }) });
      await load();
    });

  const remove = (id) =>
    run(async () => {
      if (!confirm('Remove this webhook endpoint?')) return;
      await call(`/${id}`, { method: 'DELETE' });
      if (revealed?.id === id) revealed = null;
      await load();
    });

  const retry = (id) =>
    run(async () => {
      await call(`/deliveries/${id}/retry`, { method: 'POST' });
      notice = 'Delivery queued again.';
      await load();
    });

  const when = (iso) => (iso ? new Date(iso).toLocaleString() : '');

  onMount(load);
</script>

<section class="settings-section" id="webhooks">
  <h2>Webhooks</h2>
  <p class="hint">
    We POST a signed <a href="https://cloudevents.io" rel="noopener">CloudEvent</a> to your URL when
    something happens to your launches. Verify the <code>webhook-signature</code> header
    (<a href="https://www.standardwebhooks.com" rel="noopener">Standard Webhooks</a>) with the endpoint's
    secret. Also available over the API at <code>/api/v1/webhooks</code>.
  </p>

  {#if error}<p class="msg err" role="alert">{error}</p>{/if}
  {#if notice}<p class="msg ok" role="status">{notice}</p>{/if}

  {#if revealed}
    <div class="secret" role="status">
      <strong>Signing secret</strong> (shown once, copy it now):
      <code>{revealed.secret}</code>
      <button type="button" class="link" on:click={() => (revealed = null)}>Done</button>
    </div>
  {/if}

  {#if loading}
    <p class="hint">Loading...</p>
  {:else}
    {#if endpoints.length === 0}
      <p class="hint">No endpoints yet.</p>
    {:else}
      <ul class="endpoints">
        {#each endpoints as ep (ep.id)}
          <li>
            <div class="ep-head">
              <code class="url">{ep.url}</code>
              <span class="badge" class:off={!ep.enabled}>{ep.enabled ? 'on' : 'off'}</span>
            </div>
            {#if ep.description}<div class="hint">{ep.description}</div>{/if}
            <div class="hint">Events: {ep.events.join(', ')}</div>
            {#if ep.disabled_reason}<div class="hint warn">{ep.disabled_reason}</div>{/if}
            <div class="actions">
              <button type="button" class="btn btn-outline" disabled={busy} on:click={() => test(ep.id)}>Send test</button>
              <button type="button" class="btn btn-outline" disabled={busy} on:click={() => toggle(ep)}>{ep.enabled ? 'Disable' : 'Enable'}</button>
              <button type="button" class="btn btn-outline" disabled={busy} on:click={() => rotate(ep.id)}>Rotate secret</button>
              <button type="button" class="btn btn-outline danger" disabled={busy} on:click={() => remove(ep.id)}>Remove</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    <form class="add" on:submit|preventDefault={add}>
      <h3>Add an endpoint</h3>
      <label>
        URL
        <input type="url" required placeholder="https://example.com/hooks/launchpadder" bind:value={newUrl} />
      </label>
      <label>
        Description (optional)
        <input type="text" maxlength="200" bind:value={newDescription} />
      </label>
      <fieldset>
        <legend>Events (none selected = all)</legend>
        {#each eventTypes as type}
          <label class="check">
            <input type="checkbox" value={type} bind:group={newEvents} />
            <code>{type}</code>
          </label>
        {/each}
      </fieldset>
      <button type="submit" class="btn btn-primary" disabled={busy || !newUrl}>Add endpoint</button>
    </form>

    {#if deliveries.length}
      <h3>Recent deliveries</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Event</th><th>Status</th><th>Tries</th><th>HTTP</th><th>When</th><th></th></tr></thead>
          <tbody>
            {#each deliveries as d (d.id)}
              <tr>
                <td><code>{d.event_type}</code></td>
                <td>{d.status}</td>
                <td>{d.attempts}</td>
                <td>{d.last_status ?? '-'}</td>
                <td>{when(d.updated_at)}</td>
                <td>
                  {#if d.status === 'failed'}
                    <button type="button" class="link" disabled={busy} on:click={() => retry(d.id)}>Retry</button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</section>

<style>
  .settings-section {
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    min-width: 0;
  }
  h2 { margin: 0 0 0.75rem; color: #1f2937; font-size: 1.25rem; font-weight: 600; }
  h3 { margin: 1.25rem 0 0.5rem; color: #1f2937; font-size: 1rem; font-weight: 600; }
  .hint { margin: 0.25rem 0; font-size: 0.875rem; color: #6b7280; overflow-wrap: anywhere; }
  .hint.warn { color: #b45309; }
  .msg { padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; }
  .msg.err { background: #fef2f2; color: #991b1b; }
  .msg.ok { background: #f0fdf4; color: #166534; }
  .secret { background: #fffbeb; border: 1px solid #fcd34d; padding: 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; margin: 0.5rem 0; }
  .secret code { display: block; margin: 0.5rem 0; word-break: break-all; user-select: all; }
  .endpoints { list-style: none; padding: 0; margin: 0.5rem 0; display: flex; flex-direction: column; gap: 0.75rem; }
  .endpoints li { border: 1px solid #e5e7eb; border-radius: 0.375rem; padding: 0.75rem; }
  .ep-head { display: flex; gap: 0.5rem; align-items: center; justify-content: space-between; }
  .url { overflow-wrap: anywhere; font-size: 0.875rem; }
  .badge { font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 999px; background: #dcfce7; color: #166534; }
  .badge.off { background: #f3f4f6; color: #6b7280; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
  .add { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }
  .add label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; color: #374151; font-weight: 500; }
  .add input[type='url'], .add input[type='text'] { padding: 0.6rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.875rem; }
  fieldset { border: 1px solid #e5e7eb; border-radius: 0.375rem; padding: 0.5rem 0.75rem; display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
  legend { font-size: 0.875rem; color: #374151; padding: 0 0.25rem; }
  .add label.check { flex-direction: row; align-items: center; font-weight: 400; }
  .btn { padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; border: none; cursor: pointer; font-size: 0.875rem; align-self: flex-start; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: #3b82f6; color: white; }
  .btn-primary:hover:not(:disabled) { background: #2563eb; }
  .btn-outline { background: transparent; color: #374151; border: 1px solid #d1d5db; }
  .btn-outline:hover:not(:disabled) { background: #f9fafb; }
  .btn-outline.danger { color: #b91c1c; border-color: #fca5a5; }
  .link { background: none; border: none; color: #2563eb; cursor: pointer; padding: 0; font-size: 0.875rem; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid #f3f4f6; white-space: nowrap; }
</style>
