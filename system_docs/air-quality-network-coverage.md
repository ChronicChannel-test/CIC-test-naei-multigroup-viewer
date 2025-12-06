# Air-Quality Network Coverage (UK Focus)

This note sketches how the major air-quality monitoring networks relate to popular public map websites for the United Kingdom. Because the number of live networks worldwide is enormous (national, regional, local, regulatory, research, and citizen-science), the list below focuses on nationally significant networks with a public internet presence as of December 2025. Where a network does **not** operate in the UK, the table explicitly marks that fact so you can still see whether a given map ingests its data elsewhere in the world.

## Legend

- `✅ direct` – Map pulls the official feed or API from that network for UK locations.
- `△ partial` – Map shows the network indirectly (e.g., via OpenAQ, EEA forwarding, or limited pilot stations).
- `✕ none` – Map does not display that network.
- `— not UK` – The network does not operate in the UK, so no UK data exist to display (though the map may use the feed in other countries).

_Note:_ This is a living document; licensing changes can and do disrupt downstream maps without notice.

## Coverage Matrix (maps = rows, networks = columns)

| Map / Portal | UK AURN | London LAQN | Air Quality England (AQC) | Scottish AQ Network | Wales AQ Network | Northern Ireland Air | Sensor.Community | PurpleAir | EEA (EU e-Reporting) | AirNow (US EPA) | CNEMC (China) | CPCB CAAQMS (India) | NAPS (Canada) | AirKorea (South Korea) | Japan AEROS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **UK-AIR (DEFRA)** | ✅ direct | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | △ partial (EEA technical mirror) | — not UK | — not UK | — not UK | — not UK | — not UK | — not UK |
| **Air Quality England portal** | △ partial (background AURN) | ✕ none | ✅ direct | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | — | — | — | — | — | — |
| **LondonAir map** | △ partial | ✅ direct | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | — | — | — | — | — | — |
| **Scottish Air Quality** | ✕ none | ✕ none | ✕ none | ✅ direct | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | — | — | — | — | — | — |
| **Wales Air Quality** | ✕ none | ✕ none | ✕ none | ✕ none | ✅ direct | ✕ none | ✕ none | ✕ none | ✕ none | — | — | — | — | — | — |
| **Northern Ireland Air** | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✅ direct | ✕ none | ✕ none | ✕ none | — | — | — | — | — | — |
| **EEA European AQ Index** | △ partial (UK submissions) | ✕ none | ✕ none | △ partial | △ partial | △ partial | ✕ none | ✕ none | ✅ direct | — | — | — | — | — | — |
| **World Air Quality Index (aqicn.org)** | △ partial (via UK APIs) | △ partial | ✕ none | △ partial | △ partial | △ partial | ✕ none | ✕ none | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial |
| **OpenAQ Explorer** | △ partial | △ partial | △ partial (where councils publish openly) | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial |
| **IQAir / AirVisual map** | △ partial (selected cities) | △ partial | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial |
| **Sensor.Community map** | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✅ direct (community sensors) | ✕ none | ✕ none | — | — | — | — | — | — |
| **PurpleAir map** | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✅ direct | ✕ none | — | — | — | — | — | — |
| **BreezoMeter map** | △ partial (licensed UK feeds) | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial |
| **Plume Labs / AirCare** | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | ✕ none | ✕ none | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial | △ partial |
| **AirNow.gov map** | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none | ✅ direct | ✕ none | ✕ none | ✕ none | ✕ none | ✕ none |

### Observations

1. **Official UK portals** (UK-AIR, devolved nation sites, LondonAir) stick to their own regulatory networks and rarely embed crowd-sourced sensors.
2. **Regional aggregators** such as the EEA map and Air Quality England show subsets of AURN data but also rely on reporting agreements that can lag real-time data by several hours.
3. **Global commercial maps** (BreezoMeter, Plume Labs, IQAir) blend many feeds plus models, so UK coverage exists even if licensing prevents them from exposing the raw network name.
4. **Crowd-sourced platforms** (Sensor.Community, PurpleAir) contribute data to OpenAQ and global commercial layers, but UK regulators do not currently ingest them into official dashboards.
5. **Non-UK national networks** (AirNow, CNEMC, CPCB, NAPS, AirKorea, Japan AEROS) do not operate UK monitors, yet large global maps still ingest their feeds abroad—hence the `— not UK` indicator while keeping columns visible.

## Network Glossary

- **UK AURN (Automatic Urban and Rural Network)** – DEFRA’s reference-grade network (~180 stations) providing ozone, NO₂, PM, etc.
- **London LAQN** – Imperial College’s London Air Quality Network, combining GLA, borough, and UKRI-funded stations.
- **Air Quality England (AQC)** – Contracted by many English local authorities outside London to host their stations and reports.
- **Scottish AQ Network** – Scottish Government/SEPA-run automatic and non-automatic stations, surfaced at `scottishairquality.scot`.
- **Wales AQ Network** – Principality-run stations plus local authority sites at `airquality.gov.wales`.
- **Northern Ireland Air** – DAERA-managed automatic and diffusion-tube network at `airqualityni.co.uk`.
- **Sensor.Community** – Global volunteer PM sensors (SDS011, PMS5003, etc.) published under open licenses.
- **PurpleAir** – Commercial low-cost PM sensors with proprietary map/API; large footprint in North America/Europe.
- **EEA e-Reporting (AirBase/AQD)** – European Environment Agency’s central repository (the "European AQI" map draws from here).
- **AirNow / US EPA SLAMS+NCore** – United States regulatory network that also powers the AirNow web map and data APIs.
- **CNEMC (China National Environmental Monitoring Centre)** – PRC’s national PM/O₃ network with hourly web dashboards.
- **CPCB CAAQMS (India)** – Central Pollution Control Board’s Continuous Ambient Air Quality Monitoring Stations + NAMP sampling.
- **NAPS (Canada)** – National Air Pollution Surveillance program run jointly by Environment and Climate Change Canada and provinces.
- **AirKorea (South Korea)** – Korea Environment Corporation’s realtime AQ network (`airkorea.or.kr`).
- **Japan AEROS** – Atmospheric Environmental Regional Observation System operated by Japan’s MOE.

## Map Portal Notes

- **OpenAQ** exports data via API, so many downstream researchers build bespoke visualizations instead of using the hosted map.
- **BreezoMeter and Plume Labs** combine observational feeds with dispersion models; licensing may mask which upstream network supplied the reading.
- **IQAir / AirVisual** publishes both regulatory monitors and its own low-cost devices; the map differentiates with badges but the raw API doesn’t expose all provenance.
- **World AQI (WAQI)** backfills with government sites where possible but can lag if the upstream website rate-limits scraping.
- **AirNow** is listed even though it does not currently show UK points; the column stays for parity with other major national networks.

Feel free to extend the matrix with additional international networks (e.g., Australia’s NEPM networks, Mexico’s SIMAT, Brazil’s CETESB QUALAR, South Africa’s SAAQIS) following the same conventions.
