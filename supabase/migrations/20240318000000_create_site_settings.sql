create table if not exists public.site_settings (
    id integer primary key default 1,
    login_logo_url text,
    career_logo_url text,
    sidebar_logo_url text,
    sidebar_text text,
    login_animation_url text,
    updated_at timestamptz default now()
);

alter table public.site_settings enable row level security;

create policy "Allow public read access to site_settings"
    on public.site_settings for select to anon using (true);

create policy "Allow authenticated read access to site_settings"
    on public.site_settings for select to authenticated using (true);

create policy "Allow authenticated update to site_settings"
    on public.site_settings for update to authenticated using (true) with check (true);

create policy "Allow authenticated insert to site_settings"
    on public.site_settings for insert to authenticated with check (true);

insert into public.site_settings (id) values (1) on conflict do nothing;
