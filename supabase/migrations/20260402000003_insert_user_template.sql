insert into public.evaluation_templates (name, type, form_schema)
values (
    'Template Interview User - Default',
    'USER',
    '{
      "scale": [
        {"score": 1, "label": "Buruk"},
        {"score": 2, "label": "Sedang"},
        {"score": 3, "label": "Baik"}
      ],
      "categories": [
        {
          "name": "Kriteria Penilaian",
          "criteria": [
            {
              "name": "Penampilan",
              "description": "Penilaian terhadap penampilan kandidat."
            },
            {
              "name": "Daya Tangkap",
              "description": "Kemampuan kandidat dalam menangkap dan memahami informasi atau instruksi."
            },
            {
              "name": "Sikap",
              "description": "Attitude dan perilaku kandidat selama proses wawancara."
            },
            {
              "name": "Rasa Ingin Tahu",
              "description": "Tingkat keingintahuan dan antusiasme kandidat terhadap pekerjaan dan perusahaan."
            },
            {
              "name": "Ketenangan",
              "description": "Kemampuan kandidat mengendalikan diri dan tetap tenang di bawah tekanan."
            },
            {
              "name": "Pengetahuan",
              "description": "Tingkat pengetahuan teknis atau umum yang relevan dengan posisi."
            }
          ]
        }
      ],
      "summary_fields": [
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
          "name": "Trial Result / Notes",
          "type": "textarea",
          "placeholder": "Hasil trial atau catatan tambahan..."
        },
        {
          "name": "Training Need Analysis",
          "type": "textarea",
          "placeholder": "Analisa kebutuhan training jika diterima..."
        },
        {
          "name": "Conclusion",
          "type": "radio",
          "options": [
            "Recommended",
            "To be Considered",
            "Not Recommended"
          ]
        },
        {
          "name": "Final Decision (Approval)",
          "type": "radio",
          "options": [
            "Diterima",
            "Ditolak"
          ]
        }
      ]
    }'::jsonb
);
