/* ================================================================
   PLAN ZMIAN — PUT /api/admin/schedule/:year

   Admin-only. Writes one factory year to D1.
   SPEC: docs/ADMIN_BACKEND_SPEC.md 6.2 / 6.3
   Phase 2: no history list / rollback endpoints yet (schema ready).
   ================================================================ */

import { requireAdmin, jsonError } from '../../../_lib/auth.js';
import { validateScheduleYear, normalizeYearPayload } from '../../../_lib/validate.mjs';

const SCHEDULE_ID = 'gillette';
const MAX_BODY_BYTES = 256 * 1024;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function unavailable() {
  console.warn('[api/admin/schedule] data source unavailable');
  return jsonResponse(503, { error: 'unavailable' });
}

/**
 * Cloudflare Pages Function — PUT only for Phase 2.
 * Dynamic route param: context.params.year
 */
export async function onRequestPut(context) {
  const { request, env, params } = context;

  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const adminEmail = admin.email;

  if (!env.DB || typeof env.DB.prepare !== 'function') {
    return unavailable();
  }

  const yearRaw = params && params.year;
  const year = Number(yearRaw);
  if (!Number.isInteger(year)) {
    return jsonResponse(400, { error: 'validation', details: ['year must be an integer'] });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'payload_too_large' });
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: 'payload_too_large' });
    }
    body = JSON.parse(text);
  } catch {
    return jsonResponse(400, { error: 'validation', details: ['invalid JSON body'] });
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse(400, { error: 'validation', details: ['body must be an object'] });
  }

  const { data, hours, expectedRevision } = body;
  if (expectedRevision === undefined || expectedRevision === null) {
    return jsonResponse(400, {
      error: 'validation',
      details: ['expectedRevision is required (use 0 for a new year)'],
    });
  }
  const expected = Number(expectedRevision);
  if (!Number.isInteger(expected) || expected < 0) {
    return jsonResponse(400, {
      error: 'validation',
      details: ['expectedRevision must be a non-negative integer'],
    });
  }

  const validation = validateScheduleYear(year, data, hours);
  if (!validation.ok) {
    return jsonResponse(400, { error: 'validation', details: validation.details });
  }

  const normalized = normalizeYearPayload(data, hours);
  const dataJson = JSON.stringify(normalized.data);
  const hoursJson = JSON.stringify(normalized.hours);
  const now = new Date().toISOString();

  try {
    const current = await env.DB.prepare(
      'SELECT revision FROM schedule_years WHERE schedule_id = ? AND year = ?'
    )
      .bind(SCHEDULE_ID, year)
      .first();

    const currentRevision = current ? Number(current.revision) || 0 : 0;
    if (currentRevision !== expected) {
      return jsonResponse(409, {
        error: 'revision_conflict',
        currentRevision,
      });
    }

    const newRevision = currentRevision + 1;

    // Upsert year
    await env.DB.prepare(
      `INSERT INTO schedule_years
         (schedule_id, year, data_json, hours_json, revision, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(schedule_id, year) DO UPDATE SET
         data_json = excluded.data_json,
         hours_json = excluded.hours_json,
         revision = excluded.revision,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`
    )
      .bind(SCHEDULE_ID, year, dataJson, hoursJson, newRevision, now, adminEmail)
      .run();

    // History row (Phase 3 UI later; schema already exists)
    await env.DB.prepare(
      `INSERT INTO schedule_history
         (schedule_id, year, revision, data_json, hours_json, saved_at, saved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(SCHEDULE_ID, year, newRevision, dataJson, hoursJson, now, adminEmail)
      .run();

    return jsonResponse(200, {
      year,
      revision: newRevision,
      updatedAt: now,
    });
  } catch (err) {
    console.warn('[api/admin/schedule] write failed');
    return unavailable();
  }
}

/** Reject other methods explicitly */
export async function onRequest(context) {
  if (context.request.method === 'PUT') {
    return onRequestPut(context);
  }
  return jsonError(405, 'method_not_allowed');
}
