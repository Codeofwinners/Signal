-- Allow project owners to manage their prompt_runs directly
create policy insert_runs on public.prompt_runs
  for insert to authenticated
  with check (public.owns_project(project_id));

create policy update_runs on public.prompt_runs
  for update to authenticated
  using (public.owns_project(project_id))
  with check (public.owns_project(project_id));

create policy delete_runs on public.prompt_runs
  for delete to authenticated
  using (public.owns_project(project_id));
