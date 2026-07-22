// ─── State ───
let map = null;
let tripState = null;
let nasaEvents = [];
let userPosition = null;
let gpsCityName = "";
let gpsSpeed = 0;
let gpsWatchId = null;
let hasAutoFilledGPS = false;
let hasRealGpsFilled = false;
let is3DMode = false;
let isDark = true;
let vehicleMarker = null;
let animationFrame = null;
let demoProgress = 0;
let demoStartTime = Date.now();
let isCameraLocked = true;

let smoothCamCenter = null;
let smoothCamBearing = null;
let smoothCamPitch = null;

let mapStyleIndex = 0; // 0 = Esri Satellite, 1 = GIBS TrueColor, 2 = NDVI, 3 = Dark, 4 = Voyager
let isDijkstraRunning = false;
let isFirstLoad = true;
let activeRouteIndex = 0;
let planAbortController = null;

let currentRouteCoords = [];
let currentRouteSegments = [];

// Three.js instances
let globeAnim = null;
let weatherOverlay = null;

// Real-time smoothing & tracking state
let currentClientSpeed = undefined;
let shownNotificationIds = new Set();
let lastDeviationCheckTime = 0;
let deviationTicks = 0;

// ─── DOM References ───
const $ = (id) => document.getElementById(id);
const ui = {
  loadingScreen: $("loadingScreen"),
  loaderFill: $("loaderFill"),
  connectionStatus: $("connectionStatus"),
  gpsStatus: $("gpsStatus"),
  currentPlace: $("currentPlace"),
  elevationDisplay: $("elevationDisplay"),
  progressPercent: $("progressPercent"),
  progressRing: $("progressRing"),
  remainingDistance: $("remainingDistance"),
  currentSpeed: $("currentSpeed"),
  gaugeArc: $("gaugeArc"),
  metricSpeed: $("metricSpeed"),
  metricSafeSpeed: $("metricSafeSpeed"),
  metricDelay: $("metricDelay"),
  metricStatus: $("metricStatus"),
  
  // AI Copilot elements
  riskScore: $("riskScore"),
  riskLevelBadge: $("riskLevelBadge"),
  riskRingArc: $("riskRingArc"),
  ndviDisplay: $("ndviDisplay"),
  ndviSpeedBoard: $("ndviSpeedBoard"),
  drivingAdvice: $("drivingAdvice"),

  // Weather Widget elements
  weatherTemp: $("weatherTemp"),
  weatherDesc: $("weatherDesc"),
  weatherHumidity: $("weatherHumidity"),
  weatherWind: $("weatherWind"),
  weatherPrecip: $("weatherPrecip"),
  nextWeatherTemp: $("nextWeatherTemp"),
  nextWeatherDesc: $("nextWeatherDesc"),
  upcomingPlace: $("upcomingPlace"),

  // Feed elements
  googleNewsList: $("googleNewsList"),
  hotelAlertBanner: $("hotelAlertBanner"),
  hotelList: $("hotelList"),

  travelPlan: $("travelPlan"),
  planMeta: $("planMeta"),
  legendList: $("legendList"),
  nasaEventList: $("nasaEventList"),
  eventCount: $("eventCount"),
  alertBanner: $("alertBanner"),
  alertText: $("alertText"),
  roadType: $("roadType"),
  roadCurvature: $("roadCurvature"),
  landslideRisk: $("landslideRisk"),
  rainFrequency: $("rainFrequency"),
  
  planForm: $("planForm"),
  fromInput: $("fromInput"),
  toInput: $("toInput"),
  vehicleInput: $("vehicleInput"),
  passengerInput: $("passengerInput"),
  bottomHud: $("bottomHud"),
  
  btn3DToggle: $("btn3DToggle"),
  btnRecenter: $("btnRecenter"),
  btnFullscreen: $("btnFullscreen"),
  btnMapStyleSelect: $("btnMapStyleSelect"),
  btnNasaLayer: $("btnNasaLayer"),
  toggleTheme: $("toggleTheme"),

  // Placeholder and Modal
  mapPlaceholder: $("mapPlaceholder"),
  map3d: $("map3d"),
  mapStyleLabel: $("mapStyleLabel"),
  hazardModal: $("hazardModal"),
  hazardModalSummary: $("hazardModalSummary"),
  hazardDetailsList: $("hazardDetailsList"),
  btnCancelRoute: $("btnCancelRoute"),
  btnAcceptHazards: $("btnAcceptHazards")
};

// Calculate NDVI Date String (10 days ago to ensure processing)
function getNDVIDateString() {
  const d = new Date();
  d.setDate(d.getDate() - 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ═══════════════════════════════════════════════════════════
// STUNNING THREE.JS MAP PLACEHOLDER GLOBE
// ═══════════════════════════════════════════════════════════
function initPlaceholderAnimation() {
  // DriveSphere uses CSS animations for the placeholder instead of Three.js
  const placeholder = document.getElementById('mapPlaceholder');
  if (!placeholder) return null;
  return {
    destroy: () => {
      // CSS animations clean up automatically
    }
  };
}

// ═══════════════════════════════════════════════════════════
// THREE.JS WEATHER PARTICLE OVERLAY
// ═══════════════════════════════════════════════════════════
function initThreeOverlay() {
  const wrapper = document.getElementById("mapWrapper");
  if (!wrapper) return null;

  const canvas = document.createElement("canvas");
  canvas.id = "threeOverlayCanvas";
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "3";
  wrapper.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.z = 6;

  // Rain Particles
  const rainGeo = new THREE.BufferGeometry();
  const rainCount = 1200;
  const rainPos = new Float32Array(rainCount * 3);
  const rainVels = [];
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 20;
    rainPos[i * 3 + 1] = Math.random() * 20 - 10;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    rainVels.push(0.12 + Math.random() * 0.12);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0x60a5fa,
    size: 0.04,
    transparent: true,
    opacity: 0.55
  });
  const rainParticles = new THREE.Points(rainGeo, rainMat);
  rainParticles.visible = false;
  scene.add(rainParticles);

  // Mist/Fog Particles
  const mistGeo = new THREE.BufferGeometry();
  const mistCount = 50;
  const mistPos = new Float32Array(mistCount * 3);
  for (let i = 0; i < mistCount; i++) {
    mistPos[i * 3] = (Math.random() - 0.5) * 25;
    mistPos[i * 3 + 1] = (Math.random() - 0.5) * 12;
    mistPos[i * 3 + 2] = (Math.random() - 0.5) * 12;
  }
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const mistMat = new THREE.PointsMaterial({
    color: 0x94a3b8,
    size: 1.8,
    transparent: true,
    opacity: 0.12
  });
  const mistParticles = new THREE.Points(mistGeo, mistMat);
  mistParticles.visible = false;
  scene.add(mistParticles);

  let animId;
  function tick() {
    animId = requestAnimationFrame(tick);
    
    // Update Rain
    if (rainParticles.visible) {
      const posAttr = rainParticles.geometry.attributes.position;
      const speedCoeff = 1 + (tripState?.vehicle?.currentSpeed || 0) * 0.02;
      for (let i = 0; i < rainCount; i++) {
        let y = posAttr.getY(i);
        y -= rainVels[i] * speedCoeff;
        if (y < -8) {
          y = 10;
        }
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // Update Mist
    if (mistParticles.visible) {
      mistParticles.rotation.y += 0.0006;
      mistParticles.rotation.x += 0.0003;
    }

    renderer.render(scene, camera);
  }
  tick();

  const resizeObserver = new ResizeObserver(() => {
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(canvas);

  return {
    updateWeather: (type) => {
      if (type === "rain") {
        rainParticles.visible = true;
        mistParticles.visible = true;
      } else if (type === "forest") {
        rainParticles.visible = false;
        mistParticles.visible = true;
      } else {
        rainParticles.visible = false;
        mistParticles.visible = false;
      }
    },
    destroy: () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      canvas.remove();
      renderer.dispose();
      rainGeo.dispose();
      rainMat.dispose();
      mistGeo.dispose();
      mistMat.dispose();
    }
  };
}

// ═══════════════════════════════════════════════════════════
// LOADING SEQUENCE
// ═══════════════════════════════════════════════════════════
function startLoading() {
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 20 + 8;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      setTimeout(() => {
        if (ui.loadingScreen) ui.loadingScreen.classList.add("hidden");
      }, 400);
    }
    if (ui.loaderFill) ui.loaderFill.style.width = progress + "%";
  }, 120);
}

