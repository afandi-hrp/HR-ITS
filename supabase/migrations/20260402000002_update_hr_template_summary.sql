update public.evaluation_templates
set form_schema = jsonb_set(
    form_schema,
    '{summary_fields}',
    '[
      {
        "name": "Strengths",
        "type": "textarea",
        "placeholder": "Masukkan kelebihan kandidat..."
      },
      {
        "name": "Weaknesses",
        "type": "textarea",
        "placeholder": "Masukkan kelemahan kandidat..."
      },
      {
        "name": "Working Motivation",
        "type": "checkbox_group",
        "options": [
          "Lokasi Kerja (Work Location)",
          "Jenjang Karir/Status Karyawan (Career Path/employee status)",
          "Pengembangan Diri (Self-Actualization)",
          "Tantangan/Variasi Pekerjaan (Challenge/Task Variation)",
          "Lingkungan Kerja (Social Working Environment)",
          "Salary & Benefit (Compensation & Benefit)"
        ]
      },
      {
        "name": "Notes",
        "type": "textarea",
        "placeholder": "Catatan tambahan..."
      },
      {
        "name": "Recommendation",
        "type": "radio",
        "options": [
          "Recommended",
          "To be Considered",
          "Not Recommended"
        ]
      }
    ]'::jsonb
)
where name = 'Template Interview HR - Default';
