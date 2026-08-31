# Getting ESV and/or NIV into Lantern — every legitimate route

Status: **research only, no application code.** Written 2026-08-30. Every
external fact below carries a source URL and the date it was checked. Anything
that could not be verified from a primary source is labelled **unverified**
rather than asserted.

This builds on `docs/proposals/translations-esv-niv.md` (2026-07-22) and does
not repeat it. That brief answered "what do the terms say"; this one answers a
different question: **what are all the ways Dennis could actually end up with a
durable right to ship ESV and/or NIV, and which one should he try first.** It
does not re-open the settled rejections recorded there (API.Bible, the
YouVersion Platform Biblica fast-track, NET on helloao).

**Constraint, and this brief fails if it breaks it: legitimate routes only.**
Nothing here proposes exceeding a cache cap, ignoring an attribution or FUMS
requirement, misrepresenting what Lantern is, or relying on a publisher not
noticing. Crossway revokes at its sole discretion and has done it: in 2019 it
asked CrossWire to stop distributing the ESV through SWORD, which is why And
Bible had to remove ESV
([sword-devel, June 2019](https://www.crosswire.org/pipermail/sword-devel/2019-June/047095.html);
[AndBible issue #390](https://github.com/AndBible/and-bible/issues/390), both
checked 2026-08-30). Biblica did the same to open-source apps: it "initially
permitted open-source Bible apps free access but subsequently reversed course,
demanding licensing fees", forcing projects to remove the NIV
([The Other Cheek, 2023-12-03](https://theothercheek.com.au/bible-publishers-stewards-or-gatekeepers/),
checked 2026-08-30). A route that depends on nobody looking is not a route.

## Corrections after live verification (2026-08-31)

Two of this brief's findings were checked against the live sites the day after
it was written, and both need amending. The brief's reasoning holds; two of its
facts do not. Read this section before acting on Routes 2, 3, 4 or 6.

### Route 6 (Bible Society Australia) is a dead end — print rights only

The brief called this "the most interesting finding". It is half right, and the
half that is wrong is the half that mattered.

BSA **does** hold an Australian NIV licence: their own publishing page lists
NIV editions they publish (NIV Thinline, NIV Bicentennial Edition, NIV
Bicentenary Gospel of Luke — biblesociety.org.au/publishing/, checked
2026-08-31). But that is a **print publishing** licence. Nothing anywhere on
biblesociety.org.au mentions permissions, rights, copyright licensing, or
digital text licensing, and their only contact is a general enquiries address
(bibles@biblesociety.org.au).

Biblica's actual NIV territory split is HarperCollins Christian (US/Canada),
Hodder & Stoughton (UK/EU/EFTA), and **Biblica Inc. directly for the rest of
the world**. Australia sits in that last bucket, and Biblica's Terms of Use §6
routes every above-guideline permission request to their Rights and Permissions
Administrator with no regional carve-out.

**So Biblica is the only NIV route, not a parallel one.** Their permission
request form (biblica.com/permission-request-form/, live 2026-08-31) has a
dedicated Section 6, "Electronic Use of Biblica's Bible Texts and Audios",
which is the correct intake. Writing to BSA first would at best be forwarded.

### Route 2 (apply to Crossway as an individual) is not a long shot, it is an
### automatic decline

The brief recommended emailing `licensing@crossway.org` first and treated the
individual-versus-organisation question as genuinely open. The live ESV Digital
Licensing Proposal form settles it. Its first field carries this note, verbatim
(read 2026-08-31):

> *Note on Eligibility: Please ensure you are applying on behalf of a formal
> organization or ministry. As a matter of policy, we do not license to
> individuals; such requests will be automatically declined.*

The form also requires a **Legal Organization Name**, a **History of
Organization**, and a **Signatory for the Company or Organization** with a
named Position. There is no path through it for a person.

Consequences:

- **Do not submit the form as an individual.** A declined application is worse
  than none: it spends the first contact and puts the "no" on record.
- The email to Crossway should therefore ask an **eligibility question**, not
  make an application: which entity form would qualify, and is offline caching
  even grantable to a small licensee. Ask before registering anything, so that
  if an entity is ever formed it is the right one.
- The wording is **"organization or ministry"**, not "company". In Australia
  that points at an **incorporated association** (the standard small
  not-for-profit structure, cheaper to run than a Pty Ltd) rather than the
  Pty Ltd the brief costed. Ask about that specifically.
- The form also asks **"Will your digital platform or application incorporate
  or use any form of Artificial Intelligence (AI) technology?"** Biblica has an
  equivalent requirement. Given the deep-dive roadmap, answer this by
  describing intent (no AI-authored interpretation of scripture, no training on
  the text) rather than ticking a box, or a granted licence may not cover what
  gets built later.

### One thing the live check found in Lantern's favour

api.esv.org states plainly (read 2026-08-31):

> "While the ESV API is primarily recommended for website integration... its
> use in mobile apps or other digital media is permitted **without formal
> permission**, provided all general conditions stated above are met."

So Lantern being a PWA is explicitly fine as it stands. Nothing about the
current integration is in a grey area. **The only thing that needs a licence is
exceeding the caps** — which is exactly the offline ask, and nothing else.

### Where this leaves the recommendation

The brief's ranked first move (ask Crossway before spending anything) survives,
with its purpose changed from "apply" to "establish eligibility". Everything
else is unchanged: Lantern stays free, ESV stays live and lawful, and no entity
is formed until an answer makes clear it would buy something specific.

**Decision recorded 2026-08-31:** Dennis is not sending the Crossway or Biblica
enquiries at this stage, judging the organisation-shaped intake unlikely to go
anywhere for a solo developer. Only the peer enquiry to Harvous
(derek@harvous.com) was sent. This section stands as the record of what the
routes actually are, if and when that changes.

## Where Lantern actually stands today

ESV is **already live in production** on Crossway's free `api.esv.org` tier,
behind the `esv-proxy` edge function, with a size-bounded LRU cache and the
required attribution (`docs/BACKLOG.md`, "ESV provider — LIVE in prod"). So the
real question is not "can we get ESV" but two sharper ones:

1. **Does the free tier survive Lantern ever charging for anything?** Short
   answer below: on the plain reading, no.
2. **If Dennis needs the licensed tier, can he even be a licensee?** Crossway's
   published policy says it licenses to organizations, not solo developers.

NIV is not built and is the harder of the two by a wide margin.

## The stance, up front

- **Do this first: email `licensing@crossway.org` as an individual, this week.**
  It costs nothing, commits nothing, and it is the only move that turns the
  entity question from speculation into a written answer. Every other ESV route
  branches off that reply. Draft email is in [Section 5](#5-three-emails-ready-to-send).
- **Do not spend money on an entity before that reply.** A Pty Ltd is $636 to
  register plus $342 every year, forever, and right now nobody knows whether
  Crossway's test is entity *form* or something else. Buying a company to answer
  a question you can ask for free is the wrong order.
- **The free tier and money do not mix, on the plain reading of the terms.**
  Crossway defines a non-commercial site as one that "does not charge for access
  to any part of the site". A Harvous-style paid tier anywhere in Lantern
  probably takes the whole app out of the free grant, not just the paid feature.
  A pure donate button is a genuinely closer call and is worth asking about in
  the same email.
- **NIV has a specifically Australian angle nobody has tried.** The
  Australian NIV licence sits with the local Bible Society, not Biblica direct
  ([The Other Cheek](https://theothercheek.com.au/bible-publishers-stewards-or-gatekeepers/)).
  That is a better first knock than Biblica's 49-field form.
- **If ESV plus money turns out to be closed, NLT is the substitute that
  survives.** Tyndale's `api.nlt.to` is free for non-commercial use and has a
  stated commercial path you simply explain at signup. It is the softest terms
  of any copyrighted translation checked here, and NLT is familiar to the same
  churchgoers who read NIV.

Full ranking in [Section 7](#7-the-recommendation-and-the-one-thing-to-do-first).

## 1. The eight routes

Each route below answers the same six questions. "Offline caching" means: does
this route let Lantern keep chapter text on the device the way it does for BSB?
That matters because Lantern's whole scripture architecture (cache-forever plus
a self-hosted bundle fallback) is legal only because BSB is public domain.

### Route 1 — Stay on the free `api.esv.org` tier, and keep Lantern free at every point

**What it is.** The status quo, made deliberate: ESV keeps working, and Lantern
never charges for any part of itself while ESV is in the app. Donations, if any,
handled only after the question in Route 2 comes back.

**Exact obligations** (all quoted from [api.esv.org](https://api.esv.org/),
checked 2026-08-30):
- "A non-commercial site does not charge for access to any part of the site.
  Further, no charge is made for access to the ESV text."
- "You may request up to 500 verses per query, or half a book, whichever is
  less."
- "You may not locally store more than 500 verses or one-half of any book."
- "You can cache up to 500 verses. We encourage you to periodically clear out
  your cache."
- "You may only perform 5,000 queries per day, with no more than 1,000 requests
  in an hour and no more than 60 requests per minute."
- "Each page on which you use the text must include a link to www.esv.org", plus
  the copyright notice.
- The key may not be sold, shared or published, which is why `esv-proxy` exists.

**Cost.** $0.

**Likelihood of success.** Already succeeded. It is running in production.

**What it requires from Dennis.** A standing decision that Lantern stays free
while ESV is in it, and a note in the backlog so a future monetisation idea
trips over this rather than discovering it late.

**Offline caching permitted?** Bounded only. 500 verses or half a book, which is
what the current LRU cache implements. A full-Bible ESV prefetch or a
self-hosted ESV bundle is flatly out, now and under every route below except a
negotiated licence that specifically grants it.

**Honest risk.** The rate limits are per application, shared across every
Lantern user. Fine at today's scale, and the metering in `esv_api_usage` is what
tells you when it stops being fine.

### Route 2 — Crossway's ESV Digital Licensing Proposal, applying as an individual

**What it is.** Ask Crossway directly for a licence broader than the free tier,
as Dennis, a person. Two entry points, both live as checked 2026-08-30:
- The proposal form linked from api.esv.org:
  [crosswaygnp.formstack.com/forms/esv_digital_licensing_proposal](https://crosswaygnp.formstack.com/forms/esv_digital_licensing_proposal)
  (title confirmed: "ESV Digital Licensing Proposal"; the field list did not
  render for this pass, so treat its contents as **unverified**).
- `licensing@crossway.org`, given on the same page for uses that exceed the
  guidelines.
- Separately, the [ESV Digital Permission Request Form](https://www.crossway.org/permissions/digital/)
  explicitly asks "Are you an individual or a company?" and appears to accept
  both. It asks for product type, title, audience, what percentage of the total
  text is ESV, verse counts, and which books are included. No fee is stated
  anywhere on it.

**Exact obligations.** Unknown until they reply. Whatever the licence says, plus
the attribution and key-handling rules, which no route removes.

**Cost.** $0 to ask. Licence fee, if offered, unpublished. **Unverified:** no
public price list for ESV digital licensing was found.

**Likelihood of success.** Low-to-moderate for a full commercial licence, given
the published policy quoted in Route 3. Moderate-to-high for a *useful answer*,
which is the actual point of this route. The permission form's own
individual/company field is real evidence that individuals are at least allowed
to ask.

**What it requires from Dennis.** Twenty minutes and one email.

**Offline caching permitted?** Only if the licence says so. Ask explicitly, in
those words, because the free tier's 500-verse storage cap is the single
biggest constraint on what Lantern can build.

### Route 3 — The same request, as an Australian sole trader with an ABN

**What it is.** Register for an ABN (free, through the ABR) and optionally a
business name with ASIC, then apply as "Lantern, a registered business in
Australia" rather than as a private individual.

**The obstacle, quoted verbatim** from [api.esv.org](https://api.esv.org/)
(checked 2026-08-30): **"Our policy is to license to organizations, not to
individuals or solo developers."**

**Exact obligations.** Same as Route 2, plus the ordinary obligations of an ABN:
you must actually be carrying on an enterprise to be entitled to one, and a
registered business name must be renewed. Nothing about an ABN changes the ESV
attribution, key-handling or storage rules.

**Cost** (all Australian, current):
- ABN: free. "It's free to register for an ABN through the Australian
  Government's Australian Business Register (ABR)"
  ([business.gov.au](https://business.gov.au/registrations/register-for-an-australian-business-number-abn),
  checked 2026-08-30).
- Business name with ASIC: **$47 for one year or $108 for three years**,
  2026-27 financial year.
- No annual review fee, no separate tax return, no accounts to lodge.

**Likelihood of success.** This is the crux, and it is honestly unresolved. See
[Section 3](#3-does-a-sole-trader-with-an-abn-count-as-an-organization) for the
full reasoning. The short version: an ABN sole trader is **not a separate legal
person**. The licensee would still be Dennis personally, trading under a name.
If Crossway's test is really about entity *form*, a sole trader does not clear
it. If the test is about looking like a real, contactable, accountable operation
rather than a hobbyist, it might.

**What it requires from Dennis.** Under an hour and under $50. Genuinely cheap,
but do it *after* Route 2's reply, not before, so the reply tells you whether it
is even the right shape.

**Offline caching permitted?** Same as Route 2. Whatever the licence grants.

### Route 4 — A Pty Ltd, or a state incorporated association

**What it is.** Create an actual separate legal person that can hold the
licence. Two forms worth considering, with very different characters.

**Exact obligations.** Whatever licence Crossway grants, plus the standing
obligations of the entity itself: for a company, an annual review and a company
tax return; for an incorporated association, a committee, a constitution, an
annual general meeting and an annual statement lodged with the state regulator.
These are permanent, and they continue whether or not the ESV licence is ever
granted.

**Cost.** See the two options below. Route 4a is $636 up front and $342 every
year thereafter; Route 4b is under $250 in either state worked below, with much
heavier non-monetary obligations.

**Option 4a, Pty Ltd** (a company; the closest Australian analogue to the US LLC
that Harvous trades through):
- Registration: **$636**, 2026-27.
- Annual review fee: **$342**, every year, whether or not the company trades.
- Source: [Mira Legal's ASIC fee guide for 2026-27](https://mirailegal.au/guides/asic-fees),
  checked 2026-08-30, citing Corporations (Fees) Regulations 2001 (Cth)
  Schedule 2 and Business Names Registration (Fees) Regulations 2022 (Cth)
  Part 2, effective 1 July 2026 to 30 June 2027. **Caveat on sourcing:**
  ASIC's own fee pages
  ([asic.gov.au fees](https://asic.gov.au/for-business/payments-fees-and-invoices/asic-fees/))
  render their dollar figures as unresolved template placeholders when fetched,
  so these numbers come from a secondary legal source that cites the
  regulations rather than from ASIC directly. Confirm on ASIC's site before
  spending.
- Real ongoing cost is higher than the fees: a company tax return, ASIC
  compliance, and almost certainly an accountant. Budget more than $342/year in
  practice.

**Option 4b, incorporated association** (a not-for-profit body, state
registered; a plausible fit if Lantern is genuinely a ministry rather than a
business):
- **NSW**, as at 1 July 2026
  ([nsw.gov.au](https://www.nsw.gov.au/business-and-economy/incorporated-associations/incorporated-associations-forms-and-fees),
  checked 2026-08-30): registration (Form A2) **$220**, or **$171** if the name
  was reserved first. Annual summary of financial affairs: **$59** for a Tier 2
  (small) association, $250 for Tier 1 (large).
- **Victoria**, 2026-27
  ([consumer.vic.gov.au](https://www.consumer.vic.gov.au/clubs-and-fundraising/incorporated-associations/fees-and-forms),
  checked 2026-08-30): incorporation **$86.40** using the model rules, $518.10
  with your own rules. Annual statement lodgement $51.80 (Tier 1), $103.60
  (Tier 2), $207.20 (Tier 3). GST exempt, indexed each 1 July.
- **Unverified:** the tier definitions differ between states and were not
  checked, and Dennis's state is not recorded anywhere in this repo, so treat
  NSW and Victoria as the two worked examples rather than the answer.
- **The catch that matters more than the fee:** an incorporated association
  needs a committee and a minimum number of members (typically five in most
  states), an annual general meeting, and a constitution. It is not a solo
  vehicle. Lantern would have to become a small organisation with other real
  people in it. That is a life decision, not an admin one.

**Likelihood of success.** Highest of the ESV routes if, and only if, Crossway's
test is entity form. A Pty Ltd is unambiguously an organization in the plain
sense, and it is the same shape as Testament Made LLC, which does ship ESV
(see [Section 2](#2-how-peer-indie-developers-actually-did-it)).

**What it requires from Dennis.** $636 plus $342/year and an accountant (4a), or
finding four other people and running a committee (4b). Both are real
commitments. Neither is worth making before Route 2 answers.

**Offline caching permitted?** Only what a negotiated licence grants. Being a
company does not by itself lift the 500-verse storage cap.

### Route 5 — Biblica's non-commercial permissions path for NIV

**What it is.** Apply directly to Biblica, the NIV rights holder, for permission
to use the NIV in a free non-commercial app.

**Sourcing caveat, stated plainly:** `biblica.com` and `biblicaeurope.com` both
returned HTTP 403 to this runner, exactly as they did to the 2026-07-22 brief.
Everything below is corroborated across multiple independent search results and
secondary sources rather than read from the primary page, and is therefore
**partly unverified**. Re-check on a normal browser before acting.

**Exact obligations, as best established:**
- Blanket allowance without applying: up to 500 verses, provided they are not a
  complete book and do not amount to 25% or more of the total text of the work
  quoting them. Written for quoting inside another work, not for an app whose
  purpose is serving the whole translation, which is the same ambiguity the
  earlier brief flagged and it is still unresolved.
- Required notice: "Scripture quotations taken from the Holy Bible, New
  International Version®, NIV® Copyright © 1973, 1978, 1984, 2011 by Biblica,
  Inc. Used with permission."
- Anything beyond that goes through the
  [Permission Request Form](https://www.biblica.com/permission-request-form/),
  which reportedly has "49 fields to fill out, including one for your
  'distribution and marketing strategy'"
  ([The Other Cheek](https://theothercheek.com.au/bible-publishers-stewards-or-gatekeepers/),
  2023-12-03, checked 2026-08-30).
- **Biblica reportedly does not license products still in development.** You
  submit once the product is complete. Lantern is live, so this is survivable,
  but it means "we're building an app, can we have NIV" is the wrong opening.

**Cost.** $0 to apply. Fee, if any, unpublished for non-commercial use.

**Likelihood of success.** Low. Not because the app is unworthy, but because the
process is heavy, subjective, written for publishers, and Biblica has a public
record of reversing a permissive stance toward open-source apps.

**What it requires from Dennis.** A 49-field form and patience, plus a finished
product to point at, which he has.

**Offline caching permitted?** No published storage cap distinct from the
500-verse per-query figure was found, same gap the earlier brief hit. Assume no
meaningful offline caching, and ask explicitly.

### Route 6 — Bible Society Australia, the regional NIV licence

**What it is.** The Australian-specific route, and the most interesting finding
in this brief. NIV licences for Australia, New Zealand and South Africa are
reportedly held by the **local nonprofit Bible Societies**, not by Biblica
directly: "Australian, New Zealand, and South African NIV licenses remain with
local nonprofit Bible Societies, enabling direct purchasing"
([The Other Cheek](https://theothercheek.com.au/bible-publishers-stewards-or-gatekeepers/),
2023-12-03, checked 2026-08-30). Bible Society Australia is a real, contactable
Australian nonprofit rather than a US publisher's rights desk.

**Exact obligations.** Unknown. **Unverified:** Bible Society Australia's own
[terms and conditions](https://www.biblesociety.org.au/terms-and-conditions/)
(checked 2026-08-30) cover their website content, not third-party NIV
licensing, and no public NIV developer-licensing page was found. Corroborating
evidence points the other way too: general permissions guidance says commercial
NIV use *outside* North America, the UK and Europe should be applied for from
Biblica, Inc. So it is genuinely unclear whether the local Bible Society holds
digital app rights or only print and distribution rights.

**Cost.** $0 to ask.

**Likelihood of success.** Unknown, and that is exactly why it is worth ten
minutes. It is the only NIV route where the counterparty is Australian, a
nonprofit, and plausibly sympathetic to a free study app made by an Australian.

**What it requires from Dennis.** One email, sent alongside the Biblica one, not
instead of it. If Bible Society Australia does not hold the right, they will say
so and probably point at who does, which is itself worth having.

**Offline caching permitted?** Unknown until asked.

### Route 7 — Tyndale's `api.nlt.to` (NLT) as a familiar substitute

**What it is.** Not ESV and not NIV, but the closest thing to either in terms of
who actually reads it, and by far the least hostile terms of any copyrighted
translation checked here. NLT is a mainstream church translation; a friend who
reads NIV will not be lost in it.

**Exact obligations**, quoted from [api.nlt.to](https://api.nlt.to/) (checked
2026-08-30):
- Anonymous use: "No more than 50 verses per request", "No more than 500
  requests per day", "Non-commercial use (please sign up for commercial use
  license)".
- With a key: "No more than 500 verses per request", "No more than 5000 requests
  per day", "Non-commercial use (if your use is commercial, please explain when
  you sign up how you wish to use the API)".
- Both tiers: "You affirm that your use is consistent with
  [Tyndale's purpose](https://www.tyndale.com/purpose)."

**The important difference from Crossway.** Tyndale's commercial path is not a
locked door with a policy against solo developers behind it. It is a field on
the signup form where you explain what you are doing. That is the single most
developer-friendly commercial posture found anywhere in this research.

**Cost.** $0 for the free tier. Commercial terms unpublished, negotiated at
signup. **Unverified:** no price found.

**Likelihood of success.** High for the free non-commercial tier. Unknown but
plausibly reasonable for a small commercial arrangement.

**What it requires from Dennis.** A signup, and the engineering to add a third
translation provider. The `TranslationId` seam and the `esv-proxy` pattern
already exist, so this is the cheapest new provider Lantern will ever add. The
key is application-level, so it needs the same proxy treatment as ESV.

**Offline caching permitted?** **Unverified.** The published terms state
per-request verse limits and daily request limits but say nothing about local
storage. Unlike Crossway, Tyndale has not published a storage cap. Do not read
silence as permission; ask at signup, and until answered, cache no more
aggressively than the ESV rules allow.

### Route 8 — Licence through an existing organisation

**What it is.** Do not become an organisation. Borrow one. Three shapes:

- **Dennis's church.** A church is unambiguously an organization for Crossway's
  purposes, and Crossway's API is explicitly "designed to be used for personal,
  church, and ministry organization use"
  ([api.esv.org](https://api.esv.org/), checked 2026-08-30). If Lantern were
  offered as a ministry of a church, the church could be the applicant.
  **Obligation and real cost:** the church becomes the licensee and therefore
  the accountable party. Lantern's roadmap gets a stakeholder. Any future
  monetisation becomes their decision as much as Dennis's, and unwinding it
  later means re-licensing from scratch.
- **An established Bible-software organisation** carrying the licence and
  Lantern consuming it. Concretely checked, and concretely a dead end for ESV:
  Faithlife's [Biblia API](https://bibliaapi.com/docs/Available_Bibles) no
  longer lists ESV among its 24 versions (checked 2026-08-30), despite older
  developer lists still saying it does, and its
  [terms](https://bibliaapi.com/docs/Terms_of_Use) forbid using the APIs "in a
  commercial product or service that competes with a product or service from
  Logos Bible Software" and forbid extracting content "for storage in an
  alternate database system", which is a caching ban in all but name.
- **A parachurch ministry or Bible society** sponsoring the app the way they
  sponsor other free resources. Same shape as the church option, wider pool,
  slower.

**Exact obligations.** The partner organisation holds the licence and carries
the compliance, so Lantern inherits both their terms and their governance. In
practice that means the app's translation availability depends on a
relationship continuing, and the licence does not travel with Dennis if it ends.

**Cost.** $0 in fees. High in independence.

**Likelihood of success.** Moderate for the church route if Dennis has a real
relationship there. It is the only route that produces an "organization" without
paperwork or money.

**What it requires from Dennis.** A conversation with a pastor or ministry
leader, and a genuine willingness to have Lantern be theirs in some real sense.
Do not do this as a paper fiction to satisfy a licence checkbox. That is
misrepresentation, and it is exactly the sort of thing Crossway revokes over.

**Offline caching permitted?** Whatever the organisation's licence grants.

### Checked and closed

- **SWORD / CrossWire modules.** Crossway asked CrossWire to stop distributing
  the ESV in 2019 and And Bible removed it. Not a route; it is the cautionary
  tale.
- **Faithlife Biblia API for ESV.** No longer carries ESV (above).
- **API.Bible for ESV.** Crossway runs its own API and does not license ESV
  through API.Bible. Independently of the settled rejection, it could not
  supply ESV anyway.

## 2. How peer indie developers actually did it

### Harvous — the closest comparable, and the most useful data point

[harvous.com](https://harvous.com/) (checked 2026-08-30), built solo by Derek
Castelli, trading as **Testament Made LLC**, contact `derek@harvous.com`.

- **Ships 11 English translations**: "KJV, NKJV, ESV, NIV, NLT, NET, BSB, NASB
  1995, CSB, AMP, and MSG." That includes both of the ones Lantern wants, plus
  four more that are individually hard to license.
- **And it charges money.** Free tier gives unlimited notes, scripture pills,
  highlights, threads and mentions. **Harvous Plus is $5/month or $45/year**
  (founding tier $30/year for the first 99 users) and adds Shared Spaces hosting
  for up to 50 people.
- **How the translations are licensed is not published anywhere.** Neither the
  home page nor the about page states a source, an API provider, or per-version
  copyright notices. **Unverified**, and it is the single most valuable unknown
  in this brief, which is why one of the three draft emails goes to Derek.

What can be said with confidence: a **one-person operation trading through an
ordinary single-member LLC** ships ESV alongside a paid tier. That is the exact
shape Dennis would be in as a Pty Ltd. It is strong circumstantial evidence that
Crossway's bar is clearable by a solo developer with a company, and it is the
reason the entity-form hypothesis in Section 3 is plausible rather than
fanciful.

What cannot be said: whether Harvous holds a Crossway licence at all. It may be
running on the free non-commercial tier, in which case the paid Plus tier is in
tension with "does not charge for access to any part of the site" and Harvous
proves nothing about the licensed tier. Ask before concluding.

### SparkBible — a solo developer who simply paid

[Show HN: I made a new kind of Bible app](https://news.ycombinator.com/item?id=27592473),
June 2021. The developer, HN user `theoblank`, shipped a free iOS and Android
Bible app with NIV, ESV, NRSV, KJV and public-domain translations. Asked
directly whether NIV was public domain, he replied:

> "No, from my list I'm currently paying for licensing on the NIV, ESV, and
> NRSV."
> — [comment 27599606](https://news.ycombinator.com/item?id=27599606),
> 2021-06-23, checked 2026-08-30

and earlier in the same thread:

> "Currently I've added ESV, NIV, NRSV, KJV, and a few other public domain
> translations. Getting access to translations has been a challenge due to
> licensing costs."
> — [comment 27593067](https://news.ycombinator.com/item?id=27593067),
> 2021-06-22, checked 2026-08-30

**What this establishes:** a solo developer with a free app did obtain paid NIV
and ESV licences. Paid licensing is available to individuals in practice, at
least as of 2021.

**What it does not establish:** the price, the counterparty, the entity he
licensed through, or whether the same terms are on offer in 2026. He gave no
figures. Treat the 2021 date seriously; both Crossway and Biblica have
tightened since.

### Anyone else

Searched for other indie Bible apps shipping ESV or NIV and did not find a third
with a documented account of how. What the search did establish, and it is worth
recording:

- **ESV is not available through any general Bible API.** Crossway runs
  `api.esv.org` itself and does not wholesale it. Faithlife dropped it.
  API.Bible never had it. There is no back door; Crossway is the only door.
- **NIV commercial use is not available through API.Bible at any tier**, while
  other copyrighted translations there can be licensed commercially from about
  $10/month each through Express Licensing
  ([care.api.bible](https://care.api.bible/article/409-express-licensing-for-commercial-use),
  checked 2026-08-30). NIV is specifically carved out. Any commercial NIV goes
  through Biblica, or possibly through Bible Society Australia (Route 6).

So the peer evidence points one way: **ESV is obtainable by a solo developer;
NIV is the genuinely hard one, and the only person known to have solved it paid
for it in 2021 and did not say how.**

## 3. Does a sole trader with an ABN count as an "organization"?

**Verdict: unresolved from published sources, and it cannot be resolved from
published sources. It has to be asked.**

The policy is one sentence, with no definition attached: "Our policy is to
license to organizations, not to individuals or solo developers"
([api.esv.org](https://api.esv.org/), checked 2026-08-30). Crossway publishes no
test, no examples, and no list of acceptable entity types.

**The prior finding to verify or refute** was that this looks like an entity
*form* test rather than a size test, since Harvous clears it with an ordinary
one-person LLC.

**Assessment: plausible, and better supported than any alternative reading, but
not verified.** For it:

- Testament Made LLC is a single-person company shipping ESV. If the test were
  about size or staff count, a one-person company would fail it just as an
  individual does. The phrasing itself supports this: "individuals or solo
  developers" describes a legal status, not a headcount, and a solo developer
  who incorporates stops being an individual in the only sense a licensing
  agreement cares about, which is who signs.
- Crossway's own [digital permission form](https://www.crossway.org/permissions/digital/)
  asks "Are you an individual or a company?", which is precisely an entity-form
  question, and it accepts both. Permissions and licensing are different
  processes, but the same organisation drew the same line the same way.

Against it, and this is why it stays unverified:

- **It is not established that Harvous has a Crossway licence at all.** If it is
  on the free tier, it is evidence about nothing except the free tier.
- Crossway may apply an unpublished judgement about audience size, revenue or
  distribution that no entity form fixes.

**Where that leaves an Australian sole trader specifically.** An ABN sole trader
is not a separate legal person under Australian law. The person contracting is
Dennis; the business name is a label. If Crossway's test is genuinely about
entity form, **a sole trader with an ABN does not clear it and a Pty Ltd or an
incorporated association does.** If the test is softer, about being a real,
contactable, accountable operation, the ABN plus a registered business name may
well be enough, and it costs $47.

That distinction is worth $636 and $342 a year, so ask before paying.

**The exact question to put to Crossway** (embedded in the Section 5 email):

> Does an Australian sole trader with an ABN and a registered business name
> satisfy your "organizations, not individuals" policy, or do you require a
> separate legal entity such as a Pty Ltd company or an incorporated
> association? If the latter, is a single-director Pty Ltd acceptable, or do you
> require an entity with multiple people involved?

## 4. Can the free tier coexist with a paid feature or a donate button?

**On a paid feature: no, on the plain reading, and it is not a close call.**

The definition is two sentences and both have to hold
([api.esv.org](https://api.esv.org/), checked 2026-08-30):

> "A non-commercial site does not charge for access to any part of the site.
> Further, no charge is made for access to the ESV text."

Note the structure. The second sentence is the one people expect: don't charge
for the Bible text. The first is broader and is the one that bites: **the site
must not charge for access to any part of itself.** A Harvous-style paid tier,
even one that gates only shared workspaces and never touches scripture, is a
charge for access to part of the site. On the plain reading it takes the whole
of Lantern out of the free grant, not just the paid feature.

That is the reading to plan against. It is not the only possible reading, and
Crossway may well take a softer view in practice. But "may well" is not
something to build a business model on, especially given the CrossWire and
Biblica precedents, so get it in writing before building anything charged.

**On a donate button: genuinely unclear, and worth asking in the same email.** A
donation is not a charge for access. Nobody is denied anything for not donating,
which is the ordinary meaning of "charge for access". So a plain, ungated
"support Lantern" link is a much better argument than a paid tier. But Crossway
has not published a position on donations, and their broader stance is
restrictive enough that assuming is unwise.

**The cheapest upgrade path, and what it costs.** There isn't a published one.
There is no self-serve paid tier, no price list, and no documented commercial
plan for `api.esv.org`. The only upgrade path is the negotiated licence in Route
2, at an unpublished price, gated by the organizations-only policy in Section 3.
**Unverified, because Crossway does not publish it.** That is itself the finding:
for ESV, the gap between "free and non-commercial" and "anything else" is not a
price step, it is a conversation.

**The practical consequence for Lantern.** If a paid feature ever becomes real,
there are three honest options and no fourth:

1. Get a Crossway licence first (Routes 2 to 4, or 8).
2. Ship the paid feature and drop ESV, keeping BSB, KJV and, if added, NLT.
3. Keep Lantern free at every point and take donations only, ideally with
   Crossway's written comfort on the donate question.

## 5. Three emails, ready to send

Send the Crossway one first and on its own. The other two can go the same day;
they are independent.

### 5a. To Crossway — `licensing@crossway.org`

**Subject:** ESV licensing question from a solo developer in Australia (Lantern,
lanternword.com)

Hello,

I build and run a free Bible study app called Lantern (lanternword.com). It is a
personal Bible-study notes app: you read a passage, write down what you see in
it, and read your notes back later anchored to the verses. It is a web app and
PWA, I am the only person working on it, and it is free with no ads, no
subscription and nothing behind a paywall.

Lantern already offers the ESV through your free API, using an application key
held server-side, with the required attribution and link to www.esv.org on every
page where ESV text appears, and with local caching kept inside the 500 verse
limit. I want to keep it that way, so I would rather ask you two questions now
than get them wrong later.

1. Your API terms say your policy is to license to organizations, not to
individuals or solo developers. I am in Australia. Does an Australian sole
trader with an ABN and a registered business name satisfy that policy, or do you
require a separate legal entity such as a Pty Ltd company or an incorporated
association? If a separate entity is required, is a single-director Pty Ltd
acceptable, or do you expect an organisation with several people involved? I ask
because registering a company here costs money every year and I do not want to
do it if it would not actually change your answer.

2. Your terms define a non-commercial site as one that does not charge for
access to any part of the site. If Lantern stayed free to use in full, with the
ESV always free, but had a "support this app" donation link, would that still
count as non-commercial under your terms? And separately, if I ever charged for
an unrelated feature that did not touch scripture at all, would that end my
eligibility for the free tier?

If the answer to either is that I would need a licence, I would be glad to hear
what that involves and what it costs.

Thank you for making the ESV available the way you do. It is the translation
most of the people I would share this with actually read.

Dennis
lanternword.com

### 5b. To Biblica — via biblica.com/permission-request-form/, or by email

**Subject:** NIV permission request for a free non-commercial Bible study app
(Lantern)

Hello,

I am writing to ask about permission to include the NIV in a free Bible study
app I built and run on my own, called Lantern (lanternword.com).

Lantern is a personal Bible-study notes app. You read a passage, write down
observations, historical context, application and personal reflection, and read
those notes back later anchored to the verses you wrote them against. It is a
web app and PWA. It is finished and live rather than in development. It is free
in full, there is no paid tier, no advertising, and no data is sold. I am one
person in Australia and this is not a business.

Today Lantern offers the Berean Standard Bible, the King James Version and the
ESV. The reason I am writing is simple: most of the people I would like to share
it with read the NIV, and an app that cannot show them the translation they
actually use is much less useful to them.

Concretely, I would want to display NIV chapter text to a signed-in reader, one
chapter at a time, fetched over an API rather than bundled with the app, with
the copyright notice shown wherever NIV text appears. I would follow whatever
caching limit you set, including no local caching at all if that is what you
require.

Could you tell me whether that use is licensable, what the process is, and what
it would cost? If a full permission request form is the right next step I am
happy to complete it. I would also like to know your position on storing
scripture text on a user's device for offline reading, since I would rather
design to your answer than assume.

Thank you for your time.

Dennis
lanternword.com

### 5c. To Derek Castelli — `derek@harvous.com`

**Subject:** Founder to founder: how did you license the translations in
Harvous?

Hi Derek,

I am Dennis. I build Lantern (lanternword.com), a free Bible study notes app.
Different shape to Harvous, similar spirit: you read a passage, capture what you
see in it, and your notes stay anchored to the verses.

I have been going in circles on translation licensing and you have clearly
solved something I have not. Harvous ships eleven translations including ESV and
NIV, on a free tier, with a paid tier for Shared Spaces. From the outside that
looks like it should be hard, so I wanted to ask directly rather than guess.

If you are willing to share, three questions:

1. How did you get ESV and NIV? Crossway's free API is non-commercial only, and
   their terms say they license to organizations rather than solo developers, so
   I could not tell whether you are on their free tier or hold an actual
   licence.
2. Did trading as an LLC change how publishers responded to you? I am in
   Australia and trying to work out whether it is worth registering a company
   before I ask, or whether that is beside the point.
3. Did having a paid tier complicate anything with Crossway, given how their
   non-commercial definition is worded?

Completely understand if any of that is confidential or if you would rather not
get into it. Even a "yes it was worth incorporating" or "no, don't bother" would
save me a lot of time. Happy to return the favour if there is anything on my
side that is useful to you.

Thanks for building Harvous, and for keeping the free tier as generous as it is.

Dennis
lanternword.com

## 6. Sources

All checked 2026-08-30 unless noted.

| Source | Used for |
|---|---|
| [api.esv.org](https://api.esv.org/) | ESV API terms, verbatim: non-commercial definition, 500-verse query and storage caps, caching, attribution, rate limits, organizations-not-individuals policy, licensing contacts |
| [crosswaygnp.formstack.com/forms/esv_digital_licensing_proposal](https://crosswaygnp.formstack.com/forms/esv_digital_licensing_proposal) | Existence and title of the ESV Digital Licensing Proposal form (field list unverified) |
| [crossway.org/permissions/digital/](https://www.crossway.org/permissions/digital/) | ESV Digital Permission Request Form: individual-or-company field, requested details, no stated fee |
| [api.nlt.to](https://api.nlt.to/) | Tyndale NLT API terms: anonymous vs key limits, non-commercial default, commercial-by-explanation path |
| [The Other Cheek, 2023-12-03](https://theothercheek.com.au/bible-publishers-stewards-or-gatekeepers/) | Biblica's 49-field permission form; Biblica reversing course on open-source apps; Australian/NZ/South African NIV licences held by local Bible Societies |
| [biblica.com/permission-request-form/](https://www.biblica.com/permission-request-form/) | NIV permission process (site returned 403 to this runner; details corroborated from secondary sources, partly unverified) |
| [biblesociety.org.au/terms-and-conditions/](https://www.biblesociety.org.au/terms-and-conditions/) | Confirms no published NIV developer-licensing terms; Route 6 obligations unverified |
| [harvous.com](https://harvous.com/) and [harvous.com/about](https://www.harvous.com/about) | Harvous: 11 translations including ESV and NIV, free tier, Plus at $5/mo or $45/yr, Testament Made LLC, derek@harvous.com |
| [HN 27599606](https://news.ycombinator.com/item?id=27599606) and [HN 27593067](https://news.ycombinator.com/item?id=27593067), both 2021-06 | SparkBible developer stating he pays for NIV, ESV and NRSV licences |
| [care.api.bible/article/409](https://care.api.bible/article/409-express-licensing-for-commercial-use) | NIV commercial use unavailable; other translations from ~$10/month; context only, API.Bible is a settled rejection |
| [bibliaapi.com Available Bibles](https://bibliaapi.com/docs/Available_Bibles) and [Terms of Use](https://bibliaapi.com/docs/Terms_of_Use) | Faithlife no longer carries ESV; anti-competition and no-alternate-storage clauses |
| [sword-devel June 2019](https://www.crosswire.org/pipermail/sword-devel/2019-June/047095.html), [AndBible #390](https://github.com/AndBible/and-bible/issues/390) | Crossway ending ESV distribution through SWORD; And Bible removing ESV |
| [mirailegal.au/guides/asic-fees](https://mirailegal.au/guides/asic-fees) | ASIC 2026-27 fees: company $636, annual review $342, business name $47/$108 (secondary source citing the fee regulations; ASIC's own pages render placeholders) |
| [nsw.gov.au incorporated associations fees](https://www.nsw.gov.au/business-and-economy/incorporated-associations/incorporated-associations-forms-and-fees) | NSW registration $220 / $171 reserved; annual summary $59 Tier 2, $250 Tier 1 (page updated 1 July 2026) |
| [consumer.vic.gov.au fees and forms](https://www.consumer.vic.gov.au/clubs-and-fundraising/incorporated-associations/fees-and-forms) | Victoria 2026-27: incorporation $86.40 model rules / $518.10 own rules; annual statement $51.80 / $103.60 / $207.20 |
| [business.gov.au ABN registration](https://business.gov.au/registrations/register-for-an-australian-business-number-abn) | ABN is free to register |
| `docs/proposals/translations-esv-niv.md` (read only, unmodified) | Prior licensing analysis this brief builds on |
| `docs/BACKLOG.md` | Current ESV production status, proxy, metering, LRU cache |

## 7. The recommendation, and the one thing to do first

**Try Route 2 first: email `licensing@crossway.org` as an individual, this
week, using the draft in 5a.**

Why that one, ahead of everything else:

- It is the only move that costs nothing and commits nothing while resolving the
  two questions that gate every other ESV route. Until Crossway answers, Routes
  3, 4 and 8 are all guesses about what they want, and one of those guesses
  costs $636 plus $342 a year to make.
- The two questions it asks are the two that actually bind Lantern's future:
  whether Dennis can ever be a licensee, and whether ESV survives Lantern ever
  taking money. Both are currently unanswered, and both get harder to fix the
  later they are discovered.
- Crossway's own permission form already asks whether the applicant is an
  individual or a company and accepts both, so asking as an individual is not
  presumptuous. It is the documented front door.
- ESV is already shipping and already compliant, so this is a conversation
  starting from good standing rather than from an apology. That is the best
  moment to have it.

**Send 5c to Derek Castelli the same day.** It is not a route by itself but it
is the cheapest possible intelligence on every route, from the one person known
to have solved the exact problem in the exact shape Dennis is in. If Crossway is
slow, Derek's answer may arrive first.

**The fallback ladder, in order, if Crossway says no:**

1. **They say an entity is required but a small one is fine.** Register a sole
   trader ABN plus a business name, $47, and re-apply (Route 3). If they then
   say a separate legal person is required, price a Pty Ltd at $636 plus
   $342/year against what ESV is actually worth to Lantern (Route 4a). Do not
   pursue an incorporated association unless Lantern is genuinely becoming a
   ministry with other people in it; the fee is trivial and the governance is
   not.
2. **They say the free tier does not survive any charging.** Then the standing
   decision is Route 1: Lantern stays free at every point while ESV is in it,
   with donations only if their answer allows. Record that in the backlog so a
   future monetisation idea trips over it early.
3. **Dennis wants a paid feature and cannot get an ESV licence.** Add NLT via
   Tyndale (Route 7) and treat it as the familiar-translation substitute. It is
   the least hostile copyrighted source found, the commercial path is a
   conversation rather than a policy wall, and the `esv-proxy` plus
   `TranslationId` seam makes it the cheapest provider Lantern will ever add.
4. **For NIV specifically, send both Route 5 and Route 6.** Bible Society
   Australia first, because it is Australian, nonprofit and unexplored, and
   Biblica in parallel because they are the acknowledged rights holder. Expect
   the answer to be no or to be silence. NIV remains, as the 2026-07-22 brief
   concluded, the hardest of the lot, and nothing found in this pass changes
   that. What did change is that there is now an Australian door to knock on
   that nobody has knocked on.

**And the honest bottom line the constraint demands.** There is a viable way
forward regardless of how these answers land. Lantern already ships ESV
lawfully. If it never charges for anything, it can keep shipping ESV lawfully
forever, at zero cost, today. Everything above is about buying optionality
beyond that, not about rescuing something that is broken.
