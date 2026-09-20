-- Additive safeguards for the existing rooms / players / answers API.
-- Review and run once in Supabase SQL Editor; this does not seed or replace questions.
begin;
alter table public.rooms add column if not exists used_question_ids uuid[] not null default '{}';
alter table public.rooms add column if not exists round_player_ids uuid[] not null default '{}';

create or replace function public.guard_round_publish() returns trigger
language plpgsql set search_path = public as $$
declare q public.questions;
begin
  if new.phase = 'answering' and (old.phase <> 'answering' or new.current_question_id is distinct from old.current_question_id) then
    if old.phase not in ('ready','reveal') then raise exception '请等待当前题揭晓后再发题'; end if;
    if new.current_question_id = any(coalesce(old.used_question_ids,'{}')) then raise exception '这道题本局已经出过了'; end if;
    select * into q from public.questions where id = new.current_question_id;
    if not found or q.type <> 'binary' or not q.enabled then raise exception '只能发布启用的二选一题目'; end if;
    -- Room row lock serializes this snapshot with joining players.
    select coalesce(array_agg(id order by joined_at), '{}'::uuid[]) into new.round_player_ids from public.players where room_id = new.id;
    if cardinality(new.round_player_ids) = 0 then raise exception '当前没有玩家，无法发布题目'; end if;
    new.used_question_ids := array_append(coalesce(old.used_question_ids,'{}'), new.current_question_id);
    new.round := old.round + 1;
  elsif new.phase = 'answering' then
    new.round_player_ids := old.round_player_ids;
    new.used_question_ids := old.used_question_ids;
    new.round := old.round;
  end if;
  return new;
end $$;
drop trigger if exists guard_round_publish on public.rooms;
create trigger guard_round_publish before update on public.rooms for each row execute function public.guard_round_publish();

create or replace function public.guard_player_join() returns trigger
language plpgsql set search_path = public as $$
declare current_phase text;
begin
  select phase into current_phase from public.rooms where id = new.room_id for update;
  if not found or current_phase = 'ended' then raise exception '这个房间已经结束'; end if;
  if char_length(btrim(new.name)) not between 1 and 4 then raise exception '名字需要 1 至 4 个字'; end if;
  if (select count(*) from public.players where room_id = new.room_id) >= 20 then raise exception '房间已经满员'; end if;
  new.name := btrim(new.name);
  if new.avatar not between 0 and 19 or exists(select 1 from public.players where room_id = new.room_id and avatar = new.avatar) then
    select n into new.avatar from generate_series(0,19) n where not exists(select 1 from public.players where room_id = new.room_id and avatar = n) order by random() limit 1;
  end if;
  return new;
end $$;
drop trigger if exists guard_player_join on public.players;
create trigger guard_player_join before insert on public.players for each row execute function public.guard_player_join();

create or replace function public.guard_answer_submit() returns trigger
language plpgsql set search_path = public as $$
declare r public.rooms;
begin
  if tg_op = 'UPDATE' then raise exception '答案提交后不能修改'; end if;
  select * into r from public.rooms where id = new.room_id for update;
  if not found or r.phase <> 'answering' or r.current_question_id is distinct from new.question_id then raise exception '本题已经结束'; end if;
  if not (new.player_id = any(coalesce(r.round_player_ids,'{}'))) or not exists(select 1 from public.players where id = new.player_id and room_id = new.room_id) then raise exception '你将从下一题开始参与'; end if;
  if new.choice is null or new.choice not in ('A','B') then raise exception '必须选择 A 或 B'; end if;
  if char_length(coalesce(new.comment,'')) > 80 then raise exception '评论最多 80 字'; end if;
  return new;
end $$;
drop trigger if exists guard_answer_submit on public.answers;
create trigger guard_answer_submit before insert or update on public.answers for each row execute function public.guard_answer_submit();

create or replace function public.reveal_completed_round() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.rooms r set phase = 'reveal'
  where r.id = new.room_id and r.phase = 'answering' and r.current_question_id = new.question_id
    and cardinality(r.round_player_ids) > 0
    and not exists(select 1 from unnest(r.round_player_ids) p(id) where not exists(select 1 from public.answers a where a.room_id = r.id and a.question_id = r.current_question_id and a.player_id = p.id));
  return new;
end $$;
drop trigger if exists reveal_completed_round on public.answers;
create trigger reveal_completed_round after insert on public.answers for each row execute function public.reveal_completed_round();
commit;

