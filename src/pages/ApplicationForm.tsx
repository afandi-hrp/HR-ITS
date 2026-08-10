import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/ui/use-toast";
import {
  Loader2,
  Upload,
  CheckCircle2,
  Plus,
  Trash2,
  Eraser,
  FileText,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  Link,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import SignatureCanvas from "react-signature-canvas";
import { cn, getEmbedUrl, getSocialMediaUrl, formatCurrencyId, formatDateDMY, calculateAge, fetchWithRetry } from "../lib/utils";
import { resolveDocumentUrl } from "../lib/documentStorage";
import { PdfToImages } from "../components/PdfToImages";

interface ApplicationFormProps {
  readOnly?: boolean;
  initialData?: any;
  hideSalary?: boolean;
  onlyRemuneration?: boolean;
}

const renderAttachment = (url: string | undefined | null, label: string) => {
  if (!url) return <span className="text-sm text-slate-500">-</span>;

  const isPdf = url.split("?")[0].toLowerCase().endsWith(".pdf");

  return (
    <div className="mt-2 pdf-avoid-break">
      {isPdf ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm hover:bg-indigo-100 transition-colors border border-indigo-100"
        >
          <FileText size={16} />
          Lihat Dokumen PDF
        </a>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block border border-slate-200 rounded-lg overflow-hidden hover:border-indigo-300 transition-colors max-w-xs bg-slate-50 p-1 no-print"
        >
          <img
            src={url}
            alt={label}
            className="w-full h-auto object-contain max-h-48 rounded"
          />
        </a>
      )}
      {!isPdf && (
        <div className="block text-sm text-slate-600 italic mt-1">
          (Lihat gambar ukuran penuh di bagian bawah)
        </div>
      )}
    </div>
  );
};

