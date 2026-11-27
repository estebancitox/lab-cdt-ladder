# lab / cdt-ladder

A visual calculator for CDT laddering (Colombian term deposits): stagger
maturities across rungs, project interest after withholding tax, and keep an
eye on the deposit-insurance ceiling — React 18 + TypeScript, unit-tested,
deployed by CI.

**Live demo:** <https://estebancitox.github.io/lab-cdt-ladder/>

![The calculator answering "Explain this ladder": the panel's frame traces while it waits, showing what was sent and the seconds elapsed, then the explanation arrives in 4.1 s and reports no risks to flag](demo.gif)

## Why this one has a toolchain

The [portfolio](https://estebancitox.github.io/) and
[lab-instrument](https://github.com/estebancitox/lab-instrument) are
deliberately zero-build: a static page earns no toolchain. This project is the
counterargument from the other side — an interactive calculator with financial
math worth testing _does_ earn one, so it uses the daily production stack:
Vite, React 18, TypeScript, Vitest, GitHub Actions. Knowing which projects
deserve which toolchain is the point.

## How the engine works

A pure TypeScript module (`src/engine/`, no React imports) does all the money
math. Effective annual rates convert to period interest as
`(1 + EA)^(days/base) − 1`, where the liquidation base is selectable: **360
"comercial"** — the convention Colombian CDT certificates state as "Base
liquidación", and the default — or 365. Calendar maturities always count real
days; only the exponent changes. Gross interest rounds to whole COP per rung
as a cash event; withholding (retención en la fuente) is computed on that
rounded gross so every table row reconciles by hand; the blended rate is the
principal×days-weighted average of rung rates. The suite includes
reproduction fixtures against real-world comercial-base figures. Dates are
date-only ISO strings with calendar-day arithmetic — no `Date` millisecond
math, so results are identical in any timezone. The test suite runs twice in
CI (`TZ=America/Bogota` and `TZ=UTC`) to prove it.

## Fiscal parameters are inputs, not facts

Fiscal figures change by decree, so the tool never hardcodes them as current
truth and never claims live market rates. The withholding rate (retención en
la fuente) and the deposit-insurance ceiling are both editable fields labeled
"verifica la tarifa/cobertura vigente". A visible disclaimer says all of this
in the UI. It is a modeling tool, not financial advice.

## Scenarios travel as URLs

"Share" encodes the whole scenario (ladder, entities, allocation, fiscal
parameters, rollover) into a versioned, strictly-validated URL parameter and
copies the link; opening it reproduces the scenario exactly. The last
scenario also persists in localStorage — shared URL wins over saved state,
saved state over defaults. The calculator needs no backend, and there are no
cookies and no analytics: the URL and your browser's storage are the only two
places a scenario lives. The only data that ever leaves the browser is the
scenario, with today's date, that you choose to send with the explanation
button, described below.

## Rollover is a model, not a promise

The optional projection renews each rung at maturity — capital plus net
interest reinvested at the same E.A. — for N renewals or until a horizon
date, pricing a truncated final stub when the horizon lands mid-cycle. Real
renewals reprice; the UI says so. With rollover on, the deposit-insurance
check uses each chain's _highest_ balance — not its last, since withholding
at every maturity means a short final stub can end below an earlier peak —
summed per entity even though chains peak on different dates. Compounding can
cross the ceiling in later cycles even when the first term stays under it, and
the sum is an upper bound: it errs toward warning early, never late.

## An explanation on demand

"Explain this ladder" sends the current scenario — ladder, entities and
fiscal parameters, never the rollover settings — to
[lab-cdt-ladder-api](https://github.com/estebancitox/lab-cdt-ladder-api),
which asks a language model for a plain-text explanation in English, and
renders the reply under the summary readouts. Nothing is sent until the button
is pressed, nothing is retried on its own, and any edit clears the text, so an
explanation never outlives the numbers it describes. The panel says where the
scenario goes before the first click, and every refusal the API can give — a
daily cap per connection, a cap for the demo as a whole, the service being
unavailable — is shown as a message; when the service gave no answer, a
recorded example is offered instead.

## Tests gate the deploy

CI runs install → test → build → deploy with the official
`actions/deploy-pages` flow. The deploy job depends on the build job, and
tests run before the build step inside it: a red test means nothing ships.
No badge — the pipeline is the statement.

## Controls

| Input                              | Effect                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Total principal`                  | Total COP, split near-equally across rungs (the sum is always exact)                                    |
| `Number of rungs`                  | How many CDTs the ladder holds (1–12)                                                                   |
| `Days between maturities`          | Days between one maturity and the next; rung _n_ matures at _n_ × spacing                               |
| `E.A. rate`                        | Effective annual rate applied to every rung — user-supplied, never fetched                              |
| `Day-count basis`                  | Exponent base for the rate conversion: 360 (the commercial year of the CDT certificate, default) or 365 |
| `Start date`                       | Purchase date; maturities and the today line follow it                                                  |
| `Withholding tax`                  | Withholding on interest (retención en la fuente), editable — check the current rate                     |
| `Institutions` / `Rung allocation` | Free-text institutions and per-rung allocation; the insurance ceiling is checked per institution        |
| `Deposit-insurance ceiling`        | Editable coverage ceiling per depositor per institution — check the current figure                      |
| `Renewal`                          | Off, N renewals, or until a horizon date; reinvests principal + net interest at the same rate           |
| `Share`                            | Copies a URL that reproduces the scenario exactly                                                       |
| `Explain this ladder`              | Sends the scenario to lab-cdt-ladder-api and shows its explanation; any edit clears it                  |
| `Reset`                            | Back to defaults; clears the saved scenario                                                             |
| `light / dark`                     | Theme toggle; the instrument plates stay dark in both                                                   |
