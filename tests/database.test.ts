import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync(
  new URL("../supabase/migrations/202609100001_initial.sql", import.meta.url),
  "utf8",
);
test("migration, ownership, engine expansion, historical snapshots, atomic saves and storage scope", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
    );
    await db.exec(migration);
    const user = "11111111-1111-4111-8111-111111111111",
      other = "22222222-2222-4222-8222-222222222222";
    await db.exec(
      `insert into auth.users values('${user}'),('${other}');set request.jwt.claim.sub='${user}';set role authenticated;`,
    );
    const query = async <T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ) => (await db.query<T>(sql, params)).rows;
    const [p] = await query<{ id: string }>(
      `select create_project($1::jsonb) as id`,
      [
        JSON.stringify({
          name: "Acme",
          domain: "acme.com",
          target: "Acme",
          aliases: ["ACME Co"],
          location: "LA",
        }),
      ],
    );
    assert.ok(p.id);
    await assert.rejects(
      () => query(`select create_tracking_cycle($1,'Empty',now())`, [p.id]),
      /active prompt/,
    );
    const [prompt] = await query<{ id: string }>(
      `insert into prompts(project_id,prompt,topic) values($1,'Best LA brands','Local') returning id`,
      [p.id],
    );
    await query(
      `insert into prompts(project_id,prompt,topic,active) values($1,'Inactive','Hidden',false)`,
      [p.id],
    );
    const [c] = await query<{ id: string }>(
      `select create_tracking_cycle($1,'Cycle one',now()) as id`,
      [p.id],
    );
    let runs = await query<{ id: string; engine: string; updated_at: string }>(
      `select id,engine,updated_at::text from prompt_runs where tracking_cycle_id=$1 order by engine`,
      [c.id],
    );
    assert.equal(runs.length, 4);
    assert.deepEqual(
      runs.map((r) => r.engine),
      ["chatgpt", "gemini", "perplexity", "claude"],
    );
    await query(
      `update prompts set prompt='New wording',topic='Updated' where id=$1`,
      [prompt.id],
    );
    assert.equal(
      (
        await query<{ prompt_snapshot: string }>(
          `select prompt_snapshot from prompt_runs where id=$1`,
          [runs[0].id],
        )
      )[0].prompt_snapshot,
      "Best LA brands",
    );
    const [c2] = await query<{ id: string }>(
      `select create_tracking_cycle($1,'Cycle two',now()) as id`,
      [p.id],
    );
    assert.equal(
      (
        await query<{ prompt_snapshot: string }>(
          `select prompt_snapshot from prompt_runs where tracking_cycle_id=$1 limit 1`,
          [c2.id],
        )
      )[0].prompt_snapshot,
      "New wording",
    );
    const result = {
      status: "complete",
      target_mentioned: true,
      target_position: 2,
      target_cited: true,
      map_present: false,
      images_present: true,
      products_present: false,
      response_text: "Actual answer",
      notes: "",
      mentions: [],
      citations: [
        {
          url: "https://www.example.com/article",
          domain: "example.com",
          title: "Source",
          position: 1,
          brand_id: null,
        },
      ],
    };
    await query(`select save_result($1,$2,$3)`, [
      runs[0].id,
      runs[0].updated_at,
      JSON.stringify(result),
    ]);
    assert.equal(
      (
        await query<{ status: string }>(
          `select status from tracking_cycles where id=$1`,
          [c.id],
        )
      )[0].status,
      "in_progress",
    );
    assert.equal(
      (
        await query<{ n: number }>(
          `select count(*)::int n from mentions where prompt_run_id=$1`,
          [runs[0].id],
        )
      )[0].n,
      1,
    );
    await assert.rejects(
      () =>
        query(`select save_result($1,$2,$3)`, [
          runs[0].id,
          runs[0].updated_at,
          JSON.stringify(result),
        ]),
      /another tab/,
    );
    // Completing/skipping/erroring the other engines resolves the cycle without altering history.
    for (let i = 1; i < 4; i++) {
      await query(`select save_result($1,$2,$3)`, [
        runs[i].id,
        runs[i].updated_at,
        JSON.stringify({
          ...result,
          status: ["complete", "skipped", "error"][i - 1],
        }),
      ]);
    }
    assert.equal(
      (
        await query<{ status: string }>(
          `select status from tracking_cycles where id=$1`,
          [c.id],
        )
      )[0].status,
      "completed",
    );
    assert.equal(
      (
        await query<{ n: number }>(
          `select count(*)::int n from prompt_runs where tracking_cycle_id=$1 and status='pending'`,
          [c2.id],
        )
      )[0].n,
      4,
    );
    // Storage metadata is attached only after a real object exists and belongs to the run.
    runs = await query(
      `select id,engine,updated_at::text from prompt_runs where tracking_cycle_id=$1 order by engine`,
      [c.id],
    );
    const path = `${p.id}/${runs[0].id}/test.png`;
    await assert.rejects(
      () =>
        query(`select save_result($1,$2,$3,$4)`, [
          runs[0].id,
          runs[0].updated_at,
          JSON.stringify({ ...result, response_text: "Should rollback" }),
          JSON.stringify([path]),
        ]),
      /upload missing/,
    );
    assert.equal(
      (
        await query<{ response_text: string }>(
          `select response_text from prompt_runs where id=$1`,
          [runs[0].id],
        )
      )[0].response_text,
      "Actual answer",
    );
    await query(
      `insert into storage.objects(bucket_id,name) values('screenshots',$1)`,
      [path],
    );
    await query(`select save_result($1,$2,$3,$4)`, [
      runs[0].id,
      runs[0].updated_at,
      JSON.stringify(result),
      JSON.stringify([path]),
    ]);
    assert.equal((await query(`select * from screenshots`)).length, 1);
    assert.equal(
      (
        await query(`delete from storage.objects where name=$1 returning *`, [
          path,
        ])
      ).length,
      0,
    );
    // Second user's read/write isolation, including storage and cross-project brand injection.
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal((await query("select * from projects")).length, 0);
    assert.equal((await query("select * from prompt_runs")).length, 0);
    assert.equal((await query("select * from storage.objects")).length, 0);
    await assert.rejects(
      () => query(`select create_tracking_cycle($1,'Intrusion',now())`, [p.id]),
      /not accessible/,
    );
    await assert.rejects(
      () =>
        query(`select save_result($1,$2,$3)`, [
          runs[1].id,
          runs[1].updated_at,
          JSON.stringify(result),
        ]),
      /not accessible/,
    );
    const [p2] = await query<{ id: string }>(`select create_project($1) id`, [
      JSON.stringify({
        name: "Other",
        domain: "other.com",
        target: "Other",
        aliases: [],
      }),
    ]);
    const [foreignBrand] = await query<{ id: string }>(
      `select id from brands where project_id=$1`,
      [p2.id],
    );
    await db.exec(`set request.jwt.claim.sub='${user}'`);
    const [fresh] = await query<{ updated_at: string }>(
      `select updated_at::text from prompt_runs where id=$1`,
      [runs[0].id],
    );
    await assert.rejects(
      () =>
        query(`select save_result($1,$2,$3)`, [
          runs[0].id,
          fresh.updated_at,
          JSON.stringify({
            ...result,
            mentions: [
              {
                brand_id: foreignBrand.id,
                position: 1,
                mention_count: 1,
                recommended: true,
              },
            ],
          }),
        ]),
      /same project/,
    );
    await assert.rejects(
      () =>
        query(
          `insert into brands(project_id,name,type) values($1,'Another target','target')`,
          [p.id],
        ),
      /one_target/,
    );
    await assert.rejects(
      () =>
        query(
          `insert into storage.objects(bucket_id,name) values('screenshots',$1)`,
          [`${p2.id}/${runs[0].id}/bad.png`],
        ),
      /row-level security/,
    );
    assert.equal(
      (
        await query(
          `update prompt_runs set response_text='Bypass' where id=$1 returning *`,
          [runs[0].id],
        )
      ).length,
      0,
    );
  } finally {
    await db.close();
  }
});
