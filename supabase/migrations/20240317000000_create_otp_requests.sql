create table if not exists public.otp_requests (
    id uuid default gen_random_uuid() primary key,
    phone_number text not null,
    otp_code text not null,
    expires_at timestamptz not null,
    is_used boolean default false,
    created_at timestamptz default now()
);

alter table public.otp_requests enable row level security;

create policy "Allow anonymous insert OTP requests"
    on public.otp_requests for insert to anon with check (true);

create policy "Allow anonymous select OTP requests"
    on public.otp_requests for select to anon using (true);

create policy "Allow anonymous update OTP requests"
    on public.otp_requests for update to anon using (true) with check (true);

create policy "Allow authenticated manage OTP requests"
    on public.otp_requests for all to authenticated using (true) with check (true);

-- Ensure open_recruitment is readable by anon
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'open_recruitment') then
    execute 'create policy "Allow anonymous select open_recruitment" on public.open_recruitment for select to anon using (true);';
  end if;
exception
  when duplicate_object then null;
end $$;
