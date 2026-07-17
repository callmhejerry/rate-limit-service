const clientId = 'concurrency-test-client';

async function run() {
  console.log('--- WARMING UP TESTING CLIENT ---');
  // 1. Create a client with capacity 10 and refill rate 1/sec
  const createRes = await fetch('http://localhost:3000/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: clientId,
      name: 'Concurrency Test Client',
      apiKey: 'test-key',
      capacity: 10,
      refillRatePerSecond: 1,
      algorithm: 'TOKEN_BUCKET',
      enabled: true,
    }),
  });
  const clientInfo = await createRes.json();
  console.log('Created client:', clientInfo);

  // Wait 1 second to ensure the bucket is completely full of 10 tokens
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log('\n--- CONCURRENCY TEST ---');
  console.log('Sending 15 concurrent requests to check rate limit (capacity = 10)...');

  const promises = [];
  for (let i = 0; i < 15; i++) {
    promises.push(
      fetch('http://localhost:3000/rate-limit/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      }).then((r) => r.json()),
    );
  }

  const results = await Promise.all(promises);
  const allowedCount = results.filter((r) => r.allowed).length;
  const blockedCount = results.filter((r) => !r.allowed).length;

  console.log('Results breakdown:');
  console.log(`Allowed: ${allowedCount}`);
  console.log(`Blocked: ${blockedCount}`);

  if (allowedCount === 10 && blockedCount === 5) {
    console.log('✅ Concurrency test PASSED: Exactly 10 requests allowed, and 5 blocked under race conditions!');
  } else {
    console.log(`❌ Concurrency test FAILED: Expected 10 allowed and 5 blocked, got ${allowedCount} allowed and ${blockedCount} blocked.`);
  }

  console.log('\n--- LOAD / STRESS TEST ---');
  console.log('Sending 500 requests as fast as possible to measure throughput and latency...');

  // Set the client capacity to 1000 temporarily so requests aren't blocked, allowing us to stress test the actual path
  await fetch('http://localhost:3000/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: clientId,
      name: 'Concurrency Test Client',
      apiKey: 'test-key',
      capacity: 1000,
      refillRatePerSecond: 100,
      algorithm: 'TOKEN_BUCKET',
      enabled: true,
    }),
  });

  const totalRequests = 500;
  const start = Date.now();
  const latencies = [];

  for (let i = 0; i < totalRequests; i++) {
    const reqStart = Date.now();
    await fetch('http://localhost:3000/rate-limit/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    latencies.push(Date.now() - reqStart);
  }

  const duration = Date.now() - start;
  const avgLatency = latencies.reduce((sum, val) => sum + val, 0) / totalRequests;
  const rps = (totalRequests / duration) * 1000;

  console.log(`Duration: ${duration} ms`);
  console.log(`Average Latency: ${avgLatency.toFixed(2)} ms`);
  console.log(`Throughput: ${rps.toFixed(2)} requests/sec`);

  if (avgLatency < 10) {
    console.log('✅ Load test PASSED: Average latency is under 10ms!');
  } else {
    console.log(`⚠️ Load test WARNING: Average latency is ${avgLatency.toFixed(2)}ms (expected < 10ms).`);
  }
}

run().catch(console.error);