export default function ApplicationForm({
  readOnly = false,
  initialData = null,
  hideSalary = false,
  onlyRemuneration = false,
}: ApplicationFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [siteSettings, setSiteSettings] = useState<any>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // Document URL fields in `initialData` may be either a legacy full public
  // URL (used as-is) or a bare storage path into the private bucket (needs
  // resolving into a short-lived signed URL before use). See
  // src/lib/documentStorage.ts.
  const [resolvedDocs, setResolvedDocs] = useState<Record<string, string>>(
    {},
  );

  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [ijazahFile, setIjazahFile] = useState<File | null>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [otherDocFiles, setOtherDocFiles] = useState<File[]>([]);
  const [payslipFiles, setPayslipFiles] = useState<File[]>([]);
  const [token, setToken] = useState("");
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  const sigCanvas = useRef<SignatureCanvas>(null);
  const remunerationSigCanvas = useRef<SignatureCanvas>(null);
  // Last-known-good vector data for each signature pad. A browser resize
  // (e.g. mobile keyboard opening/closing) always wipes the underlying
  // <canvas> pixels, but with clearOnResize={false} the library doesn't
  // reset its own isEmpty()/data tracking to match — so without this,
  // isEmpty() can keep reporting "signed" even though the canvas is now
  // visually blank, letting a blank signature slip through validation.
  // We capture the drawn strokes on every stroke-end, and after a resize
  // redraw them back in so the visible canvas and isEmpty() stay in sync.
  const lastSignatureData = useRef<ReturnType<
    NonNullable<InstanceType<typeof SignatureCanvas>["toData"]>
  > | null>(null);
  const lastRemunerationSignatureData = useRef<ReturnType<
    NonNullable<InstanceType<typeof SignatureCanvas>["toData"]>
  > | null>(null);

  useEffect(() => {
    const restoreIfCleared = (
      canvasRef: React.RefObject<SignatureCanvas>,
      dataRef: React.MutableRefObject<any>,
    ) => {
      if (
        canvasRef.current &&
        canvasRef.current.isEmpty() &&
        dataRef.current &&
        dataRef.current.length > 0
      ) {
        canvasRef.current.fromData(dataRef.current);
      }
    };

    const handleResize = () => {
      // Let the signature pad's own resize handling run first, then restore.
      requestAnimationFrame(() => {
        restoreIfCleared(sigCanvas, lastSignatureData);
        restoreIfCleared(remunerationSigCanvas, lastRemunerationSignatureData);
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    loadSiteSettings();
    if (initialData) {
      // Merge initialData with default formData to ensure all arrays/objects exist
      setFormData((prev) => {
        let merged = { ...prev, ...initialData };
        if (typeof initialData.social_media === "string") {
          merged.social_media = [
            { platform: "", account: initialData.social_media },
          ];
        }
        if (typeof initialData.driver_license === "string") {
          merged.driver_license = initialData.driver_license
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
        }
        if (typeof initialData.job_vacancy_info === "string") {
          merged.job_vacancy_info = initialData.job_vacancy_info
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
        }
        if (typeof initialData.driver_license_numbers !== "object") {
          merged.driver_license_numbers = {};
          if (
            typeof initialData.driver_license_number === "string" &&
            merged.driver_license.length > 0
          ) {
            merged.driver_license_numbers[merged.driver_license[0]] =
              initialData.driver_license_number;
          }
        }
        return merged;
      });
    } else {
      const draft = localStorage.getItem("application_draft");
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          setFormData((prev) => {
            let merged = { ...prev, ...parsed };
            if (typeof parsed.social_media === "string") {
              merged.social_media = [
                { platform: "", account: parsed.social_media },
              ];
            }
            if (typeof parsed.driver_license === "string") {
              merged.driver_license = parsed.driver_license
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean);
            }
            if (typeof parsed.job_vacancy_info === "string") {
              merged.job_vacancy_info = parsed.job_vacancy_info
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean);
            }
            if (typeof parsed.driver_license_numbers !== "object") {
              merged.driver_license_numbers = {};
              if (
                typeof parsed.driver_license_number === "string" &&
                merged.driver_license?.length > 0
              ) {
                merged.driver_license_numbers[merged.driver_license[0]] =
                  parsed.driver_license_number;
              }
            }
            return merged;
          });
          toast({
            title: "Draft Ditemukan",
            description:
              "Kami telah memuat kembali data isian form Anda sebelumnya.",
          });
        } catch (e) {}
      }
    }
  }, [initialData]);

  useEffect(() => {
    if (!readOnly || !initialData) return;
    let cancelled = false;

    const docFields = [
      "photo_url",
      "ktp_url",
      "ijazah_url",
      "transcript_url",
      "other_doc_url",
      "signature_url",
      "payslip_url",
      "remuneration_signature_url",
    ];

    (async () => {
      const entries = await Promise.all(
        docFields.map(async (field) => {
          const raw = initialData[field];
          if (typeof raw !== "string" || !raw) return [field, ""] as const;
          // Signatures are inline base64 data: URLs, which always contain a
          // comma themselves (the "base64," marker) — must not be split.
          if (raw.startsWith("data:")) return [field, raw] as const;
          // other_doc_url / payslip_url can hold multiple comma-separated files
          if (raw.includes(",")) {
            const parts = raw
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean);
            const resolvedParts = await Promise.all(
              parts.map((p) => resolveDocumentUrl(p)),
            );
            return [field, resolvedParts.filter(Boolean).join(",")] as const;
          }
          const resolved = await resolveDocumentUrl(raw);
          return [field, resolved || ""] as const;
        }),
      );

      if (cancelled) return;
      const resolved = Object.fromEntries(entries);
      setResolvedDocs(resolved);
      if (resolved.photo_url) setPhotoPreview(resolved.photo_url);
    })();

    return () => {
      cancelled = true;
    };
  }, [readOnly, initialData]);

  const loadSiteSettings = async () => {
    try {
      const { data } = await supabase
        .from("site_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (data) setSiteSettings(data);
    } catch (err) {
      console.error("Error loading site settings:", err);
    }
  };

  const [formData, setFormData] = useState({
    position: "",
    job_vacancy_info: [] as string[],
    job_vacancy_other: "",
    full_name: "",
    sex: "",
    place_of_birth: "",
    date_of_birth: "",
    religion: "",
    nationality: "",
    ethnic: "",
    hobby: "",
    marital_status: "",
    marital_since_year: "",
    identity_number: "",
    address_ktp: "",
    postal_code_ktp: "",
    current_address: "",
    postal_code_current: "",
    residential_status: "",
    mobile_phone: "",
    home_phone: "",
    height: "",
    weight: "",
    email: "",
    social_media: [{ platform: "", account: "" }] as {
      platform: string;
      account: string;
    }[],
    driver_license: [] as string[],
    driver_license_number: "",
    driver_license_numbers: {} as Record<string, string>,
    family_members: [
      {
        relation: "Ayah (Father)",
        name: "",
        age: "",
        education: "",
        occupation: "",
      },
      {
        relation: "Ibu (Mother)",
        name: "",
        age: "",
        education: "",
        occupation: "",
      },
      {
        relation: "Anak Pertama (1st Children)",
        name: "",
        age: "",
        education: "",
        occupation: "",
      },
      {
        relation: "Anak Kedua (2nd Children)",
        name: "",
        age: "",
        education: "",
        occupation: "",
      },
      {
        relation: "Anak Ketiga (3rd Children)",
        name: "",
        age: "",
        education: "",
        occupation: "",
      },
      {
        relation: "Anak Keempat (4th Children)",
        name: "",
        age: "",
        education: "",
        occupation: "",
      },
    ],
    married_family_members: [
      {
        relation: "Suami/Istri (husband/wife)",
        name: "",
        age: "",
        education: "",
        occupation: "",
      },
      {
        relation: "Anak Pertama (1st Children)",
        name: "",
        age: "",
        education: "",
        occupation: "",
      },
      {
        relation: "Anak Kedua (2nd Children)",
        name: "",
        age: "",
        education: "",
        occupation: "",
      },
      {
        relation: "Anak Ketiga (3rd Children)",
        name: "",
        age: "",
        education: "",
        occupation: "",
      },
    ],
    formal_education: [
      {
        level: "SMA/SMK (High School)",
        institution: "",
        major: "",
        grade: "",
        period: "",
      },
      { level: "Diploma", institution: "", major: "", grade: "", period: "" },
      {
        level: "S1 (Degree)",
        institution: "",
        major: "",
        grade: "",
        period: "",
      },
      {
        level: "S2 (Master)",
        institution: "",
        major: "",
        grade: "",
        period: "",
      },
    ],
    non_formal_education: [
      { name: "", institution: "", certificate: "" },
      { name: "", institution: "", certificate: "" },
      { name: "", institution: "", certificate: "" },
    ],
    organizations: [
      { name: "", type: "", period: "", position: "" },
      { name: "", type: "", period: "", position: "" },
      { name: "", type: "", period: "", position: "" },
    ],
    languages: [
      { language: "English", writing: "", reading: "", speaking: "" },
      { language: "Hokkien", writing: "", reading: "", speaking: "" },
      { language: "", writing: "", reading: "", speaking: "" },
    ],
    skills: [
      { ability: "", level: "", certificate: "" },
      { ability: "", level: "", certificate: "" },
      { ability: "", level: "", certificate: "" },
    ],
    work_experience: [
      {
        period_start: "",
        period_end: "",
        is_current_job: false,
        company_name: "",
        company_address: "",
        business_line: "",
        current_position: "",
        report_directly: "",
        total_employees: "",
        number_of_subordinates: "",
        job_description: "",
        reason_for_leaving: "",
      },
    ],
    work_achievements: "",
    work_pressure_response: "",
    job_desc_and_reason: "",
    strategy_to_contribute: "",
    reason_join_waruna: "",

    hospitalized: "",
    hospitalized_explain: "",
    crime_involved: "",
    crime_explain: "",
    worked_in_waruna: "",
    waruna_position: "",
    waruna_period: "",
    applying_other_company: "",
    applying_other_explain: "",

    known_employees: [
      { name: "", position: "", relation: "" },
      { name: "", position: "", relation: "" },
      { name: "", position: "", relation: "" },
    ],
    references: [
      { name: "", phone: "", occupation: "", company: "", relation: "" },
      { name: "", phone: "", occupation: "", company: "", relation: "" },
      { name: "", phone: "", occupation: "", company: "", relation: "" },
    ],
    emergency_contact: {
      name: "",
      phone: "",
      relation: "",
      address: "",
    },
    loyal_factor: "",
    productivity_factor: "",
    motivation_priority: {
      work_location: "",
      career_path: "",
      self_actualization: "",
      challenge: "",
      working_environment: "",
      salary_benefit: "",
    },
    join_date: "",
    declaration_agreed: false,

    // Remuneration fields
    current_salary: "",
    expected_salary: "",
    remuneration_signature_name: "",
    remuneration_signature_date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    if (!initialData) {
      const timeout = setTimeout(() => {
        localStorage.setItem("application_draft", JSON.stringify(formData));
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [formData, initialData]);

  // Phone numbers: digits plus "+" (country code, e.g. +62) and "-"
  // (common local formatting, e.g. 0822-7688) — anything else stripped as
  // the user types instead of validating after the fact.
  const handlePhoneInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, value } = e.target;
    const filtered = value.replace(/[^\d+-]/g, "");
    setFormData((prev) => ({ ...prev, [name]: filtered }));
  };

  // Salary fields: digits plus "." and "," (manual thousand separators).
  const handleSalaryInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, value } = e.target;
    const filtered = value.replace(/[^\d.,]/g, "");
    setFormData((prev) => ({ ...prev, [name]: filtered }));
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newData = { ...prev, [name]: value };
      if (name === "full_name") {
        newData.remuneration_signature_name = value;
      }
      return newData;
    });
  };

  const handleCheckboxChange = (
    name: "job_vacancy_info" | "driver_license",
    value: string,
    checked: boolean,
  ) => {
    setFormData((prev) => {
      const currentList = prev[name];
      if (checked) {
        return { ...prev, [name]: [...currentList, value] };
      } else {
        return {
          ...prev,
          [name]: currentList.filter((item) => item !== value),
        };
      }
    });
  };

  const handleFamilyMemberChange = (
    type: "family_members" | "married_family_members",
    index: number,
    field: string,
    value: string,
  ) => {
    setFormData((prev) => {
      const updatedMembers = [...prev[type]];
      updatedMembers[index] = { ...updatedMembers[index], [field]: value };
      return { ...prev, [type]: updatedMembers };
    });
  };

  const handleTableChange = (
    type:
      | "formal_education"
      | "non_formal_education"
      | "organizations"
      | "languages"
      | "skills"
      | "known_employees"
      | "references",
    index: number,
    field: string,
    value: string,
  ) => {
    setFormData((prev) => {
      const updatedTable = [...prev[type]] as any[];
      updatedTable[index] = { ...updatedTable[index], [field]: value };
      return { ...prev, [type]: updatedTable };
    });
  };

  const handleEmergencyContactChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      emergency_contact: { ...prev.emergency_contact, [field]: value },
    }));
  };

  const handleMotivationPriorityChange = (field: string, value: string) => {
    // Only allow empty string or numbers 1-6
    if (value !== "" && !/^[1-6]$/.test(value)) {
      return;
    }

    if (value !== "") {
      // Check if value already exists in another field
      const existingField = Object.entries(formData.motivation_priority).find(
        ([k, v]) => k !== field && v === value,
      );
      if (existingField) {
        toast({
          title: "Angka Sudah Digunakan",
          description: `Angka ${value} sudah dipilih. Tidak bisa diisi di field lain.`,
          variant: "destructive",
        });
        return;
      }
    }
    setFormData((prev) => ({
      ...prev,
      motivation_priority: { ...prev.motivation_priority, [field]: value },
    }));
  };

  const handleWorkExperienceChange = (
    index: number,
    field: string,
    value: string | boolean,
  ) => {
    setFormData((prev) => {
      const updatedExperience = [...prev.work_experience];
      updatedExperience[index] = {
        ...updatedExperience[index],
        [field]: value,
      };
      return { ...prev, work_experience: updatedExperience };
    });
  };

  const addWorkExperience = () => {
    setFormData((prev) => ({
      ...prev,
      work_experience: [
        ...prev.work_experience,
        {
          period_start: "",
          period_end: "",
          is_current_job: false,
          company_name: "",
          company_address: "",
          business_line: "",
          current_position: "",
          report_directly: "",
          total_employees: "",
          number_of_subordinates: "",
          job_description: "",
          reason_for_leaving: "",
        },
      ],
    }));
  };

  const removeWorkExperience = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      work_experience: prev.work_experience.filter((_, i) => i !== index),
    }));
  };

  const addLanguage = () => {
    setFormData((prev) => ({
      ...prev,
      languages: [
        ...prev.languages,
        { language: "", writing: "", reading: "", speaking: "" },
      ],
    }));
  };

  const removeLanguage = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      languages: prev.languages.filter((_, i) => i !== index),
    }));
  };

  const addSkill = () => {
    setFormData((prev) => ({
      ...prev,
      skills: [...prev.skills, { ability: "", level: "", certificate: "" }],
    }));
  };

  const removeSkill = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== index),
    }));
  };

  const addSocialMedia = () => {
    if (formData.social_media.length >= 2) return;
    setFormData((prev) => ({
      ...prev,
      social_media: [...prev.social_media, { platform: "", account: "" }],
    }));
  };

  const removeSocialMedia = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      social_media: prev.social_media.filter((_, i) => i !== index),
    }));
  };

  const handleSocialMediaChange = (
    index: number,
    field: "platform" | "account",
    value: string,
  ) => {
    setFormData((prev) => {
      const updated = [...prev.social_media];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, social_media: updated };
    });
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 3 * 1024 * 1024) {
        toast({
          title: "Ukuran File Terlalu Besar",
          description: "Maksimal ukuran foto adalah 3MB.",
          variant: "destructive",
        });
        e.target.value = "";
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<File | null>>,
    label: string,
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 3 * 1024 * 1024) {
        toast({
          title: "Ukuran File Terlalu Besar",
          description: `Maksimal ukuran file untuk ${label} adalah 3MB.`,
          variant: "destructive",
        });
        e.target.value = "";
        return;
      }
      setter(file);
    }
  };

  const handleMultipleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<File[]>>,
    label: string,
    maxFiles: number,
  ) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);

      if (files.length > maxFiles) {
        toast({
          title: "Terlalu Banyak File",
          description: `Maksimal ${maxFiles} file untuk ${label}.`,
          variant: "destructive",
        });
        e.target.value = "";
        return;
      }

      const validFiles: File[] = [];
      for (const file of files) {
        if (file.size > 3 * 1024 * 1024) {
          toast({
            title: "Ukuran File Terlalu Besar",
            description: `File ${file.name} melebihi 3MB.`,
            variant: "destructive",
          });
        } else {
          validFiles.push(file);
        }
      }
      setter(validFiles);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // VALIDATIONS
    const errors: string[] = [];

    if (!token.trim()) errors.push("Token pendaftaran wajib diisi.");

    // 1. Upload Dokumen
    if (!photoFile) errors.push("Pas foto wajib diunggah.");
    if (!ktpFile) errors.push("Dokumen KTP wajib diunggah.");
    if (!ijazahFile) errors.push("Dokumen Ijazah wajib diunggah.");
    if (!transcriptFile) errors.push("Dokumen Transkrip Nilai wajib diunggah.");

    // 2. No. Handphone
    if (!formData.mobile_phone?.trim())
      errors.push("No. Handphone wajib diisi.");

    // 3. Tanda Tangan
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
      errors.push("Tanda tangan deklarasi (Pelamar) wajib diisi.");
    }
    if (!hideSalary && payslipFiles.length === 0) {
      errors.push("Lampiran slip gaji terakhir wajib diunggah.");
    }

    if (
      !hideSalary &&
      (!remunerationSigCanvas.current ||
        remunerationSigCanvas.current.isEmpty())
    ) {
      errors.push("Tanda tangan formulir remunerasi wajib diisi.");
    }

    // 4. Posisi yang dilamar & Info Lowongan
    if (!formData.position?.trim())
      errors.push("Posisi yang dilamar wajib diisi.");
    if (formData.job_vacancy_info.length === 0)
      errors.push("Info lowongan kerja wajib diisi (pilih minimal satu).");

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
        if (!formData.driver_license_numbers?.[sim]?.trim()) {
          errors.push(`Nomor SIM untuk ${sim} wajib diisi.`);
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

    // 7. Riwayat Pekerjaan point 1. Masa Kerja adalah field pemicu: kalau
    // diisi, seluruh kolom lain di baris itu wajib diisi. Kalau Masa Kerja
    // tidak diisi, baris ini dianggap belum mulai diisi dan boleh
    // dikosongkan seluruhnya walau ada field lain yang sempat terisi.
    formData.work_experience?.forEach((work, index) => {
      const hasAnyValue = work.period_start || work.period_end;

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

    if (errors.length > 0) {
      toast({
        title: "Formulir Belum Lengkap",
        description:
          "Silakan periksa kembali bagian berikut: \n- " + errors.join("\n- "),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      let photoUrl = "";
      let ktpUrl = "";
      let ijazahUrl = "";
      let transcriptUrl = "";
      let otherDocUrl = "";

      const uploadFile = async (file: File, prefix: string) => {
        // Uploads go through our own backend instead of straight to Supabase
        // Storage — the server validates the registration token before the
        // file is allowed onto the bucket at all (see /api/n8n/upload-document).
        const uploadFormData = new FormData();
        uploadFormData.append("token", token);
        uploadFormData.append("docType", prefix);
        uploadFormData.append("file", file);

        const response = await fetchWithRetry("/api/n8n/upload-document", {
          method: "POST",
          body: uploadFormData,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(
            errData.error || `Gagal mengunggah ${prefix}: ${response.statusText}`,
          );
        }

        const data = await response.json();
        return data.url as string;
      };

      if (photoFile) photoUrl = await uploadFile(photoFile, "photo");
      if (ktpFile) ktpUrl = await uploadFile(ktpFile, "ktp");
      if (ijazahFile) ijazahUrl = await uploadFile(ijazahFile, "ijazah");
      if (transcriptFile)
        transcriptUrl = await uploadFile(transcriptFile, "transcript");

      let otherDocUrls: string[] = [];
      if (otherDocFiles.length > 0) {
        for (const file of otherDocFiles) {
          otherDocUrls.push(await uploadFile(file, "other"));
        }
      }
      otherDocUrl = otherDocUrls.join(",");

      let payslipUrls: string[] = [];
      if (payslipFiles.length > 0) {
        for (const file of payslipFiles) {
          payslipUrls.push(await uploadFile(file, "payslip"));
        }
      }
      let payslipUrl = payslipUrls.join(",");

      let signatureDataUrl = "";
      if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
        signatureDataUrl = sigCanvas.current.getCanvas().toDataURL("image/png");
      }

      let remunerationSignatureDataUrl = "";
      if (
        remunerationSigCanvas.current &&
        !remunerationSigCanvas.current.isEmpty()
      ) {
        remunerationSignatureDataUrl = remunerationSigCanvas.current
          .getCanvas()
          .toDataURL("image/png");
      }

      // Prepare data to save
      const rawData = {
        ...formData,
        photo_url: photoUrl,
        ktp_url: ktpUrl,
        ijazah_url: ijazahUrl,
        transcript_url: transcriptUrl,
        other_doc_url: otherDocUrl,
        payslip_url: payslipUrl,
        signature_url: signatureDataUrl,
        remuneration_signature_url: remunerationSignatureDataUrl,
        job_vacancy_info: formData.job_vacancy_info.includes("Lainnya")
          ? [
              ...formData.job_vacancy_info.filter((i) => i !== "Lainnya"),
              `Lainnya: ${formData.job_vacancy_other}`,
            ].join(", ")
          : formData.job_vacancy_info.join(", "),
        driver_license: formData.driver_license.join(", "),
        submitted_at: new Date().toISOString(),
      };

      const uid_sheet = uuidv4();

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "submit_application_with_token",
        {
          p_token: token,
          p_raw_data: rawData,
          p_uid_sheet: uid_sheet,
        },
      );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      setSuccess(true);
      if (typeof window !== "undefined") {
        localStorage.removeItem("application_draft");
      }
      toast({
        title: "Berhasil",
        description: "Formulir lamaran Anda telah berhasil dikirim.",
      });

      // Reset form
      window.scrollTo(0, 0);
    } catch (error: any) {
      console.error("Submit error:", error);

      let errorMessage =
        error.message || "Terjadi kesalahan saat mengirim formulir.";
      let title = "Error";

      // Only messages we deliberately wrote ourselves (RAISE EXCEPTION in
      // submit_application_with_token) are safe to show verbatim — every
      // other case falls through to a generic message below. Previously
      // this worked the other way around (show raw unless it "looks"
      // technical via a keyword denylist), which let an unrecognized raw
      // Postgres error ("operator does not exist: json ? unknown") reach
      // candidates directly since it didn't happen to contain any of the
      // checked keywords. A denylist can never cover every possible
      // technical error message; an allowlist of known-safe messages can.
      const isKnownFriendlyMessage =
        errorMessage.includes("Token tidak valid") ||
        errorMessage.includes("Token sudah digunakan");

      if (
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("NetworkError") ||
        isOffline
      ) {
        title = "Koneksi Terputus";
        errorMessage =
          'Gagal terhubung ke server. Data isian Anda otomatis disimpan di penyimpanan lokal (draft). Anda dapat kembali menekan tombol "Kirim" ketika koneksi sudah stabil tanpa harus mengetik ulang form.';
      } else if (errorMessage.includes("Gagal mengunggah")) {
        errorMessage =
          "Gagal mengunggah dokumen. Data teks Anda saat ini aman disimpan dalam draft. Silakan periksa koneksi Anda dan coba unggah ulang.";
      } else if (isKnownFriendlyMessage) {
        // Leave as-is — already a specific, human-readable message.
      } else {
        errorMessage =
          "Terjadi kesalahan sistem saat memproses formulir Anda. Silakan coba beberapa saat lagi. Kami telah menyimpan isian Anda ke penyimpanan lokal perangkat.";
      }

      toast({
        title: title,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Terima Kasih!</h2>
          <p className="text-slate-600">
            Formulir lamaran Anda telah berhasil kami terima. Tim rekrutmen kami
            akan segera meninjau data Anda.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all w-full"
          >
            Kembali ke Halaman Formulir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        readOnly
          ? "py-0 bg-transparent flex flex-col gap-6"
          : "min-h-screen py-12 px-4 sm:px-6 lg:px-8",
      )}
      id="application-form-container"
    >
      {isOffline && !readOnly && (
        <div className="mx-auto w-full max-w-4xl bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-xl shadow-sm">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Anda sedang offline (Koneksi Terputus)
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  Tidak perlu khawatir, setiap isian Anda secara otomatis
                  disimpan sementara di perangkat ini. Anda bisa melanjutkan
                  pengisian dan menekan "Kirim" ketika koneksi kembali stabil.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        {!onlyRemuneration && (
          <>
            <div
              className={cn(
                "mx-auto bg-white overflow-hidden print:overflow-visible print:shadow-none print:border-none",
                readOnly
                  ? "w-full rounded-2xl shadow-sm border border-slate-200"
                  : "w-full max-w-4xl rounded-2xl shadow-xl",
              )}
            >
              <div className="bg-[#5D1F57] relative overflow-hidden px-5 sm:px-8 py-5 sm:py-7 text-white flex flex-row items-center gap-4 sm:gap-6 rounded-t-2xl print:rounded-none print:px-8 print:py-7">
                {/* Dotted pattern decoration */}
                <div 
                  className="absolute right-0 top-0 bottom-0 w-64 opacity-20 pointer-events-none block" 
                  style={{ 
                    backgroundImage: 'radial-gradient(circle, white 1.5px, transparent 1.5px)', 
                    backgroundSize: '12px 12px', 
                    maskImage: 'linear-gradient(to left, black, transparent)',
                    WebkitMaskImage: 'linear-gradient(to left, black, transparent)'
                  }}
                ></div>

                {siteSettings?.career_logo_url && (
                  <div className="shrink-0 flex items-center z-10 h-10 sm:h-14 print:h-14">
                    <img
                      src={siteSettings.career_logo_url}
                      alt="Logo"
                      className="h-full w-auto max-w-[120px] sm:max-w-[180px] object-contain print:max-w-[180px]"
                    />
                  </div>
                )}
                
                {/* Divider */}
                <div className="w-px h-10 sm:h-14 bg-white/40 shrink-0 z-10 print:h-14"></div>

                <div className="flex-1 flex flex-col justify-center text-left z-10 items-start overflow-hidden print:overflow-visible">
                  <div className="inline-block w-full">
                    <h1
                      id="application-form-title"
                      className="text-[13px] sm:text-lg md:text-xl font-bold tracking-wide uppercase leading-tight"
                    >
                      Formulir Data Pelamar Kerja
                    </h1>
                    <div className="h-px bg-white/60 w-full my-1 sm:my-1.5"></div>
                    <span
                      id="application-form-subtitle"
                      className="font-normal italic text-[10px] sm:text-sm opacity-90 leading-tight block"
                    >
                      Job Applicant Information Form
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-8">
                <fieldset disabled={readOnly} className="space-y-8 min-w-0">
                  {/* Token Section */}
                  {!readOnly && (
                    <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl mb-8">
                      <label className="block text-sm font-bold text-indigo-900 mb-2">
                        Token Pendaftaran{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-indigo-700 mb-3">
                        Masukkan token pendaftaran yang telah diberikan oleh tim
                        rekrutmen kami.
                      </p>
                      <input
                        type="text"
                        required
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="Contoh: WRN-ABC123XY"
                        className="w-full md:w-1/2 px-4 py-3 bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-lg uppercase"
                      />
                    </div>
                  )}

                  {/* Header Section */}
                  <div className="flex flex-col md:flex-row gap-8 items-start border-b border-slate-200 pb-8">
                    <div className="flex-1 space-y-6 w-full">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          Posisi yang dilamar{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Position applied)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="position"
                          required
                          value={formData.position}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Info lowongan kerja{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Job vacancy information)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <div className="flex flex-wrap gap-4">
                          {[
                            "Jobstreet",
                            "JobsDB",
                            "Linkedin",
                            "Instagram",
                            "Lainnya",
                          ].map((item) => (
                            <label
                              key={item}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={formData.job_vacancy_info.includes(
                                  item,
                                )}
                                onChange={(e) =>
                                  handleCheckboxChange(
                                    "job_vacancy_info",
                                    item,
                                    e.target.checked,
                                  )
                                }
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                {item}
                              </span>
                            </label>
                          ))}
                        </div>
                        {formData.job_vacancy_info.includes("Lainnya") && (
                          <input
                            type="text"
                            name="job_vacancy_other"
                            placeholder="Sebutkan lainnya..."
                            value={formData.job_vacancy_other}
                            onChange={handleInputChange}
                            className="mt-2 w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          />
                        )}
                      </div>
                    </div>

                    <div className="w-full md:w-48 shrink-0">
                      <label className="block text-sm font-semibold text-slate-700 mb-1 text-center">
                        Foto Terbaru <span className="text-xs font-normal italic">(Recent Photo)</span> <span className="text-red-500">*</span>{" "}
                        <span className="text-xs font-normal text-slate-500">
                          (Maks. 3MB)
                        </span>
                      </label>
                      <div className="relative w-full aspect-[3/4] border-2 border-dashed border-slate-300 rounded-xl overflow-hidden hover:border-indigo-500 transition-colors group cursor-pointer bg-slate-50">
                        {!readOnly && (
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                        )}
                        {photoPreview ? (
                          <img
                            src={photoPreview}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 text-slate-400 group-hover:text-indigo-500">
                            <Upload size={24} className="mb-2" />
                            <span className="text-xs font-medium">
                              Unggah Foto Terbaru <span className="italic font-normal">(Upload Recent Photo)</span>
                            </span>
                            <span className="text-[10px] mt-1">3x4 / 4x6</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section I: Identitas Pribadi */}
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 mb-4 bg-slate-100 py-2 px-4 rounded-lg">
                      I. IDENTITAS PRIBADI{" "}
                      <span className="text-slate-500 font-normal italic">
                        - PERSONAL IDENTITY
                      </span>
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          1. Nama Lengkap{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Full Name)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="full_name"
                          required
                          value={formData.full_name}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          2. Jenis Kelamin{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Sex)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-6">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="sex"
                              value="Laki-laki"
                              checked={formData.sex === "Laki-laki"}
                              onChange={handleInputChange}
                              className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">
                              Laki-laki{" "}
                              <span className="text-slate-400 italic">
                                (Male)
                              </span>
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="sex"
                              value="Perempuan"
                              checked={formData.sex === "Perempuan"}
                              onChange={handleInputChange}
                              className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">
                              Perempuan{" "}
                              <span className="text-slate-400 italic">
                                (Female)
                              </span>
                            </span>
                          </label>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-sm font-semibold text-slate-700 mb-1">
                            3. Tempat Lahir{" "}
                            <span className="text-slate-400 font-normal italic">
                              (Place of Birth)
                            </span>{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            name="place_of_birth"
                            required
                            value={formData.place_of_birth}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-semibold text-slate-700 mb-1">
                            Tanggal Lahir{" "}
                            <span className="text-slate-400 font-normal italic">
                              (Date of Birth)
                            </span>{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          {readOnly ? (
                            <div>
                              <input
                                type="text"
                                readOnly
                                value={formatDateDMY(formData.date_of_birth)}
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                              />
                              {calculateAge(formData.date_of_birth) !== null && (
                                <p className="mt-1 text-xs font-medium text-slate-500">
                                  {calculateAge(formData.date_of_birth)} tahun
                                </p>
                              )}
                            </div>
                          ) : (
                            <input
                              type="date"
                              name="date_of_birth"
                              required
                              value={formData.date_of_birth}
                              onChange={handleInputChange}
                              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          4. Agama{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Religion)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        {readOnly ? (
                          <input
                            type="text"
                            readOnly
                            value={formData.religion || "-"}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                          />
                        ) : (
                          <select
                            name="religion"
                            value={formData.religion}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                          >
                            <option value="">Pilih Agama</option>
                            <option value="Islam">Islam</option>
                            <option value="Kristen Protestan">
                              Kristen Protestan
                            </option>
                            <option value="Kristen Katolik">
                              Kristen Katolik
                            </option>
                            <option value="Hindu">Hindu</option>
                            <option value="Buddha">Buddha</option>
                            <option value="Khonghucu">Khonghucu</option>
                          </select>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          5. Kewarganegaraan{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Nationality)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="nationality"
                          value={formData.nationality}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          6. Suku{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Ethnic)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="ethnic"
                          required
                          value={formData.ethnic}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          7. Hoby{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Hobby)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="hobby"
                          required
                          value={formData.hobby}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          8. Status Perkawinan{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Marital Status)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="marital_status"
                              value="Belum Menikah"
                              checked={
                                formData.marital_status === "Belum Menikah"
                              }
                              onChange={handleInputChange}
                              className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">
                              Belum Menikah{" "}
                              <span className="text-slate-400 italic">
                                (Single)
                              </span>
                            </span>
                          </label>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="marital_status"
                                value="Menikah"
                                checked={formData.marital_status === "Menikah"}
                                onChange={handleInputChange}
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                Menikah{" "}
                                <span className="text-slate-400 italic">
                                  (Married)
                                </span>
                              </span>
                            </label>
                            {formData.marital_status === "Menikah" && (
                              <input
                                type="text"
                                name="marital_since_year"
                                placeholder="Tahun"
                                value={formData.marital_since_year}
                                onChange={handleInputChange}
                                className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="marital_status"
                                value="Janda/Duda"
                                checked={
                                  formData.marital_status === "Janda/Duda"
                                }
                                onChange={handleInputChange}
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                Janda / Duda{" "}
                                <span className="text-slate-400 italic">
                                  (Widow/er)
                                </span>
                              </span>
                            </label>
                            {formData.marital_status === "Janda/Duda" && (
                              <input
                                type="text"
                                name="marital_since_year"
                                placeholder="Tahun"
                                value={formData.marital_since_year}
                                onChange={handleInputChange}
                                className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          9. No. KTP/Passport{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Identity Number)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="identity_number"
                          required
                          value={formData.identity_number}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          10. Alamat Sesuai KTP{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Address Based Identity Card)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          name="address_ktp"
                          rows={2}
                          value={formData.address_ktp}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        ></textarea>
                        <div className="flex justify-end mt-2 items-center gap-2">
                          <span className="text-sm text-slate-600">
                            Kode Pos{" "}
                            <span className="text-slate-400 italic">
                              (Postal Code)
                            </span>{" "}
                            :
                          </span>
                          <input
                            type="text"
                            name="postal_code_ktp"
                            value={formData.postal_code_ktp}
                            onChange={handleInputChange}
                            className="w-32 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          11. Alamat Saat Ini{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Current Address)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        {!readOnly && (
                          <label className="flex items-center gap-2 mb-2 cursor-pointer">
                            <input
                              type="checkbox"
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData((prev) => ({
                                    ...prev,
                                    current_address: prev.address_ktp,
                                    postal_code_current: prev.postal_code_ktp,
                                  }));
                                }
                              }}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-600 italic">
                              Sama dengan Alamat KTP
                            </span>
                          </label>
                        )}
                        <textarea
                          name="current_address"
                          required
                          rows={2}
                          value={formData.current_address}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        ></textarea>
                        <div className="flex justify-end mt-2 items-center gap-2">
                          <span className="text-sm text-slate-600">
                            Kode Pos{" "}
                            <span className="text-slate-400 italic">
                              (Postal Code)
                            </span>{" "}
                            :
                          </span>
                          <input
                            type="text"
                            name="postal_code_current"
                            required
                            value={formData.postal_code_current}
                            onChange={handleInputChange}
                            className="w-32 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          12. Status Tempat Tinggal{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Residential Status)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <div className="flex flex-wrap gap-6">
                          {[
                            "Own House",
                            "Rented House",
                            "Parents",
                            "Others",
                          ].map((status) => (
                            <label
                              key={status}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <input
                                type="radio"
                                name="residential_status"
                                value={status}
                                checked={formData.residential_status === status}
                                onChange={handleInputChange}
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                {status}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          13. Handphone / Telp. Rumah{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Mobile/Home){" "}
                            <span className="text-red-500">*</span>
                          </span>
                        </label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            inputMode="tel"
                            name="mobile_phone"
                            required
                            placeholder="Mobile"
                            value={formData.mobile_phone}
                            onChange={handlePhoneInputChange}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-slate-400">/</span>
                          <input
                            type="text"
                            inputMode="tel"
                            name="home_phone"
                            placeholder="Home"
                            value={formData.home_phone}
                            onChange={handlePhoneInputChange}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          14. Tinggi / Berat Badan{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Height/Weight)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2 items-center">
                          <div className="relative flex-1">
                            <input
                              type="number"
                              name="height"
                              required
                              value={formData.height}
                              onChange={handleInputChange}
                              className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                              Cm
                            </span>
                          </div>
                          <span className="text-slate-400">/</span>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              name="weight"
                              required
                              value={formData.weight}
                              onChange={handleInputChange}
                              className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                              Kg
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          15. Email{" "}
                          <span className="text-slate-400 font-normal italic">
                            (E-Mail)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          name="email"
                          required
                          value={formData.email}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          16. Sosial Media{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Social Media Account)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <div className="space-y-3">
                          {formData.social_media.map((sm, index) => (
                            <div
                              key={index}
                              className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
                            >
                              {readOnly ? (
                                <div className="flex-1 flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                                  {sm.platform ? (
                                    <div
                                      className={cn(
                                        "p-2 rounded-lg text-white",
                                        sm.platform === "LinkedIn" ||
                                          sm.platform === "Facebook"
                                          ? "bg-blue-600 print:bg-blue-600"
                                          : sm.platform === "Instagram"
                                            ? "bg-pink-600 print:bg-pink-600"
                                            : sm.platform === "YouTube"
                                              ? "bg-red-600 print:bg-red-600"
                                              : sm.platform === "Twitter"
                                                ? "bg-slate-900 print:bg-slate-900"
                                                : "bg-indigo-600 print:bg-indigo-600",
                                      )}
                                      style={{
                                        WebkitPrintColorAdjust: "exact",
                                        printColorAdjust: "exact",
                                      }}
                                    >
                                      {sm.platform === "LinkedIn" && (
                                        <Linkedin size={20} />
                                      )}
                                      {sm.platform === "Instagram" && (
                                        <Instagram size={20} />
                                      )}
                                      {sm.platform === "Facebook" && (
                                        <Facebook size={20} />
                                      )}
                                      {sm.platform === "Twitter" && (
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          width="20"
                                          height="20"
                                          viewBox="0 0 24 24"
                                          fill="currentColor"
                                        >
                                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                        </svg>
                                      )}
                                      {sm.platform === "YouTube" && (
                                        <Youtube size={20} />
                                      )}
                                      {sm.platform === "Lainnya" && (
                                        <Link size={20} />
                                      )}
                                    </div>
                                  ) : null}
                                  <div className="flex-1 overflow-hidden">
                                    <a
                                      href={getSocialMediaUrl(sm.platform, sm.account)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => {
                                        const url = getSocialMediaUrl(sm.platform, sm.account);
                                        if (url === "#") return;
                                        // Some mobile browsers/WebViews don't reliably honor
                                        // target="_blank" on anchors and navigate the current
                                        // tab instead — losing all client-side state (expanded
                                        // panels, scroll position) once the user taps "back".
                                        // Explicitly requesting a new browsing context via
                                        // window.open is respected more consistently.
                                        e.preventDefault();
                                        window.open(url, "_blank", "noopener,noreferrer");
                                      }}
                                      className={cn(
                                        "font-medium break-all",
                                        sm.platform === "LinkedIn" ||
                                          sm.platform === "Facebook"
                                          ? "text-blue-600 print:text-blue-600"
                                          : sm.platform === "Instagram"
                                            ? "text-pink-600 print:text-pink-600"
                                            : sm.platform === "YouTube"
                                              ? "text-red-600 print:text-red-600"
                                              : sm.platform === "Twitter"
                                                ? "text-slate-800 print:text-slate-800"
                                                : "text-indigo-600 print:text-indigo-600",
                                      )}
                                    >
                                      {sm.account || "-"}
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex gap-2">
                                    {[
                                      {
                                        id: "LinkedIn",
                                        icon: <Linkedin size={20} />,
                                      },
                                      {
                                        id: "Instagram",
                                        icon: <Instagram size={20} />,
                                      },
                                      {
                                        id: "Facebook",
                                        icon: <Facebook size={20} />,
                                      },
                                      {
                                        id: "Twitter",
                                        icon: (
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                          >
                                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                          </svg>
                                        ),
                                        label: "X",
                                      },
                                      {
                                        id: "YouTube",
                                        icon: <Youtube size={20} />,
                                      },
                                      {
                                        id: "Lainnya",
                                        icon: <Link size={20} />,
                                      },
                                    ].map((platform) => (
                                      <button
                                        key={platform.id}
                                        type="button"
                                        onClick={() =>
                                          handleSocialMediaChange(
                                            index,
                                            "platform",
                                            platform.id,
                                          )
                                        }
                                        className={cn(
                                          "p-2 rounded-lg border transition-colors",
                                          sm.platform === platform.id
                                            ? "bg-indigo-100 border-indigo-300 text-indigo-700 print:border-indigo-300 print:text-indigo-700"
                                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50",
                                        )}
                                        style={
                                          sm.platform === platform.id
                                            ? {
                                                WebkitPrintColorAdjust: "exact",
                                                printColorAdjust: "exact",
                                              }
                                            : {}
                                        }
                                        title={platform.label || platform.id}
                                      >
                                        {platform.icon}
                                      </button>
                                    ))}
                                  </div>
                                  <input
                                    type="text"
                                    placeholder={
                                      sm.platform
                                        ? `Nama Akun / Link ${sm.platform}`
                                        : "Pilih platform lalu isi akun..."
                                    }
                                    value={sm.account}
                                    onChange={(e) =>
                                      handleSocialMediaChange(
                                        index,
                                        "account",
                                        e.target.value,
                                      )
                                    }
                                    className="flex-1 w-full sm:w-auto px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                  {index > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => removeSocialMedia(index)}
                                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                      <Trash2 size={20} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                          {!readOnly && formData.social_media.length < 2 && (
                            <button
                              type="button"
                              onClick={addSocialMedia}
                              className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-1"
                            >
                              <Plus size={16} /> Tambah Sosial Media
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          17. Surat Izin Mengemudi{" "}
                          <span className="text-slate-400 font-normal italic">
                            (Driver License)
                          </span>
                        </label>
                        <div className="flex flex-wrap gap-6 items-center">
                          {["SIM A", "SIM B1", "SIM B2", "SIM C"].map((sim) => (
                            <label
                              key={sim}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={formData.driver_license.includes(sim)}
                                onChange={(e) =>
                                  handleCheckboxChange(
                                    "driver_license",
                                    sim,
                                    e.target.checked,
                                  )
                                }
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                disabled={readOnly}
                              />
                              <span className="text-sm text-slate-700">
                                {sim}
                              </span>
                            </label>
                          ))}
                        </div>
                        {formData.driver_license.length > 0 && (
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {formData.driver_license.map((sim) => (
                              <div
                                key={sim}
                                className="flex items-center gap-3"
                              >
                                <span className="text-sm font-medium text-slate-700 whitespace-nowrap min-w-[80px]">
                                  No. {sim}:
                                </span>
                                {readOnly ? (
                                  <div className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800">
                                    {formData.driver_license_numbers?.[sim] ||
                                      formData.driver_license_number ||
                                      "-"}
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    required
                                    placeholder={`Nomor ${sim}`}
                                    value={
                                      formData.driver_license_numbers?.[sim] ||
                                      ""
                                    }
                                    onChange={(e) => {
                                      const digitsOnly = e.target.value.replace(/\D/g, "");
                                      setFormData((prev) => ({
                                        ...prev,
                                        driver_license_numbers: {
                                          ...prev.driver_license_numbers,
                                          [sim]: digitsOnly,
                                        },
                                      }));
                                    }}
                                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section II: Latar Belakang Keluarga */}
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 mb-4 bg-slate-100 py-2 px-4 rounded-lg">
                      II. LATAR BELAKANG KELUARGA{" "}
                      <span className="text-slate-500 font-normal italic">
                        - FAMILY BACKGROUND
                      </span>
                    </h2>

                    <div className="space-y-8">
                      {/* Table 1: Susunan Anggota Keluarga */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                          1. Susunan Anggota Keluarga{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Family Member)
                          </span>
                          , Termasuk Anda{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Including You)
                          </span>{" "}
                          <span className="text-red-500">
                            *Ayah & Ibu Wajib
                          </span>
                        </h3>
                        <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                          <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                            <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                              <tr>
                                <th className="px-4 py-3 font-semibold w-1/4">
                                  Anggota Keluarga <br />
                                  <span className="text-xs font-normal italic">
                                    (Family Member)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/4">
                                  Nama Lengkap <br />
                                  <span className="text-xs font-normal italic">
                                    (Full Name)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-24">
                                  Usia <br />
                                  <span className="text-xs font-normal italic">
                                    (Age)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5">
                                  Pendidikan <br />
                                  <span className="text-xs font-normal italic">
                                    (Education)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5">
                                  Pekerjaan <br />
                                  <span className="text-xs font-normal italic">
                                    (Occupation)
                                  </span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {formData.family_members.map((member, index) => (
                                <tr key={index} className="hover:bg-slate-50">
                                  <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">
                                    {member.relation}
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={member.name}
                                      onChange={(e) =>
                                        handleFamilyMemberChange(
                                          "family_members",
                                          index,
                                          "name",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={member.age}
                                      onChange={(e) =>
                                        handleFamilyMemberChange(
                                          "family_members",
                                          index,
                                          "age",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={member.education}
                                      onChange={(e) =>
                                        handleFamilyMemberChange(
                                          "family_members",
                                          index,
                                          "education",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0">
                                    <input
                                      type="text"
                                      value={member.occupation}
                                      onChange={(e) =>
                                        handleFamilyMemberChange(
                                          "family_members",
                                          index,
                                          "occupation",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Table 2: Isilah kolom ini bila sudah menikah */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                          2. Isilah kolom ini bila sudah menikah{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Fill this columns if you are married)
                          </span>
                        </h3>
                        <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                          <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                            <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                              <tr>
                                <th className="px-4 py-3 font-semibold w-1/4">
                                  Anggota Keluarga <br />
                                  <span className="text-xs font-normal italic">
                                    (Family Member)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/4">
                                  Nama Lengkap <br />
                                  <span className="text-xs font-normal italic">
                                    (Full Name)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-24">
                                  Usia <br />
                                  <span className="text-xs font-normal italic">
                                    (Age)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5">
                                  Pendidikan <br />
                                  <span className="text-xs font-normal italic">
                                    (Education)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5">
                                  Pekerjaan <br />
                                  <span className="text-xs font-normal italic">
                                    (Occupation)
                                  </span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {formData.married_family_members.map(
                                (member, index) => (
                                  <tr key={index} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">
                                      {member.relation}
                                    </td>
                                    <td className="p-0 border-r border-slate-200">
                                      <input
                                        type="text"
                                        value={member.name}
                                        onChange={(e) =>
                                          handleFamilyMemberChange(
                                            "married_family_members",
                                            index,
                                            "name",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                    <td className="p-0 border-r border-slate-200">
                                      <input
                                        type="text"
                                        value={member.age}
                                        onChange={(e) =>
                                          handleFamilyMemberChange(
                                            "married_family_members",
                                            index,
                                            "age",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center"
                                      />
                                    </td>
                                    <td className="p-0 border-r border-slate-200">
                                      <input
                                        type="text"
                                        value={member.education}
                                        onChange={(e) =>
                                          handleFamilyMemberChange(
                                            "married_family_members",
                                            index,
                                            "education",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                    <td className="p-0">
                                      <input
                                        type="text"
                                        value={member.occupation}
                                        onChange={(e) =>
                                          handleFamilyMemberChange(
                                            "married_family_members",
                                            index,
                                            "occupation",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section III: Pendidikan dan Keterampilan */}
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 mb-4 bg-slate-100 py-2 px-4 rounded-lg">
                      III. PENDIDIKAN DAN KETERAMPILAN{" "}
                      <span className="text-slate-500 font-normal italic">
                        - EDUCATION AND SKILL
                      </span>
                    </h2>

                    <div className="space-y-10">
                      {/* 1. Pendidikan Formal */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                          1. Pendidikan Formal{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Formal Education)
                          </span>{" "}
                          <span className="text-red-500">*Minimal 1</span>
                        </h3>
                        <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                          <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                            <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                              <tr>
                                <th className="px-4 py-3 font-semibold w-1/5">
                                  Tingkat <br />
                                  <span className="text-xs font-normal italic">
                                    (Level)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/4">
                                  Nama Institusi <br />
                                  <span className="text-xs font-normal italic">
                                    (Institutions Name)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5">
                                  Jurusan <br />
                                  <span className="text-xs font-normal italic">
                                    (Major)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-24">
                                  Nilai Akhir <br />
                                  <span className="text-xs font-normal italic">
                                    (Grade)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5">
                                  Masa Pendidikan <br />
                                  <span className="text-xs font-normal italic">
                                    (Education Period)
                                  </span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {formData.formal_education.map((edu, index) => (
                                <tr key={index} className="hover:bg-slate-50">
                                  <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 whitespace-pre-line">
                                    {edu.level}
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={edu.institution}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "formal_education",
                                          index,
                                          "institution",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={edu.major}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "formal_education",
                                          index,
                                          "major",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={edu.grade}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "formal_education",
                                          index,
                                          "grade",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center"
                                    />
                                  </td>
                                  <td className="p-0">
                                    <input
                                      type="text"
                                      value={edu.period}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "formal_education",
                                          index,
                                          "period",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* 2. Pendidikan Non Formal */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                          2. Pendidikan Non Formal{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Non Formal Education)
                          </span>
                        </h3>
                        <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                          <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                            <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                              <tr>
                                <th className="px-4 py-3 font-semibold w-12 text-center">
                                  No
                                </th>
                                <th className="px-4 py-3 font-semibold w-2/5">
                                  Nama Pelatihan/Kursus <br />
                                  <span className="text-xs font-normal italic">
                                    (Training Name)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-2/5">
                                  Nama Institusi <br />
                                  <span className="text-xs font-normal italic">
                                    (Institutions Name)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5 text-center">
                                  Sertifikat (Yes/No)
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {formData.non_formal_education.map(
                                (edu, index) => (
                                  <tr key={index} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 text-center">
                                      {index + 1}
                                    </td>
                                    <td className="p-0 border-r border-slate-200">
                                      <input
                                        type="text"
                                        value={edu.name}
                                        onChange={(e) =>
                                          handleTableChange(
                                            "non_formal_education",
                                            index,
                                            "name",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                    <td className="p-0 border-r border-slate-200">
                                      <input
                                        type="text"
                                        value={edu.institution}
                                        onChange={(e) =>
                                          handleTableChange(
                                            "non_formal_education",
                                            index,
                                            "institution",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                    <td className="p-0">
                                      {readOnly ? (
                                        <div className="w-full h-full px-4 py-2 text-center text-sm">
                                          {edu.certificate || "-"}
                                        </div>
                                      ) : (
                                        <select
                                          value={edu.certificate}
                                          onChange={(e) =>
                                            handleTableChange(
                                              "non_formal_education",
                                              index,
                                              "certificate",
                                              e.target.value,
                                            )
                                          }
                                          className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center appearance-none cursor-pointer"
                                        >
                                          <option value="">-</option>
                                          <option value="Yes">Yes</option>
                                          <option value="No">No</option>
                                        </select>
                                      )}
                                    </td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* 3. Organisasi */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                          3. Organisasi yang pernah Anda ikuti{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Organizations you have Joined)
                          </span>
                        </h3>
                        <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                          <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                            <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                              <tr>
                                <th className="px-4 py-3 font-semibold w-12 text-center">
                                  No
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/3">
                                  Nama Organisasi <br />
                                  <span className="text-xs font-normal italic">
                                    (Organizations Name)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/4">
                                  Jenis Organisasi
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5">
                                  Periode
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5">
                                  Jabatan
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {formData.organizations.map((org, index) => (
                                <tr key={index} className="hover:bg-slate-50">
                                  <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 text-center">
                                    {index + 1}
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={org.name}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "organizations",
                                          index,
                                          "name",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={org.type}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "organizations",
                                          index,
                                          "type",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={org.period}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "organizations",
                                          index,
                                          "period",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0">
                                    <input
                                      type="text"
                                      value={org.position}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "organizations",
                                          index,
                                          "position",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* 4. Penguasaan Bahasa Asing */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-slate-800">
                            4. Penguasaan Bahasa Asing{" "}
                            <span className="text-slate-500 italic font-normal">
                              (Non Mother Tongue Language Ability) Poor / Fair /
                              Good
                            </span>
                          </h3>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={addLanguage}
                              className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1"
                            >
                              <Plus size={14} /> Tambah Bahasa
                            </button>
                          )}
                        </div>
                        <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                          <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left relative">
                            <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                              <tr>
                                <th className="px-4 py-3 font-semibold w-12 text-center">
                                  No
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/4">
                                  Bahasa <br />
                                  <span className="text-xs font-normal italic">
                                    (Languages)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/4 text-center">
                                  Menulis <br />
                                  <span className="text-xs font-normal italic">
                                    (Writing)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/4 text-center">
                                  Membaca <br />
                                  <span className="text-xs font-normal italic">
                                    (Reading)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/4 text-center">
                                  Berbicara <br />
                                  <span className="text-xs font-normal italic">
                                    (Speaking)
                                  </span>
                                </th>
                                {!readOnly && <th className="w-10"></th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {formData.languages.map((lang, index) => (
                                <tr
                                  key={index}
                                  className="hover:bg-slate-50 group"
                                >
                                  <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 text-center">
                                    {index + 1}
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    {index < 2 ? (
                                      <div className="px-4 py-2 font-medium text-slate-700 bg-slate-50 h-full flex items-center">
                                        {lang.language}
                                      </div>
                                    ) : readOnly ? (
                                      <div className="px-4 py-2 text-slate-700 h-full flex items-center">
                                        {lang.language || "-"}
                                      </div>
                                    ) : (
                                      <input
                                        type="text"
                                        value={lang.language}
                                        onChange={(e) =>
                                          handleTableChange(
                                            "languages",
                                            index,
                                            "language",
                                            e.target.value,
                                          )
                                        }
                                        placeholder={
                                          index === 2
                                            ? "Lainnya (Jika ada)"
                                            : "Nama Bahasa"
                                        }
                                        className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    )}
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    {readOnly ? (
                                      <div className="px-4 py-2 text-slate-700 text-center h-full flex items-center justify-center">
                                        {lang.writing || "-"}
                                      </div>
                                    ) : (
                                      <select
                                        value={lang.writing}
                                        onChange={(e) =>
                                          handleTableChange(
                                            "languages",
                                            index,
                                            "writing",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center appearance-none cursor-pointer"
                                      >
                                        <option value=""></option>
                                        <option value="Poor">Poor</option>
                                        <option value="Fair">Fair</option>
                                        <option value="Good">Good</option>
                                      </select>
                                    )}
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    {readOnly ? (
                                      <div className="px-4 py-2 text-slate-700 text-center h-full flex items-center justify-center">
                                        {lang.reading || "-"}
                                      </div>
                                    ) : (
                                      <select
                                        value={lang.reading}
                                        onChange={(e) =>
                                          handleTableChange(
                                            "languages",
                                            index,
                                            "reading",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center appearance-none cursor-pointer"
                                      >
                                        <option value=""></option>
                                        <option value="Poor">Poor</option>
                                        <option value="Fair">Fair</option>
                                        <option value="Good">Good</option>
                                      </select>
                                    )}
                                  </td>
                                  <td className="p-0">
                                    {readOnly ? (
                                      <div className="px-4 py-2 text-slate-700 text-center h-full flex items-center justify-center">
                                        {lang.speaking || "-"}
                                      </div>
                                    ) : (
                                      <select
                                        value={lang.speaking}
                                        onChange={(e) =>
                                          handleTableChange(
                                            "languages",
                                            index,
                                            "speaking",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center appearance-none cursor-pointer"
                                      >
                                        <option value=""></option>
                                        <option value="Poor">Poor</option>
                                        <option value="Fair">Fair</option>
                                        <option value="Good">Good</option>
                                      </select>
                                    )}
                                  </td>
                                  {!readOnly && (
                                    <td className="p-0 text-center align-middle">
                                      {index >= 3 && (
                                        <button
                                          type="button"
                                          onClick={() => removeLanguage(index)}
                                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors focus:opacity-100"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* 5. Penguasaan Keterampilan Tambahan */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-slate-800">
                            5. Penguasaan Keterampilan Tambahan{" "}
                            <span className="text-slate-500 italic font-normal">
                              (Skill Abilities)
                            </span>{" "}
                            <span className="text-xs text-slate-400 font-normal">
                              *Level 1 - 4 menunjukkan rendah ke tinggi
                            </span>
                          </h3>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={addSkill}
                              className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1"
                            >
                              <Plus size={14} /> Tambah Keterampilan
                            </button>
                          )}
                        </div>
                        <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                          <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left relative">
                            <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                              <tr>
                                <th
                                  className="px-4 py-3 font-semibold w-12 text-center"
                                  rowSpan={2}
                                >
                                  No
                                </th>
                                <th
                                  className="px-4 py-3 font-semibold w-1/2"
                                  rowSpan={2}
                                >
                                  Keterampilan{" "}
                                  <span className="text-xs font-normal italic">
                                    (Abilities)
                                  </span>
                                </th>
                                <th
                                  className="px-4 py-2 font-semibold text-center border-b border-indigo-100"
                                  colSpan={4}
                                >
                                  Tingkat Penguasaan{" "}
                                  <span className="text-xs font-normal italic">
                                    (level)
                                  </span>
                                </th>
                                <th
                                  className="px-4 py-3 font-semibold w-1/5 text-center"
                                  rowSpan={2}
                                >
                                  Sertifikat <br />
                                  <span className="text-xs font-normal italic">
                                    (Certificate)
                                  </span>
                                </th>
                                {!readOnly && (
                                  <th className="w-10" rowSpan={2}></th>
                                )}
                              </tr>
                              <tr>
                                <th className="px-2 py-1 font-semibold text-center border-r border-indigo-100 w-12">
                                  1
                                </th>
                                <th className="px-2 py-1 font-semibold text-center border-r border-indigo-100 w-12">
                                  2
                                </th>
                                <th className="px-2 py-1 font-semibold text-center border-r border-indigo-100 w-12">
                                  3
                                </th>
                                <th className="px-2 py-1 font-semibold text-center w-12">
                                  4
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {formData.skills.map((skill, index) => (
                                <tr
                                  key={index}
                                  className="hover:bg-slate-50 group"
                                >
                                  <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 text-center">
                                    {index + 1}
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={skill.ability}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "skills",
                                          index,
                                          "ability",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200 text-center">
                                    <input
                                      type="radio"
                                      name={`skill_level_${index}`}
                                      value="1"
                                      checked={skill.level === "1"}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "skills",
                                          index,
                                          "level",
                                          e.target.value,
                                        )
                                      }
                                      className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200 text-center">
                                    <input
                                      type="radio"
                                      name={`skill_level_${index}`}
                                      value="2"
                                      checked={skill.level === "2"}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "skills",
                                          index,
                                          "level",
                                          e.target.value,
                                        )
                                      }
                                      className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200 text-center">
                                    <input
                                      type="radio"
                                      name={`skill_level_${index}`}
                                      value="3"
                                      checked={skill.level === "3"}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "skills",
                                          index,
                                          "level",
                                          e.target.value,
                                        )
                                      }
                                      className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200 text-center">
                                    <input
                                      type="radio"
                                      name={`skill_level_${index}`}
                                      value="4"
                                      checked={skill.level === "4"}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "skills",
                                          index,
                                          "level",
                                          e.target.value,
                                        )
                                      }
                                      className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="p-0">
                                    {readOnly ? (
                                      <div className="w-full h-full px-4 py-2.5 text-center text-sm">
                                        {skill.certificate || "-"}
                                      </div>
                                    ) : (
                                      <select
                                        value={skill.certificate}
                                        onChange={(e) =>
                                          handleTableChange(
                                            "skills",
                                            index,
                                            "certificate",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-2.5 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center appearance-none cursor-pointer"
                                      >
                                        <option value="">- Pilih -</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                      </select>
                                    )}
                                  </td>
                                  {!readOnly && (
                                    <td className="p-0 text-center align-middle">
                                      {index >= 3 && (
                                        <button
                                          type="button"
                                          onClick={() => removeSkill(index)}
                                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors focus:opacity-100"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section IV: Riwayat Pekerjaan */}
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 mb-4 bg-slate-100 py-2 px-4 rounded-lg">
                      IV. RIWAYAT PEKERJAAN{" "}
                      <span className="text-slate-500 font-normal italic">
                        - WORK HISTORICAL
                      </span>
                    </h2>

                    <div className="space-y-6">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                          1. Isi pengalaman kerja dimulai dari pekerjaan
                          sekarang/terbaru{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Work experience start from the current job/recent
                            work/newest)
                          </span>
                        </h3>

                        <div className="space-y-8">
                          {formData.work_experience.map((exp, index) => (
                            <div
                              key={index}
                              className="border border-slate-200 rounded-xl overflow-hidden print:overflow-visible"
                            >
                              {formData.work_experience.length > 1 && (
                                <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 print:hidden">
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                    Riwayat Pekerjaan #{index + 1}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeWorkExperience(index)}
                                    className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors shrink-0"
                                    title="Hapus riwayat pekerjaan ini"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              )}

                              <div className="overflow-x-auto print:overflow-visible">
                              <table className="w-full min-w-[800px] print:min-w-0 print:min-w-0 text-sm text-left">
                                <tbody className="divide-y divide-slate-200">
                                  <tr className="bg-purple-50">
                                    <td className="px-4 py-3 font-semibold text-slate-800 w-1/3 border-r border-slate-200">
                                      Masa Kerja{" "}
                                      <span className="text-xs font-normal italic">
                                        (Work Period)
                                      </span>
                                    </td>
                                    <td className="px-4 py-2">
                                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                                        <div className="flex items-center gap-2">
                                          <span className="text-slate-500">
                                            Dari:
                                          </span>
                                          {readOnly ? (
                                            <input
                                              type="text"
                                              readOnly
                                              value={formatDateDMY(exp.period_start)}
                                              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none text-sm"
                                            />
                                          ) : (
                                            <input
                                              type="date"
                                              value={exp.period_start}
                                              onChange={(e) =>
                                                handleWorkExperienceChange(
                                                  index,
                                                  "period_start",
                                                  e.target.value,
                                                )
                                              }
                                              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                            />
                                          )}
                                        </div>
                                        <span className="text-slate-400 hidden sm:inline">
                                          s/d
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-slate-500">
                                            Sampai:
                                          </span>
                                          {exp.is_current_job ? (
                                            <span className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500 font-medium whitespace-nowrap">
                                              Saat Ini
                                            </span>
                                          ) : readOnly ? (
                                            <input
                                              type="text"
                                              readOnly
                                              value={formatDateDMY(exp.period_end)}
                                              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none text-sm"
                                            />
                                          ) : (
                                            <input
                                              type="date"
                                              value={exp.period_end}
                                              onChange={(e) =>
                                                handleWorkExperienceChange(
                                                  index,
                                                  "period_end",
                                                  e.target.value,
                                                )
                                              }
                                              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                            />
                                          )}
                                          <label className="flex items-center gap-2 ml-2 cursor-pointer whitespace-nowrap">
                                            <input
                                              type="checkbox"
                                              checked={
                                                exp.is_current_job || false
                                              }
                                              onChange={(e) => {
                                                handleWorkExperienceChange(
                                                  index,
                                                  "is_current_job",
                                                  e.target.checked,
                                                );
                                                if (e.target.checked)
                                                  handleWorkExperienceChange(
                                                    index,
                                                    "period_end",
                                                    "Saat Ini",
                                                  );
                                                else
                                                  handleWorkExperienceChange(
                                                    index,
                                                    "period_end",
                                                    "",
                                                  );
                                              }}
                                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm text-slate-600">
                                              Sampai saat ini
                                            </span>
                                          </label>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">
                                      Nama Perusahaan{" "}
                                      <span className="text-xs font-normal italic">
                                        (Company Name)
                                      </span>
                                    </td>
                                    <td className="p-0">
                                      <input
                                        type="text"
                                        value={exp.company_name}
                                        onChange={(e) =>
                                          handleWorkExperienceChange(
                                            index,
                                            "company_name",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">
                                      Alamat Perusahaan{" "}
                                      <span className="text-xs font-normal italic">
                                        (Company Address)
                                      </span>
                                    </td>
                                    <td className="p-0">
                                      <input
                                        type="text"
                                        value={exp.company_address}
                                        onChange={(e) =>
                                          handleWorkExperienceChange(
                                            index,
                                            "company_address",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">
                                      Bidang Usaha{" "}
                                      <span className="text-xs font-normal italic">
                                        (Business Line)
                                      </span>
                                    </td>
                                    <td className="p-0">
                                      <input
                                        type="text"
                                        value={exp.business_line}
                                        onChange={(e) =>
                                          handleWorkExperienceChange(
                                            index,
                                            "business_line",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">
                                      Jabatan{" "}
                                      <span className="text-xs font-normal italic">
                                        (Current Position)
                                      </span>
                                    </td>
                                    <td className="p-0">
                                      <input
                                        type="text"
                                        value={exp.current_position}
                                        onChange={(e) =>
                                          handleWorkExperienceChange(
                                            index,
                                            "current_position",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">
                                      2. Jabatan Atasan Langsung{" "}
                                      <span className="text-xs font-normal italic">
                                        (Direct Superior Title)
                                      </span>
                                    </td>
                                    <td className="p-0">
                                      <input
                                        type="text"
                                        value={exp.report_directly}
                                        onChange={(e) =>
                                          handleWorkExperienceChange(
                                            index,
                                            "report_directly",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">
                                      Total Karyawan{" "}
                                      <span className="text-xs font-normal italic">
                                        (Total number of employees)
                                      </span>
                                    </td>
                                    <td className="p-0">
                                      <input
                                        type="text"
                                        value={exp.total_employees}
                                        onChange={(e) =>
                                          handleWorkExperienceChange(
                                            index,
                                            "total_employees",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">
                                      Jumlah Bawahan{" "}
                                      <span className="text-xs font-normal italic">
                                        (Number of Sub-Ordinates)
                                      </span>
                                    </td>
                                    <td className="p-0">
                                      <input
                                        type="text"
                                        value={exp.number_of_subordinates}
                                        onChange={(e) =>
                                          handleWorkExperienceChange(
                                            index,
                                            "number_of_subordinates",
                                            e.target.value,
                                          )
                                        }
                                        className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                      />
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 align-top">
                                      Deskripsi Pekerjaan{" "}
                                      <span className="text-xs font-normal italic">
                                        (Job Description)
                                      </span>
                                    </td>
                                    <td className="p-0">
                                      <textarea
                                        value={exp.job_description}
                                        onChange={(e) =>
                                          handleWorkExperienceChange(
                                            index,
                                            "job_description",
                                            e.target.value,
                                          )
                                        }
                                        rows={3}
                                        className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 resize-none"
                                      ></textarea>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 align-top">
                                      Alasan Keluar{" "}
                                      <span className="text-xs font-normal italic">
                                        (Reason for leaving)
                                      </span>
                                    </td>
                                    <td className="p-0">
                                      <textarea
                                        value={exp.reason_for_leaving}
                                        onChange={(e) =>
                                          handleWorkExperienceChange(
                                            index,
                                            "reason_for_leaving",
                                            e.target.value,
                                          )
                                        }
                                        rows={2}
                                        className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 resize-none"
                                      ></textarea>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                              </div>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={addWorkExperience}
                          className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 font-medium rounded-lg hover:bg-indigo-100 transition-colors text-sm"
                        >
                          <Plus size={16} />
                          Tambah Riwayat Pekerjaan
                        </button>
                      </div>

                      {/* Pertanyaan Esai Riwayat Pekerjaan */}
                      <div className="space-y-6 pt-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800 mb-2">
                            2. Prestasi yang pernah dicapai selama bekerja{" "}
                            <span className="text-slate-500 italic font-normal">
                              (achievement & accomplishment in work)?
                            </span>{" "}
                            <span className="text-red-500">*</span>
                          </h3>
                          <textarea
                            name="work_achievements"
                            value={formData.work_achievements}
                            onChange={handleInputChange}
                            rows={3}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          ></textarea>
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800 mb-2">
                            3. Bagaimana respon Anda saat bekerja di bawah
                            tekanan dan dikejar tenggat waktu?{" "}
                            <span className="text-slate-500 italic font-normal">
                              (How do you respond when working under pressure
                              and facing deadlines?)
                            </span>{" "}
                            <span className="text-red-500">*</span>
                          </h3>
                          <textarea
                            name="work_pressure_response"
                            value={formData.work_pressure_response}
                            onChange={handleInputChange}
                            rows={3}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          ></textarea>
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800 mb-2">
                            4. Jelaskan tugas dari posisi yang Anda lamar, dan
                            alasan Anda melamar posisi ini.{" "}
                            <span className="text-slate-500 italic font-normal">
                              (Please explain about the job desc and the reason
                              why you interested in this position.)
                            </span>{" "}
                            <span className="text-red-500">*</span>
                          </h3>
                          <textarea
                            name="job_desc_and_reason"
                            value={formData.job_desc_and_reason}
                            onChange={handleInputChange}
                            rows={3}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          ></textarea>
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800 mb-2">
                            5. Bagaimana strategi Anda agar dapat terus
                            berkembang dan memberikan kontribusi bagi
                            perusahaan?{" "}
                            <span className="text-slate-500 italic font-normal">
                              (What is your strategy to continue to develop and
                              contribute to the company?)
                            </span>{" "}
                            <span className="text-red-500">*</span>
                          </h3>
                          <textarea
                            name="strategy_to_contribute"
                            value={formData.strategy_to_contribute}
                            onChange={handleInputChange}
                            rows={3}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          ></textarea>
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800 mb-2">
                            6. Mengapa Anda tertarik bergabung dengan Waruna
                            Group?{" "}
                            <span className="text-slate-500 italic font-normal">
                              (Why are you interested in joining Waruna Group?)
                            </span>{" "}
                            <span className="text-red-500">*</span>
                          </h3>
                          <textarea
                            name="reason_join_waruna"
                            value={formData.reason_join_waruna}
                            onChange={handleInputChange}
                            rows={3}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          ></textarea>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section V: Keterangan Lainnya */}
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 mb-4 bg-slate-100 py-2 px-4 rounded-lg">
                      V. KETERANGAN LAINNYA{" "}
                      <span className="text-slate-500 font-normal italic">
                        - OTHER INFORMATION
                      </span>
                    </h2>

                    <div className="space-y-8">
                      {/* 1. Sakit Berat */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-2">
                          1. Apakah Anda pernah menderita sakit berat hingga
                          dirawat di rumah sakit{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Have you ever been hospitalized or seriously ill in
                            long time period)?
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </h3>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="flex gap-6 shrink-0">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="hospitalized"
                                value="Tidak"
                                checked={formData.hospitalized === "Tidak"}
                                onChange={handleInputChange}
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                Tidak{" "}
                                <span className="text-slate-400 italic">
                                  / No
                                </span>
                              </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="hospitalized"
                                value="Ya"
                                checked={formData.hospitalized === "Ya"}
                                onChange={handleInputChange}
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                Ya{" "}
                                <span className="text-slate-400 italic">
                                  / Yes
                                </span>
                              </span>
                            </label>
                          </div>
                          {formData.hospitalized === "Ya" && (
                            <div className="flex-1 flex items-center gap-2">
                              <span className="text-sm text-slate-600 whitespace-nowrap">
                                Jelaskan{" "}
                                <span className="text-slate-400 italic">
                                  (please explain)
                                </span>{" "}
                                :
                              </span>
                              <input
                                type="text"
                                name="hospitalized_explain"
                                value={formData.hospitalized_explain}
                                onChange={handleInputChange}
                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 2. Tindak Pidana */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-2">
                          2. Apakah Anda pernah terlibat/menjadi terdakwa dalam
                          tindak pidana/perdata?{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Do you ever have involved in crime/civil issue)?
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </h3>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="flex gap-6 shrink-0">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="crime_involved"
                                value="Tidak"
                                checked={formData.crime_involved === "Tidak"}
                                onChange={handleInputChange}
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                Tidak{" "}
                                <span className="text-slate-400 italic">
                                  / No
                                </span>
                              </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="crime_involved"
                                value="Ya"
                                checked={formData.crime_involved === "Ya"}
                                onChange={handleInputChange}
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                Ya{" "}
                                <span className="text-slate-400 italic">
                                  / Yes
                                </span>
                              </span>
                            </label>
                          </div>
                          {formData.crime_involved === "Ya" && (
                            <div className="flex-1 flex items-center gap-2">
                              <span className="text-sm text-slate-600 whitespace-nowrap">
                                Jelaskan{" "}
                                <span className="text-slate-400 italic">
                                  (please explain)
                                </span>{" "}
                                :
                              </span>
                              <input
                                type="text"
                                name="crime_explain"
                                value={formData.crime_explain}
                                onChange={handleInputChange}
                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 3. Pernah bergabung di Waruna */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-2">
                          3. Apakah Anda pernah bergabung di Waruna Group?{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Do you ever worked in Waruna Group?)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </h3>
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          <div className="flex gap-6 shrink-0 mt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="worked_in_waruna"
                                value="Tidak"
                                checked={formData.worked_in_waruna === "Tidak"}
                                onChange={handleInputChange}
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                Tidak{" "}
                                <span className="text-slate-400 italic">
                                  / No
                                </span>
                              </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="worked_in_waruna"
                                value="Ya"
                                checked={formData.worked_in_waruna === "Ya"}
                                onChange={handleInputChange}
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                Ya{" "}
                                <span className="text-slate-400 italic">
                                  / Yes
                                </span>
                              </span>
                            </label>
                          </div>
                          {formData.worked_in_waruna === "Ya" && (
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600 w-48">
                                  Posisi/Lokasi{" "}
                                  <span className="text-slate-400 italic">
                                    (Position/Location)
                                  </span>
                                </span>
                                <input
                                  type="text"
                                  name="waruna_position"
                                  value={formData.waruna_position}
                                  onChange={handleInputChange}
                                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600 w-48">
                                  Periode{" "}
                                  <span className="text-slate-400 italic">
                                    (Periode)
                                  </span>
                                </span>
                                <input
                                  type="text"
                                  name="waruna_period"
                                  value={formData.waruna_period}
                                  onChange={handleInputChange}
                                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 4. Proses seleksi di perusahaan lain */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-2">
                          4. Apakah Anda sedang proses seleksi di perusahaan
                          lain?{" "}
                          <span className="text-slate-500 italic font-normal">
                            Are you currently applying and being processed at
                            another company?
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </h3>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="flex gap-6 shrink-0">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="applying_other_company"
                                value="Tidak"
                                checked={
                                  formData.applying_other_company === "Tidak"
                                }
                                onChange={handleInputChange}
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                Tidak{" "}
                                <span className="text-slate-400 italic">
                                  / No
                                </span>
                              </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="applying_other_company"
                                value="Ya"
                                checked={
                                  formData.applying_other_company === "Ya"
                                }
                                onChange={handleInputChange}
                                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-slate-700">
                                Ya{" "}
                                <span className="text-slate-400 italic">
                                  / Yes
                                </span>
                              </span>
                            </label>
                          </div>
                          {formData.applying_other_company === "Ya" && (
                            <div className="flex-1 flex items-center gap-2">
                              <span className="text-sm text-slate-600 whitespace-nowrap">
                                Jelaskan{" "}
                                <span className="text-slate-400 italic">
                                  (please explain)
                                </span>{" "}
                                :
                              </span>
                              <input
                                type="text"
                                name="applying_other_explain"
                                value={formData.applying_other_explain}
                                onChange={handleInputChange}
                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 5. Karyawan yang dikenal */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                          5. Apakah ada karyawan/karyawati yang Anda kenal di
                          Waruna Group?{" "}
                          <span className="text-slate-500 italic font-normal">
                            Are there any employees that you know at Waruna
                            Group?
                          </span>
                        </h3>
                        <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                          <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                            <thead className="bg-purple-50 text-indigo-900 border-b border-indigo-100">
                              <tr>
                                <th className="px-4 py-3 font-semibold w-1/3 text-center">
                                  Nama Lengkap{" "}
                                  <span className="text-xs font-normal italic">
                                    (Full Name)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/3 text-center">
                                  Posisi{" "}
                                  <span className="text-xs font-normal italic">
                                    (Position)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/3 text-center">
                                  Hubungan{" "}
                                  <span className="text-xs font-normal italic">
                                    (Relation)
                                  </span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {formData.known_employees.map((emp, index) => (
                                <tr key={index} className="hover:bg-slate-50">
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={emp.name}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "known_employees",
                                          index,
                                          "name",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={emp.position}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "known_employees",
                                          index,
                                          "position",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0">
                                    <input
                                      type="text"
                                      value={emp.relation}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "known_employees",
                                          index,
                                          "relation",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* 6. Referensi */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                          6. Sebutkan 3 kenalan mis. mantan atasan (tidak ada
                          hubungan keluarga) yg dapat memberikan keterangan
                          tentang kinerja Anda /{" "}
                          <span className="text-slate-500 italic font-normal">
                            Please attach 3 references from the people (not
                            family member) that might give the information about
                            you?
                          </span>{" "}
                          <span className="text-red-500">*Minimal 2</span>
                        </h3>
                        <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                          <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                            <thead className="bg-purple-50 text-indigo-900 border-b border-indigo-100">
                              <tr>
                                <th className="px-4 py-3 font-semibold w-1/5 text-center">
                                  Nama Lengkap <br />
                                  <span className="text-xs font-normal italic">
                                    (Full Name)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5 text-center">
                                  No. Telp <br />
                                  <span className="text-xs font-normal italic">
                                    (Telephone)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5 text-center">
                                  Pekerjaan <br />
                                  <span className="text-xs font-normal italic">
                                    (Occupation)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5 text-center">
                                  Nama Perusahaan <br />
                                  <span className="text-xs font-normal italic">
                                    (Company Name)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/5 text-center">
                                  Hubungan <br />
                                  <span className="text-xs font-normal italic">
                                    (Relationship)
                                  </span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {formData.references.map((ref, index) => (
                                <tr key={index} className="hover:bg-slate-50">
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={ref.name}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "references",
                                          index,
                                          "name",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      inputMode="tel"
                                      value={ref.phone}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "references",
                                          index,
                                          "phone",
                                          e.target.value.replace(/[^\d+-]/g, ""),
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={ref.occupation}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "references",
                                          index,
                                          "occupation",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0 border-r border-slate-200">
                                    <input
                                      type="text"
                                      value={ref.company}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "references",
                                          index,
                                          "company",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-0">
                                    <input
                                      type="text"
                                      value={ref.relation}
                                      onChange={(e) =>
                                        handleTableChange(
                                          "references",
                                          index,
                                          "relation",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* 7. Referensi Keluarga Darurat */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                          7. Referensi keluarga yang dapat dihubungi ketika
                          keadaan darurat{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Family member that available to contact in
                            emergency)?
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </h3>
                        <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                          <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                            <thead className="bg-purple-50 text-indigo-900 border-b border-indigo-100">
                              <tr>
                                <th className="px-4 py-3 font-semibold w-1/4 text-center">
                                  Nama{" "}
                                  <span className="text-xs font-normal italic">
                                    (Name)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/4 text-center">
                                  No.HP{" "}
                                  <span className="text-xs font-normal italic">
                                    (Phone Number)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/4 text-center">
                                  Hubungan{" "}
                                  <span className="text-xs font-normal italic">
                                    (relationship)
                                  </span>
                                </th>
                                <th className="px-4 py-3 font-semibold w-1/4 text-center">
                                  Alamat
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              <tr className="hover:bg-slate-50">
                                <td className="p-0 border-r border-slate-200">
                                  <input
                                    type="text"
                                    value={formData.emergency_contact.name}
                                    onChange={(e) =>
                                      handleEmergencyContactChange(
                                        "name",
                                        e.target.value,
                                      )
                                    }
                                    className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                  />
                                </td>
                                <td className="p-0 border-r border-slate-200">
                                  <input
                                    type="text"
                                    inputMode="tel"
                                    value={formData.emergency_contact.phone}
                                    onChange={(e) =>
                                      handleEmergencyContactChange(
                                        "phone",
                                        e.target.value.replace(/[^\d+-]/g, ""),
                                      )
                                    }
                                    className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                  />
                                </td>
                                <td className="p-0 border-r border-slate-200">
                                  <input
                                    type="text"
                                    value={formData.emergency_contact.relation}
                                    onChange={(e) =>
                                      handleEmergencyContactChange(
                                        "relation",
                                        e.target.value,
                                      )
                                    }
                                    className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                  />
                                </td>
                                <td className="p-0">
                                  <input
                                    type="text"
                                    value={formData.emergency_contact.address}
                                    onChange={(e) =>
                                      handleEmergencyContactChange(
                                        "address",
                                        e.target.value,
                                      )
                                    }
                                    className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                                  />
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* 8. Faktor Bertahan Lama */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-2">
                          8. Jelaskan faktor yang membuat anda bertahan lama
                          (loyal) di suatu perusahaan?{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Explain what was the most important thing that
                            retain you in a company?)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </h3>
                        <textarea
                          name="loyal_factor"
                          value={formData.loyal_factor}
                          onChange={handleInputChange}
                          rows={3}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        ></textarea>
                      </div>

                      {/* 9. Faktor Produktivitas */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-2">
                          9. Hal apa yang paling membuat Anda dapat meningkatkan
                          produktivitas kerja?{" "}
                          <span className="text-slate-500 italic font-normal">
                            (What is the most important thing that can increase
                            your work productivity?)
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </h3>
                        <textarea
                          name="productivity_factor"
                          value={formData.productivity_factor}
                          onChange={handleInputChange}
                          rows={3}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        ></textarea>
                      </div>

                      {/* 10. Motivasi Bergabung */}
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                          10. Urutkan berdasarkan skala prioritas dari 1 sampai
                          6 Motivasi Anda bergabung dengan Waruna Group.{" "}
                          <span className="text-slate-500 italic font-normal">
                            (Please arrange from 1 to 6 the motivation to join
                            Waruna Group on below lists).
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3 border border-slate-200 p-4 rounded-xl">
                            <div className="flex items-center gap-3">
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={
                                  formData.motivation_priority.work_location
                                }
                                onChange={(e) =>
                                  handleMotivationPriorityChange(
                                    "work_location",
                                    e.target.value,
                                  )
                                }
                                className="w-12 shrink-0 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                              <span className="text-sm text-slate-700">
                                Lokasi Kerja{" "}
                                <span className="text-slate-400 italic">
                                  (Work Location)
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={formData.motivation_priority.career_path}
                                onChange={(e) =>
                                  handleMotivationPriorityChange(
                                    "career_path",
                                    e.target.value,
                                  )
                                }
                                className="w-12 shrink-0 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                              <span className="text-sm text-slate-700">
                                Jenjang Karir/Status Karyawan{" "}
                                <span className="text-slate-400 italic">
                                  (Career Path/employee status)
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={
                                  formData.motivation_priority
                                    .self_actualization
                                }
                                onChange={(e) =>
                                  handleMotivationPriorityChange(
                                    "self_actualization",
                                    e.target.value,
                                  )
                                }
                                className="w-12 shrink-0 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                              <span className="text-sm text-slate-700">
                                Pengembangan Diri{" "}
                                <span className="text-slate-400 italic">
                                  (Self-Actualization)
                                </span>
                              </span>
                            </div>
                          </div>
                          <div className="space-y-3 border border-slate-200 p-4 rounded-xl">
                            <div className="flex items-center gap-3">
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={formData.motivation_priority.challenge}
                                onChange={(e) =>
                                  handleMotivationPriorityChange(
                                    "challenge",
                                    e.target.value,
                                  )
                                }
                                className="w-12 shrink-0 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                              <span className="text-sm text-slate-700">
                                Tantangan/variasi pekerjaan{" "}
                                <span className="text-slate-400 italic">
                                  (Challenge / task variation)
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={
                                  formData.motivation_priority
                                    .working_environment
                                }
                                onChange={(e) =>
                                  handleMotivationPriorityChange(
                                    "working_environment",
                                    e.target.value,
                                  )
                                }
                                className="w-12 shrink-0 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                              <span className="text-sm text-slate-700">
                                Lingkungan Kerja{" "}
                                <span className="text-slate-400 italic">
                                  (Social Working Environment)
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={
                                  formData.motivation_priority.salary_benefit
                                }
                                onChange={(e) =>
                                  handleMotivationPriorityChange(
                                    "salary_benefit",
                                    e.target.value,
                                  )
                                }
                                className="w-12 shrink-0 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                              />
                              <span className="text-sm text-slate-700">
                                Salary & Benefit{" "}
                                <span className="text-slate-400 italic">
                                  (Compensation & Benefit)
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 11. Kapan mulai bekerja */}
                      <div className="flex flex-col sm:flex-row sm:items-center print:flex-col print:items-stretch gap-4 border border-slate-200 p-4 rounded-xl bg-slate-50">
                        <h3 className="text-sm font-semibold text-slate-800">
                          11. Jika DITERIMA, kapan Anda dapat mulai bekerja{" "}
                          <span className="text-slate-500 italic font-normal">
                            (if you are ACCEPTED, when will you able to join)?
                          </span>{" "}
                          <span className="text-red-500">*</span>
                        </h3>
                        <input
                          type="text"
                          name="join_date"
                          required
                          value={formData.join_date}
                          onChange={handleInputChange}
                          className="flex-1 w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          placeholder="Contoh: 1 Bulan setelah pemberitahuan"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section VI: Dokumen Kelengkapan */}
                  <div className="print:break-before-page">
                    <h2 className="text-lg font-bold text-slate-900 mb-4 bg-slate-100 py-2 px-4 rounded-lg">
                      VI. DOKUMEN KELENGKAPAN{" "}
                      <span className="text-slate-500 font-normal italic">
                        - ATTACHMENTS
                      </span>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">
                          Scan KTP{" "}
                          <span className="text-slate-400 italic">
                            (ID Card)
                          </span>{" "}
                          <span className="text-red-500">*</span>{" "}
                          {!readOnly && (
                            <span className="text-xs text-red-500">
                              Maks. 3MB
                            </span>
                          )}
                        </label>
                        {readOnly ? (
                          renderAttachment(resolvedDocs.ktp_url, "KTP")
                        ) : (
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) =>
                              handleFileChange(e, setKtpFile, "KTP")
                            }
                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          />
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">
                          Scan Ijazah{" "}
                          <span className="text-slate-400 italic">
                            (Certificate)
                          </span>{" "}
                          <span className="text-red-500">*</span>{" "}
                          {!readOnly && (
                            <span className="text-xs text-red-500">
                              Maks. 3MB
                            </span>
                          )}
                        </label>
                        {readOnly ? (
                          renderAttachment(resolvedDocs.ijazah_url, "Ijazah")
                        ) : (
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) =>
                              handleFileChange(e, setIjazahFile, "Ijazah")
                            }
                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          />
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">
                          Scan Transkrip Nilai{" "}
                          <span className="text-slate-400 italic">
                            (Transcript)
                          </span>{" "}
                          <span className="text-red-500">*</span>{" "}
                          {!readOnly && (
                            <span className="text-xs text-red-500">
                              Maks. 3MB
                            </span>
                          )}
                        </label>
                        {readOnly ? (
                          renderAttachment(
                            resolvedDocs.transcript_url,
                            "Transkrip Nilai",
                          )
                        ) : (
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) =>
                              handleFileChange(
                                e,
                                setTranscriptFile,
                                "Transkrip Nilai",
                              )
                            }
                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          />
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">
                          Dokumen Lainnya{" "}
                          <span className="text-slate-400 italic">
                            (Other Documents)
                          </span>{" "}
                          {!readOnly && (
                            <span className="text-xs text-red-500">
                              *Maks. 3 File, masing-masing 3MB
                            </span>
                          )}
                        </label>
                        {readOnly ? (
                          <div className="flex flex-col gap-2">
                            {resolvedDocs.other_doc_url ? (
                              resolvedDocs.other_doc_url
                                .split(",")
                                .map((url: string, index: number) => (
                                  <div key={index}>
                                    {renderAttachment(
                                      url.trim(),
                                      `Dokumen Lainnya ${index + 1}`,
                                    )}
                                  </div>
                                ))
                            ) : (
                              <span className="text-sm text-slate-500">-</span>
                            )}
                          </div>
                        ) : (
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                            onChange={(e) =>
                              handleMultipleFileChange(
                                e,
                                setOtherDocFiles,
                                "Dokumen Lainnya",
                                3,
                              )
                            }
                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Declaration Section */}
                  <div className="mt-12 border-2 border-indigo-100 bg-indigo-50 rounded-2xl p-6 sm:p-8">
                    <div className="text-center space-y-4 mb-8">
                      <p className="text-sm font-medium text-slate-800 leading-relaxed">
                        Dengan ini saya menjamin bahwa jawaban yang saya berikan
                        atas pertanyaan - pertanyaan di atas adalah BENAR adanya
                        dan saya memberikan kuasa kepada PT. Waruna Nusa Sentana
                        untuk mencari keterangan mengenai diri saya, apabila
                        dikemudian hari ternyata Saya memberikan keterangan
                        palsu, maka Saya bersedia diambil tindakan sesuai dengan
                        peraturan yang berlaku.
                      </p>
                      <p className="text-xs text-slate-500 italic leading-relaxed">
                        (Hereby I certify that all of the statements above are
                        CORRECT and give the authorization to PT. Waruna Nusa
                        Sentana to make any inquiries concerning my self, If one
                        day I proved declare the wrong statements of mine, I
                        will accept the criminal procedures as my
                        responsibility).
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-8 border-t border-indigo-100 pt-8">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="declaration_agreed"
                          name="declaration_agreed"
                          required
                          checked={formData.declaration_agreed}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              declaration_agreed: e.target.checked,
                            }))
                          }
                          className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <label
                          htmlFor="declaration_agreed"
                          className="text-sm font-semibold text-slate-700 cursor-pointer select-none"
                        >
                          Saya menyetujui pernyataan di atas{" "}
                          <span className="text-red-500">*</span>
                        </label>
                      </div>

                      <div className="text-center">
                        <p className="text-sm text-slate-600 mb-4">
                          Medan,{" "}
                          {new Date().toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                        <div className="mb-2 border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden relative group">
                          {readOnly ? (
                            resolvedDocs.signature_url ? (
                              <img
                                src={resolvedDocs.signature_url}
                                alt="Signature"
                                className="w-full h-32 sm:w-64 object-contain"
                              />
                            ) : (
                              <div className="w-full h-32 sm:w-64 flex items-center justify-center text-slate-400 text-sm">
                                Tidak ada tanda tangan
                              </div>
                            )
                          ) : (
                            <>
                              <SignatureCanvas
                                ref={sigCanvas}
                                penColor="black"
                                clearOnResize={false}
                                onEnd={() => {
                                  lastSignatureData.current =
                                    sigCanvas.current?.toData() || null;
                                }}
                                canvasProps={{
                                  className:
                                    "w-full h-32 sm:w-64 cursor-crosshair",
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  sigCanvas.current?.clear();
                                  lastSignatureData.current = null;
                                }}
                                className="absolute top-2 right-2 p-1.5 bg-slate-100 text-slate-500 rounded-lg transition-colors hover:bg-red-50 hover:text-red-600 shadow-sm"
                                title="Hapus Tanda Tangan"
                              >
                                <Eraser size={16} />
                              </button>
                              {!sigCanvas.current ||
                              sigCanvas.current.isEmpty() ? (
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 text-sm font-medium">
                                  Tanda Tangan Disini
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800">
                          Nama lengkap & tanda tangan{" "}
                          <span className="text-red-500">*</span>
                        </p>
                        <p className="text-xs text-slate-500 italic mb-2">
                          (Full Name & Signature)
                        </p>
                        {readOnly ? (
                          <p className="text-base font-bold text-slate-900">
                            {initialData?.full_name || "-"}
                          </p>
                        ) : (
                          <p className="text-base font-bold text-slate-900 border-b border-slate-300 inline-block px-4 pb-1">
                            {formData.full_name || "______________________"}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>

            {readOnly && (
              <div
                className="w-full block max-w-4xl mx-auto bg-white p-4 sm:p-8 mt-8 border-t-4 border-slate-100 print:border-none print:break-before-page"
              >
                <h2 className="text-xl font-bold text-slate-900 mb-6 border-b pb-2">
                  LAMPIRAN DOKUMEN
                </h2>
                <div className="space-y-12">
                  {resolvedDocs.ktp_url && (
                    <div className="pdf-avoid-break">
                      <h3 className="font-bold text-slate-700 mb-4">
                        Scan KTP
                      </h3>
                      {resolvedDocs.ktp_url
                        .split("?")[0]
                        .toLowerCase()
                        .endsWith(".pdf") ? (
                        <PdfToImages url={resolvedDocs.ktp_url} title="KTP" />
                      ) : (
                        <img
                          src={resolvedDocs.ktp_url}
                          alt="KTP"
                          className="max-w-full h-auto max-h-[800px] object-contain border border-slate-200 p-2 rounded-lg"
                        />
                      )}
                    </div>
                  )}
                  {resolvedDocs.ijazah_url && (
                    <div className="pdf-avoid-break">
                      <h3 className="font-bold text-slate-700 mb-4">
                        Scan Ijazah
                      </h3>
                      {resolvedDocs.ijazah_url
                        .split("?")[0]
                        .toLowerCase()
                        .endsWith(".pdf") ? (
                        <PdfToImages
                          url={resolvedDocs.ijazah_url}
                          title="Ijazah"
                        />
                      ) : (
                        <img
                          src={resolvedDocs.ijazah_url}
                          alt="Ijazah"
                          className="max-w-full h-auto max-h-[800px] object-contain border border-slate-200 p-2 rounded-lg"
                        />
                      )}
                    </div>
                  )}
                  {resolvedDocs.transcript_url && (
                    <div className="pdf-avoid-break">
                      <h3 className="font-bold text-slate-700 mb-4">
                        Scan Transkrip Nilai
                      </h3>
                      {resolvedDocs.transcript_url
                        .split("?")[0]
                        .toLowerCase()
                        .endsWith(".pdf") ? (
                        <PdfToImages
                          url={resolvedDocs.transcript_url}
                          title="Transkrip Nilai"
                        />
                      ) : (
                        <img
                          src={resolvedDocs.transcript_url}
                          alt="Transkrip"
                          className="max-w-full h-auto max-h-[800px] object-contain border border-slate-200 p-2 rounded-lg"
                        />
                      )}
                    </div>
                  )}
                  {resolvedDocs.other_doc_url && (
                    <div className="pdf-avoid-break">
                      <h3 className="font-bold text-slate-700 mb-4">
                        Dokumen Lainnya
                      </h3>
                      <div className="space-y-8">
                        {resolvedDocs.other_doc_url
                          .split(",")
                          .map((url: string, index: number) => {
                            const trimmedUrl = url.trim();
                            return (
                              <div key={index}>
                                {trimmedUrl
                                  .split("?")[0]
                                  .toLowerCase()
                                  .endsWith(".pdf") ? (
                                  <PdfToImages
                                    url={trimmedUrl}
                                    title={`Dokumen Lainnya ${index + 1}`}
                                  />
                                ) : (
                                  <img
                                    src={trimmedUrl}
                                    alt={`Lainnya ${index + 1}`}
                                    className="max-w-full h-auto max-h-[800px] object-contain border border-slate-200 p-2 rounded-lg"
                                  />
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {!initialData?.ktp_url &&
                    !initialData?.ijazah_url &&
                    !initialData?.transcript_url &&
                    !initialData?.other_doc_url &&
                    (!initialData?.payslip_url || hideSalary) && (
                      <div className="text-slate-500 italic">
                        Tidak ada lampiran dokumen.
                      </div>
                    )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Remuneration Section */}
        {(!readOnly || !hideSalary) && (
          <div
            className={cn(
              "mx-auto bg-white overflow-hidden print:overflow-visible print:shadow-none print:border-none print:mt-8 mt-8",
              readOnly
                ? "w-full rounded-2xl shadow-sm border border-slate-200"
                : "w-full max-w-4xl rounded-2xl shadow-xl",
            )}
            style={
              readOnly && !onlyRemuneration ? { pageBreakBefore: "always" } : {}
            }
          >
            <div className="bg-indigo-600 px-4 sm:px-8 py-4 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <h2 className="text-lg font-bold">LEMBARAN PAKET REMUNERASI</h2>
              <span className="text-indigo-200 text-sm">
                FORM-HC/PST/1114/RO/006
              </span>
            </div>
            <div className="p-4 sm:p-8">
              <fieldset disabled={readOnly} className="space-y-8 min-w-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">
                      Gaji Sekarang / Gaji terakhir saat bekerja{" "}
                      <span className="text-slate-400 font-normal italic">
                        *Diisi jika ada
                      </span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                        Rp.
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        name="current_salary"
                        value={
                          readOnly
                            ? formatCurrencyId(formData.current_salary)
                            : formData.current_salary
                        }
                        onChange={handleSalaryInputChange}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">
                      Gaji Yang Diharapkan{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                        Rp.
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        name="expected_salary"
                        required
                        value={
                          readOnly
                            ? formatCurrencyId(formData.expected_salary)
                            : formData.expected_salary
                        }
                        onChange={handleSalaryInputChange}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">
                    Upload Slip Gaji Terakhir{" "}
                    {!readOnly && <span className="text-red-500">*</span>}{" "}
                    {!readOnly && (
                      <span className="text-xs text-red-500">
                        *Maks. 2 File, masing-masing 3MB
                      </span>
                    )}
                  </label>
                  {readOnly ? (
                    <div className="flex flex-col gap-2">
                      {resolvedDocs.payslip_url ? (
                        resolvedDocs.payslip_url
                          .split(",")
                          .map((url: string, index: number) => (
                            <div key={index}>
                              {renderAttachment(
                                url.trim(),
                                `Slip Gaji ${index + 1}`,
                              )}
                            </div>
                          ))
                      ) : (
                        <span className="text-sm text-slate-500">-</span>
                      )}
                    </div>
                  ) : (
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) =>
                        handleMultipleFileChange(
                          e,
                          setPayslipFiles,
                          "Slip Gaji",
                          2,
                        )
                      }
                      className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden mt-8">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                    <h3 className="font-bold text-slate-700 text-center">
                      Dibuat Oleh,
                    </h3>
                  </div>
                  <div className="p-6 flex flex-col items-center justify-center border-b border-slate-200">
                    <div className="w-full max-w-sm mb-2 border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden relative group">
                      {readOnly ? (
                        resolvedDocs.remuneration_signature_url ? (
                          <img
                            src={resolvedDocs.remuneration_signature_url}
                            alt="Signature"
                            className="w-full h-40 object-contain"
                          />
                        ) : (
                          <div className="w-full h-40 flex items-center justify-center text-slate-400 text-sm">
                            Tidak ada tanda tangan
                          </div>
                        )
                      ) : (
                        <>
                          <SignatureCanvas
                            ref={remunerationSigCanvas}
                            penColor="black"
                            clearOnResize={false}
                            onEnd={() => {
                              lastRemunerationSignatureData.current =
                                remunerationSigCanvas.current?.toData() ||
                                null;
                            }}
                            canvasProps={{
                              className: "w-full h-40 cursor-crosshair",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              remunerationSigCanvas.current?.clear();
                              lastRemunerationSignatureData.current = null;
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-slate-100 text-slate-500 rounded-lg transition-colors hover:bg-red-50 hover:text-red-600 shadow-sm"
                            title="Hapus Tanda Tangan"
                          >
                            <Eraser size={16} />
                          </button>
                          {!remunerationSigCanvas.current ||
                          remunerationSigCanvas.current.isEmpty() ? (
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 text-sm font-medium">
                              Tanda Tangan Disini
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-500">
                      Tanda Tangan <span className="text-red-500">*</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                    <div className="p-4 flex items-center justify-between sm:justify-center gap-4">
                      <span className="text-sm font-bold text-slate-500 sm:hidden">
                        Nama:
                      </span>
                      {readOnly ? (
                        <span className="font-medium text-slate-900 text-center w-full">
                          {initialData?.remuneration_signature_name || "-"}
                        </span>
                      ) : (
                        <input
                          type="text"
                          name="remuneration_signature_name"
                          value={formData.full_name}
                          readOnly
                          placeholder="Nama Lengkap"
                          className="w-full bg-transparent border-none focus:ring-0 text-center font-medium text-slate-900 placeholder-slate-400 cursor-not-allowed"
                        />
                      )}
                    </div>
                    <div className="p-4 flex items-center justify-between sm:justify-center gap-4 bg-slate-50">
                      <span className="text-sm font-bold text-slate-500 sm:hidden">
                        Jabatan:
                      </span>
                      <span className="font-medium text-slate-700 text-center w-full">
                        Calon Karyawan
                      </span>
                    </div>
                    <div className="p-4 flex items-center justify-between sm:justify-center gap-4">
                      <span className="text-sm font-bold text-slate-500 sm:hidden">
                        Tanggal:
                      </span>
                      {readOnly ? (
                        <span className="font-medium text-slate-900 text-center w-full">
                          {formatDateDMY(initialData?.remuneration_signature_date)}
                        </span>
                      ) : (
                        <input
                          type="date"
                          name="remuneration_signature_date"
                          value={formData.remuneration_signature_date}
                          readOnly
                          className="w-full bg-transparent border-none focus:ring-0 text-center font-medium text-slate-900 cursor-not-allowed"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </fieldset>
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="w-full max-w-4xl mx-auto flex justify-end no-print">
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : null}
              {loading ? "Menyimpan..." : "Kirim Formulir"}
            </button>
          </div>
        )}

        {readOnly && !hideSalary && resolvedDocs.payslip_url && (
          <div
            className="w-full block max-w-4xl mx-auto bg-white p-4 sm:p-8 mt-8 border-t-4 border-slate-100 print:border-none print:break-before-page"
          >
            <h2 className="text-xl font-bold text-slate-900 mb-6 border-b pb-2">
              LAMPIRAN SLIP GAJI
            </h2>
            <div className="pdf-avoid-break">
              <div className="space-y-8">
                {resolvedDocs.payslip_url
                  .split(",")
                  .map((url: string, index: number) => {
                    const trimmedUrl = url.trim();
                    return (
                      <div key={index}>
                        {trimmedUrl
                          .split("?")[0]
                          .toLowerCase()
                          .endsWith(".pdf") ? (
                          <PdfToImages
                            url={trimmedUrl}
                            title={`Slip Gaji ${index + 1}`}
                          />
                        ) : (
                          <img
                            src={trimmedUrl}
                            alt={`Slip Gaji ${index + 1}`}
                            className="max-w-full h-auto max-h-[800px] object-contain border border-slate-200 p-2 rounded-lg"
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
