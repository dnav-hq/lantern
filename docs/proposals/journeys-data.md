# Journeys data — sources, editorial calls, what's left out

Data work only — no UI. `docs/proposals/map-in-the-story.md` §2.2 concluded that
a drawn journey line is honest only where the text itself lists the route in
order (Numbers 33 — "the free one") or where an editor hand-authors it from the
text, and recommended funding a table of roughly a dozen rather than an
inference engine. This is that table: `scripts/data/journeys.yml` (source),
built by `scripts/build-journeys.mjs` into `public/bible/map/journeys.json`,
checked by `src/utils/journeys.test.ts`. Nothing reads this file yet — the
drawing slice is next (see `docs/BACKLOG.md`).

## Sources

Every journey's place-to-place claim is sourced from the Berean Standard Bible
text shipped in this repo (`public/bible/bsb.json.gz`) — the same translation
the app displays, so a reader who taps through to the verse sees exactly what
justified the line. No atlas was consulted for ROUTE claims; a printed atlas
was consulted only for the general genre reference already in
`map-in-the-story.md` §4 (no image reproduced or traced, per that brief's own
constraint). Place identifications (which modern coordinate a Biblical name
resolves to) are entirely OpenBible's, already shipped in
`public/map/places.json.gz` — this task added no new place data, only picked
among OpenBible's existing candidates where a name is ambiguous (below).

| # | Journey | Text |
|---|---|---|
| 1 | Abram: Ur to Canaan | Genesis 11:31–13:18 |
| 2 | Jacob: to Haran and back | Genesis 28:10–33:18 |
| 3 | Joseph: sold into Egypt | Genesis 37:12–36 |
| 4 | The Exodus, station by station | Numbers 33:5–49 |
| 5 | Joshua: the conquest begins | Joshua 3:1–6:1 |
| 6 | Elijah's flight to Horeb | 1 Kings 18:45–19:8 |
| 7 | Exile to Babylon, and the return | 2 Kings 25:1–21; Ezra 1:1–11 |
| 8 | Jesus's last journey to Jerusalem | Luke 9:51; 17:11–19:41 |
| 9 | Paul's first missionary journey | Acts 13:4–14:26 |
| 10 | Paul's second missionary journey | Acts 15:36–18:22 |
| 11 | Paul's third missionary journey | Acts 18:23–21:17 |
| 12 | Paul's voyage to Rome | Acts 27:1–28:16 |

## Editorial calls

**A leg's `ref` may be a short verse range, not only a single verse.** Numbers
33 needs no interpretation at all — one leg, one verse, both names in it,
which is exactly why the brief calls it free. Narrative journeys (Genesis,
Kings, Luke, Acts) are prose: the departure and arrival are rarely in the same
verse. The rule applied throughout: a range is used only where it describes
ONE continuous, self-contained move and no OTHER place is named in between —
e.g. `Genesis 28:19-29:4` for Bethel → Haran (Jacob leaves Bethel in v19,
resumes travel in 29:1, arrives among "people from Haran" in 29:4; nothing else
happens geographically in between). Where that test fails — a real named
waypoint sits between two points with no verse bridging them — the transition
is left out of `legs` and recorded in `gaps` instead, so the map draws it
dotted rather than a confident line. Two gaps exist today:

- **Samaria/Galilee → Jericho** (Jesus's last journey, Luke 17:11–18:35).
  Luke's travel narrative is explicitly not a list (`map-in-the-story.md` §2.2
  flags this exact case) — teaching material fills the chapters but no place
  is pinned to the route between the Samaria border and Jericho.
