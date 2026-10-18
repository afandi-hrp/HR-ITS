// Uji validasi /form-pelamar tanpa browser:
//   npx tsx scripts/test-application-form-validation.ts
import assert from "node:assert/strict";
import {
  isSignatureMeaningful,
  validateApplicationForm,
  type ApplicationFormValidationInput,
  type SignatureStrokes,
} from "../src/lib/applicationFormValidation";

// Coretan tanda tangan "asli": 40 titik melintang 120px.
const realSignature: SignatureStrokes = [
  Array.from({ length: 40 }, (_, i) => ({ x: 10 + i * 3, y: 50 + (i % 5) * 4 })),
];
// Satu tap / sentuhan tidak sengaja saat scroll di HP.
const tap: SignatureStrokes = [[{ x: 100, y: 60 }]];
// Beberapa tap di titik yang sama (banyak titik tapi tidak bergerak).
const jitter: SignatureStrokes = Array.from({ length: 6 }, () =>
  Array.from({ length: 5 }, () => ({ x: 100 + Math.random() * 3, y: 60 })),
);

const validFormData = () => ({
  position: "Staff IT",
  job_vacancy_info: ["Jobstreet"],
  job_vacancy_other: "",
  full_name: "Budi Santoso",
  sex: "Laki-laki",
  place_of_birth: "Medan",
  date_of_birth: "1995-01-01",
  religion: "Islam",
  nationality: "WNI",
  ethnic: "Batak",
  hobby: "Membaca",
  marital_status: "Belum Menikah",
  marital_since_year: "",
  identity_number: "1271000000000001",
  address_ktp: "Jl. Merdeka 1",
  postal_code_ktp: "20111",
  current_address: "Jl. Merdeka 1",
  postal_code_current: "20111",
  residential_status: "Milik Sendiri",
  mobile_phone: "081234567890",
  home_phone: "",
  height: "170",
  weight: "65",
  email: "budi@example.com",
  social_media: [{ platform: "Instagram", account: "@budi" }],
  driver_license: [] as string[],
  driver_license_numbers: {} as Record<string, string>,
  family_members: [
    { relation: "Ayah (Father)", name: "A", age: "60", education: "SMA", occupation: "Wiraswasta" },
    { relation: "Ibu (Mother)", name: "B", age: "58", education: "SMA", occupation: "IRT" },
    { relation: "Anak Pertama (1st Children)", name: "", age: "", education: "", occupation: "" },
  ],
  married_family_members: [
    { relation: "Suami/Istri (husband/wife)", name: "", age: "", education: "", occupation: "" },
  ],
  formal_education: [
    { level: "S1 (Degree)", institution: "USU", major: "TI", grade: "3.5", period: "2013-2017" },
    { level: "S2 (Master)", institution: "", major: "", grade: "", period: "" },
  ],
  non_formal_education: [{ name: "", institution: "", certificate: "" }],
  languages: [
    { language: "English", writing: "", reading: "", speaking: "" },
  ],
  skills: [{ ability: "", level: "", certificate: "" }],
  work_experience: [
    {
      period_start: "", period_end: "", is_current_job: false, company_name: "",
      company_address: "", business_line: "", current_position: "", report_directly: "",
      total_employees: "", number_of_subordinates: "", job_description: "", reason_for_leaving: "",
    },
  ],
  work_achievements: "x",
  work_pressure_response: "x",
  job_desc_and_reason: "x",
  strategy_to_contribute: "x",
  reason_join_waruna: "x",
  hospitalized: "Tidak",
  hospitalized_explain: "",
  crime_involved: "Tidak",
  crime_explain: "",
  worked_in_waruna: "Tidak",
  waruna_position: "",
  waruna_period: "",
  applying_other_company: "Tidak",
  applying_other_explain: "",
  known_employees: [{ name: "", position: "", relation: "" }],
  references: [
    { name: "R1", phone: "0811111111", occupation: "PNS", company: "X", relation: "Teman" },
    { name: "R2", phone: "0822222222", occupation: "PNS", company: "Y", relation: "Teman" },
    { name: "", phone: "", occupation: "", company: "", relation: "" },
  ],
  emergency_contact: { name: "C", phone: "0833333333", relation: "Kakak", address: "Medan" },
  loyal_factor: "x",
  productivity_factor: "x",
  motivation_priority: {
    work_location: "1", career_path: "2", self_actualization: "3",
    challenge: "4", working_environment: "5", salary_benefit: "6",
  },
  join_date: "2026-11-01",
  declaration_agreed: true,
  current_salary: "5000000",
  expected_salary: "7000000",
});

