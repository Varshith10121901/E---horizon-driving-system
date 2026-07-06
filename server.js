const http = require("http");
const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, ".env");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    const isQuoted = (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) value = value.slice(1, -1);

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadEnvFile(ENV_FILE);

const DDG_API_KEY = process.env.DDG_API_KEY || "";
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY || "";
let disasterZones = [];

function loadDisasterZones() {
  try {
    let csvPath = "D:\\e horizonCodes\\ND_places_regenerated.csv";
    if (!fs.existsSync(csvPath)) {
      csvPath = path.join(__dirname, "ND_places_regenerated.csv");
    }
    
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, "utf8");
      const lines = content.split(/\r?\n/);
      disasterZones = [];
      
      // Skip header
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = [];
        let current = "";
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            parts.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        parts.push(current);
        
        if (parts.length >= 3) {
          const state = parts[0].replace(/"/g, "").trim();
          const hazards = parts[1].replace(/"/g, "").trim();
          let placesStr = parts[2].replace(/"/g, "").trim();
          
          // Remove reference suffixes
          placesStr = placesStr.replace(/\.[a-z0-9\.\+\‑\_]+$/, "").trim();
          
          const tokens = [];
          const semiSplits = placesStr.split(";");
          semiSplits.forEach(ss => {
            const commaSplits = ss.split(",");
            commaSplits.forEach(cs => {
              const andSplits = cs.split(/\band\b/i);
              andSplits.forEach(as => {
                tokens.push(as.trim());
              });
            });
          });
          
          tokens.forEach(tok => {
            if (!tok) return;
            tok = tok.replace(/\.[a-z0-9\.\+\‑\_]+$/, "").trim();
            const parenMatch = tok.match(/([^(]+)\(([^)]+)\)/);
            let candidates = [];
            if (parenMatch) {
              candidates.push(parenMatch[1].trim());
              candidates.push(parenMatch[2].trim());
            } else {
              candidates.push(tok);
            }
            
            candidates.forEach(cand => {
              let clean = cand;
              
              // Handle introductory phrases
              const splitPhrases = [
                /\bsuch as\b/i,
                /\bincluding\b/i,
                /\blike\b/i,
                /\binclude\b/i,
                /\bincludes\b/i,
                /\brisk in\b/i,
                /\bprone:\b/gi,
                /\bprone\b/gi,
                /\barea:\b/gi,
                /\barea\b/gi
              ];
              for (const phrase of splitPhrases) {
                const parts = clean.split(phrase);
                if (parts.length > 1) {
                  clean = parts[parts.length - 1];
                }
              }

              const noiseWords = [
                /\bdistricts\b/gi, /\bdistrict\b/gi, /\bvalley\b/gi,
                /\badjoining areas\b/gi, /\badjoining\b/gi, /\bhighlighted as\b/gi,
                /\bmajor\b/gi, /\bhotspots\b/gi, /\bhotspot\b/gi, /\bregion\b/gi,
                /\bparts of\b/gi, /\bpocket\b/gi, /\bpockets\b/gi, /\bdelta\b/gi,
                /\bmandals\b/gi, /\bcoastal\b/gi, /\bflood-prone\b/gi, /\bdrought-prone\b/gi,
                /\bdrought-affected\b/gi, /\bhigh-risk\b/gi, /\barea\b/gi, /\bareas\b/gi,
                /\bextreme\b/gi, /\bsevere\b/gi, /\bmoderate\b/gi, /\bwater-stress\b/gi,
                /\bgroundwater\b/gi, /\bstress\b/gi, /\bseismic\b/gi, /\bhigh\b/gi,
                /\blandslide-prone\b/gi, /\bhill\b/gi, /\bflat\b/gi, /\bplains\b/gi,
                /\badjacent\b/gi, /\bneighbouring\b/gi, /\bnd neighboring\b/gi,
                /\bdrought-vulnerable\b/gi, /\bclimate-risk\b/gi, /\bvulnerability\b/gi,
                /\bcategory\b/gi, /\bzone\b/gi, /\bzones\b/gi, /\broad\b/gi, /\broads\b/gi,
                /\bsemi-arid\b/gi, /\bdesert\b/gi, /\bwestern\b/gi, /\beastern\b/gi, /\bcentral\b/gi,
                /\bnorthern\b/gi, /\bsouthern\b/gi, /\bcoastal\b/gi, /\bwet\b/gi, /\bdry\b/gi,
                /\bdual flood–drought risk in\b/gi, /\bdual flood–drought\b/gi, /\bflood and cyclone risk\b/gi,
                /\bflood-prone:\b/gi, /\bflood‑prone:\b/gi, /\bshifting from flood to drought risk\b/gi,
                /\bshifting from flood to drought\b/gi, /\bmany\b/gi, /\bseveral\b/gi, /\bothers\b/gi,
                /\bpartially\b/gi, /\bprimarily\b/gi, /\bmostly\b/gi,
                /\bmarked\b/gi, /\bmarked highly vulnerable\b/gi, /\blisted as very high risk\b/gi,
                /\blisted\b/gi, /\bmapped\b/gi, /\bclassified\b/gi, /\bcategorized\b/gi
              ];
              noiseWords.forEach(pattern => {
                clean = clean.replace(pattern, " ");
              });
              clean = clean.replace(/[^a-zA-Z\s]/g, " ");
              clean = clean.replace(/\s+/g, " ").trim();
              
              if (clean.length < 3) return;
              if (/^(and|the|for|our|new|are|its|with|from|such|risk|pocket|valley|plains|hills|town|towns|state|states|city|cities|delta|district|districts|regions|region|hotspot|hotspots)$/i.test(clean)) return;
              
              disasterZones.push({
                country: "India",
                state: state,
                district: clean,
                place: clean,
                disaster: hazards
              });
            });
          });
        }
      }
      console.log(`[Disaster Database] Loaded ${disasterZones.length} zones from ND_places_regenerated.csv.`);
    } else {
      console.warn(`[Disaster Database] ND_places_regenerated.csv not found at ${csvPath}`);
    }
  } catch (err) {
    console.error("[Disaster Database] Failed to load ND_places_regenerated.csv:", err.message);
  }
}

const notificationsDbPath = path.join(__dirname, "disaster_notifications.json");

function loadNotifications() {
  try {
    if (fs.existsSync(notificationsDbPath)) {
      const data = fs.readFileSync(notificationsDbPath, "utf8");
      return JSON.parse(data || "[]");
    }
  } catch (err) {
    console.error("[Notifications DB] Load failed:", err.message);
  }
  return [];
}

function saveNotifications(notifications) {
  try {
    fs.writeFileSync(notificationsDbPath, JSON.stringify(notifications, null, 2), "utf8");
  } catch (err) {
    console.error("[Notifications DB] Save failed:", err.message);
  }
}

function runDisasterScan(articles) {
  const db = loadNotifications();
  let articlesScanned = articles.length;
  let newNotificationsCount = 0;
  let duplicatesSkipped = 0;
  
  const naturalDisasterKeywords = [
    "landslide", "mudslide", "rockslide", "avalanche",
    "flood", "flooding", "cloudburst", "heavy rain", "torrential", "monsoon",
    "cyclone", "typhoon", "hurricane", "tornado", "storm",
    "earthquake", "tremor", "tsunami", "seismic",
    "wildfire", "bushfire", "forest fire", "volcano", "eruption"
  ];

  articles.forEach((article) => {
    const titleL = (article.title || "").toLowerCase();
    const summaryL = (article.description || article.summary || "").toLowerCase();
    
    // 1. Must be about a natural disaster
    const isNaturalDisaster = naturalDisasterKeywords.some(w => titleL.includes(w) || summaryL.includes(w));
    if (!isNaturalDisaster) return;
    
    // 2. Must be very recent (published within the last 72 hours)
    const pubTime = Date.parse(article.pubDate || article.published_at);
    const isRecent = !isNaN(pubTime) && (Date.now() - pubTime) <= 72 * 60 * 60 * 1000;
    if (!isRecent) return;
    
    disasterZones.forEach((zone) => {
      const placeL = zone.place.toLowerCase().trim();
      if (titleL.includes(placeL) || summaryL.includes(placeL)) {
        const url = article.link || article.url || "https://example.com/mock";
        
        const isDuplicate = db.some(row => row.source_url === url && row.place.toLowerCase().trim() === placeL);
        if (isDuplicate) {
          duplicatesSkipped++;
        } else {
          const newRow = {
            id: db.length + 1,
            place: zone.place,
            district: zone.district,
            state: zone.state,
            disaster_tags: zone.disaster,
            headline: article.title,
            summary: article.description || article.summary || "",
            source_url: url,
            source_feed: article.source || article.source_feed || "mock",
            published_at: article.pubDate || article.published_at || new Date().toISOString(),
            detected_at: new Date().toISOString()
          };
          db.push(newRow);
          newNotificationsCount++;
        }
      }
    });
  });
  
  if (newNotificationsCount > 0) {
    saveNotifications(db);
  }
  
  return {
    articles_scanned: articlesScanned,
    new_notifications: newNotificationsCount,
    duplicates_skipped: duplicatesSkipped
  };
}

function runStartupScan() {
  console.log("[Disaster Scanner] Running startup scan with mock articles...");
  const fakeArticles = [
    {
      title: "Landslide buries homes in Chooralmala, Wayanad; rescue ops underway",
      description: "Heavy monsoon rain triggered a major landslide in Kerala.",
      link: "https://example.com/news/1",
      pubDate: new Date().toISOString(),
      source: "mock"
    },
    {
      title: "Cyclone makes landfall near Puri, Odisha coast evacuated",
      description: "IMD issued red alert for Puri and Balasore districts.",
      link: "https://example.com/news/2",
      pubDate: new Date().toISOString(),
      source: "mock"
    },
    {
      title: "Sensex hits record high as IT stocks rally",
      description: "Markets closed higher today.",
      link: "https://example.com/news/3",
      pubDate: new Date().toISOString(),
      source: "mock"
    }
  ];
  
  if (fs.existsSync(notificationsDbPath)) {
    fs.unlinkSync(notificationsDbPath);
  }
  
  const result = runDisasterScan(fakeArticles);
  console.log("SCAN RESULT:", `articles_scanned=${result.articles_scanned} new_notifications=${result.new_notifications} duplicates_skipped=${result.duplicates_skipped}`);
  console.log();
  console.log("=== NOTIFICATIONS IN DB ===");
  const db = loadNotifications();
  db.forEach((row) => {
    console.log(`- ${row.place} (${row.state}) | ${row.disaster_tags} | ${row.headline}`);
  });
  
  console.log();
  console.log("=== RE-RUNNING SAME SCAN (dedup check) ===");
  const result2 = runDisasterScan(fakeArticles);
  console.log("SCAN RESULT 2:", `articles_scanned=${result2.articles_scanned} new_notifications=${result2.new_notifications} duplicates_skipped=${result2.duplicates_skipped}`);
}

loadDisasterZones();
runStartupScan();


const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const NASA_API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";
const MAP_PROVIDER = "NASA";

let demoStart = Date.now();
let plan = {
  from: "",
  to: "",
  vehicle: "Car",
  passengers: 2,
  updatedAt: new Date().toISOString()
};

