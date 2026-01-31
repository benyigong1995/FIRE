import { calculateDurationYears } from './web/calc.js';

// Test case
// Savings 7M, Spend 20k/mo (240k/yr)
// Infl 3%, Return 5% -> Real ~1.94%
// 240k is 3.4% of 7M. SWR is usually 4%. So this should last long or forever.
const y1 = calculateDurationYears({
  savings: 7000000,
  monthlySpend: 20000,
  inflationPct: 3,
  nominalReturnPct: 5
});
console.log('Test 1 (Safe):', y1);

// Test case 2: Spend 50k/mo (600k/yr) -> 8.5% rate. Should fail fast.
const y2 = calculateDurationYears({
  savings: 7000000,
  monthlySpend: 50000,
  inflationPct: 3,
  nominalReturnPct: 5
});
console.log('Test 2 (Burn):', y2);

// Test case 3: Infinity
const y3 = calculateDurationYears({
  savings: 100000000, // 100M
  monthlySpend: 10000,
  inflationPct: 3,
  nominalReturnPct: 5
});
console.log('Test 3 (Infinity):', y3);
