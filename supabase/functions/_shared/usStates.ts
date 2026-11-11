// supabase/functions/_shared/usStates.ts
// Mail vendors want the USPS two-letter code; the app sometimes holds the full
// name ("District of Columbia"). Same table as src/lib/usStates.ts.

const CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", "district of columbia": "DC", "washington dc": "DC", "washington, dc": "DC", "washington d.c.": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "puerto rico": "PR", guam: "GU", "virgin islands": "VI", "american samoa": "AS",
  "northern mariana islands": "MP",
};
const VALID = new Set(Object.values(CODES));

/** "District of Columbia" → "DC", " dc " → "DC"; anything unknown comes back trimmed and upper-cased for the vendor to judge. */
export function toStateCode(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  const up = s.toUpperCase().replace(/\./g, "");
  if (up.length === 2 && VALID.has(up)) return up;
  return CODES[s.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ")] ?? up;
}

export const isStateCode = (s: string) => VALID.has(s);
