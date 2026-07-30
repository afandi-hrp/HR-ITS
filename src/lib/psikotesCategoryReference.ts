// Static reference glossary for psikotes category labels shown in
// ai_psikotes_summary (GTQ / General Learning Ability "kategori", and
// MSDT "leadership_style_msdt"). Sourced from "Learning Ability & MSDT.xlsx".
// This is fixed methodology reference text, not per-candidate data, so it
// lives in code rather than a database table.

export interface CategoryDefinition {
  subtitle?: string;
  interpretasi: string;
  potensi: string;
  areaPengembangan: string;
}

export const gtqCategoryDefinitions: Record<string, CategoryDefinition> = {
  "VERY LOW": {
    subtitle: "Jauh di Bawah Rata-rata · T-Skor ≤ 74",
    interpretasi:
      "Kemampuan belajar masih terbatas dibandingkan rata-rata. Individu cenderung lebih nyaman mengerjakan tugas yang rutin dan berulang serta memerlukan pendampingan lebih intensif ketika mempelajari tugas, konsep, atau prosedur baru.",
    potensi:
      "• Konsisten menjalankan pekerjaan rutin.\n• Mampu mengikuti prosedur yang telah ditetapkan.\n• Cermat ketika bekerja dalam lingkungan yang stabil.",
    areaPengembangan:
      "• Meningkatkan kemampuan mempelajari hal baru.\n• Mengembangkan kemandirian dalam bekerja.\n• Meningkatkan kemampuan beradaptasi terhadap perubahan.",
  },
  "BELOW AVERAGE": {
    subtitle: "Di Bawah Rata-rata · T-Skor 75–84",
    interpretasi:
      "Kemampuan belajar berada di bawah rata-rata. Individu lebih percaya diri mengerjakan tugas yang telah dikenal serta membutuhkan waktu dan arahan yang lebih rinci untuk mempelajari hal-hal baru.",
    potensi:
      "• Mampu bekerja dengan baik pada tugas yang telah dipahami.\n• Teliti ketika mengikuti prosedur yang jelas.\n• Konsisten dalam menjalankan pekerjaan rutin.",
    areaPengembangan:
      "• Meningkatkan kecepatan belajar.\n• Mengembangkan fleksibilitas terhadap perubahan.\n• Meningkatkan kemampuan memahami konsep baru secara mandiri.",
  },
  "LOWER AVERAGE": {
    subtitle: "Rata-rata Batas Bawah · T-Skor 85–96",
    interpretasi:
      "Kemampuan belajar cukup memadai, meskipun memerlukan waktu yang relatif lebih lama dibandingkan rata-rata untuk memahami konsep atau prosedur baru.",
    potensi:
      "• Mampu mempelajari keterampilan baru dengan bimbingan.\n• Konsisten dalam menjalankan pekerjaan.\n• Memiliki potensi berkembang melalui pengalaman.",
    areaPengembangan:
      "• Meningkatkan kecepatan adaptasi.\n• Mengembangkan kemampuan berpikir mandiri.\n• Memperkuat kepercayaan diri dalam menghadapi tantangan baru.",
  },
  AVERAGE: {
    subtitle: "Rata-rata · T-Skor 97–102",
    interpretasi:
      "Kemampuan belajar berada pada taraf rata-rata. Individu mampu memahami informasi baru, mengikuti pelatihan dengan baik, serta menyelesaikan sebagian besar tugas sesuai tuntutan pekerjaan.",
    potensi:
      "• Mampu bekerja secara mandiri.\n• Cepat menyesuaikan diri terhadap perubahan.\n• Menampilkan kinerja yang stabil.",
    areaPengembangan:
      "• Mengembangkan kemampuan analitis.\n• Meningkatkan efektivitas pemecahan masalah.\n• Memperluas kompetensi melalui pembelajaran berkelanjutan.",
  },
  "HIGHER AVERAGE": {
    subtitle: "Rata-rata Batas Atas · T-Skor 103–114",
    interpretasi:
      "Kemampuan belajar tergolong baik. Individu relatif cepat memahami konsep baru, mudah mempelajari prosedur baru, dan memiliki potensi untuk berkembang lebih tinggi.",
    potensi:
      "• Cepat memahami pekerjaan baru.\n• Mudah beradaptasi terhadap perubahan.\n• Memiliki potensi berkembang lebih cepat dibandingkan rata-rata.",
    areaPengembangan:
      "• Mengoptimalkan kemampuan analisis.\n• Mengembangkan kemampuan pengambilan keputusan.\n• Memperluas pengalaman melalui tugas yang lebih menantang.",
  },
  "ABOVE AVERAGE": {
    subtitle: "Di Atas Rata-rata · T-Skor 115–124",
    interpretasi:
      "Kemampuan belajar tergolong tinggi. Individu mampu memahami konsep dengan cepat, mudah beradaptasi terhadap perubahan, serta berpotensi menangani tugas yang lebih kompleks.",
    potensi:
      "• Cepat menguasai tugas baru.\n• Memiliki kemampuan analisis yang baik.\n• Mampu menangani pekerjaan kompleks.\n• Berpotensi menjadi role model dalam tim.",
    areaPengembangan:
      "• Mengembangkan kemampuan kepemimpinan.\n• Meningkatkan kemampuan berpikir strategis.\n• Mengoptimalkan kemampuan coaching kepada orang lain.",
  },
  "VERY HIGH": {
    subtitle: "Jauh di Atas Rata-rata · T-Skor 125–131",
    interpretasi:
      "Kemampuan belajar tergolong sangat tinggi. Individu mampu memahami konsep kompleks dengan cepat, mudah menguasai tugas atau prosedur baru, serta memiliki potensi tinggi untuk mencapai kinerja unggul.",
    potensi:
      "• Memiliki kapasitas belajar yang sangat tinggi.\n• Cepat menguasai pekerjaan kompleks.\n• Berpotensi menjadi inovator dan pemimpin.\n• Mampu memberikan kontribusi strategis bagi organisasi.",
    areaPengembangan:
      "• Mengembangkan kemampuan memengaruhi dan memberdayakan orang lain.\n• Menjaga konsistensi dan fokus pada penyelesaian tugas.\n• Mengelola kejenuhan melalui tantangan baru yang produktif.",
  },
};

