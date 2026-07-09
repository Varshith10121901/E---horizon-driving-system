# DriveSphere: Core Testing Strategy & Test Cases

This document describes the layered testing strategy and specific test suites implemented to verify DriveSphere E-Horizon Driving Intelligence.

---

## 1. Core Testing Strategy & Types of Testing
DriveSphere utilizes a layered testing strategy consisting of three levels: static checks, API integration tests, and manual E2E/UAT.

### A. Static Syntax & Code Quality Verification
- **Purpose**: Performs compile-time static code checks to ensure that no invalid syntax, unresolved imports, or unclosed brackets make it into runtime.
- **Scope**: Evaluates both the Node.js backend server (`server.js`) and the client-side controller logic (`frontend/app.js`).
- **Command**:
  ```bash
  node --check server.js && node --check frontend/app.js
  ```

### B. Automated API Integration Testing
- **Purpose**: Validates endpoint request-response payloads, geocoding logic, caching, external data interfaces (NASA EONET), and path segment partitioning.
- **Scope**: Spawns an isolated test instance of the application on port 3001 and fires real HTTP requests to verify the API contract.
- **Command**:
  ```bash
  node test_runner.js
  ```
  *(Integrated directly into `npm test`)*

### C. Manual E2E / User Acceptance Testing (UAT)
- **Purpose**: Tests visual layouts, rendering speeds, responsive states, MapLibre GL 3D mapping layers, and real-time navigation HUD counters inside browser environments.
- **Scope**: Walkthrough testing of key user journeys under normal, hazard-obstructed, and dark/light theme conditions.

---

## 2. Detailed Unit & Integration Test Cases (Automated)
These tests are executed programmatically in an isolated server environment to ensure that changes to backend components do not break downstream API contracts.

### INT-001: Map Configuration Verification (`GET /api/map-config`)
- **Objective**: Ensure the client gets the correct map service configuration and API keys on startup.
- **Test Step**: Send an HTTP GET request to `/api/map-config`.
- **Assertions**:
  - Status code is exactly 200.
  - Response body is a valid JSON object containing the `provider` attribute.
  - `provider` resolves to `"NASA"`.

### INT-002: NASA Threat Feeds (`GET /api/nasa-events`)
- **Objective**: Verify that the server successfully aggregates active global wildfire and storm data from NASA EONET.
- **Test Step**: Send an HTTP GET request to `/api/nasa-events`.
- **Assertions**:
  - Status code is exactly 200.
  - Response body contains an `events` key which is a structured array.
  - Handles external network timeouts or rate limits gracefully without crashing the server process.

### INT-003: Coordinates Reverse-Geocoding (`GET /api/reverse-geocode`)
- **Objective**: Ensure the backend can translate raw coordinate strings into recognizable city/town names.
- **Test Step**: Send an HTTP GET request to `/api/reverse-geocode?lat=15.3647&lon=75.1240` (Hubli coordinates).
- **Assertions**:
  - Status code is exactly 200.
  - Response contains a `placeName` string containing `"Hubballi"`.
  - Checks that the reverse geocode cache stores the lookup to prevent hitting Nominatim rate limits on sub-second repeats.

### INT-004: Route Setup & Dynamic Segmentation (`POST /api/plan` & `GET /api/trip-state`)
- **Objective**: Validate that submitting route coordinates generates a segmented travel plan correctly.
- **Test Steps**:
  1. Send an HTTP POST request to `/api/plan` with payload:
     ```json
     {
       "from": "15.3647, 75.1240",
       "to": "14.9643, 74.7121",
       "vehicle": "Car",
       "passengers": 2
     }
     ```
  2. Send an HTTP GET request to `/api/trip-state`.
- **Assertions**:
  - POST response returns status 200 and `{ ok: true }`.
  - GET `/api/trip-state` returns status 200.
  - The plan origin and destination are saved correctly in server memory.
  - The `route.coordinates` array contains coordinates.
  - The `route.segments` array has been initialized with multiple safety-evaluated checkpoints.

### INT-005: Plan State Cache Purging (`POST /api/plan` with `clear: true`)
- **Objective**: Confirm that clearing the navigation memory correctly prevents the client dashboard from auto-simulating previous routes on startup.
- **Test Steps**:
  1. Send an HTTP POST request to `/api/plan` with payload `{ "clear": true }`.
  2. Send an HTTP GET request to `/api/trip-state`.
- **Assertions**:
  - Purge request returns status 200.
  - Subsequent trip state checks return empty strings `""` for both `plan.from` and `plan.to`.

---

## 3. Detailed Acceptance Test Cases (UAT / Manual)
These test cases document the user actions and expected UI states for a driver interacting with the system.

### UAT-001: Cinematic Intro Lifecycle
- **User Action**: Visit `http://localhost:3000` with a clean browser cache.
- **Expected Result**:
  - The screen goes pitch-black.
  - The glowing silver and green vector SVG logo draws itself dynamically.
  - Slogan *"See Beyond. Drive Safe. Save Lives."* types onto the screen.
  - An automated transition fades out the intro after 3.5s (or immediately if clicking "Skip") and reveals the landing page.

### UAT-002: Guest and Registered Login Sessions
- **User Action**: Click *Continue as Guest* or log in with an email/password.
- **Expected Result**:
  - An Structure-validated session is set in `localStorage` under `drivesphere_token` and `drivesphere_operator`.
  - The landing showcase fades out, and the dashboard shell appears.
  - Refreshing the page skips the intro and landing pages, loading directly into the dashboard.

### UAT-003: Auto-Route Prevention
- **User Action**: Reopen a closed browser tab or reload the dashboard after a fresh login.
- **Expected Result**:
  - The map stays completely stationary.
  - The route input forms are empty, prompting the user to type a destination.
  - No simulation or GPS tracking path is drawn on the map canvas until the user submits a plan.

### UAT-004: Interactive Map Elevation & Navigation
- **User Action**: Enter a destination in India and click *Start Navigation*.
- **Expected Result**:
  - Map camera tilts and centers on your current GPS location.
  - The route coordinates are drawn as an overlay.
  - The vehicle indicator begins simulated movement, updating the speedometer HUD and segment timeline.

### UAT-005: Landslide / Disaster Detour Calculation (Dijkstra)
- **User Action**: Simulate or input a route with an active landslide/flood segment (e.g. heavy rain on curves in the Ghats).
- **Expected Result**:
  - The timeline segment turns Red.
  - A modal warns the user: *"Hazard Detected Ahead!"*.
  - The Dijkstra Console opens and logs search relaxations in real-time.
  - A new, safe alternative path (detour) is drawn on the map, and safe hotel shelter coordinates are recommended.

### UAT-006: Contrast Legibility in Light Theme
- **User Action**: Click the theme toggle button to switch the site to Light Mode.
- **Expected Result**:
  - The dashboard card backgrounds turn pure white, and texts turn dark slate.
  - The Dijkstra Terminal Console retains its dark-theme console window.
  - The terminal logs are written in high-contrast static colors (light grey, yellow, emerald green, and red) to remain readable on the dark terminal console background.
