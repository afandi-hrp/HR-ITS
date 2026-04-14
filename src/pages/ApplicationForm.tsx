import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/use-toast';
import { Loader2, Upload, CheckCircle2, Plus, Trash2, Eraser, FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import SignatureCanvas from 'react-signature-canvas';
import { cn, getEmbedUrl } from '../lib/utils';
import { PdfToImages } from '../components/PdfToImages';

interface ApplicationFormProps {
  readOnly?: boolean;
  initialData?: any;
  hideSalary?: boolean;
}

const renderAttachment = (url: string | undefined | null, label: string) => {
  if (!url) return <span className="text-sm text-slate-500">-</span>;
  
  const isPdf = url.split('?')[0].toLowerCase().endsWith('.pdf');
  
  return (
    <div className="mt-2 pdf-avoid-break">
      {isPdf ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm hover:bg-indigo-100 transition-colors border border-indigo-100">
          <FileText size={16} />
          Lihat Dokumen PDF
        </a>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block border border-slate-200 rounded-lg overflow-hidden hover:border-indigo-300 transition-colors max-w-xs bg-slate-50 p-1 no-print">
          <img src={url} alt={label} className="w-full h-auto object-contain max-h-48 rounded" />
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

export default function ApplicationForm({ readOnly = false, initialData = null, hideSalary = false }: ApplicationFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [siteSettings, setSiteSettings] = useState<any>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [ijazahFile, setIjazahFile] = useState<File | null>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [otherDocFiles, setOtherDocFiles] = useState<File[]>([]);
  const [payslipFile, setPayslipFile] = useState<File | null>(null);
  const [token, setToken] = useState('');

  const sigCanvas = useRef<SignatureCanvas>(null);
  const remunerationSigCanvas = useRef<SignatureCanvas>(null);

  useEffect(() => {
    loadSiteSettings();
    if (initialData) {
      // Merge initialData with default formData to ensure all arrays/objects exist
      setFormData(prev => ({ ...prev, ...initialData }));
      if (initialData.photo_url) setPhotoPreview(initialData.photo_url);
    }
  }, [initialData]);

  const loadSiteSettings = async () => {
    try {
      const { data } = await supabase.from('site_settings').select('*').eq('id', 1).single();
      if (data) setSiteSettings(data);
    } catch (err) {
      console.error('Error loading site settings:', err);
    }
  };

  const [formData, setFormData] = useState({
    position: '',
    job_vacancy_info: [] as string[],
    job_vacancy_other: '',
    full_name: '',
    sex: '',
    place_of_birth: '',
    date_of_birth: '',
    religion: '',
    nationality: '',
    ethnic: '',
    hobby: '',
    marital_status: '',
    marital_since_year: '',
    identity_number: '',
    address_ktp: '',
    postal_code_ktp: '',
    current_address: '',
    postal_code_current: '',
    residential_status: '',
    mobile_phone: '',
    home_phone: '',
    height: '',
    weight: '',
    email: '',
    social_media: '',
    driver_license: [] as string[],
    driver_license_number: '',
    family_members: [
      { relation: 'Ayah (Father)', name: '', age: '', education: '', occupation: '' },
      { relation: 'Ibu (Mother)', name: '', age: '', education: '', occupation: '' },
      { relation: 'Anak Pertama (1st Children)', name: '', age: '', education: '', occupation: '' },
      { relation: 'Anak Kedua (2nd Children)', name: '', age: '', education: '', occupation: '' },
      { relation: 'Anak Ketiga (3rd Children)', name: '', age: '', education: '', occupation: '' },
      { relation: 'Anak Keempat (4th Children)', name: '', age: '', education: '', occupation: '' },
    ],
    married_family_members: [
      { relation: 'Suami/Istri (husband/wife)', name: '', age: '', education: '', occupation: '' },
      { relation: 'Anak Pertama (1st Children)', name: '', age: '', education: '', occupation: '' },
      { relation: 'Anak Kedua (2nd Children)', name: '', age: '', education: '', occupation: '' },
      { relation: 'Anak Ketiga (3rd Children)', name: '', age: '', education: '', occupation: '' },
    ],
    formal_education: [
      { level: 'SMA/SMK (High School)', institution: '', major: '', grade: '', period: '' },
      { level: 'Diploma', institution: '', major: '', grade: '', period: '' },
      { level: 'S1 (Degree)', institution: '', major: '', grade: '', period: '' },
      { level: 'S2 (Master)', institution: '', major: '', grade: '', period: '' },
    ],
    non_formal_education: [
      { name: '', institution: '', certificate: '' },
      { name: '', institution: '', certificate: '' },
      { name: '', institution: '', certificate: '' },
    ],
    organizations: [
      { name: '', type: '', period: '', position: '' },
      { name: '', type: '', period: '', position: '' },
      { name: '', type: '', period: '', position: '' },
    ],
    languages: [
      { language: 'English', writing: '', reading: '', speaking: '' },
      { language: 'Hokkien', writing: '', reading: '', speaking: '' },
      { language: 'Lainnya (Jika ada)', writing: '', reading: '', speaking: '' },
    ],
    skills: [
      { ability: '', level: '', certificate: '' },
      { ability: '', level: '', certificate: '' },
      { ability: '', level: '', certificate: '' },
    ],
    work_experience: [
      {
        period_start: '',
        period_end: '',
        company_name: '',
        company_address: '',
        business_line: '',
        current_position: '',
        report_directly: '',
        total_employees: '',
        number_of_subordinates: '',
        job_description: '',
        reason_for_leaving: ''
      }
    ],
    work_achievements: '',
    work_pressure_response: '',
    job_desc_and_reason: '',
    strategy_to_contribute: '',
    reason_join_waruna: '',
    
    hospitalized: '',
    hospitalized_explain: '',
    crime_involved: '',
    crime_explain: '',
    worked_in_waruna: '',
    waruna_position: '',
    waruna_period: '',
    applying_other_company: '',
    applying_other_explain: '',
    
    known_employees: [
      { name: '', position: '', relation: '' },
      { name: '', position: '', relation: '' },
      { name: '', position: '', relation: '' },
    ],
    references: [
      { name: '', phone: '', occupation: '', company: '', relation: '' },
      { name: '', phone: '', occupation: '', company: '', relation: '' },
      { name: '', phone: '', occupation: '', company: '', relation: '' },
    ],
    emergency_contact: {
      name: '',
      phone: '',
      relation: '',
      address: ''
    },
    loyal_factor: '',
    productivity_factor: '',
    motivation_priority: {
      work_location: '',
      career_path: '',
      self_actualization: '',
      challenge: '',
      working_environment: '',
      salary_benefit: ''
    },
    join_date: '',
    declaration_agreed: false,
    
    // Remuneration fields
    current_salary: '',
    expected_salary: '',
    remuneration_signature_name: '',
    remuneration_signature_date: new Date().toISOString().split('T')[0],
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (name: 'job_vacancy_info' | 'driver_license', value: string, checked: boolean) => {
    setFormData(prev => {
      const currentList = prev[name];
      if (checked) {
        return { ...prev, [name]: [...currentList, value] };
      } else {
        return { ...prev, [name]: currentList.filter(item => item !== value) };
      }
    });
  };

  const handleFamilyMemberChange = (type: 'family_members' | 'married_family_members', index: number, field: string, value: string) => {
    setFormData(prev => {
      const updatedMembers = [...prev[type]];
      updatedMembers[index] = { ...updatedMembers[index], [field]: value };
      return { ...prev, [type]: updatedMembers };
    });
  };

  const handleTableChange = (type: 'formal_education' | 'non_formal_education' | 'organizations' | 'languages' | 'skills' | 'known_employees' | 'references', index: number, field: string, value: string) => {
    setFormData(prev => {
      const updatedTable = [...prev[type]] as any[];
      updatedTable[index] = { ...updatedTable[index], [field]: value };
      return { ...prev, [type]: updatedTable };
    });
  };

  const handleEmergencyContactChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      emergency_contact: { ...prev.emergency_contact, [field]: value }
    }));
  };

  const handleMotivationPriorityChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      motivation_priority: { ...prev.motivation_priority, [field]: value }
    }));
  };

  const handleWorkExperienceChange = (index: number, field: string, value: string) => {
    setFormData(prev => {
      const updatedExperience = [...prev.work_experience];
      updatedExperience[index] = { ...updatedExperience[index], [field]: value };
      return { ...prev, work_experience: updatedExperience };
    });
  };

  const addWorkExperience = () => {
    setFormData(prev => ({
      ...prev,
      work_experience: [
        ...prev.work_experience,
        {
          period_start: '',
          period_end: '',
          company_name: '',
          company_address: '',
          business_line: '',
          current_position: '',
          report_directly: '',
          total_employees: '',
          number_of_subordinates: '',
          job_description: '',
          reason_for_leaving: ''
        }
      ]
    }));
  };

  const removeWorkExperience = (index: number) => {
    setFormData(prev => ({
      ...prev,
      work_experience: prev.work_experience.filter((_, i) => i !== index)
    }));
  };

  const addLanguage = () => {
    setFormData(prev => ({
      ...prev,
      languages: [
        ...prev.languages,
        { language: '', writing: '', reading: '', speaking: '' }
      ]
    }));
  };

  const removeLanguage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.filter((_, i) => i !== index)
    }));
  };

  const addSkill = () => {
    setFormData(prev => ({
      ...prev,
      skills: [
        ...prev.skills,
        { ability: '', level: '', certificate: '' }
      ]
    }));
  };

  const removeSkill = (index: number) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== index)
    }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: 'Ukuran File Terlalu Besar',
          description: 'Maksimal ukuran foto adalah 2MB.',
          variant: 'destructive'
        });
        e.target.value = '';
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<File | null>>, label: string) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: 'Ukuran File Terlalu Besar',
          description: `Maksimal ukuran file untuk ${label} adalah 2MB.`,
          variant: 'destructive'
        });
        e.target.value = '';
        return;
      }
      setter(file);
    }
  };

  const handleMultipleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<File[]>>, label: string, maxFiles: number) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      
      if (files.length > maxFiles) {
        toast({
          title: 'Terlalu Banyak File',
          description: `Maksimal ${maxFiles} file untuk ${label}.`,
          variant: 'destructive'
        });
        e.target.value = '';
        return;
      }

      const validFiles: File[] = [];
      for (const file of files) {
        if (file.size > 2 * 1024 * 1024) {
          toast({
            title: 'Ukuran File Terlalu Besar',
            description: `File ${file.name} melebihi 2MB.`,
            variant: 'destructive'
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
    setLoading(true);

    try {
      let photoUrl = '';
      let ktpUrl = '';
      let ijazahUrl = '';
      let transcriptUrl = '';
      let otherDocUrl = '';

      const uploadFile = async (file: File, prefix: string) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${prefix}-${Date.now()}-${uuidv4()}.${fileExt}`;
        const filePath = `candidates/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('candidate-documents')
          .upload(filePath, file);

        if (uploadError) {
          throw new Error(`Gagal mengunggah ${prefix}: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('candidate-documents')
          .getPublicUrl(filePath);

        return publicUrl;
      };

      if (photoFile) photoUrl = await uploadFile(photoFile, 'photo');
      if (ktpFile) ktpUrl = await uploadFile(ktpFile, 'ktp');
      if (ijazahFile) ijazahUrl = await uploadFile(ijazahFile, 'ijazah');
      if (transcriptFile) transcriptUrl = await uploadFile(transcriptFile, 'transcript');
      
      let otherDocUrls: string[] = [];
      if (otherDocFiles.length > 0) {
        for (const file of otherDocFiles) {
          otherDocUrls.push(await uploadFile(file, 'other'));
        }
      }
      otherDocUrl = otherDocUrls.join(',');

      let payslipUrl = '';
      if (payslipFile) payslipUrl = await uploadFile(payslipFile, 'payslip');

      let signatureDataUrl = '';
      if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
        signatureDataUrl = sigCanvas.current.getCanvas().toDataURL('image/png');
      }

      let remunerationSignatureDataUrl = '';
      if (remunerationSigCanvas.current && !remunerationSigCanvas.current.isEmpty()) {
        remunerationSignatureDataUrl = remunerationSigCanvas.current.getCanvas().toDataURL('image/png');
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
        job_vacancy_info: formData.job_vacancy_info.includes('Lainnya') 
          ? [...formData.job_vacancy_info.filter(i => i !== 'Lainnya'), `Lainnya: ${formData.job_vacancy_other}`].join(', ')
          : formData.job_vacancy_info.join(', '),
        driver_license: formData.driver_license.join(', '),
        submitted_at: new Date().toISOString()
      };

      const uid_sheet = uuidv4();

      const { data: rpcData, error: rpcError } = await supabase.rpc('submit_application_with_token', {
        p_token: token,
        p_raw_data: rawData,
        p_uid_sheet: uid_sheet
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      setSuccess(true);
      toast({
        title: 'Berhasil',
        description: 'Formulir lamaran Anda telah berhasil dikirim.',
      });
      
      // Reset form
      window.scrollTo(0, 0);

    } catch (error: any) {
      console.error('Submit error:', error);
      
      let errorMessage = error.message || 'Terjadi kesalahan saat mengirim formulir.';
      
      // Sanitasi pesan error teknis
      if (
        errorMessage.includes('Failed to fetch') || 
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('NetworkError')
      ) {
        errorMessage = 'Gagal terhubung ke server, silakan periksa koneksi Anda dan coba kembali.';
      } else if (errorMessage.includes('Gagal mengunggah')) {
        errorMessage = 'Gagal mengunggah dokumen. Silakan periksa koneksi Anda atau coba file lain.';
      } else if (errorMessage.includes('Token')) {
        // Biarkan pesan terkait token (misal: "Token tidak valid atau sudah digunakan")
      } else {
        // Jika error tidak dikenali dan berpotensi teknis (mengandung bahasa Inggris atau kode), samarkan
        if (/^[a-zA-Z0-9_]+$/.test(errorMessage) || errorMessage.includes('relation') || errorMessage.includes('syntax') || errorMessage.includes('database')) {
           errorMessage = 'Terjadi kesalahan sistem saat memproses formulir Anda. Silakan coba beberapa saat lagi.';
        }
      }

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Terima Kasih!</h2>
          <p className="text-slate-600">Formulir lamaran Anda telah berhasil kami terima. Tim rekrutmen kami akan segera meninjau data Anda.</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all w-full"
          >
            Kirim Lamaran Baru
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-slate-50", readOnly ? "py-0 bg-transparent flex flex-col gap-6" : "min-h-screen py-12 px-4 sm:px-6 lg:px-8")} id="application-form-container">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className={cn("mx-auto bg-white overflow-hidden print:overflow-visible print:shadow-none print:border-none", readOnly ? "w-full rounded-2xl shadow-sm border border-slate-200" : "w-full max-w-4xl rounded-2xl shadow-xl")}>
          <div className="bg-[#8E4585] px-4 sm:px-8 py-4 sm:py-6 text-white flex items-center gap-4">
            {siteSettings?.career_logo_url && (
              <img src={siteSettings.career_logo_url} alt="Logo" className="w-12 h-12 sm:w-16 sm:h-16 object-contain bg-white rounded-xl p-1.5 shadow-sm shrink-0" />
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Formulir Data Pribadi Calon Karyawan</h1>
              <p className="text-fuchsia-100 mt-1 text-sm sm:text-base">Harap isi data berikut dengan lengkap dan benar.</p>
            </div>
          </div>

          <div className="p-4 sm:p-8">
            <fieldset disabled={readOnly} className="space-y-8 min-w-0">
          
          {/* Token Section */}
          {!readOnly && (
            <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl mb-8">
              <label className="block text-sm font-bold text-indigo-900 mb-2">Token Pendaftaran <span className="text-red-500">*</span></label>
              <p className="text-xs text-indigo-700 mb-3">Masukkan token pendaftaran yang telah diberikan oleh tim rekrutmen kami.</p>
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
                <label className="block text-sm font-semibold text-slate-700 mb-1">Posisi yang dilamar <span className="text-slate-400 font-normal italic">(Position applied)</span></label>
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
                <label className="block text-sm font-semibold text-slate-700 mb-2">Info lowongan kerja <span className="text-slate-400 font-normal italic">(Job vacancy information)</span></label>
                <div className="flex flex-wrap gap-4">
                  {['Jobstreet', 'JobsDB', 'Linkedin', 'Instagram', 'Lainnya'].map(item => (
                    <label key={item} className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={formData.job_vacancy_info.includes(item)}
                        onChange={(e) => handleCheckboxChange('job_vacancy_info', item, e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">{item}</span>
                    </label>
                  ))}
                </div>
                {formData.job_vacancy_info.includes('Lainnya') && (
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
              <label className="block text-sm font-semibold text-slate-700 mb-1 text-center">Photo <span className="text-xs font-normal text-red-500">*Maks. 2MB</span></label>
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
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 group-hover:text-indigo-500">
                    <Upload size={24} className="mb-2" />
                    <span className="text-xs font-medium">Upload Photo</span>
                    <span className="text-[10px] mt-1">3x4 / 4x6</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section I: Identitas Pribadi */}
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-4 bg-slate-100 py-2 px-4 rounded-lg">
              I. IDENTITAS PRIBADI <span className="text-slate-500 font-normal italic">- PERSONAL IDENTITY</span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nama Lengkap <span className="text-slate-400 font-normal italic">(Full Name)</span></label>
                <input type="text" name="full_name" required value={formData.full_name} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Jenis Kelamin <span className="text-slate-400 font-normal italic">(Sex)</span></label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="sex" value="Laki-laki" checked={formData.sex === 'Laki-laki'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                    <span className="text-sm text-slate-700">Laki-laki</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="sex" value="Perempuan" checked={formData.sex === 'Perempuan'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                    <span className="text-sm text-slate-700">Perempuan</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Tempat Lahir <span className="text-slate-400 font-normal italic">(Place of Birth)</span></label>
                  <input type="text" name="place_of_birth" required value={formData.place_of_birth} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Tanggal Lahir <span className="text-slate-400 font-normal italic">(Date of Birth)</span></label>
                  <input type="date" name="date_of_birth" required value={formData.date_of_birth} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Agama <span className="text-slate-400 font-normal italic">(Religion)</span></label>
                <input type="text" name="religion" value={formData.religion} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Kewarganegaraan <span className="text-slate-400 font-normal italic">(Nationality)</span></label>
                <input type="text" name="nationality" value={formData.nationality} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Suku <span className="text-slate-400 font-normal italic">(Ethnic)</span></label>
                <input type="text" name="ethnic" value={formData.ethnic} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Hoby <span className="text-slate-400 font-normal italic">(Hobby)</span></label>
                <input type="text" name="hobby" value={formData.hobby} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Status Perkawinan <span className="text-slate-400 font-normal italic">(Marital Status)</span></label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="marital_status" value="Belum Menikah" checked={formData.marital_status === 'Belum Menikah'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                    <span className="text-sm text-slate-700">Belum Menikah <span className="text-slate-400 italic">(Single)</span></span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="marital_status" value="Menikah" checked={formData.marital_status === 'Menikah'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">Menikah <span className="text-slate-400 italic">(Married)</span></span>
                    </label>
                    {formData.marital_status === 'Menikah' && (
                      <input type="text" name="marital_since_year" placeholder="Tahun" value={formData.marital_since_year} onChange={handleInputChange} className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="marital_status" value="Janda/Duda" checked={formData.marital_status === 'Janda/Duda'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">Janda / Duda <span className="text-slate-400 italic">(Widow/er)</span></span>
                    </label>
                    {formData.marital_status === 'Janda/Duda' && (
                      <input type="text" name="marital_since_year" placeholder="Tahun" value={formData.marital_since_year} onChange={handleInputChange} className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    )}
                  </div>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">No. KTP/Passport <span className="text-slate-400 font-normal italic">(Identity Number)</span></label>
                <input type="text" name="identity_number" required value={formData.identity_number} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Alamat Sesuai KTP <span className="text-slate-400 font-normal italic">(Address Based Identity Card)</span></label>
                <textarea name="address_ktp" rows={2} value={formData.address_ktp} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
                <div className="flex justify-end mt-2 items-center gap-2">
                  <span className="text-sm text-slate-600">Kode Pos <span className="text-slate-400 italic">(Postal Code)</span> :</span>
                  <input type="text" name="postal_code_ktp" value={formData.postal_code_ktp} onChange={handleInputChange} className="w-32 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Alamat Saat Ini <span className="text-slate-400 font-normal italic">(Current Address)</span></label>
                <textarea name="current_address" rows={2} value={formData.current_address} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
                <div className="flex justify-end mt-2 items-center gap-2">
                  <span className="text-sm text-slate-600">Kode Pos <span className="text-slate-400 italic">(Postal Code)</span> :</span>
                  <input type="text" name="postal_code_current" value={formData.postal_code_current} onChange={handleInputChange} className="w-32 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Status Tempat Tinggal <span className="text-slate-400 font-normal italic">(Residential Status)</span></label>
                <div className="flex flex-wrap gap-6">
                  {['Own House', 'Rented House', 'Parents', 'Others'].map(status => (
                    <label key={status} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="residential_status" value={status} checked={formData.residential_status === status} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">{status}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Handphone / Telp. Rumah <span className="text-slate-400 font-normal italic">(Mobile/Home)</span></label>
                <div className="flex gap-2 items-center">
                  <input type="text" name="mobile_phone" placeholder="Mobile" value={formData.mobile_phone} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <span className="text-slate-400">/</span>
                  <input type="text" name="home_phone" placeholder="Home" value={formData.home_phone} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tinggi / Berat Badan <span className="text-slate-400 font-normal italic">(Height/Weight)</span></label>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <input type="number" name="height" value={formData.height} onChange={handleInputChange} className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Cm</span>
                  </div>
                  <span className="text-slate-400">/</span>
                  <div className="relative flex-1">
                    <input type="number" name="weight" value={formData.weight} onChange={handleInputChange} className="w-full pl-4 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Kg</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email <span className="text-slate-400 font-normal italic">(E-Mail)</span></label>
                <input type="email" name="email" required value={formData.email} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Sosial Media <span className="text-slate-400 font-normal italic">(Social Media Account)</span></label>
                <input type="text" name="social_media" value={formData.social_media} onChange={handleInputChange} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Surat Izin Mengemudi <span className="text-slate-400 font-normal italic">(Driver License)</span></label>
                <div className="flex flex-wrap gap-6 items-center">
                  {['SIM A', 'SIM B1', 'SIM B2', 'SIM C'].map(sim => (
                    <label key={sim} className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={formData.driver_license.includes(sim)}
                        onChange={(e) => handleCheckboxChange('driver_license', sim, e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">{sim}</span>
                    </label>
                  ))}
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-sm text-slate-600">Nomor SIM <span className="text-slate-400 italic">(license number)</span> :</span>
                    <input type="text" name="driver_license_number" value={formData.driver_license_number} onChange={handleInputChange} className="w-48 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Section II: Latar Belakang Keluarga */}
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-4 bg-slate-100 py-2 px-4 rounded-lg">
              II. LATAR BELAKANG KELUARGA <span className="text-slate-500 font-normal italic">- FAMILY BACKGROUND</span>
            </h2>

            <div className="space-y-8">
              {/* Table 1: Susunan Anggota Keluarga */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">1. Susunan Anggota Keluarga <span className="text-slate-500 italic font-normal">(Family Member)</span>, Termasuk Anda <span className="text-slate-500 italic font-normal">(Including You)</span></h3>
                <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                  <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                    <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                      <tr>
                        <th className="px-4 py-3 font-semibold w-1/4">Anggota Keluarga <br/><span className="text-xs font-normal italic">(Family Member)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/4">Nama Lengkap <br/><span className="text-xs font-normal italic">(Full Name)</span></th>
                        <th className="px-4 py-3 font-semibold w-24">Usia <br/><span className="text-xs font-normal italic">(Age)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5">Pendidikan <br/><span className="text-xs font-normal italic">(Education)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5">Pekerjaan <br/><span className="text-xs font-normal italic">(Occupation)</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formData.family_members.map((member, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">{member.relation}</td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={member.name} onChange={(e) => handleFamilyMemberChange('family_members', index, 'name', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={member.age} onChange={(e) => handleFamilyMemberChange('family_members', index, 'age', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={member.education} onChange={(e) => handleFamilyMemberChange('family_members', index, 'education', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0"><input type="text" value={member.occupation} onChange={(e) => handleFamilyMemberChange('family_members', index, 'occupation', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 2: Isilah kolom ini bila sudah menikah */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">2. Isilah kolom ini bila sudah menikah <span className="text-slate-500 italic font-normal">(Fill this columns if you are married)</span></h3>
                <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                  <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                    <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                      <tr>
                        <th className="px-4 py-3 font-semibold w-1/4">Anggota Keluarga <br/><span className="text-xs font-normal italic">(Family Member)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/4">Nama Lengkap <br/><span className="text-xs font-normal italic">(Full Name)</span></th>
                        <th className="px-4 py-3 font-semibold w-24">Usia <br/><span className="text-xs font-normal italic">(Age)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5">Pendidikan <br/><span className="text-xs font-normal italic">(Education)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5">Pekerjaan <br/><span className="text-xs font-normal italic">(Occupation)</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formData.married_family_members.map((member, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">{member.relation}</td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={member.name} onChange={(e) => handleFamilyMemberChange('married_family_members', index, 'name', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={member.age} onChange={(e) => handleFamilyMemberChange('married_family_members', index, 'age', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={member.education} onChange={(e) => handleFamilyMemberChange('married_family_members', index, 'education', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0"><input type="text" value={member.occupation} onChange={(e) => handleFamilyMemberChange('married_family_members', index, 'occupation', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Section III: Pendidikan dan Keterampilan */}
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-4 bg-slate-100 py-2 px-4 rounded-lg">
              III. PENDIDIKAN DAN KETERAMPILAN <span className="text-slate-500 font-normal italic">- EDUCATION AND SKILL</span>
            </h2>

            <div className="space-y-10">
              
              {/* 1. Pendidikan Formal */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">1. Pendidikan Formal <span className="text-slate-500 italic font-normal">(Formal Education)</span></h3>
                <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                  <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                    <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                      <tr>
                        <th className="px-4 py-3 font-semibold w-1/5">Tingkat <br/><span className="text-xs font-normal italic">(Level)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/4">Nama Institusi <br/><span className="text-xs font-normal italic">(Institutions Name)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5">Jurusan <br/><span className="text-xs font-normal italic">(Major)</span></th>
                        <th className="px-4 py-3 font-semibold w-24">Nilai Akhir <br/><span className="text-xs font-normal italic">(Grade)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5">Masa Pendidikan <br/><span className="text-xs font-normal italic">(Education Period)</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formData.formal_education.map((edu, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 whitespace-pre-line">{edu.level}</td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={edu.institution} onChange={(e) => handleTableChange('formal_education', index, 'institution', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={edu.major} onChange={(e) => handleTableChange('formal_education', index, 'major', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={edu.grade} onChange={(e) => handleTableChange('formal_education', index, 'grade', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center" /></td>
                          <td className="p-0"><input type="text" value={edu.period} onChange={(e) => handleTableChange('formal_education', index, 'period', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. Pendidikan Non Formal */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">2. Pendidikan Non Formal <span className="text-slate-500 italic font-normal">(Non Formal Education)</span></h3>
                <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                  <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                    <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                      <tr>
                        <th className="px-4 py-3 font-semibold w-12 text-center">No</th>
                        <th className="px-4 py-3 font-semibold w-2/5">Nama Pelatihan/Kursus <br/><span className="text-xs font-normal italic">(Training Name)</span></th>
                        <th className="px-4 py-3 font-semibold w-2/5">Nama Institusi <br/><span className="text-xs font-normal italic">(Institutions Name)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5 text-center">Sertifikat (Yes/No)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formData.non_formal_education.map((edu, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 text-center">{index + 1}</td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={edu.name} onChange={(e) => handleTableChange('non_formal_education', index, 'name', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={edu.institution} onChange={(e) => handleTableChange('non_formal_education', index, 'institution', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0"><input type="text" value={edu.certificate} onChange={(e) => handleTableChange('non_formal_education', index, 'certificate', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Organisasi */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">3. Organisasi yang pernah Anda ikuti <span className="text-slate-500 italic font-normal">(Organizations you have Joined)</span></h3>
                <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                  <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                    <thead className="bg-indigo-50 text-indigo-900 border-b border-indigo-100">
                      <tr>
                        <th className="px-4 py-3 font-semibold w-12 text-center">No</th>
                        <th className="px-4 py-3 font-semibold w-1/3">Nama Organisasi <br/><span className="text-xs font-normal italic">(Organizations Name)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/4">Jenis Organisasi</th>
                        <th className="px-4 py-3 font-semibold w-1/5">Periode</th>
                        <th className="px-4 py-3 font-semibold w-1/5">Jabatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formData.organizations.map((org, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 text-center">{index + 1}</td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={org.name} onChange={(e) => handleTableChange('organizations', index, 'name', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={org.type} onChange={(e) => handleTableChange('organizations', index, 'type', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={org.period} onChange={(e) => handleTableChange('organizations', index, 'period', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0"><input type="text" value={org.position} onChange={(e) => handleTableChange('organizations', index, 'position', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. Penguasaan Bahasa Asing */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800">4. Penguasaan Bahasa Asing <span className="text-slate-500 italic font-normal">(Non Mother Tongue Language Ability) Poor / Fair / Good</span></h3>
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
                        <th className="px-4 py-3 font-semibold w-12 text-center">No</th>
                        <th className="px-4 py-3 font-semibold w-1/4">Bahasa <br/><span className="text-xs font-normal italic">(Languages)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/4 text-center">Menulis <br/><span className="text-xs font-normal italic">(Writing)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/4 text-center">Membaca <br/><span className="text-xs font-normal italic">(Reading)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/4 text-center">Berbicara <br/><span className="text-xs font-normal italic">(Speaking)</span></th>
                        {!readOnly && <th className="w-10"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formData.languages.map((lang, index) => (
                        <tr key={index} className="hover:bg-slate-50 group">
                          <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 text-center">{index + 1}</td>
                          <td className="p-0 border-r border-slate-200">
                            {index < 2 ? (
                              <div className="px-4 py-2 font-medium text-slate-700 bg-slate-50 h-full flex items-center">{lang.language}</div>
                            ) : (
                              <input type="text" value={lang.language} onChange={(e) => handleTableChange('languages', index, 'language', e.target.value)} placeholder={index === 2 ? "Lainnya (Jika ada)" : "Nama Bahasa"} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" />
                            )}
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <select value={lang.writing} onChange={(e) => handleTableChange('languages', index, 'writing', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center appearance-none cursor-pointer">
                              <option value=""></option><option value="Poor">Poor</option><option value="Fair">Fair</option><option value="Good">Good</option>
                            </select>
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <select value={lang.reading} onChange={(e) => handleTableChange('languages', index, 'reading', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center appearance-none cursor-pointer">
                              <option value=""></option><option value="Poor">Poor</option><option value="Fair">Fair</option><option value="Good">Good</option>
                            </select>
                          </td>
                          <td className="p-0">
                            <select value={lang.speaking} onChange={(e) => handleTableChange('languages', index, 'speaking', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center appearance-none cursor-pointer">
                              <option value=""></option><option value="Poor">Poor</option><option value="Fair">Fair</option><option value="Good">Good</option>
                            </select>
                          </td>
                          {!readOnly && (
                            <td className="p-0 text-center align-middle">
                              {index >= 3 && (
                                <button type="button" onClick={() => removeLanguage(index)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
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
                  <h3 className="text-sm font-semibold text-slate-800">5. Penguasaan Keterampilan Tambahan <span className="text-slate-500 italic font-normal">(Skill Abilities)</span> <span className="text-xs text-slate-400 font-normal">*Level 1 - 4 menunjukkan rendah ke tinggi</span></h3>
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
                        <th className="px-4 py-3 font-semibold w-12 text-center" rowSpan={2}>No</th>
                        <th className="px-4 py-3 font-semibold w-1/2" rowSpan={2}>Keterampilan <span className="text-xs font-normal italic">(Abilities)</span></th>
                        <th className="px-4 py-2 font-semibold text-center border-b border-indigo-100" colSpan={4}>Tingkat Penguasaan <span className="text-xs font-normal italic">(level)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5 text-center" rowSpan={2}>Sertifikat <br/><span className="text-xs font-normal italic">(Certificate)</span></th>
                        {!readOnly && <th className="w-10" rowSpan={2}></th>}
                      </tr>
                      <tr>
                        <th className="px-2 py-1 font-semibold text-center border-r border-indigo-100 w-12">1</th>
                        <th className="px-2 py-1 font-semibold text-center border-r border-indigo-100 w-12">2</th>
                        <th className="px-2 py-1 font-semibold text-center border-r border-indigo-100 w-12">3</th>
                        <th className="px-2 py-1 font-semibold text-center w-12">4</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formData.skills.map((skill, index) => (
                        <tr key={index} className="hover:bg-slate-50 group">
                          <td className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 text-center">{index + 1}</td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={skill.ability} onChange={(e) => handleTableChange('skills', index, 'ability', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200 text-center">
                            <input type="radio" name={`skill_level_${index}`} value="1" checked={skill.level === '1'} onChange={(e) => handleTableChange('skills', index, 'level', e.target.value)} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer" />
                          </td>
                          <td className="p-0 border-r border-slate-200 text-center">
                            <input type="radio" name={`skill_level_${index}`} value="2" checked={skill.level === '2'} onChange={(e) => handleTableChange('skills', index, 'level', e.target.value)} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer" />
                          </td>
                          <td className="p-0 border-r border-slate-200 text-center">
                            <input type="radio" name={`skill_level_${index}`} value="3" checked={skill.level === '3'} onChange={(e) => handleTableChange('skills', index, 'level', e.target.value)} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer" />
                          </td>
                          <td className="p-0 border-r border-slate-200 text-center">
                            <input type="radio" name={`skill_level_${index}`} value="4" checked={skill.level === '4'} onChange={(e) => handleTableChange('skills', index, 'level', e.target.value)} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer" />
                          </td>
                          <td className="p-0"><input type="text" value={skill.certificate} onChange={(e) => handleTableChange('skills', index, 'certificate', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-center" /></td>
                          {!readOnly && (
                            <td className="p-0 text-center align-middle">
                              {index >= 3 && (
                                <button type="button" onClick={() => removeSkill(index)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
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
              IV. RIWAYAT PEKERJAAN <span className="text-slate-500 font-normal italic">- WORK HISTORICAL</span>
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">1. Isi pengalaman kerja dimulai dari pekerjaan sekarang/terbaru <span className="text-slate-500 italic font-normal">(Work experience start from the current job/recent work/newest)</span></h3>
                
                <div className="space-y-8">
                  {formData.work_experience.map((exp, index) => (
                    <div key={index} className="border border-slate-200 rounded-xl overflow-x-auto print:overflow-visible relative">
                      {formData.work_experience.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => removeWorkExperience(index)}
                          className="absolute top-2 right-2 p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors z-10"
                          title="Hapus riwayat pekerjaan ini"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      
                      <table className="w-full min-w-[800px] print:min-w-0 print:min-w-0 text-sm text-left">
                        <tbody className="divide-y divide-slate-200">
                          <tr className="bg-purple-50">
                            <td className="px-4 py-3 font-semibold text-slate-800 w-1/3 border-r border-slate-200">
                              Masa Kerja <span className="text-xs font-normal italic">(Work Period)</span>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500">Dari:</span>
                                  <input type="date" value={exp.period_start} onChange={(e) => handleWorkExperienceChange(index, 'period_start', e.target.value)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                                </div>
                                <span className="text-slate-400 hidden sm:inline">s/d</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500">Sampai:</span>
                                  <input type="date" value={exp.period_end} onChange={(e) => handleWorkExperienceChange(index, 'period_end', e.target.value)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                                </div>
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">Nama Perusahaan <span className="text-xs font-normal italic">(Company Name)</span></td>
                            <td className="p-0"><input type="text" value={exp.company_name} onChange={(e) => handleWorkExperienceChange(index, 'company_name', e.target.value)} className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">Alamat Perusahaan <span className="text-xs font-normal italic">(Company Address)</span></td>
                            <td className="p-0"><input type="text" value={exp.company_address} onChange={(e) => handleWorkExperienceChange(index, 'company_address', e.target.value)} className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">Bidang Usaha <span className="text-xs font-normal italic">(Business Line)</span></td>
                            <td className="p-0"><input type="text" value={exp.business_line} onChange={(e) => handleWorkExperienceChange(index, 'business_line', e.target.value)} className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">Jabatan <span className="text-xs font-normal italic">(Current Position)</span></td>
                            <td className="p-0"><input type="text" value={exp.current_position} onChange={(e) => handleWorkExperienceChange(index, 'current_position', e.target.value)} className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">Pelaporan Pekerjaan <span className="text-xs font-normal italic">(Report Directly)</span></td>
                            <td className="p-0"><input type="text" value={exp.report_directly} onChange={(e) => handleWorkExperienceChange(index, 'report_directly', e.target.value)} className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">Total Karyawan <span className="text-xs font-normal italic">(Total number of employees)</span></td>
                            <td className="p-0"><input type="text" value={exp.total_employees} onChange={(e) => handleWorkExperienceChange(index, 'total_employees', e.target.value)} className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200">Jumlah Bawahan <span className="text-xs font-normal italic">(Number of Sub-Ordinates)</span></td>
                            <td className="p-0"><input type="text" value={exp.number_of_subordinates} onChange={(e) => handleWorkExperienceChange(index, 'number_of_subordinates', e.target.value)} className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 align-top">Deskripsi Pekerjaan <span className="text-xs font-normal italic">(Job Description)</span></td>
                            <td className="p-0"><textarea value={exp.job_description} onChange={(e) => handleWorkExperienceChange(index, 'job_description', e.target.value)} rows={3} className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 resize-none"></textarea></td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 font-medium text-slate-700 bg-slate-50 border-r border-slate-200 align-top">Alasan Keluar <span className="text-xs font-normal italic">(Reason for leaving)</span></td>
                            <td className="p-0"><textarea value={exp.reason_for_leaving} onChange={(e) => handleWorkExperienceChange(index, 'reason_for_leaving', e.target.value)} rows={2} className="w-full h-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 resize-none"></textarea></td>
                          </tr>
                        </tbody>
                      </table>
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
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">2. Prestasi yang pernah dicapai selama bekerja <span className="text-slate-500 italic font-normal">(achievement & accomplishment in work)?</span></h3>
                  <textarea name="work_achievements" value={formData.work_achievements} onChange={handleInputChange} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">3. Bagaimana respon Anda saat bekerja di bawah tekanan dan dikejar tenggat waktu? <span className="text-slate-500 italic font-normal">(How do you respond when working under pressure and facing deadlines?)</span></h3>
                  <textarea name="work_pressure_response" value={formData.work_pressure_response} onChange={handleInputChange} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">4. Jelaskan tugas dari posisi yang Anda lamar, dan alasan Anda melamar posisi ini. <span className="text-slate-500 italic font-normal">(Please explain about the job desc and the reason why you interested in this position.)</span></h3>
                  <textarea name="job_desc_and_reason" value={formData.job_desc_and_reason} onChange={handleInputChange} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">5. Bagaimana strategi Anda agar dapat terus berkembang dan memberikan kontribusi bagi perusahaan? <span className="text-slate-500 italic font-normal">(What is your strategy to continue to develop and contribute to the company?)</span></h3>
                  <textarea name="strategy_to_contribute" value={formData.strategy_to_contribute} onChange={handleInputChange} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">6. Mengapa Anda tertarik bergabung dengan Waruna Group? <span className="text-slate-500 italic font-normal">(Why are you interested in joining Waruna Group?)</span></h3>
                  <textarea name="reason_join_waruna" value={formData.reason_join_waruna} onChange={handleInputChange} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
                </div>
              </div>
            </div>
          </div>

          {/* Section V: Keterangan Lainnya */}
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-4 bg-slate-100 py-2 px-4 rounded-lg">
              V. KETERANGAN LAINNYA <span className="text-slate-500 font-normal italic">- OTHER INFORMATION</span>
            </h2>

            <div className="space-y-8">
              {/* 1. Sakit Berat */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">1. Apakah Anda pernah menderita sakit berat hingga dirawat di rumah sakit <span className="text-slate-500 italic font-normal">(Have you ever been hospitalized or seriously ill in long time period)?</span></h3>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex gap-6 shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="hospitalized" value="Tidak" checked={formData.hospitalized === 'Tidak'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">Tidak <span className="text-slate-400 italic">/ No</span></span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="hospitalized" value="Ya" checked={formData.hospitalized === 'Ya'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">Ya <span className="text-slate-400 italic">/ Yes</span></span>
                    </label>
                  </div>
                  {formData.hospitalized === 'Ya' && (
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-sm text-slate-600 whitespace-nowrap">Jelaskan <span className="text-slate-400 italic">(please explain)</span> :</span>
                      <input type="text" name="hospitalized_explain" value={formData.hospitalized_explain} onChange={handleInputChange} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Tindak Pidana */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">2. Apakah Anda pernah terlibat/menjadi terdakwa dalam tindak pidana/perdata? <span className="text-slate-500 italic font-normal">(Do you ever have involved in crime/civil issue)?</span></h3>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex gap-6 shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="crime_involved" value="Tidak" checked={formData.crime_involved === 'Tidak'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">Tidak <span className="text-slate-400 italic">/ No</span></span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="crime_involved" value="Ya" checked={formData.crime_involved === 'Ya'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">Ya <span className="text-slate-400 italic">/ Yes</span></span>
                    </label>
                  </div>
                  {formData.crime_involved === 'Ya' && (
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-sm text-slate-600 whitespace-nowrap">Jelaskan <span className="text-slate-400 italic">(please explain)</span> :</span>
                      <input type="text" name="crime_explain" value={formData.crime_explain} onChange={handleInputChange} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Pernah bergabung di Waruna */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">3. Apakah Anda pernah bergabung di Waruna Group? <span className="text-slate-500 italic font-normal">(Do you ever worked in Waruna Group?)</span></h3>
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex gap-6 shrink-0 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="worked_in_waruna" value="Tidak" checked={formData.worked_in_waruna === 'Tidak'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">Tidak <span className="text-slate-400 italic">/ No</span></span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="worked_in_waruna" value="Ya" checked={formData.worked_in_waruna === 'Ya'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">Ya <span className="text-slate-400 italic">/ Yes</span></span>
                    </label>
                  </div>
                  {formData.worked_in_waruna === 'Ya' && (
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 w-48">Posisi/Lokasi <span className="text-slate-400 italic">(Position/Location)</span></span>
                        <input type="text" name="waruna_position" value={formData.waruna_position} onChange={handleInputChange} className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 w-48">Periode <span className="text-slate-400 italic">(Periode)</span></span>
                        <input type="text" name="waruna_period" value={formData.waruna_period} onChange={handleInputChange} className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Proses seleksi di perusahaan lain */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">4. Apakah Anda sedang proses seleksi di perusahaan lain? <span className="text-slate-500 italic font-normal">Are you currently applying and being processed at another company?</span></h3>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex gap-6 shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="applying_other_company" value="Tidak" checked={formData.applying_other_company === 'Tidak'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">Tidak <span className="text-slate-400 italic">/ No</span></span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="applying_other_company" value="Ya" checked={formData.applying_other_company === 'Ya'} onChange={handleInputChange} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">Ya <span className="text-slate-400 italic">/ Yes</span></span>
                    </label>
                  </div>
                  {formData.applying_other_company === 'Ya' && (
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-sm text-slate-600 whitespace-nowrap">Jelaskan <span className="text-slate-400 italic">(please explain)</span> :</span>
                      <input type="text" name="applying_other_explain" value={formData.applying_other_explain} onChange={handleInputChange} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Karyawan yang dikenal */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">5. Apakah ada karyawan/karyawati yang Anda kenal di Waruna Group? <span className="text-slate-500 italic font-normal">Are there any employees that you know at Waruna Group?</span></h3>
                <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                  <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                    <thead className="bg-purple-50 text-indigo-900 border-b border-indigo-100">
                      <tr>
                        <th className="px-4 py-3 font-semibold w-1/3 text-center">Nama Lengkap <span className="text-xs font-normal italic">(Full Name)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/3 text-center">Posisi <span className="text-xs font-normal italic">(Position)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/3 text-center">Hubungan <span className="text-xs font-normal italic">(Relation)</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formData.known_employees.map((emp, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="p-0 border-r border-slate-200"><input type="text" value={emp.name} onChange={(e) => handleTableChange('known_employees', index, 'name', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={emp.position} onChange={(e) => handleTableChange('known_employees', index, 'position', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0"><input type="text" value={emp.relation} onChange={(e) => handleTableChange('known_employees', index, 'relation', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 6. Referensi */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">6. Sebutkan 3 kenalan mis. mantan atasan (tidak ada hubungan keluarga) yg dapat memberikan keterangan tentang kinerja Anda / <span className="text-slate-500 italic font-normal">Please attach 3 references from the people (not family member) that might give the information about you?</span></h3>
                <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                  <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                    <thead className="bg-purple-50 text-indigo-900 border-b border-indigo-100">
                      <tr>
                        <th className="px-4 py-3 font-semibold w-1/5 text-center">Nama Lengkap <br/><span className="text-xs font-normal italic">(Full Name)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5 text-center">No. Telp <br/><span className="text-xs font-normal italic">(Telephone)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5 text-center">Pekerjaan <br/><span className="text-xs font-normal italic">(Occupation)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5 text-center">Nama Perusahaan <br/><span className="text-xs font-normal italic">(Company Name)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/5 text-center">Hubungan <br/><span className="text-xs font-normal italic">(Relationship)</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {formData.references.map((ref, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="p-0 border-r border-slate-200"><input type="text" value={ref.name} onChange={(e) => handleTableChange('references', index, 'name', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={ref.phone} onChange={(e) => handleTableChange('references', index, 'phone', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={ref.occupation} onChange={(e) => handleTableChange('references', index, 'occupation', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0 border-r border-slate-200"><input type="text" value={ref.company} onChange={(e) => handleTableChange('references', index, 'company', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                          <td className="p-0"><input type="text" value={ref.relation} onChange={(e) => handleTableChange('references', index, 'relation', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 7. Referensi Keluarga Darurat */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">7. Referensi keluarga yang dapat dihubungi ketika keadaan darurat <span className="text-slate-500 italic font-normal">(Family member that available to contact in emergency)?</span></h3>
                <div className="overflow-x-auto print:overflow-visible border border-slate-200 rounded-xl">
                  <table className="w-full min-w-[800px] print:min-w-0 text-sm text-left">
                    <thead className="bg-purple-50 text-indigo-900 border-b border-indigo-100">
                      <tr>
                        <th className="px-4 py-3 font-semibold w-1/4 text-center">Nama <span className="text-xs font-normal italic">(Name)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/4 text-center">No.HP <span className="text-xs font-normal italic">(Phone Number)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/4 text-center">Hubungan <span className="text-xs font-normal italic">(relationship)</span></th>
                        <th className="px-4 py-3 font-semibold w-1/4 text-center">Alamat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr className="hover:bg-slate-50">
                        <td className="p-0 border-r border-slate-200"><input type="text" value={formData.emergency_contact.name} onChange={(e) => handleEmergencyContactChange('name', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                        <td className="p-0 border-r border-slate-200"><input type="text" value={formData.emergency_contact.phone} onChange={(e) => handleEmergencyContactChange('phone', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                        <td className="p-0 border-r border-slate-200"><input type="text" value={formData.emergency_contact.relation} onChange={(e) => handleEmergencyContactChange('relation', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                        <td className="p-0"><input type="text" value={formData.emergency_contact.address} onChange={(e) => handleEmergencyContactChange('address', e.target.value)} className="w-full h-full px-4 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500" /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 8. Faktor Bertahan Lama */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">8. Jelaskan faktor yang membuat anda bertahan lama (loyal) di suatu perusahaan? <span className="text-slate-500 italic font-normal">(Explain what was the most important thing that retain you in a company?)</span></h3>
                <textarea name="loyal_factor" value={formData.loyal_factor} onChange={handleInputChange} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
              </div>

              {/* 9. Faktor Produktivitas */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">9. Hal apa yang paling membuat Anda dapat meningkatkan produktivitas kerja? <span className="text-slate-500 italic font-normal">(What is the most important thing that can increase your work productivity?)</span></h3>
                <textarea name="productivity_factor" value={formData.productivity_factor} onChange={handleInputChange} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
              </div>

              {/* 10. Motivasi Bergabung */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">10. Urutkan berdasarkan skala prioritas dari 1 sampai 6 Motivasi Anda bergabung dengan Waruna Group. <span className="text-slate-500 italic font-normal">(Please arrange from 1 to 6 the motivation to join Waruna Group on below lists).</span></h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3 border border-slate-200 p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                      <input type="number" min="1" max="6" value={formData.motivation_priority.work_location} onChange={(e) => handleMotivationPriorityChange('work_location', e.target.value)} className="w-12 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      <span className="text-sm text-slate-700">Lokasi Kerja <span className="text-slate-400 italic">(Work Location)</span></span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="number" min="1" max="6" value={formData.motivation_priority.career_path} onChange={(e) => handleMotivationPriorityChange('career_path', e.target.value)} className="w-12 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      <span className="text-sm text-slate-700">Jenjang Karir/Status Karyawan <span className="text-slate-400 italic">(Career Path/employee status)</span></span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="number" min="1" max="6" value={formData.motivation_priority.self_actualization} onChange={(e) => handleMotivationPriorityChange('self_actualization', e.target.value)} className="w-12 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      <span className="text-sm text-slate-700">Pengembangan Diri <span className="text-slate-400 italic">(Self-Actualization)</span></span>
                    </div>
                  </div>
                  <div className="space-y-3 border border-slate-200 p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                      <input type="number" min="1" max="6" value={formData.motivation_priority.challenge} onChange={(e) => handleMotivationPriorityChange('challenge', e.target.value)} className="w-12 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      <span className="text-sm text-slate-700">Tantangan/variasi pekerjaan <span className="text-slate-400 italic">(Challenge / task variation)</span></span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="number" min="1" max="6" value={formData.motivation_priority.working_environment} onChange={(e) => handleMotivationPriorityChange('working_environment', e.target.value)} className="w-12 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      <span className="text-sm text-slate-700">Lingkungan Kerja <span className="text-slate-400 italic">(Social Working Environment)</span></span>
                    </div>
                    {!hideSalary && (
                      <div className="flex items-center gap-3">
                        <input type="number" min="1" max="6" value={formData.motivation_priority.salary_benefit} onChange={(e) => handleMotivationPriorityChange('salary_benefit', e.target.value)} className="w-12 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                        <span className="text-sm text-slate-700">Salary & Benefit <span className="text-slate-400 italic">(Compensation & Benefit)</span></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 11. Kapan mulai bekerja */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 border border-slate-200 p-4 rounded-xl bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-800">11. Jika DITERIMA, kapan Anda dapat mulai bekerja <span className="text-slate-500 italic font-normal">(if you are ACCEPTED, when will you able to join)?</span></h3>
                <input type="text" name="join_date" value={formData.join_date} onChange={handleInputChange} className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="Contoh: 1 Bulan setelah pemberitahuan" />
              </div>

            </div>
          </div>

          {/* Section VI: Dokumen Kelengkapan */}
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-4 bg-slate-100 py-2 px-4 rounded-lg">
              VI. DOKUMEN KELENGKAPAN <span className="text-slate-500 font-normal italic">- ATTACHMENTS</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Scan KTP <span className="text-slate-400 italic">(ID Card)</span> {!readOnly && <span className="text-xs text-red-500">*Maks. 2MB</span>}</label>
                {readOnly ? (
                  renderAttachment(initialData?.ktp_url, "KTP")
                ) : (
                  <input 
                    type="file" 
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange(e, setKtpFile, 'KTP')}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Scan Ijazah <span className="text-slate-400 italic">(Certificate)</span> {!readOnly && <span className="text-xs text-red-500">*Maks. 2MB</span>}</label>
                {readOnly ? (
                  renderAttachment(initialData?.ijazah_url, "Ijazah")
                ) : (
                  <input 
                    type="file" 
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange(e, setIjazahFile, 'Ijazah')}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Scan Transkrip Nilai <span className="text-slate-400 italic">(Transcript)</span> {!readOnly && <span className="text-xs text-red-500">*Maks. 2MB</span>}</label>
                {readOnly ? (
                  renderAttachment(initialData?.transcript_url, "Transkrip Nilai")
                ) : (
                  <input 
                    type="file" 
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange(e, setTranscriptFile, 'Transkrip Nilai')}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Dokumen Lainnya <span className="text-slate-400 italic">(Other Documents)</span> {!readOnly && <span className="text-xs text-red-500">*Maks. 3 File, masing-masing 2MB</span>}</label>
                {readOnly ? (
                  <div className="flex flex-col gap-2">
                    {initialData?.other_doc_url ? initialData.other_doc_url.split(',').map((url: string, index: number) => (
                      <div key={index}>{renderAttachment(url.trim(), `Dokumen Lainnya ${index + 1}`)}</div>
                    )) : <span className="text-sm text-slate-500">-</span>}
                  </div>
                ) : (
                  <input 
                    type="file" 
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={(e) => handleMultipleFileChange(e, setOtherDocFiles, 'Dokumen Lainnya', 3)}
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
                Dengan ini saya menjamin bahwa jawaban yang saya berikan atas pertanyaan - pertanyaan di atas adalah BENAR adanya dan saya memberikan kuasa kepada PT. Waruna Nusa Sentana untuk mencari keterangan mengenai diri saya, apabila dikemudian hari ternyata Saya memberikan keterangan palsu, maka Saya bersedia diambil tindakan sesuai dengan peraturan yang berlaku.
              </p>
              <p className="text-xs text-slate-500 italic leading-relaxed">
                (Hereby I certify that all of the statements above are CORRECT and give the authorization to PT. Waruna Nusa Sentana to make any inquiries concerning my self, If one day I proved declare the wrong statements of mine, I will accept the criminal procedures as my responsibility).
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
                  onChange={(e) => setFormData(prev => ({ ...prev, declaration_agreed: e.target.checked }))}
                  className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="declaration_agreed" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
                  Saya menyetujui pernyataan di atas
                </label>
              </div>

              <div className="text-center">
                <p className="text-sm text-slate-600 mb-4">
                  Medan, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <div className="mb-2 border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden relative group">
                  {readOnly ? (
                    initialData?.signature_url ? (
                      <img src={initialData.signature_url} alt="Signature" className="w-full h-32 sm:w-64 object-contain" />
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
                        canvasProps={{className: 'w-full h-32 sm:w-64 cursor-crosshair'}}
                      />
                      <button 
                        type="button"
                        onClick={() => sigCanvas.current?.clear()}
                        className="absolute top-2 right-2 p-1.5 bg-slate-100 text-slate-500 rounded-lg transition-colors hover:bg-red-50 hover:text-red-600 shadow-sm"
                        title="Hapus Tanda Tangan"
                      >
                        <Eraser size={16} />
                      </button>
                      {!sigCanvas.current || sigCanvas.current.isEmpty() ? (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 text-sm font-medium">
                          Tanda Tangan Disini
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-800">Nama lengkap & tanda tangan</p>
                <p className="text-xs text-slate-500 italic">(Full Name & Signature)</p>
              </div>
            </div>
          </div>
          </fieldset>
        </div>
      </div>

        {/* Remuneration Section */}
        {(!readOnly || !hideSalary) && (
          <div className={cn("mx-auto bg-white overflow-hidden print:overflow-visible print:shadow-none print:border-none print:mt-8", readOnly ? "w-full rounded-2xl shadow-sm border border-slate-200" : "w-full max-w-4xl rounded-2xl shadow-xl")}>
            <div className="bg-indigo-600 px-4 sm:px-8 py-4 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <h2 className="text-lg font-bold">LEMBARAN PAKET REMUNERASI</h2>
              <span className="text-indigo-200 text-sm">FORM-HC/PST/1114/RO/006</span>
            </div>
            <div className="p-4 sm:p-8">
              <fieldset disabled={readOnly} className="space-y-8 min-w-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Gaji Sekarang / Gaji terakhir saat bekerja <span className="text-slate-400 font-normal italic">*Diisi jika ada</span></label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">Rp.</span>
                      <input 
                        type="text" 
                        name="current_salary"
                        value={formData.current_salary}
                        onChange={handleInputChange}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Gaji Yang Diharapkan <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">Rp.</span>
                      <input 
                        type="text" 
                        name="expected_salary"
                        required
                        value={formData.expected_salary}
                        onChange={handleInputChange}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">Upload Slip Gaji Terakhir <span className="text-slate-400 font-normal italic">*Diisi jika ada</span> {!readOnly && <span className="text-xs text-red-500">*Maks. 2MB</span>}</label>
                  {readOnly ? (
                    initialData?.payslip_url ? (
                      initialData.payslip_url.toLowerCase().includes('.pdf') ? (
                        <div className="w-full h-[400px] border border-slate-200 rounded-xl overflow-hidden bg-slate-50 mt-2">
                          <iframe 
                            src={getEmbedUrl(initialData.payslip_url)} 
                            className="w-full h-full"
                            title="Preview Slip Gaji"
                          />
                        </div>
                      ) : (
                        <div className="mt-2">
                          <a href={initialData.payslip_url} target="_blank" rel="noopener noreferrer" className="block border border-slate-200 rounded-lg overflow-hidden hover:border-indigo-300 transition-colors max-w-md bg-slate-50 p-1">
                            <img src={initialData.payslip_url} alt="Slip Gaji" className="w-full h-auto object-contain max-h-96 rounded" />
                          </a>
                        </div>
                      )
                    ) : (
                      <span className="text-sm text-slate-500">-</span>
                    )
                  ) : (
                    <input 
                      type="file" 
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange(e, setPayslipFile, 'Slip Gaji')}
                      className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                    <h3 className="font-bold text-slate-700 text-center">Dibuat Oleh,</h3>
                  </div>
                  <div className="p-6 flex flex-col items-center justify-center border-b border-slate-200">
                    <div className="w-full max-w-sm mb-2 border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden relative group">
                      {readOnly ? (
                        initialData?.remuneration_signature_url ? (
                          <img src={initialData.remuneration_signature_url} alt="Signature" className="w-full h-40 object-contain" />
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
                            canvasProps={{className: 'w-full h-40 cursor-crosshair'}}
                          />
                          <button 
                            type="button"
                            onClick={() => remunerationSigCanvas.current?.clear()}
                            className="absolute top-2 right-2 p-1.5 bg-slate-100 text-slate-500 rounded-lg transition-colors hover:bg-red-50 hover:text-red-600 shadow-sm"
                            title="Hapus Tanda Tangan"
                          >
                            <Eraser size={16} />
                          </button>
                          {!remunerationSigCanvas.current || remunerationSigCanvas.current.isEmpty() ? (
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 text-sm font-medium">
                              Tanda Tangan Disini
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-500">Tanda Tangan</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                    <div className="p-4 flex items-center justify-between sm:justify-center gap-4">
                      <span className="text-sm font-bold text-slate-500 sm:hidden">Nama:</span>
                      {readOnly ? (
                        <span className="font-medium text-slate-900 text-center w-full">{initialData?.remuneration_signature_name || '-'}</span>
                      ) : (
                        <input 
                          type="text" 
                          name="remuneration_signature_name"
                          value={formData.remuneration_signature_name}
                          onChange={handleInputChange}
                          placeholder="Nama Lengkap"
                          required
                          className="w-full bg-transparent border-none focus:ring-0 text-center font-medium text-slate-900 placeholder-slate-400"
                        />
                      )}
                    </div>
                    <div className="p-4 flex items-center justify-between sm:justify-center gap-4 bg-slate-50">
                      <span className="text-sm font-bold text-slate-500 sm:hidden">Jabatan:</span>
                      <span className="font-medium text-slate-700 text-center w-full">Calon Karyawan</span>
                    </div>
                    <div className="p-4 flex items-center justify-between sm:justify-center gap-4">
                      <span className="text-sm font-bold text-slate-500 sm:hidden">Tanggal:</span>
                      {readOnly ? (
                        <span className="font-medium text-slate-900 text-center w-full">{initialData?.remuneration_signature_date || '-'}</span>
                      ) : (
                        <input 
                          type="date" 
                          name="remuneration_signature_date"
                          value={formData.remuneration_signature_date}
                          onChange={handleInputChange}
                          required
                          className="w-full bg-transparent border-none focus:ring-0 text-center font-medium text-slate-900"
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
              {loading ? <Loader2 className="animate-spin" size={20} /> : null}
              {loading ? 'Menyimpan...' : 'Kirim Formulir'}
            </button>
          </div>
        )}

        {readOnly && (
          <div className="w-full block max-w-4xl mx-auto bg-white p-4 sm:p-8 mt-8 border-t-4 border-slate-100 print:border-none" style={{ pageBreakBefore: 'always' }}>
            <h2 className="text-xl font-bold text-slate-900 mb-6 border-b pb-2">LAMPIRAN DOKUMEN</h2>
            <div className="space-y-12">
              {initialData?.ktp_url && (
                <div className="pdf-avoid-break">
                  <h3 className="font-bold text-slate-700 mb-4">Scan KTP</h3>
                  {initialData.ktp_url.split('?')[0].toLowerCase().endsWith('.pdf') ? (
                    <PdfToImages url={initialData.ktp_url} title="KTP" />
                  ) : (
                    <img src={initialData.ktp_url} alt="KTP" className="max-w-full h-auto max-h-[800px] object-contain border border-slate-200 p-2 rounded-lg" />
                  )}
                </div>
              )}
              {initialData?.ijazah_url && (
                <div className="pdf-avoid-break">
                  <h3 className="font-bold text-slate-700 mb-4">Scan Ijazah</h3>
                  {initialData.ijazah_url.split('?')[0].toLowerCase().endsWith('.pdf') ? (
                    <PdfToImages url={initialData.ijazah_url} title="Ijazah" />
                  ) : (
                    <img src={initialData.ijazah_url} alt="Ijazah" className="max-w-full h-auto max-h-[800px] object-contain border border-slate-200 p-2 rounded-lg" />
                  )}
                </div>
              )}
              {initialData?.transcript_url && (
                <div className="pdf-avoid-break">
                  <h3 className="font-bold text-slate-700 mb-4">Scan Transkrip Nilai</h3>
                  {initialData.transcript_url.split('?')[0].toLowerCase().endsWith('.pdf') ? (
                    <PdfToImages url={initialData.transcript_url} title="Transkrip Nilai" />
                  ) : (
                    <img src={initialData.transcript_url} alt="Transkrip" className="max-w-full h-auto max-h-[800px] object-contain border border-slate-200 p-2 rounded-lg" />
                  )}
                </div>
              )}
              {initialData?.other_doc_url && (
                <div className="pdf-avoid-break">
                  <h3 className="font-bold text-slate-700 mb-4">Dokumen Lainnya</h3>
                  <div className="space-y-8">
                    {initialData.other_doc_url.split(',').map((url: string, index: number) => {
                      const trimmedUrl = url.trim();
                      return (
                        <div key={index}>
                          {trimmedUrl.split('?')[0].toLowerCase().endsWith('.pdf') ? (
                            <PdfToImages url={trimmedUrl} title={`Dokumen Lainnya ${index + 1}`} />
                          ) : (
                            <img src={trimmedUrl} alt={`Lainnya ${index + 1}`} className="max-w-full h-auto max-h-[800px] object-contain border border-slate-200 p-2 rounded-lg" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {!initialData?.ktp_url && !initialData?.ijazah_url && !initialData?.transcript_url && !initialData?.other_doc_url && (
                <div className="text-slate-500 italic">Tidak ada lampiran dokumen.</div>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
