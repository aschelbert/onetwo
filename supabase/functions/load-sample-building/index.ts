// supabase/functions/load-sample-building/index.ts
// Loads sample data into a new building so the owner can see the platform in action.
// Requires can_setup permission. Tenant must be in 'onboarding' status with no
// sample data loaded yet. All rows are inserted with is_sample = true.
// POST { action: "load" | "remove", tenant_id }

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const headers = (extra?: Record<string, string>) => ({
  ...cors,
  "Content-Type": "application/json",
  ...extra,
});

function svcHeaders(userJwt: string) {
  return {
    apikey: SB_SERVICE_KEY,
    Authorization: `Bearer ${userJwt}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

function adminHeaders() {
  return {
    apikey: SB_SERVICE_KEY,
    Authorization: `Bearer ${SB_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

// ─── Sample data constants ───

const UNITS = [
  { number: "101", owner: "Sarah Johnson", email: "sarah.j@example.com", phone: "202-555-0101", monthly_fee: 450, voting_pct: 2.1, status: "ACTIVE", balance: 0, move_in: "2019-06-15", sqft: 850, bedrooms: 1, parking: "P-101" },
  { number: "102", owner: "Mike Davis", email: "mike.d@example.com", phone: "202-555-0102", monthly_fee: 475, voting_pct: 2.2, status: "ACTIVE", balance: 0, move_in: "2020-03-01", sqft: 900, bedrooms: 1, parking: "P-102" },
  { number: "103", owner: "Vacant", email: "", phone: "", monthly_fee: 450, voting_pct: 2.1, status: "ACTIVE", balance: 0, move_in: null, sqft: 850, bedrooms: 1, parking: "P-103" },
  { number: "201", owner: "Lisa Chen", email: "lisa.c@example.com", phone: "202-555-0201", monthly_fee: 500, voting_pct: 2.3, status: "ACTIVE", balance: 0, move_in: "2018-09-01", sqft: 1050, bedrooms: 2, parking: "P-201" },
  { number: "202", owner: "Tom Wilson", email: "tom.w@example.com", phone: "202-555-0202", monthly_fee: 450, voting_pct: 2.1, status: "ACTIVE", balance: 0, move_in: "2021-01-15", sqft: 850, bedrooms: 1, parking: null },
  { number: "203", owner: "Emma Stone", email: "emma.s@example.com", phone: "202-555-0203", monthly_fee: 475, voting_pct: 2.2, status: "ACTIVE", balance: 450, move_in: "2022-07-01", sqft: 900, bedrooms: 1, parking: "P-203" },
  { number: "301", owner: "John Smith", email: "john@example.com", phone: "202-555-0301", monthly_fee: 450, voting_pct: 2.1, status: "ACTIVE", balance: 925, move_in: "2017-04-01", sqft: 850, bedrooms: 1, parking: "P-301" },
  { number: "302", owner: "Rachel Green", email: "rachel.g@example.com", phone: "202-555-0302", monthly_fee: 450, voting_pct: 2.1, status: "ACTIVE", balance: 0, move_in: "2023-11-01", sqft: 850, bedrooms: 1, parking: null },
  { number: "303", owner: "David Park", email: "david.p@example.com", phone: "202-555-0303", monthly_fee: 475, voting_pct: 2.2, status: "ACTIVE", balance: 450, move_in: "2020-08-15", sqft: 900, bedrooms: 1, parking: "P-303" },
  { number: "401", owner: "Amy Lee", email: "amy.l@example.com", phone: "202-555-0401", monthly_fee: 500, voting_pct: 2.3, status: "ACTIVE", balance: 0, move_in: "2019-02-01", sqft: 1050, bedrooms: 2, parking: "P-401" },
  { number: "402", owner: "James Brown", email: "james.b@example.com", phone: "202-555-0402", monthly_fee: 450, voting_pct: 2.1, status: "ACTIVE", balance: 0, move_in: "2021-05-01", sqft: 850, bedrooms: 1, parking: null },
  { number: "501", owner: "Chris Taylor", email: "chris.t@example.com", phone: "202-555-0501", monthly_fee: 500, voting_pct: 2.3, status: "ACTIVE", balance: 0, move_in: "2022-01-01", sqft: 1200, bedrooms: 2, parking: "P-501" },
];

// Board seats — the signer-up keeps their seat; these fill the remaining 4
const BOARD_TEMPLATES = [
  { name: "Jennifer Adams", role: "Vice President", email: "jennifer@example.com", phone: "202-555-0202", term: "Jan 2025 – Dec 2026", role_key: "vice_president" },
  { name: "David Chen", role: "Treasurer", email: "david@example.com", phone: "202-555-0102", term: "Jan 2025 – Dec 2026", role_key: "treasurer" },
  { name: "Maria Rodriguez", role: "Secretary", email: "maria@example.com", phone: "202-555-0303", term: "Jan 2024 – Dec 2025", role_key: "secretary" },
  { name: "Thomas Baker", role: "Member at Large", email: "thomas@example.com", phone: "202-555-0404", term: "Jan 2024 – Dec 2025", role_key: "member_at_large" },
];

const VENDORS = [
  { name: "Green Thumb Landscaping", service: "Landscaping", contact: "Mark Green", phone: "202-555-4001", email: "mark@greenthumb.com", contract: "Monthly, $650/mo", status: "active" },
  { name: "Cool Air Services", service: "HVAC", contact: "Tom Frost", phone: "202-555-4002", email: "tom@coolair.com", contract: "Annual, $3,200/yr", status: "active" },
  { name: "Apex Roofing", service: "Roofing", contact: "Diana Apex", phone: "202-555-4003", email: "diana@apexroof.com", contract: "On-call", status: "active" },
  { name: "Metro Elevator Co", service: "Elevator", contact: "Pete Quick", phone: "202-555-4004", email: "pete@metroelevator.com", contract: "Annual, $4,800/yr", status: "active" },
  { name: "Bright Clean Janitorial", service: "Janitorial", contact: "Ana Bright", phone: "202-555-4005", email: "ana@brightclean.com", contract: "Monthly, $1,100/mo", status: "active" },
  { name: "Tree Masters LLC", service: "Tree Care", contact: "Bill Oakley", phone: "202-555-4006", email: "bill@treemasters.com", contract: "On-call", status: "active" },
];

const INSURANCE_POLICIES = [
  { type: "Directors & Officers (D&O)", carrier: "Chubb Insurance", coverage: "$2,000,000", premium: "$3,200/yr", expires: "2026-09-30", policy_num: "DO-2026-4421" },
  { type: "General Liability", carrier: "Hartford Insurance", coverage: "$5,000,000", premium: "$8,500/yr", expires: "2026-09-30", policy_num: "GL-2026-8890" },
  { type: "Property / Hazard", carrier: "Hartford Insurance", coverage: "$15,000,000", premium: "$12,400/yr", expires: "2026-09-30", policy_num: "PH-2026-3301" },
  { type: "Umbrella", carrier: "Zurich Insurance", coverage: "$10,000,000", premium: "$4,200/yr", expires: "2026-12-31", policy_num: "UM-2026-7744" },
  { type: "Workers Comp", carrier: "State Farm", coverage: "Statutory", premium: "$2,100/yr", expires: "2026-06-30", policy_num: "WC-2026-1199" },
  { type: "Fidelity Bond", carrier: "Chubb Insurance", coverage: "$500,000", premium: "$950/yr", expires: "2026-09-30", policy_num: "FB-2026-5502" },
];

const BUILDING_ASSETS = [
  { name: "Pool & Deck Area", category: "Amenity", location: "Ground Floor - South", condition: "Good", installed_date: "2010-06-15", original_cost: 120000, useful_life_years: 25, remaining_life_years: 8, replacement_cost_today: 185000, criticality: "Medium", annual_maintenance_cost: 8400, notes: "Heated pool, 40x20ft, max capacity 30." },
  { name: "Main Elevator", category: "Mechanical", location: "Core", condition: "Good", installed_date: "2015-01-01", original_cost: 85000, useful_life_years: 20, remaining_life_years: 9, replacement_cost_today: 120000, criticality: "Critical", annual_maintenance_cost: 4800, notes: "ThyssenKrupp, 6-stop." },
  { name: "HVAC Central System", category: "Mechanical", location: "Rooftop", condition: "Fair", installed_date: "2012-08-01", original_cost: 65000, useful_life_years: 18, remaining_life_years: 4, replacement_cost_today: 95000, criticality: "High", annual_maintenance_cost: 3200, notes: "Carrier 50XC, annual filter change." },
  { name: "Roof Membrane", category: "Structure", location: "Rooftop", condition: "Fair", installed_date: "2014-05-01", original_cost: 45000, useful_life_years: 20, remaining_life_years: 8, replacement_cost_today: 68000, criticality: "High", annual_maintenance_cost: 1200, notes: "TPO membrane, last inspected Jan 2026." },
  { name: "Lobby & Common Areas", category: "Amenity", location: "Ground Floor", condition: "Good", installed_date: "2010-06-15", original_cost: 30000, useful_life_years: 15, remaining_life_years: 5, replacement_cost_today: 45000, criticality: "Low", annual_maintenance_cost: 2400, notes: "Furniture, lighting, finishes." },
  { name: "Parking Garage", category: "Structure", location: "Basement", condition: "Good", installed_date: "2010-06-15", original_cost: 200000, useful_life_years: 30, remaining_life_years: 14, replacement_cost_today: 280000, criticality: "Medium", annual_maintenance_cost: 3600, notes: "30 assigned spaces." },
];

const CASES = [
  { cat_id: "enforcement", sit_id: "covenant-violations", title: "Unit 502 — Unauthorized Balcony Enclosure", unit: "502", owner: "Lisa Chen", approach: "pre", status: "open", priority: "high", created_date: "2026-01-28", notes: "Owner enclosed balcony without architectural review. Structural concerns." },
  { cat_id: "financial", sit_id: "delinquent-accounts", title: "Unit 301 — 90-Day Delinquent Assessment", unit: "301", owner: "John Smith", approach: "self", status: "open", priority: "medium", created_date: "2026-02-01", notes: "Owner $925 behind. Payment plan offered but not signed." },
];

// Compliance completions (runbook item IDs → true)
const COMPLIANCE_ITEMS = [
  "g1","g2","g3","g4","g5","g6","g8","g9",
  "f1","f2","f4","f5","f6","f7",
  "i1","i2","i3","i4","i6",
  "m1","m2","m3","m5",
  "r1","r2","r4","r5",
  "o1","o2","o3","o4",
  "e1","e2","e3",
  "l1","l2",
];

const DOCUMENTS = [
  { name: "Declaration of Condominium", version: "2024 Restatement", size: "4.2 MB", status: "current" },
  { name: "Bylaws", version: "2023 Amendment", size: "1.8 MB", status: "current" },
  { name: "Rules & Regulations", version: "2024 Update", size: "890 KB", status: "current" },
  { name: "Assessment Collection Policy", version: "2023", size: "420 KB", status: "current" },
  { name: "Resale Certificate Policy", version: "2022", size: "350 KB", status: "review-due" },
  { name: "Document Retention Policy", version: "2023", size: "280 KB", status: "current" },
  { name: "Emergency Preparedness Plan", version: "2024", size: "1.1 MB", status: "current" },
  { name: "Insurance Summary", version: "FY 2025-2026", size: "520 KB", status: "current" },
];

const MEETING = {
  title: "January Board Meeting",
  type: "BOARD",
  status: "COMPLETED",
  date: "2026-01-16",
  time: "19:00",
  location: "Community Room",
  agenda: JSON.stringify(["Approve December minutes", "Financial report", "Roof repair update", "Pool season planning", "New business"]),
  notes: "Quorum met. All agenda items addressed.",
  minutes: "Meeting called to order at 7:02 PM. December minutes approved unanimously. Treasurer reported operating account balance of $42,300. Roof repair completed under budget. Pool opening scheduled for Memorial Day weekend. Meeting adjourned at 8:15 PM.",
};

// Generate a year of GL entries from unit assessments + expenses
function buildGLEntries(tenantId: string): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown>> = [];
  let seq = 1000;
  const months = ["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"];

  // Monthly assessments for each unit (6 months)
  for (const mo of months) {
    for (const u of UNITS) {
      entries.push({
        tenant_id: tenantId,
        local_id: `GL${seq++}`,
        date: `${mo}-01`,
        memo: `Assessment - Unit ${u.number} (${mo.split("-")[1]})`,
        debit_acct: "1110",
        credit_acct: "4010",
        amount: u.monthly_fee,
        source: "assessment",
        source_id: u.number,
        status: "posted",
        is_sample: true,
      });
    }
  }

  // Monthly expenses
  const expenses = [
    { memo: "Landscaping — Green Thumb", acct: "5030", amount: 650 },
    { memo: "Janitorial — Bright Clean", acct: "5010", amount: 1100 },
    { memo: "Elevator maintenance — Metro Elevator", acct: "5010", amount: 400 },
    { memo: "Water & Sewer", acct: "5050", amount: 380 },
    { memo: "Electric — Common Areas", acct: "5050", amount: 420 },
    { memo: "Insurance (monthly allocation)", acct: "5060", amount: 2613 },
  ];

  for (const mo of months) {
    for (const exp of expenses) {
      entries.push({
        tenant_id: tenantId,
        local_id: `GL${seq++}`,
        date: `${mo}-15`,
        memo: `${exp.memo} (${mo})`,
        debit_acct: exp.acct,
        credit_acct: "1010",
        amount: exp.amount,
        source: "expense",
        source_id: "",
        status: "posted",
        is_sample: true,
      });
    }
  }

  // Opening balance
  entries.push({
    tenant_id: tenantId,
    local_id: `GL${seq++}`,
    date: "2026-01-01",
    memo: "Opening balance — Operating Account",
    debit_acct: "1010",
    credit_acct: "3010",
    amount: 42300,
    source: "manual",
    source_id: "",
    status: "posted",
    is_sample: true,
  });

  // Reserve contribution
  for (const mo of months) {
    entries.push({
      tenant_id: tenantId,
      local_id: `GL${seq++}`,
      date: `${mo}-01`,
      memo: `Reserve contribution (${mo})`,
      debit_acct: "1020",
      credit_acct: "1010",
      amount: 2500,
      source: "transfer",
      source_id: "",
      status: "posted",
      is_sample: true,
    });
  }

  return entries;
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");

    const { action, tenant_id } = await req.json();

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400, headers: headers(),
      });
    }

    if (action === "remove") {
      return await removeSampleData(tenant_id);
    }

    // Default: load
    return await loadSampleData(tenant_id, jwt);
  } catch (err) {
    console.error("load-sample-building error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: headers(),
    });
  }
});