// --- Landslide Historical CSV Database & Indexing ---
const landslideLocations = [];
const landslideGrid = {};
const landslideWords = new Set();
const GRID_DEG = 0.05; // ~5km grid size

function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push("");
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== "") lines.push(row);
  return lines;
}

function parseDms(dmsStr, isLon = false) {
  const regex = isLon
    ? /Lon\s*:\s*(\d+)\s*°\s*(\d+)\s*['′’]?\s*([\d.]+)?\s*["″”']?\s*E/i
    : /Lat\s*:\s*(\d+)\s*°\s*(\d+)\s*['′’]?\s*([\d.]+)?\s*["″”']?\s*N/i;
  const match = dmsStr.match(regex);
  if (!match) return null;
  const deg = parseFloat(match[1]);
  const min = parseFloat(match[2] || 0);
  const sec = parseFloat(match[3] || 0);
  return deg + min / 60 + sec / 3600;
}

function loadLandslides() {
  const csvPath = path.join(__dirname, "LandslideIncidences.csv");
  if (!fs.existsSync(csvPath)) {
    console.log("[Landslides] LandslideIncidences.csv not found.");
    return;
  }
  try {
    const content = fs.readFileSync(csvPath, "utf8");
    const rows = parseCSV(content);
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 3) continue;
      const title = row[1] || "";
      const desc = row[2] || "";
      const lat = parseDms(desc, false);
      const lon = parseDms(desc, true);
      
      const titleLower = title.toLowerCase();
      const words = titleLower.match(/[a-z]{4,}/g) || [];
      const stopWords = ["landslide", "district", "august", "june", "july", "near", "village", "town", "state", "road", "hills", "west", "east", "north", "south", "upper", "lower"];
      words.forEach(w => {
        if (!stopWords.includes(w)) landslideWords.add(w);
      });
      
      const item = { title, description: desc, lat, lon };
      landslideLocations.push(item);
      
      if (lat !== null && lon !== null) {
        const gridX = Math.round(lat / GRID_DEG);
        const gridY = Math.round(lon / GRID_DEG);
        const key = `${gridX},${gridY}`;
        if (!landslideGrid[key]) landslideGrid[key] = [];
        landslideGrid[key].push(item);
      }
    }
    console.log(`[Landslides] Ingested ${landslideLocations.length} records. Grid: ${Object.keys(landslideGrid).length}. Keywords: ${landslideWords.size}`);
  } catch (err) {
    console.error("[Landslides] CSV Loading failed:", err.message);
  }
}

