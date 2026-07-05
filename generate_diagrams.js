const fs = require('fs');
const path = require('path');
const https = require('https');

const diagrams = {
  orchestration: `
sequenceDiagram
    participant Client as Frontend (app.js)
    participant Server as Node.js Backend (server.js)
    participant OSRM as OSRM / Mapbox
    participant Overpass as Overpass API
    participant News as NewsAPI / DuckDuckGo
    participant Weather as WeatherAPI
    participant NASA as NASA EONET
    participant Serp as SerpApi (Hotels)
    
    Client->>Server: POST /api/plan-route (Start, End)
    Server->>OSRM: Fetch Route Geometry & Coordinates
    OSRM-->>Server: Route Coordinates
    Server->>Overpass: Fetch Bounding Box Cities/Towns
    Overpass-->>Server: Intermediate Places Data
    Server->>Server: Segment Route & Inject Synthetic Checkpoints
    
    par Data Aggregation per Segment
        Server->>Weather: Fetch Current & Upcoming Weather
        Server->>News: Fetch Live Hazard News (Last 5 Days)
        Server->>NASA: Fetch Global Natural Events
    end
    
    Weather-->>Server: Precipitation & Visibility Data
    News-->>Server: Disaster Alerts
    NASA-->>Server: Live Geo-Events
    
    Server->>Server: Calculate Danger Colors
    
    alt Upcoming Zone is Red
        Server->>Serp: Fetch 5 Hotels for Shelter
        Serp-->>Server: Hotel Listings
    end
    
    Server-->>Client: Final TripState JSON
  `,
  frontend: `
flowchart TD
    Init[Initialize MapLibre GL] --> UIListeners[Bind UI Click Listeners]
    UIListeners --> Sub[User Submits Start/End Location]
    Sub --> PollStart[Start 4-Second Polling: fetchTripState]
    PollStart --> ParseJSON[Parse TripState JSON]
    
    ParseJSON --> RenderLayers{Route Coordinates Changed?}
    RenderLayers -- Yes --> Rebuild[Rebuild Map Sources & GeoJSON]
    RenderLayers -- No --> SyncColors[Dynamically Sync Segment Colors]
    
    SyncColors --> HUD[Update HUD: Speed, ETA, Weather]
    HUD --> Timeline[Render Upcoming Places Timeline]
    Timeline --> Hotels{Are there Hotels?}
    
    Hotels -- Yes --> RenderHotels[Render Hotel Cards in Sidebar]
    Hotels -- No --> Wait[Wait for next poll...]
    RenderHotels --> Wait
  `,
  backend: `
flowchart TD
    Req([Receive Client GET /api/state]) --> CheckCache{Route in Cache?}
    
    CheckCache -- No --> FetchGeocode[Geocode Start & End Points]
    FetchGeocode --> OSRM[Fetch OSRM Route Data]
    OSRM --> Overpass[Fetch Cities within Bounding Box]
    Overpass --> SegmentLogic[Segment Route: Max 50km apart]
    SegmentLogic --> AssignSegments[Map Places to Segments]
    
    CheckCache -- Yes --> UseCache[Load Cached Segments]
    AssignSegments --> UseCache
    
    UseCache --> AsyncPoll[Trigger Async API Fetches]
    
    subgraph Parallel API Promises
        AsyncPoll --> GetWeather[Fetch WeatherAPI]
        AsyncPoll --> GetNews[Fetch NewsAPI]
        AsyncPoll --> GetNASA[Fetch NASA EONET Cache]
    end
    
    GetWeather --> Assemble[Assemble Final Payload]
    GetNews --> Assemble
    GetNASA --> Assemble
    
    Assemble --> ColorEval[Evaluate Hazard Risks per Segment]
    ColorEval --> HotelEval{Is Upcoming Place Red?}
    
    HotelEval -- Yes --> FetchHotels[Fetch SerpApi Hotels]
    HotelEval -- No --> BuildRes[Construct JSON]
    FetchHotels --> BuildRes
    
    BuildRes --> Res([Send 200 OK to Client])
  `,
  hazard: `
flowchart TD
    Start([Receive Segment Data]) --> IsNewsActive{Does News Alert<br>Match City Name?}
    
    IsNewsActive -- Yes --> AlertRed[Flag as ACTIVE DANGER: RED]
    IsNewsActive -- No --> CheckNDVI{NDVI >= 0.72 <br>AND Heavy Rain?}
    
    CheckNDVI -- Yes --> AlertRed
    CheckNDVI -- No --> CheckCSV{Is City in Historic<br>Disaster CSV?}
    
    CheckCSV -- Yes --> AlertAmber[Flag as CAUTION: AMBER]
    CheckCSV -- No --> IsStorm{Is NASA Storm<br>Polygon Intersecting?}
    
    IsStorm -- Yes --> AlertAmber
    IsStorm -- No --> AlertGreen[Flag as SAFE: GREEN]
  `
};

const outputDir = path.join(__dirname, 'public', 'diagrams');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function downloadImage(name, mcode) {
  return new Promise((resolve, reject) => {
    // base64 encode the mermaid code
    const base64 = Buffer.from(mcode.trim()).toString('base64url');
    const url = `https://mermaid.ink/img/${base64}`;
    
    const file = fs.createWriteStream(path.join(outputDir, `${name}.png`));
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${name}: HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`[Success] Saved diagram: ${name}.png`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(path.join(outputDir, `${name}.png`), () => {});
      reject(err);
    });
  });
}

async function run() {
  console.log("Generating diagrams via Mermaid.ink...");
  for (const [name, code] of Object.entries(diagrams)) {
    try {
      await downloadImage(name, code);
    } catch (err) {
      console.error(`[Error] Failed to generate ${name}:`, err.message);
    }
  }
  console.log("Done!");
}

run();
