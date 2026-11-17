#!/usr/bin/env python3
"""Generate the static guide pages in public/guides/ from one template.

Run from the repo root:  python3 scripts/build-guides.py
Edit the content in GUIDES below, re-run, and commit the generated HTML.
"""
import html, json, os

UPDATED_ISO = "2026-11-14"
UPDATED = "November 14, 2026"
SITE = "https://getonetwo.com"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "guides")

def code(sec):
    return f'<a href="https://code.dccouncil.gov/us/dc/council/code/sections/{sec}">§&nbsp;{sec}</a>'

GUIDES = [
 dict(
  slug="dc-condo-reserve-study",
  title="DC Condo Reserve Study Requirements | ONE two",
  description="What the DC Condominium Act says about condo reserves and reserve studies, what buyers and lenders look at, and a checklist for self-managed boards.",
  eyebrow="Reserves",
  h1="Does a DC condo association need a reserve study?",
  answer=f"DC law does not require a reserve study or a minimum reserve balance. The DC Condominium Act lets the board adopt a budget that includes reserves ({code('42-1903.08')}), and your declaration or bylaws may require more. Most buildings still need one: buyers see your reserves on every resale certificate, and mortgage lenders look at reserve funding before they lend in the building.",
  body=f"""
<h2 id="law">What DC law says about reserves</h2>
<ul>
<li><strong>The board may budget for reserves.</strong> The association has the power to adopt and amend a budget for revenues, expenditures and reserves, and to collect assessments for common expenses ({code('42-1903.08')}).</li>
<li><strong>Board members owe owners a fiduciary's care.</strong> The same section says officers and executive board members must exercise the care required of a fiduciary of the unit owners.</li>
<li><strong>Assessments are made at least once a year</strong>, or more often if the condominium instruments say so ({code('42-1903.12')}).</li>
<li><strong>Reserves are disclosed on every resale.</strong> The seller must give the buyer a statement of the status and amount of any reserves for capital expenditures, contingencies and improvements, any part earmarked for a specific project, and any approved capital expenditures not in the current operating budget ({code('42-1904.11')}).</li>
</ul>
<p>Nothing in the Act sets a required reserve balance or says how often to study it. That makes your own documents the deciding rules.</p>

<h2 id="documents">Check your declaration and bylaws</h2>
<p>Many DC condominium instruments are stricter than the Act. Look for language that requires a reserve fund, a minimum yearly contribution, or a reserve study on a set schedule. If your documents require it, the board must follow them.</p>

<h2 id="why">Why boards get a reserve study anyway</h2>
<ul>
<li><strong>Sales.</strong> Buyers and their agents read the reserve figures on the resale certificate. A thin reserve with a roof due soon is a reason to walk away or ask for a lower price.</li>
<li><strong>Mortgages.</strong> Fannie Mae and Freddie Mac review a building's budget before lenders sell loans to them, and a budget that sets too little aside for reserves can make units harder to finance. The commonly cited benchmark is 10% of the budget going to reserves.</li>
<li><strong>Special assessments.</strong> Without a plan, a boiler or façade repair becomes a large one-time bill for every owner.</li>
<li><strong>Fiduciary care.</strong> A study is the clearest record that the board planned for what it knew was coming.</li>
</ul>

<h2 id="contents">What a reserve study covers</h2>
<p>A reserve study lists every major shared component, such as the roof, boiler, elevator, façade, windows, paving and common-area finishes, with its remaining useful life and replacement cost. It then sets a yearly contribution that pays for each one when it comes due. Common practice is a full study with a site visit, then updates every few years; many boards use a three to five year cycle.</p>

<h2 id="checklist">Checklist for a self-managed board</h2>
<ol>
<li>Read the declaration and bylaws for any reserve rules.</li>
<li>List every shared component with the year it was installed or last replaced.</li>
<li>Commission a reserve study, or an update if the last one is more than a few years old.</li>
<li>Set the reserve contribution in the annual budget and send the budget to owners.</li>
<li>Move the reserve contribution to a separate account every month.</li>
<li>Keep the study in the association's records; you will need it for every resale certificate.</li>
</ol>
""",
  how=[
   "An asset registry with every component's replacement year and cost, and the funded share against the target.",
   "A reserve study runbook that opens the next study on schedule (every three years by default; your board can change it).",
   "The monthly reserve transfer, posted with the month's close.",
   "Plus Facilities adds reserve study tools, component schedules and funding scenarios.",
  ],
  sources=[("42-1903.08","Unit owners' associations; powers and rights"),("42-1903.12","Liability for common expenses; assessments"),("42-1904.11","Resale by unit owner")],
 ),
 dict(
  slug="leaving-your-property-manager-dc",
  title="How to Leave Your Condo Property Manager in DC | ONE two",
  description="A step-by-step guide for DC condo boards leaving a property management company: reading the contract, the 90 day rule for developer contracts, what records to get back, and a timeline.",
  eyebrow="Changing management",
  h1="How to leave your property management company in DC",
  answer=f"Start with your management contract: it sets the notice period, any termination fee, and what the company must hand back. If the developer signed the contract while it still controlled the association, DC law lets the association end it without penalty on at least 90 days' written notice ({code('42-1903.02')}). Plan for about 90 days: vote, give notice, move the bank accounts, collect the records, and tell owners where to pay.",
  body=f"""
<h2 id="contract">1. Read the management contract</h2>
<p>The contract decides most of what follows. Find:</p>
<ul>
<li>The term and renewal date, and whether it renews automatically.</li>
<li>Whether the board can end it for any reason or only for cause.</li>
<li>The notice period, and how notice must be delivered.</li>
<li>Any termination fee.</li>
<li>What the company must return at the end, and how quickly.</li>
<li>Who controls the bank accounts and any software that holds the association's data.</li>
</ul>

<h2 id="developer">2. Contracts the developer signed</h2>
<p>If the declarant (the developer) signed the management contract on the association's behalf while it still controlled the board, the DC Condominium Act lets the association end it without penalty on at least 90 days' written notice ({code('42-1903.02')}).</p>

<h2 id="vote">3. Vote, then give notice</h2>
<p>Vote to end the contract at a properly noticed board meeting and record the vote in the minutes. Send written notice exactly as the contract requires; certified mail with a return receipt gives you proof of the date.</p>

<h2 id="records">4. Get the association's records back</h2>
<p>The records belong to the association, which must keep detailed records of its receipts and expenditures and make its books available to owners ({code('42-1903.14')}). Ask for:</p>
<table class="data">
<thead><tr><th>Area</th><th>What to collect</th></tr></thead>
<tbody>
<tr><th>Money</th><td data-label="What to collect">Bank statements and online access for the operating and reserve accounts, the general ledger, the current year's budget, prior year financial statements, tax returns and any audit.</td></tr>
<tr><th>Owners</th><td data-label="What to collect">Every owner's ledger and balance, delinquency and collection files, payment plans, autopay details, and the owner contact list.</td></tr>
<tr><th>Contracts</th><td data-label="What to collect">Vendor and service contracts, insurance policies and certificates, and warranties.</td></tr>
<tr><th>Governance</th><td data-label="What to collect">The declaration, bylaws, rules, minutes, resolutions and election records.</td></tr>
<tr><th>Building</th><td data-label="What to collect">The reserve study, maintenance and inspection records, permits, keys, fobs and access codes.</td></tr>
</tbody>
</table>

<h2 id="timeline">5. A 90 day timeline</h2>
<table class="data">
<thead><tr><th>When</th><th>What happens</th></tr></thead>
<tbody>
<tr><th>Day 0</th><td data-label="What happens">Board vote. Written notice sent. Ask for the records list in writing.</td></tr>
<tr><th>By day 30</th><td data-label="What happens">Open or confirm bank accounts in the association's name and update the signers. Set up how owners will pay.</td></tr>
<tr><th>By day 60</th><td data-label="What happens">Tell vendors and the insurance agent who to contact and where invoices go. Load owners, balances and documents into your new system.</td></tr>
<tr><th>Day 90</th><td data-label="What happens">Switch day. Confirm every record has arrived and balances match the last statement.</td></tr>
<tr><th>First month after</th><td data-label="What happens">Close the first month yourselves and send every owner a statement.</td></tr>
</tbody>
</table>

<h2 id="owners">6. Tell the owners</h2>
<p>Send every owner one notice with the switch date, new payment instructions, how to set up autopay, and who to call. Send it early and again a week before switch day.</p>
""",
  how=[
   "Setup takes most buildings an afternoon: units, bylaws facts, balances and documents.",
   "Dues are paid by bank, card or autopay straight into the association's own account.",
   "A records request letter citing DC Code § 42-1903.14 is ready to send.",
   "Keeping your manager for day-to-day work? Give them a Property Manager Seat ($79 a month) so they work in the association's records. Want a person on call? Add On Call ($249 a month).",
  ],
  sources=[("42-1903.02","Control by declarant; contracts entered on behalf of unit owners"),("42-1903.14","Books, minutes, and records; inspection")],
 ),
 dict(
  slug="dc-condo-management-cost",
  title="What Condo Management Costs in Washington, DC | ONE two",
  description="What DC condo associations pay for property management: typical per-unit rates by service level, monthly minimums, the extra fees to ask about, and what self-managing costs instead.",
  eyebrow="Costs",
  h1="What does condo management cost in Washington, DC?",
  answer="Published DC-area rate cards run from about $12 a unit a month for accounting only to $35 to $50 a unit for full service, usually with a monthly minimum, and before extras like project oversight, resale certificates and mailings. For a 12 unit building, full service at those rates costs about $5,000 to $7,200 a year before extras.",
  body="""
<h2 id="rates">Typical rates by level of service</h2>
<p>What a 12 unit building would pay a year at each level, using published DC-area rates and minimums:</p>
<table class="data">
<thead><tr><th>Service</th><th>Typical rate</th><th>12 units, a year</th></tr></thead>
<tbody>
<tr><th>Accounting only</th><td data-label="Typical rate">About $12 a unit a month, $150 minimum</td><td data-label="12 units, a year">About $1,800</td></tr>
<tr><th>Accounting and maintenance</th><td data-label="Typical rate">About $25 a unit a month, $250 minimum</td><td data-label="12 units, a year">About $3,600</td></tr>
<tr><th>Full service</th><td data-label="Typical rate">$35 to $50 a unit a month, $300 minimum</td><td data-label="12 units, a year">$5,040 to $7,200</td></tr>
<tr><th>ONE two Self-Managed</th><td data-label="Typical rate">$179 a month, any number of units</td><td data-label="12 units, a year">$2,148 ($1,790 paid yearly)</td></tr>
</tbody>
</table>
<p class="note">Rates vary by company, building size and what is included. Get two or three written quotes.</p>

<h2 id="extras">The fees on top</h2>
<p>The per-unit fee is rarely the whole bill. Ask every company about:</p>
<ul>
<li><strong>Setup or onboarding fees</strong> when you start.</li>
<li><strong>Project oversight</strong>, often a percentage of the project cost, such as 10% of a roof repair.</li>
<li><strong>Resale certificate and admin fees</strong>, often charged when an owner sells.</li>
<li><strong>Mailings, copies and late fee processing</strong>, sometimes with a markup on postage.</li>
<li><strong>Vendor markups</strong> when the company hires its own vendors.</li>
<li><strong>Extra meetings, after-hours calls and collections referrals.</strong></li>
</ul>

<h2 id="same">What you pay either way</h2>
<p>The management fee is only part of your dues. Insurance, utilities, repairs, vendors, reserves, the tax return and any audit cost the same whether or not you hire a manager.</p>

<h2 id="self">What self-managing costs instead</h2>
<p>A self-managed board trades the management fee for its own time, plus software and any help it chooses to buy: a bookkeeper or accountant for the tax return, a lawyer for collections that go to court, and an advisor if the board wants one. The work is the same: meetings, budgets, dues, notices, filings, insurance renewals and records.</p>

<h2 id="quote">Questions to ask in a quote</h2>
<ol>
<li>What is the monthly fee, and is there a minimum?</li>
<li>Which services are included, and what is billed extra?</li>
<li>Do you mark up vendors, postage or supplies?</li>
<li>Whose bank account do dues go into?</li>
<li>How much notice to end the contract, and is there a fee?</li>
<li>What records do we get back, in what format, and how fast?</li>
</ol>
""",
  how=[
   "One price, $179 a month, whatever the number of units. Plus Facilities is $279 for buildings with an elevator, pool, boiler or staff.",
   "Postage and card fees at cost, vendors paid directly at their own price, resale certificates from your own records.",
   "45 DC obligations tracked, with 32 runbooks that start the work on time.",
   "Cancel any time; your records export with you.",
  ],
  sources=[],
 ),
]

