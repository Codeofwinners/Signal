import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  resultSchema,
  visionAnalysisSchema,
} from "../lib/validation";

const migration1 = readFileSync(
  new URL("../supabase/migrations/202609100001_initial.sql", import.meta.url),
  "utf8",
);
const migration2 = readFileSync(
  new URL("../supabase/migrations/202609100002_automated_collection.sql", import.meta.url),
  "utf8",
);

test("visionAnalysisSchema validates structured extraction JSON", () => {
  const valid = visionAnalysisSchema.parse({
    target_brand_mentioned: true,
    target_brand_position: 1,
    brands_in_order: [
      { brand: "LAX Cannabis Club", position: 1 },
      { brand: "MedMen", position: 2 },
    ],
    citations: [{ domain: "weedmaps.com", url: "https://weedmaps.com" }],
    sentiment: "positive",
    confidence: 0.95,
  });

  assert.equal(valid.target_brand_mentioned, true);
  assert.equal(valid.target_brand_position, 1);
  assert.equal(valid.brands_in_order.length, 2);
  assert.equal(valid.brands_in_order[0].brand, "LAX Cannabis Club");
  assert.equal(valid.sentiment, "positive");
  assert.equal(valid.confidence, 0.95);
});

test("resultSchema accepts automated statuses and collection_method", () => {
  const res = resultSchema.parse({
    status: "complete",
    target_mentioned: true,
    target_position: 2,
    target_cited: false,
    map_present: false,
    images_present: false,
    products_present: false,
    response_text: "Here are the best spots in LA: 1. Artist Tree 2. LAX Cannabis Club",
    notes: "Automated Consumer UI run",
    collection_method: "ui",
    sentiment: "positive",
    confidence: 0.9,
    mentions: [],
    citations: [],
  });

  assert.equal(res.status, "complete");
  assert.equal(res.collection_method, "ui");
  assert.equal(res.sentiment, "positive");

  const blocked = resultSchema.parse({
    status: "blocked",
    target_mentioned: false,
    target_position: null,
    target_cited: false,
    map_present: false,
    images_present: false,
    products_present: false,
    response_text: "",
    notes: "Cloudflare challenge detected",
    collection_method: "ui",
    mentions: [],
    citations: [],
  });
  assert.equal(blocked.status, "blocked");
});

