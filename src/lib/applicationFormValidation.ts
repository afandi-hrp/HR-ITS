// Validasi formulir pelamar (/form-pelamar). Dipisah dari ApplicationForm.tsx
// supaya bisa diuji tanpa render React — lihat
// scripts/test-application-form-validation.ts.

// Satu titik data dari signature_pad (`toData()` -> array of strokes).
export type SignaturePoint = { x: number; y: number };
export type SignatureStrokes = SignaturePoint[][];

// Minimal yang dianggap tanda tangan sungguhan (dalam CSS px). Sebelumnya
// validasi cuma memakai `isEmpty()` dari signature_pad, yang langsung
// bernilai false begitu ada SATU titik — tap tidak sengaja, atau jari yang
// menyentuh kanvas saat scroll di HP, sudah lolos sebagai "tanda tangan".
const MIN_SIGNATURE_POINTS = 10;
const MIN_SIGNATURE_EXTENT_PX = 30;

export function isSignatureMeaningful(
  strokes: SignatureStrokes | null | undefined,
): boolean {
  if (!Array.isArray(strokes) || strokes.length === 0) return false;
  let count = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    if (!Array.isArray(stroke)) continue;
    for (const p of stroke) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      count++;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (count < MIN_SIGNATURE_POINTS) return false;
  return Math.max(maxX - minX, maxY - minY) >= MIN_SIGNATURE_EXTENT_PX;
}

export interface ApplicationFormValidationInput {
  formData: any;
  token: string;
  hideSalary: boolean;
  hasPhoto: boolean;
  hasKtp: boolean;
  hasIjazah: boolean;
  hasTranscript: boolean;
  payslipCount: number;
  signature: SignatureStrokes | null;
  remunerationSignature: SignatureStrokes | null;
}

