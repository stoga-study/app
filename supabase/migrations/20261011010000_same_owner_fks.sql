-- Child rows must belong to the same student as their parent. Without this, a student who guessed
-- another student's subject id could attach their own rows to it (invisible to the owner, but messy).
alter table public.subjects     add constraint subjects_id_user_key     unique (id, user_id);
alter table public.sources      add constraint sources_id_user_key      unique (id, user_id);
alter table public.quizzes      add constraint quizzes_id_user_key      unique (id, user_id);
alter table public.quiz_questions add constraint quiz_questions_id_user_key unique (id, user_id);
alter table public.chat_threads add constraint chat_threads_id_user_key unique (id, user_id);
alter table public.cards        add constraint cards_id_user_key        unique (id, user_id);

alter table public.sources        add constraint sources_subject_owner        foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade;
alter table public.source_pages   add constraint source_pages_source_owner    foreign key (source_id, user_id)  references public.sources (id, user_id) on delete cascade;
alter table public.notes_sections add constraint notes_sections_source_owner  foreign key (source_id, user_id)  references public.sources (id, user_id) on delete cascade;
alter table public.guide_sections add constraint guide_sections_source_owner  foreign key (source_id, user_id)  references public.sources (id, user_id) on delete cascade;
alter table public.cards          add constraint cards_subject_owner          foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade;
alter table public.card_reviews   add constraint card_reviews_card_owner      foreign key (card_id, user_id)    references public.cards (id, user_id) on delete cascade;
alter table public.quizzes        add constraint quizzes_subject_owner        foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade;
alter table public.quiz_questions add constraint quiz_questions_quiz_owner    foreign key (quiz_id, user_id)    references public.quizzes (id, user_id) on delete cascade;
alter table public.quiz_attempts  add constraint quiz_attempts_quiz_owner     foreign key (quiz_id, user_id)    references public.quizzes (id, user_id) on delete cascade;
alter table public.mistakes       add constraint mistakes_question_owner      foreign key (question_id, user_id) references public.quiz_questions (id, user_id) on delete cascade;
alter table public.chat_threads   add constraint chat_threads_subject_owner   foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade;
alter table public.chat_messages  add constraint chat_messages_thread_owner   foreign key (thread_id, user_id)  references public.chat_threads (id, user_id) on delete cascade;
