-- All client access is authenticated and scoped to the project's owner.
create type public.brand_type as enum ('target','competitor');
create type public.prompt_intent as enum ('informational','commercial','transactional','local');
create type public.ai_engine as enum ('chatgpt','gemini','perplexity','claude');
create type public.cycle_status as enum ('pending','in_progress','completed');
create type public.run_status as enum ('pending','complete','skipped','error');
create table public.projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100), domain text not null, location text not null default '', logo_url text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.brands (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100), domain text not null default '', type public.brand_type not null,
 created_at timestamptz not null default now(), unique(id,project_id)
);
create unique index one_target_per_project on public.brands(project_id) where type='target';
create unique index unique_brand_name on public.brands(project_id,lower(name));
create table public.brand_aliases (id uuid primary key default gen_random_uuid(),brand_id uuid not null references public.brands(id) on delete cascade,alias text not null check(length(trim(alias))>0),unique(brand_id,alias));
create table public.prompts (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 prompt text not null check(length(trim(prompt)) between 1 and 4000),topic text not null,intent public.prompt_intent not null default 'commercial',location text not null default '',active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,project_id)
);
create table public.tracking_cycles (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,name text not null check(length(trim(name)) between 1 and 100),
 started_at timestamptz not null default now(),completed_at timestamptz,status public.cycle_status not null default 'pending',created_at timestamptz not null default now(),unique(id,project_id)
);
create table public.prompt_runs (
 id uuid primary key default gen_random_uuid(),tracking_cycle_id uuid not null,project_id uuid not null references public.projects(id) on delete cascade,prompt_id uuid not null,
 engine public.ai_engine not null,status public.run_status not null default 'pending',prompt_snapshot text not null,topic_snapshot text not null,
 response_text text not null default '',target_mentioned boolean not null default false,target_position integer check(target_position between 1 and 10000),target_cited boolean not null default false,
 map_present boolean not null default false,images_present boolean not null default false,products_present boolean not null default false,notes text not null default '',checked_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(tracking_cycle_id,project_id) references public.tracking_cycles(id,project_id) on delete cascade,
 foreign key(prompt_id,project_id) references public.prompts(id,project_id),unique(tracking_cycle_id,prompt_id,engine),unique(id,project_id),
 check(target_mentioned or target_position is null)
);
create table public.mentions (
 id uuid primary key default gen_random_uuid(),prompt_run_id uuid not null references public.prompt_runs(id) on delete cascade,brand_id uuid not null references public.brands(id),
 position integer check(position between 1 and 10000),mention_count integer not null default 1 check(mention_count between 1 and 10000),recommended boolean not null default false,context text not null default '',unique(prompt_run_id,brand_id)
);
create table public.citations (
 id uuid primary key default gen_random_uuid(),prompt_run_id uuid not null references public.prompt_runs(id) on delete cascade,
 url text not null check(url ~* '^https?://[^/[:space:]]+'),domain text not null,title text not null default '',position integer check(position between 1 and 10000),brand_id uuid references public.brands(id),created_at timestamptz not null default now()
);
create table public.screenshots (id uuid primary key default gen_random_uuid(),prompt_run_id uuid not null references public.prompt_runs(id) on delete cascade,storage_path text not null unique,created_at timestamptz not null default now());
create index on public.projects(owner_id);
create index on public.brands(project_id);
create index on public.prompts(project_id,active);
create index on public.tracking_cycles(project_id,started_at desc,created_at desc);
create index on public.prompt_runs(project_id,tracking_cycle_id,status);
create index on public.prompt_runs(prompt_id);
create index on public.mentions(brand_id);
create index on public.citations(prompt_run_id);
create index on public.citations(brand_id);
create index on public.citations(domain);
create index on public.screenshots(prompt_run_id);
create function public.owns_project(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from projects where id=p_id and owner_id=auth.uid()); $$;
create function public.owns_run(r_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from prompt_runs where id=r_id and owns_project(project_id)); $$;
create function public.owns_brand(b_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from brands where id=b_id and owns_project(project_id)); $$;
alter table public.projects enable row level security;
create policy owner_projects on public.projects for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
alter table public.brands enable row level security;
create policy owner_brands on public.brands for all to authenticated using(public.owns_project(project_id)) with check(public.owns_project(project_id));
alter table public.brand_aliases enable row level security;
create policy owner_aliases on public.brand_aliases for all to authenticated using(public.owns_brand(brand_id)) with check(public.owns_brand(brand_id));
alter table public.prompts enable row level security;
create policy owner_prompts on public.prompts for all to authenticated using(public.owns_project(project_id)) with check(public.owns_project(project_id));
alter table public.tracking_cycles enable row level security;
create policy read_cycles on public.tracking_cycles for select to authenticated using(public.owns_project(project_id));
alter table public.prompt_runs enable row level security;
create policy read_runs on public.prompt_runs for select to authenticated using(public.owns_project(project_id));
alter table public.mentions enable row level security;
create policy read_mentions on public.mentions for select to authenticated using(public.owns_run(prompt_run_id));
alter table public.citations enable row level security;
create policy read_citations on public.citations for select to authenticated using(public.owns_run(prompt_run_id));
alter table public.screenshots enable row level security;
create policy read_screenshots on public.screenshots for select to authenticated using(public.owns_run(prompt_run_id));
-- Result writes and cycle creation go through atomic RPCs only.
create function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp();return new;end $$;
create trigger touch_projects before update on public.projects for each row execute function public.touch_updated_at();
create trigger touch_prompts before update on public.prompts for each row execute function public.touch_updated_at();
create trigger touch_runs before update on public.prompt_runs for each row execute function public.touch_updated_at();
create function public.validate_child_brand() returns trigger language plpgsql set search_path=public as $$ begin
 if new.brand_id is not null and not exists(select 1 from brands b join prompt_runs r on r.project_id=b.project_id where b.id=new.brand_id and r.id=new.prompt_run_id) then raise exception 'Brand must belong to the same project as the run';end if;return new;end $$;