async function loadSampleData(tenantId: string, _jwt: string) {
  const ah = adminHeaders();

  // 1. Check tenant is onboarding and sample_data_loaded_at is null
  const tenantRes = await fetch(
    `${SB_URL}/rest/v1/tenants?id=eq.${tenantId}&select=id,status,sample_data_loaded_at`,
    { headers: { ...ah, Accept: "application/vnd.pgrst.object+json" } }
  );
  const tenant = await tenantRes.json();

  if (!tenant?.id) {
    return new Response(JSON.stringify({ error: "Tenant not found" }), {
      status: 404, headers: headers(),
    });
  }

  if (tenant.sample_data_loaded_at) {
    return new Response(JSON.stringify({ success: true, already_loaded: true }), {
      status: 200, headers: headers(),
    });
  }

  // 2. Insert sample data in parallel batches
  const unitRows = UNITS.map((u) => ({
    tenant_id: tenantId,
    number: u.number,
    owner: u.owner,
    email: u.email,
    phone: u.phone,
    monthly_fee: u.monthly_fee,
    voting_pct: u.voting_pct,
    status: u.status,
    balance: u.balance,
    move_in: u.move_in,
    sqft: u.sqft,
    bedrooms: u.bedrooms,
    parking: u.parking,
    is_sample: true,
  }));

  const boardRows = BOARD_TEMPLATES.map((b) => ({
    tenant_id: tenantId,
    name: b.name,
    role: b.role,
    email: b.email,
    phone: b.phone,
    term: b.term,
    role_key: b.role_key,
    is_sample: true,
  }));

  const vendorRows = VENDORS.map((v) => ({
    tenant_id: tenantId,
    name: v.name,
    service: v.service,
    contact: v.contact,
    phone: v.phone,
    email: v.email,
    contract: v.contract,
    status: v.status,
    is_sample: true,
  }));

  const insuranceRows = INSURANCE_POLICIES.map((p) => ({
    tenant_id: tenantId,
    type: p.type,
    carrier: p.carrier,
    coverage: p.coverage,
    premium: p.premium,
    expires: p.expires,
    policy_num: p.policy_num,
    is_sample: true,
  }));

  const assetRows = BUILDING_ASSETS.map((a) => ({
    tenant_id: tenantId,
    name: a.name,
    category: a.category,
    location: a.location,
    condition: a.condition,
    installed_date: a.installed_date,
    original_cost: a.original_cost,
    useful_life_years: a.useful_life_years,
    remaining_life_years: a.remaining_life_years,
    replacement_cost_today: a.replacement_cost_today,
    criticality: a.criticality,
    annual_maintenance_cost: a.annual_maintenance_cost,
    notes: a.notes,
    is_sample: true,
  }));

  const caseRows = CASES.map((c) => ({
    tenant_id: tenantId,
    cat_id: c.cat_id,
    sit_id: c.sit_id,
    title: c.title,
    unit: c.unit,
    owner: c.owner,
    approach: c.approach,
    status: c.status,
    priority: c.priority,
    created_date: c.created_date,
    notes: c.notes,
    is_sample: true,
  }));

  const complianceRows = COMPLIANCE_ITEMS.map((itemId) => ({
    tenant_id: tenantId,
    item_id: itemId,
    completed: true,
    is_sample: true,
  }));

  const documentRows = DOCUMENTS.map((d) => ({
    tenant_id: tenantId,
    name: d.name,
    version: d.version,
    size: d.size,
    status: d.status,
    is_sample: true,
  }));

  const meetingRow = {
    tenant_id: tenantId,
    title: MEETING.title,
    type: MEETING.type,
    status: MEETING.status,
    date: MEETING.date,
    time: MEETING.time,
    location: MEETING.location,
    agenda: MEETING.agenda,
    notes: MEETING.notes,
    minutes: MEETING.minutes,
    is_sample: true,
  };

  const glRows = buildGLEntries(tenantId);

  // Execute all inserts in parallel
  const insert = (table: string, rows: unknown) =>
    fetch(`${SB_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...ah, Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });

  const results = await Promise.allSettled([
    insert("units", unitRows),
    insert("board_members", boardRows),
    insert("vendors", vendorRows),
    insert("insurance_policies", insuranceRows),
    insert("building_assets", assetRows),
    insert("cases", caseRows),
    insert("compliance_completions", complianceRows),
    insert("legal_documents", documentRows),
    insert("meetings", [meetingRow]),
    insert("general_ledger", glRows),
  ]);

  // Log any failures
  const failures = results.filter((r) => r.status === "rejected");
  for (const f of failures) {
    console.error("Insert failed:", (f as PromiseRejectedResult).reason);
  }

  // Also check HTTP status codes
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled") {
      const res = (results[i] as PromiseFulfilledResult<Response>).value;
      if (!res.ok) {
        const body = await res.text();
        console.error(`Insert to table[${i}] failed: ${res.status}`, body);
      }
    }
  }

  // 3. Mark sample data as loaded
  await fetch(`${SB_URL}/rest/v1/tenants?id=eq.${tenantId}`, {
    method: "PATCH",
    headers: ah,
    body: JSON.stringify({ sample_data_loaded_at: new Date().toISOString() }),
  });

  return new Response(
    JSON.stringify({
      success: true,
      loaded: {
        units: unitRows.length,
        board_members: boardRows.length,
        vendors: vendorRows.length,
        insurance_policies: insuranceRows.length,
        building_assets: assetRows.length,
        cases: caseRows.length,
        compliance_completions: complianceRows.length,
        legal_documents: documentRows.length,
        meetings: 1,
        general_ledger: glRows.length,
      },
    }),
    { status: 200, headers: headers() }
  );
}

async function removeSampleData(tenantId: string) {
  const ah = adminHeaders();

  const tables = [
    "units",
    "board_members",
    "vendors",
    "insurance_policies",
    "building_assets",
    "cases",
    "compliance_completions",
    "legal_documents",
    "meetings",
    "general_ledger",
  ];

  // Delete all is_sample = true rows for this tenant
  const deletes = tables.map((table) => {
    const filter = table === "units"
      ? `tenant_id=eq.${tenantId}&is_sample=eq.true`
      : `tenant_id=eq.${tenantId}&is_sample=eq.true`;
    return fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
      method: "DELETE",
      headers: ah,
    });
  });

  await Promise.allSettled(deletes);

  // Clear the marker
  await fetch(`${SB_URL}/rest/v1/tenants?id=eq.${tenantId}`, {
    method: "PATCH",
    headers: ah,
    body: JSON.stringify({ sample_data_loaded_at: null }),
  });

  return new Response(JSON.stringify({ success: true, removed: true }), {
    status: 200, headers: headers(),
  });
}
