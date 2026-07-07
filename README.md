# DriveSphere
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
> **Intelligent Driving Dashboard with Hazard-Aware, Real-Time Dynamic Routing & Driver Assistance**

---

## Overview

**DriveSphere** is a next-generation navigation and safety platform designed to provide drivers with an "Electronic Horizon"—the ability to see hazards, weather conditions, and disasters well beyond their physical line of sight.

Traditional GPS systems only care about the fastest route. DriveSphere constantly evaluates your path against **live news reports, NASA satellite feeds, weather precipitation, road curvature, and vegetation density (NDVI)** to determine the safety of every segment of your journey.

If a disaster, landslide risk, or extreme flood is detected ahead, the system dynamically reroutes you using an integrated **Dijkstra's Pathfinding Algorithm** and suggests **emergency hotel shelters** so you can stop driving before entering danger zones.

---

## Key Features

1. **3D Interactive Map Engine (MapLibre GL JS):** Responsive 3D map canvas with automatic terrain adjustments, real-time vehicle simulation, and smooth camera transitions.
2. **Multi-Source Hazard Ingestion:**
   - **Live News Analysis (NewsAPI & DuckDuckGo):** Scans articles published in the last 5 days for strict hazard keywords (e.g. *landslide, flood, accident*) matching specific towns along the route.
   - **NASA EONET Integration:** Live tracking of global events like wildfires and severe storms, plotted as interactive map indicators.
   - **Historic Danger CSV:** References a local database (`ND_places_regenerated.csv`) of historic natural disaster zones.
3. **Atmospheric & Vegetation Telemetry:**
   - Evaluates **precipitation and visibility** using WeatherAPI.
   - Calculates **landslide risk** by checking if high NDVI (vegetation density) is paired with heavy rain on curvy roads.
4. **Dynamic Route Segmenting:** Automatically slices long routes (e.g. 600km) into ~50km segments by injecting synthetic checkpoints if Overpass API fails. This ensures a hazard in one town doesn't incorrectly turn your entire route red.
5. **Emergency Shelter Recommendation:** Automatically fetches and recommends at least 5 local hotels using **SerpApi (Google Hotels)** or Overpass API cache when the path ahead is blocked.

---

## High-Level System Architecture

The frontend controls the user experience and maps out routes, while the Node.js backend handles geocoding, API aggregation, and segment risk grading.

```mermaid
flowchart LR
    User[Website User] -->|1. Submit Route| UI[Frontend Dashboard UI]
    UI -->|2. State Polling 4s| Controller[app.js Controller]
    Controller -->|3. REST Requests| Backend[Express Server: server.js]
    
    subgraph Ingestion["Data Ingestion"]
        Backend -->|Query Route Coords| OSRM[OSRM Routing API]
        Backend -->|Identify Cities| Overpass[Overpass API]
        Backend -->|Fetch Weather| Weather[WeatherAPI]
        Backend -->|Scan Live News| News[NewsAPI & SauravTech]
        Backend -->|Track Wildfires/Storms| NASA[NASA EONET API]
        Backend -->|Query Route Hotels| HotelsDB[India Hotels DB]
    end
    
    subgraph Evaluation["Storage & Evaluation"]
        Backend -->|Compare Coordinates| LocalDisasterCSV[(Historic Disasters CSV)]
        Backend -->|Estimate Segment Types| LandslideCSV[(Landslides CSV)]
        Backend -->|Risk Algorithm| RiskEngine[Risk Grading Logic]
    end
    
    RiskEngine -->|4. Return JSON State| Controller
    Controller -->|5. Repaint Map Canvas| MapCanvas[MapLibre GL Engine]
    Controller -->|6. Update HUDs| HUD[Timeline & Speed HUD]

    style Ingestion fill:none,stroke:#444444,stroke-width:1px,stroke-dasharray: 5 5
    style Evaluation fill:none,stroke:#444444,stroke-width:1px,stroke-dasharray: 5 5
```

---

## Detailed Workflows

### Phase 1: Route Planning & Dynamic Segmentation
This phase geocodes destinations, fetches coordinate geometry, queries route cities, and dynamically segments paths.

```mermaid
flowchart TD
    Input[Enter Start & End City] --> Geocode[Geocode API: Resolve Lat/Lon]
    Geocode --> CheckCache{Route in Cache?}
    CheckCache -- Yes --> UseCache[Load Cached Segments]
    CheckCache -- No --> FetchRoute[OSRM API: Fetch Route Coordinates]
    FetchRoute --> CalculateBbox[Calculate Route Bounding Box]
    CalculateBbox --> FetchCities[Overpass API: Fetch Cities in BBox]
    FetchCities --> SpacingLogic[Filter Cities by Distance spacing]
    SpacingLogic --> SegmentSplit{Cities Found < 4?}
    SegmentSplit -- Yes --> SynthWps[Inject Synthetic Checkpoints every 50km]
    SegmentSplit -- No --> SplitSegments[Divide Route into Segments]
    SynthWps --> SplitSegments
    SplitSegments --> AssignBoundaries[Set Segment From/To Boundaries]
    AssignBoundaries --> UseCache
```