function checkNearbyLandslides(lat, lon, radiusKm = 15) {
  const gridX = Math.round(lat / GRID_DEG);
  const gridY = Math.round(lon / GRID_DEG);
  const hits = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${gridX + dx},${gridY + dy}`;
      const bucket = landslideGrid[key];
      if (bucket) {
        bucket.forEach(item => {
          const dist = getDistanceKm(lat, lon, item.lat, item.lon);
          if (dist <= radiusKm) hits.push({ ...item, distance: dist });
        });
      }
    }
  }
  return hits;
}

loadLandslides();


const legend = [
  {
    key: "rain",
    label: "Rain / landslide / fire risk",
    color: "#d94343",
    meaning: "Avoid or reduce speed"
  },
  {
    key: "safe",
    label: "Safe to travel",
    color: "#1e9d55",
    meaning: "Normal driving condition"
  },
  {
    key: "forest",
    label: "Thick forest",
    color: "#0f5f4a",
    meaning: "Low visibility and wildlife crossing risk"
  },
  {
    key: "traffic",
    label: "Traffic / slow train",
    color: "#d8a91f",
    meaning: "Delay expected"
  },
  {
    key: "speed",
    label: "Speed limit board",
    color: "#f05d23",
    meaning: "Safe speed changes by place"
  }
];
const routeSegments = [];
const hotelPool = [
  { name: "Ghat View Stay", place: "Charmadi", lat: 13.045, lon: 75.441, etaMin: 24, price: 1800 },
  { name: "Rainline Lodge", place: "Mudigere", lat: 13.134, lon: 75.637, etaMin: 41, price: 2200 },
  { name: "Hubli Comfort Inn", place: "Hubli", lat: 15.364, lon: 75.124, etaMin: 96, price: 2600 },
  { name: "Dharwad Transit Rooms", place: "Dharwad", lat: 15.458, lon: 75.008, etaMin: 78, price: 1500 }
];

const typeColor = {
  rain: "#d94343",
  safe: "#1e9d55",
  forest: "#0f5f4a",
  traffic: "#d8a91f",
  speed: "#f05d23"
};

// --- In-Memory Caches ---
const weatherCache = {};
const routeCache = {};
let newsCache = null;
let lastNewsFetch = 0;

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const headers = { "User-Agent": "E-Horizon-AI-Smart-Travel-Map/1.0" };

async function verifyPlaceWithDDG(name) {
  const cleanName = name.trim();
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanName)}&format=json&no_html=1`;
  console.log(`[API Request] DuckDuckGo API verifying place: "${cleanName}"`);
  try {
    const reqHeaders = { "User-Agent": "E-Horizon-AI-Smart-Travel-Map/1.0" };
    if (DDG_API_KEY) {
      reqHeaders["X-API-Key"] = DDG_API_KEY;
    }
    const res = await fetch(url, { headers: reqHeaders });
    if (!res.ok) return null;
    const data = await res.json();
    
    // If the exact query didn't return any fathead results and doesn't contain "India", try fallback
    const hasData = data.Abstract || data.AbstractText || (data.Infobox && data.Infobox.content);
    if (!hasData && !cleanName.toLowerCase().includes("india")) {
      const fallbackUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanName + " India")}&format=json&no_html=1`;
      console.log(`[API Request] DuckDuckGo API geocode fallback with India suffix: "${cleanName} India"`);
      const fallbackRes = await fetch(fallbackUrl, { headers: reqHeaders });
      if (fallbackRes.ok) {
        return await fallbackRes.json();
      }
    }
    
    return data;
  } catch (err) {
    console.warn(`[DDG Verify] Failed for ${cleanName}:`, err.message);
    return null;
  }
}

async function geocodePlace(query) {
  const coordMatch = query.match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    console.log(`[Geocode] Input "${query}" matched GPS coordinate format. Validating India bounds...`);
    if (lat < 6.0 || lat > 37.5 || lon < 68.0 || lon > 97.5) {
      throw new Error("Coordinates are outside India.");
    }
    return {
      name: "Current GPS Location",
      lat,
      lon
    };
  }
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=in&viewbox=68.0,6.0,97.5,37.5&bounded=1`;
  console.log(`[API Request] Nominatim Geocoding query: "${query}" via URL: ${url}`);
  const res = await fetch(url, { headers });
  console.log(`[API Response] Nominatim Geocoding status: ${res.status} ${res.statusText}`);
  if (!res.ok) throw new Error(`Geocoding failed: ${res.statusText}`);
  const data = await res.json();
  
  // Prefer city, town, village, suburb, municipality addresstypes
  let best = null;
  if (data && data.length > 0) {
    best = data.find(item => 
      ['city', 'town', 'village', 'municipality', 'suburb', 'city_block'].includes(item.addresstype) ||
      item.class === 'place'
    );
  }
  
  // Custom fallback for Nanded city if shadowed by district centroid
  if (!best && query.toLowerCase().trim() === 'nanded') {
    try {
      const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=Nanded+Waghala&limit=1&countrycodes=in`;
      const fallbackRes = await fetch(fallbackUrl, { headers });
      const fallbackData = await fallbackRes.json();
      if (fallbackData && fallbackData.length > 0) {
        best = fallbackData[0];
      }
    } catch (err) {
      console.warn("[Nanded City Geocode Fallback Failed]", err.message);
    }
  }

  // Resilient fallback to Wikidata/DuckDuckGo Infobox coordinates if Nominatim fails
  if (!best) {
    try {
      const ddgResult = await verifyPlaceWithDDG(query);
      if (ddgResult && ddgResult.Infobox && Array.isArray(ddgResult.Infobox.content)) {
        const coordEntry = ddgResult.Infobox.content.find(c => c.data_type === "coordinates" || c.label === "Coordinates");
        if (coordEntry && coordEntry.value && typeof coordEntry.value === "object") {
          const lat = Number(coordEntry.value.latitude);
          const lon = Number(coordEntry.value.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            console.log(`[Geocode Fallback] Found coordinates for "${query}" in DuckDuckGo/Wikidata: [${lon}, ${lat}]`);
            if (lat >= 6.0 && lat <= 37.5 && lon >= 68.0 && lon <= 97.5) {
              return {
                name: ddgResult.Heading || query,
                lat,
                lon
              };
            }
          }
        }
      }
    } catch (ddgErr) {
      console.warn(`[DDG Geocode Fallback Failed]`, ddgErr.message);
    }
  }

  if (!best && data && data.length > 0) {
    best = data[0];
  }

  if (!best) {
    throw new Error(`No coordinates found in India for query: ${query}`);
  }

  const lat = parseFloat(best.lat);
  const lon = parseFloat(best.lon);
  console.log(`[Geocode] Nominatim returned coordinates: [${lon}, ${lat}] (addresstype: ${best.addresstype}) for query: "${query}". Checking bounds...`);
  if (lat < 6.0 || lat > 37.5 || lon < 68.0 || lon > 97.5) {
    throw new Error(`Location "${query}" is outside India.`);
  }

  const name = best.display_name.split(",")[0];

  try {
    const ddgResult = await verifyPlaceWithDDG(name);
    if (ddgResult && ddgResult.AbstractText) {
      console.log(`[DDG Double Verified] "${name}" is a known place: ${ddgResult.AbstractText.slice(0, 80)}...`);
    } else {
      console.log(`[DDG Verification] "${name}" did not return a DDG abstract, but coordinate check passed.`);
    }
  } catch (ddgErr) {
    console.warn(`[DDG Verification Error]`, ddgErr.message);
  }

  return {
    name,
    lat,
    lon
  };
}

function appendRouteCoordinate(target, coord) {
  if (!Array.isArray(coord) || coord.length < 2) return;

  const lon = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

  const previous = target[target.length - 1];
  if (!previous || previous[0] !== lon || previous[1] !== lat) {
    target.push([lon, lat]);
  }
}

function appendGeometryCoordinates(target, geometry) {
  if (!geometry) return;

  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach((coord) => appendRouteCoordinate(target, coord));
    return;
  }

  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach((line) => {
      if (Array.isArray(line)) {
        line.forEach((coord) => appendRouteCoordinate(target, coord));
      }
    });
  }
}


async function fetchOsrmRoutes(start, end) {
  const url = `http://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson&alternatives=true`;
  console.log(`[API Request] OSRM Route Service query via URL: ${url}`);
  const res = await fetch(url);
  console.log(`[API Response] OSRM Route Service status: ${res.status} ${res.statusText}`);
  if (!res.ok) throw new Error(`OSRM routing failed: ${res.statusText}`);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new Error(`OSRM routing error: ${data.code}`);
  }
  console.log(`[OSRM Routing] Successfully resolved ${data.routes.length} driving routes.`);
  return data.routes;
}

async function fetchRoutes(start, end) {
  console.log(`[OSRM Routing] Fetching driving routes from ${start.name} to ${end.name}...`);
  return fetchOsrmRoutes(start, end);
}

const overpassBboxCache = {};

async function fetchPlacesInBbox(minLat, minLon, maxLat, maxLon) {
  const gridKey = `${minLat.toFixed(1)},${minLon.toFixed(1)},${maxLat.toFixed(1)},${maxLon.toFixed(1)}`;
  if (overpassBboxCache[gridKey]) {
    console.log(`[Overpass Cache] Hit for bounding box grid: ${gridKey}`);
    return overpassBboxCache[gridKey];
  }
  
  // Dynamically optimize Overpass API query based on Bounding Box size (area in square degrees)
  const latDiff = Math.abs(maxLat - minLat);
  const lonDiff = Math.abs(maxLon - minLon);
  const area = latDiff * lonDiff;
  
  let query;
  if (area < 1.5) {
    // Small bounding box: search cities, towns, villages, and hotels
    query = `[out:json][timeout:15];(node["place"~"city|town|village"](${minLat},${minLon},${maxLat},${maxLon});node["tourism"~"hotel|guest_house|motel"](${minLat},${minLon},${maxLat},${maxLon}););out;`;
  } else {
    // Large bounding box: search only cities and towns to prevent API timeouts or payload issues
    console.log(`[Overpass Optimization] Large bounding box area: ${area.toFixed(2)} sq deg. Restricting search to cities and towns.`);
    query = `[out:json][timeout:15];(node["place"~"city|town"](${minLat},${minLon},${maxLat},${maxLon}););out;`;
  }
  
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  console.log(`[API Request] Overpass API querying BBox [${minLon.toFixed(2)}, ${minLat.toFixed(2)} to ${maxLon.toFixed(2)}, ${maxLat.toFixed(2)}] via URL: ${url}`);
  const res = await fetch(url, { headers });
  console.log(`[API Response] Overpass API status: ${res.status} ${res.statusText}`);
  if (!res.ok) throw new Error(`Overpass search failed: ${res.statusText}`);
  const data = await res.json();
  const elements = data.elements || [];
  console.log(`[Overpass Data] Successfully retrieved ${elements.length} places/hotels in BBox.`);
  overpassBboxCache[gridKey] = elements;
  return elements;
}

function generateElevation(coords, from, to) {
  const n = coords.length;
  let startH = 50;
  const fL = from.toLowerCase();
  if (fL.includes("manga")) startH = 10;
  else if (fL.includes("hubli")) startH = 650;
  else if (fL.includes("banga")) startH = 920;
  else if (fL.includes("chik")) startH = 1000;
  else if (fL.includes("mys")) startH = 740;
  
  let endH = 600;
  const tL = to.toLowerCase();
  if (tL.includes("manga")) endH = 10;
  else if (tL.includes("hubli")) endH = 650;
  else if (tL.includes("banga")) endH = 920;
  else if (tL.includes("chik")) endH = 1000;
  else if (tL.includes("mys")) endH = 740;

  const elevations = [];
  for (let i = 0; i < n; i++) {
    const progress = i / (n - 1 || 1);
    let h = startH + (endH - startH) * progress;
    if (progress > 0.2 && progress < 0.6) {
      const wave = Math.sin((progress - 0.2) / 0.4 * Math.PI);
      h += wave * 500;
    } else {
      h += Math.sin(progress * 20) * 30;
    }
    elevations.push(Math.round(h));
  }
  return elevations;
}

function estimateNdviForPoints(points) {
  let sumLat = 0, sumLon = 0;
  points.forEach(([lon, lat]) => {
    sumLat += lat;
    sumLon += lon;
  });
  const avgLat = sumLat / points.length;
  const avgLon = sumLon / points.length;
  
  const inGhatsLat = avgLat >= 12.8 && avgLat <= 14.5;
  const inGhatsLon = avgLon >= 75.1 && avgLon <= 75.9;
  
  if (inGhatsLat && inGhatsLon) {
    return 0.7 + Math.random() * 0.15;
  }
  if (avgLon < 75.1 && avgLat < 14.0) {
    return 0.4 + Math.random() * 0.1;
  }
  if (avgLon > 75.9) {
    return 0.25 + Math.random() * 0.1;
  }
  return 0.3 + Math.random() * 0.15;
}

function estimateSegmentType(ndvi, points) {
  if (ndvi >= 0.65) return "forest";
  if (Math.random() < 0.15) return "traffic";
  return "safe";
}

function buildSegmentsForRoute(routeCoords, startPlace, endPlace, rawPlaces) {
  const coords = [[startPlace.lon, startPlace.lat], ...routeCoords, [endPlace.lon, endPlace.lat]];
  const projectedPlaces = [];
  rawPlaces.forEach(p => {
    const name = p.tags.name || p.tags.place;
    const lat = parseFloat(p.lat);
    const lon = parseFloat(p.lon);
    
    const distToStart = getDistanceKm(lat, lon, startPlace.lat, startPlace.lon);
    const distToEnd = getDistanceKm(lat, lon, endPlace.lat, endPlace.lon);
    if (distToStart < 5 || distToEnd < 5) return;
    
    let minDist = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < coords.length; i += 10) {
      const dist = getDistanceKm(lat, lon, coords[i][1], coords[i][0]);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }
    
    if (minDist < 15) {
      projectedPlaces.push({
        name,
        lat,
        lon,
        closestIdx,
        type: p.tags.place
      });
    }
  });
  
  projectedPlaces.sort((a, b) => a.closestIdx - b.closestIdx);
  
  let selectedPlaces = [];
  let minSpacing = Math.floor(coords.length * 0.04);
  
  // Spacing feedback loop: reduce minSpacing if we get too few intermediate places (aiming for at least 8 total places, including start/end)
  for (let attempt = 0; attempt < 5; attempt++) {
    selectedPlaces = [
      { name: startPlace.name, lat: startPlace.lat, lon: startPlace.lon, closestIdx: 0 }
    ];
    let lastIdx = 0;
    projectedPlaces.forEach(p => {
      if (p.closestIdx - lastIdx >= minSpacing && (coords.length - 1 - p.closestIdx) >= Math.floor(minSpacing * 0.5)) {
        selectedPlaces.push(p);
        lastIdx = p.closestIdx;
      }
    });
    
    selectedPlaces.push({
      name: endPlace.name,
      lat: endPlace.lat,
      lon: endPlace.lon,
      closestIdx: coords.length - 1
    });

    if (selectedPlaces.length >= 8 || minSpacing <= 2) {
      break;
    }
    minSpacing = Math.max(2, Math.floor(minSpacing * 0.5));
  }
  
  // Fallback: If Overpass failed or route is barren, inject synthetic waypoints every 50km
  // This ensures long routes don't become a single giant segment where one local alert turns the whole 600km route red.
  if (selectedPlaces.length < 4) {
    const syntheticPlaces = [{ name: startPlace.name, lat: startPlace.lat, lon: startPlace.lon, closestIdx: 0 }];
    let accumulatedDist = 0;
    let wpCounter = 1;
    
    for (let i = 1; i < coords.length; i++) {
      const d = getDistanceKm(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0]);
      accumulatedDist += d;
      if (accumulatedDist > 50 && i < coords.length - 100) {
        syntheticPlaces.push({
          name: `Route Checkpoint ${wpCounter++}`,
          lat: coords[i][1],
          lon: coords[i][0],
          closestIdx: i
        });
        accumulatedDist = 0;
      }
    }
    
    syntheticPlaces.push({ name: endPlace.name, lat: endPlace.lat, lon: endPlace.lon, closestIdx: coords.length - 1 });
    selectedPlaces = syntheticPlaces;
  }
  
  const segments = [];
  const elevations = generateElevation(coords, startPlace.name, endPlace.name);
  
  for (let i = 0; i < selectedPlaces.length - 1; i++) {
    const fromP = selectedPlaces[i];
    const toP = selectedPlaces[i+1];
    
    const segmentCoords = coords.slice(fromP.closestIdx, toP.closestIdx + 1);
    
    let segmentKm = 0;
    for (let j = 1; j < segmentCoords.length; j++) {
      segmentKm += getDistanceKm(segmentCoords[j-1][1], segmentCoords[j-1][0], segmentCoords[j][1], segmentCoords[j][0]);
    }
    segmentKm = Math.round(segmentKm);
    if (segmentKm < 1) segmentKm = 1;
    
    const ndvi = estimateNdviForPoints(segmentCoords);
    let speedLimit = getSpeedLimitForNdvi(ndvi);
    let type = estimateSegmentType(ndvi, segmentCoords);
    
    const points = segmentCoords.map(c => [c[0], c[1]]);
    
    // Sample coordinates along segment (every ~1km) to check against historical landslide grid
    let hasLandslideIncident = false;
    let landslideReason = "";
    const decStep = Math.max(1, Math.floor(segmentCoords.length / 5));
    for (let k = 0; k < segmentCoords.length; k += decStep) {
      const pt = segmentCoords[k];
      const hits = checkNearbyLandslides(pt[1], pt[0], 15);
      if (hits.length > 0) {
        hasLandslideIncident = true;
        landslideReason = `Passes near historical landslide area: ${hits[0].title.split(" (")[0]}`;
        break;
      }
    }
    
    // Check if segment names contain landslide keywords
    const fromLower = fromP.name.toLowerCase();
    const toLower = toP.name.toLowerCase();
    const fromWords = fromLower.match(/[a-z]{4,}/g) || [];
    const toWords = toLower.match(/[a-z]{4,}/g) || [];
    const nameMatch = [...fromWords, ...toWords].some(w => landslideWords.has(w));
    
    if (nameMatch && !hasLandslideIncident) {
      hasLandslideIncident = true;
      landslideReason = `Passes through landslide-prone region: ${fromP.name} / ${toP.name}`;
    }
    
    let roadType = "State Highway";
    let curvature = "Moderate";
    
    if (hasLandslideIncident) {
      type = "rain"; // triggers warning colors
      roadType = "Critical Landslide Risk Area";
      curvature = "Extreme Curves";
      speedLimit = 35; // enforce safe crawl
    } else {
      if (ndvi >= 0.65) {
        roadType = "Forest Road";
        curvature = "Winding";
      } else if (type === "rain" || ndvi >= 0.55) {
        roadType = "Ghat Road (Pass)";
        curvature = "Extreme Curves";
      } else if (speedLimit >= 80) {
        roadType = "National Expressway";
        curvature = "Straight";
      }
    }

    segments.push({
      id: `seg-${i}`,
      title: `${fromP.name} to ${toP.name}`,
      type,
      from: fromP.name,
      to: toP.name,
      km: segmentKm,
      ndvi,
      speedLimit,
      safeSpeed: Math.round(speedLimit * 0.8),
      roadType,
      curvature,
      points
    });
  }
  
  return { segments, elevations, coords, places: selectedPlaces };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function distanceForSegment(segment) {
  return segment.points.reduce((total, point, index) => {
    if (index === 0) return total;
    const previous = segment.points[index - 1];
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);
}

function positionOnSegment(segment, segmentProgress) {
  const distances = [];
  let totalDistance = 0;

  for (let index = 1; index < segment.points.length; index += 1) {
    const previous = segment.points[index - 1];
    const current = segment.points[index];
    const distance = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    distances.push(distance);
    totalDistance += distance;
  }

  let target = totalDistance * clamp(segmentProgress, 0, 1);
  for (let index = 1; index < segment.points.length; index += 1) {
    const previous = segment.points[index - 1];
    const current = segment.points[index];
    const distance = distances[index - 1];
    if (target <= distance || index === segment.points.length - 1) {
      const localProgress = distance === 0 ? 0 : target / distance;
      return [
        previous[0] + (current[0] - previous[0]) * localProgress,
        previous[1] + (current[1] - previous[1]) * localProgress
      ];
    }
    target -= distance;
  }

  return segment.points[segment.points.length - 1];
}

// Clean XML utilities for RSS parsing
function cleanXmlText(str) {
  if (!str) return "";
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/<\/?[^>]+(>|$)/g, "")
            .trim();
}