const validInput = (): ApplicationFormValidationInput => ({
  formData: validFormData(),
  token: "WRN-ABC123XY",
  hideSalary: false,
  hasPhoto: true,
  hasKtp: true,
  hasIjazah: true,
  hasTranscript: true,
  payslipCount: 1,
  signature: realSignature,
  remunerationSignature: realSignature,
});

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("  ok   " + name);
  } catch (e: any) {
    failures.push(name);
    console.log("  FAIL " + name + "\n       " + e.message);
  }
}

// Ubah input, pastikan ada error yang mengandung `expected`.
function expectError(
  name: string,
  mutate: (i: ApplicationFormValidationInput) => void,
  expected: string,
) {
  check(name, () => {
    const input = validInput();
    mutate(input);
    const errors = validateApplicationForm(input);
    assert.ok(
      errors.some((e) => e.includes(expected)),
      `harus ada error "${expected}", dapat: ${JSON.stringify(errors)}`,
    );
  });
}

console.log("isSignatureMeaningful");
check("tanda tangan asli lolos", () => assert.equal(isSignatureMeaningful(realSignature), true));
check("null ditolak", () => assert.equal(isSignatureMeaningful(null), false));
check("array kosong ditolak", () => assert.equal(isSignatureMeaningful([]), false));
check("satu tap ditolak", () => assert.equal(isSignatureMeaningful(tap), false));
check("banyak tap di satu titik ditolak", () => assert.equal(isSignatureMeaningful(jitter), false));

console.log("validateApplicationForm");
check("form lengkap tidak ada error", () => assert.deepEqual(validateApplicationForm(validInput()), []));

// Pertanyaan 1: Info lowongan kerja
expectError("info lowongan tidak dicentang", (i) => (i.formData.job_vacancy_info = []), "Info lowongan kerja wajib diisi");
expectError("info lowongan null (draft rusak)", (i) => (i.formData.job_vacancy_info = null), "Info lowongan kerja wajib diisi");
expectError("info lowongan berisi string kosong", (i) => (i.formData.job_vacancy_info = [""]), "Info lowongan kerja wajib diisi");
expectError("Lainnya dicentang tanpa keterangan", (i) => (i.formData.job_vacancy_info = ["Lainnya"]), '"Lainnya" wajib disebutkan');
expectError("Lainnya dicentang, keterangan spasi saja", (i) => {
  i.formData.job_vacancy_info = ["Lainnya"];
  i.formData.job_vacancy_other = "   ";
}, '"Lainnya" wajib disebutkan');
check("Lainnya + keterangan lolos", () => {
  const i = validInput();
  i.formData.job_vacancy_info = ["Lainnya"];
  i.formData.job_vacancy_other = "Teman";
  assert.deepEqual(validateApplicationForm(i), []);
});

// Pertanyaan 2: Tanda tangan
expectError("tanda tangan pelamar kosong", (i) => (i.signature = null), "Tanda tangan deklarasi");
expectError("tanda tangan pelamar cuma 1 tap", (i) => (i.signature = tap), "Tanda tangan deklarasi");
expectError("tanda tangan remunerasi kosong", (i) => (i.remunerationSignature = null), "Tanda tangan formulir remunerasi");
expectError("tanda tangan remunerasi cuma 1 tap", (i) => (i.remunerationSignature = tap), "Tanda tangan formulir remunerasi");
check("hideSalary: tanda tangan remunerasi & slip gaji tidak wajib", () => {
  const i = validInput();
  i.hideSalary = true;
  i.remunerationSignature = null;
  i.payslipCount = 0;
  i.formData.expected_salary = "";
  assert.deepEqual(validateApplicationForm(i), []);
});

