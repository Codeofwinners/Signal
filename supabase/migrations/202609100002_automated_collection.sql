-- Migration: Support automated collection statuses, collection_method, and analysis metadata
alter type public.run_status add value if not exists 'queued';
alter type public.run_status add value if not exists 'running';
alter type public.run_status add value if not exists 'capturing';
alter type public.run_status add value if not exists 'analyzing';
alter type public.run_status add value if not exists 'blocked';
alter type public.run_status add value if not exists 'needs_review';
alter type public.run_status add value if not exists 'failed';

alter table public.prompt_runs
  add column if not exists collection_method text not null default 'manual' check (collection_method in ('ui','api','manual')),
  add column if not exists sentiment text check (sentiment in ('positive','neutral','negative')),
  add column if not exists confidence numeric(4,3),
  add column if not exists raw_analysis_json jsonb,
  add column if not exists screenshot_url text;

-- Helper RPC to update run status and collection method atomically during background automation
create or replace function public.set_run_status(
  p_run_id uuid,
  p_status run_status,
  p_collection_method text default null
) returns void language plpgsql security definer set search_path=public as $$
declare r prompt_runs;
begin
  select * into r from prompt_runs where id=p_run_id;
  if not found or not owns_project(r.project_id) then
    raise exception 'Run not accessible';
  end if;
  update prompt_runs set
    status=p_status,
    collection_method=coalesce(p_collection_method, collection_method)
  where id=p_run_id;
end $$;

grant execute on function public.set_run_status(uuid, run_status, text) to authenticated;

-- Enhanced save_result supporting automated statuses and new metadata
create or replace function public.save_result(
  p_run_id uuid,
  p_expected_updated_at timestamptz,
  p_result jsonb,
  p_screenshots jsonb default '[]'
) returns void language plpgsql security definer set search_path=public as $$
declare
  r prompt_runs;
  m jsonb;
  c jsonb;
  s text;
  target_id uuid;
  run_state run_status;
begin
  select * into r from prompt_runs where id=p_run_id;
  if not found or not owns_project(r.project_id) then
    raise exception 'Run not accessible';
  end if;

  perform 1 from tracking_cycles where id=r.tracking_cycle_id for update;
  select * into r from prompt_runs where id=p_run_id for update;

  if p_expected_updated_at is not null and r.updated_at is distinct from p_expected_updated_at then
    raise exception 'This result changed in another tab. Reload before saving.';
  end if;

  run_state := (p_result->>'status')::run_status;
  if run_state is null or run_state='pending' or run_state='queued' or run_state='running' or run_state='capturing' or run_state='analyzing' then
    raise exception 'Invalid final status. Expected complete, needs_review, blocked, failed, skipped, or error';
  end if;

  if jsonb_typeof(coalesce(p_result->'mentions', '[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_result->'citations', '[]'::jsonb))<>'array' then
    raise exception 'Invalid result arrays';
  end if;

  update prompt_runs set
    status=run_state,
    response_text=coalesce(p_result->>'response_text',''),
    target_mentioned=coalesce((p_result->>'target_mentioned')::boolean, false),
    target_position=(p_result->>'target_position')::integer,
    target_cited=coalesce((p_result->>'target_cited')::boolean, false),
    map_present=coalesce((p_result->>'map_present')::boolean, false),
    images_present=coalesce((p_result->>'images_present')::boolean, false),
    products_present=coalesce((p_result->>'products_present')::boolean, false),
    notes=coalesce(p_result->>'notes',''),
    checked_at=now(),
    collection_method=coalesce(p_result->>'collection_method', collection_method),
    sentiment=p_result->>'sentiment',
    confidence=(p_result->>'confidence')::numeric,
    raw_analysis_json=p_result->'raw_analysis_json',
    screenshot_url=p_result->>'screenshot_url'
  where id=p_run_id;

  delete from mentions where prompt_run_id=p_run_id;
  select id into target_id from brands where project_id=r.project_id and type='target';

  if p_result->'mentions' is not null then
    for m in select * from jsonb_array_elements(p_result->'mentions') loop
      if (m->>'brand_id')::uuid=target_id and not coalesce((p_result->>'target_mentioned')::boolean, false) then
        raise exception 'Target mention conflicts with target flag';
      end if;
      insert into mentions(prompt_run_id,brand_id,position,mention_count,recommended,context)
      values(p_run_id,(m->>'brand_id')::uuid,(m->>'position')::integer,coalesce((m->>'mention_count')::integer, 1),coalesce((m->>'recommended')::boolean, false),coalesce(m->>'context',''))
      on conflict(prompt_run_id,brand_id) do update set
        position=excluded.position,
        mention_count=excluded.mention_count,
        recommended=excluded.recommended,
        context=excluded.context;
    end loop;
  end if;

  if coalesce((p_result->>'target_mentioned')::boolean, false) and target_id is not null then
    insert into mentions(prompt_run_id,brand_id,position,mention_count)
    values(p_run_id,target_id,(p_result->>'target_position')::integer,1)
    on conflict(prompt_run_id,brand_id) do update set position=excluded.position;
  end if;

  delete from citations where prompt_run_id=p_run_id;
  if p_result->'citations' is not null then
    for c in select * from jsonb_array_elements(p_result->'citations') loop
      insert into citations(prompt_run_id,url,domain,title,position,brand_id)
      values(
        p_run_id,
        coalesce(c->>'url', 'https://' || coalesce(c->>'domain', 'unknown.com')),
        lower(regexp_replace(coalesce(c->>'url', c->>'domain'), '^https?://(?:[^/@]*@)?(?:www\.)?([^/:?#]+).*$', '\1','i')),
        coalesce(c->>'title',''),
        (c->>'position')::integer,
        (c->>'brand_id')::uuid
      );
    end loop;
  end if;

  if p_screenshots is not null then
    for s in select * from jsonb_array_elements_text(p_screenshots) loop
      if split_part(s,'/',1)<>r.project_id::text or split_part(s,'/',2)<>r.id::text then
        raise exception 'Invalid screenshot path';
      end if;
      if not exists(select 1 from storage.objects where bucket_id='screenshots' and name=s) then
        raise exception 'Screenshot upload missing';
      end if;
      insert into screenshots(prompt_run_id,storage_path) values(p_run_id,s) on conflict(storage_path) do nothing;
    end loop;
  end if;

  update tracking_cycles set
    status=case when not exists(select 1 from prompt_runs where tracking_cycle_id=r.tracking_cycle_id and status in ('pending', 'queued', 'running', 'capturing', 'analyzing')) then 'completed'::cycle_status else 'in_progress'::cycle_status end,
    completed_at=case when not exists(select 1 from prompt_runs where tracking_cycle_id=r.tracking_cycle_id and status in ('pending', 'queued', 'running', 'capturing', 'analyzing')) then coalesce(completed_at,now()) else null end
  where id=r.tracking_cycle_id;
end $$;