// Fallback weather generator
function getFallbackWeather(q) {
  let name = q;
  let isGhat = q.toLowerCase().includes("charmadi") || q.toLowerCase().includes("ghats") || q.toLowerCase().includes("chikmagalur");
  
  const coordMatch = q.match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    if (lat >= 13.1 && lat <= 13.35) {
      isGhat = true;
      name = "Charmadi Ghat";
    } else if (lat < 13.1) {
      name = "Coastal Foothills";
    } else {
      name = "Deccan Plateau";
    }
  }

  return {
    location: { name: name },
    current: {
      temp_c: isGhat ? 21.5 : 28.0,
      condition: {
        text: isGhat ? "Heavy rain shower" : "Partly cloudy",
        code: isGhat ? 1243 : 1003
      },
      wind_kph: isGhat ? 26.5 : 12.0,
      humidity: isGhat ? 94 : 68,
      precip_mm: isGhat ? 8.2 : 0.0
    }
  };
}

function getWeatherCacheKey(q) {
  const trimmed = q.toLowerCase().trim();
  const coordMatch = trimmed.match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]).toFixed(1);
    const lon = parseFloat(coordMatch[2]).toFixed(1);
    return `${lat},${lon}`;
  }
  return trimmed;
}

// WeatherAPI fetcher with caching
async function fetchWeather(q) {
  const cacheKey = getWeatherCacheKey(q);
  const now = Date.now();
  if (weatherCache[cacheKey] && (now - weatherCache[cacheKey].timestamp < 300000)) {
    return weatherCache[cacheKey].data;
  }

  try {
    const WEATHER_KEY = process.env.WEATHER_API_KEY || "";
    const url = `http://api.weatherapi.com/v1/current.json?key=${WEATHER_KEY}&q=${encodeURIComponent(q)}`;
    console.log(`[API Request] WeatherAPI query: "${q}" via URL: ${url}`);
    const res = await fetch(url);
    console.log(`[API Response] WeatherAPI status: ${res.status} ${res.statusText}`);
    if (!res.ok) throw new Error("WeatherAPI HTTP error " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    
    weatherCache[cacheKey] = {
      timestamp: now,
      data: data
    };
    return data;
  } catch (error) {
    console.warn(`[Weather Service] Fallback triggered for "${q}":`, error.message);
    return getFallbackWeather(q);
  }
}

// Fallback news generator
function getFallbackNews(from = "", to = "") {
  const pFrom = from || plan.from || "active route";
  const pTo = to || plan.to || "destination";
  return [
    {
      title: `Warning: Road reports slippery curves due to monsoon rain near ${pFrom}`,
      link: "https://newsapi.org",
      pubDate: new Date().toUTCString(),
      description: `Travellers crossing the route section near ${pFrom} are advised to keep speeds low.`
    },
    {
      title: `Waterlogging issues reported on highway near ${pTo} outskirts`,
      link: "https://newsapi.org",
      pubDate: new Date().toUTCString(),
      description: `Severe water logging at several segments slows traffic heading towards ${pTo}.`
    }
  ];
}

let newsFetchInProgress = false;
const NEWS_CACHE_TTL = 60000; // 60 seconds global cache

// SauravKanchan NewsAPI integration (Free alternative fetching Indian Top Headlines)
async function fetchNewsAPI(currentPlace, nextPlace) {
  const now = Date.now();
  
  // Return cached headlines if within TTL
  if (newsCache && (now - lastNewsFetch < NEWS_CACHE_TTL)) {
    return newsCache;
  }
  
  if (newsFetchInProgress) {
    return newsCache || getFallbackNews(currentPlace, nextPlace);
  }

  newsFetchInProgress = true;
  try {
    console.log("[News Service] Fetching Indian headlines from SauravTech NewsAPI...");
    const categories = ["general", "business", "technology", "science"];
    const fetchPromises = categories.map(async (cat) => {
      const url = `https://saurav.tech/NewsAPI/top-headlines/category/${cat}/in.json`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          return data.articles || [];
        }
        return [];
      } catch (e) {
        clearTimeout(timeoutId);
        console.warn(`[News Service] Failed to fetch category ${cat}:`, e.message);
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    let allArticles = [];
    results.forEach(articles => {
      allArticles = allArticles.concat(articles);
    });

    // Deduplicate by URL
    const seenUrls = new Set();
    const uniqueArticles = [];
    allArticles.forEach(article => {
      if (article && article.url && !seenUrls.has(article.url)) {
        seenUrls.add(article.url);
        uniqueArticles.push({
          title: article.title || "Untitled",
          link: article.url || "https://newsapi.org",
          pubDate: article.publishedAt || new Date().toUTCString(),
          description: article.description || article.content || "",
          source: article.source?.name || "NewsAPI"
        });
      }
    });

    newsCache = uniqueArticles;
    lastNewsFetch = now;
    console.log(`[News Service] Successfully loaded and deduplicated ${newsCache.length} articles.`);
  } catch (error) {
    console.warn("[News Service] Failed to fetch SauravTech headlines, using fallback/cache:", error.message);
    if (!newsCache) {
      newsCache = getFallbackNews(currentPlace, nextPlace);
    }
  } finally {
    newsFetchInProgress = false;
  }
  return newsCache;
}

// SerpApi Google Hotels search integration
const serpapiCache = {};
const SERPAPI_TTL = 300_000; // 5 min cache

async function fetchSerpapiHotels(placeName, lat, lon) {
  if (!SERPAPI_API_KEY) return [];
  const cacheKey = placeName.toLowerCase().trim();
  const cached = serpapiCache[cacheKey];
  if (cached && (Date.now() - cached.ts < SERPAPI_TTL)) {
    return cached.hotels;
  }

  try {
    const query = `Hotels in ${placeName}`;
    const url = `https://serpapi.com/search.json?engine=google_hotels&q=${encodeURIComponent(query)}&api_key=${SERPAPI_API_KEY}`;
    console.log(`[API Request] SerpApi Google Hotels: "${query}"`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const hotels = [];
      if (data.properties && Array.isArray(data.properties)) {
        data.properties.slice(0, 3).forEach(prop => {
          let price = 2000;
          if (prop.rate_per_night && prop.rate_per_night.lowest) {
            const numStr = prop.rate_per_night.lowest.replace(/[^\d]/g, "");
            if (numStr) price = parseInt(numStr, 10);
          }
          
          hotels.push({
            name: prop.name,
            place: placeName,
            lat: prop.gps_coordinates ? prop.gps_coordinates.latitude : lat,
            lon: prop.gps_coordinates ? prop.gps_coordinates.longitude : lon,
            price: price,
            bookingLink: prop.link || `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(prop.name + ", " + placeName)}`,
            agodaLink: `https://www.agoda.com/search?query=${encodeURIComponent(prop.name + ", " + placeName)}`,
            source: "SerpApi"
          });
        });
      }
      serpapiCache[cacheKey] = { hotels, ts: Date.now() };
      return hotels;
    }
  } catch (err) {
    console.warn(`[SerpApi Hotels] Failed for "${placeName}":`, err.message);
  }
  
  serpapiCache[cacheKey] = { hotels: [], ts: Date.now() };
  return [];
}

// DuckDuckGo News search for via-places hazard checking
const ddgNewsCache = {};
const DDG_NEWS_TTL = 120_000; // 2 min cache

async function fetchDuckDuckGoNewsForPlaces(placeNames) {
  if (!DDG_API_KEY || placeNames.length === 0) return [];
  
  const results = [];
  // Only check disaster-zone places to avoid excessive API calls
  const placesToCheck = placeNames.slice(0, 8); // max 8 places
  
  for (const place of placesToCheck) {
    const cacheKey = place.toLowerCase().trim();
    const cached = ddgNewsCache[cacheKey];
    if (cached && (Date.now() - cached.ts < DDG_NEWS_TTL)) {
      results.push(...cached.articles);
      continue;
    }
    
    try {
      const query = `${place} India disaster OR flood OR landslide OR cyclone OR accident`;
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&t=E-Horizon`;
      const reqHeaders = { "User-Agent": "E-Horizon-AI-Smart-Travel-Map/1.0" };
      if (DDG_API_KEY) reqHeaders["X-API-Key"] = DDG_API_KEY;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { headers: reqHeaders, signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        const articles = [];
        
        // Extract from RelatedTopics
        if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
          data.RelatedTopics.slice(0, 3).forEach(topic => {
            if (topic.Text && topic.FirstURL) {
              articles.push({
                title: topic.Text.slice(0, 120),
                link: topic.FirstURL,
                description: topic.Text,
                source: "DuckDuckGo",
                pubDate: new Date().toISOString(),
                place: place
              });
            }
          });
        }
        
        // Extract from Abstract
        if (data.Abstract && data.AbstractURL) {
          articles.push({
            title: `${place}: ${data.Abstract.slice(0, 100)}`,
            link: data.AbstractURL,
            description: data.Abstract,
            source: "DuckDuckGo",
            pubDate: new Date().toISOString(),
            place: place
          });
        }
        
        ddgNewsCache[cacheKey] = { articles, ts: Date.now() };
        results.push(...articles);
        console.log(`[DDG News] Fetched ${articles.length} results for "${place}"`);
      }
    } catch (err) {
      console.warn(`[DDG News] Failed for "${place}":`, err.message);
      ddgNewsCache[cacheKey] = { articles: [], ts: Date.now() };
    }
  }
  
  return results;
}

// Vegetative Index Speed Limit mapper
function getSpeedLimitForNdvi(ndvi) {
  if (ndvi >= 0.7) return 40; // Dense Forest/Mountain section
  if (ndvi >= 0.5) return 60; // Moderate vegetation / state highway
  return 80; // Urban highway / clear terrain
}

function getSegmentColor(segment, weatherCurrent, weatherUpcoming, activeDangerAlerts, riskScore) {
  const segId = segment.id;
  const segType = segment.type;
  
  // Check if there are active news alerts specifically mentioning this segment's places
  const hasNewsDanger = activeDangerAlerts.some(alert => {
    const titleL = alert.title.toLowerCase();
    const descL = alert.description.toLowerCase();
    const places = [segment.from, segment.to];
    return places.some(p => {
      if (!p) return false;
      const regex = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
      return regex.test(titleL) || regex.test(descL);
    });
  });

  if (hasNewsDanger) {
    return "#ef4444"; // Red for active news danger
  }

  // Check if segment has critical landslide hazard warning (NDVI >= 0.72 WITH rain or extreme curves)
  if ((segment.ndvi >= 0.72 && segType === "rain") || (segType === "rain" && segment.curvature === "Extreme Curves")) {
    return "#ef4444"; // Red for critical landslide hazard zone
  }

  // Check if segment has moderate landslide hazard warning (NDVI >= 0.65)
  if (segment.ndvi >= 0.65) {
    return "#f59e0b"; // Amber/Orange for moderate landslide hazard zone
  }

  // Check if segment passes through a CSV disaster zone (amber/yellow warning)
  const fromIsDisaster = disasterZones.some(z => z.place.toLowerCase().trim() === segment.from.toLowerCase().trim());
  const toIsDisaster = disasterZones.some(z => z.place.toLowerCase().trim() === segment.to.toLowerCase().trim());
  if (fromIsDisaster || toIsDisaster) {
    return "#f59e0b"; // Amber/Yellow for CSV disaster zone
  }

  if (segId === "heavy-rain" || segType === "rain") {
    const isNearCurrent = [segment.from.toLowerCase(), segment.to.toLowerCase()].includes(weatherCurrent.location.name.toLowerCase());
    const isNearUpcoming = [segment.from.toLowerCase(), segment.to.toLowerCase()].includes(weatherUpcoming.location.name.toLowerCase());
    
    let segmentPrecip = 0;
    if (isNearCurrent && weatherCurrent.current) {
      segmentPrecip = weatherCurrent.current.precip_mm || 0;
    } else if (isNearUpcoming && weatherUpcoming.current) {
      segmentPrecip = weatherUpcoming.current.precip_mm || 0;
    }
    
    if (segmentPrecip > 5.0) {
      return "#ef4444"; // Red for heavy rain on this segment
    } else if (segmentPrecip > 0.0) {
      return "#f59e0b"; // Amber for rain on this segment
    }
    return "#f59e0b"; // Default to Amber warning for historical landslide-prone segment path
  }

  if (segType === "traffic") {
    return "#f59e0b"; // Amber for traffic
  }

  if (segType === "forest") {
    return "#065f46"; // Forest green
  }

  return "#10b981"; // Safe green
}

const reverseGeoCache = {};
async function reverseGeocode(lat, lon) {
  const latFixed = parseFloat(lat).toFixed(3);
  const lonFixed = parseFloat(lon).toFixed(3);
  const cacheKey = `${latFixed},${lonFixed}`;
  if (reverseGeoCache[cacheKey]) {
    return reverseGeoCache[cacheKey];
  }
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latFixed}&lon=${lonFixed}&zoom=14&countrycodes=in`;
  console.log(`[API Request] Nominatim Reverse Geocode: [${lonFixed}, ${latFixed}] via URL: ${url}`);
  try {
    const res = await fetch(url, { headers });
    console.log(`[API Response] Nominatim Reverse Geocode status: ${res.status} ${res.statusText}`);
    if (!res.ok) throw new Error("Reverse geocode failed");
    const data = await res.json();
    const address = data.address || {};
    
    // Parse Taluk and local place name
    const taluk = address.subdistrict || address.county || "";
    const place = address.suburb || address.neighbourhood || address.village || address.town || address.road || address.city || "";
    
    let placeName = "";
    if (taluk && place && taluk.toLowerCase().trim() !== place.toLowerCase().trim()) {
      placeName = `${taluk.trim()}, ${place.trim()}`;
    } else {
      placeName = place || taluk || "India";
    }

    console.log(`[Reverse Geocode] Resolved GPS [${lonFixed}, ${latFixed}] to: "${placeName}"`);
    reverseGeoCache[cacheKey] = placeName;
    return placeName;
  } catch (err) {
    console.warn(`[Reverse Geocode Failed] ${lat}, ${lon}:`, err.message);
    return null;
  }
}

async function buildTripStateAsync(searchParams) {
  const now = Date.now();
  const demoDurationMs = 180_000;
  
  // Get progress, support client override
  let progress = 0;
  if (searchParams.get("progress")) {
    progress = Number(searchParams.get("progress"));
  } else {
    progress = ((now - demoStart) % demoDurationMs) / demoDurationMs;
  }

  // If no plan has been set yet, return a clean stationary state
  if (!plan.from || !plan.to) {
    return {
      app: "E-Horizon Travel Pro Dashboard",
      generatedAt: new Date(now).toISOString(),
      refreshEveryMs: 2000,
      plan,
      alternatives: [],
      route: {
        totalKm: 0,
        coveredKm: 0,
        remainingKm: 0,
        progress: 0,
        coordinates: [],
        elevations: [],
        segments: []
      },
      vehicle: {
        label: plan.vehicle,
        currentPlace: "No origin",
        nextPlace: "No destination",
        position: [78.9629, 20.5937],
        currentSpeed: 0,
        safeSpeed: 0,
        speedLimit: 0,
        segmentProgress: 0
      },
      conditions: {
        current: {
          place: "Unknown",
          climate: "Unknown",
          temperatureC: 0,
          windKph: 0,
          humidity: 0,
          precipMm: 0,
          severity: "low"
        },
        upcoming: {
          place: "Unknown",
          climate: "Unknown",
          temperatureC: 0,
          risk: "None",
          color: "#1e9d55"
        },
        delayMinutes: 0,
        routeStatus: "Route inactive"
      },
      newsAlerts: [],
      activeDangerAlerts: [],
      roadIssuesDetected: false,
      viaPlaces: [],
      disasterZones: [],
      risk: {
        score: 0,
        level: "Low",
        drivingAdvice: "Please enter a destination to start planning."
      },
      vegetation: {
        index: 0,
        density: "Urban Area"
      },
      suggestHotels: false,
      hotels: [],
      legend: []
    };
  }
  
  // Load dynamic route from cache or build it
  const cacheKey = `${plan.from.toLowerCase().trim()}_${plan.to.toLowerCase().trim()}`;
  let cached = routeCache[cacheKey];
  if (!cached) {
    try {
      cached = await getOrBuildRoutes(plan.from, plan.to);
    } catch (err) {
      console.error(`[buildTripStateAsync] Failed to build route:`, err.message);
    }
  }
  
  let activeSegments = [];
  let activeCoords = [];
  let activeElevations = null;
  let activePlaces = null;
  let alternatives = [];
  
  const routeIdx = parseInt(searchParams.get("routeIndex") || "0", 10);
  if (cached && cached.routes) {
    alternatives = cached.routes.map((r, idx) => ({
      index: idx,
      totalKm: r.segments.reduce((s, seg) => s + seg.km, 0),
      places: r.places.map(p => p.name),
      summary: r.places.map(p => p.name).join(" → ") || "Direct Highway",
      coords: r.coords
    }));
    
    const r = cached.routes[routeIdx] || cached.routes[0];
    if (r) {
      activeSegments = r.segments;
      activeCoords = r.coords;
      activeElevations = r.elevations;
      activePlaces = r.places;
    }
  }

  // If dynamic routing failed and no segments can be resolved
  if (activeSegments.length === 0) {
    return {
      app: "E-Horizon Travel Pro Dashboard",
      generatedAt: new Date(now).toISOString(),
      refreshEveryMs: 2000,
      plan,
      alternatives: [],
      route: {
        totalKm: 0,
        coveredKm: 0,
        remainingKm: 0,
        progress: 0,
        coordinates: [],
        elevations: [],
        segments: []
      },
      vehicle: {
        label: plan.vehicle,
        currentPlace: "Routing failed",
        nextPlace: "Routing failed",
        position: [78.9629, 20.5937],
        currentSpeed: 0,
        safeSpeed: 0,
        speedLimit: 0,
        segmentProgress: 0
      },
      conditions: {
        current: {
          place: "Unknown",
          climate: "Unknown",
          temperatureC: 0,
          windKph: 0,
          humidity: 0,
          precipMm: 0,
          severity: "low"
        },
        upcoming: {
          place: "Unknown",
          climate: "Unknown",
          temperatureC: 0,
          risk: "None",
          color: "#1e9d55"
        },
        delayMinutes: 0,
        routeStatus: "Route inactive"
      },
      newsAlerts: [],
      activeDangerAlerts: [],
      roadIssuesDetected: false,
      risk: {
        score: 0,
        level: "Low",
        drivingAdvice: "Route planning failed. Please try a different location."
      },
      vegetation: {
        index: 0,
        density: "Urban Area"
      },
      suggestHotels: false,
      hotels: [],
      legend: []
    };
  }

  const totalKm = activeSegments.reduce((sum, segment) => sum + segment.km, 0);
  const coveredKm = totalKm * progress;
  const elapsedSeconds = Math.floor((now - demoStart) / 1000);
  const pulse = Math.sin(elapsedSeconds / 4);

  let kmCursor = 0;
  let activeIndex = 0;
  for (let index = 0; index < activeSegments.length; index += 1) {
    const nextCursor = kmCursor + activeSegments[index].km;
    if (coveredKm <= nextCursor || index === activeSegments.length - 1) {
      activeIndex = index;
      break;
    }
    kmCursor = nextCursor;
  }

  const activeSegment = activeSegments[activeIndex];
  const segmentProgress = (coveredKm - kmCursor) / activeSegment.km;
  const upcomingSegment = activeSegments[Math.min(activeIndex + 1, activeSegments.length - 1)];

  // Fetch real-time weather for current and upcoming coordinates/places
  let currentLocQ = activeSegment.from;
  if (searchParams.get("lat") && searchParams.get("lon")) {
    currentLocQ = `${searchParams.get("lat")},${searchParams.get("lon")}`;
  } else if (searchParams.get("currentPlace")) {
    currentLocQ = searchParams.get("currentPlace");
  }

  let upcomingLocQ = upcomingSegment.to;
  if (searchParams.get("nextLat") && searchParams.get("nextLon")) {
    upcomingLocQ = `${searchParams.get("nextLat")},${searchParams.get("nextLon")}`;
  } else if (searchParams.get("upcomingPlace")) {
    upcomingLocQ = searchParams.get("upcomingPlace");
  }
  
  const weatherCurrent = await fetchWeather(currentLocQ);
  const weatherUpcoming = await fetchWeather(upcomingLocQ);

  // Fetch real-time news for the vehicle's current route segment via NewsAPI.org
  const newsAlerts = await fetchNewsAPI(activeSegment.from, activeSegment.to);

  // Fetch DuckDuckGo news for disaster-zone via-places
  const disasterViaPlaces = activePlaces
    ? activePlaces
        .map(p => p.name)
        .filter(name => disasterZones.some(z => z.place.toLowerCase().trim() === name.toLowerCase().trim()))
    : [];
  if (disasterViaPlaces.length > 0) {
    try {
      const ddgArticles = await fetchDuckDuckGoNewsForPlaces(disasterViaPlaces);
      if (ddgArticles.length > 0) {
        runDisasterScan(ddgArticles);
        console.log(`[DDG News] Scanned ${ddgArticles.length} DDG articles for ${disasterViaPlaces.length} disaster-zone places.`);
      }
    } catch (err) {
      console.warn("[DDG News] Integration failed:", err.message);
    }
  }
  
  // AI Risk Prediction Engine & Strict News Filter
  let activeDangerAlerts = [];
  let roadIssuesDetected = false;
  let riskScore = 12; // Base risk
  
  const placesToCheck = activePlaces ? activePlaces.map(p => p.name.toLowerCase()) : [plan.from.toLowerCase(), plan.to.toLowerCase()].filter(Boolean);
  const hazardKeywords = ["landslide", "blocked", "closed", "accident", "washout", "flooding", "waterlogging", "jam", "protest", "strike", "blockade", "bandh"];

  // Strict genuine filter
  const filteredGenuineNews = [];
  const naturalDisasterKeywords = [
    "earthquake", "seismic activity", "tremor", "aftershock", "foreshock", "fault line", "tectonic plates", 
    "ground shaking", "surface rupture", "liquefaction", "land subsidence", "tsunami", "tidal wave", "storm surge", 
    "rogue wave", "coastal flooding", "ocean surge", "cyclone", "tropical cyclone", "hurricane", "typhoon", 
    "severe storm", "windstorm", "thunderstorm", "supercell", "tornado", "waterspout", "dust storm", "sandstorm", 
    "hailstorm", "lightning", "cloudburst", "heavy rainfall", "extreme rainfall", "rainstorm", "monsoon", 
    "monsoon flood", "flash flood", "river flood", "urban flood", "coastal flood", "inland flood", "flooding", 
    "overflow", "dam failure", "levee breach", "waterlogging", "landslide", "mudslide", "rockslide", "rockfall", 
    "debris flow", "soil erosion", "erosion", "sinkhole", "avalanche", "snow avalanche", "ice avalanche", 
    "glacial lake outburst flood", "glof", "glacier melt", "icefall", "blizzard", "snowstorm", "cold wave", 
    "heat wave", "heat dome", "extreme heat", "cold spell", "frost", "freeze", "drought", "meteorological drought", 
    "agricultural drought", "hydrological drought", "water scarcity", "desertification", "wildfire", "forest fire", 
    "bushfire", "grassfire", "peat fire", "volcanic eruption", "lava flow", "ashfall", "volcanic ash", 
    "pyroclastic flow", "lahar", "volcanic gas", "magma", "crater eruption", "famine", "locust swarm", 
    "pest outbreak", "disease outbreak", "epidemic", "pandemic", "biological disaster", "environmental disaster", 
    "climate disaster", "climate change", "global warming", "sea level rise", "coastal erosion", "ocean acidification", 
    "extreme weather", "natural hazard", "geological hazard", "hydrological hazard", "meteorological hazard", 
    "climatological hazard", "environmental hazard", "disaster risk", "hazard mapping", "disaster management", 
    "disaster preparedness", "disaster mitigation", "disaster response", "disaster recovery", "early warning system", 
    "evacuation", "emergency shelter", "search and rescue", "relief operation", "humanitarian aid", "emergency response", 
    "first responder", "casualties", "fatalities", "injuries", "missing persons", "displacement", 
    "internally displaced persons", "refugee crisis", "property damage", "infrastructure damage", "crop damage", 
    "livestock loss", "economic loss", "power outage", "communication failure", "road blockage", "bridge collapse", 
    "building collapse", "structural failure", "contamination", "water contamination", "air pollution", 
    "soil contamination", "radiation leak", "nuclear disaster", "chemical spill", "industrial accident", 
    "oil spill", "gas leak", "explosion", "mine collapse", "dam collapse", "reservoir breach", "dike failure", 
    "levee failure", "urban resilience", "community resilience", "risk assessment", "hazard assessment", 
    "vulnerability assessment", "exposure analysis", "resilience planning", "adaptation", "climate adaptation", 
    "disaster resilience", "evacuation route", "safe zone", "relief camp", "temporary shelter", "emergency kit", 
    "survival kit", "food shortage", "drinking water shortage", "sanitation crisis", "public health emergency", 
    "disease surveillance", "vector-borne disease", "waterborne disease", "cholera outbreak", "malaria outbreak", 
    "dengue outbreak", "heat stress", "heat exhaustion", "heat stroke", "hypothermia", "air quality", 
    "smoke pollution", "forest degradation", "ecosystem damage", "biodiversity loss", "habitat destruction", 
    "crop failure", "food insecurity", "livelihood loss", "insurance claims", "disaster relief fund", 
    "hazard zoning", "risk mapping", "remote sensing", "satellite imagery", "gis", "disaster prediction", 
    "hazard forecast", "weather warning", "seismic monitoring", "rainfall intensity", "wind speed", 
    "temperature anomaly", "precipitation anomaly", "storm tracking", "cyclone tracking", "earth observation", 
    "hazard index", "risk index", "rescue mission", "evacuation order", "warning alert", "emergency alert", 
    "disaster declaration", "emergency operations center", "incident management", "crisis management", 
    "civil defense", "disaster awareness", "preparedness drill", "community warning", "hazard communication", 
    "risk communication", "reconstruction", "rehabilitation", "resettlement", "recovery planning", 
    "disaster database", "natural catastrophe", "catastrophic event", "extreme event", "hazard event", 
    "multi-hazard", "compound disaster", "secondary disaster", "cascading disaster", "climate resilience", 
    "resilience index", "disaster hotspot", "hazard hotspot", "vulnerable population", "critical infrastructure", 
    "disaster analytics", "hazard detection", "disaster monitoring", "disaster forecasting", "impact assessment", 
    "loss estimation", "damage assessment", "rapid response", "rescue operation", "aid distribution", 
    "emergency logistics", "disaster coordination", "disaster simulation", "hazard modeling", "vulnerability mapping", 
    "risk reduction", "build back better", "sustainable recovery"
  ];

  newsAlerts.forEach(item => {
    const titleL = (item.title || "").toLowerCase();
    const descL = (item.description || "").toLowerCase();
    
    const hasPlace = placesToCheck.some(p => {
      const regex = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
      return regex.test(titleL) || regex.test(descL);
    });
    const isNaturalDisaster = naturalDisasterKeywords.some(w => titleL.includes(w) || descL.includes(w));
    
    // Check if the news is very recent (published within the last 72 hours)
    const pubTime = Date.parse(item.pubDate);
    const isRecent = !isNaN(pubTime) && (Date.now() - pubTime) <= 72 * 60 * 60 * 1000;
    
    if (hasPlace && isNaturalDisaster && isRecent) {
      const genuineItem = { ...item, isMapNotification: true };
      filteredGenuineNews.push(genuineItem);
      activeDangerAlerts.push(genuineItem);
      roadIssuesDetected = true;
    }
  });

  // 1. Scan fetched news articles against the disaster zones database and save any matches
  runDisasterScan(newsAlerts);

  // 2. Get all notifications in our database that match places along the route
  const allNotifications = loadNotifications();
  const routePlaceNames = new Set(activePlaces ? activePlaces.map(p => p.name.toLowerCase().trim()) : []);
  
  const matchedRouteNotifications = allNotifications.filter(row => 
    routePlaceNames.has(row.place.toLowerCase().trim())
  );

  matchedRouteNotifications.forEach(notif => {
    // Avoid duplicate warnings in activeDangerAlerts
    if (!activeDangerAlerts.some(a => a.title.includes(notif.place))) {
      const matchedPt = activePlaces.find(p => p.name.toLowerCase().trim() === notif.place.toLowerCase().trim()) || {};
      
      // Verify database notification is recent and about a natural disaster
      const pubTime = Date.parse(notif.published_at);
      const isRecent = !isNaN(pubTime) && (Date.now() - pubTime) <= 72 * 60 * 60 * 1000;
      
      const tagsL = (notif.disaster_tags || "").toLowerCase();
      const headlineL = (notif.headline || "").toLowerCase();
      const isNaturalDisaster = naturalDisasterKeywords.some(w => tagsL.includes(w) || headlineL.includes(w));
      
      if (isRecent && isNaturalDisaster) {
        const dbAlert = {
          title: `🚨 HAZARD ZONE DETECTED: ${notif.place} (${notif.state})`,
          link: notif.source_url,
          pubDate: notif.published_at,
          description: `Headline: ${notif.headline}. Tagged disaster: ${notif.disaster_tags}. (Verified in database)`,
          source: notif.source_feed,
          isMapNotification: true,
          place: notif.place,
          state: notif.state,
          lat: matchedPt.lat || (activeSegment.points && activeSegment.points[0] ? activeSegment.points[0][1] : 20.0),
          lon: matchedPt.lon || (activeSegment.points && activeSegment.points[0] ? activeSegment.points[0][0] : 78.0)
        };
        filteredGenuineNews.push(dbAlert);
        activeDangerAlerts.push(dbAlert);
        roadIssuesDetected = true;
        riskScore += 30; // High risk boost for active disasters
      }
    }
  });

  // 3. Extract the active matched disaster zones to return to the client
  const matchedRouteDisasterZones = disasterZones.filter(z => 
    routePlaceNames.has(z.place.toLowerCase().trim())
  );

  // Inject data-driven genuine alerts directly into the news stream for the map notifications
  activeSegments.forEach((seg, idx) => {
    if (seg.roadType && seg.roadType.includes("Landslide")) {
      filteredGenuineNews.push({
        title: `🚨 Historical Landslide Risk: ${seg.from} to ${seg.to}`,
        link: "#",
        pubDate: new Date().toUTCString(),
        description: `This segment has high historical landslide incidents recorded. Watch for weather changes.`,
        source: "Historical Records Database",
        isMapNotification: true,
        lat: seg.points[0][1],
        lon: seg.points[0][0]
      });
      if (idx === activeIndex || idx === activeIndex + 1) {
        roadIssuesDetected = true;
        riskScore += 35; // high landslide risk
      }
    }
  });

  // Ingest EONET events near this segment
  (eonetCache || []).forEach(e => {
    const dist = getDistanceKm(activeSegment.points[0][1], activeSegment.points[0][0], e.lat, e.lon);
    if (dist < 40) {
      filteredGenuineNews.push({
        title: `⚠️ NASA EONET Incident: ${e.title}`,
        link: "#",
        pubDate: e.date || new Date().toUTCString(),
        description: `NASA satellite detected an active natural event (${e.categories?.[0]?.title || "hazard"}) within 40km of active route.`,
        source: "NASA Earth Observatory",
        isMapNotification: true,
        lat: e.lat,
        lon: e.lon
      });
      roadIssuesDetected = true;
      riskScore += 30;
    }
  });

  // Ingest weather precipitation alert
  const currentPrecip = (weatherCurrent.current && weatherCurrent.current.precip_mm) || 0;
  if (currentPrecip > 5.0) {
    filteredGenuineNews.push({
      title: `🌧️ Heavy Precipitation alert: ${weatherCurrent.location.name}`,
      link: "#",
      pubDate: new Date().toUTCString(),
      description: `Active rain gauge detects heavy rainfall of ${currentPrecip} mm. Drive under safe limits.`,
      source: "Live Weather Station",
      isMapNotification: true,
      lat: weatherCurrent.location.lat,
      lon: weatherCurrent.location.lon
    });
    roadIssuesDetected = true;
    riskScore += 25;
  }

  // 2. Weather risk contribution
  const wPrec = (weatherCurrent.current && weatherCurrent.current.precip_mm) || 0;
  const wWind = (weatherCurrent.current && weatherCurrent.current.wind_kph) || 0;
  
  if (wPrec > 0) riskScore += Math.min(wPrec * 4.5, 30);
  if (wWind > 20) riskScore += Math.min((wWind - 20) * 1.5, 15);
  
  // 3. Road geometry contribution
  if (activeSegment.type === "rain") {
    riskScore += 25;
  } else if (activeSegment.type === "forest") {
    riskScore += 15;
  } else if (activeSegment.type === "traffic") {
    riskScore += 10;
  }

  // Clamp and finalize risk rating
  riskScore = Math.min(Math.round(riskScore), 100);
  let riskLevel = "Low";
  let drivingAdvice = "Optimal driving conditions. Maintain speed limits.";
  
  if (riskScore >= 70) {
    riskLevel = "Critical";
    drivingAdvice = "⚠️ STAY BACK ALERT! Extreme hazard ahead. slippery road, protest risk or natural disaster active. Postpone driving until conditions clear.";
  } else if (riskScore >= 45) {
    riskLevel = "High";
    drivingAdvice = "⚠️ High risk ahead. Road curvature is steep and surface is wet. Limit speed to 40 km/h and increase following distance.";
  } else if (riskScore >= 25) {
    riskLevel = "Medium";
    drivingAdvice = "Moderate risk. Winding path or light precipitation. Drive carefully at around 55 km/h.";
  }

  // Suggest hotels if upcoming zone contains some hazard/disaster zone, rain, or news alert
  const upcomingPrecip = (weatherUpcoming.current && weatherUpcoming.current.precip_mm) || 0;
  const upcomingPlaces = [upcomingSegment.from.toLowerCase(), upcomingSegment.to.toLowerCase()];
  const upcomingHasNewsDisaster = activeDangerAlerts.some(alert => {
    const titleL = alert.title.toLowerCase();
    const descL = alert.description.toLowerCase();
    return upcomingPlaces.some(p => {
      if (!p) return false;
      const regex = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
      return regex.test(titleL) || regex.test(descL);
    });
  });
  const upcomingIsCsvDisaster = disasterZones.some(z => 
    upcomingPlaces.includes(z.place.toLowerCase().trim())
  );

  const upcomingIsDangerous = upcomingSegment.type === "rain" || 
                              upcomingSegment.type === "forest" || 
                              upcomingIsCsvDisaster || 
                              upcomingHasNewsDisaster || 
                              upcomingPrecip > 0.0 || 
                              riskScore >= 50;

  // NDVI-based Speed limits
  const activeNdvi = activeSegment.ndvi;
  const speedLimit = getSpeedLimitForNdvi(activeNdvi);
  const speedAdjustment = riskLevel === "Critical" ? -25 : riskLevel === "High" ? -15 : riskLevel === "Medium" ? -5 : 0;
  const safeSpeed = clamp(speedLimit + speedAdjustment + Math.round(pulse * 2), 15, speedLimit);
  let currentSpeed = clamp(safeSpeed + Math.round(Math.cos(elapsedSeconds / 4) * 6), 10, speedLimit + 5);
  if (progress === 0 || progress >= 0.998) {
    currentSpeed = 0;
  }

  const delayMinutes = activeSegments
    .slice(activeIndex)
    .reduce((sum, segment) => {
      let baseDelay = 0;
      if (segment.type === "rain") baseDelay = 15;
      else if (segment.type === "traffic") baseDelay = 10;
      else if (segment.type === "forest") baseDelay = 5;
      return sum + baseDelay + Math.round(Math.abs(pulse) * 5);
    }, 0);

  // Generate dynamic hotels list based on route places (using Overpass hotels, filter out Spas)
  const cachedHotels = cached ? cached.hotels : [];
  const hotelsForRoute = [];
  const passengersCount = Number(plan.passengers || 1);
  
  if (activePlaces) {
    // If upcoming location contains some hazard/disaster zone, prioritize and list at least 5 hotels for that upcoming place!
    if (upcomingIsDangerous) {
      const upcomingPlaceObj = activePlaces[activeIndex + 1] || activePlaces[activeIndex] || endPlace;
      const localHotels = [];
      
      // 1. Try SerpApi if available
      if (SERPAPI_API_KEY) {
        try {
          const serpapiHotels = await fetchSerpapiHotels(upcomingPlaceObj.name, upcomingPlaceObj.lat, upcomingPlaceObj.lon);
          serpapiHotels.forEach(h => {
            localHotels.push({
              name: h.name,
              place: upcomingPlaceObj.name,
              lat: h.lat,
              lon: h.lon,
              etaMin: 35,
              price: h.price,
              pricePerPerson: Math.round(h.price / passengersCount),
              bookingLink: h.bookingLink,
              agodaLink: h.agodaLink
            });
          });
        } catch (e) {
          console.warn("[SerpApi Hotels] Failed to fetch:", e.message);
        }
      }
      
      // 2. Try cache
      if (localHotels.length < 5) {
        const nearHotels = cachedHotels
          ? cachedHotels.filter(h => getDistanceKm(h.lat, h.lon, upcomingPlaceObj.lat, upcomingPlaceObj.lon) < 25)
          : [];
        const cleanHotels = nearHotels.filter(h => {
          const name = (h.tags.name || "").toLowerCase();
          return !name.includes("spa") && !name.includes("massage");
        });
        
        cleanHotels.forEach(h => {
          if (localHotels.length < 5) {
            const name = h.tags.name || h.tags.place || "Local Hotel";
            const hotelPrice = 1600 + Math.round(Math.sin(localHotels.length) * 300);
            localHotels.push({
              name: name,
              place: upcomingPlaceObj.name,
              lat: h.lat,
              lon: h.lon,
              etaMin: 35 + localHotels.length * 5,
              price: hotelPrice,
              pricePerPerson: Math.round(hotelPrice / passengersCount),
              bookingLink: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(name + ", " + upcomingPlaceObj.name)}`,
              agodaLink: `https://www.agoda.com/search?query=${encodeURIComponent(name + ", " + upcomingPlaceObj.name)}`
            });
          }
        });
      }
      
      // 3. Fallbacks to guarantee at least 5 hotels (NO OYO/SPA)
      const hotelFallbacks = [
        "Gateway Hotel & Suites",
        "Treebo Trend Premium Stay",
        "Sterling Residency",
        "Ginger Hotel & Comforts",
        "Radisson Country Inn",
        "The Fern Premium Resort"
      ];
      let fallbackIdx = 0;
      while (localHotels.length < 5 && fallbackIdx < hotelFallbacks.length) {
        const name = `${upcomingPlaceObj.name} ${hotelFallbacks[fallbackIdx]}`;
        const hotelPrice = 1400 + fallbackIdx * 450;
        localHotels.push({
          name: name,
          place: upcomingPlaceObj.name,
          lat: upcomingPlaceObj.lat + (Math.sin(fallbackIdx) * 0.005),
          lon: upcomingPlaceObj.lon + (Math.cos(fallbackIdx) * 0.005),
          etaMin: 30 + fallbackIdx * 8,
          price: hotelPrice,
          pricePerPerson: Math.round(hotelPrice / passengersCount),
          bookingLink: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(name + ", " + upcomingPlaceObj.name)}`,
          agodaLink: `https://www.agoda.com/search?query=${encodeURIComponent(name + ", " + upcomingPlaceObj.name)}`
        });
        fallbackIdx++;
      }
      
      // Add all of them to our hotels list
      hotelsForRoute.push(...localHotels);
    } else {
      // Normal hotel listing logic
      const placesToSearch = activePlaces.slice(activeIndex, activeIndex + 3);
      for (let idx = 0; idx < placesToSearch.length; idx++) {
        const p = placesToSearch[idx];
        
        let serpapiHotels = [];
        if (SERPAPI_API_KEY) {
          serpapiHotels = await fetchSerpapiHotels(p.name, p.lat, p.lon);
        }
        
        if (serpapiHotels.length > 0) {
          serpapiHotels.forEach(h => {
            hotelsForRoute.push({
              name: h.name,
              place: h.place,
              lat: h.lat,
              lon: h.lon,
              etaMin: 30 + idx * 45,
              price: h.price,
              pricePerPerson: Math.round(h.price / passengersCount),
              bookingLink: h.bookingLink,
              agodaLink: h.agodaLink
            });
          });
        } else {
          const nearHotels = cachedHotels
            ? cachedHotels.filter(h => getDistanceKm(h.lat, h.lon, p.lat, p.lon) < 15)
            : [];
          const cleanHotels = nearHotels.filter(h => {
            const name = (h.tags.name || "").toLowerCase();
            return !name.includes("spa") && !name.includes("massage");
          });
          
          if (cleanHotels.length > 0) {
            cleanHotels.slice(0, 2).forEach(h => {
              const name = h.tags.name;
              const hotelPrice = 1500 + Math.round(Math.sin(idx) * 300);
              hotelsForRoute.push({
                name: name,
                place: p.name,
                lat: h.lat,
                lon: h.lon,
                etaMin: 30 + idx * 45,
                price: hotelPrice,
                pricePerPerson: Math.round(hotelPrice / passengersCount),
                bookingLink: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(name + ", " + p.name)}`,
                agodaLink: `https://www.agoda.com/search?query=${encodeURIComponent(name + ", " + p.name)}`
              });
            });
          } else {
            // Fallback names (NO SPA/OYO)
            const fallbacks = [`${p.name} Gateway Hotel`, `Treebo Trend ${p.name} Comfort`, `Sterling ${p.name} Residency`];
            fallbacks.forEach((name, fIdx) => {
              const hotelPrice = 1300 + fIdx * 500;
              hotelsForRoute.push({
                name,
                place: p.name,
                lat: p.lat,
                lon: p.lon,
                etaMin: 35 + idx * 45 + fIdx * 10,
                price: hotelPrice,
                pricePerPerson: Math.round(hotelPrice / passengersCount),
                bookingLink: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(name + ", " + p.name)}`,
                agodaLink: `https://www.agoda.com/search?query=${encodeURIComponent(name + ", " + p.name)}`
              });
            });
          }
        }
      }
    }
  }

  const hotels = (hotelsForRoute.length > 0 ? hotelsForRoute : hotelPool.map(h => {
    const hotelPrice = h.price;
    return {
      ...h,
      pricePerPerson: Math.round(hotelPrice / passengersCount),
      bookingLink: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(h.name + ", " + h.place)}`,
      agodaLink: `https://www.agoda.com/search?query=${encodeURIComponent(h.name + ", " + h.place)}`
    };
  }))
    .map((hotel, index) => ({
      ...hotel,
      etaMin: hotel.etaMin + activeIndex * 6 + Math.round(Math.sin(elapsedSeconds / (4 + index)) * 4),
      rooms: 1 + ((elapsedSeconds + index) % 5)
    }))
    .sort((a, b) => a.etaMin - b.etaMin)
    .slice(0, 5);

  let nearestPlace = null;
  if (searchParams.get("lat") && searchParams.get("lon")) {
    nearestPlace = await reverseGeocode(parseFloat(searchParams.get("lat")), parseFloat(searchParams.get("lon")));
  }

  return {
    app: "E-Horizon Travel Pro Dashboard",
    generatedAt: new Date(now).toISOString(),
    refreshEveryMs: 2000,
    plan,
    startPlace: cached ? cached.startPlace : null,
    endPlace: cached ? cached.endPlace : null,
    alternatives,
    route: {
      totalKm,
      coveredKm: Math.round(coveredKm),
      remainingKm: Math.max(0, Math.round(totalKm - coveredKm)),
      progress: Number(progress.toFixed(4)),
      coordinates: activeCoords,
      elevations: activeElevations || activeCoords.map(() => 50),
      segments: activeSegments.map((segment) => ({
        ...segment,
        color: getSegmentColor(segment, weatherCurrent, weatherUpcoming, activeDangerAlerts, riskScore),
        lengthScore: Number(distanceForSegment(segment).toFixed(3))
      }))
    },
    vehicle: {
      label: plan.vehicle,
      currentPlace: activeSegment.from,
      nearestPlace: nearestPlace || activeSegment.from,
      nextPlace: activeSegment.to,
      position: positionOnSegment(activeSegment, segmentProgress),
      currentSpeed,
      safeSpeed,
      speedLimit,
      segmentProgress: Number(clamp(segmentProgress, 0, 1).toFixed(3))
    },
    conditions: {
      current: {
        place: weatherCurrent.location.name,
        climate: weatherCurrent.current.condition.text,
        temperatureC: Math.round(weatherCurrent.current.temp_c),
        windKph: weatherCurrent.current.wind_kph,
        humidity: weatherCurrent.current.humidity,
        precipMm: weatherCurrent.current.precip_mm,
        severity: riskLevel.toLowerCase()
      },
      upcoming: {
        place: weatherUpcoming.location.name,
        climate: weatherUpcoming.current.condition.text,
        temperatureC: Math.round(weatherUpcoming.current.temp_c),
        risk: upcomingSegment.title,
        color: upcomingIsDangerous ? "#ef4444" : typeColor[upcomingSegment.type] || "#1e9d55"
      },
      delayMinutes,
      routeStatus: riskLevel === "Critical" ? "Reroute suggested" : "Route active"
    },
    newsAlerts: filteredGenuineNews,
    activeDangerAlerts,
    roadIssuesDetected,
    viaPlaces: activePlaces ? activePlaces.map(p => {
      const dzMatch = disasterZones.find(z => z.place.toLowerCase().trim() === p.name.toLowerCase().trim());
      const hasActiveNews = activeDangerAlerts.some(a => 
        (a.title || "").toLowerCase().includes(p.name.toLowerCase().trim()) ||
        (a.description || "").toLowerCase().includes(p.name.toLowerCase().trim())
      );
      return {
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        isDisasterZone: !!dzMatch,
        disasterType: dzMatch ? dzMatch.disaster : null,
        hasActiveNews: hasActiveNews
      };
    }) : [],
    disasterZones: matchedRouteDisasterZones,
    risk: {
      score: riskScore,
      level: riskLevel,
      drivingAdvice
    },
    vegetation: {
      index: activeNdvi,
      density: activeNdvi >= 0.7 ? "Dense Forest" : activeNdvi >= 0.5 ? "Moderate Cover" : activeNdvi >= 0.3 ? "Open Plains" : "Urban Area"
    },
    suggestHotels: upcomingIsDangerous,
    hotels,
    legend: [
      { key: "rain", label: "Rain / Slide / Fire danger", color: "#ef4444", meaning: "Reduce speed or stop" },
      { key: "disaster", label: "Disaster Zone (CSV)", color: "#f59e0b", meaning: "Known hazard-prone area" },
      { key: "safe", label: "Optimal Route", color: "#10b981", meaning: "Clear driving conditions" },
      { key: "forest", label: "Vegetative / Forest curve", color: "#065f46", meaning: "Watch for animal crossings" },
      { key: "traffic", label: "Congestion Zone", color: "#f59e0b", meaning: "Moderate delay expected" }
    ]
  };
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*" // CORS support
  });
  response.end(body);
}