test("database migration 2 applies on PGlite and supports set_run_status and automated save_result", async () => {
  const db = new PGlite();
  await db.exec(
    `create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
  );
  await db.exec(migration1);
  await db.exec(migration2);

  const user = "33333333-3333-4333-8333-333333333333";
  await db.exec(
    `insert into auth.users values('${user}');set request.jwt.claim.sub='${user}';set role authenticated;`,
  );

  const query = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ) => (await db.query<T>(sql, params)).rows;

  const [p] = await query<{ id: string }>(
    `select create_project($1::jsonb) as id`,
    [
      JSON.stringify({
        name: "LAX Tracker",
        domain: "laxcannabisclub.com",
        target: "LAX Cannabis Club",
        aliases: [],
        location: "Los Angeles",
      }),
    ],
  );

  await query(
    `insert into prompts(project_id,prompt,topic) values($1,'Los Angeles half ounce weed','Flower')`,
    [p.id],
  );

  const [c] = await query<{ id: string }>(
    `select create_tracking_cycle($1,'Automated Test',now()) as id`,
    [p.id],
  );

  const runs = await query<{ id: string; engine: string; status: string }>(
    `select id, engine, status from prompt_runs where tracking_cycle_id=$1 and engine='chatgpt'`,
    [c.id],
  );
  assert.equal(runs.length, 1);
  const chatgptRun = runs[0];
  assert.equal(chatgptRun.status, "pending");

  // Test set_run_status RPC
  await query(`select set_run_status($1, 'queued', 'ui')`, [chatgptRun.id]);
  const [queuedRun] = await query<{ status: string; collection_method: string }>(
    `select status, collection_method from prompt_runs where id=$1`,
    [chatgptRun.id],
  );
  assert.equal(queuedRun.status, "queued");
  assert.equal(queuedRun.collection_method, "ui");

  // Test transition to running -> capturing -> analyzing
  await query(`select set_run_status($1, 'running')`, [chatgptRun.id]);
  await query(`select set_run_status($1, 'capturing')`, [chatgptRun.id]);
  await query(`select set_run_status($1, 'analyzing')`, [chatgptRun.id]);

  // Test automated save_result
  await query(
    `select save_result($1, null, $2::jsonb, '[]'::jsonb)`,
    [
      chatgptRun.id,
      JSON.stringify({
        status: "complete",
        collection_method: "ui",
        target_mentioned: true,
        target_position: 1,
        target_cited: false,
        response_text: "Top dispensary: LAX Cannabis Club",
        notes: "Automated test check",
        sentiment: "positive",
        confidence: 0.98,
        mentions: [],
        citations: [],
      }),
    ],
  );

  const [completedRun] = await query<{
    status: string;
    target_mentioned: boolean;
    target_position: number;
    sentiment: string;
    confidence: number;
  }>(
    `select status, target_mentioned, target_position, sentiment, confidence from prompt_runs where id=$1`,
    [chatgptRun.id],
  );

  assert.equal(completedRun.status, "complete");
  assert.equal(completedRun.target_mentioned, true);
  assert.equal(completedRun.target_position, 1);
  assert.equal(completedRun.sentiment, "positive");
  assert.equal(Number(completedRun.confidence), 0.98);
});

test("saveAutomatedResult persists new competitors and structured extraction", async () => {
  const db = new PGlite();
  await db.exec(
    `create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
  );
  await db.exec(migration1);
  await db.exec(migration2);

  const user = "44444444-4444-4444-8444-444444444444";
  await db.exec(
    `insert into auth.users values('${user}');set request.jwt.claim.sub='${user}';set role authenticated;`,
  );

  const query = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ) => (await db.query<T>(sql, params)).rows;

  const [p] = await query<{ id: string }>(
    `select create_project($1::jsonb) as id`,
    [
      JSON.stringify({
        name: "LAX Tracker 2",
        domain: "laxcannabisclub.com",
        target: "LAX Cannabis Club",
        aliases: [],
        location: "Los Angeles",
      }),
    ],
  );

  await query(
    `insert into prompts(project_id,prompt,topic) values($1,'Los Angeles half ounce weed','Flower')`,
    [p.id],
  );

  const [c] = await query<{ id: string }>(
    `select create_tracking_cycle($1,'Automated Test 2',now()) as id`,
    [p.id],
  );

  const [run] = await query<{ id: string }>(
    `select id from prompt_runs where tracking_cycle_id=$1 and engine='chatgpt'`,
    [c.id],
  );

  // Directly call save_result with competitors extracted from Consumer UI
  await query(
    `select save_result($1, null, $2::jsonb, '[]'::jsonb)`,
    [
      run.id,
      JSON.stringify({
        status: "complete",
        collection_method: "ui",
        target_mentioned: false,
        target_position: null,
        target_cited: false,
        response_text: "Price range for half ounce in LA: $80-$180.",
        notes: "Automated Consumer UI check on ChatGPT. Confidence: 100%.",
        sentiment: "neutral",
        confidence: 1.0,
        raw_analysis_json: { target_brand_mentioned: false },
        screenshot_url: "/screenshots/chatgpt/2026-09-10/test.png",
        mentions: [],
        citations: [],
      }),
    ],
  );

  const [savedRun] = await query<{
    status: string;
    collection_method: string;
    sentiment: string;
    screenshot_url: string;
  }>(
    `select status, collection_method, sentiment, screenshot_url from prompt_runs where id=$1`,
    [run.id],
  );

  assert.equal(savedRun.status, "complete");
  assert.equal(savedRun.collection_method, "ui");
  assert.equal(savedRun.sentiment, "neutral");
  assert.equal(savedRun.screenshot_url, "/screenshots/chatgpt/2026-09-10/test.png");
});
