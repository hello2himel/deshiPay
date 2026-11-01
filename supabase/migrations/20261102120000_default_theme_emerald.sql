-- The website's colour scheme moved from pink (rose) to green. New pages should
-- default to the green theme; existing pages keep whatever theme their owner chose.
alter table public.profiles alter column theme set default 'emerald';