// ═══════════════════════════════════════════════════════════
// MAP INITIALIZATION (BACKGROUND LOAD)
// ═══════════════════════════════════════════════════════════
function initMap() {
  map = new maplibregl.Map({
    container: "map3d",
    style: {
      version: 8,
      sources: {},
      layers: []
    },
    center: [78.9629, 20.5937], // India center
    zoom: 5,
    pitch: 0,
    bearing: 0,
    antialias: true,
    maxZoom: 18,
    minZoom: 2
  });

  map.addControl(new maplibregl.ScaleControl({ maxWidth: 150 }), "bottom-left");

  // Interaction handlers to unlock camera on user interaction
  const unlockEvents = ["dragstart", "zoomstart", "pitchstart", "rotatestart", "wheel", "touchstart", "mousedown"];
  unlockEvents.forEach(evt => {
    map.on(evt, () => {
      if (isCameraLocked) {
        isCameraLocked = false;
        updateRecenterButtonState();
      }
    });
  });

  map.on("load", () => {
    // 1. Esri Satellite (High Resolution street details)
    map.addSource("esri-satellite", {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: "© Esri World Imagery"
    });

    // 2. NASA GIBS MODIS True Color (Daily global satellite imagery)
    const gibsDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    map.addSource("nasa-gibs-truecolor", {
      type: "raster",
      tiles: [
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
      ],
      tileSize: 256,
      maxzoom: 9,
      attribution: "© NASA GIBS MODIS"
    });

    // 3. NASA GIBS NDVI Vegetation Cover (MODIS NDVI 8-day composite)
    const ndviDate = getNDVIDateString();
    map.addSource("nasa-ndvi", {
      type: "raster",
      tiles: [
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/${ndviDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`
      ],
      tileSize: 256,
      maxzoom: 9,
      attribution: "© NASA GIBS MODIS"
    });

    // 4. CartoDB Dark Matter (Cyberpunk theme)
    map.addSource("dark-tiles", {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution: "© CartoDB"
    });

    // 5. CartoDB Voyager (Street map style)
    map.addSource("osm-tiles", {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution: "© CartoDB, © OpenStreetMap"
    });

    // Labels overlay
    map.addSource("map-labels", {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      maxzoom: 18
    });

    // Add AWS DEM Terrain Source (3D Elevation Model)
    map.addSource("aws-terrain-dem", {
      type: "raster-dem",
      tiles: [
        "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
      ],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 15
    });

    // Set map 3D terrain profile (disabled by default on startup for performance)
    // map.setTerrain({ source: "aws-terrain-dem", exaggeration: 1.5 });

    // Render Layers
    map.addLayer({ 
      id: "esri-sat-layer", 
      type: "raster", 
      source: "esri-satellite", 
      paint: {
        "raster-saturation": 0.25,
        "raster-contrast": 0.1,
        "raster-fade-duration": 150
      },
      layout: { visibility: "visible" } 
    });
    map.addLayer({ 
      id: "gibs-layer", 
      type: "raster", 
      source: "nasa-gibs-truecolor", 
      paint: {
        "raster-saturation": 0.2,
        "raster-contrast": 0.05,
        "raster-fade-duration": 150
      },
      layout: { visibility: "none" } 
    });
    map.addLayer({ 
      id: "ndvi-layer", 
      type: "raster", 
      source: "nasa-ndvi", 
      paint: { 
        "raster-opacity": 0.8,
        "raster-fade-duration": 150
      }, 
      layout: { visibility: "none" } 
    });
    map.addLayer({ 
      id: "dark-layer", 
      type: "raster", 
      source: "dark-tiles", 
      paint: {
        "raster-contrast": 0.15,
        "raster-fade-duration": 150
      },
      layout: { visibility: "none" } 
    });
    map.addLayer({ 
      id: "osm-layer", 
      type: "raster", 
      source: "osm-tiles", 
      paint: {
        "raster-saturation": 0.15,
        "raster-contrast": 0.05,
        "raster-fade-duration": 150
      },
      layout: { visibility: "none" } 
    });
    
    map.addLayer({ id: "labels-layer", type: "raster", source: "map-labels", layout: { visibility: "visible" } });

    // Add sky dome atmosphere effect
    try {
      if (typeof map.setSky === "function") {
        map.setSky({
          "sky-color": "#070a13",
          "sky-horizon-blend": 0.5,
          "horizon-color": "#00f5d4",
          "horizon-fog-blend": 0.5,
          "fog-color": "#070a13"
        });
      }
    } catch (err) {
      console.warn("[MapLibre Sky atmospheric effect failed]", err.message);
    }

    // Fetch EONET markers
    fetchNASAEvents();
  });

  map.on("error", (e) => {
    console.warn("[MapLibre GL Error]", e.error?.message || e);
  });
}

// ═══════════════════════════════════════════════════════════
// ROUTE DRAWING & GEOMETRY
// ═══════════════════════════════════════════════════════════
function addRouteLayers() {
  removeRouteLayers();

  // Draw alternative routes (dashed, dimmer lines)
  if (tripState && tripState.alternatives) {
    tripState.alternatives.forEach((alt) => {
      if (alt.index === activeRouteIndex) return; 
      if (!alt.coords) return;
      
      const sourceId = `alt-route-source-${alt.index}`;
      const layerId = `alt-route-layer-${alt.index}`;
      const glowId = `alt-route-glow-${alt.index}`;
      
      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: alt.coords }
        }
      });
      
      map.addLayer({
        id: glowId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#a855f7", // purple glow
          "line-width": 12,
          "line-blur": 8,
          "line-opacity": 0.2
        }
      });

      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#a855f7",
          "line-width": 4,
          "line-opacity": 0.6
        },
        layout: { "line-cap": "round", "line-join": "round" }
      });

      // Click handler: switch to this alternative route when clicked on the map
      map.on("click", layerId, () => {
        switchActiveRoute(alt.index);
      });
      map.on("click", glowId, () => {
        switchActiveRoute(alt.index);
      });

      // Hover cursor change to indicate clickable
      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", glowId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", glowId, () => {
        map.getCanvas().style.cursor = "";
      });
    });
  }

  // Draw active route segments (color coded by threat levels)
  currentRouteSegments.forEach((segment) => {
    const coords = segment.points;
    if (!coords || coords.length < 2) return;

    const sourceId = `route-${segment.id}`;
    const layerGlow = `route-glow-${segment.id}`;
    const layerLine = `route-line-${segment.id}`;
    const layerCasing = `route-casing-${segment.id}`;

    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: { type: segment.type },
        geometry: { type: "LineString", coordinates: coords }
      }
    });

    // Glowing border
    map.addLayer({
      id: layerGlow,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": segment.color || "#10b981",
        "line-width": 16,
        "line-blur": 12,
        "line-opacity": 0.35
      }
    });

    // Casing
    map.addLayer({
      id: layerCasing,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": "#ffffff",
        "line-width": 7,
        "line-opacity": 0.12
      }
    });

    // Active path
    map.addLayer({
      id: layerLine,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": segment.color || "#10b981",
        "line-width": 5,
        "line-opacity": 0.95
      },
      layout: { "line-cap": "round", "line-join": "round" }
    });
  });

  // Flow animation dash overlay
  if (currentRouteCoords && currentRouteCoords.length >= 2) {
    map.addSource("route-full", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: currentRouteCoords }
      }
    });

    map.addLayer({
      id: "route-dash",
      type: "line",
      source: "route-full",
      paint: {
        "line-color": "#ffffff",
        "line-width": 2,
        "line-opacity": 0.45,
        "line-dasharray": [2, 4]
      }
    });
  }
}

function removeRouteLayers() {
  if (!map) return;
  
  try {
    const style = map.getStyle();
    if (style) {
      if (style.layers) {
        style.layers.forEach((layer) => {
          if (
            layer.id.startsWith("route-") || 
            layer.id.startsWith("alt-route-") || 
            layer.id.startsWith("dyn-landslide-") || 
            layer.id.startsWith("dyn-rain-") ||
            layer.id.startsWith("dyn-disaster-")
          ) {
            map.removeLayer(layer.id);
          }
        });
      }
      
      if (style.sources) {
        Object.keys(style.sources).forEach((sourceId) => {
          if (
            sourceId.startsWith("route-") || 
            sourceId.startsWith("alt-route-") || 
            sourceId.startsWith("dyn-landslide-") || 
            sourceId.startsWith("dyn-rain-") ||
            sourceId.startsWith("dyn-disaster-")
          ) {
            map.removeSource(sourceId);
          }
        });
      }
    }
  } catch (err) {
    console.warn("[removeRouteLayers failed]", err.message);
  }
}

// ═══════════════════════════════════════════════════════════
// DYNAMIC HAZARD CIRCLES
// ═══════════════════════════════════════════════════════════
function getCircleCoords(center, radiusKm) {
  const points = 32;
  const circle = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const lat = center[1] + (radiusKm / 111) * Math.sin(angle);
    const lon = center[0] + (radiusKm / (111 * Math.cos(center[1] * Math.PI / 180))) * Math.cos(angle);
    circle.push([lon, lat]);
  }
  return circle;
}

let activeHazardMarkers = [];
function rebuildHazardZones() {
  if (!map) return;

  try {
    const style = map.getStyle();
    if (style) {
      if (style.layers) {
        style.layers.forEach((layer) => {
          if (layer.id.startsWith("dyn-landslide-") || layer.id.startsWith("dyn-rain-") || layer.id.startsWith("dyn-disaster-")) {
            map.removeLayer(layer.id);
          }
        });
      }
      if (style.sources) {
        Object.keys(style.sources).forEach((sourceId) => {
          if (sourceId.startsWith("dyn-landslide-") || sourceId.startsWith("dyn-rain-") || sourceId.startsWith("dyn-disaster-")) {
            map.removeSource(sourceId);
          }
        });
      }
    }
  } catch (err) {
    console.warn("[rebuildHazardZones clear failed]", err.message);
  }

  activeHazardMarkers.forEach(m => m.remove());
  activeHazardMarkers = [];

  let landslideCount = 0;
  let rainCount = 0;

  // Render OSRM-segment based telemetry hazards (Landslides, Rain)
  currentRouteSegments.forEach((seg) => {
    const coords = seg.points;
    if (!coords || coords.length === 0) return;
    const midPoint = coords[Math.floor(coords.length / 2)];

    if (seg.type === "rain") {
      const radius = 10;
      const circle = getCircleCoords(midPoint, radius);
      const sourceId = `dyn-rain-${rainCount}`;
      
      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [circle] }
        }
      });
      
      map.addLayer({
        id: `dyn-rain-fill-${rainCount}`,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": "rgba(96, 165, 250, 0.15)", "fill-opacity": 0.55 }
      });
      
      map.addLayer({
        id: `dyn-rain-border-${rainCount}`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#3b82f6",
          "line-width": 1.5,
          "line-dasharray": [3, 2],
          "line-opacity": 0.5
        }
      });

      const el = document.createElement("div");
      el.className = "custom-marker";
      el.style.cursor = "pointer";
      el.innerHTML = `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="#3b82f6" opacity="0.35"/><text x="16" y="21" text-anchor="middle" fill="#93c5fd" font-size="14"></text></svg>`;
      
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(midPoint)
        .setPopup(new maplibregl.Popup({ offset: 15, className: "cyber-popup" }).setHTML(
          `<div style="font-family:Inter,sans-serif;font-size:12px;color:#fff;">
            <strong style="color:#3b82f6;"> Rain Zone</strong>
            <p style="margin:4px 0 0;color:#94a3b8;">Weather sensors report heavy rain at ${escapeHtml(seg.from)}</p>
          </div>`
        ))
        .addTo(map);

      activeHazardMarkers.push(marker);
      rainCount++;
    }

    if (seg.ndvi >= 0.65 || (seg.type === "rain" && seg.curvature === "Extreme Curves")) {
      const radius = 8;
      const circle = getCircleCoords(midPoint, radius);
      const sourceId = `dyn-landslide-${landslideCount}`;
      const color = seg.ndvi >= 0.72 ? "#ef4444" : "#f97316";
      
      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [circle] }
        }
      });
      
      map.addLayer({
        id: `dyn-landslide-fill-${landslideCount}`,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": color, "fill-opacity": 0.1 }
      });
      
      map.addLayer({
        id: `dyn-landslide-border-${landslideCount}`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": color,
          "line-width": 2,
          "line-dasharray": [4, 2],
          "line-opacity": 0.7
        }
      });

      const el = document.createElement("div");
      el.className = "custom-marker";
      el.style.cursor = "pointer";
      el.innerHTML = `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${color}" opacity="0.2"/><text x="16" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="bold"></text></svg>`;
      
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(midPoint)
        .setPopup(new maplibregl.Popup({ offset: 15, className: "cyber-popup" }).setHTML(
          `<div style="font-family:Inter,sans-serif;font-size:12px;color:#fff;">
            <strong style="color:${color};"> Landslide Alert</strong>
            <p style="margin:4px 0 0;color:#94a3b8;">High terrain slope risk near ${escapeHtml(seg.from)}</p>
          </div>`
        ))
        .addTo(map);

      activeHazardMarkers.push(marker);
      landslideCount++;
    }
  });

  // Render viaPlaces CSV disaster-zones & active news threat zones
  const state = tripState;
  if (state && state.viaPlaces && state.viaPlaces.length > 0) {
    state.viaPlaces.forEach((place, idx) => {
      if (typeof place !== "object") return;
      if (place.isDisasterZone || place.hasActiveNews) {
        const pos = [place.lon, place.lat];
        const radius = 8;
        const circle = getCircleCoords(pos, radius);
        
        const sourceId = `dyn-disaster-${idx}`;
        const color = place.hasActiveNews ? "#ef4444" : "#f59e0b";
        
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [circle] }
          }
        });
        
        map.addLayer({
          id: `dyn-disaster-fill-${idx}`,
          type: "fill",
          source: sourceId,
          paint: { "fill-color": color, "fill-opacity": 0.08 }
        });
        
        map.addLayer({
          id: `dyn-disaster-border-${idx}`,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": color,
            "line-width": 2,
            "line-dasharray": [4, 2],
            "line-opacity": 0.7
          }
        });

        const el = document.createElement("div");
        el.className = "custom-marker";
        el.style.cursor = "pointer";
        
        const warningSymbol = place.hasActiveNews ? "" : "";
        el.innerHTML = `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${color}" opacity="0.25"/><text x="16" y="21" text-anchor="middle" fill="${color}" font-size="14" font-weight="bold">${warningSymbol}</text></svg>`;
        
        const popupText = place.hasActiveNews
          ? `<div style="font-family:Inter,sans-serif;font-size:12px;color:#fff;">
               <strong style="color:#ef4444;"> Active Threat Warning</strong>
               <p style="margin:4px 0 0;">Recent news alerts confirm active natural threats near <strong>${escapeHtml(place.name)}</strong>.</p>
             </div>`
          : `<div style="font-family:Inter,sans-serif;font-size:12px;color:#fff;">
               <strong style="color:#f59e0b;"> Hazard-Prone Zone (CSV)</strong>
               <p style="margin:4px 0 0;"><strong>${escapeHtml(place.name)}</strong> is flagged in the historical database as a ${escapeHtml(place.disasterType || 'hazard')} zone.</p>
             </div>`;

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(pos)
          .setPopup(new maplibregl.Popup({ offset: 15, className: "cyber-popup" }).setHTML(popupText))
          .addTo(map);

        activeHazardMarkers.push(marker);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════
// ROUTE LABELS & MARKERS
// ═══════════════════════════════════════════════════════════
let routeMarkers = [];
function addRouteMarkers(state) {
  routeMarkers.forEach(m => m.remove());
  routeMarkers = [];

  if (!currentRouteSegments || currentRouteSegments.length === 0) return;

  const places = [];
  
  // Use exact geocoded start location if available
  if (state && state.startPlace) {
    places.push({
      pos: [state.startPlace.lon, state.startPlace.lat],
      label: state.startPlace.name,
      icon: "",
      color: "#00f5d4"
    });
  } else {
    const startCoords = currentRouteSegments[0].points[0];
    if (startCoords) {
      places.push({
        pos: startCoords,
        label: currentRouteSegments[0].from,
        icon: "",
        color: "#00f5d4"
      });
    }
  }

  // Intermediate points
  currentRouteSegments.forEach((seg, idx) => {
    if (idx > 0) {
      const startCoords = seg.points[0];
      if (startCoords) {
        places.push({
          pos: startCoords,
          label: seg.from,
          icon: "️",
          color: "#fbbf24"
        });
      }
    }
  });

  // Use exact geocoded destination if available
  if (state && state.endPlace) {
    places.push({
      pos: [state.endPlace.lon, state.endPlace.lat],
      label: state.endPlace.name,
      icon: "",
      color: "#00f5d4"
    });
  } else {
    const lastSeg = currentRouteSegments[currentRouteSegments.length - 1];
    const endCoords = lastSeg.points[lastSeg.points.length - 1];
    if (endCoords) {
      places.push({
        pos: endCoords,
        label: lastSeg.to,
        icon: "",
        color: "#00f5d4"
      });
    }
  }

  // Add Recommended Hotels to the map
  if (state && state.hotels && state.hotels.length > 0) {
    state.hotels.forEach(h => {
      if (h.lon && h.lat) {
        // Prevent duplicate markers on the exact same coordinates
        const isDuplicate = places.some(p => Math.abs(p.pos[0] - h.lon) < 0.0001 && Math.abs(p.pos[1] - h.lat) < 0.0001);
        if (!isDuplicate) {
          places.push({
            pos: [h.lon, h.lat],
            label: `${h.name} (${h.place})`,
            icon: "",
            color: "#a855f7", // Premium neon purple for hotels
            isHotel: true
          });
        }
      }
    });
  }

  places.forEach((m) => {
    const el = document.createElement("div");
    el.className = "route-point-marker";
    el.style.background = m.color;
    el.style.boxShadow = `0 0 10px ${m.color}`;
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.color = "#ffffff";
    el.style.cursor = "pointer";

    if (m.icon === "️") {
      // Premium Location Pin SVG
      el.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
    } else if (m.isHotel) {
      // Premium Hotel Building Icon SVG
      el.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 7v14M21 7v14M6 7V4a1 1 0 011-1h10a1 1 0 011 1v3M9 21v-4h6v4"></path></svg>`;
    } else {
      el.style.fontSize = "10px";
      el.textContent = m.icon;
    }
    
    el.title = m.label;

    const popupHtml = m.isHotel
      ? `<div style="font-family:Inter,sans-serif;font-size:12px;padding:2px;color:#fff;">
           <strong style="color:var(--neon-purple);display:block;margin-bottom:2px;"> Hotel stay suggestion</strong>
           <strong>${escapeHtml(m.label)}</strong>
         </div>`
      : `<div style="font-family:Inter,sans-serif;font-size:12px;padding:2px;color:#fff;">
           <strong>${escapeHtml(m.label)}</strong>
         </div>`;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(m.pos)
      .setPopup(new maplibregl.Popup({ offset: 12, className: "cyber-popup" }).setHTML(popupHtml))
      .addTo(map);
      
    routeMarkers.push(marker);
  });
}

function addVehicleMarker() {
  if (vehicleMarker) vehicleMarker.remove();

  const el = document.createElement("div");
  el.className = "vehicle-marker";
  el.id = "vehicleMarkerEl";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.fontSize = "1.5rem";
  el.style.filter = "drop-shadow(0 2px 5px rgba(0,0,0,0.5))";
  el.textContent = "";

  vehicleMarker = new maplibregl.Marker({ element: el, anchor: "center" })
    .setLngLat(currentRouteCoords[0] || [75.1, 13.8])
    .addTo(map);
}

// ═══════════════════════════════════════════════════════════
// NASA EONET EVENTS
// ═══════════════════════════════════════════════════════════
let nasaMarkersList = [];
async function fetchNASAEvents() {
  try {
    const response = await fetch("/api/nasa-events?days=45");
    if (!response.ok) throw new Error("EONET fetch failed");
    const payload = await response.json();
    nasaEvents = payload.events || [];
    renderNASAEvents();
    addNASAMarkers();
  } catch (e) {
    console.warn("[NASA EONET]", e.message);
    ui.nasaEventList.innerHTML = `<div class="event-placeholder"> Could not connect to EONET proxy</div>`;
  }
}

function renderNASAEvents() {
  const listEl = ui.nasaEventList;
  const countEl = ui.eventCount;
  const cardLabelEl = document.querySelector("#nasaCard .card-label");

  if (tripState && tripState.newsAlerts && tripState.newsAlerts.length > 0) {
    if (cardLabelEl) cardLabelEl.textContent = "Local Hazard News";
    countEl.textContent = tripState.newsAlerts.length;
    
    listEl.innerHTML = tripState.newsAlerts.map((news) => {
      const pubDate = news.pubDate ? news.pubDate.slice(0, 10) : new Date().toISOString().split("T")[0];
      return `
        <a href="${news.link}" target="_blank" class="event-item" style="text-decoration:none;" title="${escapeHtml(news.title)}">
          <div class="event-dot" style="background:#ef4444;box-shadow:0 0 6px #ef4444"></div>
          <div class="event-info">
            <span class="event-title" style="color:var(--neon-cyan);">${escapeHtml(news.title)}</span>
            <span class="event-meta">${escapeHtml(news.source || 'News')} · ${pubDate}</span>
          </div>
        </a>
      `;
    }).join("");
  } else {
    if (cardLabelEl) cardLabelEl.textContent = "NASA India Events";
    
    // Filter NASA events to only show those inside India
    const indiaEvents = nasaEvents.filter(evt => evt.isIndia);
    countEl.textContent = indiaEvents.length;

    if (!indiaEvents.length) {
      listEl.innerHTML = `<div class="event-placeholder">No active NASA hazard events in India</div>`;
      return;
    }

    listEl.innerHTML = indiaEvents.map((event) => {
      const category = event.categories?.[0]?.title || "Unknown";
      const color = getNASAEventColor(category);
      const dateStr = event.date ? event.date.slice(0, 10) : "";

      return `
        <div class="event-item" onclick="flyToEvent(${event.lon}, ${event.lat})" title="${escapeHtml(event.title)}">
          <div class="event-dot" style="background:${color};box-shadow:0 0 6px ${color}"></div>
          <div class="event-info">
            <span class="event-title">${escapeHtml(event.title)}</span>
            <span class="event-meta">${escapeHtml(category)} · ${dateStr}</span>
          </div>
        </div>
      `;
    }).join("");
  }
}

function addNASAMarkers() {
  nasaMarkersList.forEach(m => m.remove());
  nasaMarkersList = [];

  // Only display markers for India NASA events
  const indiaEvents = nasaEvents.filter(event => event.isIndia);

  indiaEvents.forEach((event) => {
    const category = event.categories?.[0]?.title || "Unknown";
    const color = getNASAEventColor(category);

    const el = document.createElement("div");
    el.className = "nasa-marker";
    el.style.background = color;
    el.style.boxShadow = `0 0 10px ${color}`;
    el.style.width = "12px";
    el.style.height = "12px";
    el.style.borderRadius = "50%";
    el.style.border = "2px solid #ffffff";
    el.style.cursor = "pointer";
    el.title = event.title;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([event.lon, event.lat])
      .setPopup(new maplibregl.Popup({ offset: 12, maxWidth: "260px" }).setHTML(
        `<div style="font-family:Inter,sans-serif;font-size:12px;color:#fff;">
          <strong style="color:${color};font-size:13px;"> ${escapeHtml(event.title)}</strong>
          <p style="margin:4px 0 0;color:#94a3b8;">NASA EONET Category: ${escapeHtml(category)}</p>
          <p style="margin:2px 0 0;color:#cbd5e1;">Location: ${event.lat.toFixed(4)}, ${event.lon.toFixed(4)}</p>
        </div>`
      ))
      .addTo(map);

    nasaMarkersList.push(marker);
  });
}

function getNASAEventColor(category) {
  const colors = {
    "Wildfires": "#ef4444",
    "Severe Storms": "#a855f7",
    "Volcanoes": "#f97316",
    "Floods": "#3b82f6",
    "Earthquakes": "#eab308",
    "Landslides": "#dc2626",
    "Dust and Haze": "#6b7280"
  };
  return colors[category] || "#06b6d4";
}

function flyToEvent(lon, lat) {
  if (!map) return;
  isCameraLocked = false;
  updateRecenterButtonState();
  map.flyTo({
    center: [lon, lat],
    zoom: 9,
    pitch: 45,
    bearing: 0,
    duration: 2000,
    essential: true
  });
}

// ═══════════════════════════════════════════════════════════
// GEOLOCATION AUTO-FILL
// ═══════════════════════════════════════════════════════════
let gpsInterval = null;

async function geolocateByIP() {
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (res.ok) {
      const data = await res.json();
      if (data.city) {
        userPosition = {
          lat: data.latitude,
          lng: data.longitude
        };
        gpsCityName = data.city;
        if (data.region) {
          gpsCityName += `, ${data.region}`;
        }
        if (!hasAutoFilledGPS && currentRouteCoords.length === 0 && (!ui.fromInput.value || ui.fromInput.value === "My Location" || ui.fromInput.value === "")) {
          ui.fromInput.value = gpsCityName;
          hasAutoFilledGPS = true;
          map.flyTo({
            center: [userPosition.lng, userPosition.lat],
            zoom: 9
          });
        }
        console.log(`[IP Geolocation] Detected city: ${gpsCityName} (${userPosition.lat}, ${userPosition.lng})`);
        return;
      }
    }
  } catch (e) {
    console.warn("[IP Geolocation (ipapi.co) failed]", e.message);
  }

  // Fallback to freeipapi.com
  try {
    const res = await fetch("https://freeipapi.com/api/json");
    if (res.ok) {
      const data = await res.json();
      if (data.cityName) {
        userPosition = {
          lat: data.latitude,
          lng: data.longitude
        };
        gpsCityName = data.cityName;
        if (data.regionName) {
          gpsCityName += `, ${data.regionName}`;
        }
        if (!hasAutoFilledGPS && currentRouteCoords.length === 0 && (!ui.fromInput.value || ui.fromInput.value === "My Location" || ui.fromInput.value === "")) {
          ui.fromInput.value = gpsCityName;
          hasAutoFilledGPS = true;
          map.flyTo({
            center: [userPosition.lng, userPosition.lat],
            zoom: 9
          });
        }
        console.log(`[IP Geolocation Fallback] Detected city: ${gpsCityName} (${userPosition.lat}, ${userPosition.lng})`);
      }
    }
  } catch (e) {
    console.warn("[IP Geolocation (freeipapi.com) failed]", e.message);
  }
}

function initGPS() {
  // Geolocate user via IP immediately on startup
  geolocateByIP();

  if (!navigator.geolocation) {
    ui.gpsStatus.querySelector(".status-text").textContent = "GPS N/A";
    ui.fromInput.placeholder = "Enter origin...";
    return;
  }

  if (gpsWatchId) {
    navigator.geolocation.clearWatch(gpsWatchId);
  }

  gpsWatchId = navigator.geolocation.watchPosition(
    async (pos) => {
      userPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      
      // Calculate real GPS speed in km/h
      if (pos.coords.speed !== null && pos.coords.speed !== undefined) {
        gpsSpeed = Math.round(pos.coords.speed * 3.6);
      } else {
        gpsSpeed = 0;
      }

      ui.gpsStatus.classList.add("is-live");
      ui.gpsStatus.querySelector(".status-text").textContent = "GPS Synced";

      try {
        const res = await fetch(`/api/reverse-geocode?lat=${userPosition.lat}&lon=${userPosition.lng}`);
        if (res.ok) {
          const data = await res.json();
          const oldGpsCityName = gpsCityName;
          gpsCityName = data.placeName || "My Location";
          
          if (currentRouteCoords.length === 0 && 
              (!ui.fromInput.value || 
               ui.fromInput.value === "My Location" || 
               ui.fromInput.value === "" || 
               ui.fromInput.value === oldGpsCityName || 
               !hasRealGpsFilled)) {
            ui.fromInput.value = gpsCityName;
            hasRealGpsFilled = true;
            hasAutoFilledGPS = true;
          }
        }
      } catch (err) {
        console.warn("[GPS reverseGeocode failed]", err.message);
        if (currentRouteCoords.length === 0 && 
            (!ui.fromInput.value || 
             ui.fromInput.value === "" || 
             !hasRealGpsFilled)) {
          ui.fromInput.value = `${userPosition.lat.toFixed(5)}, ${userPosition.lng.toFixed(5)}`;
          hasRealGpsFilled = true;
          hasAutoFilledGPS = true;
        }
      }
    },
    (err) => {
      console.warn("[GPS Access Denied]", err.message);
      ui.gpsStatus.classList.remove("is-live");
      ui.gpsStatus.querySelector(".status-text").textContent = "GPS Off";
      if (!ui.fromInput.value) {
        ui.fromInput.placeholder = "Enter origin...";
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// ═══════════════════════════════════════════════════════════
// DYNAMIC 3D CAMERA & VEHICLE MOVEMENT
// ═══════════════════════════════════════════════════════════
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

function startAnimation() {
  const CYCLE_MS = 140000; // 2.3 min loop

  if (map) {
    map.setTerrain({ source: "aws-terrain-dem", exaggeration: 1.5 });
  }

  if (animationFrame) cancelAnimationFrame(animationFrame);

  function animate() {
    if (isDijkstraRunning) {
      demoStartTime = Date.now();
      demoProgress = 0;
    } else {
      const now = Date.now();
      demoProgress = ((now - demoStartTime) % CYCLE_MS) / CYCLE_MS;
    }

    const totalPoints = currentRouteCoords.length;
    if (totalPoints > 1) {
      const floatIdx = demoProgress * (totalPoints - 1);
      const idx = Math.min(Math.floor(floatIdx), totalPoints - 1);
      const frac = floatIdx - idx;

      // Check for route completion
      if (demoProgress >= 0.998 || idx >= totalPoints - 1) {
        demoProgress = 1.0;
        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
        
        // Stop vehicle marker
        const finalPt = currentRouteCoords[totalPoints - 1];
        if (vehicleMarker) {
          vehicleMarker.setLngLat(finalPt);
        }
        
        // Stop speedometer smoothly
        ui.currentSpeed.textContent = "0";
        ui.metricSpeed.textContent = "0 km/h";
        ui.gaugeArc.style.strokeDashoffset = 327; // Reset arc
        
        // Show arrival popup modal
        showArrivalModal();
        return;
      }

      const p1 = currentRouteCoords[idx];
      const p2 = currentRouteCoords[Math.min(idx + 1, totalPoints - 1)];

      const lng = p1[0] + (p2[0] - p1[0]) * frac;
      const lat = p1[1] + (p2[1] - p1[1]) * frac;

      if (vehicleMarker) {
        vehicleMarker.setLngLat([lng, lat]);
      }

      // Track automatic route deviation
      trackDeviation(lng, lat);

      // Immersive street-level 3D driving camera (Google Maps style)
      if (map) {
        // Look directly forward matching route tangent
        const targetBearing = calculateBearing(p1[1], p1[0], p2[1], p2[0]);
        const targetPitch = 65; // Comfortable highway driving pitch
        const targetZoom = 14.8; // Clear zoom without satellite pixelation

        if (!smoothCamCenter) {
          smoothCamCenter = [lng, lat];
          smoothCamBearing = targetBearing;
          smoothCamPitch = targetPitch;
        } else {
          // Smooth exponential interpolation
          smoothCamCenter[0] += (lng - smoothCamCenter[0]) * 0.05;
          smoothCamCenter[1] += (lat - smoothCamCenter[1]) * 0.05;
          
          let diff = targetBearing - smoothCamBearing;
          while (diff < -180) diff += 360;
          while (diff > 180) diff -= 360;
          smoothCamBearing += diff * 0.05;
          smoothCamBearing = (smoothCamBearing + 360) % 360;

          smoothCamPitch += (targetPitch - smoothCamPitch) * 0.05;
        }

        if (isCameraLocked) {
          map.jumpTo({
            center: smoothCamCenter,
            bearing: smoothCamBearing,
            pitch: smoothCamPitch,
            zoom: targetZoom
          });
        }
      }

      // Update local AI elements & dynamic speedometer
      updateAIDetection(idx);
    }

    animationFrame = requestAnimationFrame(animate);
  }

  animate();
}

function updateAIDetection(routeIdx) {
  if (currentRouteCoords.length === 0 || currentRouteSegments.length === 0) return;

  let activeSegment = currentRouteSegments[0];
  for (const seg of currentRouteSegments) {
    if (routeIdx >= seg.startIdx && routeIdx <= seg.endIdx) {
      activeSegment = seg;
      break;
    }
  }

  ui.roadType.textContent = activeSegment.roadType || "Highway";
  ui.roadType.style.color = activeSegment.color || "#10b981";

  ui.roadCurvature.textContent = activeSegment.curvature || "Straight";
  const curvColors = {
    "Straight": "#10b981",
    "Moderate": "#fbbf24",
    "Winding": "#f97316",
    "Extreme Curves": "#ef4444"
  };
  ui.roadCurvature.style.color = curvColors[activeSegment.curvature] || "#94a3b8";

  // Landslide Risk indicator
  if (activeSegment.curvature === "Extreme Curves" && activeSegment.type === "rain") {
    ui.landslideRisk.textContent = "Critical";
    ui.landslideRisk.style.color = "#ef4444";
  } else if (activeSegment.ndvi >= 0.65) {
    ui.landslideRisk.textContent = "High";
    ui.landslideRisk.style.color = "#f97316";
  } else if (activeSegment.curvature === "Winding") {
    ui.landslideRisk.textContent = "Moderate";
    ui.landslideRisk.style.color = "#fbbf24";
  } else {
    ui.landslideRisk.textContent = "Low";
    ui.landslideRisk.style.color = "#10b981";
  }

  // Rain frequency
  if (activeSegment.type === "rain") {
    ui.rainFrequency.textContent = "Heavy";
    ui.rainFrequency.style.color = "#3b82f6";
  } else {
    ui.rainFrequency.textContent = "Clear";
    ui.rainFrequency.style.color = "#10b981";
  }

  // 60 FPS Speedometer calculation & EMA smoothing (Accurate to real/simulated GPS speed)
  const baseLimit = activeSegment.speedLimit || 60;
  
  // Use real GPS speed if the user is moving (gpsSpeed > 0), otherwise use simulated speed
  let targetSpeed = 0;
  if (gpsSpeed > 0) {
    targetSpeed = gpsSpeed;
  } else if (tripState && tripState.vehicle) {
    targetSpeed = tripState.vehicle.currentSpeed;
  }
  
  // If speed is 0 (stationary/not moving), do not fluctuate and keep it exactly 0
  const rawSpeed = targetSpeed > 0 ? (targetSpeed + Math.sin(Date.now() / 1000) * 0.8) : 0;
  
  if (typeof currentClientSpeed === "undefined" || currentClientSpeed === null) {
    currentClientSpeed = rawSpeed;
  } else {
    currentClientSpeed = (0.05 * rawSpeed) + (0.95 * currentClientSpeed);
  }
  
  const displaySpeed = Math.round(currentClientSpeed);
  ui.currentSpeed.textContent = displaySpeed;
  ui.metricSpeed.textContent = `${displaySpeed} km/h`;
  ui.metricSafeSpeed.textContent = `${activeSegment.safeSpeed || 50} km/h`;
  ui.ndviSpeedBoard.textContent = `${baseLimit} km/h`;

  const speedPct = Math.min(displaySpeed / 120, 1);
  ui.gaugeArc.style.strokeDashoffset = 327 - (speedPct * 327 * 0.75);

  // Active weather visual overlay
  if (weatherOverlay) {
    weatherOverlay.updateWeather(activeSegment.type);
  }

  // Dynamic alert banner & STAY BACK warnings
  if (tripState && tripState.risk.level === "Critical") {
    ui.alertBanner.classList.add("visible", "stay-back-alert");
    ui.alertText.textContent = ` STAY BACK ALERT: Critical hazard ahead on ${activeSegment.to}. Postpone travel!`;
  } else if (tripState && tripState.roadIssuesDetected) {
    ui.alertBanner.classList.add("visible");
    ui.alertBanner.classList.remove("stay-back-alert");
    if (tripState.newsAlerts && tripState.newsAlerts.length > 0) {
      ui.alertText.textContent = ` Alert: ${tripState.newsAlerts[0].title}`;
    } else {
      ui.alertText.textContent = ` Warning: Live weather updates reports critical hazards ahead!`;
    }
  } else if (activeSegment.type === "rain") {
    ui.alertBanner.classList.add("visible");
    ui.alertBanner.classList.remove("stay-back-alert");
    ui.alertText.textContent = ` Severe precipitation: AI Speed adjusted dynamically by vegetation cover.`;
  } else if (activeSegment.type === "forest") {
    ui.alertBanner.classList.add("visible");
    ui.alertBanner.classList.remove("stay-back-alert");
    ui.alertText.textContent = ` Thick Forest Section: Moderate NDVI. Animal crossing watch active.`;
  } else {
    ui.alertBanner.classList.remove("visible", "stay-back-alert");
  }
}

// ═══════════════════════════════════════════════════════════
// DATA RENDERING
// ═══════════════════════════════════════════════════════════
function render(state) {
  tripState = state;

  if (state.vehicle && state.vehicle.currentPlace === "Routing failed") {
    const btn = document.getElementById("startTripBtn");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg> Start Navigation`;
    }
    const stopTripBtn = document.getElementById("stopTripBtn");
    if (stopTripBtn) stopTripBtn.style.display = "none";
    if (ui.loadingScreen) ui.loadingScreen.classList.add("hidden");
  }

  if (state.route && state.route.coordinates && state.route.coordinates.length > 0) {
    if (ui.bottomHud) ui.bottomHud.style.display = "flex";
  } else {
    if (ui.bottomHud) ui.bottomHud.style.display = "none";
  }

  // Handle route swaps
  if (state.route && state.route.coordinates) {
    const routeCoordsChanged = !currentRouteCoords || 
                               currentRouteCoords.length !== state.route.coordinates.length ||
                               (currentRouteCoords.length > 0 && (
                                 currentRouteCoords[0][0] !== state.route.coordinates[0][0] ||
                                 currentRouteCoords[currentRouteCoords.length - 1][0] !== state.route.coordinates[state.route.coordinates.length - 1][0]
                               ));

    if (routeCoordsChanged) {
      currentRouteCoords = state.route.coordinates;
      currentRouteSegments = state.route.segments;

      let cursor = 0;
      currentRouteSegments.forEach(seg => {
        seg.startIdx = cursor;
        seg.endIdx = cursor + (seg.points ? seg.points.length : 0) - 1;
        cursor = seg.endIdx;
      });

      if (map) {
        const applyRouteOnMap = () => {
          try {
            addRouteLayers();
            addRouteMarkers(state);
            rebuildHazardZones();
          } catch (e) {
            console.warn("Error drawing route layers/markers:", e.message);
          }
        };
        if (map.getStyle()) {
          applyRouteOnMap();
        } else {
          map.once("styledata", applyRouteOnMap);
        }
      }
    } else {
      // If coordinates haven't changed, dynamically update colors in case of new alerts/weather
      if (state.route.segments && currentRouteSegments) {
        state.route.segments.forEach((newSeg, idx) => {
          if (currentRouteSegments[idx] && currentRouteSegments[idx].color !== newSeg.color) {
            currentRouteSegments[idx].color = newSeg.color;
            currentRouteSegments[idx].type = newSeg.type;
            if (map && map.getLayer(`route-glow-${newSeg.id}`)) {
              map.setPaintProperty(`route-glow-${newSeg.id}`, 'line-color', newSeg.color || "#10b981");
            }
            if (map && map.getLayer(`route-line-${newSeg.id}`)) {
              map.setPaintProperty(`route-line-${newSeg.id}`, 'line-color', newSeg.color || "#10b981");
            }
          }
        });
      }
    }
  }

  // Alternative selector
  if (state.alternatives && state.alternatives.length > 1) {
    const routeSelectorCard = document.getElementById("routeSelectorCard");
    if (routeSelectorCard) routeSelectorCard.style.display = "block";
    const selectorList = document.getElementById("routeSelectorList");
    if (selectorList) {
      selectorList.innerHTML = state.alternatives.map(alt => {
        const isActive = alt.index === activeRouteIndex;
        let riskClass = "low";
        let riskLabel = "Low Risk";
        if (alt.index === 1) {
          riskClass = "medium";
          riskLabel = "Medium Risk";
        } else if (alt.index === 2) {
          riskClass = "high";
          riskLabel = "High Risk";
        }
        
        return `
          <div class="route-selector-card ${isActive ? 'active' : ''}" onclick="switchActiveRoute(${alt.index})">
            <div class="route-card-header">
              <span class="route-card-title">Route Option ${alt.index + 1}</span>
              <span class="route-badge ${riskClass}">${riskLabel}</span>
            </div>
            <div class="route-card-stats">
              <span> ${alt.totalKm} km</span>
              <span>⏱️ ${Math.round(alt.totalKm / 60 * 60)} min</span>
            </div>
            <div class="route-card-places" title="${escapeHtml(alt.summary)}">
              ${escapeHtml(alt.summary)}
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // Vehicle Emoji Indicator
  const vehicleMarkerEl = document.getElementById("vehicleMarkerEl");
  if (vehicleMarkerEl) {
    let emoji = "";
    const vType = (state.plan.vehicle || "").toLowerCase();
    if (vType.includes("bus")) emoji = "";
    else if (vType.includes("bike")) emoji = "️";
    else if (vType.includes("van")) emoji = "";
    
    if (state.risk.level === "Critical") emoji = "️";
    else if (state.risk.level === "High") emoji = "";
    vehicleMarkerEl.textContent = emoji;
  }

  ui.connectionStatus.classList.add("is-live");
  ui.connectionStatus.querySelector(".status-text").textContent = "Synced";

  ui.currentPlace.textContent = state.vehicle.nearestPlace || state.vehicle.currentPlace;
  const pct = Math.round(state.route.progress * 100);
  ui.progressPercent.textContent = `${pct}%`;
  ui.remainingDistance.textContent = `${state.route.remainingKm} km`;

  const circumference = 213.6;
  ui.progressRing.style.strokeDashoffset = circumference - (state.route.progress * circumference);

  const speed = state.vehicle.currentSpeed;
  ui.currentSpeed.textContent = speed;
  ui.metricSpeed.textContent = `${speed} km/h`;
  const speedPct = Math.min(speed / 120, 1);
  ui.gaugeArc.style.strokeDashoffset = 327 - (speedPct * 327 * 0.75);

  ui.metricSafeSpeed.textContent = `${state.vehicle.safeSpeed} km/h`;
  ui.metricDelay.textContent = `${state.conditions.delayMinutes} min`;
  ui.metricStatus.textContent = state.conditions.routeStatus;

  // AI Copilot widget
  ui.riskScore.textContent = `${state.risk.score}%`;
  ui.riskRingArc.style.strokeDashoffset = 264 - (state.risk.score / 100) * 264;
  ui.riskLevelBadge.textContent = state.risk.level;
  
  const riskColors = { "Low": "#10b981", "Medium": "#fbbf24", "High": "#f97316", "Critical": "#ef4444" };
  ui.riskLevelBadge.style.background = (riskColors[state.risk.level] || "#10b981") + "22";
  ui.riskLevelBadge.style.color = riskColors[state.risk.level] || "#10b981";
  ui.riskRingArc.style.stroke = riskColors[state.risk.level] || "#10b981";
  
  ui.ndviDisplay.textContent = `${state.vegetation.index.toFixed(2)} (${state.vegetation.density})`;
  ui.ndviSpeedBoard.textContent = `${state.vehicle.speedLimit} km/h`;
  ui.drivingAdvice.textContent = state.risk.drivingAdvice;

  // Warnings
  const hazardsDiv = document.getElementById("hazardAdvisories");
  if (hazardsDiv) {
    const alerts = [];
    currentRouteSegments.forEach((seg) => {
      if (seg.type === "rain") {
        alerts.push(`<span style="color:#60a5fa;">️ <strong>Rain Zone:</strong> ${seg.from} to ${seg.to} (Heavy rainfall expected)</span>`);
      }
      if (seg.ndvi >= 0.72 || seg.curvature === "Extreme Curves") {
        alerts.push(`<span style="color:#ef4444;">️ <strong>Landslide Risk:</strong> ${seg.from} to ${seg.to} (Steep hairpins & high terrain)</span>`);
      }
    });
    hazardsDiv.innerHTML = alerts.length > 0 ? alerts.join("") : `<span style="color:#10b981;"> No active landslide or severe rain alerts.</span>`;
  }

  // Weather widgets
  ui.weatherTemp.textContent = `${state.conditions.current.temperatureC}°C`;
  ui.weatherDesc.textContent = state.conditions.current.climate;
  ui.weatherHumidity.textContent = `${state.conditions.current.humidity}%`;
  ui.weatherWind.textContent = `${Math.round(state.conditions.current.windKph)} km/h`;
  ui.weatherPrecip.textContent = `${state.conditions.current.precipMm.toFixed(1)} mm`;

  ui.nextWeatherTemp.textContent = `${state.conditions.upcoming.temperatureC}°C`;
  ui.nextWeatherDesc.textContent = state.conditions.upcoming.climate;
  // ui.upcomingPlace.textContent = state.conditions.upcoming.place;

  ui.travelPlan.textContent = `${state.plan.from} → ${state.plan.to}`;
  ui.planMeta.textContent = `${state.plan.vehicle} · ${state.plan.passengers} passengers · Sync: ${new Date(state.generatedAt).toLocaleTimeString()}`;

  // Render via places timeline
  const viaPlaces = state.viaPlaces || [];
  const timelineEl = document.getElementById("timelineContainer");
  const viaCardEl = document.getElementById("viaPlacesTimeline");
  
  if (viaPlaces.length > 0 && timelineEl && viaCardEl) {
    viaCardEl.style.display = "block";
    timelineEl.innerHTML = viaPlaces.map((place, idx) => {
      // Support both object format {name, isDisasterZone, ...} and plain strings
      const placeName = typeof place === "object" ? place.name : place;
      const isDisasterZone = typeof place === "object" ? place.isDisasterZone : false;
      const hasActiveNews = typeof place === "object" ? place.hasActiveNews : false;
      const disasterType = typeof place === "object" ? place.disasterType : null;
      
      const isStart = idx === 0;
      const isEnd = idx === viaPlaces.length - 1;
      
      // Color logic: red for active news, amber/yellow for CSV disaster zone, cyan for start/end, default for others
      let dotColor, labelColor, badgeHtml = "";
      if (hasActiveNews) {
        dotColor = "var(--neon-red)";
        labelColor = "var(--neon-red)";
        badgeHtml = `<span style="background: rgba(239, 68, 68, 0.2); color: var(--neon-red); border: 1px solid rgba(239, 68, 68, 0.4); padding: 1px 4px; border-radius: 4px; font-size: 0.65rem; margin-left: 6px; font-weight:700;">️ ACTIVE ALERT</span>`;
      } else if (isDisasterZone) {
        dotColor = "#f59e0b";
        labelColor = "#f59e0b";
        badgeHtml = `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); padding: 1px 4px; border-radius: 4px; font-size: 0.6rem; margin-left: 6px; font-weight:600;"> ${escapeHtml(disasterType || 'HAZARD ZONE')}</span>`;
      } else if (isStart || isEnd) {
        dotColor = "var(--neon-cyan)";
        labelColor = "#ffffff";
      } else {
        dotColor = "var(--neon-amber)";
        labelColor = "var(--ink-secondary)";
      }
      
      return `
        <div style="display: flex; gap: 10px; align-items: flex-start; margin-bottom: 2px; position: relative;">
          <div style="display: flex; flex-direction: column; align-items: center; min-width: 12px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; box-shadow: 0 0 6px ${dotColor}; margin-top: 5px;"></div>
            ${!isEnd ? `<div style="width: 2px; height: 18px; background: rgba(255,255,255,0.1); margin-top: 4px;"></div>` : ""}
          </div>
          <div style="font-size: 0.75rem; color: ${labelColor}; font-weight: ${isStart || isEnd ? '700' : isDisasterZone ? '600' : 'normal'}; line-height: 1.2;">
            ${escapeHtml(placeName)} ${badgeHtml}
          </div>
        </div>
      `;
    }).join("");
  } else if (viaCardEl) {
    viaCardEl.style.display = "none";
  }

  // Render via places inline container
  const inlineContainer = document.getElementById("viaPlacesInlineContainer");
  if (inlineContainer) {
    if (viaPlaces.length > 0) {
      inlineContainer.innerHTML = viaPlaces.map((place, idx) => {
        const placeName = typeof place === "object" ? place.name : place;
        const isDisasterZone = typeof place === "object" ? place.isDisasterZone : false;
        const hasActiveNews = typeof place === "object" ? place.hasActiveNews : false;
        
        const isStart = idx === 0;
        const isEnd = idx === viaPlaces.length - 1;
        
        let placeHtml;
        if (hasActiveNews) {
          placeHtml = `<strong style="color: var(--neon-red); text-shadow: 0 0 4px rgba(239,68,68,0.3);" title="Active Danger Alert"> ${escapeHtml(placeName)}</strong>`;
        } else if (isDisasterZone) {
          placeHtml = `<strong style="color: #f59e0b; text-shadow: 0 0 4px rgba(245,158,11,0.3);" title="Disaster Zone"> ${escapeHtml(placeName)}</strong>`;
        } else if (isStart || isEnd) {
          placeHtml = `<span style="color: var(--neon-cyan); font-weight: 700;">${escapeHtml(placeName)}</span>`;
        } else {
          placeHtml = `<span style="color: #ffffff;">${escapeHtml(placeName)}</span>`;
        }
          
        const arrowHtml = idx < viaPlaces.length - 1 
          ? `<span style="color: var(--ink-muted); margin: 0 2px;"></span>`
          : "";
          
        return `${placeHtml}${arrowHtml}`;
      }).join(" ");
    } else {
      inlineContainer.innerHTML = `<span>Waiting for route planning…</span>`;
    }
  }

  renderLegend(state.legend);
  renderGoogleNews(state.newsAlerts);
  triggerMapNotifications(state.activeDangerAlerts); // Render alerts on map

  if (state.suggestHotels) {
    ui.hotelAlertBanner.classList.add("visible");
  } else {
    ui.hotelAlertBanner.classList.remove("visible");
  }
  renderHotels(state.hotels);
  renderNASAEvents();
}

function renderLegend(items) {
  ui.legendList.innerHTML = items.map((item) => `
    <div class="legend-item">
      <div class="legend-swatch" style="background:${item.color};--swatch-color:${item.color}"></div>
      <div class="legend-info">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.meaning)}</span>
      </div>
    </div>
  `).join("");
}

function renderHotels(hotels) {
  ui.hotelList.innerHTML = hotels.map((hotel) => {
    const bookingUrl = hotel.bookingLink || `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name + ", " + hotel.place)}`;
    const agodaUrl = hotel.agodaLink || `https://www.agoda.com/search?query=${encodeURIComponent(hotel.name + ", " + hotel.place)}`;
    
    // Determine click handler: fly to exact coordinates if available
    const clickHandler = (hotel.lat && hotel.lon)
      ? `flyToCoordinates(${hotel.lon}, ${hotel.lat}, '${escapeHtml(hotel.name)}', '${escapeHtml(hotel.place)}')`
      : `flyToPlace('${escapeHtml(hotel.place)}')`;
      
    return `
      <li style="flex-direction: column; align-items: flex-start; gap: 6px;">
        <div style="display: flex; justify-content: space-between; width: 100%; cursor: pointer;" onclick="${clickHandler}" title="Click to view hotel on map">
          <div>
            <strong style="color: var(--neon-cyan);">${escapeHtml(hotel.name)}</strong>
            <span style="font-size:0.75rem; color:var(--ink-muted); display: block;">${escapeHtml(hotel.place)} · ${hotel.rooms || 0} Rooms · ${escapeHtml(hotel.category || "Standard")}</span>
            <span style="display: block; font-size:0.7rem; color:var(--ink-muted); opacity: 0.8; margin-top:2px; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(hotel.address || '')}">${escapeHtml(hotel.address || '')}</span>
          </div>
          <em style="color: var(--neon-purple); font-style: normal; font-weight: 700; font-size: 0.8rem;">${hotel.etaMin} min</em>
        </div>
        <div class="hotel-links-container">
          <a href="${bookingUrl}" target="_blank" class="btn-booking-link booking-com" onclick="event.stopPropagation();">
            ️ Booking.com
          </a>
          <a href="${agodaUrl}" target="_blank" class="btn-booking-link agoda" onclick="event.stopPropagation();">
             Agoda
          </a>
        </div>
      </li>
    `;
  }).join("");
}

function renderGoogleNews(items) {
  if (!items || !items.length) {
    ui.googleNewsList.innerHTML = `<div class="event-placeholder">No highway alerts detected.</div>`;
    return;
  }

  ui.googleNewsList.innerHTML = items.map(item => {
    const source = item.source ? escapeHtml(item.source) : "NewsAPI";
    let timeStr = "";
    try {
      timeStr = new Date(item.pubDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { timeStr = escapeHtml(item.pubDate); }

    return `
    <a href="${item.link}" target="_blank" class="news-item">
      <span class="news-item-title">${escapeHtml(item.title)}</span>
      <span class="news-item-meta">${source} · ${timeStr}</span>
    </a>
  `;
  }).join("");
}

// ═══════════════════════════════════════════════════════════
// BACKEND SYNC
// ═══════════════════════════════════════════════════════════
async function fetchTripState() {
  try {
    if (sessionStorage.getItem("ds_navigating") !== "true") {
      if (currentRouteCoords.length > 0) {
        currentRouteCoords = [];
        currentRouteSegments = [];
        removeRouteLayers();
        routeMarkers.forEach(m => m.remove());
        routeMarkers = [];
        if (vehicleMarker) {
          vehicleMarker.remove();
          vehicleMarker = null;
        }
      }
      const response = await fetch(`/api/trip-state?progress=0&routeIndex=0`);
      if (response.ok) {
        const state = await response.json();
        state.route = { totalKm: 0, coveredKm: 0, remainingKm: 0, progress: 0, coordinates: [], elevations: [], segments: [] };
        state.plan = { from: "", to: "", vehicle: "Car", passengers: 2 };
        render(state);
      }
      return;
    }

    let url = `/api/trip-state?progress=${demoProgress}&routeIndex=${activeRouteIndex}`;
    
    if (currentRouteCoords.length > 0) {
      const floatIdx = demoProgress * (currentRouteCoords.length - 1);
      const idx = Math.floor(floatIdx);
      const pCurrent = currentRouteCoords[idx] || currentRouteCoords[0];
      const upcomingIdx = Math.min(idx + 6, currentRouteCoords.length - 1);
      const pNext = currentRouteCoords[upcomingIdx] || currentRouteCoords[currentRouteCoords.length - 1];

      url += `&lat=${pCurrent[1]}&lon=${pCurrent[0]}&nextLat=${pNext[1]}&nextLon=${pNext[0]}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) throw new Error("Sync failed");
    render(await response.json());
  } catch (e) {
    ui.connectionStatus.classList.remove("is-live");
    ui.connectionStatus.querySelector(".status-text").textContent = "Offline";
  }
}

// ═══════════════════════════════════════════════════════════
// FORM SUBMIT & RISK CONFIRMATION DIALOG FLOW
// ═══════════════════════════════════════════════════════════
async function submitPlan(event) {
  event.preventDefault();

  const fromVal = ui.fromInput.value.trim();
  const toVal = ui.toInput.value.trim();
  
  if (!toVal) {
    alert("Please specify a destination!");
    return;
  }

  const btn = document.getElementById("startTripBtn");
  btn.disabled = true;
  btn.textContent = "Analyzing...";

  const stopTripBtn = document.getElementById("stopTripBtn");
  if (stopTripBtn) stopTripBtn.style.display = "flex";

  let fromText = fromVal;
  if (!fromText && userPosition) {
    fromText = `${userPosition.lat.toFixed(6)},${userPosition.lng.toFixed(6)}`;
  } else if (!fromText) {
    alert("Please enter a starting location or allow GPS access.");
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg> Start Navigation`;
    if (stopTripBtn) stopTripBtn.style.display = "none";
    return;
  }

  const payload = {
    from: fromText,
    to: toVal,
    vehicle: ui.vehicleInput ? ui.vehicleInput.value.replace(/^[^\w]*/, "").trim() : "Car",
    passengers: ui.passengerInput ? Number(ui.passengerInput.value || 1) : 1
  };

  planAbortController = new AbortController();

  try {
    const response = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: planAbortController.signal
    });

    if (response.ok) {
      activeRouteIndex = 0;
      demoStartTime = Date.now();
      demoProgress = 0;
      sessionStorage.setItem("ds_navigating", "true");
      
      // Reset camera lock on new destination
      isCameraLocked = true;
      smoothCamCenter = null;
      smoothCamBearing = null;
      smoothCamPitch = null;
      updateRecenterButtonState();

      // Clear previous overlay
      if (weatherOverlay) {
        weatherOverlay.destroy();
        weatherOverlay = null;
      }

      // Sync route segments and details
      await fetchTripState();

      // Check for Hazards (Red Segments)
      let dangerousSegments = [];
      if (currentRouteSegments) {
        dangerousSegments = currentRouteSegments.filter(s => s.color === "#ef4444" || s.type === "rain");
      }

      if (dangerousSegments.length > 0) {
        // Red segments found! Open the warning modal before loading map
        showHazardModal(dangerousSegments);
      } else {
        // Safe route! Initialize directly
        initializeDrivingView();
      }
    }
  } catch (e) {
    if (e.name === "AbortError") {
      console.log("[Submit Plan] Request aborted by user.");
    } else {
      console.error("[Submit Plan Error]", e);
      alert("Error communicating with route planner: " + e.message);
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg> Start Navigation`;
    if (stopTripBtn) stopTripBtn.style.display = "none";
    planAbortController = null;
  }
}

// Show Warning Modal with dynamic search items
function showHazardModal(segments) {
  ui.hazardDetailsList.innerHTML = "";
  ui.hazardModalSummary.textContent = `The route from ${tripState.plan.from} to ${tripState.plan.to} has active extreme threats.`;

  // 1. Weather / Landslide hazard segments
  segments.forEach(seg => {
    const item = document.createElement("div");
    item.className = "hazard-detail-item";
    item.innerHTML = `
      <strong> High Risk segment: ${seg.from} to ${seg.to}</strong>
      <p>Slope terrain with vegetation index NDVI of ${seg.ndvi.toFixed(2)}. curvature: ${seg.curvature}. Speed limited to ${seg.speedLimit} km/h.</p>
    `;
    ui.hazardDetailsList.appendChild(item);
  });

  // 2. Nearby NASA EONET hazards
  const routeBox = getRouteBoundingBox();
  const nearbyEONET = nasaEvents.filter(e => {
    return e.lat >= routeBox.minLat - 0.5 && e.lat <= routeBox.maxLat + 0.5 &&
           e.lon >= routeBox.minLon - 0.5 && e.lon <= routeBox.maxLon + 0.5;
  });

  nearbyEONET.forEach(e => {
    const item = document.createElement("div");
    item.className = "hazard-detail-item";
    item.style.borderLeftColor = "#f59e0b";
    item.innerHTML = `
      <strong> NASA EONET Active Event: ${escapeHtml(e.title)}</strong>
      <p>Nature alert detected at coordinates [${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}]. Watch for landslide triggers.</p>
    `;
    ui.hazardDetailsList.appendChild(item);
  });

  // 3. News reports
  if (tripState && tripState.newsAlerts) {
    tripState.newsAlerts.slice(0, 3).forEach(news => {
      const item = document.createElement("div");
      item.className = "hazard-detail-item";
      item.style.borderLeftColor = "#ec4899";
      item.innerHTML = `
        <strong> Live news Report: ${escapeHtml(news.title)}</strong>
        <p>${escapeHtml(news.description.slice(0, 120))}...</p>
      `;
      ui.hazardDetailsList.appendChild(item);
    });
  }

  ui.hazardModal.style.display = "flex";
}

// Bounding box helper for hazards
function getRouteBoundingBox() {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  currentRouteCoords.forEach(c => {
    if (c[1] < minLat) minLat = c[1];
    if (c[1] > maxLat) maxLat = c[1];
    if (c[0] < minLon) minLon = c[0];
    if (c[0] > maxLon) maxLon = c[0];
  });
  return { minLat, maxLat, minLon, maxLon };
}

// Destination Completion Overlay Trigger
function showArrivalModal() {
  const arrivalModal = $("arrivalModal");
  const arrivalPlaceName = $("arrivalPlaceName");
  const arrivalTotalKm = $("arrivalTotalKm");
  
  if (arrivalModal && tripState) {
    arrivalPlaceName.textContent = tripState.plan.to;
    arrivalTotalKm.textContent = `${tripState.route.totalKm} km`;
    arrivalModal.style.display = "flex";
  }
}

// Throttled Deviation Tracking Logic
function trackDeviation(lng, lat) {
  const now = Date.now();
  if (now - lastDeviationCheckTime < 5000) return; // check every 5 seconds
  lastDeviationCheckTime = now;
  
  if (!currentRouteCoords || currentRouteCoords.length < 2) return;
  
  const distKm = getDistanceToRouteKm([lng, lat], currentRouteCoords);
  const distMeters = distKm * 1000;
  
  console.log(`[Deviation Tracker] Distance off-route: ${distMeters.toFixed(1)} meters`);
  
  if (distMeters > 90) { // Off route threshold: 90 meters
    deviationTicks++;
    if (deviationTicks >= 2) { // Require 2 consecutive ticks to trigger reroute
      deviationTicks = 0;
      console.log("[Deviation Tracker] Deviation verified. Initiating reroute...");
      triggerReroute(lat, lng);
    }
  } else {
    deviationTicks = 0;
  }
}

function getDistanceSegmentKm(pt, sp1, sp2) {
  const x = pt[0], y = pt[1];
  const x1 = sp1[0], y1 = sp1[1];
  const x2 = sp2[0], y2 = sp2[1];
  
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return getDistanceKm(y, x, y1, x1);
  
  let t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return getDistanceKm(y, x, py, px);
}

function getDistanceToRouteKm(pt, routeCoords) {
  let minDist = Infinity;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const dist = getDistanceSegmentKm(pt, routeCoords[i], routeCoords[i+1]);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

// Triggers coordinate-based backend rerouting
async function triggerReroute(lat, lng) {
  if (!tripState) return;
  
  // Show localized UI Toast
  const overlay = $("mapNotificationOverlay");
  if (overlay) {
    const toast = document.createElement("div");
    toast.className = "map-toast critical";
    toast.innerHTML = `
      <span class="map-toast-icon"></span>
      <div class="map-toast-content">
        <span class="map-toast-title">Reroute Recalculation</span>
        <span class="map-toast-desc">GPS deviation detected. Recalculating path with optimal road conditions...</span>
      </div>
    `;
    overlay.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  }
  
  const fromText = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const payload = {
    from: fromText,
    to: tripState.plan.to,
    vehicle: tripState.plan.vehicle,
    passengers: tripState.plan.passengers
  };
  
  try {
    const response = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      activeRouteIndex = 0;
      demoStartTime = Date.now();
      demoProgress = 0;
      
      isCameraLocked = true;
      smoothCamCenter = null;
      smoothCamBearing = null;
      smoothCamPitch = null;
      updateRecenterButtonState();
      
      if (weatherOverlay) {
        weatherOverlay.destroy();
        weatherOverlay = null;
      }
      
      await fetchTripState();
      
      let dangerousSegments = [];
      if (currentRouteSegments) {
        dangerousSegments = currentRouteSegments.filter(s => s.color === "#ef4444" || s.type === "rain");
      }
      
      if (dangerousSegments.length > 0) {
        showHazardModal(dangerousSegments);
      } else {
        initializeDrivingView();
      }
    }
  } catch (err) {
    console.warn("[Reroute Recalculation Failed]", err.message);
  }
}

// Simulates user jumping off route coordinates
function triggerDeviationSimulation() {
  if (!currentRouteCoords || currentRouteCoords.length < 5) return;
  
  // Pick active coordinate position and offset slightly
  const floatIdx = demoProgress * (currentRouteCoords.length - 1);
  const idx = Math.min(Math.floor(floatIdx), currentRouteCoords.length - 1);
  const pt = currentRouteCoords[idx];
  
  // Offset by +0.007 degrees (~800m) to force off-route
  const devLng = pt[0] + 0.007;
  const devLat = pt[1] + 0.007;
  
  console.log(`[Simulation] Simulating deviation to: [${devLat.toFixed(5)}, ${devLng.toFixed(5)}]`);
  triggerReroute(devLat, devLng);
}

// Display alerts as map notifications
function triggerMapNotifications(alerts) {
  const overlay = $("mapNotificationOverlay");
  if (!overlay || !alerts) return;
  
  alerts.forEach((alert) => {
    const alertId = alert.title + "_" + alert.pubDate;
    if (shownNotificationIds.has(alertId)) return;
    shownNotificationIds.add(alertId);
    
    const toast = document.createElement("div");
    const isCritical = alert.title.includes("") || alert.title.includes("️") || alert.title.toLowerCase().includes("risk") || alert.title.toLowerCase().includes("alert");
    toast.className = `map-toast ${isCritical ? "critical" : ""}`;
    
    const icon = alert.title.includes("") ? "" : alert.title.includes("️") ? "️" : "️";
    
    toast.innerHTML = `
      <span class="map-toast-icon">${icon}</span>
      <div class="map-toast-content">
        <span class="map-toast-title">${escapeHtml(alert.title)}</span>
        <span class="map-toast-desc">${escapeHtml(alert.description)}</span>
      </div>
      <button class="map-toast-close">&times;</button>
    `;
    
    toast.querySelector(".map-toast-close").onclick = () => {
      toast.style.opacity = "0";
      toast.style.transform = "translate3d(0, -10px, 0)";
      setTimeout(() => toast.remove(), 350);
    };
    
    overlay.appendChild(toast);
    
    // Auto dismiss after 8s
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = "0";
        toast.style.transform = "translate3d(0, -10px, 0)";
        setTimeout(() => toast.remove(), 350);
      }
    }, 8000);
    
    // Pulse coordinate markers on map if available
    if (alert.lat && alert.lon && map) {
      const el = document.createElement("div");
      el.className = "alert-marker-pulse";
      el.style.background = isCritical ? "#ef4444" : "#f59e0b";
      el.style.boxShadow = `0 0 15px ${isCritical ? "#ef4444" : "#f59e0b"}`;
      el.style.width = "18px";
      el.style.height = "18px";
      el.style.borderRadius = "50%";
      el.style.border = "3px solid #ffffff";
      el.style.cursor = "pointer";
      el.title = alert.title;
      
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([alert.lon, alert.lat])
        .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(
          `<div style="font-family:Inter,sans-serif;font-size:12px;padding:4px;">
            <strong style="color:${isCritical ? "#ef4444" : "#f59e0b"};">Alert: ${escapeHtml(alert.title)}</strong>
            <p style="margin:4px 0 0;color:#64748b;">${escapeHtml(alert.description)}</p>
          </div>`
        ))
        .addTo(map);
        
      setTimeout(() => m.remove(), 55000);
    }
  });
}

// Start Map & Routing Driving View
function initializeDrivingView() {
  ui.hazardModal.style.display = "none";
  
  // Hide Globe placeholder, destroy Three.js globe instance
  if (globeAnim) {
    globeAnim.destroy();
    globeAnim = null;
  }
  ui.mapPlaceholder.style.opacity = "0";
  setTimeout(() => {
    ui.mapPlaceholder.style.display = "none";
  }, 800);

  // Show Map Libregl
  ui.map3d.style.opacity = "1";
  ui.map3d.style.pointerEvents = "auto";
  ui.mapStyleLabel.style.display = "block";

  // Trigger Map resize in next frame to draw canvas properly
  requestAnimationFrame(() => {
    map.resize();
  });

  // Load Three.js weather particle overlay
  weatherOverlay = initThreeOverlay();

  // Fit map bounds to show the entire route during Dijkstra visualizer
  if (currentRouteCoords && currentRouteCoords.length > 0) {
    const bounds = currentRouteCoords.reduce((acc, coord) => {
      return [
        [Math.min(acc[0][0], coord[0]), Math.min(acc[0][1], coord[1])],
        [Math.max(acc[1][0], coord[0]), Math.max(acc[1][1], coord[1])]
      ];
    }, [[currentRouteCoords[0][0], currentRouteCoords[0][1]], [currentRouteCoords[0][0], currentRouteCoords[0][1]]]);

    map.fitBounds(bounds, {
      padding: { top: 80, bottom: 80, left: 80, right: 80 },
      pitch: 35, // Low pitch for flat route overview
      bearing: 0,
      duration: 2000
    });
  }

  if (currentRouteSegments && currentRouteSegments.length > 0) {
    isDijkstraRunning = true;
    setTimeout(() => {
      runDijkstraVisualizer(
        tripState ? tripState.plan.from : "",
        tripState ? tripState.plan.to : "",
        currentRouteSegments,
        () => {
          isDijkstraRunning = false;
          currentClientSpeed = null; // Reset speedometer
          
          // Fly to the start of the route and orient camera before animating
          if (currentRouteCoords && currentRouteCoords.length > 0) {
            const startBearing = calculateBearing(
              currentRouteCoords[0][1], currentRouteCoords[0][0],
              currentRouteCoords[1][1], currentRouteCoords[1][0]
            );
            map.flyTo({
              center: currentRouteCoords[0],
              zoom: 14.8,
              pitch: 65,
              bearing: startBearing,
              duration: 2000,
              essential: true
            });
            setTimeout(() => {
              demoStartTime = Date.now();
              startAnimation(); // start driving
            }, 2000);
          } else {
            demoStartTime = Date.now();
            startAnimation(); // start driving
          }
        }
      );
    }, 1200);
  }
}


// ═══════════════════════════════════════════════════════════
// MAP STYLES & HUD HANDLERS
// ═══════════════════════════════════════════════════════════
function toggle3D() {
  is3DMode = !is3DMode;
  ui.btn3DToggle.classList.toggle("active", is3DMode);

  if (map) {
    if (is3DMode) {
      map.setTerrain({ source: "aws-terrain-dem", exaggeration: 1.5 });
    } else {
      map.setTerrain(null);
    }
  }

  map.easeTo({
    pitch: is3DMode ? 74 : 0,
    bearing: is3DMode ? -15 : 0,
    duration: 1500
  });
}

function updateRecenterButtonState() {
  if (ui.btnRecenter) {
    if (isCameraLocked) {
      ui.btnRecenter.classList.remove("attention-glow");
      ui.btnRecenter.title = "Camera Locked to Vehicle";
    } else {
      ui.btnRecenter.classList.add("attention-glow");
      ui.btnRecenter.title = "Lock Camera to Vehicle";
    }
  }
}

function recenterMap() {
  isCameraLocked = true;
  smoothCamCenter = null;
  smoothCamBearing = null;
  smoothCamPitch = null;
  updateRecenterButtonState();

  if (vehicleMarker) {
    const pos = vehicleMarker.getLngLat();
    map.flyTo({
      center: [pos.lng, pos.lat],
      zoom: 14.8,
      pitch: 65,
      duration: 1500
    });
  }
}

function toggleFullscreen() {
  const wrapper = document.getElementById("mapWrapper");
  if (!document.fullscreenElement) {
    wrapper.requestFullscreen?.() || wrapper.webkitRequestFullscreen?.();
  } else {
    document.exitFullscreen?.() || document.webkitExitFullscreen?.();
  }
}

// Dark/light page styles
function toggleTheme() {
  isDark = !isDark;
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}

function toggleNASALayer() {
  ui.btnNasaLayer.classList.toggle("active");
  const visible = ui.btnNasaLayer.classList.contains("active");

  document.querySelectorAll(".nasa-marker").forEach((el) => {
    el.style.display = visible ? "block" : "none";
  });
}

function cycleMapStyle() {
  mapStyleIndex = (mapStyleIndex + 1) % 5;
  const labelEl = document.getElementById("mapStyleLabel");
  
  const styles = [
    { id: "esri-sat", label: "NASA Satellite HD" },
    { id: "nasa-gibs", label: "NASA GIBS MODIS" },
    { id: "nasa-ndvi", label: "NASA NDVI Vegetation" },
    { id: "dark-mode", label: "Mission Control Dark" },
    { id: "street-map", label: "Voyager Street Map" }
  ];
  
  const current = styles[mapStyleIndex];
  if (labelEl) labelEl.textContent = current.label;
  
  const layers = ["esri-sat-layer", "gibs-layer", "ndvi-layer", "dark-layer", "osm-layer"];
  layers.forEach(l => {
    if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", "none");
  });
  
  let targetLayer = "";
  if (current.id === "esri-sat") {
    targetLayer = "esri-sat-layer";
  } else if (current.id === "nasa-gibs") {
    targetLayer = "gibs-layer";
  } else if (current.id === "nasa-ndvi") {
    if (map.getLayer("esri-sat-layer")) map.setLayoutProperty("esri-sat-layer", "visibility", "visible");
    targetLayer = "ndvi-layer";
  } else if (current.id === "dark-mode") {
    targetLayer = "dark-layer";
  } else if (current.id === "street-map") {
    targetLayer = "osm-layer";
  }
  
  if (map.getLayer(targetLayer)) {
    map.setLayoutProperty(targetLayer, "visibility", "visible");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let hotelPopup = null;
function flyToCoordinates(lon, lat, name, place) {
  if (!lon || !lat) return;
  isCameraLocked = false;
  updateRecenterButtonState();
  
  map.flyTo({
    center: [lon, lat],
    zoom: 15.5,
    pitch: 60,
    duration: 1800,
    essential: true
  });
  
  if (hotelPopup) hotelPopup.remove();
  
  const html = `
    <div style="padding: 10px; font-family: var(--font); color: #fff; background: rgba(10, 15, 30, 0.85); border-radius: 8px; border: 1px solid var(--neon-cyan); box-shadow: 0 0 15px rgba(0, 245, 212, 0.3); backdrop-filter: blur(8px);">
      <strong style="color: var(--neon-cyan); display: block; font-size: 0.9rem; margin-bottom: 2px;">${escapeHtml(name)}</strong>
      <span style="color: var(--ink-secondary); font-size: 0.75rem;">${escapeHtml(place)}</span>
    </div>
  `;
  
  hotelPopup = new maplibregl.Popup({ closeButton: true, className: "cyber-popup" })
    .setLngLat([lon, lat])
    .setHTML(html)
    .addTo(map);
}

function flyToPlace(cityName) {
  if (!cityName) return;
  const coords = getCityCoords(cityName);
  if (coords) {
    isCameraLocked = false;
    updateRecenterButtonState();
    map.flyTo({
      center: coords,
      zoom: 12,
      pitch: 65,
      bearing: 0,
      duration: 1800,
      essential: true
    });
  }
}

function getCityCoords(cityName) {
  if (!cityName) return null;
  const nameL = cityName.toLowerCase().trim();
  if (currentRouteSegments) {
    for (const seg of currentRouteSegments) {
      if (seg.from.toLowerCase().trim().includes(nameL) || nameL.includes(seg.from.toLowerCase().trim())) {
        return seg.points[0];
      }
      if (seg.to.toLowerCase().trim().includes(nameL) || nameL.includes(seg.to.toLowerCase().trim())) {
        return seg.points[seg.points.length - 1];
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// DIJKSTRA SHORTED PATH FINDER VISUALIZER
// ═══════════════════════════════════════════════════════════
function runDijkstraVisualizer(startCity, endCity, segments, callback) {
  const consoleCard = document.getElementById("routeSelectorCard");
  const consoleDiv = document.getElementById("dijkstraConsole");
  const logsDiv = document.getElementById("dijkstraLogs");
  
  if (consoleCard) consoleCard.style.display = "block";
  if (consoleDiv) consoleDiv.style.display = "block";
  if (logsDiv) logsDiv.innerHTML = ""; 
  
  function logToConsole(message, type = "info") {
    if (!logsDiv) return;
    const p = document.createElement("div");
    p.className = `log-line log-${type}`;
    const timeStr = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    p.innerHTML = `<span class="log-time">[${timeStr}]</span> ${message}`;
    logsDiv.appendChild(p);
    logsDiv.scrollTop = logsDiv.scrollHeight;
  }
  
  logToConsole("Initializing Dijkstra Shortest Path Finder...", "warn");
  logToConsole(`Source: ${startCity} | Destination: ${endCity}`, "info");

  const nodes = {};
  const edges = [];
  
  segments.forEach((seg) => {
    const fromName = seg.from;
    const toName = seg.to;
    const weight = seg.km;
    const fromCoords = seg.points[0];
    const toCoords = seg.points[seg.points.length - 1];
    
    nodes[fromName] = fromCoords;
    nodes[toName] = toCoords;
    
    edges.push({ from: fromName, to: toName, weight, coords: seg.points });
  });

  if (tripState && tripState.alternatives) {
    tripState.alternatives.forEach((alt) => {
      if (alt.index === activeRouteIndex) return; 
      if (!alt.coords || alt.coords.length < 2 || !alt.places || alt.places.length < 2) return;
      
      const numPlaces = alt.places.length;
      const step = Math.floor(alt.coords.length / (numPlaces - 1));
      
      for (let i = 0; i < numPlaces - 1; i++) {
        const fromName = alt.places[i];
        const toName = alt.places[i+1];
        
        const startIdx = i * step;
        const endIdx = (i === numPlaces - 2) ? alt.coords.length - 1 : (i + 1) * step;
        const segmentCoords = alt.coords.slice(startIdx, endIdx + 1);
        
        nodes[fromName] = segmentCoords[0];
        nodes[toName] = segmentCoords[segmentCoords.length - 1];
        
        const weight = Math.round(alt.totalKm / (numPlaces - 1));
        edges.push({ from: fromName, to: toName, weight, coords: segmentCoords });
      }
    });
  }

  logToConsole(`Graph loaded: ${Object.keys(nodes).length} vertices, ${edges.length} edges.`, "success");

  const dist = {};
  const parent = {};
  Object.keys(nodes).forEach(n => {
    dist[n] = Infinity;
  });
  dist[startCity] = 0;

  const pq = [{ node: startCity, d: 0 }];
  const exploredEdges = [];
  
  if (map) {
    if (map.getLayer("dijkstra-explored-layer")) map.removeLayer("dijkstra-explored-layer");
    if (map.getLayer("dijkstra-active-layer")) map.removeLayer("dijkstra-active-layer");
    if (map.getLayer("dijkstra-path-layer")) map.removeLayer("dijkstra-path-layer");
    if (map.getSource("dijkstra-search-source")) map.removeSource("dijkstra-search-source");

    map.addSource("dijkstra-search-source", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });

    map.addLayer({
      id: "dijkstra-explored-layer",
      type: "line",
      source: "dijkstra-search-source",
      filter: ["==", ["get", "status"], "explored"],
      paint: { "line-color": "#f97316", "line-width": 4, "line-opacity": 0.65 }
    });

    map.addLayer({
      id: "dijkstra-active-layer",
      type: "line",
      source: "dijkstra-search-source",
      filter: ["==", ["get", "status"], "active"],
      paint: { "line-color": "#ffd166", "line-width": 6, "line-opacity": 0.9 }
    });

    map.addLayer({
      id: "dijkstra-path-layer",
      type: "line",
      source: "dijkstra-search-source",
      filter: ["==", ["get", "status"], "path"],
      paint: { "line-color": "#00f5d4", "line-width": 7, "line-opacity": 0.95 }
    });
  }

  function updateMapVisualization() {
    if (!map || !map.getSource("dijkstra-search-source")) return;
    
    const features = exploredEdges.map(edge => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: edge.coords },
      properties: { status: edge.status }
    }));

    map.getSource("dijkstra-search-source").setData({
      type: "FeatureCollection",
      features
    });
  }

  const stepDelay = 220;
  
  function step() {
    if (pq.length === 0) {
      logToConsole("Dijkstra queue empty. No path found or search complete.", "error");
      cleanup();
      return;
    }

    exploredEdges.forEach(e => {
      if (e.status === "active") e.status = "explored";
    });

    pq.sort((a, b) => a.d - b.d);
    const current = pq.shift();
    const u = current.node;

    logToConsole(`Polled node: <strong style="color:var(--cyan);">${u}</strong> (dist: ${current.d} km)`);

    if (u === endCity) {
      logToConsole(`SUCCESS: Shortest path to destination <strong style="color:var(--green);">${u}</strong> found!`, "success");
      logToConsole(`Final distance: <strong>${current.d} km</strong>`, "success");
      
      const pathNodes = [];
      let curr = endCity;
      while (curr) {
        pathNodes.unshift(curr);
        curr = parent[curr];
      }
      logToConsole(`Shortest path: <strong style="color:var(--cyan);">${pathNodes.join(" → ")}</strong>`, "success");
      
      exploredEdges.forEach(e => {
        for (let i = 0; i < pathNodes.length - 1; i++) {
          if ((e.from === pathNodes[i] && e.to === pathNodes[i+1]) || 
              (e.to === pathNodes[i] && e.from === pathNodes[i+1])) {
            e.status = "path";
          }
        }
      });
      
      updateMapVisualization();
      
      setTimeout(() => {
        cleanup();
        callback();
      }, 1000);
      return;
    }

    const outgoing = edges.filter(e => e.from === u || e.to === u);
    
    outgoing.forEach(edge => {
      const neighbor = edge.from === u ? edge.to : edge.from;
      const weight = edge.weight;
      const newD = dist[u] + weight;
      
      let edgeItem = exploredEdges.find(e => 
        (e.from === u && e.to === neighbor) || (e.from === neighbor && e.to === u)
      );
      if (!edgeItem) {
        edgeItem = { from: u, to: neighbor, coords: edge.coords, status: "explored" };
        exploredEdges.push(edgeItem);
      }
      
      if (newD < dist[neighbor]) {
        logToConsole(`&nbsp;&nbsp;Relaxing edge: ${u} → ${neighbor} (${weight} km) | New Dist: ${newD} km`, "warn");
        dist[neighbor] = newD;
        parent[neighbor] = u;
        pq.push({ node: neighbor, d: newD });
        edgeItem.status = "active";
      } else {
        logToConsole(`&nbsp;&nbsp;Checking edge: ${u} → ${neighbor} (${weight} km) | Exceeds current dist (${dist[neighbor]} km)`, "info");
        if (edgeItem.status !== "active") {
          edgeItem.status = "explored";
        }
      }
    });

    updateMapVisualization();
    setTimeout(step, stepDelay);
  }

  function cleanup() {
    if (map) {
      setTimeout(() => {
        if (map.getLayer("dijkstra-explored-layer")) map.removeLayer("dijkstra-explored-layer");
        if (map.getLayer("dijkstra-active-layer")) map.removeLayer("dijkstra-active-layer");
        if (map.getLayer("dijkstra-path-layer")) map.removeLayer("dijkstra-path-layer");
        if (map.getSource("dijkstra-search-source")) map.removeSource("dijkstra-search-source");
      }, 2000);
    }
  }

  setTimeout(step, stepDelay);
}

async function switchActiveRoute(index) {
  if (index === activeRouteIndex) return;
  activeRouteIndex = index;
  
  demoStartTime = Date.now();
  demoProgress = 0;
  isCameraLocked = true;
  smoothCamCenter = null;
  smoothCamBearing = null;
  smoothCamPitch = null;
  updateRecenterButtonState();
  
  await fetchTripState();

  if (currentRouteSegments && currentRouteSegments.length > 0) {
    isDijkstraRunning = true;
    setTimeout(() => {
      runDijkstraVisualizer(
        tripState ? tripState.plan.from : "",
        tripState ? tripState.plan.to : "",
        currentRouteSegments,
        () => {
          isDijkstraRunning = false;
          demoStartTime = Date.now();
        }
      );
    }, 200);
  }
}
window.switchActiveRoute = switchActiveRoute;

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {

  // ─── Authentication & Session Verification ───
  const urlParams = new URLSearchParams(window.location.search);
  const paramToken = urlParams.get("token");
  const paramOperator = urlParams.get("operator");

  if (paramToken && paramOperator) {
    localStorage.setItem("drivesphere_token", paramToken);
    localStorage.setItem("drivesphere_operator", paramOperator);
    // Clean up the URL query params so they don't clutter the address bar
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  const token = localStorage.getItem("drivesphere_token");
  const operatorStr = localStorage.getItem("drivesphere_operator");

  const redirectToLogin = async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        if (data && data.authUrl) {
          window.location.href = data.authUrl.endsWith("/") ? data.authUrl : data.authUrl + "/";
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch authUrl config, falling back to dynamic port 5000:", e);
    }
    // Fallback: same host, port 5000
    window.location.href = `${window.location.protocol}//${window.location.hostname}:5000/`;
  };

  if (!token || !operatorStr) {
    redirectToLogin();
    return;
  }

  // Parse and display operator info
  try {
    const operator = JSON.parse(operatorStr);
    if (operator && operator.name) {
      const opNameText = document.getElementById("operatorNameText");
      const opStatus = document.getElementById("operatorStatus");
      if (opNameText) opNameText.textContent = `Operator: ${operator.name}`;
      if (opStatus) opStatus.style.display = "inline-flex";
    }
  } catch (e) {
    console.warn("Failed to parse operator info:", e);
  }

  // Bind logout action
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("drivesphere_token");
      localStorage.removeItem("drivesphere_operator");
      redirectToLogin();
    });
  }

  // Start loading screen progress animation
  startLoading();

  // Make dashboard shell visible (transition opacity to 1)
  const appShell = document.getElementById("appShell");
  if (appShell) appShell.classList.add("visible");

  // Initialize placeholder animation (CSS-based, no Three.js globe)
  globeAnim = initPlaceholderAnimation();

  initMap();
  initGPS();

  // If this session is not currently navigating, clear any residual server-side plan
  if (sessionStorage.getItem("ds_navigating") !== "true") {
    fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true })
    }).catch(err => console.warn("Failed to clear server plan:", err.message));
  }

  ui.planForm.addEventListener("submit", submitPlan);
  const stopTripBtn = $("stopTripBtn");
  if (stopTripBtn) {
    stopTripBtn.addEventListener("click", () => {
      if (planAbortController) {
        planAbortController.abort();
      }
      sessionStorage.removeItem("ds_navigating");
      removeRouteLayers();
      routeMarkers.forEach(m => m.remove());
      routeMarkers = [];
      if (vehicleMarker) {
        vehicleMarker.remove();
        vehicleMarker = null;
      }
      // Notify server to clear the plan
      fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true })
      }).catch(err => console.warn("Failed to clear server plan:", err.message));

      const btn = document.getElementById("startTripBtn");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg> Start Navigation`;
      }
      stopTripBtn.style.display = "none";
    });
  }
  ui.btn3DToggle.addEventListener("click", toggle3D);
  ui.btnRecenter.addEventListener("click", recenterMap);
  ui.btnFullscreen.addEventListener("click", toggleFullscreen);
  ui.btnNasaLayer.addEventListener("click", toggleNASALayer);
  ui.btnMapStyleSelect.addEventListener("click", cycleMapStyle);
  ui.toggleTheme.addEventListener("click", toggleTheme);
  
  // Deviate & Recalculate
  const btnDeviate = $("btnDeviate");
  if (btnDeviate) btnDeviate.addEventListener("click", triggerDeviationSimulation);

  // Warning Modal Actions
  ui.btnCancelRoute.addEventListener("click", () => {
    ui.hazardModal.style.display = "none";
  });
  ui.btnAcceptHazards.addEventListener("click", () => {
    initializeDrivingView();
  });
  
  const btnDismissArrival = $("btnDismissArrival");
  if (btnDismissArrival) {
    btnDismissArrival.addEventListener("click", () => {
      $("arrivalModal").style.display = "none";
    });
  }

  ui.currentPlace.style.cursor = "pointer";
  ui.currentPlace.title = "Click to lock camera onto vehicle";
  ui.currentPlace.addEventListener("click", recenterMap);

  // Periodic updates
  setInterval(fetchTripState, 4000);
  setInterval(fetchNASAEvents, 180000); // 3 minutes
});