function sendStatic(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff"
  };

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": mimeTypes[extension] || "application/octet-stream" });
    response.end(content);
  });
}

async function getOrBuildRoutes(from, to) {
  const cacheKey = `${from.toLowerCase().trim()}_${to.toLowerCase().trim()}`;
  if (routeCache[cacheKey]) {
    return routeCache[cacheKey];
  }
  
  console.log(`[Route Planner] Geocoding endpoints: "${from}" to "${to}"`);
  const startPlace = await geocodePlace(from);
  const endPlace = await geocodePlace(to);
  
  console.log(`[Route Planner] Fetching driving routes through ${MAP_PROVIDER} integration...`);
  let drivingRoutes;
  try {
    drivingRoutes = await fetchRoutes(startPlace, endPlace);
  } catch (err) {
    console.warn(`[Route Planner] fetchRoutes failed, generating direct fallback path:`, err.message);
    drivingRoutes = [{
      geometry: {
        type: "LineString",
        coordinates: [
          [startPlace.lon, startPlace.lat],
          [(startPlace.lon + endPlace.lon) / 2, (startPlace.lat + endPlace.lat) / 2],
          [endPlace.lon, endPlace.lat]
        ]
      }
    }];
  }
  
  // Find combined bounding box
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  drivingRoutes.forEach(r => {
    r.geometry.coordinates.forEach(([lon, lat]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    });
  });
  
  // Expand slightly
  minLat -= 0.05;
  maxLat += 0.05;
  minLon -= 0.05;
  maxLon += 0.05;
  
  console.log(`[Route Planner] Fetching places along routes inside bounding box...`);
  let rawPlaces = [];
  try {
    rawPlaces = await fetchPlacesInBbox(minLat, minLon, maxLat, maxLon);
  } catch (err) {
    console.warn(`[Route Planner] fetchPlacesInBbox failed, using empty places list:`, err.message);
  }
  console.log(`[Route Planner] Found ${rawPlaces.length} potential places.`);
  
  const routes = [];
  drivingRoutes.forEach((route, idx) => {
    console.log(`[Route Planner] Processing segments for Route alternative ${idx}...`);
    const rData = buildSegmentsForRoute(route.geometry.coordinates, startPlace, endPlace, rawPlaces);
    routes.push(rData);
  });
  
  // Extract hotels from elements (any element that is tourism=hotel/guest_house/motel)
  const rawHotels = rawPlaces.filter(el => el.tags && el.tags.tourism);
  
  const result = {
    startPlace,
    endPlace,
    routes,
    hotels: rawHotels
  };
  
  routeCache[cacheKey] = result;
  return result;
}

