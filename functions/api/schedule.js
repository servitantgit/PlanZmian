/* ================================================================
   PLAN ZMIAN — GET /api/schedule (public, read-only)

   Cloudflare Pages Function (ES module). Reads the factory schedule
   years from D1 and returns them for the public schedule app.

   SPEC: docs/ADMIN_BACKEND_SPEC.md 6.1

   Rules:
   - public, no auth;
   - `updatedBy` (admin e-mail) is NEVER included in the response;
   - `Cache-Control: no-cache` + ETag (max revision + year count),
     `If-None-Match` -> 304;
   - empty DB -> 200 with `{ years: {} }` (not an error);
   - missing `env.DB` binding or any DB failure -> 503 `{error:'unavailable'}`
     with no details leaked and nothing logged except a generic message.

   Phase 1 only: no PUT, no history, no rollback.
   ================================================================ */

const SCHEDULE_ID = 'gillette';
const CACHE_CONTROL = 'no-cache';

function jsonResponse(status, body, extraHeaders) {
  const headers = new Headers(Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extraHeaders || {}));
  return new Response(JSON.stringify(body), { status, headers });
}

function unavailable() {
  // Generic message only: no D1 error text, no query, no schedule data.
  console.warn('[api/schedule] data source unavailable');
  return jsonResponse(503, { error: 'unavailable' }, { 'Cache-Control': CACHE_CONTROL });
}

function buildEtag(years) {
  const list = Object.keys(years)
    .map((year) => year + ':' + Number(years[year].revision || 0))
    .sort();
  return '"' + list.length + '-' + list.join(',') + '"';
}

export async function onRequestGet(context) {
  const env = (context && context.env) || {};
  const request = context && context.request;

  if (!env.DB || typeof env.DB.prepare !== 'function') {
    return unavailable();
  }

  let rows;
  try {
    const statement = env.DB.prepare(
      'SELECT year, data_json, hours_json, revision, updated_at FROM schedule_years WHERE schedule_id = ? ORDER BY year ASC'
    );
    const result = await statement.bind(SCHEDULE_ID).all();
    rows = (result && result.results) || [];
  } catch (err) {
    return unavailable();
  }

  const years = {};
  for (const row of rows) {
    let data;
    let hours;
    try {
      data = JSON.parse(row.data_json);
      hours = JSON.parse(row.hours_json);
    } catch (err) {
      // A corrupt row must not break the whole public response.
      continue;
    }
    years[String(row.year)] = {
      revision: Number(row.revision) || 0,
      updatedAt: row.updated_at,
      data: data,
      hours: hours,
    };
  }

  const etag = buildEtag(years);
  const ifNoneMatch = request && request.headers ? request.headers.get('If-None-Match') : null;

  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': CACHE_CONTROL },
    });
  }

  return jsonResponse(
    200,
    {
      scheduleId: SCHEDULE_ID,
      generatedAt: new Date().toISOString(),
      years: years,
    },
    { ETag: etag, 'Cache-Control': CACHE_CONTROL }
  );
}
