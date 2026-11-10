-- Prisma Space: global cross-device conversation sync.
-- Applied to the dedicated Prisma Supabase project.
alter table public.prisma_profiles
  add column if not exists sync_enabled boolean not null default false;

alter table public.prisma_conversations
  add column if not exists deleted_at timestamptz;

alter table public.prisma_conversations
  drop constraint if exists prisma_conversation_payload_limit;

alter table public.prisma_conversations
  add constraint prisma_conversation_payload_limit
  check (octet_length(data::text) <= 5000000);

create index if not exists prisma_conversations_active_recent_idx
  on public.prisma_conversations (user_id, updated_at desc)
  where deleted_at is null;

create index if not exists prisma_conversations_deleted_idx
  on public.prisma_conversations (user_id, deleted_at)
  where deleted_at is not null;