// Pertanyaan 3: field wajib lainnya
expectError("token kosong", (i) => (i.token = "  "), "Token pendaftaran");
expectError("foto belum diunggah", (i) => (i.hasPhoto = false), "Pas foto");
expectError("KTP belum diunggah", (i) => (i.hasKtp = false), "KTP wajib diunggah");
expectError("ijazah belum diunggah", (i) => (i.hasIjazah = false), "Ijazah");
expectError("transkrip belum diunggah", (i) => (i.hasTranscript = false), "Transkrip");
expectError("slip gaji belum diunggah", (i) => (i.payslipCount = 0), "slip gaji");
expectError("gaji diharapkan kosong", (i) => (i.formData.expected_salary = ""), "Gaji Yang Diharapkan");
expectError("deklarasi tidak dicentang", (i) => (i.formData.declaration_agreed = false), "persetujuan pernyataan");
expectError("HP kosong", (i) => (i.formData.mobile_phone = ""), "No. Handphone wajib");
expectError("HP cuma tanda +", (i) => (i.formData.mobile_phone = "+"), "No. Handphone tidak valid");
expectError("HP cuma tanda ---", (i) => (i.formData.mobile_phone = "---"), "No. Handphone tidak valid");
expectError("HP terlalu pendek", (i) => (i.formData.mobile_phone = "0812"), "No. Handphone tidak valid");
expectError("email kosong", (i) => (i.formData.email = ""), "Email wajib");
expectError("email tidak valid", (i) => (i.formData.email = "budi@"), "Format Email");
expectError("posisi kosong", (i) => (i.formData.position = " "), "Posisi yang dilamar");
expectError("nama kosong", (i) => (i.formData.full_name = ""), "Nama Lengkap");
expectError("jenis kelamin kosong", (i) => (i.formData.sex = ""), "Jenis Kelamin");
expectError("tanggal lahir kosong", (i) => (i.formData.date_of_birth = ""), "Tempat dan Tanggal Lahir");
expectError("menikah tanpa tahun", (i) => (i.formData.marital_status = "Menikah"), "Tahun pernikahan");
expectError("sosmed kosong", (i) => (i.formData.social_media = [{ platform: "", account: "" }]), "Minimal 1 Sosial Media");
expectError("SIM dicentang tanpa nomor", (i) => (i.formData.driver_license = ["SIM A"]), "Nomor SIM untuk SIM A");
expectError("data ayah tidak lengkap", (i) => (i.formData.family_members[0].occupation = ""), "baris Ayah dan Ibu");
expectError("pendidikan formal kosong", (i) => (i.formData.formal_education[0].institution = ""), "Pendidikan Formal wajib");
expectError("riwayat kerja setengah diisi", (i) => (i.formData.work_experience[0].company_name = "PT X"), "RIWAYAT PEKERJAAN ke-1");
expectError("essay kosong", (i) => (i.formData.reason_join_waruna = ""), "Pertanyaan essay");
expectError("referensi cuma 1", (i) => (i.formData.references[1].name = ""), "minimal 2 kenalan");
expectError("kontak darurat tanpa alamat", (i) => (i.formData.emergency_contact.address = ""), "keadaan darurat");
expectError("sakit berat Ya tanpa penjelasan", (i) => (i.formData.hospitalized = "Ya"), "Penjelasan sakit berat");
expectError("motivasi tidak lengkap", (i) => (i.formData.motivation_priority.challenge = ""), "Skala Prioritas Motivasi");
expectError("tanggal mulai kerja kosong", (i) => (i.formData.join_date = ""), "Tanggal mulai bekerja");

console.log(`\n${passed} lulus, ${failures.length} gagal`);
if (failures.length) process.exit(1);
