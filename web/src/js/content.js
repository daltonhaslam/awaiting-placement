// Lookups into the cited content that more than one view needs, so each is matched one way.

// The cost-report (HCRIS) source entry, for figures built from hospitals' own cost reports.
export const hcrisSource = (D) => (D.content?.sources ?? []).find((s) => /HCRIS|Cost Reports/i.test(s.label));

// Long-term care hospitals' share of MA stays that start in an acute hospital (MedPAC), or null without the data.
export function ltchShare(D) {
  const stays = D.content?.medpac?.sept?.staysPer1000?.ma;
  return stays?.ach > 0 ? stays.ltch / stays.ach : null;
}

// The month and year of the MedPAC report behind the stay gaps (Table 4-1), read from its (first) citation: "June 2026".
export function medpacReportDate(D) {
  const src = D.content?.medpac?.t41?.src;
  const m = /\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/
    .exec((Array.isArray(src) ? src[0] : src)?.label ?? '');
  return m ? `${m[1]} ${m[2]}` : null;
}