---

### Phase 2: Real-Time Hazard Scanning & Color Grading
Every 4 seconds, the backend runs segment coordinates through this logic to determine safety colors.

```mermaid
flowchart TD
    Segments[For Each Segment] --> FetchData[Trigger Parallel API Fetching]
    FetchData --> FetchWeather[WeatherAPI: Rain mm/hr & Temp]
    FetchData --> FetchNews[NewsAPI & SauravTech: Scan Disaster Keywords]
    FetchData --> FetchNASA[NASA EONET: Volcanoes, Storms & Wildfires]
    
    FetchWeather --> RiskEval[Risk Assessment Engine]
    FetchNews --> RiskEval
    FetchNASA --> RiskEval
    
    RiskEval --> NewsCheck{News matches Segment City<br>via Strict Word Boundaries?}
    NewsCheck -- Yes --> SetRed[Color: RED - Active Threat]
    
    NewsCheck -- No --> RainCheck{Rain > 5.0mm OR<br>NDVI >= 0.72 WITH Rain?}
    RainCheck -- Yes --> SetRed
    
    RainCheck -- No --> CSVCheck{Segment in Historic CSV<br>or NASA Threat Nearby?}
    CSVCheck -- Yes --> SetAmber[Color: AMBER - Caution]
    CSVCheck -- No --> SetGreen[Color: GREEN - Safe]
```

---

### Phase 3: Emergency Shelter & Dijkstra Detour Rerouting
When a segment is flagged as Red, the driver is warned, local hotels are fetched, and a Dijkstra visualizer computes the safest detour.

```mermaid
flowchart TD
    ColorGraded[Color-Graded Segments] --> CheckThreat{Upcoming Segment<br>is RED or Danger?}
    
    CheckThreat -- Yes --> TriggerShelter[findIndiaDBHotelsForRoute: Fetch Route Hotels]
    TriggerShelter --> ShowHotels[Display Unique Hotels List]
    
    CheckThreat -- Yes --> TriggerDijkstra[Initiate Dijkstra Pathfinding detour]
    TriggerDijkstra --> CalculateDetour[Compute Safest Alternative Path]
    CalculateDetour --> RenderDetour[Draw Detour Route Layer on Map]
    
    CheckThreat -- No --> NormalDrive[Display Safe Drive Status & Timeline]
```

---

### Phase 4: UI Lifecycle & Map State Syncing
The frontend handles data synchronization, updating progress metrics, supporting "Stop Searching" (via AbortController), and repainting segment colors dynamically.

```mermaid
flowchart TD
    APIResponse[Receive TripState JSON] --> CheckCoords{Coordinates Changed?}
    
    CheckCoords -- Yes --> RedrawRoute[Rebuild Map Sources & GeoJSON Layers]
    CheckCoords -- No --> UpdateColors[Repaint Segment Colors dynamically]
    
    RedrawRoute --> UpdateHUD[Update HUD metrics: Speed, ETA, Alerts]
    UpdateColors --> UpdateHUD
    
    UpdateHUD --> RenderTimeline[Render Timeline with active warnings]
    RenderTimeline --> HandleDeviation{Deviation Detected?}
    
    HandleDeviation -- Yes --> TriggerReroute[Call Backend /api/reroute]
    HandleDeviation -- No --> AutoPoll[Trigger fetchTripState in 4 seconds]
```

---

## API Reference & Credentials

To run the application, configure your `.env` file or environment variables with the following:

| Variable | API Provider | Purpose |
| :--- | :--- | :--- |
| `WEATHER_API_KEY` | [WeatherAPI](https://www.weatherapi.com/) | Live precipitation and weather state checks |
| `NEWS_API_KEY` | [NewsAPI](https://newsapi.org/) | Scans local news for keywords matching segment cities |

---

## Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or higher)
- NPM or Yarn

### Step-by-Step Run Guide

1. **Clone the repository**
   ```bash
   git clone https://github.com/Varshith10121901/E---horizon-driving-system
   cd E---horizon-driving-system
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Keys**
   Create a `.env` file in the root folder (Note: `.env` is ignored by git to keep your keys safe):
   ```env
   WEATHER_API_KEY=your_weather_api_key
   NEWS_API_KEY=your_news_api_key
   ```

4. **Start the Application**
   ```bash
   npm start
   ```

5. **Access the Dashboard**
   Open your browser and navigate to `http://localhost:3000`.

---

## License

This project is licensed under the [MIT License](./LICENSE).
