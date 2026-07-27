-- Allow 'REFERENCE_CHECK' as a template/evaluation type alongside 'HR' and 'USER'
alter table public.evaluation_templates drop constraint if exists evaluation_templates_type_check;
alter table public.evaluation_templates add constraint evaluation_templates_type_check
  check (type in ('HR', 'USER', 'REFERENCE_CHECK'));

alter table public.candidate_evaluations drop constraint if exists candidate_evaluations_evaluation_type_check;
alter table public.candidate_evaluations add constraint candidate_evaluations_evaluation_type_check
  check (evaluation_type in ('HR', 'USER', 'REFERENCE_CHECK'));
