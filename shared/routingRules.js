export const ROUTING_RULES_VERSION = '2026-02-13.v1';

export const CANONICAL_AREAS = [
  {
    key: 'career_business',
    name: 'Career & Business',
    aliases: ['งานประจำและธุรกิจ', 'career', 'business']
  },
  {
    key: 'finance_wealth',
    name: 'Finance & Wealth',
    aliases: ['การเงินและความมั่งคั่ง', 'finance', 'wealth']
  },
  {
    key: 'health_energy',
    name: 'Health & Energy',
    aliases: ['สุขภาพและพลังงาน', 'health', 'energy', 'fitness']
  },
  {
    key: 'family_relationships',
    name: 'Family & Relationships',
    aliases: ['ครอบครัวและความสัมพันธ์', 'family', 'relationship']
  },
  {
    key: 'personal_growth_learning',
    name: 'Personal Growth & Learning',
    aliases: ['พัฒนาตัวเองและการเรียนรู้', 'growth', 'learning']
  },
  {
    key: 'home_life_admin',
    name: 'Home & Life Admin',
    aliases: ['บ้านและงานจัดการชีวิต', 'home', 'life admin', 'admin']
  },
  {
    key: 'side_projects_experiments',
    name: 'Side Projects & Experiments',
    aliases: ['โปรเจกต์เสริมและการทดลอง', 'side project', 'experiment', 'project']
  }
];

export const TRAVEL_ROUTING_AREAS = {
  defaultArea: 'Side Projects & Experiments',
  familyArea: 'Family & Relationships',
  healthRoutineArea: 'Health & Energy'
};

const TRAVEL_SIGNAL_RE =
  /(เที่ยว|ทริป|เดินป่า|แคมป์|camp|camping|hike|hiking|trek|trekking|backpack|vacation|holiday|road\s*trip|itinerary)/i;
const TRAVEL_HEALTH_ROUTINE_RE =
  /(ทุกวัน|ทุกสัปดาห์|ทุกอาทิตย์|เป็นประจำ|routine|habit|สุขภาพ|ฟิต|ออกกำลังกาย|workout|training)/i;
const TRAVEL_FAMILY_RE =
  /(ครอบครัว|family|แฟน|คู่รัก|ภรรยา|สามี|ลูก|พ่อแม่|parents|wife|husband|partner|เพื่อน|friend)/i;

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function areaDisplayName(area) {
  return String(area?.name || area?.title || area?.category || '').trim();
}

function areaCandidates(area) {
  const parts = [area?.name, area?.title, area?.category]
    .map((v) => normalizeText(v))
    .filter(Boolean);
  return Array.from(new Set(parts));
}

export function findExplicitAreaMentionInAreas(areas, message) {
  const haystack = normalizeText(message);
  if (!haystack || !Array.isArray(areas)) return null;

  for (const area of areas) {
    const names = areaCandidates(area).filter((value) => value.length >= 4);
    for (const needle of names) {
      if (haystack.includes(needle)) return area;
    }
  }

  for (const def of CANONICAL_AREAS) {
    const aliases = [def.name, ...(def.aliases || [])]
      .map((v) => normalizeText(v))
      .filter((value) => value.length >= 4);
    for (const needle of aliases) {
      if (haystack.includes(needle)) {
        return { name: def.name, title: def.name };
      }
    }
  }

  return null;
}

export function resolveTravelAreaRecommendation(message, opts = {}) {
  const normalized = normalizeText(message);
  const explicitAreaMentioned = opts.explicitAreaMentioned === true;

  if (!normalized) {
    return { applied: false, reason: 'empty_message' };
  }
  if (!TRAVEL_SIGNAL_RE.test(normalized)) {
    return { applied: false, reason: 'no_travel_signal' };
  }
  if (explicitAreaMentioned) {
    return { applied: false, reason: 'explicit_area_in_message' };
  }

  const isFamilyTrip = TRAVEL_FAMILY_RE.test(normalized);
  const isHealthRoutineTrip = TRAVEL_HEALTH_ROUTINE_RE.test(normalized);

  if (isFamilyTrip) {
    return {
      applied: true,
      reason: 'travel_family_signal',
      areaName: TRAVEL_ROUTING_AREAS.familyArea,
      extraTags: ['travel', 'family']
    };
  }

  if (isHealthRoutineTrip) {
    return {
      applied: true,
      reason: 'travel_health_routine_signal',
      areaName: TRAVEL_ROUTING_AREAS.healthRoutineArea,
      extraTags: ['travel', 'health', 'fitness']
    };
  }

  return {
    applied: true,
    reason: 'travel_default_side_projects',
    areaName: TRAVEL_ROUTING_AREAS.defaultArea,
    extraTags: ['travel', 'outdoor']
  };
}

export function summarizeAreaCoverage(areas) {
  const rows = Array.isArray(areas) ? areas : [];
  const presentKeys = new Set();
  const unknownAreaNames = [];

  for (const area of rows) {
    const candidates = areaCandidates(area);
    let matched = null;
    for (const def of CANONICAL_AREAS) {
      const aliases = [def.name, ...(def.aliases || [])].map((v) => normalizeText(v)).filter(Boolean);
      if (aliases.some((alias) => candidates.some((value) => value.includes(alias) || alias.includes(value)))) {
        matched = def;
        break;
      }
    }
    if (matched) {
      presentKeys.add(matched.key);
    } else {
      const fallbackName = areaDisplayName(area);
      if (fallbackName) unknownAreaNames.push(fallbackName);
    }
  }

  const presentCanonicalNames = CANONICAL_AREAS.filter((def) => presentKeys.has(def.key)).map((def) => def.name);
  const missingCanonicalNames = CANONICAL_AREAS.filter((def) => !presentKeys.has(def.key)).map((def) => def.name);

  return {
    rulesVersion: ROUTING_RULES_VERSION,
    totalConfigured: CANONICAL_AREAS.length,
    matchedConfigured: presentCanonicalNames.length,
    presentCanonicalNames,
    missingCanonicalNames,
    unknownAreaNames: Array.from(new Set(unknownAreaNames))
  };
}
