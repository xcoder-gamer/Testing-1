import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Check, 
  Sparkles,
  RefreshCw,
  TrendingDown,
  Info,
  Download
} from 'lucide-react';
import { StudentScholarshipRow } from './types';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (importedData: StudentScholarshipRow[], strategy: 'merge' | 'overwrite') => void;
  userRole: string;
}

const DEFAULT_STUDENT_ROW: Omit<StudentScholarshipRow, 'id'> = {
  region: '',
  center: '',
  building: '',
  studentName: '',
  regNo: '',
  batchName: '',
  class: '',
  scholarship: '',
  mentor: '',
  mentorMailid: '',
  pwid: '',
  whatsappIntimation: false,
  ptmStatus: '',
  parentRemarks: '',
  paymentDate: '',
  discontinueReason: '',
  retentionProbability: '',
  proposedScholarship: '',
  extraScholarshipDemand: false,
  extraScholarshipStatus: '',
  rahStatus: '',
  finalRetentionStatus: '',
  finalScholarship: '',
  counselorName: '',
  counselorPwid: '',
  newRegno: '',
  counselorStatus: ''
};

const HEADER_MAPPINGS: Record<keyof Omit<StudentScholarshipRow, 'id'>, string[]> = {
  region: ['region', 'reg', 'state', 'territory', 'zone'],
  center: ['center', 'branch', 'center name', 'center branch', 'combined center', 'combined_center'],
  building: ['building', 'hub', 'campus', 'building name', 'classroom', 'school', 'infrastructure'],
  studentName: ['student name', 'name', 'student name (stg)', 'student', 'stg name', 'nominee', 'student_name'],
  regNo: ['reg no', 'regno', 'reg_no', 'registration no', 'registration id', 'registration number', 'reg id', 'registration_number'],
  batchName: ['batch name', 'batch', 'class batch', 'batch code', 'batch_name', 'group'],
  class: ['class', 'grade', 'standard', 'studying class', 'std'],
  scholarship: ['scholarship', 'scholarship tier', 'current scholarship', 'applied scholarship', 'original scholarship', 'scholarship_tier', 'discount'],
  mentor: ['mentor', 'mentor name', 'academic mentor', 'mentor_name'],
  mentorMailid: ['mentor mailid', 'mentor mail id', 'mentor email', 'mentor mail', 'mentor_mailid', 'mentor_mail_id'],
  pwid: ['pwid', 'pw id', 'mentor pwid', 'employee id', 'pw user id', 'pw_id', 'pw_user_id'],
  whatsappIntimation: ['whatsapp intimation sent', 'whatsapp sent', 'whatsapp intimation', 'whatsapp msg', 'whatsapp status', 'whatsapp_intimation_sent'],
  ptmStatus: ['ptm status', 'ptm done', 'ptm', 'ptm summary', 'ptm done/not done', 'ptm status by mentor', 'ptm_status'],
  parentRemarks: ['parent remarks', 'parent remarks by mentor', 'remarks', 'mentor remarks', 'feedback', 'parent remark', 'remarks by mentor', 'comments', 'parent_remarks', 'remarks_by_mentor'],
  paymentDate: ['admission date', 'payment date', 'admission date given by parents', 'date', 'admission payment date', 'follow up date/ proposed re-enrolled date', 'follow up date', 'admission_date', 'payment_date'],
  discontinueReason: ['reason why discontinue', 'discontinue reason', 'reason for discontinuation', 'reason to leave', 'reason dropout', 'dropout reason', 'reason of discontinuation', 'discontinue_reason'],
  retentionProbability: ['probability of retention', 'retention probability', 'retention prob', 'probability', 'risk status', 'retention level', 'retention risk', 'retention_probability', 'probability_of_retention'],
  proposedScholarship: ['proposed scholarship', 'extra scholarship demand by parents', 'proposed extra scholarship', 'extra scholarship demand value', 'proposed_scholarship'],
  extraScholarshipDemand: ['extra scholarship demand', 'extra scholarship demand?', 'extra_scholarship_demand'],
  extraScholarshipStatus: ['extra scholarship status', 'approval status', 'status', 'extra scholarship status by central', 'extra_scholarship_status'],
  rahStatus: ['rah status', 'final approval (rah)', 'rah approval status', 'regional head status', 'rah_status'],
  finalRetentionStatus: ['final retention status', 'final retention status by mentor', 'retention status', 'final retention', 'reenrolled by mentor', 're-enrolled by mentor', 'final_retention_status'],
  finalScholarship: ['final scholarship', 'approved scholarship', 'final approved scholarship', 'final_scholarship'],
  counselorName: ['counselor name', 'counselor', 'academic counselor', 'counselor name mapping', 'counselor_name'],
  counselorPwid: ['counselor pwid', 'counselor pw id', 'counselor employee id', 'counselor mail id', 'counselor mailid', 'counselor email', 'counselor_pwid'],
  newRegno: ['new regno', 'new registration', 'new registration id', 'new registration no', 'new_regno'],
  counselorStatus: ['counselor status', 'counselor admission status', 'counselor conversion status', 're-enrolled status', 'counselor_status']
};

