-- Solo ejecutar en el proyecto Supabase exclusivo de Prisma Space.
create table if not exists public.prisma_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  theme text check (theme in ('light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.prisma_conversations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 120),
  title text not null default 'Nueva conversación',
  pinned boolean not null default false,
  updated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  primary key (user_id,id),
  constraint prisma_conversation_payload_limit check (octet_length(data::text)<=250000)
);
create index if not exists prisma_chats_recent_idx on public.prisma_conversations(user_id,updated_at desc);
alter table public.prisma_profiles enable row level security;
alter table public.prisma_conversations enable row level security;
revoke all on public.prisma_profiles from anon;
revoke all on public.prisma_conversations from anon;
grant select,insert,update,delete on public.prisma_profiles to authenticated;
grant select,insert,update,delete on public.prisma_conversations to authenticated;
drop policy if exists prisma_profile_select on public.prisma_profiles;
drop policy if exists prisma_profile_insert on public.prisma_profiles;
drop policy if exists prisma_profile_update on public.prisma_profiles;
drop policy if exists prisma_profile_delete on public.prisma_profiles;
create policy prisma_profile_select on public.prisma_profiles for select to authenticated using ((select auth.uid())=user_id);
create policy prisma_profile_insert on public.prisma_profiles for insert to authenticated with check ((select auth.uid())=user_id);
create policy prisma_profile_update on public.prisma_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy prisma_profile_delete on public.prisma_profiles for delete to authenticated using ((select auth.uid())=user_id);
drop policy if exists prisma_chat_select on public.prisma_conversations;
drop policy if exists prisma_chat_insert on public.prisma_conversations;
drop policy if exists prisma_chat_update on public.prisma_conversations;
drop policy if exists prisma_chat_delete on public.prisma_conversations;
create policy prisma_chat_select on public.prisma_conversations for select to authenticated using ((select auth.uid())=user_id);
create policy prisma_chat_insert on public.prisma_conversations for insert to authenticated with check ((select auth.uid())=user_id);
create policy prisma_chat_update on public.prisma_conversations for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy prisma_chat_delete on public.prisma_conversations for delete to authenticated using ((select auth.uid())=user_id);
