/* CALA AI knowledge API client
 * Docs: https://docs.cala.ai
 * Auth: X-API-KEY header
 * Used to enrich person records when adding family members.
 */

// In dev, Vite proxies /cala-api → https://api.cala.ai to bypass CORS.
// In production (static hosting), these calls go directly to api.cala.ai —
// for that to work the host must allow the origin, or requests must be
// proxied through the Cloudflare Worker backend.
const BASE = import.meta.env.DEV ? '/cala-api' : 'https://api.cala.ai';

function key() {
  return import.meta.env.VITE_CALA_API_KEY;
}

function headers() {
  return { 'X-API-KEY': key(), 'Content-Type': 'application/json' };
}

/** Search entities by name, filtered to Person type. Returns array of { id, name, entity_type, description }. */
export async function searchPersons(name, limit = 5) {
  if (!key()) return [];
  try {
    const res = await fetch(
      `${BASE}/v1/entities?name=${encodeURIComponent(name)}&entity_types=Person&limit=${limit}`,
      { headers: headers() }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.entities ?? [];
  } catch {
    return [];
  }
}

/** Fetch full entity profile. Returns raw CALA entity object or null. */
export async function getEntityDetails(entityId) {
  if (!key() || !entityId) return null;
  try {
    const res = await fetch(`${BASE}/v1/entities/${entityId}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Natural-language knowledge search. Returns markdown answer + entities. */
async function knowledgeSearch(query) {
  if (!key()) return null;
  try {
    const res = await fetch(`${BASE}/v1/knowledge/search`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ input: query, explainability: false, return_entities: true }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Field extraction helpers ──────────────────────────────────────────────────

function firstProp(props, keys) {
  for (const k of keys) {
    const v = props?.[k];
    if (v && typeof v === 'string') return v.trim();
  }
  return '';
}

/** Parse any YYYY, YYYY-MM, or YYYY-MM-DD string from entity properties. */
function extractBirth(entity) {
  const props = entity?.properties ?? {};
  const raw = firstProp(props, [
    'birth_date', 'birthdate', 'date_of_birth', 'born', 'birthday', 'birth_year',
  ]);
  if (raw) return raw;
  // Scan all string values for a plausible year
  for (const v of Object.values(props)) {
    if (typeof v === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(v)) return v;
  }
  return '';
}

function extractCity(entity) {
  const props = entity?.properties ?? {};
  return firstProp(props, ['city', 'hometown', 'birth_city', 'birthplace', 'place_of_birth', 'location']);
}

function extractEmail(entity) {
  const props = entity?.properties ?? {};
  return firstProp(props, ['email', 'email_address', 'contact_email']);
}

// ── Parse biographical snippet from knowledge/search markdown ────────────────

function parseBirthFromMarkdown(md) {
  // Matches: "born on 12 March 1980", "born: 1980-03-12", "(born 1980)", etc.
  const m = md?.match(/born[^a-z]*(\d{4}[-/]\d{2}[-/]\d{2}|\d{4}[-/]\d{2}|\d{4})/i);
  if (!m) return '';
  return m[1].replace(/\//g, '-');
}

function parseCityFromMarkdown(md) {
  // Matches: "born in Amsterdam", "from Cairo"
  const m = md?.match(/born in ([A-Z][a-zA-Zé\-\s]+?)[\.,;]/i)
    ?? md?.match(/from ([A-Z][a-zA-Zé\-\s]+?)[\.,;]/i);
  return m?.[1]?.trim() ?? '';
}

// ── Public enrichment API ─────────────────────────────────────────────────────

/**
 * Lookup a person by first + last name in CALA AI.
 *
 * Returns an enrichment object:
 *   { calaId, name, description, birth, city, birthCity, email, confidence }
 * or null if nothing found.
 *
 * confidence: 'high' (entity match) | 'low' (knowledge search only)
 */
export async function enrichPerson(firstName, lastName) {
  const fullName = `${firstName} ${lastName}`.trim();
  if (!fullName || !key()) return null;

  // 1. Entity search
  const matches = await searchPersons(fullName);
  if (matches.length > 0) {
    const best = matches[0];
    const details = await getEntityDetails(best.id);

    const birth   = extractBirth(details);
    const city    = extractCity(details);
    const email   = extractEmail(details);

    // If entity details are sparse, supplement with knowledge search
    let knBirth = '', knCity = '';
    if (!birth || !city) {
      const kn = await knowledgeSearch(`When and where was ${fullName} born? What city did they live in?`);
      knBirth = kn ? parseBirthFromMarkdown(kn.content) : '';
      knCity  = kn ? parseCityFromMarkdown(kn.content) : '';
    }

    return {
      calaId:      best.id,
      name:        best.name,
      description: best.description ?? '',
      birth:       birth  || knBirth,
      city:        city   || knCity,
      birthCity:   '',
      email:       email,
      confidence:  'high',
    };
  }

  // 2. Fallback: knowledge/search only (no entity match)
  const kn = await knowledgeSearch(`Tell me about ${fullName}: birth date, birth city, nationality.`);
  if (!kn?.content) return null;

  const birth = parseBirthFromMarkdown(kn.content);
  const city  = parseCityFromMarkdown(kn.content);
  if (!birth && !city) return null;   // Nothing useful found

  return {
    calaId:      null,
    name:        fullName,
    description: kn.content.slice(0, 160).replace(/\n/g, ' '),
    birth,
    city,
    birthCity:   '',
    email:       '',
    confidence:  'low',
  };
}