ALL = {g["slug"]: g for g in GUIDES}

def shell(t, d, url, schema, main, og_type="article", og_title=None, extra_css=""):
    og_title = html.escape(og_title or "")
    schema_json = json.dumps(schema, indent=1, ensure_ascii=False)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Generated by scripts/build-guides.py. Edit the script, not this file. -->
<title>{t}</title>
<meta name="description" content="{d}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="{og_type}">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{og_title}">
<meta property="og:description" content="{d}">
<meta property="og:image" content="{SITE}/og.png">
<meta property="og:site_name" content="ONE two">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<script type="application/ld+json">
{schema_json}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&amp;family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&amp;display=swap" rel="stylesheet">
<style>
body{{margin:0;background:#ffffff;color:#0D1B2E;font-family:'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}}
a{{color:#155E75}}a:hover{{color:#0D1B2E}}
h1,h2,h3{{font-family:'Fraunces',Georgia,serif;font-weight:600;letter-spacing:-0.01em;margin:0}}
p{{margin:0}}
.wrap{{max-width:1200px;margin:0 auto;padding:0 32px;box-sizing:border-box}}
.btn{{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 22px;border-radius:10px;font-weight:600;font-size:16px;text-decoration:none;border:0;cursor:pointer;font-family:inherit}}
.btn-red{{background:#D62839;color:#ffffff}}.btn-red:hover{{background:#b91c2c;color:#ffffff}}
.btn-outline{{background:#ffffff;color:#0D1B2E;border:1.5px solid #c9d2dc}}.btn-outline:hover{{border-color:#0D1B2E;color:#0D1B2E}}
.btn-ghost{{background:transparent;color:#ffffff;border:1.5px solid rgba(255,255,255,.45)}}.btn-ghost:hover{{border-color:#ffffff;color:#ffffff}}
.row{{display:flex;align-items:center;justify-content:space-between;gap:12px}}
.hero{{background:#0D1B2E;color:#ffffff;padding:64px 0 56px}}
.hero .in{{max-width:780px;margin:0 auto;padding:0 32px}}
.crumbs{{font-size:14px;color:#8fa0b3;margin-bottom:20px}}.crumbs a{{color:#A5F3FC;text-decoration:none}}.crumbs a:hover{{text-decoration:underline}}
.eyebrow{{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#A5F3FC;margin-bottom:14px}}
.eyebrow::before{{content:"";width:28px;height:2px;background:#D62839}}
.hero h1{{font-size:46px;line-height:1.08;color:#ffffff}}
.hero .upd{{margin-top:18px;font-size:14px;color:#8fa0b3}}
.article{{max-width:780px;margin:0 auto;padding:0 32px 72px;font-size:17px;line-height:1.7;color:#2b3a4c;box-sizing:border-box}}
.answer{{position:relative;margin:-28px 0 8px;background:#ffffff;border:1px solid #d9e8ec;border-left:4px solid #155E75;border-radius:12px;padding:22px 26px;box-shadow:0 10px 30px rgba(13,27,46,.08)}}
.answer .lbl{{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#155E75;margin-bottom:8px}}
.answer p{{font-size:18px;line-height:1.6;color:#0D1B2E;margin:0}}
.article h2{{font-size:28px;line-height:1.2;color:#0D1B2E;margin:52px 0 16px;scroll-margin-top:96px}}
.article p{{margin:0 0 16px}}
.article ul,.article ol{{margin:0 0 16px;padding-left:22px}}
.article li{{margin-bottom:10px}}
.article strong{{color:#0D1B2E;font-weight:600}}
.article .note{{font-size:15px;color:#4b5a6b}}
.data{{width:100%;border-collapse:collapse;font-size:15px;line-height:1.55;margin:8px 0 16px}}
.data th,.data td{{text-align:left;vertical-align:top;padding:12px 14px;border-bottom:1px solid #e3e8ee}}
.data thead th{{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#4b5a6b;font-weight:600;border-bottom:2px solid #d5dde6;font-family:'DM Sans',system-ui,sans-serif}}
.data tbody th{{font-family:'DM Sans',system-ui,sans-serif;font-weight:600;color:#0D1B2E;width:30%}}
.data tbody tr:last-child th,.data tbody tr:last-child td{{border-bottom:0}}
.how{{margin:52px 0 0;background:#0D1B2E;color:#c7d2de;border-radius:16px;padding:32px 32px 28px}}
.how h2{{color:#ffffff;margin:0 0 14px;font-size:26px}}
.how ul{{padding-left:20px;margin:0 0 22px}}.how li{{margin-bottom:8px}}
.how .ctas{{display:flex;gap:12px;flex-wrap:wrap}}
.related{{margin-top:52px;padding-top:28px;border-top:1px solid #e3e8ee}}
.related h2{{margin:0 0 12px;font-size:22px}}
.related ul{{list-style:none;padding:0}}.related li{{margin-bottom:8px}}
.sources{{font-size:15px}}
.disclaimer{{margin-top:32px;font-size:14px;color:#4b5a6b;background:#f7f9fb;border-radius:10px;padding:14px 18px}}
@media (max-width:640px){{
  .wrap{{padding:0 16px}}
  .hero{{padding:40px 0 48px}}.hero .in{{padding:0 16px}}
  .hero h1{{font-size:32px}}
  .article{{padding:0 16px 56px;font-size:16px}}
  .answer{{padding:18px 18px}}.answer p{{font-size:16.5px}}
  .article h2{{font-size:23px;margin-top:44px}}
  .how{{padding:24px 20px}}
  .data thead{{display:none}}
  .data,.data tbody,.data tr,.data th,.data td{{display:block;width:auto}}
  .data tr{{border:1px solid #e3e8ee;border-radius:10px;padding:4px 0;margin-bottom:12px}}
  .data tbody th,.data td{{border:0;padding:8px 14px}}
  .data tbody th{{width:auto;font-size:16px}}
  .data td[data-label]::before{{content:attr(data-label);display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#4b5a6b;font-weight:600;margin-bottom:2px}}
  header .btn-outline{{display:none}}
}}
{extra_css}</style>
</head>
<body>
<header style="background:#ffffff;border-bottom:1px solid #e9edf2;position:sticky;top:0;z-index:5">
  <div class="wrap row" style="min-height:72px">
    <a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:#0D1B2E"><img src="/onetwo-nav-logo.jpg" alt="ONE two" style="width:36px;height:34px;object-fit:cover;border-radius:6px"><span style="font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:22px">ONE <span style="font-weight:500">two</span></span></a>
    <div style="display:flex;gap:10px"><a class="btn btn-outline" href="/login" style="min-height:42px;font-size:15px">Log in</a><a class="btn btn-red" href="/login?create=1" style="min-height:42px;font-size:15px" data-cta="guide-header">Start free trial</a></div>
  </div>
</header>
{main}
<footer style="background:#08121f;color:#8fa0b3;padding:36px 0"><div class="wrap row" style="font-size:13px"><span>ONE two · Washington, DC</span><nav style="display:flex;gap:20px" aria-label="Footer"><a href="/guides" style="color:#8fa0b3">Guides</a><a href="/privacy" style="color:#8fa0b3">Privacy</a><a href="/terms" style="color:#8fa0b3">Terms</a><a href="mailto:hello@getonetwo.com" style="color:#8fa0b3">Contact</a></nav></div></footer>
<script src="/site-config.js"></script>
<script src="/trial-days.js"></script>
</body>
</html>
"""

def page(g):
    url = f"{SITE}/guides/{g['slug']}"
    related = "".join(
        f'<li><a href="/guides/{o["slug"]}">{html.escape(o["h1"])}</a></li>'
        for o in GUIDES if o["slug"] != g["slug"])
    how = "".join(f"<li>{html.escape(h)}</li>" for h in g["how"])
    sources = ""
    if g["sources"]:
        items = "".join(
            f'<li><a href="https://code.dccouncil.gov/us/dc/council/code/sections/{s}">DC Code § {s}</a>: {html.escape(t)}</li>'
            for s, t in g["sources"])
        sources = f'<h2 id="sources">Sources</h2><ul class="sources">{items}</ul>'
    schema = [
      {"@context":"https://schema.org","@type":"Article","headline":g["h1"],"description":g["description"],
       "datePublished":UPDATED_ISO,"dateModified":UPDATED_ISO,"mainEntityOfPage":url,
       "author":{"@type":"Organization","name":"ONE two","url":SITE},
       "publisher":{"@type":"Organization","name":"ONE two","url":SITE,"logo":{"@type":"ImageObject","url":f"{SITE}/onetwo-logo.jpg"}}},
      {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
       {"@type":"ListItem","position":1,"name":"ONE two","item":SITE + "/"},
       {"@type":"ListItem","position":2,"name":"Guides","item":SITE + "/guides"},
       {"@type":"ListItem","position":3,"name":g["h1"],"item":url}]},
    ]
    t = html.escape(g["title"]); d = html.escape(g["description"])
    main = f"""<main>
<section class="hero"><div class="in">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">ONE two</a> / <a href="/guides">Guides</a></nav>
  <div class="eyebrow">{html.escape(g['eyebrow'])}</div>
  <h1>{html.escape(g['h1'])}</h1>
  <p class="upd">For Washington, DC condo boards · Updated <time datetime="{UPDATED_ISO}">{UPDATED}</time></p>
</div></section>
<article class="article">
  <div class="answer"><div class="lbl">The short answer</div><p>{g['answer']}</p></div>
{g['body']}
  <aside class="how">
    <h2>How ONE two helps</h2>
    <ul>{how}</ul>
    <div class="ctas"><a class="btn btn-red" href="/login?create=1" data-cta="guide-{g['slug']}">Start your free <span data-trial-days>21</span> day trial</a><a class="btn btn-ghost" href="/#pricing">See pricing</a></div>
  </aside>
  {sources}
  <nav class="related" aria-label="More guides"><h2>More guides for DC condo boards</h2><ul>{related}</ul></nav>
  <p class="disclaimer">This guide is general information about DC condominium rules, not legal advice. Your declaration and bylaws may add requirements; for a specific situation, ask the association's attorney.</p>
</article>
</main>"""
    return shell(t, d, url, schema, main, og_title=g["h1"])

INDEX_CSS = """
.article .cards{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-direction:column;gap:14px}
.cards a{display:block;text-decoration:none;color:inherit;background:#ffffff;border:1px solid #e3e8ee;border-radius:12px;padding:22px 24px;transition:border-color .15s}
.cards a:hover{border-color:#155E75}
.cards .k{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#155E75}
.cards h2{font-size:22px;line-height:1.25;color:#0D1B2E;margin:6px 0 8px}
.cards p{font-size:15.5px;line-height:1.6;color:#4b5a6b;margin:0}
.intro{padding-top:36px}
"""

def index_page():
    url = f"{SITE}/guides"
    cards = "".join(
        f'<li><a href="/guides/{g["slug"]}"><span class="k">{html.escape(g["eyebrow"])}</span>'
        f'<h2>{html.escape(g["h1"])}</h2><p>{html.escape(g["description"])}</p></a></li>'
        for g in GUIDES)
    schema = [
      {"@context":"https://schema.org","@type":"CollectionPage","name":"Guides for DC condo boards","url":url,
       "description":"Plain-language guides for Washington, DC condo boards running their own building.",
       "hasPart":[{"@type":"Article","headline":g["h1"],"url":f"{SITE}/guides/{g['slug']}"} for g in GUIDES]},
      {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
       {"@type":"ListItem","position":1,"name":"ONE two","item":SITE + "/"},
       {"@type":"ListItem","position":2,"name":"Guides","item":url}]},
    ]
    main = f"""<main>
<section class="hero"><div class="in">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">ONE two</a> / Guides</nav>
  <div class="eyebrow">Guides</div>
  <h1>Guides for DC condo boards</h1>
  <p class="upd">Plain answers for boards running their own building in Washington, DC · Updated <time datetime="{UPDATED_ISO}">{UPDATED}</time></p>
</div></section>
<div class="article intro">
  <ul class="cards">{cards}</ul>
  <aside class="how">
    <h2>Run the building without a manager</h2>
    <p style="margin:0 0 22px">ONE two does the manager's job for DC condo buildings: what is due, the meetings, the books, the repairs and the records. $179 a month after a 21 day free trial.</p>
    <div class="ctas"><a class="btn btn-red" href="/login?create=1" data-cta="guides-index">Start your free <span data-trial-days>21</span> day trial</a><a class="btn btn-ghost" href="/#pricing">See pricing</a></div>
  </aside>
</div>
</main>"""
    return shell("Guides for DC Condo Boards | ONE two",
                 "Plain-language guides for Washington, DC condo boards: reserve studies, leaving a property manager, and what condo management costs.",
                 url, schema, main, og_type="website", og_title="Guides for DC condo boards", extra_css=INDEX_CSS)

os.makedirs(OUT, exist_ok=True)
for g in GUIDES:
    with open(os.path.join(OUT, g["slug"] + ".html"), "w") as f:
        f.write(page(g))
    print("wrote", g["slug"])
with open(os.path.join(OUT, "index.html"), "w") as f:
    f.write(index_page())
print("wrote index")
