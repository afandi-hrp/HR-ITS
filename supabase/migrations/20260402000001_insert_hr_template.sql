insert into public.evaluation_templates (name, type, form_schema)
values (
    'Template Interview HR - Default',
    'HR',
    '{
      "scale": [
        {"score": 1, "label": "Below Expectation"},
        {"score": 2, "label": "Partially Meet Expectation"},
        {"score": 3, "label": "Mostly Meet Expectation"},
        {"score": 4, "label": "Above Expectation"}
      ],
      "categories": [
        {
          "name": "Core Values",
          "criteria": [
            {
              "name": "Integrity (ING)",
              "description": "Mampu melaksanakan secara efektif kejujuran, keterbukaan, moral dan etika yang tinggi, konsisten dalam perkataan dan tindakan sehari-hari serta menjaga kerahasiaan perusahaan."
            },
            {
              "name": "Safety (S)",
              "description": "Mampu menjaga keselamatan (dengan menggunakan peralatan yang aman untuk bekerja), menjaga keselamatan diri, membuat keputusan dengan analisa resiko, melakukan recheck pekerjaan."
            },
            {
              "name": "Ownership (O)",
              "description": "Mampu melaksanakan kebijakan perusahaan, menjaga asset perusahaan dan menggunakan sesuai kebutuhan perusahaan, menjaga cost perusahaan, berdampak besar terhadap kebaikan perusahaan."
            },
            {
              "name": "Continuous Improvement (CI)",
              "description": "Mampu melaksanakan perbaikan proses secara terus-menerus dengan berorientasi terhadap hasil dan efisiensi pekerjaan, membuat sistem berdasarkan analisa dengan solusi dan tujuan yang tepat."
            },
            {
              "name": "Accountability (AC)",
              "description": "Mampu menyelesaikan tugas sesuai dengan harapan perusahaan, berani mengambil beban tugas dengan hasil yang optimal, menyelesaikan tugas secara kolaboratif, dapat diandalkan dan bersedia mengakui kesalahan saat terjadi."
            }
          ]
        },
        {
          "name": "Specific Competencies",
          "criteria": [
            {
              "name": "Creative Thinking (CT)",
              "description": "Mampu melihat kesempatan baru dan solusi bagi permasalahan dengan cara mengamati dan menganalisa lebih dari apa yang sedang berlangsung dan menggunakan pemikiran inovatif."
            },
            {
              "name": "Effective Interactive Communication (EIC)",
              "description": "Mampu mentransfer dan menerima informasi secara jelas dan mengkomunikasikan secara aktif kepada pihak lain dengan mempertimbangkan sudut pandang dalam rangka memberikan tanggapan dengan benar."
            },
            {
              "name": "Conflict Resolution",
              "description": "Kemampuan menjaga stabilitas emosi (tidak terprovokasi) yang secara efektif dapat memfasilitasi pencegahan dan/atau penyelesaian masalah/konflik dan dapat menjaga hubungan kerja tetap baik dengan solusi win-win."
            }
          ]
        },
        {
          "name": "Technical Competencies",
          "criteria": [
            {
              "name": "Strategic Sourcing",
              "description": "Kemampuan untuk mengembangkan dan mengimplementasikan strategi pengadaan yang efektif dan efisien, termasuk identifikasi dan evaluasi pemasok potensial serta negosiasi kontrak jangka panjang."
            },
            {
              "name": "Procurement Planning",
              "description": "Kemampuan untuk merencanakan dan mengelola proses pengadaan barang dan jasa, termasuk perencanaan kebutuhan, anggaran, dan jadwal pengadaan."
            },
            {
              "name": "Supplier Relationship Management",
              "description": "Kemampuan untuk mengidentifikasi, mengevaluasi, dan mengelola hubungan dengan pemasok untuk memastikan kualitas, biaya, dan pengiriman yang optimal."
            },
            {
              "name": "Negotiation Skills",
              "description": "Kemampuan untuk melakukan negosiasi yang efektif dengan pemasok untuk mendapatkan harga terbaik, syarat pembayaran yang menguntungkan, dan kualitas produk atau layanan yang tinggi."
            },
            {
              "name": "Procurement Process Optimization",
              "description": "Kemampuan untuk mengevaluasi dan meningkatkan proses pengadaan untuk meningkatkan efisiensi dan efektivitas, termasuk penerapan teknologi dan praktik terbaik dalam pengadaan."
            },
            {
              "name": "Data Driven Analytical Thinking",
              "description": "Kemampuan untuk mengumpulkan, menganalisis, dan menafsirkan data guna membuat keputusan yang berbasis fakta serta mengidentifikasi tren dan pola yang relevan untuk pengambilan keputusan strategis dalam pembelian."
            },
            {
              "name": "Document Management",
              "description": "Kemampuan untuk mengelola dokumen pembelian secara terorganisir, aman lengkap sesuai dengan ketentuan perusahaan, baik dalam bentuk fisik maupun digital."
            }
          ]
        }
      ]
    }'::jsonb
);
