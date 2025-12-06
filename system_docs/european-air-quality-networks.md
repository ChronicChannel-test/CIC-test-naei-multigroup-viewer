# European Air-Quality Monitoring Networks (Regulatory, Regional, Citizen-Science)

_Last reviewed: December 2025._

This catalogue enumerates every known air-quality monitoring network operating anywhere in geographical Europe (EU and non-EU, including microstates, territories, and transcontinental states with European stations). It includes:

1. **Regulatory / statutory networks** run by national or devolved governments.
2. **Regional and local authority programs** that publish their own data feeds.
3. **Citizen-science / low-cost sensor collectives** with publicly visible stations in Europe.

> **Data caveat:** Licenses, operators, and APIs change frequently. When several networks roll up under one portal (e.g., France's AASQA agencies), each member agency is still listed so you can target contacts or scrape endpoints directly.

## Pan-European & Supra-National Networks

| Network | Operator | Coverage | Access Notes |
| --- | --- | --- | --- |
| European Environment Agency (EEA) e-Reporting / AQD | EEA + Member States | EU-27 + EEA cooperating countries | Pulls hourly/daily data from each national environmental agency; accessible via `aqportal.discomap.eea.europa.eu` and CDS APIs. |
| European Air Quality Index Map | EEA | EU + EEA submissions | Web map built on e-Reporting feed; JSON endpoints documented in AQI viewer docs. |
| European Monitoring and Evaluation Programme (EMEP) | UNECE CLRTAP | 40+ European countries + Canada/US contributions | Background/rural stations for transboundary air pollution; CSV downloads per site. |
| ACTRIS (Aerosols, Clouds and Trace gases Research Infrastructure) | EU research consortium | Research supersites across Europe | Data via ACTRIS Data Centre APIs. |
| ICOS Atmosphere | Integrated Carbon Observation System | GHG + AQ parameters at dozens of European observatories | NetCDF via ICOS Carbon Portal. |
| OpenAQ | Non-profit | Aggregates open government + citizen feeds worldwide | REST API with provenance metadata, strong coverage in Europe. |
| World Air Quality Index (WAQI) | WAQI project | Scrapes/regroups official portals globally | JSON API (tokened) plus map layers; coverage extends to most EU capitals. |
| Sensor.Community (formerly Luftdaten) | Citizen collective | 30k+ low-cost PM sensors, heavy European footprint | JSON API + CSV dumps. |
| PurpleAir | Commercial citizen network | Dense clusters in UK, Germany, Nordics, Alps | WebSocket/REST (tokened); map export. |
| uRADMonitor | Commercial/citizen hybrid | PM/NO2 networks in Romania, Balkans, Germany, Benelux | REST JSON feed per device.
| Plume Labs / AirCare community feeds | Plume Labs / AirCare | Crowdsourced sensors plus modeled layers | API via AirCare developer program. |
| BreezoMeter Allied Network Layer | BreezoMeter | Licensed feeds across Europe | Access via paid API; list of upstream networks not public but includes most regulators. |
| Luftdatenpumpe (historical) | Citizen science | Primarily Germany/Austria | Data archived; some nodes still post to API endpoints. |
| LuftQualitaet.Info | Independent aggregator | Germany, Austria, Switzerland | Scrapes Länder portals; API endpoints per state. |

## Country-by-Country Networks

_Columns: (1) Regulatory/statutory networks, (2) Regional or municipal portals, (3) Citizen-science or independent programs with notable footprint._

| Country / Territory | Regulatory / National Networks | Regional & Local Programs | Citizen / Independent Initiatives |
| --- | --- | --- | --- |
| Albania | National Air Quality Monitoring Network (NEA) | Tirana municipal sensors | Sensor.Community clusters in Tirana, Durres |
| Andorra | Servei de Medi Ambient AQ network | Parish-level diffusion tubes | Sensor.Community (Andorra la Vella) |
| Armenia | Hydromet Service AQ network (Yerevan) | Yerevan Municipality smart sensors | Sensor.Community, uRADMonitor |
| Austria | Umweltbundesamt FLM/Luftmessnetz | Vienna `luftdaten.at`, Upper Austria `luft-ooe` | Sensor.Community, Luftdatenpumpe legacy |
| Azerbaijan | MENR Air Monitoring Network (Baku) | Baku Eco-Monitoring stations | Sensor.Community Baku |
| Belarus | RUE "Belnipienergoprom" AQ network (Hydromet) | Minsk city monitors | Sensor.Community Minsk |
| Belgium | IRCEL-CELINE (federal), Vlaamse Milieumaatschappij (VMM), Bruxelles Environnement, Service Public de Wallonie | City platforms: Brussels Air, Antwerps Luchtkwaliteitsnet | Sensor.Community (dense), AirCasting Brussels |
| Bosnia & Herzegovina | Federal Hydro-Meteorological Institute network, RS Hidrometeoroloski Zavod | Sarajevo Canton Air Quality, Banja Luka portal | Sensor.Community Sarajevo, Luftdaten Balkans |
| Bulgaria | MOEW / Executive Environmental Agency (ExEA) AQ network | Sofia Urban Mobility sensors, Plovdiv AQ portal | Sensor.Community, AirBG.info |
| Croatia | Croatian Environment Agency (HAOP) Air Quality Network | Zagreb AirNow (Gradski ured), Istria County monitors | Sensor.Community |
| Cyprus (Republic) | Department of Labour Inspection AQ network | Nicosia Municipality low-cost PM | Sensor.Community, PurpleAir (Limassol) |
| Cyprus (Northern/TRNC) | TRNC Environmental Protection AQ network | Lefkosa municipal sensors | Sensor.Community |
| Czechia | CHMI Air Quality Monitoring Network | Prague `ovzdusi.praha.eu`, Ostrava SensorNet | Sensor.Community, PurpleAir |
| Denmark | DCE/Aarhus University National Air Quality Monitoring Programme | Copenhagen Street AQ (H.C. Andersen Blvd) | Sensor.Community, Luftdaten.dk |
| Estonia | Estonian Environmental Agency Air Quality Monitoring | Tallinn Smart City pilot stations | Sensor.Community, PurpleAir |
| Faroe Islands | Umhvørvisstovan AQ monitors | Torshavn municipal sensors | Sensor.Community |
| Finland | Finnish Meteorological Institute (FMI) AQ network | Helsinki Air Quality Service, HSY mobile labs | Sensor.Community, PurpleAir (Helsinki) |
| France | Atmo France (26 AASQA regional agencies) covering national obligations | City dashboards: Airparif (Paris), AtmoSud, Atmo Auvergne-Rhône-Alpes, Atmo Hauts-de-France, etc. | Sensor.Community (dense), Plume Labs community beta |
| Georgia | National Environmental Agency AQ network | Tbilisi Mayor's smart poles | Sensor.Community Tbilisi |
| Germany | Umweltbundesamt BLUME / Luftmessnetz + each Bundesland Umweltamt networks (e.g., Berlin BLUME, NRW LANUV, Bavaria LfU) | City-specific APIs: Berlin Luftdaten, Munich `LGL`, Stuttgart `luftqualitaet-bw` | Sensor.Community origin country, Luftdatenpumpe, PurpleAir clusters |
| Gibraltar | HMGoG Gibraltar AQ network | Roadside pods along Line Wall Road | Sensor.Community |
| Greece | Hellenic Ministry of Environment National AQ Network | Athens Municipality sensors, Thessaloniki `pppm` network | Sensor.Community, PANACEA smart nodes |
| Greenland | DCE background stations (limited) | Nuuk pilot PM nodes | Sensor.Community Nuuk |
| Hungary | National Air Quality Monitoring Network (OKIR/Levegominoseg) | Budapest Municipality low-cost pilots | Sensor.Community, PurpleAir |
| Iceland | Environment Agency of Iceland AQ network | Reykjavik Environmental Monitoring | Sensor.Community Reykjavik |
| Ireland | EPA National Ambient Air Quality Monitoring Programme (AAQMP) | Dublin City beta sensors, Cork City Council nodes | Sensor.Community, PurpleAir |
| Isle of Man | DEFA Air Quality Monitoring | Douglas roadside sensors | Sensor.Community |
| Italy | ISPRA-coordinated Rete di Monitoraggio Qualità dell'Aria (run by each ARPA/APPA region) | Regional portals: ARPA Lombardia, ARPA Lazio, ARPAV Veneto, ARPAE Emilia-Romagna, etc. | Sensor.Community (dense), Wiseair pods, PurpleAir |
| Kazakhstan (West) | Kazhydromet AQ network (stations in Atyrau, Uralsk) | Atyrau municipal monitors | Sensor.Community |
| Kosovo* | Kosovo Hydrometeorological Institute AQ network | Pristina air quality portal | Sensor.Community |
| Latvia | Latvian Environment, Geology and Meteorology Centre (LEGMC) AQ network | Riga city pilot sensors | Sensor.Community |
| Liechtenstein | Swiss NABEL/OSTLUFT coverage + Liechtenstein Office of Environment monitors | Schaan municipal pilot | Sensor.Community |
| Lithuania | Environmental Protection Agency AQ network | Vilnius municipality sensors | Sensor.Community |
| Luxembourg | Administration de l'Environnement AIRLUX network | City of Luxembourg smart sensors | Sensor.Community |
| Malta | Environment & Resources Authority AQ network | Valletta roadside monitors | Sensor.Community |
| Moldova | State Hydrometeorological Service AQ network | Chisinau city monitors | Sensor.Community |
| Monaco | Direction de l'Environnement AQ network | Mobile micro-sensors along Principality roads | Sensor.Community |
| Montenegro | Hydrometeorological and Seismological Service AQ network | Podgorica city sensors | Sensor.Community |
| Netherlands | RIVM Luchtmeetnet (national) + Provinces | City APIs: Amsterdam `luchtmeetnet`, Rotterdam, Utrecht | Sensor.Community, PurpleAir |
| North Macedonia | Ministry of Environment AQ network | Skopje City smart sensors | Sensor.Community |
| Norway | Norwegian Environment Agency (Miljødirektoratet) / NILU AQ network | Oslo Kommune sensors, Bergen Luftkvalitet | Sensor.Community, PurpleAir |
| Poland | GIOS State Environmental Monitoring (JPOAT), Wojewódzki Inspectorates | Krakow air quality board, Warsaw Airly (public-private) | Sensor.Community, Airly citizen network |
| Portugal | APA QualAr network (Continental + Madeira + Azores) | Lisbon city sensors, Porto MUNICIPAL | Sensor.Community |
| Romania | National Air Quality Monitoring Network (`calitateaer.ro`) | Bucharest City Hall sensors, Cluj AQ pilot | Sensor.Community, uRADMonitor HQ |
| Russia (European part) | Roshydromet AQ stations, Moscow Mosecomonitoring, Saint Petersburg Committee for Nature Use | City/regional networks for Tatarstan, Bashkortostan, etc. | Sensor.Community (Moscow, SPB), PurpleAir |
| San Marino | Agenzia per la Protezione dell'Ambiente e l'Energia AQ monitors | Municipal pilot sensors | Sensor.Community |
| Serbia | Serbian Environmental Protection Agency (SEPA) AQ network | Belgrade city monitors, Novi Sad network | Sensor.Community |
| Slovakia | SHMÚ National AQ Monitoring Network | Bratislava municipal network | Sensor.Community |
| Slovenia | ARSO Air Quality Monitoring | Ljubljana city stations | Sensor.Community |
| Spain | National Air Quality Network (MITECO) + autonomous community networks (Catalonia, Madrid, Basque Country, Andalusia, etc.) | City dashboards: Madrid `El Retiro`, Barcelona `Aire.cat`, Valencia `Generalitat` | Sensor.Community, AireCiudadano |
| Sweden | SMHI & Naturvårdsverket National AQ Network | Stockholm SLB-analys, Gothenburg City, Malmö | Sensor.Community, PurpleAir |
| Switzerland | NABEL + Canton networks (OSTLUFT, Cercl'Air members) | City dashboards: Zurich Luftqualitaet, Geneva, Basel | Sensor.Community, Luftdaten.ch |
| Turkey | National Air Quality Monitoring Network (Ministry of Environment) | Istanbul IBB network, Ankara BEL monitoring | Sensor.Community |
| Ukraine | Ukrhydromet AQ network, SaveEcoBot aggregated data, Kiev City monitors | Lviv, Dnipro municipal sensors | Sensor.Community, EcoCity citizen network |
| United Kingdom | DEFRA AURN, Devolved networks (Scottish AQ, Wales AQ, Northern Ireland Air), Local Authority networks, London LAQN | City dashboards: LondonAir, Air Quality England councils, ManchesterCAM, Birmingham ENVIZ | Sensor.Community, Breathe London, PurpleAir |
| Vatican City | Shares Italian (ARPA Lazio) monitors; dedicated Vatican PM sampler | Local Vatican Gendarmerie pilot sensor | Sensor.Community (border nodes) |

_* Kosovo designation per UN Security Council Resolution 1244._

### Notes on Additional Regional Consortia

- **Atmo France**: Each regional AASQA (Airparif, AtmoSud, Atmo BFC, Air Breizh, etc.) acts as its own network with separate APIs.
- **Italy ARPA/APPA**: Each region (Lombardy, Piedmont, Emilia-Romagna, Veneto, Lazio, Sicily, Sardinia, Abruzzo, Marche, Umbria, Tuscany, Liguria, Valle d'Aosta, Friuli Venezia Giulia, Trento, Bolzano) operates distinct monitoring arrays.
- **Spain Autonomous Communities**: 17 communities + 2 autonomous cities run parallel AQ networks beyond the national backbone.
- **Germany Bundesländer**: 16 Länder agencies maintain discrete networks (LANUV NRW, LUBW Baden-Württemberg, LfULG Saxony, HLNUG Hesse, etc.) feeding into UBA.
- **Nordic Municipal Networks**: Oslo, Helsinki, Stockholm, Copenhagen, Reykjavik all expose roadside micro-sensors separate from national labs.
- **Citizen Mega-Networks**: Airly (Poland-born) deploys branded low-cost PM sensors for municipalities across Poland, Czechia, Slovakia, Italy, Spain, UK; uRADMonitor sells calibrated devices heavily used in Romania, Serbia, Ukraine, Germany; Breathe London Phase 2 uses AQMesh pods city-wide.

### Access and API Availability

- **Regulatory networks** typically publish hourly data through national environmental portals (often CSV/XML/JSON). Examples: `data.gov.uk/air-quality` (UK), `data.gouv.fr` (France), `datos.gob.es` (Spain), `luftqualitaet.rivm.nl` (NL), `air.sk` (Slovakia).
- **Regional portals** sometimes require scraping or bilateral agreements; many expose ArcGIS REST Layer endpoints.
- **Citizen networks** almost always provide open JSON or MQTT feeds (Sensor.Community, uRADMonitor, Airly open data program). PurpleAir requires a token but is widely mirrored via community scripts.

Use this inventory as the seed list for the global matrix requested later; each entry can become a column heading, while country rows can be re-used verbatim.