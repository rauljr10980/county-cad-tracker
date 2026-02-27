export interface ExtractedContact {
  name: string | null;
  phones: string[];
  emails: string[];
}

// Use word-boundary regex patterns to avoid false matches (e.g. "Nagel" containing "age")
const SKIP_PATTERNS = [
  /\bage\s+\d/i,          // "Age 54" but not "Nagel"
  /\bphone\b/i,
  /\bemail\b/i,
  /\baddress\b/i,
  /\blives\s+in\b/i,
  /\bborn\b/i,
  /\bresides\b/i,
  /\balso known\b/i,
  /\baka\b/i,
  /\brelat/i,
  /\bassociat/i,
  /\barrest/i,
  /\bcriminal/i,
  /\brecords\b/i,
  /\bmisdemeanor/i,
  /\bfeloni/i,
  /\bsex offender/i,
  /\bwarrant/i,
  /\bcourt\b/i,
  /\beviction/i,
  /\bforeclosure/i,
  /\bmarriage/i,
  /\bdivorce/i,
  /\bbankrupt/i,
  /\blien/i,
  /\bjudgment/i,
  /\basset/i,
  /\bproperties\b/i,
  /\bbusiness\b/i,
  /\blicense/i,
  /\bsocial media/i,
  /\bsponsored/i,
  /\bbackground\b/i,
  /\breport\b/i,
  /\bcheck\b/i,
  /\bneighbor/i,
];

function extractName(lines: string[]): string | null {
  // Look at first 10 non-empty lines for a person name
  const candidates = lines.slice(0, 10);
  for (const line of candidates) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip lines with known labels
    if (SKIP_PATTERNS.some(p => p.test(trimmed))) continue;
    // Skip lines with slashes (navigation breadcrumbs)
    if (trimmed.includes('/')) continue;
    // Skip lines with digits, @, or special chars
    if (/[@\d]/.test(trimmed)) continue;
    // Skip lines that are too long to be a name
    if (trimmed.length > 40) continue;
    // Match 2-4 words that look like a name (capitalized or all-caps)
    // Middle initial requires a dot (e.g. "J.") to avoid grabbing first letter of last name
    if (/^[A-Z][A-Za-z'-]+(\s+[A-Z]\.)?(\s+[A-Z][A-Za-z'-]+){1,3}$/.test(trimmed)) {
      return trimmed;
    }
    // Also match ALL CAPS names like "RAUL MEDINA"
    if (/^[A-Z'-]+(\s+[A-Z]\.)?(\s+[A-Z'-]+){1,3}$/.test(trimmed) && trimmed.length < 40) {
      return trimmed;
    }
  }
  return null;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // Strip leading 1 (country code)
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (d.length !== 10) return raw.trim();
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function extractPhones(text: string): string[] {
  // Negative lookbehind: don't match numbers preceded by a digit or dash (e.g. APN 125-275-001-0014)
  const phoneRegex = /(?<![\d-])(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?![\d-])/g;
  const matches = text.match(phoneRegex) || [];
  const normalized = matches.map(normalizePhone);
  // Deduplicate by digits
  const seen = new Set<string>();
  return normalized.filter(p => {
    const digits = p.replace(/\D/g, '');
    if (digits.length < 10) return false;
    const key = digits.slice(-10);
    if (seen.has(key)) return false;
    // Filter obvious fakes
    if (/^(\d)\1{9}$/.test(key)) return false;
    if (key === '0000000000') return false;
    seen.add(key);
    return true;
  });
}

const SITE_EMAILS = ['support@truepeoplesearch.com', 'noreply@truepeoplesearch.com'];

function extractEmails(text: string): string[] {
  const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  const seen = new Set<string>();
  return matches
    .map(e => e.toLowerCase().trim())
    .filter(e => {
      if (seen.has(e)) return false;
      if (SITE_EMAILS.includes(e)) return false;
      seen.add(e);
      return true;
    });
}

export function extractContacts(rawText: string): ExtractedContact {
  // Normalize input
  const cleaned = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  return {
    name: extractName(lines),
    phones: extractPhones(cleaned),
    emails: extractEmails(cleaned),
  };
}
