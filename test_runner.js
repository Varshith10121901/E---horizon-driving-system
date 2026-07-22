const { spawn } = require('child_process');
const assert = require('assert');

const TEST_PORT = 3001;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let serverProcess;

function startServer() {
  return new Promise((resolve, reject) => {
    console.log(`Starting test server on port ${TEST_PORT}...`);
    serverProcess = spawn('node', ['server.js'], {
      env: { ...process.env, PORT: TEST_PORT }
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('running at') || output.includes('http://localhost:')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server Error] ${data}`);
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });

    // Timeout if server doesn't start in 8 seconds
    setTimeout(() => reject(new Error('Server start timeout')), 8000);
  });
}

function stopServer() {
  if (serverProcess) {
    console.log('Stopping test server...');
    serverProcess.kill();
  }
}

async function runTests() {
  const results = [];

  const runTestCase = async (name, fn) => {
    console.log(`\nRunning: ${name}`);
    try {
      await fn();
      console.log(` Passed: ${name}`);
      results.push({ name, status: 'PASSED' });
    } catch (err) {
      console.error(` Failed: ${name}`);
      console.error(err);
      results.push({ name, status: 'FAILED', error: err.message });
    }
  };

  // Test Case 1: Map Configuration Endpoint
  await runTestCase('GET /api/map-config - Fetch map keys and styles', async () => {
    const res = await fetch(`${BASE_URL}/api/map-config`);
    assert.strictEqual(res.status, 200, 'Status should be 200');
    const data = await res.json();
    assert.ok(data.provider, 'Response should contain map provider key');
    console.log(`   Map provider found: ${data.provider}`);
  });

  // Test Case 2: NASA Events Endpoint
  await runTestCase('GET /api/nasa-events - Fetch active disasters (Wildfires/Storms)', async () => {
    const res = await fetch(`${BASE_URL}/api/nasa-events`);
    assert.strictEqual(res.status, 200, 'Status should be 200');
    const data = await res.json();
    assert.ok(Array.isArray(data.events), 'events property should be an array');
    console.log(`   NASA EONET: Loaded ${data.events.length} active event pins.`);
  });

  // Test Case 3: Reverse Geocoding Endpoint
  await runTestCase('GET /api/reverse-geocode - Resolve place name from coordinate', async () => {
    const res = await fetch(`${BASE_URL}/api/reverse-geocode?lat=15.3647&lon=75.1240`);
    assert.strictEqual(res.status, 200, 'Status should be 200');
    const data = await res.json();
    assert.ok(data.placeName, 'Response should contain geocoded place name');
    console.log(`   Resolved location: ${data.placeName}`);
  });

  // Test Case 4: Plan Creation & Dynamic Segmentation
  await runTestCase('POST /api/plan & GET /api/trip-state - Set and fetch active navigation route', async () => {
    // 1. Submit plan (using coordinates to guarantee instant geocoding resolution)
    const planPayload = {
      from: '15.3647, 75.1240', // Hubli GPS
      to: '14.9643, 74.7121',   // Yellapur GPS
      vehicle: 'Car',
      passengers: 2
    };
    const postRes = await fetch(`${BASE_URL}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(planPayload)
    });
    assert.strictEqual(postRes.status, 200, 'POST /api/plan should succeed');
    const postData = await postRes.json();
    assert.strictEqual(postData.ok, true, 'Response ok should be true');

    // 2. Fetch trip state
    const stateRes = await fetch(`${BASE_URL}/api/trip-state?progress=0&routeIndex=0`);
    assert.strictEqual(stateRes.status, 200, 'GET /api/trip-state should succeed');
    const stateData = await stateRes.json();
    
    assert.ok(stateData.plan.from, 'Origin should be set');
    assert.ok(stateData.plan.to, 'Destination should be set');
    assert.ok(stateData.route.coordinates.length > 0, 'Route coordinates should be populated');
    assert.ok(stateData.route.segments.length > 0, 'Route segmentation should be initialized');
    console.log(`   Created Route: Generated ${stateData.route.segments.length} segment splits.`);
  });

  // Test Case 5: Route Clearing
  await runTestCase('POST /api/plan (clear) - Clear active navigation plan', async () => {
    const clearRes = await fetch(`${BASE_URL}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear: true })
    });
    assert.strictEqual(clearRes.status, 200, 'Clear request should succeed');

    const stateRes = await fetch(`${BASE_URL}/api/trip-state?progress=0&routeIndex=0`);
    const stateData = await stateRes.json();
    assert.strictEqual(stateData.plan.from, '', 'Plan origin should be empty after clear');
    assert.strictEqual(stateData.plan.to, '', 'Plan destination should be empty after clear');
    console.log('   Plan memory cleared successfully.');
  });

  // Print Test Report
  console.log('\n======================================');
  console.log('          TEST RESULTS REPORT         ');
  console.log('======================================');
  let passedCount = 0;
  results.forEach((r, idx) => {
    console.log(`${idx + 1}. [${r.status}] ${r.name}`);
    if (r.status === 'PASSED') passedCount++;
  });
  console.log('--------------------------------------');
  console.log(`Summary: ${passedCount}/${results.length} tests passed.`);
  console.log('======================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

async function runUnitTests() {
  console.log('\n======================================');
  console.log('         RUNNING UNIT TESTS           ');
  console.log('======================================');

  const { clamp, getDistanceKm, parseCSV, getSpeedLimitForNdvi, estimateNdviForPoints, estimateSegmentType } = require('./server.js');

  // Test clamp
  console.log('Testing clamp()...');
  assert.strictEqual(clamp(5, 1, 10), 5, 'clamp mid range');
  assert.strictEqual(clamp(0, 1, 10), 1, 'clamp below min');
  assert.strictEqual(clamp(15, 1, 10), 10, 'clamp above max');
  console.log(' clamp() passed.');

  // Test getDistanceKm
  console.log('Testing getDistanceKm()...');
  const d = getDistanceKm(15.3647, 75.1240, 14.9643, 74.7121);
  assert.ok(d > 60 && d < 70, `Distance should be roughly 64.7km (got ${d}km)`);
  console.log(' getDistanceKm() passed.');

  // Test parseCSV
  console.log('Testing parseCSV()...');
  const parsed = parseCSV('col1,col2\nval1,val2\n"val3,with,commas",val4');
  assert.strictEqual(parsed.length, 3, 'parsed rows count');
  assert.strictEqual(parsed[2][0], 'val3,with,commas', 'parsed quoted commas');
  console.log(' parseCSV() passed.');

  // Test getSpeedLimitForNdvi
  console.log('Testing getSpeedLimitForNdvi()...');
  assert.strictEqual(getSpeedLimitForNdvi(0.75), 40, 'Dense forest limit');
  assert.strictEqual(getSpeedLimitForNdvi(0.65), 60, 'Moderate vegetation limit');
  assert.strictEqual(getSpeedLimitForNdvi(0.3), 80, 'Default highway limit');
  console.log(' getSpeedLimitForNdvi() passed.');

  // Test estimateNdviForPoints
  console.log('Testing estimateNdviForPoints()...');
  const ndviVal = estimateNdviForPoints([[75.1240, 15.3647]]);
  assert.ok(ndviVal >= 0.0 && ndviVal <= 1.0, 'NDVI must be bounded in [0, 1]');
  console.log(' estimateNdviForPoints() passed.');

  // Test estimateSegmentType
  console.log('Testing estimateSegmentType()...');
  const typeForest = estimateSegmentType(0.7, [[75.1240, 15.3647]]);
  assert.ok(typeof typeForest === 'string', 'Segment type should be a string');
  console.log(' estimateSegmentType() passed.');

  console.log('\n All Unit Tests Passed successfully!');
  console.log('======================================\n');
}

async function main() {
  try {
    // Run isolated unit tests first (no server process needed)
    await runUnitTests();

    // Run HTTP API integration tests second (spawns test server process)
    await startServer();
    await runTests();
  } catch (err) {
    console.error('Fatal test run failure:', err);
    process.exit(1);
  } finally {
    stopServer();
  }
}

main();