export const msdtCategoryDefinitions: Record<string, CategoryDefinition> = {
  DESERTER: {
    interpretasi:
      "Cenderung menghindari konflik, perubahan, dan situasi yang dianggap berisiko. Lebih nyaman bekerja dalam lingkungan yang stabil dengan arahan dan prosedur yang jelas.",
    potensi:
      "Mampu menjaga stabilitas kerja, tetap tenang dalam situasi yang relatif stabil, serta mengurangi potensi konflik yang tidak diperlukan.",
    areaPengembangan:
      "Meningkatkan keberanian dalam mengambil keputusan, lebih adaptif terhadap perubahan, serta mengembangkan inisiatif dan tanggung jawab dalam menyelesaikan masalah.",
  },
  AUTOCRAT: {
    interpretasi:
      "Berorientasi kuat pada pencapaian hasil melalui arahan yang jelas, disiplin, dan pengawasan yang konsisten.",
    potensi:
      "Cepat mengambil keputusan, menjaga disiplin dan produktivitas, serta efektif dalam situasi yang membutuhkan kontrol tinggi.",
    areaPengembangan:
      "Meningkatkan komunikasi dua arah, memperluas partisipasi anggota tim, serta mengembangkan kemampuan coaching, delegasi, dan pemberdayaan bawahan.",
  },
  COMPROMISER: {
    interpretasi:
      "Berupaya menyeimbangkan pencapaian target dan hubungan kerja, namun cenderung memilih jalan tengah ketika menghadapi situasi yang membutuhkan ketegasan.",
    potensi:
      "Fleksibel, mudah bekerja sama, serta mampu menjaga hubungan kerja yang harmonis.",
    areaPengembangan:
      "Meningkatkan ketegasan dalam menentukan prioritas, lebih konsisten dalam pengambilan keputusan, serta tetap berorientasi pada pencapaian tujuan.",
  },
  MISSIONARY: {
    interpretasi:
      "Mengutamakan hubungan interpersonal dan keharmonisan tim melalui pendekatan yang suportif dan komunikatif.",
    potensi:
      "Membangun kerja sama, meningkatkan loyalitas tim, serta menciptakan lingkungan kerja yang positif.",
    areaPengembangan:
      "Meningkatkan ketegasan dalam memberikan umpan balik, mengelola konflik secara konstruktif, serta menyeimbangkan hubungan interpersonal dengan pencapaian target kerja.",
  },
  BUREAUCRAT: {
    interpretasi:
      "Berorientasi pada aturan, prosedur, dan struktur organisasi untuk memastikan proses kerja berjalan secara sistematis dan konsisten.",
    potensi:
      "Teliti, konsisten, sistematis, serta mampu menjaga kualitas dan kepatuhan terhadap prosedur kerja.",
    areaPengembangan:
      "Meningkatkan fleksibilitas terhadap perubahan, lebih terbuka terhadap pendekatan baru, serta mengembangkan kreativitas dan inovasi dalam penyelesaian pekerjaan.",
  },
  "BENEVOLENT AUTOCRAT": {
    interpretasi:
      "Berorientasi pada hasil dengan tetap membangun komunikasi yang baik melalui arahan yang jelas, pembimbingan, dan penerapan disiplin secara adil.",
    potensi:
      "Memberikan arahan yang jelas, menjaga disiplin dan produktivitas, serta mampu membimbing anggota tim secara efektif.",
    areaPengembangan:
      "Memberikan ruang yang lebih besar bagi inisiatif anggota tim, meningkatkan pemberdayaan melalui delegasi, serta membangun kemandirian bawahan.",
  },
  DEVELOPER: {
    interpretasi:
      "Berfokus pada pengembangan kompetensi dan potensi anggota tim melalui coaching, mentoring, dan pelibatan dalam proses kerja.",
    potensi:
      "Mendorong pembelajaran, meningkatkan motivasi dan kompetensi, serta membangun budaya belajar yang positif.",
    areaPengembangan:
      "Menyeimbangkan pengembangan individu dengan pencapaian target organisasi, serta meningkatkan kemampuan menentukan prioritas dan efektivitas pengambilan keputusan.",
  },
  EXECUTIVE: {
    interpretasi:
      "Mampu menyeimbangkan pencapaian hasil dan hubungan kerja melalui komunikasi terbuka, kolaborasi, serta pelibatan tim dalam pengambilan keputusan.",
    potensi:
      "Adaptif, komunikatif, mampu memotivasi tim, membangun kolaborasi, serta menghasilkan keputusan yang berkualitas.",
    areaPengembangan:
      "Menjaga keseimbangan antara kolaborasi dan kecepatan pengambilan keputusan, serta menyesuaikan tingkat pelibatan tim sesuai kompleksitas dan urgensi situasi.",
  },
};

/**
 * Looks up a category definition by the JSON key it was rendered under
 * (e.g. "kategori", "leadership_style_msdt") and its value (e.g.
 * "BELOW AVERAGE", "BUREAUCRAT"). Returns null when the key isn't one of
 * the known reference fields or the value has no matching entry.
 */
export function findCategoryDefinition(
  key: string,
  value: unknown,
): CategoryDefinition | null {
  if (typeof value !== "string") return null;
  const normalizedKey = key.toLowerCase().replace(/_/g, " ").trim();
  const normalizedValue = value.trim().toUpperCase();

  if (normalizedKey === "kategori") {
    return gtqCategoryDefinitions[normalizedValue] || null;
  }
  if (normalizedKey === "leadership style msdt") {
    return msdtCategoryDefinitions[normalizedValue] || null;
  }
  return null;
}