- **Cauda → Malta** (Paul's voyage to Rome, Acts 27:17–28:1). The ship ran
  before a storm for fourteen days with no navigation; the text names the
  point it lost control (Cauda) and the point it wrecked (Malta) and is
  silent, on purpose, about everything between.

**Ambiguous place names were resolved by geography and type, not by picking
the first match.** The shipped place bundle disambiguates same-named sites
with a trailing number (`Jericho 1`, `Jericho 2`); several journeys needed a
specific one:

- **Jericho** — `jericho-1` (Tell es-Sultan, OT-era, score 1000) for the
  Exodus/conquest; `jericho-2` (Tell el-Alayiq, the Herodian-era site, score
  1000) for Jesus's journey. Two real cities, not one place used twice.
- **Ur** — `ur-2` ("Ur of the Chaldeans", Tell el-Muqayyar, score 1000) over
  `ur-1` (a broader "region" record, score 703) for the same coordinate.
- **Succoth** — `succoth-2` (Tell el-Maskhuta, in Egypt, near Rameses) for the
  Exodus stop; `succoth-1` (Tell Deir Alla, Transjordan) for Jacob's Succoth
  (Genesis 33:17) — these are two different places that happen to share an
  English name.
- **Red Sea** — `red-sea-3` (Gulf of Suez reading, score 776) over `red-sea-1`
  (a lower-scored record at the same coordinate) and over `red-sea-2` (Gulf of
  Aqaba). This is a live scholarly question (the "Reed Sea" location debate);
  the Gulf-of-Suez reading was picked as OpenBible's higher-confidence
  candidate at that coordinate, not because the question is settled.
- **Kadesh** — `kadesh-barnea` (Ain el Qudeirat, Sinai/Negev, score 864), not
  `kadesh-2` (Tell Nebi Mend, on the Orontes near the Egypt–Hittite battle
  site) — different Kadesh, ruled out on coordinates alone (33 N vs 34.5 N).
- **Mount Hor** — `mount-hor-1` ("on the outskirts of Edom", Numbers 33:37)
  over `mount-hor-2`, which OpenBible identifies with Mount Hermon, 250 km
  north and geographically impossible for this leg.
- **Gilgal, Dibon, Bethel, Rhodes, Riblah** — each has 2–4 numbered records at
  identical or near-identical coordinates (OpenBible carrying multiple
  attestations of the same site); the highest-scoring record at the
  geographically-correct coordinate was used in each case (`gilgal-1`,
  `dibon-1`, `bethel-1`, `rhodes-2`, `riblah-1`). `Syria` is the one tie:
  `syria-1` and `syria-2` share identical coordinates and score, so the choice
  between them is arbitrary and carries no editorial weight.
- **Libnah is the one exception where score alone would have picked wrong.**
  The higher-scored record (`libnah-1`, a Judean city near Lachish) is not the
  Numbers 33 campsite; that one is `libnah-2`, a lower-scored `campsite`-typed
  record down in the Sinai, picked on type and location rather than score.

**Region names stand in for a stop where the text names a region rather than a
city** (`galatia`, `phrygia`, `macedonia`, `greece`, `cilicia`, `syria-1` —
each a real record in the place bundle, typed `region`). This matches how Acts
itself narrates most of the second and third journeys — Luke says "passed
through Phrygia and Galatia," not a city name — so the map will draw through a
region centroid rather than inventing a city stop the text doesn't give.

**Paul's first journey's return leg (Acts 14:21, "returned to Lystra, Iconium,
and Antioch") is split into three legs**, each citing the same verse, rather
than one leg skipping the intermediate cities — those cities are already
journey stops on the outbound leg and the map should draw through them again,
not past them.

**"Joseph to Egypt" is scoped to Genesis 37 only** (his own journey as a
captive: Hebron → Shechem → Dothan → Egypt), not the family's later migration
in Genesis 46 (Jacob, from Beersheba). The latter is a different person's
journey with a different starting point and would double up awkwardly with
the Jacob journey above; if a future pass wants Jacob's own move to Egypt as a
13th journey, Genesis 46:1–7 has clean single-verse legs (Beersheba → Egypt →
Goshen) ready to add.

**The exile and the return from it are one journey, not two**, since the
acceptance brief posed them as a single bullet and the return is the direct
narrative resolution of the exile (Babylon → Jerusalem, Ezra 1:11).

## What was deliberately left out

- **Every other named place in these chapters that isn't itself a leg
  endpoint** — landmarks mentioned in passing (Ai, next to Bethel; the Jabbok,
  crossed near Peniel; Lasea, "near" Fair Havens) are not drawn as separate
  stops. Drawing every incidental place-drop would turn a route into a cloud.
- **A 13th Genesis journey (Jacob's family to Egypt, Genesis 46)** — see
  above; left as a documented, easy follow-up rather than added here, to keep
  "Joseph to Egypt" and "Jacob to Haran and back" each a single person's trip.
- **Any journey needing a place OpenBible doesn't carry** — none of the twelve
  hit this; every place id used here already exists in
  `public/map/places.json.gz`, so no new place data was requested or invented.
- **A machine check that a leg's cited verse actually contains both place
  names.** The build script and test enforce the two invariants the
  acceptance criteria name — every id resolves, every leg has a non-empty ref
  — but do not parse the BSB text to confirm the citation. That would be a
  genuinely useful follow-up test; it wasn't built here because matching a
  place's display name against translated prose reliably (aliases, "Ur of the
  Chaldeans" vs the id `ur-2`, etc.) is a bigger project than this task's
  scope.