create trigger mention_brand_scope before insert or update on public.mentions for each row execute function public.validate_child_brand();
create trigger citation_brand_scope before insert or update on public.citations for each row execute function public.validate_child_brand();
create function public.create_project(payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare p uuid; b uuid; a text;begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 insert into projects(name,domain,location,logo_url) values(payload->>'name',payload->>'domain',coalesce(payload->>'location',''),nullif(payload->>'logo_url','')) returning id into p;
 insert into brands(project_id,name,domain,type) values(p,payload->>'target',payload->>'domain','target') returning id into b;
 for a in select distinct trim(value) from jsonb_array_elements_text(coalesce(payload->'aliases','[]')) loop
 if a<>'' then insert into brand_aliases(brand_id,alias) values(b,a);end if;end loop;return p;end $$;
create function public.create_tracking_cycle(p_project_id uuid,p_name text,p_started_at timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare c uuid;begin
 if not owns_project(p_project_id) then raise exception 'Project not accessible';end if;
 perform 1 from projects where id=p_project_id for update;
 if not exists(select 1 from prompts where project_id=p_project_id and active) then raise exception 'Add at least one active prompt first';end if;
 insert into tracking_cycles(project_id,name,started_at) values(p_project_id,p_name,p_started_at) returning id into c;
 insert into prompt_runs(tracking_cycle_id,project_id,prompt_id,engine,prompt_snapshot,topic_snapshot)
 select c,p_project_id,p.id,e,p.prompt,p.topic from prompts p cross join unnest(enum_range(null::ai_engine)) e where p.project_id=p_project_id and p.active;
 return c;end $$;
create function public.save_result(p_run_id uuid,p_expected_updated_at timestamptz,p_result jsonb,p_screenshots jsonb default '[]') returns void language plpgsql security definer set search_path=public as $$
declare r prompt_runs; m jsonb; c jsonb; s text; target_id uuid; run_state run_status;begin
 select * into r from prompt_runs where id=p_run_id;
 if not found or not owns_project(r.project_id) then raise exception 'Run not accessible';end if;
 -- Serialize within a cycle so simultaneous saves produce correct progress.
 perform 1 from tracking_cycles where id=r.tracking_cycle_id for update;
 select * into r from prompt_runs where id=p_run_id for update;
 if r.updated_at is distinct from p_expected_updated_at then raise exception 'This result changed in another tab. Reload before saving.';end if;
 run_state := (p_result->>'status')::run_status;
 if run_state is null or run_state='pending' then raise exception 'Choose complete, skipped, or error';end if;
 if jsonb_typeof(p_result->'mentions')<>'array' or jsonb_typeof(p_result->'citations')<>'array' then raise exception 'Invalid result arrays';end if;
 update prompt_runs set status=run_state,response_text=coalesce(p_result->>'response_text',''),target_mentioned=(p_result->>'target_mentioned')::boolean,
 target_position=(p_result->>'target_position')::integer,target_cited=(p_result->>'target_cited')::boolean,map_present=(p_result->>'map_present')::boolean,
 images_present=(p_result->>'images_present')::boolean,products_present=(p_result->>'products_present')::boolean,notes=coalesce(p_result->>'notes',''),checked_at=now() where id=p_run_id;
 delete from mentions where prompt_run_id=p_run_id;
 select id into target_id from brands where project_id=r.project_id and type='target';
 for m in select * from jsonb_array_elements(p_result->'mentions') loop
 if (m->>'brand_id')::uuid=target_id and not (p_result->>'target_mentioned')::boolean then raise exception 'Target mention conflicts with target flag';end if;
 insert into mentions(prompt_run_id,brand_id,position,mention_count,recommended,context) values(p_run_id,(m->>'brand_id')::uuid,(m->>'position')::integer,(m->>'mention_count')::integer,(m->>'recommended')::boolean,coalesce(m->>'context',''));end loop;
 -- A checked target mention always contributes at least one appearance to SOV.
 if (p_result->>'target_mentioned')::boolean then
 insert into mentions(prompt_run_id,brand_id,position,mention_count) values(p_run_id,target_id,(p_result->>'target_position')::integer,1)
 on conflict(prompt_run_id,brand_id) do update set position=excluded.position;end if;
 delete from citations where prompt_run_id=p_run_id;
 for c in select * from jsonb_array_elements(p_result->'citations') loop
 insert into citations(prompt_run_id,url,domain,title,position,brand_id) values(p_run_id,c->>'url',lower(regexp_replace(c->>'url','^https?://(?:[^/@]*@)?(?:www\.)?([^/:?#]+).*$', '\1','i')),coalesce(c->>'title',''),(c->>'position')::integer,(c->>'brand_id')::uuid);end loop;
 for s in select * from jsonb_array_elements_text(p_screenshots) loop
 if split_part(s,'/',1)<>r.project_id::text or split_part(s,'/',2)<>r.id::text then raise exception 'Invalid screenshot path';end if;
 if not exists(select 1 from storage.objects where bucket_id='screenshots' and name=s) then raise exception 'Screenshot upload missing';end if;
 insert into screenshots(prompt_run_id,storage_path) values(p_run_id,s) on conflict(storage_path) do nothing;end loop;
 update tracking_cycles set status=case when not exists(select 1 from prompt_runs where tracking_cycle_id=r.tracking_cycle_id and status='pending') then 'completed'::cycle_status else 'in_progress'::cycle_status end,
 completed_at=case when not exists(select 1 from prompt_runs where tracking_cycle_id=r.tracking_cycle_id and status='pending') then coalesce(completed_at,now()) else null end where id=r.tracking_cycle_id;
 end $$;
-- Prevent moving records across projects (and target deletion), preserving historical joins.
create function public.protect_brand() returns trigger language plpgsql as $$ begin
 if tg_op='DELETE' then if old.type='target' and exists(select 1 from public.projects where id=old.project_id) then raise exception 'The project target cannot be deleted';end if;return old;end if;
 if new.project_id<>old.project_id or new.type<>old.type then raise exception 'Brand project and type are immutable';end if;return new;end $$;
create trigger protect_brand before update or delete on public.brands for each row execute function public.protect_brand();
revoke delete on public.projects from authenticated;
revoke all on function public.create_project(jsonb),public.create_tracking_cycle(uuid,text,timestamptz),public.save_result(uuid,timestamptz,jsonb,jsonb) from public;
grant execute on function public.create_project(jsonb),public.create_tracking_cycle(uuid,text,timestamptz),public.save_result(uuid,timestamptz,jsonb,jsonb) to authenticated;
grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
revoke delete on public.projects from authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('screenshots','screenshots',false,10485760,array['image/png','image/jpeg','image/webp']);
create policy screenshot_read on storage.objects for select to authenticated using(bucket_id='screenshots' and exists(select 1 from public.prompt_runs r where r.project_id::text=split_part(name,'/',1) and r.id::text=split_part(name,'/',2) and public.owns_project(r.project_id)));
create policy screenshot_upload on storage.objects for insert to authenticated with check(bucket_id='screenshots' and exists(select 1 from public.prompt_runs r where r.project_id::text=split_part(name,'/',1) and r.id::text=split_part(name,'/',2) and public.owns_project(r.project_id)));
-- Allow cleanup only for uploads that were not committed to a result.
create policy screenshot_cleanup on storage.objects for delete to authenticated using(bucket_id='screenshots' and public.owns_project(split_part(name,'/',1)::uuid) and not exists(select 1 from public.screenshots s where s.storage_path=name));
create function public.update_project(p_project_id uuid,payload jsonb) returns void language plpgsql security definer set search_path=public as $$
declare b uuid; a text;begin
 if not owns_project(p_project_id) then raise exception 'Project not accessible';end if;
 perform 1 from projects where id=p_project_id for update;
 update projects set name=payload->>'name',domain=payload->>'domain',location=coalesce(payload->>'location',''),logo_url=nullif(payload->>'logo_url','') where id=p_project_id;
 update brands set name=payload->>'target',domain=payload->>'domain' where project_id=p_project_id and type='target' returning id into b;
 delete from brand_aliases where brand_id=b;
 for a in select distinct trim(value) from jsonb_array_elements_text(coalesce(payload->'aliases','[]')) loop
 if a<>'' then insert into brand_aliases(brand_id,alias) values(b,a);end if;end loop;
 end $$;
revoke all on function public.update_project(uuid,jsonb) from public;
grant execute on function public.update_project(uuid,jsonb) to authenticated;
