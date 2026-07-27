-- Seed the fixed Reference Check template (based on the "Employment reference check for Waruna" form)
insert into public.evaluation_templates (name, type, form_schema)
values (
  'Reference Check',
  'REFERENCE_CHECK',
  '{
    "title_template": "Employment reference check for {{full_name}}",
    "intro": "A verbal reference check was provided via telephone by:",
    "two_column": {
      "headers": ["Item", "Information supplied by applicant", "Information supplied by reference"],
      "rows": [
        {"key": "current_company", "label": "Current/Last Company Employed"},
        {"key": "employment_period", "label": "Employment Period"},
        {"key": "position_held", "label": "Position Held"},
        {"key": "leaving_reason", "label": "Leaving Reason"}
      ]
    },
    "single_column": {
      "section_title": "The referee also provided the following information:",
      "header": "Comment from referee",
      "rows": [
        {"key": "overall_performance", "label": "Overall Performance"},
        {"key": "attendance_reliability", "label": "Attendance & Reliability"},
        {"key": "ability_work_others", "label": "Ability to work with Others"},
        {"key": "attitude_conduct", "label": "Attitude & Conducts"},
        {"key": "honesty_integrity", "label": "Honesty & Integrity"},
        {"key": "disciplinary_action", "label": "Disciplinary Action Taken"},
        {"key": "would_reemploy", "label": "Would your company re-employ this person"}
      ]
    },
    "additional_comments_label": "Additional Comments:",
    "footer": {"checked_date_label": "Date"}
  }'::jsonb
);