let eonetCache = null;
let lastEonetFetch = 0;

async function getCachedNasaEvents(days) {
  const cacheDuration = 10 * 60 * 1000; // 10 minutes
  if (eonetCache && (Date.now() - lastEonetFetch < cacheDuration)) {
    return eonetCache;
  }
  
  try {
    const url = `https://eonet.gsfc.nasa.gov/api/v3/events?days=${days}&limit=300`;
    console.log(`[API Request] NASA EONET events query for ${days} days via URL: ${url}`);
    const res = await fetch(url);
    console.log(`[API Response] NASA EONET events status: ${res.status} ${res.statusText}`);
    if (!res.ok) throw new Error(`EONET API failed: ${res.statusText}`);
    const data = await res.json();
    const rawEvents = data.events || [];
    console.log(`[NASA EONET Data] Successfully retrieved ${rawEvents.length} raw hazard events.`);
    
    const filtered = rawEvents.map(event => {
      const coords = [];
      if (event.geometry) {
        event.geometry.forEach(g => {
          if (g.type === "Point") {
            const [lon, lat] = g.coordinates;
            coords.push({ lat, lon, date: g.date });
          } else if (g.type === "Polygon") {
            const ring = g.coordinates[0];
            const avgLon = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
            const avgLat = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
            coords.push({ lat: avgLat, lon: avgLon, date: g.date });
          }
        });
      }
      if (coords.length === 0) return null;
      const latest = coords[coords.length - 1];
      const isIndia = latest.lat >= 5.0 && latest.lat <= 38.0 && latest.lon >= 65.0 && latest.lon <= 98.0;
      
      return {
        id: event.id,
        title: event.title,
        categories: event.categories,
        sources: event.sources,
        closed: event.closed,
        lat: latest.lat,
        lon: latest.lon,
        date: latest.date,
        isIndia
      };
    }).filter(Boolean);
    
    eonetCache = filtered;
    lastEonetFetch = Date.now();
    return eonetCache;
  } catch (error) {
    console.error("[NASA Events fetch failed]", error.message);
    return eonetCache || [];
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (url.pathname === "/api/map-config" && request.method === "GET") {
    sendJson(response, 200, {
      provider: MAP_PROVIDER,
      nasaApiKey: NASA_API_KEY
    });
    return;
  }

  if (url.pathname === "/api/nasa-events" && request.method === "GET") {
    try {
      const days = Number(url.searchParams.get("days") || 30);
      const events = await getCachedNasaEvents(days);
      sendJson(response, 200, { ok: true, events });
    } catch (e) {
      sendJson(response, 500, { ok: false, message: e.message });
    }
    return;
  }

  if (url.pathname === "/api/nasa-imagery" && request.method === "GET") {
    try {
      const lat = url.searchParams.get("lat");
      const lon = url.searchParams.get("lon");
      const date = url.searchParams.get("date") || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const fetchUrl = `https://api.nasa.gov/planetary/earth/imagery?lat=${lat}&lon=${lon}&dim=0.1&date=${date}&api_key=${NASA_API_KEY}`;
      console.log(`[API Request] NASA Planetary Imagery query for lat: ${lat}, lon: ${lon}, date: ${date}`);
      const res = await fetch(fetchUrl);
      console.log(`[API Response] NASA Planetary Imagery status: ${res.status} ${res.statusText}`);
      if (res.ok) {
        sendJson(response, 200, { ok: true, url: res.url });
      } else {
        sendJson(response, 404, { ok: false, message: "Satellite imagery not available" });
      }
    } catch (e) {
      sendJson(response, 500, { ok: false, message: e.message });
    }
    return;
  }

  if (url.pathname === "/api/trip-state" && request.method === "GET") {
    try {
      const state = await buildTripStateAsync(url.searchParams);
      sendJson(response, 200, state);
    } catch (e) {
      console.error("[Trip State Error]", e.message);
      sendJson(response, 500, { ok: false, message: e.message });
    }
    return;
  }

  if (url.pathname === "/api/plan" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const payload = JSON.parse(body || "{}");
      const from = String(payload.from || "").slice(0, 40).trim();
      const to = String(payload.to || "").slice(0, 40).trim();
      
      if (!from || !to) {
        sendJson(response, 400, { ok: false, message: "Origin and destination are required" });
        return;
      }
      
      plan = {
        from,
        to,
        vehicle: String(payload.vehicle || "Car").slice(0, 30),
        passengers: clamp(Number(payload.passengers || 1), 1, 9),
        updatedAt: new Date().toISOString()
      };
      
      // Warm up the route cache in the background
      try {
        await getOrBuildRoutes(from, to);
      } catch (err) {
        console.warn(`[Route Builder] Dynamic routing failed, using fallback:`, err.message);
      }
      
      demoStart = Date.now();
      sendJson(response, 200, { ok: true, plan });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: "Invalid plan payload" });
    }
    return;
  }

  const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  sendStatic(response, filePath);
});

server.listen(PORT, () => {
  console.log(`E-Horizon Travel Pro Dashboard running at http://localhost:${PORT}`);
});