export function validateApplicationForm({
  formData,
  token,
  hideSalary,
  hasPhoto,
  hasKtp,
  hasIjazah,
  hasTranscript,
  payslipCount,
  signature,
  remunerationSignature,
}: ApplicationFormValidationInput): string[] {
  const errors: string[] = [];

  if (!token?.trim()) errors.push("Token pendaftaran wajib diisi.");

  // 1. Upload Dokumen
  if (!hasPhoto) errors.push("Pas foto wajib diunggah.");
  if (!hasKtp) errors.push("Dokumen KTP wajib diunggah.");
  if (!hasIjazah) errors.push("Dokumen Ijazah wajib diunggah.");
  if (!hasTranscript) errors.push("Dokumen Transkrip Nilai wajib diunggah.");

  // 2. No. Handphone — handler input sudah membuang karakter selain digit,
  // "+" dan "-", tapi isian seperti "+" atau "---" tetap lolos kalau cuma
  // dicek tidak kosong.
  const mobileDigits = (formData.mobile_phone || "").replace(/\D/g, "");
  if (!formData.mobile_phone?.trim())
    errors.push("No. Handphone wajib diisi.");
  else if (mobileDigits.length < 8 || /^0+$/.test(mobileDigits))
    errors.push("No. Handphone tidak valid (minimal 8 digit angka).");

  if (!formData.email?.trim()) errors.push("Email wajib diisi.");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim()))
    errors.push("Format Email tidak valid.");

  // 3. Tanda Tangan
  if (!isSignatureMeaningful(signature)) {
    errors.push(
      "Tanda tangan deklarasi (Pelamar) wajib diisi dengan tanda tangan yang jelas (bukan hanya titik/coretan kecil).",
    );
  }
  if (!formData.declaration_agreed)
    errors.push("Centang persetujuan pernyataan deklarasi wajib diisi.");

  if (!hideSalary && payslipCount === 0) {
    errors.push("Lampiran slip gaji terakhir wajib diunggah.");
  }
  if (!hideSalary && !formData.expected_salary?.trim()) {
    errors.push("Gaji Yang Diharapkan wajib diisi.");
  }

  if (!hideSalary && !isSignatureMeaningful(remunerationSignature)) {
    errors.push(
      "Tanda tangan formulir remunerasi wajib diisi dengan tanda tangan yang jelas (bukan hanya titik/coretan kecil).",
    );
  }

  // 4. Posisi yang dilamar & Info Lowongan
  if (!formData.position?.trim())
    errors.push("Posisi yang dilamar wajib diisi.");
  const jobVacancyInfo: string[] = Array.isArray(formData.job_vacancy_info)
    ? formData.job_vacancy_info.filter(
        (s: unknown) => typeof s === "string" && s.trim() !== "",
      )
    : [];
  if (jobVacancyInfo.length === 0)
    errors.push("Info lowongan kerja wajib diisi (pilih minimal satu).");
  else if (
    jobVacancyInfo.includes("Lainnya") &&
    !formData.job_vacancy_other?.trim()
  )
    errors.push(
      'Info lowongan kerja: sumber "Lainnya" wajib disebutkan pada kolom yang tersedia.',
    );

  // 4.1 Identitas Personal Wajib
  if (!formData.full_name?.trim()) errors.push("Nama Lengkap wajib diisi.");
  if (!formData.sex?.trim()) errors.push("Jenis Kelamin wajib diisi.");
  if (!formData.place_of_birth?.trim() || !formData.date_of_birth?.trim())
    errors.push("Tempat dan Tanggal Lahir wajib diisi.");
  if (!formData.religion?.trim()) errors.push("Agama wajib diisi.");
  if (!formData.nationality?.trim())
    errors.push("Kewarganegaraan wajib diisi.");
  if (!formData.ethnic?.trim()) errors.push("Suku wajib diisi.");
  if (!formData.hobby?.trim()) errors.push("Hobby wajib diisi.");
  if (!formData.marital_status?.trim())
    errors.push("Status Perkawinan wajib diisi.");
  if (
    (formData.marital_status === "Menikah" ||
      formData.marital_status === "Janda/Duda") &&
    !formData.marital_since_year?.trim()
  )
    errors.push(
      "Tahun pernikahan wajib diisi jika status Menikah atau Janda/Duda.",
    );
  if (!formData.identity_number?.trim())
    errors.push("No. KTP/Passport wajib diisi.");
  if (!formData.address_ktp?.trim())
    errors.push("Alamat Sesuai KTP wajib diisi.");
  if (!formData.current_address?.trim())
    errors.push("Alamat Saat Ini wajib diisi.");
  if (!formData.residential_status?.trim())
    errors.push("Status Tempat Tinggal wajib diisi.");
  if (!formData.height?.trim() || !formData.weight?.trim())
    errors.push("Tinggi dan Berat Badan wajib diisi.");
  if (
    formData.postal_code_ktp?.trim() &&
    /^0+$/.test(formData.postal_code_ktp.trim())
  )
    errors.push("Kode Pos Alamat KTP tidak valid.");
  if (
    formData.postal_code_current?.trim() &&
    /^0+$/.test(formData.postal_code_current.trim())
  )
    errors.push("Kode Pos Alamat Saat Ini tidak valid.");

  let hasValidSocialMedia = false;
  formData.social_media.forEach((sm, index) => {
    if (sm.platform?.trim() && sm.account?.trim()) {
      hasValidSocialMedia = true;
    }
    if (sm.platform?.trim() && !sm.account?.trim()) {
      errors.push(
        `Nama Akun Sosial Media untuk platform ${sm.platform} wajib diisi.`,
      );
    }
    if (!sm.platform?.trim() && sm.account?.trim()) {
      errors.push(
        `Platform Sosial Media untuk akun ${sm.account} wajib dipilih.`,
      );
    }
  });
  if (!hasValidSocialMedia)
    errors.push("Minimal 1 Sosial Media (Platform dan Akun) wajib diisi.");

  if (formData.driver_license.length > 0) {
    for (const sim of formData.driver_license) {
      const simNumber = formData.driver_license_numbers?.[sim]?.trim();
      if (!simNumber) {
        errors.push(`Nomor SIM untuk ${sim} wajib diisi.`);
      } else if (/^0+$/.test(simNumber)) {
        errors.push(`Nomor SIM untuk ${sim} tidak valid.`);
      }
    }
  }

  // 5. Susunan Anggota Keluarga
  const ayah = formData.family_members.find((f) =>
    f.relation.includes("Ayah"),
  );
  const ibu = formData.family_members.find((f) => f.relation.includes("Ibu"));
  if (
    !ayah?.name?.trim() ||
    !ayah?.age?.trim() ||
    !ayah?.education?.trim() ||
    !ayah?.occupation?.trim() ||
    !ibu?.name?.trim() ||
    !ibu?.age?.trim() ||
    !ibu?.education?.trim() ||
    !ibu?.occupation?.trim()
  ) {
    errors.push(
      "Susunan Anggota Keluarga: Seluruh kolom pada baris Ayah dan Ibu wajib diisi.",
    );
  }
  formData.family_members.forEach((member, index) => {
    if (
      !member.relation.includes("Ayah") &&
      !member.relation.includes("Ibu")
    ) {
      const hasAnyValue =
        member.name?.trim() ||
        member.age?.trim() ||
        member.education?.trim() ||
        member.occupation?.trim();
      if (hasAnyValue) {
        if (
          !member.name?.trim() ||
          !member.age?.trim() ||
          !member.education?.trim() ||
          !member.occupation?.trim()
        ) {
          errors.push(
            `Susunan Anggota Keluarga: Pada baris ${member.relation}, seluruh kolom harus diisi jika salah satu diisi.`,
          );
        }
      }
    }
  });
  // Susunan Keluarga (Sudah Menikah)
  formData.married_family_members.forEach((member, index) => {
    const hasAnyValue =
      member.name?.trim() ||
      member.age?.trim() ||
      member.education?.trim() ||
      member.occupation?.trim();
    if (hasAnyValue) {
      if (
        !member.name?.trim() ||
        !member.age?.trim() ||
        !member.education?.trim() ||
        !member.occupation?.trim()
      ) {
        errors.push(
          `Susunan Keluarga (Sudah Menikah): Pada baris ${member.relation}, seluruh kolom harus diisi jika salah satu diisi.`,
        );
      }
    }
  });

  // 6. Pendidikan Formal
  const formalEdus = formData.formal_education.filter(
    (e) => e.institution?.trim() !== "",
  );
  if (formalEdus.length === 0) {
    errors.push("Pendidikan Formal wajib diisi minimal 1 (satu) baris.");
  }
  formData.formal_education.forEach((edu, index) => {
    const hasAnyValue =
      edu.institution?.trim() ||
      edu.major?.trim() ||
      edu.grade?.trim() ||
      edu.period?.trim();
    if (hasAnyValue) {
      if (
        !edu.institution?.trim() ||
        !edu.major?.trim() ||
        !edu.grade?.trim() ||
        !edu.period?.trim()
      ) {
        errors.push(
          `Pendidikan Formal: Pada tingkat ${edu.level}, seluruh kolom harus diisi jika salah satu diisi.`,
        );
      }
    }
  });

  // Pendidikan Non Formal
  formData.non_formal_education.forEach((edu, index) => {
    const hasAnyValue =
      edu.name?.trim() || edu.institution?.trim() || edu.certificate?.trim();
    if (hasAnyValue) {
      if (
        !edu.name?.trim() ||
        !edu.institution?.trim() ||
        !edu.certificate?.trim()
      ) {
        errors.push(
          `Pendidikan Non Formal: Pada baris ke-${index + 1}, seluruh kolom harus diisi jika salah satu diisi.`,
        );
      }
    }
  });

  // Bahasa Asing / Daerah. Baris English/Hokkien punya nama bahasa yang
  // selalu terisi (bukan input bebas), jadi "baris ini sedang diisi"
  // hanya ditentukan dari level kemampuan — supaya baris itu tetap bisa
  // dikosongkan sepenuhnya kalau kandidat tidak ingin melaporkannya.
  formData.languages.forEach((lang, index) => {
    const hasAnyValue =
      lang.speaking?.trim() || lang.writing?.trim() || lang.reading?.trim();
    if (hasAnyValue) {
      if (
        !lang.language?.trim() ||
        !lang.speaking?.trim() ||
        !lang.writing?.trim() ||
        !lang.reading?.trim()
      ) {
        errors.push(
          `Bahasa Asing / Daerah: Pada baris ke-${index + 1}, seluruh kolom harus diisi jika salah satu diisi.`,
        );
      }
    }
  });

  // Keterampilan / Keahlian Khusus
  formData.skills.forEach((skill, index) => {
    const hasAnyValue = skill.ability?.trim() || skill.level?.trim();
    if (hasAnyValue) {
      if (!skill.ability?.trim() || !skill.level?.trim()) {
        errors.push(
          `Keterampilan / Keahlian: Pada baris ke-${index + 1}, seluruh kolom (Keterampilan dan Level) harus diisi jika salah satu diisi.`,
        );
      }
    }
  });

  // 7. Riwayat Pekerjaan: kalau salah satu kolom di baris ini diisi
  // (termasuk Masa Kerja), seluruh kolom lain di baris itu wajib diisi.
  // Baris ini boleh dikosongkan seluruhnya kalau memang belum ada satu
  // pun kolom yang diisi. Sebelumnya cuma Masa Kerja yang jadi pemicu —
  // itu bug: kandidat yang mengisi nama perusahaan/jobdesc dkk tapi
  // melewatkan Masa Kerja lolos validasi sama sekali (lihat kasus
  // Sumardai Saputra, 2026-08-08).
  formData.work_experience?.forEach((work, index) => {
    const hasAnyValue =
      work.company_name?.trim() ||
      work.period_start ||
      work.period_end ||
      work.company_address?.trim() ||
      work.business_line?.trim() ||
      work.current_position?.trim() ||
      work.report_directly?.trim() ||
      work.total_employees?.trim() ||
      work.number_of_subordinates?.trim() ||
      work.job_description?.trim() ||
      work.reason_for_leaving?.trim();

    if (hasAnyValue) {
      if (
        !work.company_name?.trim() ||
        !work.period_start ||
        !work.period_end ||
        !work.company_address?.trim() ||
        !work.business_line?.trim() ||
        !work.current_position?.trim() ||
        !work.report_directly?.trim() ||
        !work.total_employees?.trim() ||
        !work.number_of_subordinates?.trim() ||
        !work.job_description?.trim() ||
        !work.reason_for_leaving?.trim()
      ) {
        errors.push(
          `Pada RIWAYAT PEKERJAAN ke-${index + 1}, jika salah satu kolom diisi, maka seluruh kolom pada baris tersebut wajib diisi (Masa Kerja hingga Alasan Keluar).`,
        );
      }
    }
  });

  // 8. Riwayat Pekerjaan point 2-6
  if (
    !formData.work_achievements?.trim() ||
    !formData.work_pressure_response?.trim() ||
    !formData.job_desc_and_reason?.trim() ||
    !formData.strategy_to_contribute?.trim() ||
    !formData.reason_join_waruna?.trim()
  ) {
    errors.push(
      "Pertanyaan essay pada bagian RIWAYAT PEKERJAAN (point 2-6) wajib diisi seluruhnya.",
    );
  }

  // 9. Karyawan yang dikenal
  for (const emp of formData.known_employees) {
    if (
      emp.name?.trim() !== "" &&
      (!emp.position?.trim() || !emp.relation?.trim())
    ) {
      errors.push(
        "Jika mengisi karyawan yang dikenal di Waruna Group, posisi dan hubungan wajib diisi.",
      );
      break; // Only show once
    }
  }

  // 10. Setidaknya 2 referensi
  const validRefs = formData.references.filter((r) => r.name?.trim() !== "");
  if (validRefs.length < 2) {
    errors.push(
      "Sebutkan minimal 2 kenalan pada bagian Referensi (selain keluarga) yang dapat dihubungi.",
    );
  }
  formData.references.forEach((ref, index) => {
    const hasAnyValue =
      ref.name?.trim() ||
      ref.phone?.trim() ||
      ref.occupation?.trim() ||
      ref.company?.trim() ||
      ref.relation?.trim();
    if (hasAnyValue) {
      if (
        !ref.name?.trim() ||
        !ref.phone?.trim() ||
        !ref.occupation?.trim() ||
        !ref.company?.trim() ||
        !ref.relation?.trim()
      ) {
        errors.push(
          `Referensi: Pada baris ke-${index + 1}, seluruh kolom harus diisi jika salah satu diisi.`,
        );
      }
    }
  });

  // 11. Referensi darurat
  if (
    !formData.emergency_contact?.name?.trim() ||
    !formData.emergency_contact?.phone?.trim() ||
    !formData.emergency_contact?.relation?.trim() ||
    !formData.emergency_contact?.address?.trim()
  ) {
    errors.push(
      "Referensi keluarga yang dapat dihubungi saat keadaan darurat wajib diisi nama, nomor, hubungan, dan alamatnya.",
    );
  }

  // V. KETERANGAN LAINNYA
  if (!formData.hospitalized?.trim())
    errors.push(
      "Keterangan Lainnya: Pertanyaan 1 (Sakit Berat) wajib diisi.",
    );
  if (
    formData.hospitalized === "Ya" &&
    !formData.hospitalized_explain?.trim()
  )
    errors.push("Keterangan Lainnya: Penjelasan sakit berat wajib diisi.");

  if (!formData.crime_involved?.trim())
    errors.push(
      "Keterangan Lainnya: Pertanyaan 2 (Tindak Pidana) wajib diisi.",
    );
  if (formData.crime_involved === "Ya" && !formData.crime_explain?.trim())
    errors.push("Keterangan Lainnya: Penjelasan tindak pidana wajib diisi.");

  if (!formData.worked_in_waruna?.trim())
    errors.push(
      "Keterangan Lainnya: Pertanyaan 3 (Bergabung di Waruna) wajib diisi.",
    );
  if (
    formData.worked_in_waruna === "Ya" &&
    (!formData.waruna_position?.trim() || !formData.waruna_period?.trim())
  )
    errors.push(
      "Keterangan Lainnya: Posisi dan periode saat bergabung di Waruna wajib diisi.",
    );

  if (!formData.applying_other_company?.trim())
    errors.push(
      "Keterangan Lainnya: Pertanyaan 4 (Proses di tempat lain) wajib diisi.",
    );
  if (
    formData.applying_other_company === "Ya" &&
    !formData.applying_other_explain?.trim()
  )
    errors.push(
      "Keterangan Lainnya: Penjelasan proses seleksi di perusahaan lain wajib diisi.",
    );

  if (!formData.loyal_factor?.trim())
    errors.push(
      "Keterangan Lainnya: Pertanyaan 8 (Faktor loyal) wajib diisi.",
    );
  if (!formData.productivity_factor?.trim())
    errors.push(
      "Keterangan Lainnya: Pertanyaan 9 (Faktor produktivitas) wajib diisi.",
    );

  // Validasi Motivasi Bergabung
  const mp = formData.motivation_priority;
  if (
    !mp.work_location?.trim() ||
    !mp.career_path?.trim() ||
    !mp.self_actualization?.trim() ||
    !mp.challenge?.trim() ||
    !mp.working_environment?.trim() ||
    !mp.salary_benefit?.trim()
  ) {
    errors.push(
      "Keterangan Lainnya: Pertanyaan 10 (Skala Prioritas Motivasi Bergabung) wajib diisi secara lengkap (semua kotak).",
    );
  }

  // 13. Kapan mulai bekerja
  if (!formData.join_date?.trim()) {
    errors.push(
      "Keterangan Lainnya: Tanggal mulai bekerja (kapan Anda dapat mulai bekerja) wajib diisi.",
    );
  }

  return errors;
}
