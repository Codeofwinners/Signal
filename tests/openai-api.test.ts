import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAPIResponse } from "../services/api-analyzer";

test("analyzeAPIResponse extracts target brand, rank, competitors and citations deterministically", () => {
  const sampleResponse = `
Here are the top dispensary recommendations for prerolls in Los Angeles:

1. **LAX Cannabis Club** - Known for one of the largest selections of premium infused and whole-flower prerolls in Los Angeles. Located right by the airport.
2. **Jungle Boys** - Famous for high-potency signature strains like Topanga Canyon.
3. **The Artist Tree** - West Hollywood consumption lounge with great artisan pre-roll packs.
4. **Sweet Flower** - Boutique chain with multiple locations in Studio City and Melrose.

Other notable brands include 710 Labs and CBX (Cannabiotix).
`;

  const sampleSources = [
    {
      title: "Best Weed Dispensaries in Los Angeles - Weedmaps",
      url: "https://weedmaps.com/news/best-dispensaries-los-angeles",
      domain: "weedmaps.com",
    },
    {
      title: "LAX Cannabis Club Official Menu",
      url: "https://laxcannabisclub.com/menu/prerolls",
      domain: "laxcannabisclub.com",
    },
  ];

  const analysis = analyzeAPIResponse({
    responseText: sampleResponse,
    sources: sampleSources,
    targetBrand: "LAX Cannabis Club",
  });

  assert.equal(analysis.target_brand_mentioned, true);
  assert.equal(analysis.target_brand_position, 1);
  assert.ok(analysis.brands_in_order.length >= 3);
  assert.equal(analysis.brands_in_order[0].brand, "LAX Cannabis Club");
  assert.equal(analysis.brands_in_order[0].position, 1);
  assert.equal(analysis.sentiment, "positive");
  assert.ok(analysis.citations.length === 2);
  assert.equal(analysis.citations[0].domain, "weedmaps.com");
  assert.equal(analysis.citations[1].domain, "laxcannabisclub.com");
});

test("analyzeAPIResponse accurately handles when target brand is absent", () => {
  const sampleResponse = `
Top places to buy prerolls in LA:
1. **MedMen** - Downtown LA and West Hollywood.
2. **Jungle Boys** - Los Angeles.
3. **Erba Markets** - West LA.
`;

  const analysis = analyzeAPIResponse({
    responseText: sampleResponse,
    sources: [],
    targetBrand: "LAX Cannabis Club",
  });

  assert.equal(analysis.target_brand_mentioned, false);
  assert.equal(analysis.target_brand_position, null);
  assert.equal(analysis.brands_in_order.length, 3);
  assert.equal(analysis.brands_in_order[0].brand, "MedMen");
  assert.equal(analysis.brands_in_order[0].position, 1);
  assert.equal(analysis.brands_in_order[1].brand, "Jungle Boys");
  assert.equal(analysis.brands_in_order[1].position, 2);
  assert.equal(analysis.brands_in_order[2].brand, "Erba Markets");
  assert.equal(analysis.brands_in_order[2].position, 3);
});
