/**
 * Parser Performance Benchmark
 *
 * Measures parsing performance metrics before and after optimization.
 * Run with: pnpm tsx scripts/benchmark-parser.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parseFigmaResponse } from "../src/core/parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test fixtures
const FIXTURES = [
  { name: "node-402-34955", desc: "Large component (1580x895)" },
  { name: "node-240-32163", desc: "Call Logs screen (375x827)" },
  { name: "real-node-data", desc: "Real node data" },
];

interface BenchmarkResult {
  fixture: string;
  description: string;
  nodeCount: number;
  parseTime: number;
  p50Time: number;
  p95Time: number;
  memoryUsed: number;
  outputSize: number;
  nodesPerMs: number;
}

interface PerformanceMetrics {
  totalParseTime: number;
  averageParseTime: number;
  totalMemoryUsed: number;
  totalNodes: number;
  nodesPerMs: number;
}

/**
 * Count total nodes in a Figma node tree
 */
function countNodesInTree(node: unknown): number {
  if (!node || typeof node !== "object") return 0;

  const record = node as Record<string, unknown>;
  let count = 0;

  // Count this node if it has id and type
  if ("id" in record && "type" in record) {
    count = 1;
  }

  // Recursively count children
  if ("children" in record && Array.isArray(record.children)) {
    for (const child of record.children) {
      count += countNodesInTree(child);
    }
  }

  return count;
}

/**
 * Count total nodes in Figma API response
 */
function countNodes(data: unknown): number {
  if (!data || typeof data !== "object") return 0;

  const record = data as Record<string, unknown>;
  let count = 0;

  // Handle GetFileNodesResponse format: { nodes: { "id": { document: {...} } } }
  if ("nodes" in record && typeof record.nodes === "object" && record.nodes !== null) {
    const nodes = record.nodes as Record<string, unknown>;
    for (const key of Object.keys(nodes)) {
      const nodeData = nodes[key] as Record<string, unknown>;
      if (nodeData && "document" in nodeData) {
        count += countNodesInTree(nodeData.document);
      }
    }
  }

  // Handle GetFileResponse format: { document: { children: [...] } }
  if ("document" in record && typeof record.document === "object") {
    count += countNodesInTree(record.document);
  }

  return count;
}

/**
 * Run benchmark on a single fixture
 */
function benchmarkFixture(fixturePath: string, iterations: number = 50): {
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50Time: number;
  p95Time: number;
  memoryDelta: number;
  outputSize: number;
  nodeCount: number;
} {
  const rawData = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  const nodeCount = countNodes(rawData);

  // Warm up (more iterations for JIT optimization)
  for (let i = 0; i < 5; i++) {
    parseFigmaResponse(rawData);
  }

  // Collect timings
  const times: number[] = [];
  let outputSize = 0;
  let memoryBefore = 0;
  let memoryAfter = 0;

  // Force GC if available
  if (global.gc) global.gc();
  memoryBefore = process.memoryUsage().heapUsed;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const result = parseFigmaResponse(rawData);
    const end = performance.now();
    times.push(end - start);

    if (i === 0) {
      outputSize = Buffer.byteLength(JSON.stringify(result));
    }
  }

  if (global.gc) global.gc();
  memoryAfter = process.memoryUsage().heapUsed;

  // Sort times for percentile calculation
  const sortedTimes = [...times].sort((a, b) => a - b);
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = sortedTimes[0];
  const maxTime = sortedTimes[sortedTimes.length - 1];
  const p50Time = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
  const p95Time = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
  const memoryDelta = memoryAfter - memoryBefore;

  return { avgTime, minTime, maxTime, p50Time, p95Time, memoryDelta, outputSize, nodeCount };
}

/**
 * Run all benchmarks
 */
function runBenchmarks(): void {
  console.log("=".repeat(70));
  console.log("Parser Performance Benchmark");
  console.log("=".repeat(70));
  console.log();

  const fixturesDir = path.join(__dirname, "../tests/fixtures/figma-data");
  const results: BenchmarkResult[] = [];

  for (const fixture of FIXTURES) {
    const fixturePath = path.join(fixturesDir, `${fixture.name}.json`);

    if (!fs.existsSync(fixturePath)) {
      console.log(`[SKIP] ${fixture.name} - file not found`);
      continue;
    }

    console.log(`Testing: ${fixture.name} (${fixture.desc})`);

    const { avgTime, minTime, maxTime, p50Time, p95Time, memoryDelta, outputSize, nodeCount } =
      benchmarkFixture(fixturePath);

    const result: BenchmarkResult = {
      fixture: fixture.name,
      description: fixture.desc,
      nodeCount,
      parseTime: avgTime,
      p50Time,
      p95Time,
      memoryUsed: memoryDelta,
      outputSize,
      nodesPerMs: nodeCount / p50Time,
    };

    results.push(result);

    console.log(`  Nodes: ${nodeCount}`);
    console.log(`  Parse time: avg=${avgTime.toFixed(2)}ms, p50=${p50Time.toFixed(2)}ms, p95=${p95Time.toFixed(2)}ms`);
    console.log(`  Range: min=${minTime.toFixed(2)}ms, max=${maxTime.toFixed(2)}ms`);
    console.log(`  Memory delta: ${(memoryDelta / 1024).toFixed(2)} KB`);
    console.log(`  Output size: ${(outputSize / 1024).toFixed(2)} KB`);
    console.log(`  Speed: ${(nodeCount / p50Time).toFixed(2)} nodes/ms (p50)`);
    console.log();
  }

  // Summary
  console.log("=".repeat(70));
  console.log("Summary");
  console.log("=".repeat(70));

  const totalNodes = results.reduce((sum, r) => sum + r.nodeCount, 0);
  const totalTime = results.reduce((sum, r) => sum + r.parseTime, 0);
  const avgNodesPerMs = totalNodes / totalTime;

  console.log(`Total fixtures: ${results.length}`);
  console.log(`Total nodes: ${totalNodes}`);
  console.log(`Total parse time: ${totalTime.toFixed(2)}ms`);
  console.log(`Average speed: ${avgNodesPerMs.toFixed(2)} nodes/ms`);
  console.log();

  // Output as JSON for comparison
  const metricsFile = path.join(__dirname, "../logs/benchmark-metrics.json");
  const metricsDir = path.dirname(metricsFile);
  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }

  const metrics: PerformanceMetrics = {
    totalParseTime: totalTime,
    averageParseTime: totalTime / results.length,
    totalMemoryUsed: results.reduce((sum, r) => sum + r.memoryUsed, 0),
    totalNodes,
    nodesPerMs: avgNodesPerMs,
  };

  fs.writeFileSync(
    metricsFile,
    JSON.stringify({ timestamp: new Date().toISOString(), metrics, results }, null, 2)
  );

  console.log(`Metrics saved to: ${metricsFile}`);
}

// Run benchmarks
runBenchmarks();
