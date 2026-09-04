alter table public.snails_events drop constraint if exists snails_events_event_known;
alter table public.snails_events add constraint snails_events_event_known check (event in (
  'app_open', 'match_start', 'match_end', 'match_abandon', 'tutorial_done', 'tutorial_skip', 'push_on'
));
