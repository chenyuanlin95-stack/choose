-- Run in Supabase SQL editor
create extension if not exists pgcrypto;
create table if not exists questions(id uuid primary key default gen_random_uuid(),type text not null check(type in ('binary','ranking')),prompt text not null,options jsonb not null,category text default '未分类',enabled boolean default true,created_at timestamptz default now());
create table if not exists rooms(id uuid primary key default gen_random_uuid(),code text unique not null,phase text not null default 'lobby' check(phase in ('lobby','answering','reveal')),current_question_id uuid references questions(id),round int default 0,host_token uuid default gen_random_uuid(),created_at timestamptz default now());
create table if not exists players(id uuid primary key default gen_random_uuid(),room_id uuid references rooms(id) on delete cascade,name text not null,avatar int not null check(avatar between 0 and 19),joined_at timestamptz default now());
create unique index if not exists unique_avatar_per_room on players(room_id,avatar);
create table if not exists answers(id uuid primary key default gen_random_uuid(),room_id uuid references rooms(id) on delete cascade,question_id uuid references questions(id),player_id uuid references players(id) on delete cascade,choice text,ranking jsonb,comment text check(char_length(comment)<=80),created_at timestamptz default now(),unique(room_id,question_id,player_id));
-- Enable realtime for multiplayer tables
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table answers;
-- Prototype policies. Harden host authorization before public launch.
alter table questions enable row level security; alter table rooms enable row level security; alter table players enable row level security; alter table answers enable row level security;
create policy "public read questions" on questions for select using (enabled=true);
create policy "prototype question write" on questions for all using (true) with check (true);
create policy "prototype room access" on rooms for all using (true) with check (true);
create policy "prototype player access" on players for all using (true) with check (true);
create policy "prototype answer access" on answers for all using (true) with check (true);
