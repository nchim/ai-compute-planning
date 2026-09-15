# Source Archive

Original source files worth keeping for later reference — PDFs, spreadsheets, decks, and any
primary documents (pro formas, cost models, analyst reports, government filings).

Per-topic supporting docs live inside each `topics/NN-slug/` folder. Cross-cutting artifacts and
the master log live here.

## Archived (downloaded to this folder)

| File | Title / description | Publisher | Date | Topic(s) | URL |
|------|--------------------|-----------|------|----------|-----|
| `mitsui-copackaged-optics-2026.pdf` | Co-packaged optics report (6 pp) | Mitsui & Co. GSSI | 2026-04 | 16 | https://www.mitsui.com/mgssi/en/report/detail/__icsFiles/afieldfile/2026/04/01/2601bt_tsuji_e.pdf |
| `Data-Center-Development-Model-v1.7.zip` | A.CRE DC Development Model (.xlsm + packaged skill) — user-supplied reference L0 parcel underwriter; teardown in `topics/01-lifecycle-pro-forma/reference-model-teardown.md` | Adventures in CRE | 2026-09 | 01 | user-supplied |

## Flagged for later download (priority artifacts — mostly paywalled/gated)

Pro formas & cost models (highest value for tool-building):
- **SemiAnalysis AI Cloud TCO Model** — flagship TCO/cost-per-token model, likely downloadable calculator (paid): https://semianalysis.com/ai-cloud-tco-model/
- **SemiAnalysis Datacenter Industry Model** (paid): https://semianalysis.com/datacenter-industry-model/
- **Thunder Said Energy — "Data centers: the economics"** (downloads page, likely spreadsheet): https://thundersaidenergy.com/downloads/data-centers-the-economics/
- **Flevy — Data Center Financial Model** (XLSX, paid): https://flevy.com/browse/marketplace/data-center-financial-model-9441
- **Flevy — Data Center Development 10-Year Financial Model** (XLSX, paid): https://flevy.com/browse/marketplace/data-center-development-10-year-financial-model-9164
- **Flevy — Data Center DCF & Valuation Model** (XLSX, paid): https://flevy.com/browse/marketplace/data-center-dcf-and-valuation-financial-model-10-year-dcf-and-valuation-9374
- **Axis Intelligence — AI DC Cost per MW Dashboard** (interactive): https://axis-intelligence.com/wp-content/dashboard/ai-data-center-cost-per-mw-dashboard.html

Market / analyst reports:
- **Activant Capital — The Rise of Neoclouds** (PDF deck): https://activantcapital.com/pdfs/3-the-rise-of-neoclouds-activant-capital.pdf
- **Uptime Institute 2026 Global DC Survey** (exec summary free; full paywalled): https://uptimeinstitute.com/resources/research-and-reports/uptime-institute-global-data-center-survey-results-2026  *(direct supplier-view PDF attempted; came back gated — needs manual/authenticated download)*
- **SemiAnalysis — H100 vs GB200 NVL72 Training Benchmarks**: https://newsletter.semianalysis.com/p/h100-vs-gb200-nvl72-training-benchmarks
- **SemiAnalysis — GB200 Hardware Architecture & BOM**: https://newsletter.semianalysis.com/p/gb200-hardware-architecture-and-component
- **MaxLife — Data Center Cap Rates 2026**: https://maxlifedevelopment.com/blog/data-center-cap-rates-2026
- **datacenterHawk — Colocation Pricing Guide 2026**: https://datacenterhawk.com/resources/fundamentals/colocation-data-center-pricing-a-2026-beginner-s-guide
- **HBR case — Meta: Accounting for AI Data Center Depreciation** (paid): https://store.hbr.org/product/meta-accounting-for-ai-data-center-depreciation/126034

Primary / government sources:
- **NVIDIA FY2026 10-K & 10-Q** (supply-risk disclosures) — SEC EDGAR
- **BIS Federal Register rule** adding UAE to Country Group A:5 (Jul 2026) — federalregister.gov
- **PJM 2025–26 capacity auction results** — pjm.com
- **Gallup (Mar 2026)** — poll on data center opposition
- **Paces white paper** — "The grid is planning for data centers that will never exist"
- **Presenc AI** — Hyperscaler Nuclear PPA Tracker & Sovereign AI Infrastructure Tracker (check for datasets)

## Wave 2 deep-dive primary sources (free/public — high value)

Pro forma backbone & validation:
- **Epoch AI — "Total cost of ownership of a one-gigawatt AI data center"** (best free granular
  capex/opex breakdown; backbone of our reconstructed pro forma): https://epoch.ai/data-insights/ai-datacenter-cost-breakdown
- **Digital Realty Q2 2026 IR release / 8-K** — discloses 10.6–12.3% stabilized development yields
  (rare real pro-forma-style metric)
- **CoreWeave Q2 2026 earnings** — only public pure-play compute-seller financials (56% adj. EBITDA,
  $104B backlog, net loss)

Depreciation — primary SEC filings (direct EDGAR URLs):
- Amazon 10-Q Q3 FY2025 (the 6→5 yr *reversal*): https://www.sec.gov/Archives/edgar/data/1018724/000101872425000123/amzn-20250930.htm
- Meta 10-K FY2025 (4–5→5.5 yr): https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm
- Oracle 10-K FY2025 (5→6 yr): https://www.sec.gov/Archives/edgar/data/1341439/000095017025087926/orcl-20250531.htm
- Microsoft 10-K FY2025 (2–6 yr range): https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/msft-20250630.htm
- Alphabet 10-K FY2023 (servers 4→6 yr, largest disclosed effect) — SEC EDGAR
- CoreWeave $8.5B GPU-backed financing release: https://investors.coreweave.com/news/news-details/2026/CoreWeave-Closes-Landmark-8-5-Billion-Financing-Facility-Achieving-First-Investment-Grade-Rated-GPU-backed-Financing/default.aspx

Power markets (free primary): EIA, ERCOT filings, PUCT docket (Texas audit), Governor of Texas
Aug-3-2026 directive, PJM queue reports, NEI (nuclear) — URLs cited inline in
`topics/06-power-energy/power-market-economics-deep-dive.md`.