export default function ImportModal({ isOpen, onClose, onImport, userRole }: ImportModalProps) {
  const [activeTab, setActiveTab] = useState<'paste' | 'file'>('paste');
  const [pastedText, setPastedText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [parsedData, setParsedData] = useState<Partial<StudentScholarshipRow>[]>([]);
  const [mappingReport, setMappingReport] = useState<{
    total: number;
    validCount: number;
    invalidCount: number;
    columnsFound: string[];
  } | null>(null);
  const [strategy, setStrategy] = useState<'merge' | 'overwrite'>('merge');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download Sample Student CSV
  const handleDownloadSampleCSV = () => {
    try {
      const headers = [
        'region',
        'center',
        'building',
        'studentName',
        'regNo',
        'batchName',
        'class',
        'scholarship',
        'mentor',
        'mentorMailid',
        'pwid',
        'whatsappIntimation',
        'ptmStatus',
        'parentRemarks',
        'paymentDate',
        'discontinueReason',
        'retentionProbability',
        'proposedScholarship',
        'extraScholarshipDemand',
        'extraScholarshipStatus',
        'finalRetentionStatus',
        'finalScholarship',
        'counselorName',
        'counselorPwid',
        'newRegno'
      ];
      const samples = [
        [
          'PB + J&K',
          'Anantnag Vidyapeeth',
          'Anantnag Vidyapeeth',
          'Midhat Altaf',
          '23156886',
          '90-UF101ES',
          '10th',
          'Flat 15k',
          'Umar Sir',
          'umar.lone@pw.live',
          'Pw30917',
          'false',
          'Completed PTM',
          'Agreed to pay by next month',
          '2026-04-12',
          '',
          'High',
          '',
          'false',
          '',
          'Retained',
          'Flat 15k',
          'Anil Kumar',
          'Pw20311',
          ''
        ],
        [
          'PB + J&K',
          'Anantnag Vidyapeeth',
          'Anantnag Vidyapeeth',
          'Aarfa Tabasum',
          '23180367',
          '90-UF101ES',
          '10th',
          'Flat 15k',
          'Umar Sir',
          'umar.lone@pw.live',
          'Pw30917',
          'false',
          'Pending PTM',
          'Demanding extra 10% discount',
          '',
          '',
          'Medium',
          'Flat 20k',
          'true',
          'Pending',
          'Under Discussion',
          '',
          'Sunita Sharma',
          'Pw20544',
          ''
        ],
        [
          'PB + J&K',
          'Pulwama Tuition Center',
          'Pulwama Tuition Center',
          'Zikrat Un Nisa',
          '23180670',
          'T44-UF21ES',
          '10th',
          '100% on Tuition Fees',
          'Umar Sir',
          'umar.sir@pw.live',
          'Pw30917',
          'true',
          'Completed PTM',
          'Will join new session',
          '2026-04-15',
          '',
          'High',
          '',
          'false',
          '',
          'Retained',
          '100%',
          'Anil Kumar',
          'Pw20311',
          ''
        ]
      ];
      const csvContent = [headers.join(','), ...samples.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');
      const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "pw_students_sample.csv");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error(err);
      alert("Failed to download sample student CSV.");
    }
  };

  // Download Sample Student JSON
  const handleDownloadSampleJSON = () => {
    try {
      const samples = [
        {
          region: 'PB + J&K',
          center: 'Anantnag Vidyapeeth',
          building: 'Anantnag Vidyapeeth',
          studentName: 'Midhat Altaf',
          regNo: '23156886',
          batchName: '90-UF101ES',
          class: '10th',
          scholarship: 'Flat 15k',
          mentor: 'Umar Sir',
          mentorMailid: 'umar.lone@pw.live',
          pwid: 'Pw30917',
          whatsappIntimation: false,
          ptmStatus: 'Completed PTM',
          parentRemarks: 'Agreed to pay by next month',
          paymentDate: '2026-04-12',
          discontinueReason: '',
          retentionProbability: 'High',
          proposedScholarship: '',
          extraScholarshipDemand: false,
          extraScholarshipStatus: '',
          finalRetentionStatus: 'Retained',
          finalScholarship: 'Flat 15k',
          counselorName: 'Anil Kumar',
          counselorPwid: 'Pw20311',
          newRegno: ''
        },
        {
          region: 'PB + J&K',
          center: 'Anantnag Vidyapeeth',
          building: 'Anantnag Vidyapeeth',
          studentName: 'Aarfa Tabasum',
          regNo: '23180367',
          batchName: '90-UF101ES',
          class: '10th',
          scholarship: 'Flat 15k',
          mentor: 'Umar Sir',
          mentorMailid: 'umar.lone@pw.live',
          pwid: 'Pw30917',
          whatsappIntimation: false,
          ptmStatus: 'Pending PTM',
          parentRemarks: 'Demanding extra 10% discount',
          paymentDate: '',
          discontinueReason: '',
          retentionProbability: 'Medium',
          proposedScholarship: 'Flat 20k',
          extraScholarshipDemand: true,
          extraScholarshipStatus: 'Pending',
          finalRetentionStatus: 'Under Discussion',
          finalScholarship: '',
          counselorName: 'Sunita Sharma',
          counselorPwid: 'Pw20544',
          newRegno: ''
        }
      ];
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(samples, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "pw_students_sample.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error(err);
      alert("Failed to download sample student JSON.");
    }
  };

  if (!isOpen) return null;

  const parseCSVLine = (line: string, delim: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delim && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map(cell => {
      let cleaned = cell;
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }
      return cleaned.replace(/""/g, '"');
    });
  };

  const splitCSVIntoLines = (textStr: string): string[] => {
    const linesList: string[] = [];
    let currentLine = '';
    let inQuotes = false;
    for (let i = 0; i < textStr.length; i++) {
      const char = textStr[i];
      const nextChar = textStr[i + 1];
      if (char === '"') {
        inQuotes = !inQuotes;
        currentLine += char;
      } else if (char === '\r') {
        if (nextChar === '\n') {
          if (inQuotes) {
            currentLine += '\r\n';
            i++;
          } else {
            linesList.push(currentLine);
            currentLine = '';
            i++;
          }
        } else {
          if (inQuotes) {
            currentLine += '\r';
          } else {
            linesList.push(currentLine);
            currentLine = '';
          }
        }
      } else if (char === '\n') {
        if (inQuotes) {
          currentLine += '\n';
        } else {
          linesList.push(currentLine);
          currentLine = '';
        }
      } else {
        currentLine += char;
      }
    }
    if (currentLine) {
      linesList.push(currentLine);
    }
    return linesList;
  };

  const processContent = (text: string, isJSON = false) => {
    if (!text || !text.trim()) {
      setParsedData([]);
      setMappingReport(null);
      return;
    }

    try {
      if (isJSON) {
        const parsed = JSON.parse(text);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const loaded: Partial<StudentScholarshipRow>[] = rows.map((row: any) => {
          return {
            ...DEFAULT_STUDENT_ROW,
            ...row,
            regNo: String(row.regNo || row.registrationNo || row.regno || '').trim()
          };
        });

        const valid = loaded.filter(r => r.regNo);
        setParsedData(loaded);
        setMappingReport({
          total: loaded.length,
          validCount: valid.length,
          invalidCount: loaded.length - valid.length,
          columnsFound: Object.keys(rows[0] || {})
        });
        return;
      }

      // CSV/TSV Parsing
      const lines = splitCSVIntoLines(text).map(l => l.trim()).filter(l => l !== '');
      if (lines.length === 0) return;

      const firstLine = lines[0];
      const commaCount = (firstLine.match(/,/g) || []).length;
      const tabCount = (firstLine.match(/\t/g) || []).length;
      const delim = tabCount > commaCount ? '\t' : ',';

      // Parse headers
      const headers = parseCSVLine(lines[0], delim).map(h => h.trim().toLowerCase());
      const discoveredColumns: string[] = [];

      const rows: Partial<StudentScholarshipRow>[] = [];

      // Helper function to normalize text for extremely robust mapping
      const normalizeText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

      for (let i = 1; i < lines.length; i++) {
        const cells = parseCSVLine(lines[i], delim);
        if (cells.length === 1 && cells[0] === '') continue;

        const rawRowObj: Record<string, string> = {};
        headers.forEach((header, idx) => {
          if (idx < cells.length) {
            rawRowObj[header] = cells[idx];
          }
        });

        const mapped: Partial<StudentScholarshipRow> = { ...DEFAULT_STUDENT_ROW };

        // Match headers to keys with normalize protection
        Object.entries(HEADER_MAPPINGS).forEach(([fieldKey, aliases]) => {
          const matchHeader = Object.keys(rawRowObj).find(h => {
            const normH = normalizeText(h);
            return aliases.some(alias => normalizeText(alias) === normH);
          });
          if (matchHeader) {
            const rawVal = rawRowObj[matchHeader].trim();
            if (!discoveredColumns.includes(fieldKey)) {
              discoveredColumns.push(fieldKey);
            }

            if (fieldKey === 'whatsappIntimation' || fieldKey === 'extraScholarshipDemand') {
              const lowered = rawVal.toLowerCase();
              (mapped as any)[fieldKey] = lowered === 'true' || lowered === 'yes' || lowered === '1' || lowered === 'y';
            } else if (fieldKey === 'retentionProbability') {
              const lowered = rawVal.toLowerCase();
              if (lowered.includes('low')) mapped.retentionProbability = 'Low';
              else if (lowered.includes('med')) mapped.retentionProbability = 'Medium';
              else if (lowered.includes('high')) mapped.retentionProbability = 'High';
              else mapped.retentionProbability = '';
            } else if (fieldKey === 'extraScholarshipStatus') {
              const lowered = rawVal.toLowerCase();
              if (lowered.includes('approved')) mapped.extraScholarshipStatus = 'Approved';
              else if (lowered.includes('reject')) mapped.extraScholarshipStatus = 'Rejected';
              else if (lowered.includes('progress')) mapped.extraScholarshipStatus = 'InProgress';
              else if (lowered.includes('pending')) mapped.extraScholarshipStatus = 'Pending';
              else mapped.extraScholarshipStatus = '';
            } else {
              (mapped as any)[fieldKey] = rawVal;
            }
          }
        });

        // Ensure regNo is mapped properly or default fallback
        if (!mapped.regNo) {
          // If a Column header was "regno" or "registration id" we used aliases, but double check
          const fallbackReg = rawRowObj['reg no'] || rawRowObj['regno'] || rawRowObj['registration no'] || rawRowObj['id'] || '';
          mapped.regNo = fallbackReg.trim();
        }

        // Auto clean Student Name from double quotes
        if (mapped.studentName) {
          mapped.studentName = mapped.studentName.replace(/^["']|["']$/g, '');
        }

        rows.push(mapped);
      }

      setParsedData(rows);
      const validRows = rows.filter(r => r.regNo);
      setMappingReport({
        total: rows.length,
        validCount: validRows.length,
        invalidCount: rows.length - validRows.length,
        columnsFound: discoveredColumns
      });

    } catch (e: any) {
      console.error(e);
      alert('Error parsing content: ' + e.message);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const isJSON = file.name.endsWith('.json');
      processContent(text, isJSON);
    };
    reader.readAsText(file);
  };

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPastedText(val);
    processContent(val, false);
  };

  const handleResetImport = () => {
    setPastedText('');
    setFileName(null);
    setParsedData([]);
    setMappingReport(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submitImport = () => {
    if (parsedData.length === 0) return;
    
    const validRows = parsedData.filter(r => r.regNo) as StudentScholarshipRow[];
    if (validRows.length === 0) {
      alert('No records with valid Registration Numbers (Reg No) were discovered.');
      return;
    }

    // Assign IDs for matching of valid rows
    const finalizedData = validRows.map((row, index) => {
      return {
        ...row,
        id: row.id || `row_${Date.now()}_${index}_${Math.floor(Math.random() * 1000000)}`
      } as StudentScholarshipRow;
    });

    onImport(finalizedData, strategy);
    handleResetImport();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs" 
        onClick={onClose}
      />
      
      {/* Container */}
      <motion.div 
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 12, opacity: 0 }}
        className="bg-[#FAF8F5] rounded-3xl border border-[#E3DEC3] shadow-2xl relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#FAF8F5] border-b border-[#E3DEC3] flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-base font-serif font-bold text-stone-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#5A7060]" />
              Import Retention Records Spreadsheet
            </h3>
            <p className="text-xs text-stone-500 font-medium">
              Easily update or overwrite student scholarship profiles from Excel, Sheets or CSV files
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-stone-200/60 text-stone-600 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-6 bg-[#FAF8F5] border-b border-[#ECEAE1] py-2 flex items-center justify-between gap-4 shrink-0">
          <div className="flex gap-1 bg-stone-200/50 p-1 rounded-xl">
            <button
              onClick={() => { setActiveTab('paste'); handleResetImport(); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'paste' ? 'bg-[#5A7060] text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              Paste Cells (Excel / Sheets)
            </button>
            <button
              onClick={() => { setActiveTab('file'); handleResetImport(); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'file' ? 'bg-[#5A7060] text-white shadow-xs' : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              Upload Spreadsheet File (.csv, .json)
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[#EEF2EE] px-2.5 py-1 rounded-lg border border-[#D5E2D5] text-[10px] text-[#2C4032] font-semibold">
            <Info className="w-3.5 h-3.5" />
            Matching identity keys will be joined via Student's UNIQUE Reg No
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 min-h-[300px]">
          {parsedData.length === 0 ? (
            <div className="space-y-6">
              {activeTab === 'paste' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-stone-700">
                    Paste copied rows from MS Excel, Google Sheets, or CSV string:
                  </label>
                  <textarea
                    value={pastedText}
                    onChange={handlePasteChange}
                    placeholder="Provide table rows. Make sure the top row lists header names (e.g. Reg No, Student Name, Extra Scholarship Status, etc).&#10;For example, select cells from your sheet, press CTRL+C, and paste (CTRL+V) them here."
                    className="w-full h-48 p-3 text-xs font-mono border border-[#E3DEC3] bg-white rounded-2xl focus:ring-1 focus:ring-[#5A7060] focus:border-[#5A7060] outline-hidden placeholder-stone-400"
                  />
                  <div className="text-[10px] text-stone-500 font-medium">
                    Tip: Column order does not matter! Our intelligent mapper automatically maps synonyms of essential spreadsheet headers.
                  </div>
                </div>
              ) : (
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center gap-3 transition ${
                    dragActive ? 'border-[#5A7060] bg-[#FAFDF9]' : 'border-[#E3DEC3] bg-white hover:border-stone-400'
                  }`}
                >
                  <div className="w-14 h-14 rounded-full bg-[#FAF8F5] border border-[#E3DEC3] flex items-center justify-center shadow-xs">
                    <Upload className="w-6 h-6 text-stone-600" />
                  </div>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-bold text-[#5A7060] hover:underline cursor-pointer"
                    >
                      Click here to select file
                    </button>
                    <span className="text-xs text-stone-500"> or drag and drop your spreadsheet here</span>
                  </div>
                  <p className="text-[10px] text-stone-400 font-mono">
                    Compatible types: Microsoft Excel CSV (.csv), JSON database report (.json)
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.json"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
              )}

              {/* Sample Templates Download & Guideline Card */}
              <div className="bg-[#FFFDFB] border border-[#E3DEC3] rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#E3DEC3]/60 pb-2.5 gap-2">
                  <div>
                    <h4 className="text-[11px] font-extrabold text-[#8C764D] uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#8C764D]" /> Student Data Templates & Header Guide
                    </h4>
                    <p className="text-[10px] text-stone-400 font-medium mt-0.5">Prepare student list for seamless bulk operations</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] font-extrabold text-stone-400 uppercase">Samples:</span>
                    <button
                      type="button"
                      onClick={handleDownloadSampleCSV}
                      className="text-[10px] font-extrabold text-[#5A7060] hover:text-[#425246] hover:underline flex items-center gap-1 cursor-pointer bg-[#5A7060]/5 border border-[#5A7060]/20 px-2.5 py-1 rounded-lg transition"
                      title="Download fully structured student CSV with multiple mock students"
                    >
                      <Download className="w-2.5 h-2.5" />
                      <span>Get Sample CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSampleJSON}
                      className="text-[10px] font-extrabold text-[#5A7060] hover:text-[#425246] hover:underline flex items-center gap-1 cursor-pointer bg-[#5A7060]/5 border border-[#5A7060]/20 px-2.5 py-1 rounded-lg transition"
                      title="Download student JSON database backup sample file"
                    >
                      <Download className="w-2.5 h-2.5" />
                      <span>Get Sample JSON</span>
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-stone-600 leading-relaxed">
                  Download the sample template, populate student details, and paste or upload them back here. Our intelligent header mapper accepts a wide range of aliases for each column (e.g., <code className="bg-stone-100 px-1 py-0.25 rounded font-mono text-[10px]">reg no</code>, <code className="bg-stone-100 px-1 py-0.25 rounded font-mono text-[10px]">registration no</code>, etc.).
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="bg-white border border-[#E3DEC3]/60 rounded-xl p-2.5 space-y-1">
                    <div className="text-[10px] font-bold text-stone-800 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Identity Keys
                    </div>
                    <p className="text-[9.5px] text-stone-500 leading-relaxed font-medium">
                      <code className="text-[#8C764D] font-bold font-mono text-[9px]">regNo</code> (Required) is used to unique-match and sync student records.
                    </p>
                  </div>
                  <div className="bg-white border border-[#E3DEC3]/60 rounded-xl p-2.5 space-y-1">
                    <div className="text-[10px] font-bold text-stone-800 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Smart Booleans
                    </div>
                    <p className="text-[9.5px] text-stone-500 leading-relaxed font-medium">
                      <code className="text-emerald-700 font-bold font-mono text-[9px]">whatsappIntimation</code> and <code className="text-emerald-700 font-bold font-mono text-[9px]">extraScholarshipDemand</code> support <code className="font-mono text-stone-600 text-[9px]">"true" / "false" / "yes" / "no"</code>.
                    </p>
                  </div>
                  <div className="bg-white border border-[#E3DEC3]/60 rounded-xl p-2.5 space-y-1">
                    <div className="text-[10px] font-bold text-stone-800 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Extra Statuses
                    </div>
                    <p className="text-[9.5px] text-stone-500 leading-relaxed font-medium">
                      <code className="text-blue-700 font-bold font-mono text-[9px]">extraScholarshipStatus</code> supports <code className="font-mono text-stone-600 text-[9px]">"Pending" / "Approved" / "Rejected" / "InProgress"</code>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Parsed Preview State */
            <div className="space-y-4">
              {/* Mapping report statistics */}
              {mappingReport && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#EEF0EB]/60 p-4 border border-[#DDD5C5]/60 rounded-2xl">
                  <div>
                    <div className="text-[10px] text-stone-500 uppercase tracking-wider font-extrabold">Total Parsed Rows</div>
                    <div className="text-xl font-bold font-mono text-stone-800">{mappingReport.total}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#425246] uppercase tracking-wider font-extrabold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-[#5A7060]" /> Valid Registers
                    </div>
                    <div className="text-xl font-bold font-mono text-[#334237]">{mappingReport.validCount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#A25A38] uppercase tracking-wider font-extrabold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-[#A25A38]" /> Invalid / No RegNo
                    </div>
                    <div className="text-xl font-bold font-mono text-[#A25A38]">
                      {mappingReport.invalidCount}
                      {mappingReport.invalidCount > 0 && <span className="text-[10px] ml-1 font-sans font-medium">(skipped)</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-stone-500 uppercase tracking-wider font-extrabold">Discovered Headers</div>
                    <div className="text-xs font-semibold text-stone-700 mt-1 truncate" title={mappingReport.columnsFound.join(', ')}>
                      {mappingReport.columnsFound.length} columns paired
                    </div>
                  </div>
                </div>
              )}

              {/* Data Table Preview */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">Spreadsheet Data Mapping Preview</span>
                  <button 
                    onClick={handleResetImport}
                    className="text-[10px] font-bold text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Re-upload / Clear
                  </button>
                </div>

                <div className="border border-[#E3DEC3] rounded-2xl overflow-hidden bg-white max-h-[220px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#FAF8F5] border-b border-[#E3DEC3] text-[9px] font-bold uppercase tracking-wider text-stone-500 sticky top-0">
                        <th className="p-2.5">Reg No</th>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Region</th>
                        <th className="p-2.5">Center</th>
                        <th className="p-2.5">Scholarship</th>
                        <th className="p-2.5">Mentor</th>
                        {userRole !== 'FH' && userRole !== 'Mentor' && <th className="p-2.5">Extra status</th>}
                        <th className="p-2.5">PTM</th>
                        <th className="p-2.5">Parent Remarks</th>
                        <th className="p-2.5">Prob.</th>
                        <th className="p-2.5">Retention Status</th>
                        <th className="p-2.5">Discontinue Reason</th>
                        <th className="p-2.5">Counselor Name</th>
                        <th className="p-2.5">New Regno</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-[11px] font-semibold text-stone-700">
                      {parsedData.map((row, idx) => (
                        <tr key={idx} className={!row.regNo ? 'bg-orange-50/50 text-orange-700' : 'hover:bg-stone-50'}>
                          <td className="p-2.5 font-mono">
                            {row.regNo ? (
                              row.regNo
                            ) : (
                              <span className="text-orange-500 flex items-center gap-1 font-sans text-[10px]">
                                <AlertTriangle className="w-3 h-3 text-orange-400" /> Missing
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 truncate max-w-[120px]">{row.studentName || '-'}</td>
                          <td className="p-2.5">{row.region || '-'}</td>
                          <td className="p-2.5 truncate max-w-[120px]">{row.center || '-'}</td>
                          <td className="p-2.5">{row.scholarship || '-'}</td>
                          <td className="p-2.5">{row.mentor || '-'}</td>
                          {userRole !== 'FH' && userRole !== 'Mentor' && (
                            <td className="p-2.5">
                              {row.extraScholarshipStatus ? (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  row.extraScholarshipStatus === 'Approved' ? 'bg-[#ECEFEA] text-[#425246]' :
                                  row.extraScholarshipStatus === 'Rejected' ? 'bg-[#FAF0E4] text-[#A25A38]' : 'bg-[#FBF5EC] text-[#8C764D]'
                                }`}>
                                  {row.extraScholarshipStatus}
                                </span>
                              ) : '-'}
                            </td>
                          )}
                          <td className="p-2.5">{row.ptmStatus || '-'}</td>
                          <td className="p-2.5 truncate max-w-[150px]" title={row.parentRemarks || undefined}>{row.parentRemarks || '-'}</td>
                          <td className="p-2.5">
                            {row.retentionProbability ? (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                row.retentionProbability === 'High' ? 'bg-green-50 text-green-700 border border-green-200' :
                                row.retentionProbability === 'Medium' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {row.retentionProbability}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="p-2.5 font-normal text-stone-500 truncate max-w-[120px]">{row.finalRetentionStatus || '-'}</td>
                          <td className="p-2.5 truncate max-w-[120px]" title={row.discontinueReason || undefined}>{row.discontinueReason || '-'}</td>
                          <td className="p-2.5 truncate max-w-[100px]">{row.counselorName || '-'}</td>
                          <td className="p-2.5 font-mono">{row.newRegno || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Import Strategy */}
              <div className="bg-white p-4 border border-[#E3DEC3] rounded-2xl space-y-4">
                <div className="text-xs font-bold text-stone-800">Select Integration Strategy:</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Strategy Merge */}
                  <label className={`block border p-4 rounded-xl cursor-pointer transition relative ${
                    strategy === 'merge' ? 'border-[#5A7060] bg-[#FAFDF9]' : 'border-stone-200 hover:bg-stone-50'
                  }`}>
                    <input
                      type="radio"
                      name="strategy"
                      value="merge"
                      checked={strategy === 'merge'}
                      onChange={() => setStrategy('merge')}
                      className="absolute right-3.5 top-3.5 accent-[#5A7060]"
                    />
                    <div className="flex items-start gap-2.5 pr-6">
                      <div className="mt-0.5 text-[#5A7060] font-bold">✓</div>
                      <div>
                        <div className="text-xs font-bold text-stone-900">Merge & Sync (Recommended)</div>
                        <p className="text-[10.5px] text-stone-500 font-medium mt-1 leading-relaxed">
                          Keeps all current profiles intact. Matches spreadsheet records using their **Reg No** to update existing details, while appending newly matched records cleanly.
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Strategy Overwrite */}
                  <label className={`block border p-4 rounded-xl cursor-pointer transition relative ${
                    strategy === 'overwrite' ? 'border-orange-600 bg-orange-50/10' : 'border-stone-200 hover:bg-stone-50'
                  }`}>
                    <input
                      type="radio"
                      name="strategy"
                      value="overwrite"
                      checked={strategy === 'overwrite'}
                      onChange={() => setStrategy('overwrite')}
                      className="absolute right-3.5 top-3.5 accent-orange-600"
                    />
                    <div className="flex items-start gap-2.5 pr-6">
                      <div className="mt-0.5 text-orange-600 font-bold">⚠</div>
                      <div>
                        <div className="text-xs font-bold text-orange-950">Overwrite Master Database</div>
                        <p className="text-[10.5px] text-orange-700/80 font-medium mt-1 leading-relaxed">
                          Deletes all current student retention profiles and replaces the database entirely with valid rows from this spreadsheet. Use with caution!
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#FAF8F5] border-t border-[#E3DEC3] flex justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 rounded-xl text-xs font-semibold cursor-pointer transition"
          >
            Cancel
          </button>
          
          <button
            type="button"
            disabled={parsedData.length === 0}
            onClick={submitImport}
            className="px-4 py-2 bg-[#5A7060] hover:bg-[#4E6052] text-white disabled:bg-stone-300 disabled:text-stone-500 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition"
          >
            <Check className="w-4 h-4" /> Import {parsedData.filter(r => r.regNo).length} Records
          </button>
        </div>
      </motion.div>
    </div>
  );
}
