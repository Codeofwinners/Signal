-- Fix auto_create_prompt_runs trigger function to avoid requiring a UNIQUE constraint on (tracking_cycle_id, prompt_id, engine)
create or replace function public.auto_create_prompt_runs()
returns trigger language plpgsql security definer as $$
begin
  if new.active then
    insert into public.prompt_runs(tracking_cycle_id, project_id, prompt_id, engine, prompt_snapshot, topic_snapshot, status)
    select c.id, new.project_id, new.id, e, new.prompt, new.topic, 'pending'
    from public.tracking_cycles c
    cross join unnest(enum_range(null::public.ai_engine)) e
    where c.project_id = new.project_id
      and not exists (
        select 1 from public.prompt_runs pr
        where pr.tracking_cycle_id = c.id
          and pr.prompt_id = new.id
          and pr.engine = e
      );
  end if;
  return new;
end;
$$;
