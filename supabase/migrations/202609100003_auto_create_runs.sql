-- Auto-create prompt runs for any existing tracking cycles when a new active prompt is added
create or replace function public.auto_create_prompt_runs()
returns trigger language plpgsql security definer as $$
begin
  if new.active then
    insert into public.prompt_runs(tracking_cycle_id, project_id, prompt_id, engine, prompt_snapshot, topic_snapshot, status)
    select c.id, new.project_id, new.id, e, new.prompt, new.topic, 'pending'
    from public.tracking_cycles c
    cross join unnest(enum_range(null::public.ai_engine)) e
    where c.project_id = new.project_id
    on conflict (tracking_cycle_id, prompt_id, engine) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_create_prompt_runs on public.prompts;
create trigger trg_auto_create_prompt_runs
after insert on public.prompts
for each row execute function public.auto_create_prompt_runs();
