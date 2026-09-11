-- Migration: Support deleting prompts and cascade delete prompt_runs
alter table public.prompt_runs
  drop constraint if exists prompt_runs_prompt_id_project_id_fkey,
  add constraint prompt_runs_prompt_id_project_id_fkey
    foreign key (prompt_id, project_id)
    references public.prompts(id, project_id)
    on delete cascade;

create or replace function public.delete_prompt(p_prompt_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  p prompts;
begin
  select * into p from prompts where id = p_prompt_id;
  if not found or not owns_project(p.project_id) then
    raise exception 'Prompt not accessible';
  end if;

  delete from prompts where id = p_prompt_id;
end;
$$;

revoke all on function public.delete_prompt(uuid) from public;
grant execute on function public.delete_prompt(uuid) to authenticated;
