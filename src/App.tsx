import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  GraduationCap, 
  Search, 
  Plus, 
  Download, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  MessageSquare, 
  User, 
  Mail, 
  Maximize2, 
  SlidersHorizontal, 
  Eye, 
  EyeOff, 
  X, 
  Save, 
  Calendar, 
  FileText, 
  Layers, 
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  TrendingDown,
  Trash2,
  Check,
  ShieldCheck,
  MapPin,
  Users,
  Percent,
  Lock,
  Unlock,
  Upload,
  History,
  FileClock,
  Database,
  BarChart3,
  LogOut,
  ArrowRight,
  ShieldAlert,
  Hourglass
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StudentScholarshipRow, ActivityLog, UserRoleMapping, SCHOLARSHIPS_LIST } from './types';
import { INITIAL_SCHOLARSHIP_DATA } from './initialData';
import ImportModal from './ImportModal';
import AuditLogsModal from './AuditLogsModal';
import RolePermissionModal from './RolePermissionModal';
import {
  testFirestoreConnection,
  getStudentsFromFirestore,
  getLogsFromFirestore,
  saveStudentInFirestore,
  saveBulkStudentsInFirestore,
  addLogToFirestore,
  deleteStudentInFirestore,
  resetAllStudentsInFirestore,
  clearLogsInFirestore,
  getUserRolesFromFirestore
} from './firebaseUtils';
import { db, auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { Chrome, Sparkles, RefreshCw, Fingerprint } from 'lucide-react';

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage is blocked or unavailable:', e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage is blocked or unavailable:', e);
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage is blocked or unavailable:', e);
    }
  }
};

const safeConfirm = (message: string): boolean => {
  try {
    return window.confirm(message);
  } catch (e) {
    console.warn('window.confirm is blocked or unavailable:', e);
    return true; // proceed fallback in restricted sandbox
  }
};

export interface AtRiskStudent {
  regNo: string;
  studentName: string;
  risk: string; // 'Low' | 'Medium' | 'High'
  ptmStatus: string;
  remarks: string;
  discontinueReason: string;
  scholarship: string;
  proposedScholarship: string;
  status: string;
}

export interface TreeStats {
  total: number;
  retained: number;
  notRetained: number;
  extraReq: number;
  pending: number;
  whatsapp: number;
  ptmDone: number;
  students: AtRiskStudent[];
}

export interface ClassNode extends TreeStats {
  mentors: string[];
  counselors: string[];
}

export interface BuildingNode extends TreeStats {
  fhs: string[];
  chs: string[];
  classes: { [name: string]: ClassNode };
}

export interface CenterNode extends TreeStats {
  chs: string[];
  rfhs: string[];
  buildings: { [name: string]: BuildingNode };
}

export interface RegionNode extends TreeStats {
  rahs: string[];
  rfhs: string[];
  centers: { [name: string]: CenterNode };
}

export default function App() {
  // State management
  const [data, setData] = useState<StudentScholarshipRow[]>(() => {
    const saved = safeLocalStorage.getItem('pw_scholarship_data_2026');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const seenIds = new Set<string>();
          const seenRegs = new Set<string>();
          return parsed.filter(student => {
            if (!student || !student.id || !student.regNo) return false;
            const normalizedReg = student.regNo.trim().toLowerCase();
            if (seenIds.has(student.id) || seenRegs.has(normalizedReg)) {
              return false;
            }
            seenIds.add(student.id);
            seenRegs.add(normalizedReg);
            return true;
          });
        }
        return parsed;
      } catch (e) {
        console.error('Failed to parse saved scholarship data, using initial data.', e);
      }
    }
    return [];
  });

  // Persist state to localStorage
  useEffect(() => {
    safeLocalStorage.setItem('pw_scholarship_data_2026', JSON.stringify(data));
  }, [data]);

  // Sidebar / Details Drawer States
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Perspective Auditing State
  const [selectedPerspectiveRegNo, setSelectedPerspectiveRegNo] = useState<string | null>(null);

  const selectedPerspectiveStudent = useMemo(() => {
    return data.find(s => s.regNo === selectedPerspectiveRegNo) || null;
  }, [data, selectedPerspectiveRegNo]);

  // Custom Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const triggerConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      }
    });
  };

  // Role & Permissions Configuration States
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [userRolesList, setUserRolesList] = useState<UserRoleMapping[]>([]);
  const [activeEmail, setActiveEmail] = useState<string>('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const isAdmin = useMemo(() => {
    const emailLower = activeEmail.toLowerCase().trim();
    return emailLower === 'devansh.sharma@pw.live' || emailLower === 'bipin.yadav@pw.live';
  }, [activeEmail]);

  // Check authorization status
  const isAuthorized = useMemo(() => {
    const emailLower = activeEmail.toLowerCase().trim();
    if (!emailLower) return false;
    if (emailLower === 'devansh.sharma@pw.live' || emailLower === 'bipin.yadav@pw.live') return true;

    return userRolesList.some(mapping => 
      (mapping.rahMailid && mapping.rahMailid.toLowerCase().trim() === emailLower) ||
      (mapping.rfhMailid && mapping.rfhMailid.toLowerCase().trim() === emailLower) ||
      (mapping.chMailid && mapping.chMailid.toLowerCase().trim() === emailLower) ||
      (mapping.fhMailid && mapping.fhMailid.toLowerCase().trim() === emailLower) ||
      (mapping.mentorId && mapping.mentorId.toLowerCase().trim() === emailLower) ||
      (mapping.counselorId && mapping.counselorId.toLowerCase().trim() === emailLower)
    );
  }, [activeEmail, userRolesList]);

  // Login flow states
  const [loginEmailInput, setLoginEmailInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isVerifyingLogin, setIsVerifyingLogin] = useState(false);
  const [showAuthorizedList, setShowAuthorizedList] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsVerifyingLogin(true);
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    // Hint domain to limit accounts if preferred, but allow all first
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const emailLower = user.email?.toLowerCase().trim() || '';
      
      const isAdmin = emailLower === 'devansh.sharma@pw.live' || emailLower === 'bipin.yadav@pw.live';
      const isMapped = userRolesList.some(mapping => 
        (mapping.rahMailid && mapping.rahMailid.toLowerCase().trim() === emailLower) ||
        (mapping.rfhMailid && mapping.rfhMailid.toLowerCase().trim() === emailLower) ||
        (mapping.chMailid && mapping.chMailid.toLowerCase().trim() === emailLower) ||
        (mapping.fhMailid && mapping.fhMailid.toLowerCase().trim() === emailLower) ||
        (mapping.mentorId && mapping.mentorId.toLowerCase().trim() === emailLower) ||
        (mapping.counselorId && mapping.counselorId.toLowerCase().trim() === emailLower)
      );

      if (isAdmin || isMapped) {
        setActiveEmail(emailLower);
        triggerBanner(`Access Granted: Welcome back, ${emailLower}!`, 'success');
      } else {
        await signOut(auth);
        setLoginError('Access Denied. Your Google account is not registered in our row permissions matrix. Please contact the administrator.');
        triggerBanner('This Google account is not registered. Access Denied.', 'error');
      }
    } catch (error: any) {
      console.error("Google Sign-In Error:", error);
      setLoginError(`Google Auth failed: ${error.message || ''}. Note: If you are in the embedded preview, please open the app in a new tab using the top-right arrow button, or use the "Developer Bypass" option below.`);
    } finally {
      setIsVerifyingLogin(false);
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emailLower = loginEmailInput.toLowerCase().trim();
    if (!emailLower) {
      setLoginError('Please enter a valid email address.');
      return;
    }

    setIsVerifyingLogin(true);
    setLoginError(null);

    // Simulate verification latency
    setTimeout(() => {
      const isAdmin = emailLower === 'devansh.sharma@pw.live' || emailLower === 'bipin.yadav@pw.live';
      const isMapped = userRolesList.some(mapping => 
        (mapping.rahMailid && mapping.rahMailid.toLowerCase().trim() === emailLower) ||
        (mapping.rfhMailid && mapping.rfhMailid.toLowerCase().trim() === emailLower) ||
        (mapping.chMailid && mapping.chMailid.toLowerCase().trim() === emailLower) ||
        (mapping.fhMailid && mapping.fhMailid.toLowerCase().trim() === emailLower) ||
        (mapping.mentorId && mapping.mentorId.toLowerCase().trim() === emailLower) ||
        (mapping.counselorId && mapping.counselorId.toLowerCase().trim() === emailLower)
      );

      if (isAdmin || isMapped) {
        setActiveEmail(emailLower);
        triggerBanner(`Access Granted: Welcome back, ${emailLower}!`, 'success');
        setLoginEmailInput('');
      } else {
        setLoginError('Access Denied. Your email is not registered in our row permissions matrix. Kindly connect with the admin.');
      }
      setIsVerifyingLogin(false);
    }, 500);
  };

  // Role Simulation States
  const [userRole, setUserRole] = useState<'Central' | 'RAH' | 'RFH' | 'CH' | 'FH' | 'Mentor' | 'Counselor'>('Central');
  const [simulatedRegion, setSimulatedRegion] = useState<string>('PB + J&K');
  const [simulatedCenter, setSimulatedCenter] = useState<string>('Anantnag Vidyapeeth');
  const [simulatedMentor, setSimulatedMentor] = useState<string>('Umar Sir');
  const [isSandboxMode, setIsSandboxMode] = useState<boolean>(false);
  const [isSandboxExpanded, setIsSandboxExpanded] = useState<boolean>(true);

  // Set up Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const emailLower = firebaseUser.email?.toLowerCase().trim() || '';
        if (emailLower) {
          const isAdmin = emailLower === 'devansh.sharma@pw.live' || emailLower === 'bipin.yadav@pw.live';
          
          // Wait until roles are loaded before evaluating mapping
          if (userRolesList.length === 0) {
            setActiveEmail(emailLower);
            setIsAuthLoading(false);
            return;
          }

          const isMapped = userRolesList.some(mapping => 
            (mapping.rahMailid && mapping.rahMailid.toLowerCase().trim() === emailLower) ||
            (mapping.rfhMailid && mapping.rfhMailid.toLowerCase().trim() === emailLower) ||
            (mapping.chMailid && mapping.chMailid.toLowerCase().trim() === emailLower) ||
            (mapping.fhMailid && mapping.fhMailid.toLowerCase().trim() === emailLower) ||
            (mapping.mentorId && mapping.mentorId.toLowerCase().trim() === emailLower) ||
            (mapping.counselorId && mapping.counselorId.toLowerCase().trim() === emailLower)
          );

          if (isAdmin || isMapped) {
            setActiveEmail(emailLower);
          } else {
            await signOut(auth);
            setLoginError('Access Denied. Your Google account is not registered in our row permissions matrix.');
            triggerBanner('This Google account is not registered. Access Denied.', 'error');
            setActiveEmail('');
          }
        }
      } else {
        // If no active Firebase user, check if we have a valid offline admin bypass session
        if (safeLocalStorage.getItem('pw_scholarship_bypass_admin') === 'true') {
          setActiveEmail('devansh.sharma@pw.live');
        } else {
          setActiveEmail('');
        }
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, [userRolesList]);

  // Load user roles list
  const loadUserRoles = useCallback(async () => {
    try {
      const roles = await getUserRolesFromFirestore();
      setUserRolesList(roles);
    } catch (err) {
      console.error("Failed to load user roles", err);
    }
  }, []);

  useEffect(() => {
    loadUserRoles();
  }, [loadUserRoles]);

  useEffect(() => {
    safeLocalStorage.setItem('pw_scholarship_active_email', activeEmail);
    const emailLower = activeEmail.toLowerCase().trim();
    
    // If in Sandbox Mode, do not automatically override simulation states
    if (isSandboxMode) return;
    
     if (emailLower === 'devansh.sharma@pw.live' || emailLower === 'bipin.yadav@pw.live') {
      setUserRole('Central');
      setSimulatedRegion('PB + J&K');
      setSimulatedCenter('Anantnag Vidyapeeth');
      setSimulatedMentor('Umar Sir');
      return;
    }

    // Wait until roles are loaded to map correct role to email
    if (activeEmail && userRolesList.length === 0) {
      return;
    }
    
    // Find matching role row in the matrix
    let foundRole: 'Central' | 'RAH' | 'RFH' | 'CH' | 'FH' | 'Mentor' | 'Counselor' | null = null;
    let foundRegion = 'PB + J&K';
    let foundCenter = 'Anantnag Vidyapeeth';
    let foundMentor = 'Umar Sir';
    
    for (const mapping of userRolesList) {
      if (mapping.rahMailid && mapping.rahMailid.toLowerCase().trim() === emailLower) {
        foundRole = 'RAH';
        foundRegion = mapping.region;
        break;
      }
      if (mapping.rfhMailid && mapping.rfhMailid.toLowerCase().trim() === emailLower) {
        foundRole = 'RFH';
        foundRegion = mapping.region;
        break;
      }
      if (mapping.chMailid && mapping.chMailid.toLowerCase().trim() === emailLower) {
        foundRole = 'CH';
        foundCenter = mapping.center;
        break;
      }
      if (mapping.fhMailid && mapping.fhMailid.toLowerCase().trim() === emailLower) {
        foundRole = 'FH';
        foundCenter = mapping.center;
        break;
      }
      if (mapping.mentorId && mapping.mentorId.toLowerCase().trim() === emailLower) {
        foundRole = 'Mentor';
        foundCenter = mapping.center;
        foundMentor = mapping.mentorId;
        break;
      }
      if (mapping.counselorId && mapping.counselorId.toLowerCase().trim() === emailLower) {
        foundRole = 'Counselor';
        foundCenter = mapping.center;
        break;
      }
    }
    
    if (foundRole) {
      setUserRole(foundRole);
      setSimulatedRegion(foundRegion);
      setSimulatedCenter(foundCenter);
      setSimulatedMentor(foundMentor);
    } else {
      // Default fallback just in case, but unauthorized screen blocks access
      setUserRole('Central');
      setSimulatedRegion('PB + J&K');
      setSimulatedCenter('Anantnag Vidyapeeth');
      setSimulatedMentor('Umar Sir');
    }
  }, [activeEmail, userRolesList, isSandboxMode]);

  // Activity Log States & Persistence
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [logs, setLogs] = useState<ActivityLog[]>(() => {
    try {
      const saved = safeLocalStorage.getItem('pw_scholarship_logs_2026');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse saved logs data.', e);
    }
    return [];
  });

  useEffect(() => {
    safeLocalStorage.setItem('pw_scholarship_logs_2026', JSON.stringify(logs));
  }, [logs]);

  // Cloud loading state
  const [isLoadingCloud, setIsLoadingCloud] = useState(true);

  const addLog = useCallback((action: ActivityLog['action'], details: string, target?: string) => {
    const newLog: ActivityLog = {
      id: `log_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      userRole,
      action,
      details,
      target
    };
    setLogs(prev => [newLog, ...prev]);
    // Sync to Firestore Cloud
    addLogToFirestore(newLog).catch(err => console.error("Cloud logging error:", err));
  }, [userRole]);

  // Connection and data fetch on boot
  useEffect(() => {
    async function initCloudData() {
      try {
        await testFirestoreConnection();
        const cloudStudents = await getStudentsFromFirestore();
        setData(cloudStudents);
        const cloudLogs = await getLogsFromFirestore();
        setLogs(cloudLogs);
        const roles = await getUserRolesFromFirestore();
        setUserRolesList(roles);
      } catch (e) {
        console.error("Failed to load cloud database.", e);
      } finally {
        setIsLoadingCloud(false);
      }
    }
    initCloudData();
  }, []);

  // Helper to check if a scholarship is a flat amount
  const isFlatScholarship = useCallback((text: string): boolean => {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    if (lower.includes('%') || lower.includes('percent') || lower.includes('tuition')) return false;
    return lower.includes('flat') || lower.includes('k') || lower === '0' || /^\d+$/.test(lower);
  }, []);

  // Helper to format flat scholarship values
  const formatFlatScholarship = useCallback((val: string): string => {
    if (!val) return '';
    const clean = val.toLowerCase().trim();
    if (clean === '0' || clean === 'flat 0') return 'Flat 0';
    if (clean.includes('flat')) {
      // Capitalize "flat" to "Flat"
      return val.trim().replace(/^\w/, c => c.toUpperCase());
    }
    const kMatch = clean.match(/^(\d+)(k)?$/);
    if (kMatch) {
      const numStr = kMatch[1];
      const hasK = !!kMatch[2];
      if (hasK) {
        return `Flat ${numStr}k`;
      }
      const num = parseInt(numStr, 10);
      if (num >= 1000 && num % 1000 === 0) {
        return `Flat ${num / 1000}k`;
      }
      return `Flat ${num}`;
    }
    return val.trim();
  }, []);

  // Helper to check if a parent remark is a standard dropdown option
  const isStandardRemark = useCallback((remark: string | undefined): boolean => {
    if (!remark) return true;
    return ["Will pay", "Will Decide", "Will wait for other scholarships", "Will not continue with PW"].includes(remark);
  }, []);

  // Helper to determine if Dropout Reason should be enabled/opened based on Parent Remarks
  const isDropoutReasonEnabled = useCallback((remark: string | undefined): boolean => {
    if (!remark) return false;
    return remark === "Will not continue with PW" || !["Will pay", "Will Decide", "Will wait for other scholarships", "Will not continue with PW"].includes(remark);
  }, []);

  // Helper to check if a discontinue reason is a standard dropdown option
  const isStandardDiscontinueReason = useCallback((reason: string | undefined): boolean => {
    if (!reason) return true;
    return [
      "academic concern", "father transfer", "health issue", "non acad issue",
      "School Timing Issue", "Transportation Issue", "Relocation Issue", "Financial Issue"
    ].includes(reason);
  }, []);

  // Helper to check if a counselor status is a standard dropdown option
  const isStandardCounselorStatus = useCallback((status: string | undefined): boolean => {
    if (!status) return true;
    return ["Re-enrolled", "Not Retained - Directly connect once again with Mentor"].includes(status);
  }, []);

  // Helper to check if a student registration is unworked (untouched by any counselor)
  const isUnworked = useCallback((row: StudentScholarshipRow): boolean => {
    return (!row.counselorStatus || row.counselorStatus.trim() === '') && (!row.newRegno || row.newRegno.trim() === '');
  }, []);

  // Helper to parse scholarship values into an equivalent percentage (e.g., Flat 10k -> 120% value, Flat 15k -> 110% value, 100% -> 100%)
  const getScholarshipInPct = useCallback((text: string): number => {
    if (!text) return 0;
    const lower = text.toLowerCase().trim();
    if (lower.includes('flat 10k') || lower === 'flat 10k') return 120;
    if (lower.includes('flat 15k') || lower === 'flat 15k') return 110;
    if (lower.includes('100%')) return 100;
    if (lower.includes('85%')) return 85;
    if (lower.includes('70%')) return 70;
    if (lower.includes('55%')) return 55;
    if (lower.includes('45%')) return 45;
    if (lower.includes('40%')) return 40;
    if (lower.includes('35%')) return 35;
    if (lower.includes('30%')) return 30;

    const pctMatch = lower.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pctMatch) return parseFloat(pctMatch[1]);
    const kMatch = lower.match(/(\d+(?:\.\d+)?)\s*k/);
    if (kMatch) {
      return parseFloat(kMatch[1]); // fallback e.g. "Flat 5k" -> 5
    }
    const numMatch = lower.match(/(\d+)/);
    if (numMatch) {
      const val = parseFloat(numMatch[1]);
      if (val > 100) return val / 1000; // e.g., 15000 -> 15
      return val;
    }
    return 0;
  }, []);

  const getScholarshipIncrement = useCallback((current: string, proposed: string): number => {
    if (!proposed) return 0;
    const currentPct = getScholarshipInPct(current || '');
    const proposedPct = getScholarshipInPct(proposed);
    return Math.max(0, proposedPct - currentPct);
  }, [getScholarshipInPct]);

  const isMoveToRAH = useCallback((scholarship: string, proposed: string): boolean => {
    if (!proposed) return false;
    const isFlat = isFlatScholarship(proposed);
    if (isFlat) return true; // Flat is handled by RAH ("included flat")
    const extraPct = getScholarshipInPct(proposed);
    return extraPct > 10; // > 10% on tuition fee is approved by RAH
  }, [getScholarshipInPct, isFlatScholarship]);

  const getFinalScholarshipOptions = useCallback((base: string, proposed: string) => {
    const list = [...SCHOLARSHIPS_LIST];
    
    // Explicitly add original base scholarship if it exists and is not already listed
    if (base && !list.includes(base)) {
      list.unshift(base);
    }

    if (!proposed) return list;

    const basePct = getScholarshipInPct(base || '');
    const extraPct = getScholarshipInPct(proposed || '');

    const optionsToAdd: string[] = [];
    
    // 1. Literal combo
    const literalCombo = `${base || '0%'} + ${proposed}`;
    optionsToAdd.push(literalCombo);

    // 2. Summed percentage if both are percentages
    if (basePct > 0 && extraPct > 0) {
      const summedPct = basePct + extraPct;
      optionsToAdd.push(`${summedPct}% on Tuition Fees`);
    }

    // Filter duplicates and merge at top
    optionsToAdd.forEach(opt => {
      if (!list.includes(opt)) {
        list.unshift(opt);
      }
    });

    return list;
  }, [getScholarshipInPct]);

  // Quota calculation for active Center
  const centerQuotaInfo = useMemo(() => {
    const center = (userRole === 'CH' || userRole === 'FH' || userRole === 'Mentor') ? simulatedCenter : 'Anantnag Vidyapeeth';
    const centerStudents = data.filter(s => s.center === center);
    const count = centerStudents.length;
    const allowedLimit = count > 0 ? Math.ceil(count * 0.03) : 0; // CH limit is 3% of center total student count
    
    // Approved cases inside CH quota (which are <= 10% and not flat)
    const used = centerStudents.filter(s => 
      s.extraScholarshipStatus === 'Approved' && 
      !isMoveToRAH(s.scholarship, s.proposedScholarship)
    ).length;

    const percentUsed = allowedLimit > 0 ? (used / allowedLimit) * 100 : 0;
    return {
      centerName: center,
      totalStudents: count,
      allowedLimit,
      used,
      percentUsed: Math.min(100, Math.round(percentUsed * 10) / 10),
      remaining: Math.max(0, allowedLimit - used)
    };
  }, [data, userRole, simulatedCenter, isMoveToRAH]);

  // Quota calculation for active Region
  const regionQuotaInfo = useMemo(() => {
    const region = (userRole === 'RAH' || userRole === 'RFH') ? simulatedRegion : 'PB + J&K';
    const regionStudents = data.filter(s => s.region === region);
    const count = regionStudents.length;
    const allowedLimit = count > 0 ? Math.ceil(count * 0.01) : 0; // RAH limit is 1% of region total student count
    
    // Approved cases inside RAH quota (which are > 10% or flat)
    const used = regionStudents.filter(s => 
      s.rahStatus === 'Approved' && 
      isMoveToRAH(s.scholarship, s.proposedScholarship)
    ).length;

    const percentUsed = allowedLimit > 0 ? (used / allowedLimit) * 100 : 0;
    return {
      regionName: region,
      totalStudents: count,
      allowedLimit,
      used,
      percentUsed: Math.min(100, Math.round(percentUsed * 10) / 10),
      remaining: Math.max(0, allowedLimit - used)
    };
  }, [data, userRole, simulatedRegion, isMoveToRAH]);

  // Extract simulated domains dynamically
  const availableRegions = useMemo(() => {
    return Array.from(new Set(data.map(r => r.region))).filter(Boolean);
  }, [data]);

  const availableCenters = useMemo(() => {
    return Array.from(new Set(data.map(r => r.center))).filter(Boolean);
  }, [data]);

  const availableMentors = useMemo(() => {
    return Array.from(new Set(data.map(r => r.mentor))).filter(Boolean);
  }, [data]);

  // Role Edit Permission Check
  const canEditField = useCallback((field: keyof StudentScholarshipRow, student?: StudentScholarshipRow): boolean => {
    // 1. Student detail fields are completely locked for everyone (including Central)
    const lockedStudentFields: Array<keyof StudentScholarshipRow> = [
      'studentName', 'regNo', 'batchName', 'class', 'scholarship', 'region', 'center', 
      'building', 'pwid', 'mentor', 'mentorMailid', 'whatsappIntimation'
    ];
    if (lockedStudentFields.includes(field)) {
      return false;
    }

    // 2. Counselor fields: only Counselor or Central can add/edit
    const counselorFields: Array<keyof StudentScholarshipRow> = [
      'counselorName', 'counselorPwid', 'newRegno', 'counselorStatus'
    ];
    if (counselorFields.includes(field)) {
      return ['Central', 'Counselor'].includes(userRole);
    }

    // 3. Mentor & parent Coordination: editable for FH, CH, RFH, Mentor, and Central
    const coordinationFields: Array<keyof StudentScholarshipRow> = [
      'ptmStatus', 'parentRemarks', 'retentionProbability', 'finalRetentionStatus', 'paymentDate', 'discontinueReason'
    ];
    if (coordinationFields.includes(field)) {
      return ['Central', 'CH', 'FH', 'RAH', 'RFH', 'Mentor'].includes(userRole);
    }

    // 4. Extra Scholarship related fields:
    if (field === 'proposedScholarship' || field === 'extraScholarshipDemand') {
      return ['Central', 'CH', 'RAH'].includes(userRole);
    }

    if (field === 'extraScholarshipStatus') {
      if (userRole === 'Central') return true;
      if (userRole === 'CH') {
        return student ? !isMoveToRAH(student.scholarship, student.proposedScholarship) : true;
      }
      if (userRole === 'RAH') {
        return student ? isMoveToRAH(student.scholarship, student.proposedScholarship) : true;
      }
      return false;
    }

    if (field === 'rahStatus') {
      return ['Central', 'RAH'].includes(userRole);
    }

    if (field === 'finalScholarship') {
      return ['Central', 'CH', 'RAH'].includes(userRole);
    }

    if (userRole === 'Central') return true;
    return false;
  }, [userRole, isMoveToRAH]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCenter, setSelectedCenter] = useState('All');
  const [selectedScholarship, setSelectedScholarship] = useState('All');
  const [selectedRetention, setSelectedRetention] = useState('All');
  const [selectedWhatsApp, setSelectedWhatsApp] = useState('All');
  const [selectedAdmissionStatus, setSelectedAdmissionStatus] = useState('All');
  const [selectedPendency, setSelectedPendency] = useState('All');
  const [selectedWorkStatus, setSelectedWorkStatus] = useState('All');

  // Pendency calculation helper
  const getStudentPendency = useCallback((item: StudentScholarshipRow) => {
    // 1. Mentor Side Pendency
    const isMentorPending = 
      !item.parentRemarks || 
      !item.ptmStatus || 
      item.ptmStatus.toLowerCase().includes('pending') || 
      !item.retentionProbability;
      
    // 2. FH/CH Side Pendency
    const isFhChPending = 
      item.extraScholarshipDemand && 
      (!item.extraScholarshipStatus || item.extraScholarshipStatus === 'Pending' || item.extraScholarshipStatus === 'InProgress');

    // 3. RAH Side Pendency
    const isRahPending = 
      item.rahStatus === 'Pending' || 
      item.rahStatus === 'InProgress';

    // 4. Counselor Side Pendency
    const isCounselorPending = 
      ((item.finalRetentionStatus === 'Ready to get retained' || item.finalRetentionStatus === 'Retained') || item.finalRetentionStatus === 'Extra Scholarship Required') && 
      (!item.counselorName || !item.counselorPwid || !item.newRegno);

    if (isMentorPending) return 'Mentor';
    if (isFhChPending) return 'FH/CH';
    if (isRahPending) return 'RAH';
    if (isCounselorPending) return 'Counselor';
    return 'None';
  }, []);
  
  // Bulks/Selection state
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkWhatsApp, setBulkWhatsApp] = useState<boolean | null>(null);
  const [bulkPTMStatus, setBulkPTMStatus] = useState('');
  const [bulkRetention, setBulkRetention] = useState<StudentScholarshipRow['retentionProbability'] | ''>('');

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState<Record<keyof StudentScholarshipRow, boolean>>({
    id: false,
    region: false,
    center: false,
    building: true,
    studentName: true,
    regNo: true,
    batchName: true,
    class: true,
    scholarship: true,
    mentor: false,
    mentorMailid: false,
    pwid: false,
    whatsappIntimation: false,
    ptmStatus: false,
    parentRemarks: false,
    paymentDate: false,
    discontinueReason: false,
    retentionProbability: false,
    proposedScholarship: false,
    extraScholarshipDemand: false,
    extraScholarshipStatus: false,
    rahStatus: false,
    finalRetentionStatus: false,
    finalScholarship: true,
    counselorName: false,
    counselorPwid: false,
    newRegno: true,
    counselorStatus: true,
  });

  // Toggles for visual configuration
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [inlineEditingMode, setInlineEditingMode] = useState(true);

  // Top level view state
  const [activeView, setActiveView] = useState<'database' | 'summary'>('database');

  // Dynamic filter states for the Summary page
  const [summaryRegion, setSummaryRegion] = useState<string>('All');
  const [summaryCenter, setSummaryCenter] = useState<string>('All');
  const [summaryBuilding, setSummaryBuilding] = useState<string>('All');
  const [summaryClass, setSummaryClass] = useState<string>('All');
  const [summaryRisk, setSummaryRisk] = useState<string>('All');
  const [summaryPtmStatus, setSummaryPtmStatus] = useState<string>('All');
  const [summaryRetention, setSummaryRetention] = useState<string>('All');

  // Expand/collapse states for regional hierarchy drill-down
  const [expandedRegions, setExpandedRegions] = useState<{ [key: string]: boolean }>({});
  const [expandedCenters, setExpandedCenters] = useState<{ [key: string]: boolean }>({});
  const [expandedBuildings, setExpandedBuildings] = useState<{ [key: string]: boolean }>({});

  // Status/Notifications state
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'info' | 'error', text: string } | null>(null);

  const triggerBanner = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setBannerMessage({ type, text });
    setTimeout(() => {
      setBannerMessage(null);
    }, 4000);
  };

  // Find unique values for filters
  const centers = useMemo(() => {
    return ['All', ...Array.from(new Set(data.map((item) => item.center).filter(Boolean)))];
  }, [data]);

  const scholarships = useMemo(() => {
    return ['All', ...Array.from(new Set(data.map((item) => item.scholarship).filter(Boolean)))];
  }, [data]);

  // Statistics summaries
  const stats = useMemo(() => {
    const total = data.length;
    const flat10Count = data.filter(s => s.scholarship?.toLowerCase().includes('10k')).length;
    const flat15Count = data.filter(s => s.scholarship?.toLowerCase().includes('15k')).length;
    const fullScholarshipCount = data.filter(s => s.scholarship?.toLowerCase().includes('100%')).length;
    const whatsappCount = data.filter(s => s.whatsappIntimation).length;
    const pendingRemarks = data.filter(s => !s.parentRemarks || s.parentRemarks.trim() === '').length;
    const highRiskCount = data.filter(s => s.retentionProbability === 'Low').length; // Low chance of retention is High Risk
    const mediumRiskCount = data.filter(s => s.retentionProbability === 'Medium').length;
    
    return {
      total,
      flat10Count,
      flat15Count,
      fullScholarshipCount,
      whatsappPercent: total > 0 ? Math.round((whatsappCount / total) * 100) : 0,
      whatsappCount,
      pendingRemarks,
      highRiskCount,
      mediumRiskCount
    };
  }, [data]);

  // Dynamic summary filter list unique values
  const summaryFiltersOptions = useMemo(() => {
    return {
      regions: ['All', ...Array.from(new Set(data.map(item => item.region).filter(Boolean)))].sort(),
      centers: ['All', ...Array.from(new Set(data.map(item => item.center).filter(Boolean)))].sort(),
      buildings: ['All', ...Array.from(new Set(data.map(item => item.building).filter(Boolean)))].sort(),
      classes: ['All', ...Array.from(new Set(data.map(item => item.class).filter(Boolean)))].sort(),
      ptmStatuses: ['All', ...Array.from(new Set(data.map(item => item.ptmStatus).filter(Boolean)))].sort(),
      risks: ['All', 'High', 'Medium', 'Low', 'Unrated'],
      retentions: ['All', 'Ready to get retained', 'Retained', 'Not Retained', 'Extra Scholarship Required', 'Pending']
    };
  }, [data]);

  // Filtered dataset specifically computed for the Summary view
  const filteredSummaryData = useMemo(() => {
    return data.filter(item => {
      if (summaryRegion !== 'All' && item.region !== summaryRegion) return false;
      if (summaryCenter !== 'All' && item.center !== summaryCenter) return false;
      if (summaryBuilding !== 'All' && item.building !== summaryBuilding) return false;
      if (summaryClass !== 'All' && item.class !== summaryClass) return false;
      if (summaryPtmStatus !== 'All' && item.ptmStatus !== summaryPtmStatus) return false;
      if (summaryRisk !== 'All') {
        if (summaryRisk === 'Unrated' && item.retentionProbability) return false;
        if (summaryRisk !== 'Unrated' && item.retentionProbability !== summaryRisk) return false;
      }
      if (summaryRetention !== 'All') {
        const status = item.finalRetentionStatus || 'Pending';
        if (summaryRetention === 'Ready to get retained' || summaryRetention === 'Retained') {
          if (status !== 'Ready to get retained' && status !== 'Retained') return false;
        } else if (status !== summaryRetention) {
          return false;
        }
      }
      return true;
    });
  }, [data, summaryRegion, summaryCenter, summaryBuilding, summaryClass, summaryRisk, summaryPtmStatus, summaryRetention]);

  // Core statistical cuts calculation logic for the selected dimensions
  const getCutsForField = useCallback((field: keyof StudentScholarshipRow) => {
    const groups: { [key: string]: { total: number; retained: number; notRetained: number; extraReq: number; pending: number; whatsapp: number; ptmDone: number; highRisk: number } } = {};
    
    filteredSummaryData.forEach(item => {
      let val = String(item[field] || '').trim();
      if (field === 'counselorName' && !val) {
        const mapping = userRolesList.find(m => m.regno === item.regNo);
        val = mapping?.counselorId?.trim() || '';
      }
      if (!val) {
        val = 'Unassigned';
      }
      if (!groups[val]) {
        groups[val] = { total: 0, retained: 0, notRetained: 0, extraReq: 0, pending: 0, whatsapp: 0, ptmDone: 0, highRisk: 0 };
      }
      const g = groups[val];
      g.total += 1;
      
      const status = item.finalRetentionStatus || 'Pending';
      if (status === 'Ready to get retained' || status === 'Retained') g.retained += 1;
      else if (status === 'Not Retained') g.notRetained += 1;
      else if (status === 'Extra Scholarship Required') g.extraReq += 1;
      else g.pending += 1;

      if (item.whatsappIntimation) g.whatsapp += 1;
      if (item.ptmStatus && (item.ptmStatus.toLowerCase().includes('done') || item.ptmStatus.toLowerCase().includes('completed') || item.ptmStatus.toLowerCase().includes('conducted'))) g.ptmDone += 1;
      if (item.retentionProbability === 'Low') g.highRisk += 1;
    });

    return Object.entries(groups).map(([key, stats]) => ({
      key,
      ...stats,
      retentionRate: stats.total > 0 ? Math.round((stats.retained / stats.total) * 100) : 0,
      whatsappRate: stats.total > 0 ? Math.round((stats.whatsapp / stats.total) * 100) : 0,
      ptmRate: stats.total > 0 ? Math.round((stats.ptmDone / stats.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total); // Sort by total student count descending
  }, [filteredSummaryData, userRolesList]);

  // Hierarchical Drill Down structure: Region -> Center -> Building -> Class
  const hierarchicalCuts = useMemo((): { [name: string]: RegionNode } => {
    const tree: { [name: string]: RegionNode } = {};

    filteredSummaryData.forEach(item => {
      const r = (item.region || 'Unassigned Region').trim();
      const c = (item.center || 'Unassigned Center').trim();
      const b = (item.building || 'Unassigned Building').trim();
      const cl = (item.class || 'Unassigned Class').trim();

      const mapping = userRolesList.find(m => m.regno === item.regNo);

      if (!tree[r]) {
        tree[r] = { total: 0, retained: 0, notRetained: 0, extraReq: 0, pending: 0, whatsapp: 0, ptmDone: 0, rahs: [], rfhs: [], centers: {}, students: [] };
      }
      if (!tree[r].centers[c]) {
        tree[r].centers[c] = { total: 0, retained: 0, notRetained: 0, extraReq: 0, pending: 0, whatsapp: 0, ptmDone: 0, chs: [], rfhs: [], buildings: {}, students: [] };
      }
      if (!tree[r].centers[c].buildings[b]) {
        tree[r].centers[c].buildings[b] = { total: 0, retained: 0, notRetained: 0, extraReq: 0, pending: 0, whatsapp: 0, ptmDone: 0, fhs: [], chs: [], classes: {}, students: [] };
      }
      if (!tree[r].centers[c].buildings[b].classes[cl]) {
        tree[r].centers[c].buildings[b].classes[cl] = { total: 0, retained: 0, notRetained: 0, extraReq: 0, pending: 0, whatsapp: 0, ptmDone: 0, mentors: [], counselors: [], students: [] };
      }

      const addUnique = (arr: string[], email: string | undefined) => {
        if (email && email.trim() && !arr.includes(email.trim().toLowerCase())) {
          arr.push(email.trim().toLowerCase());
        }
      };

      if (mapping) {
        addUnique(tree[r].rahs, mapping.rahMailid);
        addUnique(tree[r].rfhs, mapping.rfhMailid);
        addUnique(tree[r].centers[c].chs, mapping.chMailid);
        addUnique(tree[r].centers[c].rfhs, mapping.rfhMailid);
        addUnique(tree[r].centers[c].buildings[b].fhs, mapping.fhMailid);
        addUnique(tree[r].centers[c].buildings[b].chs, mapping.chMailid);
        addUnique(tree[r].centers[c].buildings[b].classes[cl].mentors, mapping.mentorId);
        addUnique(tree[r].centers[c].buildings[b].classes[cl].counselors, mapping.counselorId);
      }
      
      if (item.counselorName) addUnique(tree[r].centers[c].buildings[b].classes[cl].counselors, item.counselorName);
      if (item.mentorMailid) addUnique(tree[r].centers[c].buildings[b].classes[cl].mentors, item.mentorMailid);

      const studentObj: AtRiskStudent = {
        regNo: item.regNo,
        studentName: item.studentName || 'Unknown Student',
        risk: item.retentionProbability || 'High', // Probability of retention (High, Medium, Low)
        ptmStatus: item.ptmStatus || 'Pending',
        remarks: item.parentRemarks || '',
        discontinueReason: item.discontinueReason || '',
        scholarship: item.scholarship || '',
        proposedScholarship: item.proposedScholarship || '',
        status: item.finalRetentionStatus || 'Pending'
      };

      const incrementStats = (g: TreeStats) => {
        g.total += 1;
        const status = item.finalRetentionStatus || 'Pending';
        if (status === 'Ready to get retained' || status === 'Retained') g.retained += 1;
        else if (status === 'Not Retained') g.notRetained += 1;
        else if (status === 'Extra Scholarship Required') g.extraReq += 1;
        else g.pending += 1;

        if (item.whatsappIntimation) g.whatsapp += 1;
        if (item.ptmStatus && (item.ptmStatus.toLowerCase().includes('done') || item.ptmStatus.toLowerCase().includes('completed') || item.ptmStatus.toLowerCase().includes('conducted'))) {
          g.ptmDone += 1;
        }
        g.students.push(studentObj);
      };

      incrementStats(tree[r]);
      incrementStats(tree[r].centers[c]);
      incrementStats(tree[r].centers[c].buildings[b]);
      incrementStats(tree[r].centers[c].buildings[b].classes[cl]);
    });

    return tree;
  }, [filteredSummaryData, userRolesList]);

  // Helper to render role mapping badges cleanly in the summary table
  const renderRoleBadges = useCallback((roleName: string, list: string[], colorClass: string) => {
    if (list.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 items-center">
        <span className="text-[9px] font-extrabold uppercase px-1 py-0.5 rounded-xs bg-stone-100 text-stone-500 border border-stone-200 select-none shrink-0">{roleName}</span>
        {list.map(email => {
          const displayPart = email.includes('@') ? email.split('@')[0] : email;
          return (
            <span key={email} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md truncate max-w-[120px] select-all shrink-0 ${colorClass}`} title={email}>
              {displayPart}
            </span>
          );
        })}
      </div>
    );
  }, []);

  const renderPerspectiveDropdown = useCallback((node: TreeStats) => {
    if (!node.students || node.students.length === 0) {
      return (
        <span className="text-stone-400 italic text-[11px]">-</span>
      );
    }

    const studentsWithIssues = node.students.filter(
      s => s.status === 'Not Retained' || s.status === 'Extra Scholarship Required' || s.risk === 'Low' || s.risk === 'Medium' || s.remarks || s.discontinueReason
    );

    const normalStudents = node.students.filter(
      s => !(s.status === 'Not Retained' || s.status === 'Extra Scholarship Required' || s.risk === 'Low' || s.risk === 'Medium' || s.remarks || s.discontinueReason)
    );

    return (
      <div className="min-w-[170px] max-w-[220px] mx-auto" onClick={e => e.stopPropagation()}>
        <select
          className="w-full text-[11px] font-sans border border-[#ECE0CE] bg-white rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#8C764D] text-stone-700 cursor-pointer shadow-xs font-semibold"
          value={selectedPerspectiveRegNo && node.students.some(s => s.regNo === selectedPerspectiveRegNo) ? selectedPerspectiveRegNo : ""}
          onChange={(e) => {
            setSelectedPerspectiveRegNo(e.target.value || null);
          }}
        >
          <option value="">
            👥 Audit ({node.students.length} Total, {studentsWithIssues.length} Alert)
          </option>
          
          {studentsWithIssues.length > 0 && (
            <optgroup label="⚠️ Alerts / Retention Issues">
              {studentsWithIssues.map(s => {
                const riskLabel = s.risk === 'Low' ? 'High Risk' : s.risk === 'Medium' ? 'Med Risk' : 'Low Risk';
                return (
                  <option key={s.regNo} value={s.regNo} className="text-[#A25A38]">
                    ⚠️ {s.studentName} ({s.regNo}) | {s.status} | {riskLabel}
                  </option>
                );
              })}
            </optgroup>
          )}
          
          {normalStudents.length > 0 && (
            <optgroup label="✅ Retained or Healthy">
              {normalStudents.map(s => (
                <option key={s.regNo} value={s.regNo}>
                  {s.studentName} ({s.regNo}) | {s.status}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    );
  }, [selectedPerspectiveRegNo]);

  // Handle single cell edit
  const handleCellChange = <K extends keyof StudentScholarshipRow>(
    id: string, 
    key: K, 
    value: StudentScholarshipRow[K]
  ) => {
    const student = data.find(s => s.id === id);
    if (!student) return;

    // Enforce role edit permissions
    if (!canEditField(key, student)) {
      triggerBanner(`Action Denied: Your simulated role (${userRole}) is not permitted to edit this field (${String(key)}).`, 'error');
      return;
    }

    // Custom workflow quota validation & auto-routing helpers
    if (key === 'proposedScholarship') {
      const isRAH = isMoveToRAH(student.scholarship || '', value as string);
      let routingInfo = '';
      if (!value) {
        routingInfo = 'No extra scholarship proposed.';
      } else if (isRAH) {
        routingInfo = `Proposing extra demand "${value}". This is a RAH case (over 10% or flat). Routed to Regional Academic Head (RAH).`;
      } else {
        routingInfo = `Proposing extra demand "${value}". This is a CH case (<= 10%). Routed to Center Head (CH).`;
      }
      triggerBanner(routingInfo, 'info');
    }

    if (key === 'extraScholarshipStatus') {
      const isRAH = isMoveToRAH(student.scholarship || '', student.proposedScholarship || '');
      if (value === 'Approved') {
        if (!isRAH) {
          if (centerQuotaInfo.remaining <= 0) {
            triggerBanner(`Warning: Approving this case exceeds Center Head 3% remaining cases quota. Approved as Central/CH Override.`, 'info');
          } else {
            triggerBanner(`Approved: Successfully utilized 1 case from Center Head 3% cases quota.`, 'success');
          }
        }
      } else if (value === 'Rejected') {
        triggerBanner('Proposal Rejected by CH.', 'info');
      } else if (value === 'InProgress') {
        triggerBanner('Status marked as InProgress.', 'info');
      }
    }

    if (key === 'rahStatus') {
      const isRAH = isMoveToRAH(student.scholarship || '', student.proposedScholarship || '');
      if (value === 'Approved') {
        if (isRAH) {
          if (regionQuotaInfo.remaining <= 0) {
            triggerBanner(`Warning: Approving this case exceeds Regional Head 1% remaining cases quota. Approved as Central/RAH Override.`, 'info');
          } else {
            triggerBanner(`Approved: Successfully utilized 1 case from Regional Head 1% cases quota.`, 'success');
          }
        }
      } else if (value === 'Rejected') {
        triggerBanner('Proposal Rejected by RAH.', 'info');
      } else if (value === 'InProgress') {
        triggerBanner('Status marked as InProgress.', 'info');
      }
    }

    const oldValue = student[key];
    addLog(
      'UPDATE',
      `Updated field "${String(key)}" from "${oldValue === true ? 'Yes' : oldValue === false ? 'No' : oldValue || 'Empty'}" to "${value === true ? 'Yes' : value === false ? 'No' : value || 'Empty'}".`,
      `${student.studentName} (${student.regNo})`
    );

    setData(prev => prev.map(row => {
      if (row.id === id) {
        let updated = { ...row, [key]: value };

        // Handle field dependency logic for Parent Remarks -> Discontinue Reason
        if (key === 'parentRemarks') {
          const isDropoutEnabled = isDropoutReasonEnabled(value as string);
          if (!isDropoutEnabled) {
            updated.discontinueReason = '';
          }
        }

        // Handle field dependency logic for Final Retention Status -> Extra Scholarship fields
        if (key === 'finalRetentionStatus') {
          if (value !== 'Extra Scholarship Required') {
            updated.proposedScholarship = '';
            updated.extraScholarshipStatus = '';
            updated.rahStatus = '';
            updated.finalScholarship = row.scholarship || '';
          }
        }

        // Auto-compute final scholarship when status or proposed value changes
        if (key === 'extraScholarshipStatus' || key === 'rahStatus' || key === 'proposedScholarship' || key === 'scholarship') {
          const targetCHStatus = key === 'extraScholarshipStatus' ? (value as string) : row.extraScholarshipStatus;
          const targetRAHStatus = key === 'rahStatus' ? (value as string) : row.rahStatus;
          const targetProposed = key === 'proposedScholarship' ? (value as string) : row.proposedScholarship;
          const targetOriginal = key === 'scholarship' ? (value as string) : row.scholarship;

          const isRAH = isMoveToRAH(targetOriginal, targetProposed);
          const isApproved = isRAH ? (targetRAHStatus === 'Approved') : (targetCHStatus === 'Approved');

          if (isApproved) {
            if (targetProposed) {
              const isFlat = isFlatScholarship(targetOriginal) || isFlatScholarship(targetProposed);
              if (isFlat) {
                updated.finalScholarship = formatFlatScholarship(targetProposed);
              } else {
                const basePct = getScholarshipInPct(targetOriginal || '');
                const extraPct = getScholarshipInPct(targetProposed || '');
                if (basePct > 0 && extraPct > 0) {
                  updated.finalScholarship = `${basePct + extraPct}% on Tuition Fees`;
                } else {
                  updated.finalScholarship = `${targetOriginal} + ${targetProposed}`;
                }
              }
            } else {
              updated.finalScholarship = targetOriginal;
            }
          } else {
            updated.finalScholarship = targetOriginal;
          }
        }
        // Save to Firestore
        saveStudentInFirestore(updated, student).catch(err => console.error("Cloud update student error:", err));
        return updated;
      }
      return row;
    }));
  };

  // Reset to original data
  const handleResetData = () => {
    triggerConfirm(
      'Reset All Records',
      'Are you sure you want to reset all records back to the original template data? Any local edits will be completely cleared.',
      () => {
        setData(INITIAL_SCHOLARSHIP_DATA);
        setSelectedRowIds([]);
        addLog('RESET', 'Reset entire student scholarship database to initial 6 template profiles.');
        // Sync to Firestore
        resetAllStudentsInFirestore().catch(err => console.error("Cloud reset students error:", err));
        triggerBanner('Dataset reset to original 6 student profiles', 'info');
      }
    );
  };

  // Clear all student profiles from master database
  const handleClearAllStudents = () => {
    const totalCount = data.length;
    if (totalCount === 0) {
      triggerBanner('No student profiles found to clear.', 'info');
      return;
    }

    triggerConfirm(
      '⚠️ CLEAR ALL STUDENT PROFILES',
      `Are you sure you want to permanently delete ALL ${totalCount} student records from the database? This action is IRREVERSIBLE.`,
      () => {
        setData([]);
        setSelectedRowIds([]);
        setSelectedStudentId(null);
        
        // Sync clear to Firestore
        import('firebase/firestore').then(async ({ getDocs, collection, writeBatch }) => {
          try {
            const snapshot = await getDocs(collection(db, 'classes'));
            const batch = writeBatch(db);
            snapshot.forEach(docSnap => {
              batch.delete(docSnap.ref);
            });
            await batch.commit();
            triggerBanner('Permanently deleted all student records from database.', 'success');
            addLog('CLEAR_ALL', `Permanently deleted all ${totalCount} student records from master database.`);
          } catch (error) {
            console.error("Cloud clear all students error:", error);
            triggerBanner('Failed to clear database in cloud.', 'error');
          }
        }).catch(err => {
          console.error("Failed to load firebase/firestore dynamically:", err);
          triggerBanner('Failed to clear database.', 'error');
        });
      }
    );
  };

  // Delete only currently filtered student profiles
  const handleDeleteFilteredStudents = () => {
    const count = filteredData.length;
    if (count === 0) {
      triggerBanner('No active student records match your current filters.', 'info');
      return;
    }

    const activeFilters = [
      searchQuery ? `Search: "${searchQuery}"` : null,
      selectedCenter !== 'All' ? `Center: "${selectedCenter}"` : null,
      selectedScholarship !== 'All' ? `Scholarship: "${selectedScholarship}"` : null,
      selectedRetention !== 'All' ? `Retention: "${selectedRetention}"` : null,
      selectedWhatsApp !== 'All' ? `WhatsApp: "${selectedWhatsApp}"` : null,
      selectedAdmissionStatus !== 'All' ? `Admission: "${selectedAdmissionStatus}"` : null,
      selectedPendency !== 'All' ? `Pendency: "${selectedPendency}"` : null
    ].filter(Boolean).join(', ');

    triggerConfirm(
      'Delete Filtered Students',
      `Are you sure you want to delete only the ${count} student profiles matching active filters (${activeFilters || 'all active'})? This action cannot be undone.`,
      () => {
        const idsToDelete = filteredData.map(f => f.id);
        setData(prev => prev.filter(row => !idsToDelete.includes(row.id)));
        setSelectedRowIds(prev => prev.filter(id => !idsToDelete.includes(id)));
        if (selectedStudentId && idsToDelete.includes(selectedStudentId)) {
          setSelectedStudentId(null);
        }

        // Delete each of these filtered students in Firestore
        Promise.all(filteredData.map(student => deleteStudentInFirestore(student)))
          .then(() => {
            triggerBanner(`Successfully deleted ${count} matching student profiles.`, 'success');
            addLog('DELETE_FILTERED', `Deleted ${count} student records via filtered discard.`);
          })
          .catch(err => {
            console.error("Failed to delete filtered students in cloud:", err);
            triggerBanner('Partially failed to delete some records in cloud.', 'error');
          });
      }
    );
  };

  // Bulk delete selected students
  const handleBulkDeleteSelected = () => {
    const count = selectedRowIds.length;
    if (count === 0) {
      triggerBanner('Please select at least 1 student first', 'error');
      return;
    }

    triggerConfirm(
      'Bulk Discard Selected Students',
      `Are you sure you want to permanently discard the ${count} selected student profiles? This action cannot be undone.`,
      () => {
        const selectedStudents = data.filter(s => selectedRowIds.includes(s.id));
        setData(prev => prev.filter(row => !selectedRowIds.includes(row.id)));
        setSelectedRowIds([]);
        if (selectedStudentId && selectedRowIds.includes(selectedStudentId)) {
          setSelectedStudentId(null);
        }

        // Delete each selected student in Firestore
        Promise.all(selectedStudents.map(student => deleteStudentInFirestore(student)))
          .then(() => {
            triggerBanner(`Successfully deleted ${count} selected student profiles.`, 'success');
            addLog('BULK_DELETE', `Bulk discarded ${count} student profiles.`);
          })
          .catch(err => {
            console.error("Bulk delete students error:", err);
            triggerBanner('Partially failed to delete some profiles in cloud.', 'error');
          });
      }
    );
  };

  // Delete a student
  const handleDeleteRow = (id: string, name: string) => {
    const student = data.find(s => s.id === id);
    const regNo = student ? student.regNo : '';
    triggerConfirm(
      'Delete Scholar Profile',
      `Are you sure you want to delete ${name}'s scholarship record? This action cannot be undone.`,
      () => {
        setData(prev => prev.filter(row => row.id !== id));
        setSelectedRowIds(prev => prev.filter(item => item !== id));
        if (selectedStudentId === id) setSelectedStudentId(null);
        // Sync delete to Firestore
        if (student) {
          deleteStudentInFirestore(student).catch(err => console.error("Cloud delete student error:", err));
        }
        addLog('DELETE', `Deleted student profile: ${name} (Reg No: ${regNo || 'N/A'})`, `${name} (${regNo || 'N/A'})`);
        triggerBanner(`Deleted ${name} is removed from tracker.`, 'error');
      }
    );
  };

  // Bulk operation apply
  const handleApplyBulk = () => {
    if (selectedRowIds.length === 0) {
      triggerBanner('Please select at least 1 student first', 'error');
      return;
    }

    const updatedStudents: StudentScholarshipRow[] = [];
    setData(prev => prev.map(row => {
      if (selectedRowIds.includes(row.id)) {
        const updated = { ...row };
        if (bulkWhatsApp !== null) {
          updated.whatsappIntimation = bulkWhatsApp;
        }
        if (bulkPTMStatus.trim()) {
          updated.ptmStatus = bulkPTMStatus;
        }
        if (bulkRetention.trim()) {
          updated.retentionProbability = bulkRetention as any;
        }
        updatedStudents.push(updated);
        return updated;
      }
      return row;
    }));

    if (updatedStudents.length > 0) {
      saveBulkStudentsInFirestore(updatedStudents).catch(err => console.error("Bulk cloud save failed:", err));
    }

    const itemsText = [];
    if (bulkWhatsApp !== null) itemsText.push(`WhatsApp Intimation: ${bulkWhatsApp ? 'Yes' : 'No'}`);
    if (bulkPTMStatus.trim()) itemsText.push(`PTM Status: "${bulkPTMStatus}"`);
    if (bulkRetention.trim()) itemsText.push(`Retention Risk: "${bulkRetention}"`);
    
    addLog(
      'UPDATE', 
      `Applied bulk edits [${itemsText.join(', ')}] to ${selectedRowIds.length} student records.`,
      `${selectedRowIds.length} students`
    );

    triggerBanner(`Applied updates to ${selectedRowIds.length} selected students`, 'success');
    setSelectedRowIds([]);
    setIsBulkEditOpen(false);
    // Reset bulk form
    setBulkWhatsApp(null);
    setBulkPTMStatus('');
    setBulkRetention('');
  };

  // Full Row Edit Form state for Details sidebar
  const activeStudent = useMemo(() => {
    return data.find(s => s.id === selectedStudentId) || null;
  }, [data, selectedStudentId]);

  // Dialog Add Form state
  const [newStudent, setNewStudent] = useState<Partial<StudentScholarshipRow>>({
    region: 'PB + J&K',
    center: 'Anantnag Vidyapeeth',
    building: 'Anantnag Vidyapeeth',
    studentName: '',
    regNo: '',
    batchName: '90-UF101ES',
    class: '10th',
    scholarship: 'Flat 15k',
    mentor: 'Umar Sir',
    mentorMailid: 'umar.lone@pw.live',
    pwid: 'Pw30917',
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
  });

  const handleAddStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.studentName?.trim() || !newStudent.regNo?.trim()) {
      triggerBanner('Student Name and Registration Number are required!', 'error');
      return;
    }

    const rowToAdd: StudentScholarshipRow = {
      id: `student-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      region: newStudent.region || 'PB + J&K',
      center: newStudent.center || '',
      building: newStudent.building || '',
      studentName: newStudent.studentName || '',
      regNo: newStudent.regNo || '',
      batchName: newStudent.batchName || '',
      class: newStudent.class || '10th',
      scholarship: newStudent.scholarship || 'Flat 15k',
      mentor: newStudent.mentor || '',
      mentorMailid: newStudent.mentorMailid || '',
      pwid: newStudent.pwid || '',
      whatsappIntimation: !!newStudent.whatsappIntimation,
      ptmStatus: newStudent.ptmStatus || '',
      parentRemarks: newStudent.parentRemarks || '',
      paymentDate: newStudent.paymentDate || '',
      discontinueReason: newStudent.discontinueReason || '',
      retentionProbability: (newStudent.retentionProbability as any) || '',
      proposedScholarship: newStudent.proposedScholarship || '',
      extraScholarshipDemand: !!newStudent.extraScholarshipDemand,
      extraScholarshipStatus: (newStudent.extraScholarshipStatus as any) || '',
      rahStatus: (newStudent.rahStatus as any) || '',
      finalRetentionStatus: newStudent.finalRetentionStatus || '',
      finalScholarship: newStudent.finalScholarship || newStudent.scholarship || '',
      counselorName: newStudent.counselorName || '',
      counselorPwid: newStudent.counselorPwid || '',
      newRegno: newStudent.newRegno || '',
      counselorStatus: (newStudent as any).counselorStatus || '',
    };

    setData(prev => [rowToAdd, ...prev]);
    saveStudentInFirestore(rowToAdd).catch(err => console.error("Cloud save student error:", err));
    setIsAddOpen(false);
    addLog('CREATE', `Created student profile: ${rowToAdd.studentName} (Reg No: ${rowToAdd.regNo}) for Center "${rowToAdd.center}" and Class ${rowToAdd.class}.`, `${rowToAdd.studentName} (${rowToAdd.regNo})`);
    triggerBanner(`Added ${rowToAdd.studentName} to the tracker successfully`, 'success');
    // Reset state
    setNewStudent({
      region: 'PB + J&K',
      center: 'Anantnag Vidyapeeth',
      building: 'Anantnag Vidyapeeth',
      studentName: '',
      regNo: '',
      batchName: '90-UF101ES',
      class: '10th',
      scholarship: 'Flat 15k',
      mentor: 'Umar Sir',
      mentorMailid: 'umar.lone@pw.live',
      pwid: 'Pw30917',
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
    });
  };

  // Filter and Search logic
  const filteredData = useMemo(() => {
    return data.filter(row => {
      // 1. Role-based visibility scoping
      if (userRole !== 'Central') {
        const currentEmail = activeEmail.toLowerCase().trim();
        let emailMatchedInRow = false;
        
        // Check userRolesList mapping for this student (matches via registration number)
        const mapping = userRolesList.find(m => m.regno === row.regNo);
        if (mapping) {
          const rah = (mapping.rahMailid || '').toLowerCase().trim();
          const rfh = (mapping.rfhMailid || '').toLowerCase().trim();
          const ch = (mapping.chMailid || '').toLowerCase().trim();
          const fh = (mapping.fhMailid || '').toLowerCase().trim();
          const mentor = (mapping.mentorId || '').toLowerCase().trim();
          const counselor = (mapping.counselorId || '').toLowerCase().trim();

          if (
            rah === currentEmail ||
            rfh === currentEmail ||
            ch === currentEmail ||
            fh === currentEmail ||
            mentor === currentEmail ||
            counselor === currentEmail
          ) {
            emailMatchedInRow = true;
          }
        }

        // Fallback: Also check if active email is written inside any string property of the row (e.g. mentorMailid or other cell)
        if (!emailMatchedInRow) {
          for (const val of Object.values(row)) {
            if (typeof val === 'string' && val.toLowerCase().trim().includes(currentEmail)) {
              emailMatchedInRow = true;
              break;
            }
          }
        }
        
        if (!emailMatchedInRow) {
          return false;
        }
      }

      // 2. Search Box matching Name, RegNo, Batch, Mentor, Counselor
      const query = searchQuery.toLowerCase().trim();
      if (query !== '') {
        const matchesSearch = 
          row.studentName.toLowerCase().includes(query) ||
          row.regNo.toLowerCase().includes(query) ||
          row.batchName.toLowerCase().includes(query) ||
          row.mentor.toLowerCase().includes(query) ||
          row.counselorName.toLowerCase().includes(query) ||
          row.newRegno.toLowerCase().includes(query) ||
          row.parentRemarks.toLowerCase().includes(query);
          
        if (!matchesSearch) return false;
      }

      // 3. Center Filter (only meaningful if not restricted to center by role)
      if (userRole !== 'CH' && userRole !== 'FH' && userRole !== 'Mentor' && selectedCenter !== 'All' && row.center !== selectedCenter) return false;

      // 4. Scholarship Filter
      if (selectedScholarship !== 'All') {
        if ((row.scholarship || '').trim().toLowerCase() !== selectedScholarship.trim().toLowerCase()) return false;
      }

      // 5. Retention Filter
      if (selectedRetention !== 'All') {
        if (selectedRetention === 'Not Set' && row.retentionProbability !== '') return false;
        if (selectedRetention !== 'Not Set' && row.retentionProbability !== selectedRetention) return false;
      }

      // 6. WhatsApp Filter
      if (selectedWhatsApp !== 'All') {
        const isTrue = selectedWhatsApp === 'Sent';
        if (row.whatsappIntimation !== isTrue) return false;
      }

      // 7. Admission Status Filter
      if (selectedAdmissionStatus !== 'All') {
        const hasRegNo = !!(row.newRegno && row.newRegno.trim());
        if (selectedAdmissionStatus === 'Taken' && !hasRegNo) return false;
        if (selectedAdmissionStatus === 'Pending' && hasRegNo) return false;
      }

      // 8. Pendency Filter
      if (selectedPendency !== 'All') {
        const currentPendency = getStudentPendency(row);
        if (currentPendency !== selectedPendency) return false;
      }

      // 9. Work Status Filter (unworked vs worked)
      if (selectedWorkStatus !== 'All') {
        const untouched = isUnworked(row);
        if (selectedWorkStatus === 'Unworked' && !untouched) return false;
        if (selectedWorkStatus === 'Worked' && untouched) return false;
      }

      return true;
    });
  }, [data, searchQuery, selectedCenter, selectedScholarship, selectedRetention, selectedWhatsApp, selectedAdmissionStatus, selectedPendency, selectedWorkStatus, getStudentPendency, isUnworked, userRole, simulatedRegion, simulatedCenter, simulatedMentor, activeEmail, userRolesList]);

  // Dynamic Scorecard statistics based on active filters and role permission level
  const filteredStats = useMemo(() => {
    const total = filteredData.length;
    
    // 2. Re-enrolled count based on new registration ID
    const reEnrolledCount = filteredData.filter(s => s.newRegno && s.newRegno.trim() !== '').length;
    const retentionRate = total > 0 ? Math.round((reEnrolledCount / total) * 100) : 0;
    
    // 3. Not Retained count and dropout reasons breakdown
    const notRetainedCount = filteredData.filter(s => s.finalRetentionStatus === 'Not Retained').length;
    
    // Compute reasons count for Not Retained students
    const dropoutReasonsMap: { [reason: string]: number } = {};
    filteredData.forEach(s => {
      if (s.finalRetentionStatus === 'Not Retained') {
        const r = (s.discontinueReason || 'Unspecified').trim() || 'Unspecified';
        dropoutReasonsMap[r] = (dropoutReasonsMap[r] || 0) + 1;
      }
    });
    
    // Sort reasons by frequency
    const sortedDropoutReasons = Object.entries(dropoutReasonsMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // 4. WhatsApp intimated
    const whatsappCount = filteredData.filter(s => s.whatsappIntimation).length;
    const whatsappRate = total > 0 ? Math.round((whatsappCount / total) * 100) : 0;

    // 5. High Risk (Low retention probability)
    const highRiskCount = filteredData.filter(s => s.retentionProbability === 'Low').length;
    const mediumRiskCount = filteredData.filter(s => s.retentionProbability === 'Medium').length;

    // 6. Unworked Reg Nos (untouched by any counselor)
    const unworkedCount = filteredData.filter(s => isUnworked(s)).length;
    const unworkedRate = total > 0 ? Math.round((unworkedCount / total) * 100) : 0;

    return {
      total,
      reEnrolledCount,
      retentionRate,
      notRetainedCount,
      sortedDropoutReasons,
      whatsappCount,
      whatsappRate,
      highRiskCount,
      mediumRiskCount,
      unworkedCount,
      unworkedRate
    };
  }, [filteredData, isUnworked]);

  // Export as CSV File
  const handleExportCSV = () => {
    const headers = [
      'Region', 'Center', 'Building', 'Student Name', 'Reg No', 'Batch Name', 'Class', 'Scholarship',
      'Mentor', 'Mentor Mailid', 'PWID', 'WhatsApp Intimation Sent', 'PTM Status', 'Parent Remarks by Mentor',
      'Admission Date given by parents', 'Reason why discontinue', 'Probability of Retention'
    ];

    if (userRole !== 'Mentor') {
      headers.push('Extra Scholarship Demand by Parents');
    }
    if (userRole !== 'FH' && userRole !== 'Mentor') {
      headers.push('Extra Scholarship Status');
    }
    headers.push('Final Retention Status by Mentor');
    if (userRole !== 'Mentor') {
      headers.push('Final Scholarship');
    }
    headers.push('Counselor Name', 'Counselor PWID', 'New Regno', 'Counselor Status');

    const rows = filteredData.map(row => {
      const line = [
        row.region, row.center, row.building, row.studentName, row.regNo, row.batchName, row.class, row.scholarship,
        row.mentor, row.mentorMailid, row.pwid, row.whatsappIntimation ? 'TRUE' : 'FALSE', row.ptmStatus, row.parentRemarks,
        row.paymentDate, row.discontinueReason, row.retentionProbability
      ];
      if (userRole !== 'Mentor') {
        line.push(row.proposedScholarship);
      }
      if (userRole !== 'FH' && userRole !== 'Mentor') {
        line.push(row.extraScholarshipStatus);
      }
      line.push(row.finalRetentionStatus);
      if (userRole !== 'Mentor') {
        line.push(row.finalScholarship);
      }
      line.push(row.counselorName, row.counselorPwid, row.newRegno, row.counselorStatus || '');
      return line;
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => {
          const formatted = (val || '').toString().replace(/"/g, '""');
          return `"${formatted}"`;
        }).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `PW_Scholarship_Retention_Data_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerBanner(`Exported ${filteredData.length} active rows to CSV spreadsheet`, 'success');
  };

  // Export as JSON File
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredData, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `PW_Scholarship_Data_Export.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerBanner(`Exported ${filteredData.length} active rows to JSON`, 'success');
  };

  const handleImportData = (importedRows: StudentScholarshipRow[], strategy: 'merge' | 'overwrite') => {
    if (strategy === 'overwrite') {
      setData(importedRows);
      addLog('IMPORT', `Spreadsheet Overwrite: Wiped and replaced entire master database with ${importedRows.length} imported records.`, `${importedRows.length} rows`);
      // Update in Firestore
      resetAllStudentsInFirestore().then(() => {
        saveBulkStudentsInFirestore(importedRows).catch(err => console.error("Import bulk overwrite failed:", err));
      }).catch(err => console.error("Import reset failed:", err));
      triggerBanner(`Successfully imported ${importedRows.length} records. Replaced entire database.`, 'success');
    } else {
      let finalMerged: StudentScholarshipRow[] = [];
      setData(prev => {
        const updated = [...prev];
        importedRows.forEach(importedRow => {
          const matchIndex = updated.findIndex(existingRow => {
            const extReg = (existingRow.regNo || '').trim().toLowerCase();
            const impReg = (importedRow.regNo || '').trim().toLowerCase();
            return extReg !== '' && extReg === impReg;
          });
          
          if (matchIndex !== -1) {
            const existingRow = updated[matchIndex];
            const mergedVal = { ...existingRow };
            
            Object.keys(importedRow).forEach(key => {
              const k = key as keyof StudentScholarshipRow;
              if (k !== 'id') {
                const val = importedRow[k];
                if (val !== undefined && val !== '' && val !== false) {
                  (mergedVal as any)[k] = val;
                }
              }
            });
            updated[matchIndex] = mergedVal;
          } else {
            updated.push(importedRow);
          }
        });
        finalMerged = updated;
        return updated;
      });
      // Save all merged and newly added items to Firestore in bulk
      setTimeout(() => {
        if (finalMerged.length > 0) {
          saveBulkStudentsInFirestore(finalMerged).catch(err => console.error("Import merge bulk save failed:", err));
        }
      }, 100);
      addLog('IMPORT', `Spreadsheet Merge: Successfully integrated and synced ${importedRows.length} spreadsheet records into the active database.`, `${importedRows.length} rows`);
      triggerBanner(`Successfully integrated ${importedRows.length} records into the active database.`, 'success');
    }
  };

  // Toggle selection check for a single row
  const toggleRowSelection = (id: string) => {
    setSelectedRowIds(prev => 
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  // Toggle global selection list
  const toggleAllSelection = () => {
    if (selectedRowIds.length === filteredData.length) {
      setSelectedRowIds([]);
    } else {
      setSelectedRowIds(filteredData.map(r => r.id));
    }
  };

  if (isLoadingCloud || isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#F4F1EA] text-stone-800 flex flex-col items-center justify-center font-sans antialiased">
        <div className="flex flex-col items-center p-8 bg-white border border-[#DDD5C5] rounded-3xl shadow-xl max-w-sm text-center relative overflow-hidden">
          {/* Decorative backdrop blobs */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#EAE5D9]/50 rounded-full blur-2xl -mr-16 -mt-16"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#FAF8F5]/80 rounded-full blur-xl -ml-16 -mb-16"></div>

          <div className="size-16 rounded-full bg-[#FAF8F5] border border-[#DDD5C5] flex items-center justify-center mb-5 animate-pulse shadow-xs relative">
            <ShieldCheck className="size-8 text-[#5A7060]" />
            <div className="absolute inset-0 rounded-full border border-[#5A7060]/30 animate-ping"></div>
          </div>
          
          <h1 className="font-sans font-bold text-lg tracking-tight text-[#425246] mb-2">Connecting to Cloud Database</h1>
          <p className="text-xs text-stone-600 leading-relaxed mb-6 font-medium">
            Synchronizing student retention records and audit trails securely with Firebase. Please wait a moment...
          </p>

          <div className="flex items-center gap-2 justify-center text-xs font-mono font-bold text-stone-500 bg-[#FAF8F5] border border-[#DDD5C5] px-4 py-2 rounded-xl">
            <span className="size-2 bg-[#5A7060] rounded-full animate-ping"></span>
            <span>STATUS: INITIALIZING</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#F4F1EA] text-stone-800 flex flex-col items-center justify-center font-sans p-4 antialiased selection:bg-[#5A7060]/20">
        <div className="w-full max-w-md bg-white border border-[#DDD5C5] rounded-3xl shadow-xl overflow-hidden relative flex flex-col">
          {/* Top Decorative bar */}
          <div className="h-2 bg-[#5A7060] w-full"></div>
          
          {/* Inner Content */}
          <div className="p-8 flex-1 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Logo / Header */}
              <div className="flex flex-col items-center text-center">
                <div className="size-14 rounded-2xl bg-[#5A7060]/10 flex items-center justify-center text-[#5A7060] mb-4 shadow-sm border border-[#5A7060]/10">
                  <ShieldAlert className="size-7" />
                </div>
                <h1 className="font-sans font-extrabold text-xl tracking-tight text-[#425246]">
                  Scholarship Retention Portal
                </h1>
                <p className="text-xs text-stone-500 font-mono font-bold mt-1 uppercase tracking-wider">
                  PW Foundation Vidyapeeth
                </p>
              </div>

              {/* Notice Banner */}
              <div className="bg-[#FAF8F5] border border-[#DDD5C5] p-4 rounded-2xl text-center space-y-1.5">
                <p className="text-xs font-bold text-stone-700 flex items-center justify-center gap-1">
                  <span>🔒 SECURE GATEWAY ACCESS</span>
                </p>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Only users registered in the active **Row Permissions Mapping** can access this application.
                </p>
              </div>

              {/* Google Sign-In & Admin Bypass Container */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isVerifyingLogin}
                  className="w-full bg-[#5A7060] hover:bg-[#495C4E] disabled:bg-[#5A7060]/60 text-white py-3 rounded-xl text-xs font-bold transition duration-150 flex items-center justify-center gap-2 shadow-sm cursor-pointer hover:shadow active:scale-[0.99]"
                >
                  {isVerifyingLogin ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Chrome className="w-4 h-4 shrink-0" />
                      <span>Sign in with Google Workspace</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-8 text-center text-[9px] text-stone-400 font-medium leading-relaxed">
              Kindly connect with Devansh Sharma (**devansh.sharma@pw.live**), Bipin Yadav (**bipin.yadav@pw.live**), or system admin if you require access mapping.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F1EA] text-stone-800 flex flex-col font-sans select-none antialiased">
      
      {/* Banner Notifications */}
      <AnimatePresence>
        {bannerMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium"
            style={{
              backgroundColor: bannerMessage.type === 'success' ? '#F4F7F2' : bannerMessage.type === 'error' ? '#FDF5F2' : '#F5F5FA',
              borderColor: bannerMessage.type === 'success' ? '#D1D9CD' : bannerMessage.type === 'error' ? '#F5DDD0' : '#E0DDE5',
              color: bannerMessage.type === 'success' ? '#425246' : bannerMessage.type === 'error' ? '#A25A38' : '#6A5F74',
            }}
          >
            {bannerMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[#5A7060] shrink-0" />}
            {bannerMessage.type === 'error' && <XCircle className="w-5 h-5 text-[#A25A38] shrink-0" />}
            {bannerMessage.type === 'info' && <Info className="w-5 h-5 text-[#6A5F74] shrink-0" />}
            <span>{bannerMessage.text}</span>
            <button onClick={() => setBannerMessage(null)} className="ml-2 hover:opacity-80">
              <X className="w-4 h-4 opacity-50 hover:opacity-100" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Header navigation */}
      <header className="sticky top-0 bg-[#FDFBF9] border-b border-[#E3DEC3] z-30 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-[#5A7060] text-white p-3 rounded-xl shadow-md shadow-[#5A7060]/10 flex items-center justify-center">
            <GraduationCap className="w-7 h-7" id="pw-logo-cap" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-serif font-bold tracking-tight text-[#2B3A2C]" id="app-title">
                PW Foundation Scholarship Tracker
              </h1>
              <span className="bg-[#ECEAE1] text-[#6E5D4F] text-[10px] font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider border border-[#D5D0C0]">
                FY26
              </span>
            </div>
            <p className="text-xs text-stone-500 font-medium">
              Academic Student Retention, WhatsApp Coordination & CH Approvals
            </p>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && (
            <>
              <button 
                type="button"
                onClick={() => setIsAddOpen(true)}
                className="flex items-center gap-1.5 bg-[#5A7060] text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-[#4E6052] transition shadow-xs cursor-pointer"
                id="add-student-btn"
              >
                <Plus className="w-4 h-4" /> Add Student
              </button>

              <button 
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="flex items-center gap-1.5 bg-[#FAF8F5] text-stone-700 border border-[#DDD5C5] px-4 py-2 rounded-xl text-xs font-semibold hover:bg-[#F2EDDF] transition shadow-xs cursor-pointer"
                id="import-data-btn"
              >
                <Upload className="w-4 h-4" /> Import Data
              </button>

              <button 
                type="button"
                onClick={() => setIsLogsOpen(true)}
                className="flex items-center gap-1.5 bg-[#FAF8F5] text-stone-700 border border-[#DDD5C5] px-4 py-2 rounded-xl text-xs font-semibold hover:bg-[#F2EDDF] transition shadow-xs cursor-pointer relative"
                id="history-logs-btn"
                title="View system change logs & audit trail"
              >
                <History className="w-4 h-4 text-[#5A7060]" /> 
                <span>History Logs</span>
                {logs.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#A25A38] text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center scale-90">
                    {logs.length > 99 ? '99+' : logs.length}
                  </span>
                )}
              </button>

              <button 
                type="button"
                onClick={() => setIsRoleModalOpen(true)}
                className="flex items-center gap-1.5 bg-[#FBF5EC] text-[#8C764D] border border-[#ECE0CE] hover:bg-[#F4EADA] transition px-4 py-2 rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
                id="role-permissions-btn"
                title="Manage user email role permission mapping"
              >
                <ShieldCheck className="w-4 h-4 text-[#8C764D]" /> 
                <span>Role Permissions</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={isAdmin ? () => setIsRoleModalOpen(true) : undefined}
            className={`flex items-center gap-2 bg-[#FAF8F5] border border-[#DDD5C5] px-3 py-1.5 rounded-xl transition text-left ${isAdmin ? 'hover:bg-[#F2EDDF] cursor-pointer' : 'cursor-default'}`}
            title={isAdmin ? "Click to view and configure user role permissions" : "Your active user profile info"}
          >
            <div className="w-6 h-6 rounded-full bg-[#5A7060]/10 flex items-center justify-center text-[#5A7060]">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="hidden md:block leading-none">
              <p className="text-[9px] font-extrabold text-stone-500 uppercase tracking-wider">Active User</p>
              <p className="text-[11px] font-bold text-stone-800 truncate max-w-[140px]">{activeEmail}</p>
            </div>
            <span className="bg-stone-200 border border-stone-300 text-stone-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm uppercase">
              {userRole}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerConfirm(
                'Disconnect Session',
                'Are you sure you want to end your current session and sign out?',
                async () => {
                  try {
                    await signOut(auth);
                  } catch (e) {
                    console.error("Failed to sign out from Firebase Auth:", e);
                  }
                  safeLocalStorage.removeItem('pw_scholarship_bypass_admin');
                  safeLocalStorage.removeItem('pw_scholarship_active_email');
                  setActiveEmail('');
                  setIsSandboxMode(false);
                  triggerBanner('You have been signed out successfully.', 'info');
                }
              );
            }}
            className="flex items-center gap-1.5 bg-[#FAF8F5] hover:bg-rose-50 border border-rose-200 text-rose-700 hover:text-rose-800 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
            title="Sign out of the current session"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-500" />
            <span className="hidden md:inline">Sign Out</span>
          </button>

          <div className="h-6 w-[1px] bg-[#E3DEC3] hidden sm:block"></div>

          <div className="flex items-center bg-[#FAF8F5] border border-[#DDD5C5] rounded-xl p-0.5 shadow-xs">
            <button 
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100/60 rounded-md transition"
              title="Download Microsoft Excel compatible CSV"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button 
              type="button"
              onClick={handleExportJSON}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100/60 rounded-md transition"
              title="Download complete JSON manifest"
            >
              JSON
            </button>
          </div>

          {isAdmin && (
            <>
              <button 
                type="button"
                onClick={handleResetData}
                className="bg-[#FAF8F5] text-[#5C4D3C] border border-[#DDD5C5] hover:bg-[#F2EDDF] hover:text-[#413524] px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                title="Reset data to initial foundation profiles"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Reset To Template</span>
              </button>

              <button 
                type="button"
                onClick={handleDeleteFilteredStudents}
                className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                title={`Delete only the ${filteredData.length} currently filtered student records`}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span className="hidden md:inline">Delete Filtered ({filteredData.length})</span>
              </button>

              <button 
                type="button"
                onClick={handleClearAllStudents}
                className="bg-red-600 text-white hover:bg-red-700 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                title={`Permanently delete all ${data.length} student records in the database`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Clear All Students ({data.length})</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Primary Navigation Tabs */}
      <div className="px-6 pt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setActiveView('database')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer shadow-xs border ${
            activeView === 'database'
              ? 'bg-[#5A7060] text-white border-[#5A7060]'
              : 'bg-[#FDFBF9] text-stone-600 border-[#E3DEC3] hover:bg-[#F2EDDF]'
          }`}
        >
          <Database className="w-4 h-4" />
          Student Retention Database
        </button>
        <button
          type="button"
          onClick={() => setActiveView('summary')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer shadow-xs border ${
            activeView === 'summary'
              ? 'bg-[#5A7060] text-white border-[#5A7060]'
              : 'bg-[#FDFBF9] text-stone-600 border-[#E3DEC3] hover:bg-[#F2EDDF]'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Summary Dashboard & Cuts
        </button>
      </div>

      {activeView === 'database' && (
        <>
          {/* Active Role Quota Status & Policies */}
          <section className="px-6 pt-5">
        <div className="bg-[#FDFBF9] border-2 border-[#E3DEC3] rounded-3xl p-5 shadow-sm">
          <div className="flex justify-between items-center gap-4 border-b border-[#E3DEC3]/60 pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-5 h-5 text-[#5A7060]" />
                <h2 className="font-serif font-bold text-[#2B3A2C] text-sm tracking-tight">Active User Role Quota Tracker</h2>
              </div>
              <p className="text-xs text-stone-500 font-semibold font-sans">
                Real-time tracking of approval quotas based on the current active email's mapped permissions.
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] bg-[#5A7060]/10 text-[#425246] font-bold px-2.5 py-1 rounded-xl">
                Mapped Role: {userRole}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Quota policy rules memo */}
            <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E3DEC3] flex flex-col justify-between">
              <div>
                <h3 className="text-[10px] font-extrabold text-stone-500 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                  <Percent className="w-3 h-3 text-[#5A7060]" /> Quota Policies
                </h3>
                <div className="space-y-2 text-[11px] text-stone-600 font-medium font-sans leading-relaxed">
                  <p>
                    ⚡ <strong className="text-stone-800 font-bold">Center Quota (3% cases):</strong> Capped at <strong className="text-stone-800 font-bold">3% of center student count</strong> as approved cases. Valid only for extra scholarship <strong className="text-[#324B37] font-bold">{"\u2264"} 10%</strong> (Tuition Fees).
                  </p>
                  <p>
                    🌍 <strong className="text-stone-800 font-bold">Region Quota (1% cases):</strong> Capped at <strong className="text-stone-800 font-bold">1% of region student count</strong> as approved cases. Handles cases <strong className="text-[#6B5A3A] font-bold">&gt; 10%</strong> and all <strong className="text-[#6B5A3A] font-bold">Flat</strong> proposals (unlimited approval value).
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-[#E3DEC3]/60 flex items-center gap-2 text-[10px] font-bold text-[#A25A38] bg-[#FAF0E4] p-1.5 rounded-lg border border-[#F5DDD0]">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>The system dynamically routes and monitors quotas in absolute case counts.</span>
              </div>
            </div>

            {/* CH Quota Widget */}
            <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E3DEC3] flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <h4 className="text-[11px] font-extrabold text-[#324B37] uppercase tracking-wider">CH Center Quota Status</h4>
                  <span className="text-[10px] bg-[#ECEFEA] border border-[#D1D9CD] text-[#425246] font-bold px-1.5 py-0.5 rounded-full">3% case limit</span>
                </div>
                <p className="text-[10px] text-stone-500 font-medium mb-3 truncate" title={centerQuotaInfo.centerName}>
                  Branch: <strong className="text-stone-800 font-bold">{centerQuotaInfo.centerName}</strong>
                </p>
                
                <div className="bg-[#E3DEC3]/40 rounded-xl p-3 border border-[#E3DEC3]/60 mb-3 space-y-1">
                  <div className="flex justify-between text-xs font-bold text-stone-700">
                    <span>Approved CH Cases:</span>
                    <span className="text-stone-900">{centerQuotaInfo.used} case(s)</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-stone-500 font-semibold">
                    <span>Center Max Cap:</span>
                    <span>{centerQuotaInfo.allowedLimit} case(s) max</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-[11px] font-bold text-stone-600 mb-1">
                  <span>Quota Spent: {centerQuotaInfo.percentUsed}%</span>
                  <span className="text-emerald-700">{centerQuotaInfo.remaining} case(s) remaining</span>
                </div>
                <div className="w-full bg-[#E5DFD0] rounded-full h-2 overflow-hidden border border-stone-200">
                  <div 
                    className="bg-[#5A7060] h-full rounded-full transition-all duration-500"
                    style={{ width: `${centerQuotaInfo.percentUsed}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* RAH Quota Widget */}
            <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E3DEC3] flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <h4 className="text-[11px] font-extrabold text-[#6B5A3A] uppercase tracking-wider">RAH Region Quota Status</h4>
                  <span className="text-[10px] bg-[#FBF5EC] border border-[#ECE0CE] text-[#8C764D] font-bold px-1.5 py-0.5 rounded-full">1% case limit</span>
                </div>
                <p className="text-[10px] text-stone-500 font-medium mb-3 truncate" title={regionQuotaInfo.regionName}>
                  Territory: <strong className="text-stone-800 font-bold">{regionQuotaInfo.regionName}</strong>
                </p>
                
                <div className="bg-[#E3DEC3]/40 rounded-xl p-3 border border-[#E3DEC3]/60 mb-3 space-y-1">
                  <div className="flex justify-between text-xs font-bold text-stone-700">
                    <span>Approved RAH Cases:</span>
                    <span className="text-stone-900">{regionQuotaInfo.used} case(s)</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-stone-500 font-semibold">
                    <span>Region Max Cap:</span>
                    <span>{regionQuotaInfo.allowedLimit} case(s) max</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-[11px] font-bold text-stone-600 mb-1">
                  <span>Quota Spent: {regionQuotaInfo.percentUsed}%</span>
                  <span className="text-amber-800">{regionQuotaInfo.remaining} case(s) remaining</span>
                </div>
                <div className="w-full bg-[#E5DFD0] rounded-full h-2 overflow-hidden border border-stone-200">
                  <div 
                    className="bg-[#8C764D] h-full rounded-full transition-all duration-500"
                    style={{ width: `${regionQuotaInfo.percentUsed}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Primary KPI Metrics Summary Bar (Role-scoped, Filter-aware, and Interactive Scorecard) */}
      <section className="px-6 pt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Students */}
        <div 
          onClick={() => {
            setSelectedCenter('All');
            setSelectedScholarship('All');
            setSelectedRetention('All');
            setSelectedWhatsApp('All');
            setSelectedAdmissionStatus('All');
            setSelectedPendency('All');
            setSelectedWorkStatus('All');
            setSearchQuery('');
          }}
          className="bg-[#FDFBF9] p-4.5 rounded-2xl border border-[#E3DEC3] shadow-xs flex flex-col justify-between hover:shadow-md hover:border-[#CDC7AE] transition-all duration-300 cursor-pointer active:scale-98 select-none"
          title="Click to reset all filters to show all students"
        >
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold tracking-wider uppercase font-sans text-stone-600">Students</span>
            <div className="bg-[#FAF8F5] p-2 rounded-xl text-[#5A7060] border border-[#E3DEC3]/40">
              <User className="w-4 h-4 text-[#5A7060]" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-3xl font-serif font-bold text-[#2B3A2C] tracking-tight">{filteredStats.total}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] text-stone-500 font-medium">
                {filteredStats.total !== stats.total ? `showing ${filteredStats.total} of ${stats.total} total` : 'showing all students'}
              </span>
              {filteredStats.total !== stats.total && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#8C764D] animate-pulse" title="Filtered active"></span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Retention Rate */}
        <div 
          onClick={() => setSelectedAdmissionStatus(prev => prev === 'Taken' ? 'All' : 'Taken')}
          className={`p-4.5 rounded-2xl border shadow-xs flex flex-col justify-between hover:shadow-md transition-all duration-300 cursor-pointer active:scale-98 select-none ${
            selectedAdmissionStatus === 'Taken'
              ? 'bg-[#FAF5EE] border-[#8C764D] ring-2 ring-[#8C764D]/10'
              : 'bg-[#FDFBF9] border-[#E3DEC3] hover:border-[#CDC7AE]'
          }`}
          title="Click to toggle filter: Show only Re-enrolled students"
        >
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold tracking-wider uppercase font-sans text-stone-600">Retention Rate</span>
            <div className="bg-[#F6F5EE] p-2 rounded-xl text-emerald-800 border border-[#E3DEC3]/40">
              <Percent className="w-4 h-4 text-[#8C764D]" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <p className="text-3xl font-serif font-bold text-[#2B3A2C] tracking-tight">{filteredStats.retentionRate}%</p>
              <p className="text-[10px] font-bold text-[#8C764D] bg-[#F6F5EE] px-1.5 py-0.5 rounded">
                {filteredStats.reEnrolledCount} Re-enrolled
              </p>
            </div>
            
            {/* Custom mini progress bar */}
            <div className="w-full bg-[#EAE5D9] rounded-full h-1.5 mt-2.5 overflow-hidden">
              <div 
                className="bg-[#8C764D] h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${filteredStats.retentionRate}%` }}
              ></div>
            </div>
            <p className="text-[9px] text-stone-400 mt-1.5 font-medium">Based on counselor registration ID</p>
          </div>
        </div>

        {/* Card 3: Not Retained (Dropout Breakdown) */}
        <div 
          onClick={() => setSelectedRetention(prev => prev === 'Low' ? 'All' : 'Low')}
          className={`p-4.5 rounded-2xl border shadow-xs flex flex-col justify-between hover:shadow-md transition-all duration-300 cursor-pointer active:scale-98 select-none ${
            selectedRetention === 'Low'
              ? 'bg-[#FAF5EE] border-[#A25A38] ring-2 ring-[#A25A38]/10'
              : 'bg-[#FDFBF9] border-[#E3DEC3] hover:border-[#CDC7AE]'
          }`}
          title="Click to filter by High Dropout Risk"
        >
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold tracking-wider uppercase font-sans text-stone-600">Not Retained</span>
            <div className="bg-[#FDF3EE] p-2 rounded-xl text-rose-500 border border-[#E3DEC3]/40">
              <XCircle className="w-4 h-4 text-[#A25A38]" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <p className="text-3xl font-serif font-bold text-[#A25A38] tracking-tight">{filteredStats.notRetainedCount}</p>
              <p className="text-[10px] font-medium text-stone-500">dropouts flagged</p>
            </div>
            
            {/* Dropout reasons list */}
            {filteredStats.sortedDropoutReasons.length > 0 ? (
              <div className="mt-2 text-[10px] space-y-1 max-h-[50px] overflow-y-auto pr-1">
                {filteredStats.sortedDropoutReasons.slice(0, 2).map(({ reason, count }) => (
                  <div key={reason} className="flex justify-between items-center bg-[#FAF5EE] px-1.5 py-0.5 rounded border border-[#ECE0CE]/50">
                    <span className="truncate max-w-[120px] font-semibold text-stone-600 capitalize text-[9px]">{reason}</span>
                    <span className="font-bold text-[#A25A38] text-[9px]">{count}</span>
                  </div>
                ))}
                {filteredStats.sortedDropoutReasons.length > 2 && (
                  <p className="text-[8px] text-stone-400 text-right">+{filteredStats.sortedDropoutReasons.length - 2} more reasons</p>
                )}
              </div>
            ) : (
              <p className="text-[9px] text-stone-400 mt-2 font-medium italic">No dropouts in selection</p>
            )}
          </div>
        </div>

        {/* Card 4: WhatsApp Intimated */}
        <div 
          onClick={() => setSelectedWhatsApp(prev => prev === 'Sent' ? 'All' : 'Sent')}
          className={`p-4.5 rounded-2xl border shadow-xs flex flex-col justify-between hover:shadow-md transition-all duration-300 cursor-pointer active:scale-98 select-none ${
            selectedWhatsApp === 'Sent'
              ? 'bg-[#FAF5EE] border-[#5A7060] ring-2 ring-[#5A7060]/10'
              : 'bg-[#FDFBF9] border-[#E3DEC3] hover:border-[#CDC7AE]'
          }`}
          title="Click to toggle filter: Show only WhatsApp notified students"
        >
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold tracking-wider uppercase font-sans text-stone-600">WhatsApp Intimated</span>
            <div className="bg-[#ECEFEA] p-2 rounded-xl text-[#5A7060] border border-[#E3DEC3]/40">
              <MessageSquare className="w-4 h-4 text-[#5A7060]" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <p className="text-3xl font-serif font-bold text-[#2B3A2C] tracking-tight">{filteredStats.whatsappRate}%</p>
              <p className="text-[10px] font-medium text-stone-500">({filteredStats.whatsappCount}/{filteredStats.total})</p>
            </div>
            
            {/* Visual Progress Bar */}
            <div className="w-full bg-[#EAE5D9] rounded-full h-1.5 mt-2.5 overflow-hidden">
              <div 
                className="bg-[#5A7060] h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${filteredStats.whatsappRate}%` }}
              ></div>
            </div>
            <p className="text-[9px] text-stone-400 mt-1.5 font-medium">WhatsApp intimations dispatched</p>
          </div>
        </div>

        {/* Card 5: High Risk Low Probability */}
        <div 
          onClick={() => setSelectedRetention(prev => prev === 'Low' ? 'All' : 'Low')}
          className={`p-4.5 rounded-2xl border shadow-xs flex flex-col justify-between hover:shadow-md transition-all duration-300 cursor-pointer active:scale-98 select-none ${
            selectedRetention === 'Low'
              ? 'bg-[#FAF5EE] border-[#A25A38] ring-2 ring-[#A25A38]/10'
              : 'bg-[#FDFBF9] border-[#E3DEC3] hover:border-[#CDC7AE]'
          }`}
          title="Click to toggle filter: Show only High Retention Risk students"
        >
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold tracking-wider uppercase font-sans text-stone-600">Retention Risk</span>
            <div className="bg-[#FDF3EE] p-2 rounded-xl text-rose-500 border border-[#E3DEC3]/40">
              <TrendingDown className="w-4 h-4 text-[#A25A38]" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <p className="text-3xl font-serif font-bold text-[#A25A38] tracking-tight">{filteredStats.highRiskCount}</p>
              <p className="text-xs font-bold text-[#A25A38] font-sans bg-[#FDF3EE] px-1.5 py-0.5 rounded">High Risk</p>
            </div>
            <p className="text-[10px] text-stone-500 mt-2 font-medium font-sans">
              {filteredStats.mediumRiskCount} Moderate risks flagged
            </p>
            <p className="text-[9px] text-stone-400 mt-1 font-medium italic">Low probability of retention</p>
          </div>
        </div>

        {/* Card 6: Unworked Reg Nos */}
        <div 
          onClick={() => setSelectedWorkStatus(prev => prev === 'Unworked' ? 'All' : 'Unworked')}
          className={`p-4.5 rounded-2xl border shadow-xs flex flex-col justify-between hover:shadow-md transition-all duration-300 cursor-pointer active:scale-98 select-none ${
            selectedWorkStatus === 'Unworked'
              ? 'bg-[#FAF5EE] border-[#A25A38] ring-2 ring-[#A25A38]/10'
              : 'bg-[#FDFBF9] border-[#E3DEC3] hover:border-[#CDC7AE]'
          }`}
          title="Click to toggle filter: Show only unworked registration numbers"
        >
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold tracking-wider uppercase font-sans text-stone-600">Unworked Reg Nos</span>
            <div className="bg-[#FAF0E4] p-2 rounded-xl text-[#A25A38] border border-[#E3DEC3]/40">
              <Hourglass className="w-4 h-4 text-[#A25A38]" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1.5">
              <p className="text-3xl font-serif font-bold text-[#A25A38] tracking-tight">{filteredStats.unworkedCount}</p>
              <p className="text-xs font-bold text-[#A25A38] font-sans bg-[#FAF0E4] px-1.5 py-0.5 rounded">
                {filteredStats.unworkedRate}%
              </p>
            </div>
            
            {/* Custom Progress Bar */}
            <div className="w-full bg-[#EAE5D9] rounded-full h-1.5 mt-2.5 overflow-hidden">
              <div 
                className="bg-[#A25A38] h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${filteredStats.unworkedRate}%` }}
              ></div>
            </div>
            <p className="text-[9px] text-stone-400 mt-1.5 font-medium">Untouched by counselors</p>
          </div>
        </div>
      </section>

      {/* Advanced Filters & Search Controls */}
      <section className="px-6 mt-4">
        <div className="bg-[#FDFBF9] rounded-2xl border border-[#E3DEC3] shadow-xs p-4 flex flex-col gap-4">
          
          {/* Main search and toggle line */}
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input 
                type="text"
                placeholder="Search by student name, registration number, batch, mentor name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-[#E3DEC3] rounded-xl text-sm font-medium focus:outline-hidden focus:border-[#5A7060] focus:bg-white bg-[#FAF8F5] transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 font-medium text-xs bg-[#FAF5EC] rounded-full p-0.5 hover:scale-105"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto shrink-0 pb-1 md:pb-0">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                  showFilters 
                    ? 'bg-[#ECEFEA] border-[#D1D9CD] text-[#425246]' 
                    : 'bg-[#FAF8F5] border-[#E3DEC3] text-stone-600 hover:bg-[#F2EDDF]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {(selectedCenter !== 'All' || selectedScholarship !== 'All' || selectedRetention !== 'All' || selectedWhatsApp !== 'All' || selectedAdmissionStatus !== 'All' || selectedPendency !== 'All') && (
                  <span className="w-2 h-2 bg-[#5A7060] rounded-full"></span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowColumnConfig(!showColumnConfig)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                  showColumnConfig
                    ? 'bg-[#ECEFEA] border-[#D1D9CD] text-[#425246]'
                    : 'bg-[#FAF8F5] border-[#E3DEC3] text-stone-600 hover:bg-[#F2EDDF]'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5" />
                Columns
              </button>

              <button
                type="button"
                onClick={() => setInlineEditingMode(!inlineEditingMode)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                  inlineEditingMode 
                    ? 'bg-[#ECEFEA] border-[#D1D9CD] text-[#425246]' 
                    : 'bg-[#FAF8F5] border-[#E3DEC3] text-stone-600 hover:bg-[#F2EDDF]'
                }`}
              >
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${inlineEditingMode ? 'bg-[#5A7060]/50' : 'bg-stone-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${inlineEditingMode ? 'bg-[#5A7060]' : 'bg-stone-400'}`}></span>
                </span>
                Inline Edits: {inlineEditingMode ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Collapsible Column Visibility Manager */}
          {showColumnConfig && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="bg-[#F8F5EE] p-4 rounded-xl border border-[#ECE0CE] overflow-hidden"
            >
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">Configure Column Visibility</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const allVisible: any = {};
                      Object.keys(visibleColumns).forEach(key => { allVisible[key] = true; });
                      setVisibleColumns(allVisible);
                    }}
                    className="text-[10px] bg-white border border-[#DDD5C5] px-2 py-1 rounded text-stone-650 hover:bg-[#F2EDDF] font-semibold transition"
                  >
                    Show All
                  </button>
                  <button 
                    onClick={() => {
                      const resetColumns: any = {
                        id: false,
                        region: false,
                        center: false,
                        building: true,
                        studentName: true,
                        regNo: true,
                        batchName: true,
                        class: true,
                        scholarship: true,
                        mentor: false,
                        mentorMailid: false,
                        pwid: false,
                        whatsappIntimation: false,
                        ptmStatus: false,
                        parentRemarks: false,
                        paymentDate: false,
                        discontinueReason: false,
                        retentionProbability: false,
                        proposedScholarship: false,
                        extraScholarshipDemand: false,
                        extraScholarshipStatus: false,
                        rahStatus: false,
                        finalRetentionStatus: false,
                        finalScholarship: true,
                        counselorName: false,
                        counselorPwid: false,
                        newRegno: true,
                      };
                      setVisibleColumns(resetColumns);
                    }}
                    className="text-[10px] bg-white border border-[#DDD5C5] px-2 py-1 rounded text-[#8C764D] hover:bg-[#F2EDDF] font-semibold transition"
                  >
                    Scholarship Focus
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {Object.entries(visibleColumns).map(([colKey, isVisible]) => {
                  if (colKey === 'id') return null; // never show row internal UUID
                  
                  // Hide extraScholarshipDemand checkbox column options entirely as it is now merged
                  if (colKey === 'extraScholarshipDemand') return null;

                  // Hide Extra Scholarship Demand and Final Scholarship from Mentor
                  if (userRole === 'Mentor' && (colKey === 'proposedScholarship' || colKey === 'finalScholarship')) return null;

                  // Hide Extra Scholarship Status and RAH Status from both FH and Mentor
                  if ((userRole === 'FH' || userRole === 'Mentor') && (colKey === 'extraScholarshipStatus' || colKey === 'rahStatus')) return null;

                  // Let's create beautiful descriptive headers
                  const label = colKey === 'studentName' ? 'Student Name (STG)'
                    : colKey === 'regNo' ? 'Reg No'
                    : colKey === 'scholarship' ? 'Scholarship Tier'
                    : colKey === 'mentorMailid' ? 'Mentor MailID'
                    : colKey === 'pwid' ? 'PWID'
                    : colKey === 'whatsappIntimation' ? 'WhatsApp Sent'
                    : colKey === 'ptmStatus' ? 'PTM Status'
                    : colKey === 'parentRemarks' ? 'Parent Remarks'
                    : colKey === 'paymentDate' ? 'Followup Date / Propose re-enrolled date'
                    : colKey === 'discontinueReason' ? 'Discontinue Reason'
                    : colKey === 'retentionProbability' ? 'Retention Prob.'
                    : colKey === 'proposedScholarship' ? 'Extra Scholarship Demand by Parents'
                    : colKey === 'extraScholarshipStatus' ? 'Extra Scholarship Status'
                    : colKey === 'rahStatus' ? 'Final Approval (RAH)'
                    : colKey === 'finalRetentionStatus' ? 'Final Retention'
                    : colKey === 'finalScholarship' ? 'Final Scholarship'
                    : colKey === 'counselorName' ? 'Counselor'
                    : colKey === 'counselorPwid' ? 'Counselor PWID'
                    : colKey === 'newRegno' ? 'New Regno'
                    : colKey === 'counselorStatus' ? 'Counselor Status'
                    : colKey.replace(/([A-Z])/g, ' / $1');

                  const isProtected = colKey === 'studentName' || colKey === 'regNo';

                  return (
                    <label 
                      key={colKey} 
                      className={`flex items-center gap-1.5 p-2 rounded-lg text-xs font-medium border cursor-pointer capitalize-first select-none transition ${
                        isProtected ? 'bg-stone-100 border-stone-200 text-stone-500 cursor-not-allowed' :
                        isVisible ? 'bg-white border-[#5A7060]/50 text-[#425246] shadow-2xs' : 'bg-[#FAF8F5]/50 border-[#E3DEC3] text-stone-400'
                      }`}
                    >
                      <input 
                        type="checkbox"
                        checked={isVisible}
                        disabled={isProtected}
                        onChange={() => setVisibleColumns(prev => ({ ...prev, [colKey]: !prev[colKey as keyof StudentScholarshipRow] }))}
                        className="rounded text-[#5A7060] focus:ring-[#5A7060] w-3.5 h-3.5 h-min shrink-0 disabled:opacity-50 cursor-pointer"
                      />
                      <span className="truncate">{label}</span>
                    </label>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Expandable filtering section */}
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 pt-2 border-t border-[#E3DEC3] overflow-hidden"
            >
              {/* Region Filter */}
              <div>
                <label className="block text-xs font-bold text-stone-500 mb-1.5 uppercase tracking-wide">Center Location</label>
                <select 
                  value={selectedCenter} 
                  onChange={(e) => setSelectedCenter(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 cursor-pointer focus:border-[#5A7060]"
                >
                  {centers.map(center => (
                    <option key={center} value={center}>{center}</option>
                  ))}
                </select>
              </div>

              {/* Scholarship Filter */}
              <div>
                <label className="block text-xs font-bold text-stone-500 mb-1.5 uppercase tracking-wide">Scholarship Type</label>
                <select 
                  value={selectedScholarship} 
                  onChange={(e) => setSelectedScholarship(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 cursor-pointer focus:border-[#5A7060]"
                >
                  <option value="All">All Scholarships</option>
                  {SCHOLARSHIPS_LIST.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Retention Probability Filter */}
              <div>
                <label className="block text-xs font-bold text-stone-500 mb-1.5 uppercase tracking-wide">Retention Probability</label>
                <select 
                  value={selectedRetention} 
                  onChange={(e) => setSelectedRetention(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 cursor-pointer focus:border-[#5A7060]"
                >
                  <option value="All">All Probability</option>
                  <option value="High">High Retention Chance</option>
                  <option value="Medium">Medium Retention Chance</option>
                  <option value="Low">Low Retention Risk</option>
                  <option value="Not Set">No status given</option>
                </select>
              </div>

              {/* WhatsApp Intimation Filter */}
              <div>
                <label className="block text-xs font-bold text-stone-500 mb-1.5 uppercase tracking-wide">WhatsApp Notified</label>
                <select 
                  value={selectedWhatsApp} 
                  onChange={(e) => setSelectedWhatsApp(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 cursor-pointer focus:border-[#5A7060]"
                >
                  <option value="All">All Statuses</option>
                  <option value="Sent">TRUE (Notified)</option>
                  <option value="Pending">FALSE (Pending)</option>
                </select>
              </div>

              {/* Admission Status Filter */}
              <div>
                <label className="block text-xs font-bold text-stone-500 mb-1.5 uppercase tracking-wide">Admission Status</label>
                <select 
                  value={selectedAdmissionStatus} 
                  onChange={(e) => setSelectedAdmissionStatus(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 cursor-pointer focus:border-[#5A7060]"
                >
                  <option value="All">All Admissions</option>
                  <option value="Taken">Taken (Has Regno)</option>
                  <option value="Pending">Pending (No Regno)</option>
                </select>
              </div>

              {/* Pendency Filter */}
              <div>
                <label className="block text-xs font-bold text-stone-500 mb-1.5 uppercase tracking-wide">Pendency Level</label>
                <select 
                  value={selectedPendency} 
                  onChange={(e) => setSelectedPendency(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 cursor-pointer focus:border-[#5A7060]"
                >
                  <option value="All">All Pendencies</option>
                  <option value="Mentor">Mentor Pending</option>
                  <option value="FH/CH">FH/CH Pending</option>
                  <option value="RAH">RAH Pending</option>
                  <option value="Counselor">Counselor Pending</option>
                  <option value="None">None (Processed)</option>
                </select>
              </div>

              {/* Counselor Work Status Filter */}
              <div>
                <label className="block text-xs font-bold text-stone-500 mb-1.5 uppercase tracking-wide">Counselor Action</label>
                <select 
                  value={selectedWorkStatus} 
                  onChange={(e) => setSelectedWorkStatus(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 cursor-pointer focus:border-[#5A7060]"
                >
                  <option value="All">All Actions</option>
                  <option value="Unworked">Unworked Reg Nos</option>
                  <option value="Worked">Worked Reg Nos</option>
                </select>
              </div>
            </motion.div>
          )}

          {/* active query badge list */}
          {(selectedCenter !== 'All' || selectedScholarship !== 'All' || selectedRetention !== 'All' || selectedWhatsApp !== 'All' || selectedAdmissionStatus !== 'All' || selectedPendency !== 'All' || selectedWorkStatus !== 'All' || searchQuery !== '') && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E3DEC3] text-xs">
              <span className="text-stone-400 font-semibold select-none">Applied filters:</span>
              {searchQuery && (
                <span className="bg-[#ECEFEA] text-[#425246] px-2 py-1 rounded-md font-semibold border border-[#D1D9CD] flex items-center gap-1 select-none">
                  Search: "{searchQuery}"
                  <X className="w-3.5 h-3.5 cursor-pointer hover:opacity-80" onClick={() => setSearchQuery('')} />
                </span>
              )}
              {selectedCenter !== 'All' && (
                <span className="bg-[#ECEFEA] text-[#425246] px-2 py-1 rounded-md font-semibold border border-[#D1D9CD] flex items-center gap-1 select-none">
                  Center: {selectedCenter}
                  <X className="w-3.5 h-3.5 cursor-pointer hover:opacity-80" onClick={() => setSelectedCenter('All')} />
                </span>
              )}
              {selectedScholarship !== 'All' && (
                <span className="bg-[#ECEFEA] text-[#425246] px-2 py-1 rounded-md font-semibold border border-[#D1D9CD] flex items-center gap-1 select-none">
                  Sponsorship: {selectedScholarship}
                  <X className="w-3.5 h-3.5 cursor-pointer hover:opacity-80" onClick={() => setSelectedScholarship('All')} />
                </span>
              )}
              {selectedRetention !== 'All' && (
                <span className="bg-[#ECEFEA] text-[#425246] px-2 py-1 rounded-md font-semibold border border-[#D1D9CD] flex items-center gap-1 select-none">
                  Retention: {selectedRetention}
                  <X className="w-3.5 h-3.5 cursor-pointer hover:opacity-80" onClick={() => setSelectedRetention('All')} />
                </span>
              )}
              {selectedWhatsApp !== 'All' && (
                <span className="bg-[#ECEFEA] text-[#425246] px-2 py-1 rounded-md font-semibold border border-[#D1D9CD] flex items-center gap-1 select-none">
                  WhatsApp: {selectedWhatsApp}
                  <X className="w-3.5 h-3.5 cursor-pointer hover:opacity-80" onClick={() => setSelectedWhatsApp('All')} />
                </span>
              )}
              {selectedAdmissionStatus !== 'All' && (
                <span className="bg-[#ECEFEA] text-[#425246] px-2 py-1 rounded-md font-semibold border border-[#D1D9CD] flex items-center gap-1 select-none">
                  Admission: {selectedAdmissionStatus}
                  <X className="w-3.5 h-3.5 cursor-pointer hover:opacity-80" onClick={() => setSelectedAdmissionStatus('All')} />
                </span>
              )}
              {selectedPendency !== 'All' && (
                <span className="bg-[#ECEFEA] text-[#425246] px-2 py-1 rounded-md font-semibold border border-[#D1D9CD] flex items-center gap-1 select-none">
                  Pendency: {selectedPendency}
                  <X className="w-3.5 h-3.5 cursor-pointer hover:opacity-80" onClick={() => setSelectedPendency('All')} />
                </span>
              )}
              {selectedWorkStatus !== 'All' && (
                <span className="bg-[#ECEFEA] text-[#425246] px-2 py-1 rounded-md font-semibold border border-[#D1D9CD] flex items-center gap-1 select-none">
                  Counselor Action: {selectedWorkStatus}
                  <X className="w-3.5 h-3.5 cursor-pointer hover:opacity-80" onClick={() => setSelectedWorkStatus('All')} />
                </span>
              )}
              <button 
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCenter('All');
                  setSelectedScholarship('All');
                  setSelectedRetention('All');
                  setSelectedWhatsApp('All');
                  setSelectedAdmissionStatus('All');
                  setSelectedPendency('All');
                  setSelectedWorkStatus('All');
                }}
                className="text-[#A25A38] hover:text-[#804225] font-semibold hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          )}

        </div>
      </section>

      {/* Multiselection Action Bar */}
      {selectedRowIds.length > 0 && (
        <section className="px-6 mt-3">
          <div className="bg-[#2B3A2C] text-white px-5 py-3.5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3.5 shadow-md border border-[#5A7060]/30">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 bg-[#8C9E8E] rounded-full animate-pulse"></span>
              <span className="text-xs font-bold tracking-wider uppercase text-stone-300">Bulk Operations Mode</span>
              <span className="bg-[#5A7060]/60 text-[#F6F5EE] text-xs font-bold px-2 py-0.5 rounded-md">
                {selectedRowIds.length} Selected
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button 
                type="button"
                onClick={() => {
                  const updatedStudents: StudentScholarshipRow[] = [];
                  setData(prev => prev.map(row => {
                    if (selectedRowIds.includes(row.id)) {
                      const updated = { ...row, whatsappIntimation: true };
                      updatedStudents.push(updated);
                      return updated;
                    }
                    return row;
                  }));
                  if (updatedStudents.length > 0) {
                    saveBulkStudentsInFirestore(updatedStudents).catch(err => console.error("Cloud bulk whatsapp update failed:", err));
                  }
                  addLog('UPDATE', `Marked ${selectedRowIds.length} selected students as WhatsApp Intimated.`, `${selectedRowIds.length} students`);
                  triggerBanner(`Marked ${selectedRowIds.length} students as WhatsApp Intimated`, 'success');
                  setSelectedRowIds([]);
                }}
                className="bg-[#3A4D39] hover:bg-[#2F3E2E] text-stone-100 border border-[#5A7060]/40 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer select-none transition"
              >
                ✓ WhatsApp Sent
              </button>

              <button 
                type="button"
                onClick={() => setIsBulkEditOpen(true)}
                className="bg-[#3A4D39] hover:bg-[#2F3E2E] text-amber-100 border border-[#5A7060]/40 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer select-none transition"
              >
                ✏️ Bulk Edit Remarks & Risk
              </button>

              <button 
                type="button"
                onClick={handleBulkDeleteSelected}
                className="bg-rose-900/60 hover:bg-rose-800 text-rose-100 border border-rose-700/50 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer select-none transition flex items-center gap-1.5"
                title="Permanently delete all selected student records"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-300" />
                <span>Bulk Discard ({selectedRowIds.length})</span>
              </button>

              <button 
                type="button"
                onClick={() => setSelectedRowIds([])}
                className="text-stone-300 hover:text-white px-2 py-1.5 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Bulk Edit Modal */}
      <AnimatePresence>
        {isBulkEditOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs" 
              onClick={() => setIsBulkEditOpen(false)}
            />
            
            <motion.div 
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="bg-[#FDFBF9] rounded-3xl border border-[#ECE0CE] shadow-2xl relative z-10 w-full max-w-md p-6 overflow-hidden"
            >
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#E3DEC3]">
                <h3 className="text-base font-serif font-bold text-stone-900">Bulk Modify Students</h3>
                <button onClick={() => setIsBulkEditOpen(false)} className="text-stone-400 hover:text-stone-600 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-stone-500 mb-4 font-medium">
                You are updating <span className="font-bold text-[#2B3A2C]">{selectedRowIds.length} records</span> concurrently. Leave any field blank to preserve individual values.
              </p>

              <div className="space-y-4 font-sans">
                {/* 1. WhatsApp Intimation */}
                <div>
                  <label className="block text-xs font-bold text-stone-500 mb-1.5">Intimate Parent about Scholarship via WhatsApp</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setBulkWhatsApp(true)}
                      className={`flex-1 py-1.5 border rounded-lg text-xs font-semibold transition cursor-pointer ${
                        bulkWhatsApp === true ? 'bg-[#ECEFEA] border-[#D1D9CD] text-[#425246]' : 'bg-[#FAF8F5] border-[#E3DEC3] text-stone-600'
                      }`}
                    >
                      Mark TRUE
                    </button>
                    <button 
                      type="button"
                      onClick={() => setBulkWhatsApp(false)}
                      className={`flex-1 py-1.5 border rounded-lg text-xs font-semibold transition cursor-pointer ${
                        bulkWhatsApp === false ? 'bg-[#FAF0E4] border-[#F5DDD0] text-[#A25A38]' : 'bg-[#FAF8F5] border-[#E3DEC3] text-stone-600'
                      }`}
                    >
                      Mark FALSE
                    </button>
                    <button 
                      type="button"
                      onClick={() => setBulkWhatsApp(null)}
                      className={`py-1.5 px-3 border rounded-lg text-xs font-medium transition cursor-pointer ${
                        bulkWhatsApp === null ? 'bg-[#F2EDDF] border-[#DDD5C5] text-stone-800' : 'bg-[#FAF8F5] border-[#E3DEC3] text-stone-500'
                      }`}
                    >
                      Keep Current
                    </button>
                  </div>
                </div>

                {/* 2. PTM Status */}
                <div>
                  <label className="block text-xs font-bold text-stone-500 mb-1">PTM Status</label>
                  <select 
                    value={bulkPTMStatus} 
                    onChange={(e) => setBulkPTMStatus(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold text-stone-750 cursor-pointer focus:border-[#5A7060]"
                  >
                    <option value="">No change ({'<< keep >>'})</option>
                    <option value="Done - Online">Done - Online</option>
                    <option value="Done - Offline">Done - Offline</option>
                    <option value="DNP 1">DNP 1</option>
                    <option value="DNP 2">DNP 2</option>
                    <option value="DNP 3">DNP 3</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>

                {/* 3. Retention Prob */}
                <div>
                  <label className="block text-xs font-bold text-stone-500 mb-1">Probability of Retention</label>
                  <select 
                    value={bulkRetention} 
                    onChange={(e) => setBulkRetention(e.target.value as any)}
                    className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold text-stone-750 cursor-pointer focus:border-[#5A7060]"
                  >
                    <option value="">No change ({'<< keep >>'})</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2.5 mt-6 pt-4 border-t border-[#E3DEC3]">
                <button 
                  type="button"
                  onClick={() => setIsBulkEditOpen(false)}
                  className="flex-1 border border-[#DDD5C5] py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-[#F2EDDF] cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleApplyBulk}
                  className="flex-1 bg-[#5A7060] hover:bg-[#4E6052] text-white py-2 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Apply Updates
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Table Main Stage View with Sticky Columns */}
      <main className="flex-1 px-6 pb-8 mt-4 overflow-hidden flex flex-col">
        <div className="bg-[#FDFBF9] rounded-3xl border border-[#E3DEC3] shadow-sm flex flex-col overflow-hidden max-h-[640px]">
          
          {/* Table Toolbar Header */}
          <div className="px-5 py-3 bg-[#FAF8F5] border-b border-[#E3DEC3] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Showing Scholarship List</span>
              <span className="bg-[#ECEFEA] text-[#425246] text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border border-[#D1D9CD]">
                {filteredData.length} records / {data.length} total
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs text-stone-500">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 bg-[#FAF3EC] border border-[#E8DFC7] rounded-xs"></span> Sticky Identifier
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 bg-[#FDFBF9]/50 border border-[#E3DEC3] rounded-xs"></span> Scrollable Info
              </span>
            </div>
          </div>

          {/* Interactive grid element */}
          <div className="overflow-auto flex-1 relative" style={{ transform: 'translate3d(0, 0, 0)' }}>
            <table className="w-full text-left border-collapse table-fixed select-text">
              <thead>
                <tr className="bg-[#FAF8F5] sticky top-0 z-10 border-b border-[#E3DEC3]">
                  
                  {/* Select Checkbox Column */}
                  <th className="w-[45px] p-2 bg-[#FAF8F5] text-stone-400 text-center select-none border-b border-[#E3DEC3]">
                    <input 
                      type="checkbox"
                      checked={filteredData.length > 0 && selectedRowIds.length === filteredData.length}
                      onChange={toggleAllSelection}
                      className="rounded text-[#5A7060]/90 focus:ring-[#5A7060] cursor-pointer"
                    />
                  </th>

                  {/* 1. Pin Name Column */}
                  {visibleColumns.studentName && (
                    <th className="w-[160px] p-3 text-[#2B3A2C] font-serif font-extrabold text-xs uppercase tracking-wider sticky left-0 bg-[#FAF3EC] z-20 border-r border-[#E3DEC3] border-b border-[#E3DEC3] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                      Student Name (STG)
                    </th>
                  )}

                  {/* 2. Pin Registration No Column */}
                  {visibleColumns.regNo && (
                    <th className="w-[110px] p-3 text-[#2B3A2C] font-serif font-extrabold text-xs uppercase tracking-wider sticky left-[160px] bg-[#FAF3EC] z-20 border-r border-[#E3DEC3] border-b border-[#E3DEC3] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                      Reg No
                    </th>
                  )}

                  {/* Remaining Scrollable Columns Headers */}
                  {visibleColumns.region && <th className="w-[110px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Region</th>}
                  {visibleColumns.center && <th className="w-[180px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Center</th>}
                  {visibleColumns.building && <th className="w-[180px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Building</th>}
                  {visibleColumns.batchName && <th className="w-[110px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Batch Name</th>}
                  {visibleColumns.class && <th className="w-[80px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Class</th>}
                  {visibleColumns.scholarship && <th className="w-[180px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Scholarship Tier</th>}
                  {visibleColumns.mentor && <th className="w-[130px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Mentor</th>}
                  {visibleColumns.mentorMailid && <th className="w-[160px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Mentor MailID</th>}
                  {visibleColumns.pwid && <th className="w-[100px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">PWID</th>}
                  
                  {/* WhatsApp checkbox header */}
                  {visibleColumns.whatsappIntimation && <th className="w-[130px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider text-center border-b border-[#E3DEC3]">WhatsApp Sent</th>}
                  
                  {/* Key Retention process inputs */}
                  {visibleColumns.ptmStatus && <th className="w-[150px] p-3 text-[#5A7060] font-bold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">PTM Status</th>}
                  {visibleColumns.parentRemarks && <th className="w-[280px] p-3 text-[#5A7060] font-bold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Parent Remarks</th>}
                  {visibleColumns.paymentDate && <th className="w-[160px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Followup Date / Propose re-enrolled date</th>}
                  {visibleColumns.discontinueReason && <th className="w-[240px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Discontinue Reason</th>}
                  {visibleColumns.retentionProbability && <th className="w-[150px] p-3 text-[#5A7060] font-bold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Retention Prob.</th>}
                  
                  {/* Proposal & Approvals */}
                  {visibleColumns.proposedScholarship && userRole !== 'Mentor' && <th className="w-[160px] p-3 text-[#8C764D] font-bold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Extra Scholarship Demand by Parents</th>}
                  {visibleColumns.extraScholarshipStatus && userRole !== 'FH' && userRole !== 'Mentor' && <th className="w-[155px] p-3 text-[#8C764D] font-bold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Extra Scholarship Status</th>}
                  {visibleColumns.rahStatus && userRole !== 'FH' && userRole !== 'Mentor' && <th className="w-[155px] p-3 text-[#A25A38] font-bold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Final Approval (RAH)</th>}
                  {visibleColumns.finalRetentionStatus && <th className="w-[180px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Final Retention</th>}
                  {visibleColumns.finalScholarship && userRole !== 'Mentor' && <th className="w-[140px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Final Scholarship</th>}
                  
                  {/* Counselors mapping */}
                  {visibleColumns.counselorName && <th className="w-[140px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Counselor</th>}
                  {visibleColumns.counselorPwid && <th className="w-[120px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Counselor PWID</th>}
                  {visibleColumns.newRegno && <th className="w-[110px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">New Regno</th>}
                  {visibleColumns.counselorStatus && <th className="w-[180px] p-3 text-stone-500 font-semibold text-[11px] uppercase tracking-wider border-b border-[#E3DEC3]">Counselor Status</th>}

                  {/* Actions Column */}
                  <th className="w-[100px] p-2 bg-[#FAF8F5] sticky right-0 z-10 text-center text-stone-500 font-semibold text-[11px] uppercase border-[#E3DEC3] border-b border-l">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#E3DEC3]/60">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={26} className="text-center py-20 bg-[#FAF8F5]">
                      <div className="flex flex-col items-center justify-center text-stone-400">
                        <AlertTriangle className="w-10 h-10 stroke-1 text-stone-300 mb-2" />
                        <p className="text-[#2B3A2C] text-sm font-serif font-semibold">No scholarship students found</p>
                        <p className="text-xs mt-1">Try resetting the spreadsheet or broadening your search criteria.</p>
                        <button 
                          onClick={() => {
                            setSearchQuery('');
                            setSelectedCenter('All');
                            setSelectedScholarship('All');
                            setSelectedRetention('All');
                            setSelectedWhatsApp('All');
                          }}
                          className="mt-4 bg-[#5A7060] hover:bg-[#4E6052] text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
                        >
                          Clear search and filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row, index) => {
                    const isSelected = selectedRowIds.includes(row.id);
                    return (
                      <tr 
                        key={row.id} 
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (
                            target.closest('button') || 
                            target.closest('input') || 
                            target.closest('select') || 
                            target.closest('a')
                          ) {
                            return;
                          }
                          setSelectedStudentId(row.id);
                        }}
                        className={`hover:bg-[#FAF8F2] transition duration-150 text-xs align-middle cursor-pointer group ${
                          isSelected ? 'bg-[#ECEFEA]/50' : index % 2 === 1 ? 'bg-[#FAF8F5]/35' : 'bg-white'
                        }`}
                      >
                        {/* Select checkbox */}
                        <td className="p-2 text-center align-middle border-r border-[#E3DEC3]">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRowSelection(row.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-3.5 h-3.5"
                          />
                        </td>

                        {/* PINNED: Name */}
                        {visibleColumns.studentName && (
                          <td className="p-3 font-semibold text-slate-900 border-r border-slate-200 sticky left-0 bg-white group-hover:bg-[#FAF8F2] transition duration-150 z-5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] truncate">
                            <div className="flex flex-col">
                              <span className="font-bold text-[#3B4D3F] group-hover:text-[#2B3A2C] group-hover:underline truncate max-w-[140px]" title={row.studentName}>
                                {row.studentName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono mt-0.5">{row.class} Class</span>
                            </div>
                          </td>
                        )}

                        {/* PINNED: RegNo */}
                        {visibleColumns.regNo && (
                          <td className="p-3 font-mono text-xs font-medium text-slate-600 border-r border-slate-200 sticky left-[160px] bg-white group-hover:bg-[#FAF8F2] transition duration-150 z-5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                            {row.regNo}
                          </td>
                        )}

                        {/* Scrollable: Region */}
                        {visibleColumns.region && <td className="p-3 text-slate-600 font-semibold">{row.region}</td>}

                        {/* Scrollable: Center */}
                        {visibleColumns.center && (
                          <td className="p-3 text-slate-700 font-medium truncate" title={row.center}>
                            {row.center}
                          </td>
                        )}

                        {/* Scrollable: Building */}
                        {visibleColumns.building && (
                          <td className="p-3 text-slate-500 truncate" title={row.building}>
                            {row.building}
                          </td>
                        )}

                        {/* Scrollable: Batch */}
                        {visibleColumns.batchName && <td className="p-3 select-all"><span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold text-[10px]">{row.batchName}</span></td>}

                        {/* Scrollable: Class */}
                        {visibleColumns.class && <td className="p-3 font-semibold text-slate-600">{row.class}</td>}

                        {/* Scrollable: Scholarship */}
                        {visibleColumns.scholarship && (
                          <td className="p-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              row.scholarship.includes('100%') 
                                ? 'bg-[#ECEFEA] text-[#425246] border border-[#D1D9CD]' 
                                : 'bg-[#FAF0E4] text-[#A25A38] border border-[#F5DDD0]'
                            }`}>
                              {row.scholarship}
                            </span>
                          </td>
                        )}

                        {/* Scrollable: Mentor */}
                        {visibleColumns.mentor && <td className="p-3 font-semibold text-stone-700">{row.mentor}</td>}

                        {/* Scrollable: Mentor MailID */}
                        {visibleColumns.mentorMailid && <td className="p-3 text-stone-500 font-mono select-all truncate max-w-[140px]" title={row.mentorMailid}>{row.mentorMailid || 'N/A'}</td>}

                        {/* Scrollable: PWID */}
                        {visibleColumns.pwid && <td className="p-3 text-stone-500 font-mono">{row.pwid || 'N/A'}</td>}

                        {/* WhatsApp Check Cell (Highly interactive) */}
                        {visibleColumns.whatsappIntimation && (
                          <td className="p-3 text-center align-middle">
                            <div className="flex items-center justify-center gap-2">
                              <input 
                                type="checkbox"
                                checked={!!row.whatsappIntimation}
                                onChange={(e) => handleCellChange(row.id, 'whatsappIntimation', e.target.checked)}
                                className="rounded text-[#5A7060]/90 focus:ring-[#5A7060] cursor-pointer h-4 w-4 border-[#E3DEC3]"
                              />
                              <span className={`text-[10px] font-bold ${row.whatsappIntimation ? 'text-[#425246]' : 'text-stone-400'}`}>
                                {row.whatsappIntimation ? 'SENT' : 'FALSE'}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* PTM Status */}
                        {visibleColumns.ptmStatus && (
                          <td className="p-2">
                            {inlineEditingMode ? (
                              <select
                                value={row.ptmStatus || ''}
                                onChange={(e) => handleCellChange(row.id, 'ptmStatus', e.target.value)}
                                className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-medium cursor-pointer focus:border-[#5A7060]"
                              >
                                <option value="">Select status</option>
                                <option value="Done - Online">Done - Online</option>
                                <option value="Done - Offline">Done - Offline</option>
                                <option value="DNP 1">DNP 1</option>
                                <option value="DNP 2">DNP 2</option>
                                <option value="DNP 3">DNP 3</option>
                                <option value="Pending">Pending</option>
                              </select>
                            ) : (
                              <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] border ${
                                (row.ptmStatus === 'Done - Online' || row.ptmStatus === 'Done - Offline') ? 'bg-[#ECEFEA] text-[#425246] border-[#D1D9CD]' :
                                row.ptmStatus === 'Pending' ? 'bg-[#FBF5EC] text-[#8C764D] border-[#ECE0CE]' :
                                row.ptmStatus && row.ptmStatus.startsWith('DNP') ? 'bg-[#FAF0E4] text-[#A25A38] border-[#F5DDD0]' :
                                'bg-stone-100 text-stone-400 border-stone-200/50'
                              }`}>
                                {row.ptmStatus || 'Not Initiated'}
                              </span>
                            )}
                          </td>
                        )}

                        {/* Parent Remarks by Mentor */}
                        {visibleColumns.parentRemarks && (
                          <td className="p-2">
                            {inlineEditingMode ? (
                              <div className="space-y-1">
                                <select
                                  value={isStandardRemark(row.parentRemarks) ? (row.parentRemarks || '') : 'Other'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'Other') {
                                      handleCellChange(row.id, 'parentRemarks', 'Custom Remark');
                                    } else {
                                      handleCellChange(row.id, 'parentRemarks', val);
                                    }
                                  }}
                                  className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-medium cursor-pointer focus:border-[#5A7060]"
                                >
                                  <option value="">Select Remarks</option>
                                  <option value="Will pay">Will pay</option>
                                  <option value="Will Decide">Will Decide</option>
                                  <option value="Will wait for other scholarships">Will wait for other scholarships</option>
                                  <option value="Will not continue with PW">Will not continue with PW</option>
                                  <option value="Other">Other (Write...)</option>
                                </select>
                                {!isStandardRemark(row.parentRemarks) && (
                                  <input
                                    type="text"
                                    value={row.parentRemarks === 'Custom Remark' ? '' : row.parentRemarks}
                                    onChange={(e) => handleCellChange(row.id, 'parentRemarks', e.target.value)}
                                    placeholder="Write other remark..."
                                    className="w-full bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-medium focus:border-[#5A7060] focus:ring-1 focus:ring-[#5A7060]"
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="truncate max-w-[260px] font-medium text-stone-700" title={row.parentRemarks}>
                                {row.parentRemarks ? (
                                  <span className={`inline-flex px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                                    row.parentRemarks === 'Will pay' ? 'bg-[#ECEFEA] text-[#425246] border-[#D1D9CD]' :
                                    row.parentRemarks === 'Will Decide' ? 'bg-[#FBF5EC] text-[#8C764D] border-[#ECE0CE]' :
                                    row.parentRemarks === 'Will wait for other scholarships' ? 'bg-[#E3EBF5] text-[#2C4A70] border-[#C5D5E6]' :
                                    row.parentRemarks === 'Will not continue with PW' ? 'bg-[#FAF0E4] text-[#A25A38] border-[#F5DDD0]' :
                                    'bg-[#FAF8F5] text-stone-600 border-[#E3DEC3]'
                                  }`}>
                                    {row.parentRemarks}
                                  </span>
                                ) : (
                                  <span className="text-stone-400 italic font-normal">Pending parent response</span>
                                )}
                              </div>
                            )}
                          </td>
                        )}

                        {/* Payment Date given by parents */}
                        {visibleColumns.paymentDate && (
                          <td className="p-2">
                            {inlineEditingMode ? (
                              <input 
                                type="date"
                                value={row.paymentDate}
                                onChange={(e) => handleCellChange(row.id, 'paymentDate', e.target.value)}
                                className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] text-xs px-2 py-1 border border-[#E3DEC3] rounded-lg font-medium focus:border-[#5A7060]"
                              />
                            ) : (
                              <span className="font-mono text-stone-600 font-medium">
                                {row.paymentDate || 'Not declared'}
                              </span>
                            )}
                          </td>
                        )}

                        {/* Reason why discontinue */}
                        {visibleColumns.discontinueReason && (
                          <td className="p-2">
                            {inlineEditingMode ? (
                              (() => {
                                const isDropoutEnabled = isDropoutReasonEnabled(row.parentRemarks);
                                return (
                                  <div className="space-y-1">
                                    <select
                                      disabled={!isDropoutEnabled}
                                      value={isStandardDiscontinueReason(row.discontinueReason) ? (row.discontinueReason || '') : 'other'}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'other') {
                                          handleCellChange(row.id, 'discontinueReason', 'Custom Reason');
                                        } else {
                                          handleCellChange(row.id, 'discontinueReason', val);
                                        }
                                      }}
                                      className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-medium cursor-pointer focus:border-[#5A7060] disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed text-stone-800"
                                    >
                                      <option value="">Select Reason</option>
                                      <option value="academic concern">academic concern</option>
                                      <option value="father transfer">father transfer</option>
                                      <option value="health issue">health issue</option>
                                      <option value="non acad issue">non acad issue</option>
                                      <option value="School Timing Issue">School Timing Issue</option>
                                      <option value="Transportation Issue">Transportation Issue</option>
                                      <option value="Relocation Issue">Relocation Issue</option>
                                      <option value="Financial Issue">Financial Issue</option>
                                      <option value="other">other (Write...)</option>
                                    </select>
                                    {!isStandardDiscontinueReason(row.discontinueReason) && (
                                      <input 
                                        disabled={!isDropoutEnabled}
                                        type="text"
                                        value={row.discontinueReason === 'Custom Reason' ? '' : row.discontinueReason}
                                        onChange={(e) => handleCellChange(row.id, 'discontinueReason', e.target.value)}
                                        placeholder="Write custom reason..."
                                        className="w-full bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-medium focus:border-[#5A7060] focus:ring-1 focus:ring-[#5A7060] disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed text-stone-800"
                                      />
                                    )}
                                  </div>
                                );
                              })()
                            ) : (
                              <span className="truncate max-w-[200px] text-stone-650 font-medium">{row.discontinueReason || '-'}</span>
                            )}
                          </td>
                        )}

                        {/* Probability of Retention */}
                        {visibleColumns.retentionProbability && (
                          <td className="p-2">
                            {inlineEditingMode ? (
                              <select
                                value={row.retentionProbability || ''}
                                onChange={(e) => handleCellChange(row.id, 'retentionProbability', e.target.value as any)}
                                className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-bold cursor-pointer focus:border-[#5A7060]"
                              >
                                <option value="">Select Chance</option>
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                              </select>
                            ) : (
                              <span className={`inline-flex px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                                row.retentionProbability === 'High' ? 'bg-[#ECEFEA] text-[#425246] border-[#D1D9CD]' :
                                row.retentionProbability === 'Medium' ? 'bg-[#FBF5EC] text-[#8C764D] border-[#ECE0CE]' :
                                row.retentionProbability === 'Low' ? 'bg-[#FAF0E4] text-[#A25A38] border-[#F5DDD0]' : 'bg-stone-100 text-stone-400 border-stone-200/50'
                              }`}>
                                {row.retentionProbability || 'Not Estimated'}
                              </span>
                            )}
                          </td>
                        )}

                        {/* Proposed Scholarship */}
                        {visibleColumns.proposedScholarship && userRole !== 'Mentor' && (
                          <td className="p-2">
                            {(() => {
                              const isEditable = inlineEditingMode && canEditField('proposedScholarship', row);
                              return (
                                <div className="space-y-1">
                                  {isEditable ? (
                                    (() => {
                                      const currentProposed = row.proposedScholarship || '';
                                      const currentIsFlat = isFlatScholarship(row.scholarship) || isFlatScholarship(currentProposed);
                                      const currentType = currentIsFlat ? 'flat' : 'pct';
                                      
                                      let currentNumber = '';
                                      if (currentIsFlat) {
                                        currentNumber = currentProposed.replace(/flat/gi, '').trim();
                                      } else {
                                        const pctMatch = currentProposed.match(/^(\d+)/);
                                        if (pctMatch) {
                                          currentNumber = pctMatch[1];
                                        } else {
                                          currentNumber = currentProposed.replace(/%|on|tuition|fees/gi, '').trim();
                                        }
                                      }

                                      return (
                                        <div className="flex flex-col gap-1 w-[180px]">
                                          <select
                                            value={currentType}
                                            onChange={(e) => {
                                              const newType = e.target.value;
                                              if (newType === 'pct') {
                                                handleCellChange(row.id, 'proposedScholarship', `${currentNumber || '0'}% on Tuition Fees`);
                                              } else {
                                                handleCellChange(row.id, 'proposedScholarship', `Flat ${currentNumber || '0'}`);
                                              }
                                            }}
                                            className="w-full text-[10px] font-bold bg-[#FAF8F5] border border-[#E3DEC3] rounded px-1.5 py-1 focus:bg-white outline-hidden cursor-pointer text-stone-800"
                                          >
                                            <option value="pct">On Tuition Fee</option>
                                            <option value="flat">Flat Fee</option>
                                          </select>

                                          {currentType === 'pct' ? (
                                            <div className="flex items-center bg-[#FAF8F5] border border-[#E3DEC3] rounded px-1.5 py-1 focus-within:bg-white">
                                              <input
                                                type="text"
                                                value={currentNumber}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  handleCellChange(row.id, 'proposedScholarship', `${val}% on Tuition Fees`);
                                                }}
                                                placeholder="e.g. 15"
                                                className="w-full bg-transparent text-[10px] font-semibold text-stone-800 outline-none border-none p-0 focus:ring-0 text-right pr-1"
                                              />
                                              <span className="text-[10px] text-stone-500 font-bold select-none shrink-0">% on Tuition Fees</span>
                                            </div>
                                          ) : (
                                            <div className="flex items-center bg-[#FAF8F5] border border-[#E3DEC3] rounded px-1.5 py-1 focus-within:bg-white">
                                              <span className="text-[10px] text-stone-500 font-bold select-none shrink-0 pr-1">Flat </span>
                                              <input
                                                type="text"
                                                value={currentNumber}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  handleCellChange(row.id, 'proposedScholarship', `Flat ${val}`);
                                                }}
                                                onBlur={(e) => {
                                                  const val = e.target.value.trim();
                                                  if (val) {
                                                    handleCellChange(row.id, 'proposedScholarship', formatFlatScholarship(`Flat ${val}`));
                                                  }
                                                }}
                                                placeholder="e.g. 15k"
                                                className="w-full bg-transparent text-[10px] font-semibold text-stone-800 outline-none border-none p-0 focus:ring-0"
                                              />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      {!canEditField('proposedScholarship', row) && <Lock className="w-3 h-3 text-stone-400 shrink-0" title="Only CH/RAH/Central can propose scholarship revisions" />}
                                      <span className="font-semibold text-stone-800 text-xs">{row.proposedScholarship || 'No demand'}</span>
                                    </div>
                                  )}
                                  {(() => {
                                    const extraPct = getScholarshipInPct(row.proposedScholarship || '');
                                    const isRAH = isMoveToRAH(row.scholarship || '', row.proposedScholarship || '');
                                    if (extraPct === 0) return null;
                                    return (
                                      <div className="flex flex-col gap-0.5">
                                        <span className="inline-flex items-center text-[10px] font-extrabold text-[#7D452B] bg-[#FAF0E4] px-1 py-0.5 rounded-md w-max border border-[#F5DDD0]">
                                          +{extraPct}% extra
                                        </span>
                                        <span className={`text-[9px] font-bold px-1 py-0.2 rounded-sm w-max ${
                                          isRAH 
                                            ? 'bg-[#FBF5EC] text-[#6B5A3A] border border-[#ECE0CE]' 
                                            : 'bg-[#ECEFEA] text-[#324B37] border border-[#D1D9CD]'
                                        }`}>
                                          {isRAH ? 'Route: RAH (Over-Quota)' : 'Route: Direct Approved'}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })()}
                          </td>
                        )}

                                   {/* Extra Scholarship Status */}
                        {visibleColumns.extraScholarshipStatus && userRole !== 'FH' && userRole !== 'Mentor' && (
                          <td className="p-2">
                            {(() => {
                              const isEditable = inlineEditingMode && canEditField('extraScholarshipStatus', row);
                              return (
                                <div className="space-y-1">
                                  {isEditable ? (
                                    <select
                                      value={row.extraScholarshipStatus}
                                      onChange={(e) => handleCellChange(row.id, 'extraScholarshipStatus', e.target.value as any)}
                                      className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-bold cursor-pointer focus:border-[#5A7060]"
                                    >
                                      <option value="">Decide</option>
                                      <option value="Approved">Approved</option>
                                      <option value="Rejected">Rejected</option>
                                      <option value="InProgress">InProgress</option>
                                      <option value="Pending">Pending</option>
                                    </select>
                                  ) : (
                                    <div className="space-y-0.5">
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[10.5px] border ${
                                        row.extraScholarshipStatus === 'Approved' ? 'bg-[#ECEFEA] text-[#425246] border-[#D1D9CD]' :
                                        row.extraScholarshipStatus === 'Rejected' ? 'bg-[#FAF0E4] text-[#A25A38] border-[#F5DDD0]' :
                                        row.extraScholarshipStatus === 'InProgress' ? 'bg-[#E3EBF5] text-[#2C4A70] border-[#C5D5E6]' :
                                        row.extraScholarshipStatus === 'Pending' ? 'bg-[#FBF5EC] text-[#8C764D] border-[#ECE0CE]' : 'bg-stone-100 text-stone-450 border-stone-200/50'
                                      }`}>
                                        <Lock className="w-2.5 h-2.5 text-stone-400 shrink-0" title={`Requires appropriate credentials to edit`} />
                                        {row.extraScholarshipStatus || 'Undecided'}
                                      </span>
                                      
                                      {/* Help explain who can solve this */}
                                      {(() => {
                                        const extraPct = getScholarshipInPct(row.proposedScholarship || '');
                                        const isRAH = isMoveToRAH(row.scholarship || '', row.proposedScholarship || '');
                                        if (extraPct > 0 && !row.extraScholarshipStatus) {
                                          return (
                                            <div className="text-[9px] font-bold text-stone-500 italic mt-0.5">
                                              {isRAH ? 'Requires Regional Head Approval' : 'Requires Center Head Approval'}
                                            </div>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {/* Final Approval (RAH) */}
                        {visibleColumns.rahStatus && userRole !== 'FH' && userRole !== 'Mentor' && (
                          <td className="p-2">
                            {(() => {
                              const isRAHNeeded = isMoveToRAH(row.scholarship || '', row.proposedScholarship || '');
                              if (!isRAHNeeded) {
                                return (
                                  <span className="text-[10px] font-medium text-stone-400 italic block text-center bg-stone-50 py-1 rounded border border-stone-100">
                                    N/A (Direct Retention)
                                  </span>
                                );
                              }
                              
                              const isEditable = inlineEditingMode && canEditField('rahStatus', row);
                              return (
                                <div className="space-y-1">
                                  {isEditable ? (
                                    <select
                                      value={row.rahStatus || ''}
                                      onChange={(e) => handleCellChange(row.id, 'rahStatus', e.target.value as any)}
                                      className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#A25A38]/40 rounded-lg font-bold cursor-pointer focus:border-[#A25A38]"
                                    >
                                      <option value="">Decide RAH</option>
                                      <option value="Approved">Approved</option>
                                      <option value="Rejected">Rejected</option>
                                      <option value="InProgress">InProgress</option>
                                      <option value="Pending">Pending</option>
                                    </select>
                                  ) : (
                                    <div className="space-y-0.5">
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[10.5px] border ${
                                        row.rahStatus === 'Approved' ? 'bg-[#EBF5EE] text-[#2A4D32] border-[#CDE3D2]' :
                                        row.rahStatus === 'Rejected' ? 'bg-[#FAF0E4] text-[#A25A38] border-[#F5DDD0]' :
                                        row.rahStatus === 'InProgress' ? 'bg-[#E3EBF5] text-[#2C4A70] border-[#C5D5E6]' :
                                        row.rahStatus === 'Pending' ? 'bg-[#FBF5EC] text-[#8C764D] border-[#ECE0CE]' : 'bg-[#FFFDF5] text-[#8C764D] border-[#ECE0CE]'
                                      }`}>
                                        <Lock className="w-2.5 h-2.5 text-stone-450 shrink-0" />
                                        {row.rahStatus || 'Pending RAH'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {/* Final Retention Status by Mentor */}
                        {visibleColumns.finalRetentionStatus && (
                          <td className="p-2">
                            {(() => {
                              const isEditable = inlineEditingMode && canEditField('finalRetentionStatus', row);
                              return isEditable ? (
                                <select
                                  value={row.finalRetentionStatus || ''}
                                  onChange={(e) => handleCellChange(row.id, 'finalRetentionStatus', e.target.value)}
                                  className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-medium cursor-pointer focus:border-[#5A7060]"
                                >
                                  <option value="">Select Status</option>
                                  <option value="Ready to get retained">Ready to get retained</option>
                                  <option value="Not Retained">Not Retained</option>
                                  <option value="Extra Scholarship Required">Extra Scholarship Required</option>
                                </select>
                              ) : (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                                  row.finalRetentionStatus === 'Ready to get retained' || row.finalRetentionStatus === 'Retained' ? 'bg-[#ECEFEA] text-[#425246] border-[#D1D9CD]' :
                                  row.finalRetentionStatus === 'Not Retained' ? 'bg-[#FAF0E4] text-[#A25A38] border-[#F5DDD0]' :
                                  row.finalRetentionStatus === 'Extra Scholarship Required' ? 'bg-[#E3EBF5] text-[#2C4A70] border-[#C5D5E6]' :
                                  'bg-stone-100 text-stone-400 border-stone-200/50'
                                }`}>
                                  {!canEditField('finalRetentionStatus', row) && <Lock className="w-2.5 h-2.5 text-stone-455" title="Only Mentors/Central can modify retention status" />}
                                  {row.finalRetentionStatus || 'Undecided'}
                                </span>
                              );
                            })()}
                          </td>
                        )}

                        {/* Final Scholarship Column */}
                        {visibleColumns.finalScholarship && userRole !== 'Mentor' && (
                          <td className="p-2">
                            {(() => {
                              const isEditable = inlineEditingMode && canEditField('finalScholarship', row);
                              return (
                                <div>
                                  {isEditable ? (
                                    <select 
                                      value={row.finalScholarship || ''}
                                      onChange={(e) => handleCellChange(row.id, 'finalScholarship', e.target.value)}
                                      className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-bold focus:border-[#5A7060] cursor-pointer"
                                    >
                                      <option value="">Keep Original / None</option>
                                      {getFinalScholarshipOptions(row.scholarship, row.proposedScholarship).map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="font-semibold text-stone-800 text-xs text-center block">
                                      {row.finalScholarship || row.scholarship || 'Flat 15k'}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {/* Counselor Name */}
                        {visibleColumns.counselorName && (
                          <td className="p-2">
                            {(() => {
                              const isEditable = inlineEditingMode && canEditField('counselorName', row);
                              return isEditable ? (
                                <input 
                                  type="text"
                                  value={row.counselorName}
                                  onChange={(e) => handleCellChange(row.id, 'counselorName', e.target.value)}
                                  placeholder="Counselor"
                                  className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-medium focus:border-[#5A7060]"
                                />
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {inlineEditingMode && <Lock className="w-3 h-3 text-stone-400 shrink-0" title="Only Counselor or Central can edit Counselor Name" />}
                                  <span className="text-stone-650 text-xs truncate block max-w-[130px]">{row.counselorName || '-'}</span>
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {/* Counselor PWID */}
                        {visibleColumns.counselorPwid && (
                          <td className="p-2">
                            {(() => {
                              const isEditable = inlineEditingMode && canEditField('counselorPwid', row);
                              return isEditable ? (
                                <input 
                                  type="text"
                                  value={row.counselorPwid}
                                  onChange={(e) => handleCellChange(row.id, 'counselorPwid', e.target.value)}
                                  placeholder="PWID"
                                  className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-mono focus:border-[#5A7060]"
                                />
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {inlineEditingMode && <Lock className="w-3 h-3 text-stone-400 shrink-0" title="Only Counselor or Central can edit Counselor PWID" />}
                                  <span className="text-stone-500 font-mono text-xs">{row.counselorPwid || '-'}</span>
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {/* New Regno */}
                        {visibleColumns.newRegno && (
                          <td className="p-2">
                            {(() => {
                              const isEditable = inlineEditingMode && canEditField('newRegno', row);
                              return isEditable ? (
                                <input 
                                  type="text"
                                  value={row.newRegno}
                                  onChange={(e) => handleCellChange(row.id, 'newRegno', e.target.value)}
                                  placeholder="New Regno"
                                  className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-mono font-medium focus:border-[#5A7060]"
                                />
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {inlineEditingMode && <Lock className="w-3 h-3 text-stone-400 shrink-0" title="Only Counselor or Central can edit New Regno" />}
                                  <span className="font-mono text-stone-650 text-xs">{row.newRegno || '-'}</span>
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {/* Counselor Status Column */}
                        {visibleColumns.counselorStatus && (
                          <td className="p-2">
                            {(() => {
                              const isEditable = inlineEditingMode && canEditField('counselorStatus', row);
                              return isEditable ? (
                                <div className="space-y-1">
                                  <select
                                    value={isStandardCounselorStatus(row.counselorStatus) ? (row.counselorStatus || '') : 'Other'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === 'Other') {
                                        handleCellChange(row.id, 'counselorStatus', 'Custom Status');
                                      } else {
                                        handleCellChange(row.id, 'counselorStatus', val);
                                      }
                                    }}
                                    className="w-full bg-[#FAF8F5] hover:bg-[#F2EDDF] focus:bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-medium cursor-pointer focus:border-[#5A7060]"
                                  >
                                    <option value="">Select Status</option>
                                    <option value="Re-enrolled">Re-enrolled</option>
                                    <option value="Not Retained - Directly connect once again with Mentor">Not Retained - Directly connect once again with Mentor</option>
                                    <option value="Other">Other (Add Remarks)</option>
                                  </select>
                                  {!isStandardCounselorStatus(row.counselorStatus) && (
                                    <input 
                                      type="text"
                                      value={row.counselorStatus === 'Custom Status' ? '' : row.counselorStatus}
                                      onChange={(e) => handleCellChange(row.id, 'counselorStatus', e.target.value)}
                                      placeholder="Write custom status/remarks..."
                                      className="w-full bg-white text-xs px-2 py-1.5 border border-[#E3DEC3] rounded-lg font-medium focus:border-[#5A7060] focus:ring-1 focus:ring-[#5A7060]"
                                    />
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {inlineEditingMode && <Lock className="w-3 h-3 text-stone-400 shrink-0" title="Only Counselor or Central can edit Counselor Status" />}
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                                    row.counselorStatus === 'Re-enrolled' ? 'bg-[#ECEFEA] text-[#425246] border-[#D1D9CD]' :
                                    row.counselorStatus && row.counselorStatus.startsWith('Not Retained') ? 'bg-[#FAF0E4] text-[#A25A38] border-[#F5DDD0]' :
                                    row.counselorStatus ? 'bg-stone-100 text-stone-600 border-stone-200' : 'bg-transparent text-stone-400'
                                  }`}>
                                    {row.counselorStatus || '-'}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {/* Actions column */}
                        <td className="p-2 text-center align-middle sticky right-0 bg-[#FAFBF9] group-hover:bg-[#FAF8F2] transition duration-150 z-5 border-l border-[#E3DEC3] shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedStudentId(row.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#5A7060] bg-[#ECEFEA] hover:bg-[#D5DDD2] px-2.5 py-1.5 rounded-lg transition border border-[#CCD8C8]/80 cursor-pointer select-none shadow-3xs"
                              title="Open Detailed Editor Drawer"
                            >
                              <Maximize2 className="w-3 h-3 text-[#4A5D4F]" />
                              <span>Edit Drawer</span>
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(row.id, row.studentName)}
                                className="text-stone-500 hover:text-rose-600 bg-[#FAFBF9] hover:bg-rose-50 p-1.5 rounded-lg border border-stone-200 hover:border-rose-200 transition duration-150 cursor-pointer select-none shadow-3xs"
                                title={`Permanently delete student profile: ${row.studentName}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {/* Table footer row showing totals */}
          <div className="px-5 py-3 border-t border-[#E3DEC3] bg-[#FAF8F5] flex flex-col sm:flex-row justify-between items-center gap-2">
            <p className="text-xs text-stone-500 font-medium select-none">
              Double click on fields if inline edit is enabled to modify directly. Highly active spreadsheet representation.
            </p>
            <div className="text-xs font-semibold text-stone-700">
              Total displayed: {filteredData.length} records
            </div>
          </div>
        </div>
      </main>
        </>
      )}

      {/* Summary Dashboard View & Cuts */}
      {activeView === 'summary' && (
        <section className="px-6 py-5 space-y-6 flex-1 overflow-y-auto">
          {/* Summary Interactive Filter Panel */}
          <div className="bg-[#FDFBF9] rounded-3xl border border-[#E3DEC3] shadow-sm p-5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[#E3DEC3]/60 pb-4 mb-4">
              <div>
                <h2 className="font-serif font-bold text-[#2B3A2C] text-base tracking-tight flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-[#5A7060]" />
                  Interactive Dimensional Filters
                </h2>
                <p className="text-xs text-stone-500 font-semibold mt-1">
                  Filter all statistical breakdowns below. Instantly examine retention cuts for specific teams, locations, and facilities.
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-[#5A7060] bg-[#ECEFEA] border border-[#D1D9CD] px-2.5 py-1 rounded-xl">
                  Matched: {filteredSummaryData.length} of {data.length} students
                </span>
                {(summaryRegion !== 'All' || summaryCenter !== 'All' || summaryBuilding !== 'All' || summaryClass !== 'All' || summaryRisk !== 'All' || summaryPtmStatus !== 'All' || summaryRetention !== 'All') && (
                  <button
                    onClick={() => {
                      setSummaryRegion('All');
                      setSummaryCenter('All');
                      setSummaryBuilding('All');
                      setSummaryClass('All');
                      setSummaryRisk('All');
                      setSummaryPtmStatus('All');
                      setSummaryRetention('All');
                      triggerBanner("All filters reset successfully", "info");
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-[#A25A38] bg-[#FAF0E4] hover:bg-[#F5DDD0] border border-[#F5DDD0] px-2.5 py-1 rounded-xl transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Filters
                  </button>
                )}
              </div>
            </div>

            {/* Filter Dropdowns Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {/* Region */}
              <div>
                <label className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider mb-1.5">Region</label>
                <select
                  value={summaryRegion}
                  onChange={(e) => setSummaryRegion(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-1.5 text-xs font-semibold text-stone-700 focus:outline-hidden focus:border-[#5A7060] focus:bg-white"
                >
                  {summaryFiltersOptions.regions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Center */}
              <div>
                <label className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider mb-1.5">Center</label>
                <select
                  value={summaryCenter}
                  onChange={(e) => setSummaryCenter(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-1.5 text-xs font-semibold text-stone-700 focus:outline-hidden focus:border-[#5A7060] focus:bg-white"
                >
                  {summaryFiltersOptions.centers.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Building */}
              <div>
                <label className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider mb-1.5">Building</label>
                <select
                  value={summaryBuilding}
                  onChange={(e) => setSummaryBuilding(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-1.5 text-xs font-semibold text-stone-700 focus:outline-hidden focus:border-[#5A7060] focus:bg-white"
                >
                  {summaryFiltersOptions.buildings.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {/* Class */}
              <div>
                <label className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider mb-1.5">Class / Grade</label>
                <select
                  value={summaryClass}
                  onChange={(e) => setSummaryClass(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-1.5 text-xs font-semibold text-stone-700 focus:outline-hidden focus:border-[#5A7060] focus:bg-white"
                >
                  {summaryFiltersOptions.classes.map(cl => (
                    <option key={cl} value={cl}>{cl}</option>
                  ))}
                </select>
              </div>

              {/* PTM Status */}
              <div>
                <label className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider mb-1.5">PTM Status</label>
                <select
                  value={summaryPtmStatus}
                  onChange={(e) => setSummaryPtmStatus(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-1.5 text-xs font-semibold text-stone-700 focus:outline-hidden focus:border-[#5A7060] focus:bg-white"
                >
                  {summaryFiltersOptions.ptmStatuses.map(ps => (
                    <option key={ps} value={ps}>{ps}</option>
                  ))}
                </select>
              </div>

              {/* Risk Level */}
              <div>
                <label className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider mb-1.5">Retention Risk</label>
                <select
                  value={summaryRisk}
                  onChange={(e) => setSummaryRisk(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-1.5 text-xs font-semibold text-stone-700 focus:outline-hidden focus:border-[#5A7060] focus:bg-white"
                >
                  {summaryFiltersOptions.risks.map(rk => (
                    <option key={rk} value={rk}>
                      {rk === 'All' ? 'All Risks' : rk === 'High' ? 'High Probability (Low Risk)' : rk === 'Medium' ? 'Medium Probability (Med Risk)' : rk === 'Low' ? 'Low Probability (High Risk)' : rk}
                    </option>
                  ))}
                </select>
              </div>

              {/* Retention Status */}
              <div>
                <label className="block text-[10px] font-extrabold text-stone-500 uppercase tracking-wider mb-1.5">Final Status</label>
                <select
                  value={summaryRetention}
                  onChange={(e) => setSummaryRetention(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-1.5 text-xs font-semibold text-stone-700 focus:outline-hidden focus:border-[#5A7060] focus:bg-white"
                >
                  {summaryFiltersOptions.retentions.map(rt => (
                    <option key={rt} value={rt}>{rt}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* KPI Dashboard Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Filtered Count */}
            <div className="bg-[#FDFBF9] p-4.5 rounded-2xl border border-[#E3DEC3] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-semibold tracking-wide uppercase font-sans">Filtered Pool</span>
                <div className="bg-[#FAF8F5] p-1.5 rounded-lg text-[#5A7060]">
                  <Users className="w-4 h-4 text-[#5A7060]" />
                </div>
              </div>
              <div className="mt-2.5">
                <p className="text-2xl font-serif font-bold text-[#2B3A2C] tracking-tight">{filteredSummaryData.length}</p>
                <p className="text-[10px] text-stone-500 mt-1 font-medium select-none">
                  {data.length > 0 ? Math.round((filteredSummaryData.length / data.length) * 100) : 0}% of total student registry
                </p>
              </div>
            </div>

            {/* Retention Rate */}
            <div className="bg-[#FDFBF9] p-4.5 rounded-2xl border border-[#E3DEC3] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-semibold tracking-wide uppercase font-sans">Retention Rate</span>
                <div className="bg-[#ECEFEA] p-1.5 rounded-lg text-[#5A7060]">
                  <CheckCircle2 className="w-4 h-4 text-[#5A7060]" />
                </div>
              </div>
              <div className="mt-2.5">
                <p className="text-2xl font-serif font-bold text-[#5A7060] tracking-tight">
                  {filteredSummaryData.length > 0 
                    ? Math.round((filteredSummaryData.filter(s => s.finalRetentionStatus === 'Retained').length / filteredSummaryData.length) * 100) 
                    : 0}%
                </p>
                <p className="text-[10px] text-stone-500 mt-1 font-medium select-none">
                  {filteredSummaryData.filter(s => s.finalRetentionStatus === 'Retained').length} retained students
                </p>
              </div>
            </div>

            {/* Extra Scholarship Required */}
            <div className="bg-[#FDFBF9] p-4.5 rounded-2xl border border-[#E3DEC3] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-semibold tracking-wide uppercase font-sans">Extra Scholarship</span>
                <div className="bg-[#FBF5EC] p-1.5 rounded-lg text-[#8C764D]">
                  <Percent className="w-4 h-4 text-[#8C764D]" />
                </div>
              </div>
              <div className="mt-2.5">
                <p className="text-2xl font-serif font-bold text-[#8C764D] tracking-tight">
                  {filteredSummaryData.filter(s => s.finalRetentionStatus === 'Extra Scholarship Required').length}
                </p>
                <p className="text-[10px] text-stone-500 mt-1 font-medium select-none">
                  {filteredSummaryData.length > 0 
                    ? Math.round((filteredSummaryData.filter(s => s.finalRetentionStatus === 'Extra Scholarship Required').length / filteredSummaryData.length) * 100) 
                    : 0}% of targeted pool
                </p>
              </div>
            </div>

            {/* WhatsApp Communication */}
            <div className="bg-[#FDFBF9] p-4.5 rounded-2xl border border-[#E3DEC3] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-semibold tracking-wide uppercase font-sans">WhatsApp Intimated</span>
                <div className="bg-[#FAF8F5] p-1.5 rounded-lg text-[#5A7060]">
                  <Mail className="w-4 h-4 text-[#5A7060]" />
                </div>
              </div>
              <div className="mt-2.5">
                <p className="text-2xl font-serif font-bold text-[#2B3A2C] tracking-tight">
                  {filteredSummaryData.length > 0 
                    ? Math.round((filteredSummaryData.filter(s => s.whatsappIntimation).length / filteredSummaryData.length) * 100) 
                    : 0}%
                </p>
                <p className="text-[10px] text-stone-500 mt-1 font-medium select-none">
                  {filteredSummaryData.filter(s => s.whatsappIntimation).length} profiles reached
                </p>
              </div>
            </div>

            {/* High Retention Risk */}
            <div className="bg-[#FDFBF9] p-4.5 rounded-2xl border border-[#E3DEC3] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-semibold tracking-wide uppercase font-sans">High Risk (Low Prob)</span>
                <div className="bg-[#FDF3EE] p-1.5 rounded-lg text-[#A25A38]">
                  <TrendingDown className="w-4 h-4 text-[#A25A38]" />
                </div>
              </div>
              <div className="mt-2.5">
                <p className="text-2xl font-serif font-bold text-[#A25A38] tracking-tight">
                  {filteredSummaryData.filter(s => s.retentionProbability === 'Low').length}
                </p>
                <p className="text-[10px] text-stone-500 mt-1 font-medium select-none">
                  {filteredSummaryData.length > 0 
                    ? Math.round((filteredSummaryData.filter(s => s.retentionProbability === 'Low').length / filteredSummaryData.length) * 100) 
                    : 0}% critical risk rate
                </p>
              </div>
            </div>
          </div>

          {/* "ALL CUTS" - Grid of Breakdown Dimensions */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Unified Interactive Regional Hierarchy Drill-down with Role Permissions */}
            <div className="bg-[#FDFBF9] rounded-3xl border border-[#E3DEC3] shadow-sm p-5 xl:col-span-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#E3DEC3]/60 pb-3.5 mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#8C764D]" />
                  <div>
                    <h3 className="font-serif font-bold text-[#2B3A2C] text-sm">Interactive Regional Hierarchy Drill-down</h3>
                    <p className="text-[10px] text-stone-500 font-medium">Click on any Region, Center, or Building to drill down. Live Role mappings are shown next to each tier.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-extrabold text-stone-500 uppercase tracking-wider bg-[#F2EDDF] px-2 py-1 rounded-lg">Region &gt; Center &gt; Building &gt; Class</span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead>
                    <tr className="border-b border-[#E3DEC3]/80 text-stone-500 font-extrabold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 pl-3">Organizational Node</th>
                      <th className="py-2.5">Assigned Role Permissions Mapping</th>
                      <th className="py-2.5 text-center">Perspectives & Issues Dropdown</th>
                      <th className="py-2.5 text-center">Student Pool</th>
                      <th className="py-2.5 text-center">Retained</th>
                      <th className="py-2.5 text-center">Extra Sch. Req</th>
                      <th className="py-2.5 text-center">Not Retained</th>
                      <th className="py-2.5 text-center">Pending Remarks</th>
                      <th className="py-2.5 text-center">PTM Conducted</th>
                      <th className="py-2.5 text-right pr-4 w-[140px]">Retention Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200/50">
                    {(Object.entries(hierarchicalCuts) as [string, RegionNode][]).map(([regionName, regionNode]) => {
                      const isRegionExpanded = !!expandedRegions[regionName];
                      const regionRetentionRate = regionNode.total > 0 ? Math.round((regionNode.retained / regionNode.total) * 100) : 0;
                      const regionPtmRate = regionNode.total > 0 ? Math.round((regionNode.ptmDone / regionNode.total) * 100) : 0;

                      return (
                        <React.Fragment key={regionName}>
                          {/* Region Row (Level 1) */}
                          <tr 
                            className="bg-[#FAF8F5]/80 hover:bg-[#F2EDDF]/80 transition cursor-pointer font-sans"
                            onClick={() => setExpandedRegions(prev => ({ ...prev, [regionName]: !prev[regionName] }))}
                          >
                            <td className="py-3 pl-3 font-serif font-extrabold text-stone-900 flex items-center gap-1.5">
                              {isRegionExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                              )}
                              <MapPin className="w-3.5 h-3.5 text-[#5A7060] shrink-0" />
                              <span>{regionName}</span>
                            </td>
                            <td className="py-3">
                              <div className="flex flex-col gap-1">
                                {regionNode.rahs.length > 0 && renderRoleBadges('RAH', regionNode.rahs, 'bg-[#FAF3EE] text-[#A25A38] border border-[#F5E6DD]')}
                                {regionNode.rfhs.length > 0 && renderRoleBadges('RFH', regionNode.rfhs, 'bg-blue-50 text-blue-700 border border-blue-100')}
                                {regionNode.rahs.length === 0 && regionNode.rfhs.length === 0 && (
                                  <span className="text-stone-400 italic text-[11px]">-</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 text-center">
                              {renderPerspectiveDropdown(regionNode)}
                            </td>
                            <td className="py-3 text-center font-bold text-stone-800">{regionNode.total}</td>
                            <td className="py-3 text-center text-emerald-700 font-bold">{regionNode.retained}</td>
                            <td className="py-3 text-center text-amber-700 font-bold">{regionNode.extraReq}</td>
                            <td className="py-3 text-center text-rose-800 font-bold">{regionNode.notRetained}</td>
                            <td className="py-3 text-center text-stone-500 font-semibold">{regionNode.pending}</td>
                            <td className="py-3 text-center text-indigo-700 font-bold">{regionPtmRate}%</td>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2 justify-end">
                                <span className="font-mono text-[10px] font-bold text-stone-600">{regionRetentionRate}%</span>
                                <div className="w-20 bg-stone-200 h-2 rounded-full overflow-hidden border border-stone-300">
                                  <div 
                                    className="bg-[#5A7060] h-full rounded-full transition-all duration-300"
                                    style={{ width: `${regionRetentionRate}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Level 2: Centers inside Region */}
                          {isRegionExpanded && (Object.entries(regionNode.centers) as [string, CenterNode][]).map(([centerName, centerNode]) => {
                            const centerKey = `${regionName}||${centerName}`;
                            const isCenterExpanded = !!expandedCenters[centerKey];
                            const centerRetentionRate = centerNode.total > 0 ? Math.round((centerNode.retained / centerNode.total) * 100) : 0;
                            const centerPtmRate = centerNode.total > 0 ? Math.round((centerNode.ptmDone / centerNode.total) * 100) : 0;

                            return (
                              <React.Fragment key={centerKey}>
                                <tr 
                                  className="bg-white hover:bg-[#FAF8F5]/80 transition cursor-pointer border-l-2 border-[#5A7060]"
                                  onClick={() => setExpandedCenters(prev => ({ ...prev, [centerKey]: !prev[centerKey] }))}
                                >
                                  <td className="py-2.5 pl-8 font-sans font-bold text-stone-800 flex items-center gap-1.5">
                                    {isCenterExpanded ? (
                                      <ChevronDown className="w-3 h-3 text-stone-500 shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3 text-stone-500 shrink-0" />
                                    )}
                                    <GraduationCap className="w-3.5 h-3.5 text-[#8C764D] shrink-0" />
                                    <span>{centerName}</span>
                                  </td>
                                  <td className="py-2.5">
                                    <div className="flex flex-col gap-1">
                                      {centerNode.chs.length > 0 && renderRoleBadges('CH', centerNode.chs, 'bg-[#FAF5EC] text-[#8C764D] border border-[#ECE0CE]')}
                                      {centerNode.rfhs.length > 0 && renderRoleBadges('RFH', centerNode.rfhs, 'bg-blue-50 text-blue-700 border border-blue-100')}
                                      {centerNode.chs.length === 0 && centerNode.rfhs.length === 0 && (
                                        <span className="text-stone-400 italic text-[11px]">-</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 text-center">
                                    {renderPerspectiveDropdown(centerNode)}
                                  </td>
                                  <td className="py-2.5 text-center font-semibold text-stone-700">{centerNode.total}</td>
                                  <td className="py-2.5 text-center text-emerald-700 font-semibold">{centerNode.retained}</td>
                                  <td className="py-2.5 text-center text-amber-700 font-semibold">{centerNode.extraReq}</td>
                                  <td className="py-2.5 text-center text-rose-800 font-semibold">{centerNode.notRetained}</td>
                                  <td className="py-2.5 text-center text-stone-500 font-medium">{centerNode.pending}</td>
                                  <td className="py-2.5 text-center text-indigo-700 font-semibold">{centerPtmRate}%</td>
                                  <td className="py-2.5 pr-4">
                                    <div className="flex items-center gap-2 justify-end">
                                      <span className="font-mono text-[10px] font-semibold text-stone-600">{centerRetentionRate}%</span>
                                      <div className="w-16 bg-stone-200 h-1.5 rounded-full overflow-hidden border border-stone-300">
                                        <div 
                                          className="bg-[#8C764D] h-full rounded-full transition-all duration-300"
                                          style={{ width: `${centerRetentionRate}%` }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {/* Level 3: Buildings inside Center */}
                                {isCenterExpanded && (Object.entries(centerNode.buildings) as [string, BuildingNode][]).map(([buildingName, buildingNode]) => {
                                  const buildingKey = `${centerKey}||${buildingName}`;
                                  const isBuildingExpanded = !!expandedBuildings[buildingKey];
                                  const buildingRetentionRate = buildingNode.total > 0 ? Math.round((buildingNode.retained / buildingNode.total) * 100) : 0;
                                  const buildingPtmRate = buildingNode.total > 0 ? Math.round((buildingNode.ptmDone / buildingNode.total) * 100) : 0;

                                  return (
                                    <React.Fragment key={buildingKey}>
                                      <tr 
                                        className="bg-stone-50/50 hover:bg-stone-100/50 transition cursor-pointer border-l-4 border-[#8C764D]"
                                        onClick={() => setExpandedBuildings(prev => ({ ...prev, [buildingKey]: !prev[buildingKey] }))}
                                      >
                                        <td className="py-2 pl-14 font-sans font-medium text-stone-700 flex items-center gap-1.5">
                                          {isBuildingExpanded ? (
                                            <ChevronDown className="w-2.5 h-2.5 text-stone-400 shrink-0" />
                                          ) : (
                                            <ChevronRight className="w-2.5 h-2.5 text-stone-400 shrink-0" />
                                          )}
                                          <Layers className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                                          <span>{buildingName}</span>
                                        </td>
                                        <td className="py-2">
                                          <div className="flex flex-col gap-1">
                                            {buildingNode.fhs.length > 0 && renderRoleBadges('FH', buildingNode.fhs, 'bg-indigo-50 text-indigo-700 border border-indigo-100')}
                                            {buildingNode.chs.length > 0 && renderRoleBadges('CH', buildingNode.chs, 'bg-[#FAF5EC] text-[#8C764D] border border-[#ECE0CE]')}
                                            {buildingNode.fhs.length === 0 && buildingNode.chs.length === 0 && (
                                              <span className="text-stone-400 italic text-[11px]">-</span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-2 text-center">
                                          {renderPerspectiveDropdown(buildingNode)}
                                        </td>
                                        <td className="py-2 text-center text-stone-600">{buildingNode.total}</td>
                                        <td className="py-2 text-center text-emerald-700">{buildingNode.retained}</td>
                                        <td className="py-2 text-center text-amber-700">{buildingNode.extraReq}</td>
                                        <td className="py-2 text-center text-rose-800">{buildingNode.notRetained}</td>
                                        <td className="py-2 text-center text-stone-400">{buildingNode.pending}</td>
                                        <td className="py-2 text-center text-indigo-700">{buildingPtmRate}%</td>
                                        <td className="py-2 pr-4">
                                          <div className="flex items-center gap-2 justify-end">
                                            <span className="font-mono text-[10px] text-stone-500">{buildingRetentionRate}%</span>
                                            <div className="w-14 bg-stone-100 h-1 rounded-full overflow-hidden border border-stone-200">
                                              <div 
                                                className="bg-stone-500 h-full rounded-full transition-all duration-300"
                                                style={{ width: `${buildingRetentionRate}%` }}
                                              />
                                            </div>
                                          </div>
                                        </td>
                                      </tr>

                                      {/* Level 4: Classes inside Building */}
                                      {isBuildingExpanded && (Object.entries(buildingNode.classes) as [string, ClassNode][]).map(([className, classNode]) => {
                                        const classRetentionRate = classNode.total > 0 ? Math.round((classNode.retained / classNode.total) * 100) : 0;
                                        const classPtmRate = classNode.total > 0 ? Math.round((classNode.ptmDone / classNode.total) * 100) : 0;

                                        return (
                                          <tr key={className} className="bg-stone-100/20 hover:bg-stone-100/40 transition">
                                            <td className="py-1.5 pl-20 font-sans text-stone-600 flex items-center gap-1.5">
                                              <span className="w-1 h-1 rounded-full bg-stone-400 shrink-0 ml-1"></span>
                                              <span>{className}</span>
                                            </td>
                                            <td className="py-1.5">
                                              <div className="flex flex-col gap-1">
                                                {classNode.mentors.length > 0 && renderRoleBadges('MENTOR', classNode.mentors, 'bg-emerald-50 text-emerald-700 border border-emerald-100')}
                                                {classNode.counselors.length > 0 && renderRoleBadges('COUNSELOR', classNode.counselors, 'bg-teal-50 text-teal-700 border border-teal-100')}
                                                {classNode.mentors.length === 0 && classNode.counselors.length === 0 && (
                                                  <span className="text-stone-400 italic text-[11px]">-</span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="py-1.5 text-center">
                                              {renderPerspectiveDropdown(classNode)}
                                            </td>
                                            <td className="py-1.5 text-center text-stone-500">{classNode.total}</td>
                                            <td className="py-1.5 text-center text-emerald-600">{classNode.retained}</td>
                                            <td className="py-1.5 text-center text-amber-600">{classNode.extraReq}</td>
                                            <td className="py-1.5 text-center text-rose-700">{classNode.notRetained}</td>
                                            <td className="py-1.5 text-center text-stone-400">{classNode.pending}</td>
                                            <td className="py-1.5 text-center text-indigo-600">{classPtmRate}%</td>
                                            <td className="py-1.5 pr-4 text-right">
                                              <span className="font-mono text-[10px] text-stone-500">{classRetentionRate}%</span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </React.Fragment>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                    {Object.keys(hierarchicalCuts).length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-10 text-center text-stone-400 font-medium italic">No data matched the active filter criteria</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Collapsible Interactive Student Perspective Details Card */}
              <AnimatePresence>
                {selectedPerspectiveStudent && (
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 15 }}
                    className="mt-6 p-5 bg-[#FAF8F5] rounded-2xl border-2 border-[#8C764D]/30 shadow-xs text-stone-800"
                  >
                    <div className="flex items-center justify-between border-b border-[#E3DEC3] pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <User className="w-5 h-5 text-[#8C764D]" />
                        <div>
                          <h4 className="font-serif font-bold text-[#2B3A2C] text-sm">
                            Auditing Perspective: {selectedPerspectiveStudent.studentName}
                          </h4>
                          <p className="text-[10px] text-stone-500 font-medium">
                            Reg No: {selectedPerspectiveStudent.regNo} | Class: {selectedPerspectiveStudent.class} | Building: {selectedPerspectiveStudent.building} | Center: {selectedPerspectiveStudent.center}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setSelectedPerspectiveRegNo(null)}
                        className="p-1 rounded-full hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition cursor-pointer"
                        title="Clear Selection"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Risk Card */}
                      <div className="bg-white p-3 rounded-xl border border-[#E3DEC3] shadow-xs">
                        <div className="text-[9px] font-extrabold uppercase tracking-wide text-stone-500 mb-1">
                          Retention Probability (Risk)
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {selectedPerspectiveStudent.retentionProbability === 'Low' ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                              Low Prob (High Risk)
                            </span>
                          ) : selectedPerspectiveStudent.retentionProbability === 'Medium' ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              Med Prob (Med Risk)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              High Prob (Low Risk)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Scholarship Stats */}
                      <div className="bg-white p-3 rounded-xl border border-[#E3DEC3] shadow-xs">
                        <div className="text-[9px] font-extrabold uppercase tracking-wide text-stone-500 mb-1">
                          Scholarship Split
                        </div>
                        <div className="text-[11px] font-semibold text-stone-800 flex flex-col gap-0.5">
                          <div><span className="text-stone-400">Current:</span> {selectedPerspectiveStudent.scholarship || '0%'}</div>
                          <div><span className="text-stone-400">Proposed:</span> {selectedPerspectiveStudent.proposedScholarship || 'None'}</div>
                          {selectedPerspectiveStudent.proposedScholarship && (
                            <div className="text-[9px] text-amber-700 font-extrabold bg-amber-50/50 px-1.5 py-0.5 rounded-sm inline-block mt-0.5 border border-amber-100/30">
                              Requested Extra Support
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status & PTM */}
                      <div className="bg-white p-3 rounded-xl border border-[#E3DEC3] shadow-xs">
                        <div className="text-[9px] font-extrabold uppercase tracking-wide text-stone-500 mb-1">
                          Final Decision & PTM
                        </div>
                        <div className="text-[11px] font-semibold text-stone-800 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-stone-400">Status:</span>
                            <span className={`px-1.5 py-0.5 rounded-md font-extrabold text-[9px] ${
                              selectedPerspectiveStudent.finalRetentionStatus === 'Not Retained' ? 'bg-rose-50 text-rose-800 border border-rose-100' :
                              selectedPerspectiveStudent.finalRetentionStatus === 'Ready to get retained' || selectedPerspectiveStudent.finalRetentionStatus === 'Retained' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' :
                              selectedPerspectiveStudent.finalRetentionStatus === 'Extra Scholarship Required' ? 'bg-amber-50 text-amber-800 border border-amber-100' :
                              'bg-stone-50 text-stone-600 border border-stone-100'
                            }`}>
                              {selectedPerspectiveStudent.finalRetentionStatus || 'Pending'}
                            </span>
                          </div>
                          <div>
                            <span className="text-stone-400">PTM Status:</span> {selectedPerspectiveStudent.ptmStatus || 'Pending'}
                          </div>
                        </div>
                      </div>

                      {/* Contact & Owner */}
                      <div className="bg-white p-3 rounded-xl border border-[#E3DEC3] shadow-xs">
                        <div className="text-[9px] font-extrabold uppercase tracking-wide text-stone-500 mb-1">
                          Owner & Counselor
                        </div>
                        <div className="text-[11px] font-semibold text-stone-800 flex flex-col gap-0.5">
                          <div><span className="text-stone-400">Mentor:</span> <span className="text-stone-700 select-all font-mono text-[10px]">{selectedPerspectiveStudent.mentor || 'Unassigned'}</span></div>
                          <div><span className="text-stone-400">Counselor:</span> <span className="text-stone-700 select-all font-mono text-[10px]">{selectedPerspectiveStudent.counselorName || 'Unassigned'}</span></div>
                        </div>
                      </div>
                    </div>

                    {/* Remarks & Reason block */}
                    {(selectedPerspectiveStudent.parentRemarks || selectedPerspectiveStudent.discontinueReason) && (
                      <div className="mt-3.5 bg-white p-4 rounded-xl border border-[#E3DEC3] shadow-xs">
                        <h5 className="text-[10px] font-extrabold uppercase tracking-wide text-stone-500 mb-2 flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5 text-stone-400" />
                          Critical Remarks & Discontinuation Reason
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                          {selectedPerspectiveStudent.discontinueReason && (
                            <div className="p-2.5 rounded-lg bg-rose-50/50 border border-rose-100/60">
                              <span className="font-bold text-rose-900 block mb-0.5">Discontinue Reason</span>
                              <p className="text-stone-700 font-medium italic">"{selectedPerspectiveStudent.discontinueReason}"</p>
                            </div>
                          )}
                          {selectedPerspectiveStudent.parentRemarks && (
                            <div className="p-2.5 rounded-lg bg-amber-50/50 border border-amber-100/60">
                              <span className="font-bold text-amber-900 block mb-0.5">Parent Feedback / Remarks</span>
                              <p className="text-stone-700 font-medium italic">"{selectedPerspectiveStudent.parentRemarks}"</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Direct Edit Shortcuts */}
                    <div className="mt-4 flex flex-wrap gap-2 justify-end">
                      <button 
                        onClick={() => {
                          setSelectedStudentId(selectedPerspectiveStudent.id);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#5A7060] text-white hover:bg-[#4E6152] transition shadow-xs cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Open Complete Student Profile
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Cut 5: Mentor-wise Retention Performance */}
            <div className="bg-[#FDFBF9] rounded-3xl border border-[#E3DEC3] shadow-sm p-5 xl:col-span-2">
              <div className="flex justify-between items-center border-b border-[#E3DEC3]/60 pb-3.5 mb-4">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-[#5A7060]" />
                  <h3 className="font-serif font-bold text-[#2B3A2C] text-sm">Mentor Performance Cut Breakdown</h3>
                </div>
                <span className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Grouped by Mentor</span>
              </div>

              <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead>
                    <tr className="border-b border-[#E3DEC3]/80 text-stone-500 font-extrabold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 pr-4">Mentor Name</th>
                      <th className="py-2.5 text-center">Student Pool</th>
                      <th className="py-2.5 text-center">Retained</th>
                      <th className="py-2.5 text-center">Extra Sch. Req</th>
                      <th className="py-2.5 text-center">Not Retained</th>
                      <th className="py-2.5 text-center">Pending Remarks</th>
                      <th className="py-2.5 text-center">WhatsApp Sent %</th>
                      <th className="py-2.5 text-right w-[160px]">Retention Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3DEC3]/40">
                    {getCutsForField('mentor').map(cut => (
                      <tr key={cut.key} className="hover:bg-[#FAF8F5]/60 transition">
                        <td className="py-3 font-serif font-bold text-stone-800 pr-4">{cut.key}</td>
                        <td className="py-3 text-center font-bold text-stone-700">{cut.total}</td>
                        <td className="py-3 text-center text-emerald-700 font-semibold">{cut.retained}</td>
                        <td className="py-3 text-center text-amber-700 font-semibold">{cut.extraReq}</td>
                        <td className="py-3 text-center text-rose-800 font-semibold">{cut.notRetained}</td>
                        <td className="py-3 text-center text-stone-500 font-semibold">{cut.pending}</td>
                        <td className="py-3 text-center text-indigo-700 font-semibold">{cut.whatsappRate}%</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <span className="font-mono text-[10px] font-bold text-stone-600">{cut.retentionRate}%</span>
                            <div className="w-24 bg-stone-200 h-2 rounded-full overflow-hidden border border-stone-300">
                              <div 
                                className="bg-[#5A7060] h-full rounded-full transition-all duration-300"
                                style={{ width: `${cut.retentionRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {getCutsForField('mentor').length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-stone-400 font-medium italic">No mentor cuts available for these filter selections</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cut 6: Counselor Performance Cut Breakdown */}
            <div className="bg-[#FDFBF9] rounded-3xl border border-[#E3DEC3] shadow-sm p-5 xl:col-span-2">
              <div className="flex justify-between items-center border-b border-[#E3DEC3]/60 pb-3.5 mb-4">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-[#8C764D]" />
                  <h3 className="font-serif font-bold text-[#2B3A2C] text-sm">Counselor Performance Cut Breakdown</h3>
                </div>
                <span className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Grouped by Counselor</span>
              </div>

              <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead>
                    <tr className="border-b border-[#E3DEC3]/80 text-stone-500 font-extrabold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 pr-4">Counselor Name / Email</th>
                      <th className="py-2.5 text-center">Student Pool</th>
                      <th className="py-2.5 text-center">Retained</th>
                      <th className="py-2.5 text-center">Extra Sch. Req</th>
                      <th className="py-2.5 text-center">Not Retained</th>
                      <th className="py-2.5 text-center">Pending Remarks</th>
                      <th className="py-2.5 text-center">PTM Conducted %</th>
                      <th className="py-2.5 text-right w-[160px]">Retention Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3DEC3]/40">
                    {getCutsForField('counselorName').map(cut => (
                      <tr key={cut.key} className="hover:bg-[#FAF8F5]/60 transition">
                        <td className="py-3 font-serif font-bold text-stone-800 pr-4 truncate max-w-[200px]" title={cut.key}>{cut.key}</td>
                        <td className="py-3 text-center font-bold text-stone-700">{cut.total}</td>
                        <td className="py-3 text-center text-emerald-700 font-semibold">{cut.retained}</td>
                        <td className="py-3 text-center text-amber-700 font-semibold">{cut.extraReq}</td>
                        <td className="py-3 text-center text-rose-800 font-semibold">{cut.notRetained}</td>
                        <td className="py-3 text-center text-stone-500 font-semibold">{cut.pending}</td>
                        <td className="py-3 text-center text-indigo-700 font-semibold">{cut.ptmRate}%</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <span className="font-mono text-[10px] font-bold text-stone-600">{cut.retentionRate}%</span>
                            <div className="w-24 bg-stone-200 h-2 rounded-full overflow-hidden border border-stone-300">
                              <div 
                                className="bg-[#8C764D] h-full rounded-full transition-all duration-300"
                                style={{ width: `${cut.retentionRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {getCutsForField('counselorName').length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-stone-400 font-medium italic">No counselor cuts available for these filter selections</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cut 7: Scholarship Tier Retention & Extra Scholarship Demand Status */}
            <div className="bg-[#FDFBF9] rounded-3xl border border-[#E3DEC3] shadow-sm p-5">
              <div className="flex justify-between items-center border-b border-[#E3DEC3]/60 pb-3.5 mb-4">
                <div className="flex items-center gap-2">
                  <Percent className="w-5 h-5 text-[#5A7060]" />
                  <h3 className="font-serif font-bold text-[#2B3A2C] text-sm">Scholarship Cohort Retention Analysis</h3>
                </div>
                <span className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Grouped by Scholarship Tier</span>
              </div>

              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead>
                    <tr className="border-b border-[#E3DEC3]/80 text-stone-500 font-extrabold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 pr-4">Base Scholarship Tier</th>
                      <th className="py-2.5 text-center">Cohort Size</th>
                      <th className="py-2.5 text-center">Retained</th>
                      <th className="py-2.5 text-center">Extra Demand</th>
                      <th className="py-2.5 text-center">Not Retained / Pending</th>
                      <th className="py-2.5 text-right w-[140px]">Retention Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3DEC3]/40">
                    {getCutsForField('scholarship').map(cut => (
                      <tr key={cut.key} className="hover:bg-[#FAF8F5]/60 transition">
                        <td className="py-3 font-serif font-bold text-stone-800 pr-4">{cut.key || 'No Scholarship'}</td>
                        <td className="py-3 text-center font-bold text-stone-700">{cut.total}</td>
                        <td className="py-3 text-center text-emerald-700 font-semibold">{cut.retained}</td>
                        <td className="py-3 text-center text-amber-700 font-semibold">{cut.extraReq}</td>
                        <td className="py-3 text-center text-stone-500 font-medium">{cut.notRetained} / {cut.pending}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <span className="font-mono text-[10px] font-bold text-stone-600">{cut.retentionRate}%</span>
                            <div className="w-20 bg-stone-200 h-1.5 rounded-full overflow-hidden border border-stone-300">
                              <div 
                                className="bg-[#5A7060] h-full rounded-full transition-all duration-300"
                                style={{ width: `${cut.retentionRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {getCutsForField('scholarship').length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-stone-400 font-medium italic">No scholarship cohort cuts available for these filter selections</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cut 8: PTM Coordination Status & Progress Summary */}
            <div className="bg-[#FDFBF9] rounded-3xl border border-[#E3DEC3] shadow-sm p-5">
              <div className="flex justify-between items-center border-b border-[#E3DEC3]/60 pb-3.5 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#5A7060]" />
                  <h3 className="font-serif font-bold text-[#2B3A2C] text-sm">PTM Schedule & Retention Impact</h3>
                </div>
                <span className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider">Grouped by PTM Status</span>
              </div>

              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead>
                    <tr className="border-b border-[#E3DEC3]/80 text-stone-500 font-extrabold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 pr-4">PTM Status</th>
                      <th className="py-2.5 text-center">Student Pool</th>
                      <th className="py-2.5 text-center">Retained</th>
                      <th className="py-2.5 text-center">Extra Demand</th>
                      <th className="py-2.5 text-center">Not Retained</th>
                      <th className="py-2.5 text-right w-[140px]">Retention Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3DEC3]/40">
                    {getCutsForField('ptmStatus').map(cut => (
                      <tr key={cut.key} className="hover:bg-[#FAF8F5]/60 transition">
                        <td className="py-3 font-serif font-bold text-stone-800 pr-4">
                          {cut.key === 'Unassigned' ? 'Not Scheduled / Unknown' : cut.key}
                        </td>
                        <td className="py-3 text-center font-bold text-stone-700">{cut.total}</td>
                        <td className="py-3 text-center text-emerald-700 font-semibold">{cut.retained}</td>
                        <td className="py-3 text-center text-amber-700 font-semibold">{cut.extraReq}</td>
                        <td className="py-3 text-center text-rose-800 font-semibold">{cut.notRetained}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <span className="font-mono text-[10px] font-bold text-stone-600">{cut.retentionRate}%</span>
                            <div className="w-20 bg-stone-200 h-1.5 rounded-full overflow-hidden border border-stone-300">
                              <div 
                                className="bg-[#5A7060] h-full rounded-full transition-all duration-300"
                                style={{ width: `${cut.retentionRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {getCutsForField('ptmStatus').length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-stone-400 font-medium italic">No PTM status cuts available for these filter selections</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Full-Window Detailed Student Dialog Panel */}
      <AnimatePresence>
        {selectedStudentId && activeStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 lg:p-8 overflow-hidden">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-stone-900/50 backdrop-blur-sm"
              onClick={() => setSelectedStudentId(null)}
            />

            {/* Centered Modal Window */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="w-full max-w-7xl bg-white shadow-2xl relative flex flex-col h-full max-h-[98vh] lg:max-h-[94vh] rounded-2xl border border-[#E3DEC3] overflow-hidden z-10"
            >
                {/* Header */}
                <div className="px-5 py-4 bg-[#FAF8F5] border-b border-[#E3DEC3] flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#ECEFEA] flex items-center justify-center text-[#425246] font-bold uppercase border border-[#D1D9CD]">
                      {activeStudent.studentName ? activeStudent.studentName[0] : 'S'}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-stone-900 truncate max-w-[240px]">
                        {activeStudent.studentName}
                      </h3>
                      <p className="text-[10px] font-mono text-stone-500">Reg No: {activeStudent.regNo}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedStudentId(null)}
                    className="text-stone-400 hover:text-stone-600 bg-white p-1 rounded-md border border-[#E3DEC3] hover:shadow-xs transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Form fields body */}
                <div className="flex-1 overflow-y-auto p-4 lg:p-6 bg-[#FCFBF9]/40">
                  <div className="max-w-3xl mx-auto space-y-5">
                    
                    {/* Category 1: Academy Demographic Details - Locked Profile */}
                    <div className="bg-white border border-[#E3DEC3]/40 rounded-xl p-3.5 shadow-xs space-y-3">
                      <div className="flex justify-between items-center pb-0.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[#A25A38] tracking-wider uppercase bg-[#FAF0E4] px-2.5 py-0.5 rounded border border-[#F5DDD0]">
                          1. Academic & Center Profile
                        </span>
                        <span className="text-[9px] font-extrabold text-stone-400 uppercase tracking-wider flex items-center gap-0.5 bg-stone-100 px-1.5 py-0.25 rounded border border-stone-200">
                          <Lock className="w-2.5 h-2.5" /> Locked Profile
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Region</label>
                          <div className="mt-0.5 bg-[#FAF9F6] border border-stone-200/60 rounded-xl p-2 text-xs font-semibold text-stone-600 select-all">
                            <span className="truncate">{activeStudent.region || '-'}</span>
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Class Grade</label>
                          <div className="mt-0.5 bg-[#FAF9F6] border border-stone-200/60 rounded-xl p-2 text-xs font-semibold text-stone-600 select-all">
                            <span>{activeStudent.class || '-'}</span>
                          </div>
                        </div>

                        <div className="col-span-2">
                          <label className="block text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Center Location</label>
                          <div className="mt-0.5 bg-[#FAF9F6] border border-stone-200/80 rounded-xl p-2 text-xs font-semibold text-stone-600 select-all truncate">
                            <span className="truncate">{activeStudent.center || '-'}</span>
                          </div>
                        </div>

                        <div className="col-span-2">
                          <label className="block text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Building Structure</label>
                          <div className="mt-0.5 bg-[#FAF9F6] border border-stone-200/80 rounded-xl p-2 text-xs font-semibold text-stone-600 select-all truncate">
                            <span className="truncate">{activeStudent.building || '-'}</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Batch ID</label>
                          <div className="mt-0.5 bg-[#FAF9F6] border border-stone-200/80 rounded-xl p-2 text-xs font-mono font-bold text-stone-600 select-all">
                            <span>{activeStudent.batchName || 'No Batch'}</span>
                          </div>
                        </div>

                        {/* Scholarship Category */}
                        <div>
                          <label className="block text-[10px] font-extrabold text-[#8C764D] uppercase tracking-wider flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Scholarship
                          </label>
                          <div className="mt-0.5 flex items-center justify-between bg-[#FFFDF0] border border-[#EBE3C5] rounded-xl p-2 text-xs font-bold text-[#7A6435] select-all shadow-2xs">
                            <span className="truncate">{activeStudent.scholarship || '0%'}</span>
                            <span className="text-[9px] font-extrabold text-[#8C764D] bg-[#FCF8E3] border border-[#E3DEC3] px-1.5 py-0.25 rounded-md uppercase tracking-wider">Base</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Category 2: Mentor & Communication */}
                    <div className="bg-white border border-[#E3DEC3]/40 rounded-xl p-3.5 shadow-xs space-y-3">
                      <div className="pb-0.5 border-b border-stone-100 flex justify-between items-center">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-[#A25A38] tracking-wider uppercase bg-[#FAF0E4] px-2.5 py-1 rounded-md border border-[#F5DDD0]">
                          2. Mentor & Parent Coordination
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-stone-500 uppercase">Mentor Name</label>
                          <input 
                            type="text" 
                            disabled={!canEditField('ptmStatus', activeStudent)}
                            value={activeStudent.mentor || ''}
                            onChange={(e) => handleCellChange(activeStudent.id, 'mentor', e.target.value)}
                            className="mt-0.5 w-full text-[11px] font-semibold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-[#5A7060] outline-hidden disabled:bg-stone-50"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-stone-500 uppercase">Mentor PW ID</label>
                          <input 
                            type="text" 
                            disabled={!canEditField('ptmStatus', activeStudent)}
                            value={activeStudent.pwid || ''}
                            onChange={(e) => handleCellChange(activeStudent.id, 'pwid', e.target.value)}
                            className="mt-0.5 w-full text-[11px] font-semibold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white font-mono focus:ring-1 focus:ring-[#5A7060] outline-hidden disabled:bg-stone-50"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-stone-500 uppercase">Mentor Email Address</label>
                          <input 
                            type="email" 
                            disabled={!canEditField('ptmStatus', activeStudent)}
                            value={activeStudent.mentorMailid || ''}
                            onChange={(e) => handleCellChange(activeStudent.id, 'mentorMailid', e.target.value)}
                            className="mt-0.5 w-full text-[11px] font-semibold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white font-mono focus:ring-1 focus:ring-[#5A7060] outline-hidden disabled:bg-stone-50"
                          />
                        </div>

                        {/* WhatsApp Intimation Toggle */}
                        <div className="col-span-2 bg-[#F6F9F5] p-2.5 border border-[#D5E3CE] rounded-xl flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-[#3E5C38] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#52A33A]"></span> Parent Intimation (WhatsApp)
                            </span>
                            <span className="text-[9.5px] text-stone-550 leading-normal">
                              WhatsApp details sent to parents.
                            </span>
                          </div>
                          <input 
                            type="checkbox"
                            checked={activeStudent.whatsappIntimation}
                            onChange={(e) => handleCellChange(activeStudent.id, 'whatsappIntimation', e.target.checked)}
                            className="w-4.5 h-4.5 rounded text-[#5A7060] focus:ring-[#5A7060] cursor-pointer"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-stone-500 uppercase">PTM Status</label>
                          <select
                            value={activeStudent.ptmStatus || ''}
                            onChange={(e) => handleCellChange(activeStudent.id, 'ptmStatus', e.target.value)}
                            className="mt-0.5 w-full text-[11px] font-bold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-[#5A7060] outline-hidden cursor-pointer text-stone-800"
                          >
                            <option value="">Choose PTM Status</option>
                            <option value="Done - Online">Done - Online</option>
                            <option value="Done - Offline">Done - Offline</option>
                            <option value="Completed PTM">Completed PTM</option>
                            <option value="Pending PTM">Pending PTM</option>
                            <option value="DNP 1">DNP 1</option>
                            <option value="DNP 2">DNP 2</option>
                            <option value="DNP 3">DNP 3</option>
                            <option value="Pending">Pending</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-stone-500 uppercase">Probability of Retention</label>
                          <select
                            value={activeStudent.retentionProbability || ''}
                            onChange={(e) => handleCellChange(activeStudent.id, 'retentionProbability', e.target.value as any)}
                            className="mt-0.5 w-full text-[11px] font-bold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-[#5A7060] outline-hidden cursor-pointer text-stone-800"
                          >
                            <option value="">Unrated</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                          </select>
                        </div>

                        <div className="col-span-2 space-y-1.5">
                          <label className="block text-[10px] font-bold text-stone-500 uppercase">Parent Remarks (By Mentor)</label>
                          <select
                            disabled={!canEditField('ptmStatus', activeStudent)}
                            value={isStandardRemark(activeStudent.parentRemarks) ? (activeStudent.parentRemarks || '') : 'Other'}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'Other') {
                                handleCellChange(activeStudent.id, 'parentRemarks', 'Custom Remark');
                              } else {
                                handleCellChange(activeStudent.id, 'parentRemarks', val);
                              }
                            }}
                            className="w-full text-[11px] font-bold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-[#5A7060] outline-hidden cursor-pointer disabled:bg-stone-50 disabled:text-stone-400 text-stone-800"
                          >
                            <option value="">Select Remarks</option>
                            <option value="Will pay">Will pay</option>
                            <option value="Will Decide">Will Decide</option>
                            <option value="Will wait for other scholarships">Will wait for other scholarships</option>
                            <option value="Will not continue with PW">Will not continue with PW</option>
                            <option value="Other">Other (Write...)</option>
                          </select>
                          {!isStandardRemark(activeStudent.parentRemarks) && (
                            <input 
                              type="text"
                              disabled={!canEditField('ptmStatus', activeStudent)}
                              value={activeStudent.parentRemarks === 'Custom Remark' ? '' : activeStudent.parentRemarks}
                              onChange={(e) => handleCellChange(activeStudent.id, 'parentRemarks', e.target.value)}
                              placeholder="Write other remark..."
                              className="w-full text-[11px] font-semibold bg-white border border-[#E3DEC3] rounded-lg p-2 focus:ring-1 focus:ring-[#5A7060] outline-hidden text-stone-800"
                            />
                          )}
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-stone-500 uppercase">Followup Date / Propose re-enrolled date</label>
                          <input 
                            type="date" 
                            value={activeStudent.paymentDate || ''}
                            onChange={(e) => handleCellChange(activeStudent.id, 'paymentDate', e.target.value)}
                            className="mt-0.5 w-full text-[11px] font-semibold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white outline-hidden text-stone-800"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-stone-500 uppercase">Reason if Dropout</label>
                          {(() => {
                            const isDropoutEnabled = isDropoutReasonEnabled(activeStudent.parentRemarks);
                            return (
                              <div className="space-y-1">
                                <select
                                  disabled={!isDropoutEnabled}
                                  value={isStandardDiscontinueReason(activeStudent.discontinueReason) ? (activeStudent.discontinueReason || '') : 'other'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'other') {
                                      handleCellChange(activeStudent.id, 'discontinueReason', 'Custom Reason');
                                    } else {
                                      handleCellChange(activeStudent.id, 'discontinueReason', val);
                                    }
                                  }}
                                  className="mt-0.5 w-full text-[11px] font-bold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-[#5A7060] outline-hidden cursor-pointer text-stone-800 disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed"
                                >
                                  <option value="">Select Reason</option>
                                  <option value="academic concern">academic concern</option>
                                  <option value="father transfer">father transfer</option>
                                  <option value="health issue">health issue</option>
                                  <option value="non acad issue">non acad issue</option>
                                  <option value="School Timing Issue">School Timing Issue</option>
                                  <option value="Transportation Issue">Transportation Issue</option>
                                  <option value="Relocation Issue">Relocation Issue</option>
                                  <option value="Financial Issue">Financial Issue</option>
                                  <option value="other">other (Write...)</option>
                                </select>
                                {!isStandardDiscontinueReason(activeStudent.discontinueReason) && (
                                  <input 
                                    disabled={!isDropoutEnabled}
                                    type="text" 
                                    value={activeStudent.discontinueReason === 'Custom Reason' ? '' : activeStudent.discontinueReason}
                                    onChange={(e) => handleCellChange(activeStudent.id, 'discontinueReason', e.target.value)}
                                    placeholder="Write custom reason..."
                                    className="w-full text-[11px] font-semibold bg-white border border-[#E3DEC3] rounded-lg p-2 focus:ring-1 focus:ring-[#5A7060] outline-hidden text-stone-800 disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed"
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Final Status - Dropdown */}
                        <div className="col-span-2 pt-0.5">
                          <label className="block text-[10px] font-extrabold text-[#A25A38] uppercase tracking-wider flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#A25A38]"></span> Final Status (By Mentor)
                          </label>
                          <select 
                            disabled={!canEditField('finalRetentionStatus', activeStudent)}
                            value={activeStudent.finalRetentionStatus || ''}
                            onChange={(e) => handleCellChange(activeStudent.id, 'finalRetentionStatus', e.target.value)}
                            className="mt-0.5 w-full text-[11px] font-bold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-[#5A7060] outline-hidden cursor-pointer disabled:bg-stone-50 disabled:text-stone-400 text-stone-800"
                          >
                            <option value="">Select Status</option>
                            <option value="Ready to get retained">Ready to get retained</option>
                            <option value="Not Retained">Not Retained</option>
                            <option value="Extra Scholarship Required">Extra Scholarship Required</option>
                          </select>

                          {/* Reactive Dynamic Notice Cards */}
                          {(activeStudent.finalRetentionStatus === 'Ready to get retained' || activeStudent.finalRetentionStatus === 'Retained') && (
                            <div className="mt-2 bg-[#F0F5F1] border border-[#CDE3D2] rounded-lg p-2 text-[10px] text-[#2A4D32] flex items-start gap-1.5 shadow-2xs animate-fade-in">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#448C51] shrink-0 mt-0.5" />
                              <div>
                                <p className="font-extrabold uppercase tracking-wide text-[9px] text-[#345F3D]">Retention Confirmed</p>
                                <p className="font-semibold leading-normal mt-0.5">
                                  Discussed with student to move to counselor for next class admission.
                                </p>
                              </div>
                            </div>
                          )}

                          {activeStudent.finalRetentionStatus === 'Extra Scholarship Required' && (
                            <div className="mt-2 bg-[#FFF9F2] border border-[#FADCC7] rounded-lg p-2 text-[10px] text-[#7F4E24] flex items-start gap-1.5 shadow-2xs animate-fade-in">
                              <AlertTriangle className="w-3.5 h-3.5 text-[#D97D38] shrink-0 mt-0.5" />
                              <div>
                                <p className="font-extrabold uppercase tracking-wide text-[9px] text-[#8F5222]">Action Required</p>
                                <p className="font-semibold leading-normal mt-0.5 text-[#8F5222]">
                                  Connect with CH regarding extra scholarship.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Category 3: Extra Scholarship Requirement - Increment calculations & Combined label */}
                    <div className="bg-white border border-[#E3DEC3]/40 rounded-xl p-3.5 shadow-xs space-y-3">
                      <div className="pb-0.5 border-b border-stone-100 flex justify-between items-center">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-[#A25A38] tracking-wider uppercase bg-[#FAF0E4] px-2.5 py-1 rounded-md border border-[#F5DDD0]">
                          3. Extra Scholarship Requirement
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-stone-500 uppercase">Base Scholarship</label>
                          <div className="mt-0.5 bg-stone-50 border border-stone-200 rounded-lg p-2 text-[11px] font-semibold text-stone-500">
                            {activeStudent.scholarship || 'None'}
                          </div>
                        </div>

                        {/* Extra Required how much - preset options or typing select-combo */}
                        <div className="col-span-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-bold text-stone-500 uppercase">Extra Required</label>
                          </div>
                          {(() => {
                            const currentProposed = activeStudent.proposedScholarship || '';
                            const currentIsFlat = isFlatScholarship(activeStudent.scholarship) || isFlatScholarship(currentProposed);
                            const currentType = currentIsFlat ? 'flat' : 'pct';
                            
                            // Extract numeric value from currentProposed
                            let currentNumber = '';
                            if (currentIsFlat) {
                              currentNumber = currentProposed.replace(/flat/gi, '').trim();
                            } else {
                              // extract just the percentage number if possible
                              const pctMatch = currentProposed.match(/^(\d+)/);
                              if (pctMatch) {
                                currentNumber = pctMatch[1];
                              } else {
                                currentNumber = currentProposed.replace(/%|on|tuition|fees/gi, '').trim();
                              }
                            }

                            return (
                              <div className="flex gap-1.5 mt-0.5">
                                <select
                                  disabled={!canEditField('proposedScholarship', activeStudent)}
                                  value={currentType}
                                  onChange={(e) => {
                                    const newType = e.target.value;
                                    if (newType === 'pct') {
                                      handleCellChange(activeStudent.id, 'proposedScholarship', `${currentNumber || '0'}% on Tuition Fees`);
                                    } else {
                                      handleCellChange(activeStudent.id, 'proposedScholarship', `Flat ${currentNumber || '0'}`);
                                    }
                                  }}
                                  className="w-[150px] text-[11px] font-bold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-[#5A7060] outline-hidden cursor-pointer disabled:bg-stone-50 disabled:text-stone-400 text-stone-800 shrink-0"
                                >
                                  <option value="pct">On Tuition Fee</option>
                                  <option value="flat">Flat Fee</option>
                                </select>

                                {currentType === 'pct' ? (
                                  <div className="flex-1 flex items-center bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#5A7060]">
                                    <input
                                      type="text"
                                      disabled={!canEditField('proposedScholarship', activeStudent)}
                                      value={currentNumber}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        handleCellChange(activeStudent.id, 'proposedScholarship', `${val}% on Tuition Fees`);
                                      }}
                                      placeholder="e.g. 15"
                                      className="w-full bg-transparent text-[11px] font-semibold text-stone-800 outline-none border-none p-0 focus:ring-0 text-right pr-1"
                                    />
                                    <span className="text-[11px] text-stone-500 font-bold select-none shrink-0">% on Tuition Fees</span>
                                  </div>
                                ) : (
                                  <div className="flex-1 flex items-center bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#5A7060]">
                                    <span className="text-[11px] text-stone-500 font-bold select-none shrink-0 pr-1">Flat </span>
                                    <input
                                      type="text"
                                      disabled={!canEditField('proposedScholarship', activeStudent)}
                                      value={currentNumber}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        handleCellChange(activeStudent.id, 'proposedScholarship', `Flat ${val}`);
                                      }}
                                      onBlur={(e) => {
                                        const val = e.target.value.trim();
                                        if (val) {
                                          handleCellChange(activeStudent.id, 'proposedScholarship', formatFlatScholarship(`Flat ${val}`));
                                        }
                                      }}
                                      placeholder="e.g. 15000 or 15k"
                                      className="w-full bg-transparent text-[11px] font-semibold text-stone-800 outline-none border-none p-0 focus:ring-0"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Highlighted Combined Label Notice Area */}
                        {activeStudent.proposedScholarship && (
                          <div className="col-span-2 bg-[#FFFDF5] border border-[#ECE0CE] rounded-lg p-2 text-[10px] text-stone-700 flex flex-col gap-0.5 shadow-2xs">
                            <span className="text-[9px] font-extrabold text-[#8C764D] uppercase tracking-wider">Combined Scholarship View</span>
                            <p className="font-bold text-stone-800 text-[11px] mt-0.5 leading-none">
                              <span className="text-[#A25A38] bg-[#FAF0E4] px-1 py-0.5 rounded-md">{activeStudent.scholarship || "0%"}</span>
                              <span className="text-stone-400 font-medium px-1">plus</span>
                              <span className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded-md">{activeStudent.proposedScholarship}</span>
                            </p>
                          </div>
                        )}

                        {/* Extra Scholarship Status Dropdown */}
                        <div className="col-span-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-bold text-stone-500 uppercase">Extra Scholarship Status</label>
                          </div>
                          <select
                            disabled={!canEditField('extraScholarshipStatus', activeStudent)}
                            value={activeStudent.extraScholarshipStatus || ''}
                            onChange={(e) => handleCellChange(activeStudent.id, 'extraScholarshipStatus', e.target.value as any)}
                            className="mt-0.5 w-full text-[11px] font-bold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white text-stone-700 outline-hidden focus:border-[#5A7060] disabled:bg-[#FAF8F5] disabled:text-stone-400 cursor-pointer"
                          >
                            <option value="">Decide Status</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                            <option value="InProgress">InProgress</option>
                            <option value="Pending">Pending Review</option>
                          </select>

                          {/* Status Approved - Move to RAH warning/banner */}
                          {activeStudent.extraScholarshipStatus === 'Approved' && (
                            <div className="mt-2 bg-[#EBF5EE] border border-[#CDE3D2] rounded-lg p-2 text-[10px] text-[#2A4D32] flex items-center gap-1.5 shadow-2xs animate-fade-in">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#3C8A4E] shrink-0" />
                              <div className="font-semibold">
                                {(() => {
                                  const isRAH = isMoveToRAH(activeStudent.scholarship || '', activeStudent.proposedScholarship || '');
                                  return (
                                    <span>
                                      Status approved: <span className="font-extrabold uppercase tracking-wide text-[9px] text-[#A25A38]">{isRAH ? 'MOVE TO RAH' : 'DIRECT RETAINED / APPROVED'}</span>.
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Final Approval (RAH) Status Dropdown */}
                        {(() => {
                          const isRAH = isMoveToRAH(activeStudent.scholarship || '', activeStudent.proposedScholarship || '');
                          if (!isRAH) return null;
                          return (
                            <div className="col-span-2 mt-2 bg-[#FFFDF5] border border-[#ECE0CE] rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="block text-[10px] font-bold text-[#A25A38] uppercase">Final Approval (RAH Status)</label>
                                <span className="text-[9px] font-extrabold text-[#A25A38] bg-[#FAF0E4] px-1.5 py-0.25 rounded border border-[#F5DDD0] uppercase tracking-wide">
                                  RAH FIELD
                                </span>
                              </div>
                              <select
                                disabled={!canEditField('rahStatus', activeStudent)}
                                value={activeStudent.rahStatus || ''}
                                onChange={(e) => handleCellChange(activeStudent.id, 'rahStatus', e.target.value as any)}
                                className="w-full text-[11px] font-bold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white text-[#A25A38] outline-hidden focus:border-[#A25A38] disabled:bg-[#FAF8F5] disabled:text-stone-400 cursor-pointer"
                              >
                                <option value="">Decide RAH Status</option>
                                <option value="Approved">Approved</option>
                                <option value="Rejected">Rejected</option>
                                <option value="InProgress">InProgress</option>
                                <option value="Pending">Pending RAH Review</option>
                              </select>
                              <p className="text-[9.5px] text-stone-550 italic leading-snug">
                                This scholarship proposal exceeds 10% and is routed to the Regional Academic Head (RAH) for final approval.
                              </p>
                            </div>
                          );
                        })()}


                      </div>
                    </div>

                    {/* Category 4: Counselor Details - Counselor Mapping */}
                    <div className="bg-white border border-[#E3DEC3]/40 rounded-xl p-3.5 shadow-xs space-y-3">
                      <div className="pb-0.5 border-b border-stone-100 flex justify-between items-center">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-[#A25A38] tracking-wider uppercase bg-[#FAF0E4] px-2.5 py-1 rounded-md border border-[#F5DDD0]">
                          4. Counselor Details
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-bold text-stone-500 uppercase">Counselor Name</label>
                          </div>
                          <input 
                            type="text" 
                            disabled={!canEditField('counselorName', activeStudent)}
                            value={activeStudent.counselorName || ''}
                            onChange={(e) => handleCellChange(activeStudent.id, 'counselorName', e.target.value)}
                            placeholder="Counselor Name"
                            className="mt-0.5 w-full text-[11px] font-semibold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-[#5A7060] outline-hidden disabled:bg-stone-50 disabled:text-stone-400"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-bold text-stone-500 uppercase">Counselor PW ID</label>
                          </div>
                          <input 
                            type="text" 
                            disabled={!canEditField('counselorPwid', activeStudent)}
                            value={activeStudent.counselorPwid || ''}
                            onChange={(e) => handleCellChange(activeStudent.id, 'counselorPwid', e.target.value)}
                            placeholder="Counselor PWID"
                            className="mt-0.5 w-full text-[11px] font-semibold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white font-mono focus:ring-1 focus:ring-[#5A7060] outline-hidden disabled:bg-stone-50 disabled:text-stone-400"
                          />
                        </div>

                        <div className="col-span-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-bold text-stone-500 uppercase">New Registration ID (New Regno)</label>
                          </div>
                          <input 
                            type="text" 
                            disabled={!canEditField('newRegno', activeStudent)}
                            value={activeStudent.newRegno || ''}
                            onChange={(e) => handleCellChange(activeStudent.id, 'newRegno', e.target.value)}
                            placeholder="e.g. 23211166"
                            className="mt-0.5 w-full text-[11px] font-semibold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white font-mono focus:ring-1 focus:ring-[#5A7060] outline-hidden disabled:bg-stone-50 disabled:text-stone-400"
                          />
                        </div>

                        <div className="col-span-2 space-y-1.5">
                          <label className="block text-[10px] font-bold text-stone-500 uppercase">Counselor Status</label>
                          <select
                            disabled={!canEditField('counselorStatus', activeStudent)}
                            value={isStandardCounselorStatus(activeStudent.counselorStatus) ? (activeStudent.counselorStatus || '') : 'Other'}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'Other') {
                                handleCellChange(activeStudent.id, 'counselorStatus', 'Custom Status');
                              } else {
                                handleCellChange(activeStudent.id, 'counselorStatus', val);
                              }
                            }}
                            className="w-full text-[11px] font-bold bg-[#FAF8F5] border border-[#E3DEC3] rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-[#5A7060] outline-hidden cursor-pointer disabled:bg-stone-50 disabled:text-stone-400 text-stone-800"
                          >
                            <option value="">Select Status</option>
                            <option value="Re-enrolled">Re-enrolled</option>
                            <option value="Not Retained - Directly connect once again with Mentor">Not Retained - Directly connect once again with Mentor</option>
                            <option value="Other">Other (Add Remarks)</option>
                          </select>
                          {!isStandardCounselorStatus(activeStudent.counselorStatus) && (
                            <input 
                              type="text"
                              disabled={!canEditField('counselorStatus', activeStudent)}
                              value={activeStudent.counselorStatus === 'Custom Status' ? '' : activeStudent.counselorStatus}
                              onChange={(e) => handleCellChange(activeStudent.id, 'counselorStatus', e.target.value)}
                              placeholder="Write custom status/remarks..."
                              className="w-full text-[11px] font-semibold bg-white border border-[#E3DEC3] rounded-lg p-2 focus:ring-1 focus:ring-[#5A7060] outline-hidden text-stone-800"
                            />
                          )}
                        </div>

                        {/* Final Approved Scholarship shown in Counselor portion */}
                        <div className="col-span-2 mt-3 pt-3 border-t border-dashed border-stone-200">
                          <div className="bg-[#EBF5EE] border border-[#CDE3D2] rounded-xl p-3 shadow-2xs space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="inline-flex items-center gap-1.5 text-[9.5px] font-extrabold text-[#2A4D32] tracking-wider uppercase bg-[#DDF1E2] px-2 py-0.5 rounded border border-[#BFDDC5]">
                                ★ FINAL SCHOLARSHIP
                              </span>
                              <span className="text-[9px] font-extrabold text-[#2A4D32] bg-[#EBF5EE] px-1.5 py-0.25 rounded border border-[#CDE3D2] uppercase tracking-wide">
                                COUNSELOR VIEW
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-[10px] text-[#4A6B50] font-semibold">Approved Benefit for Counselor Admission:</p>
                                <p className="text-lg font-black text-[#1C3622] leading-tight mt-0.5">
                                  {activeStudent.finalScholarship || activeStudent.scholarship || '0%'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] font-bold text-stone-400 uppercase">Base Scholarship</p>
                                <p className="text-[11px] font-extrabold text-stone-600">{activeStudent.scholarship || '0%'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Footer sticky */}
                <div className="p-4 bg-[#FAF8F5] border-t border-[#E3DEC3] flex justify-end gap-2 shrink-0">
                  <button 
                    onClick={() => setSelectedStudentId(null)}
                    className="bg-[#5A7060] font-serif font-extrabold hover:bg-[#4E6052] text-white text-xs px-5 py-2.5 rounded-lg shadow-xs w-full block transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> Save & Close Profile
                  </button>
                </div>
              </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add New Student Dialog Form */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs" 
              onClick={() => setIsAddOpen(false)}
            />
            
            {/* Dialog Container */}
            <motion.div 
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="bg-white rounded-3xl border border-[#E3DEC3] shadow-2xl relative z-10 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 bg-[#FAF8F5] border-b border-[#E3DEC3] flex justify-between items-center shrink-0">
                <h3 className="text-base font-serif font-bold text-stone-905 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-[#5A7060]" />
                  Add New Scholarship Profile
                </h3>
                <button onClick={() => setIsAddOpen(false)} className="text-stone-400 hover:text-[#A25A38] transition cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Form Body */}
              <form onSubmit={handleAddStudentSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
                <p className="text-xs text-stone-500 font-medium">
                  Enroll a new scholarship student in the tracker registry. The ID is programmatically allocated.
                </p>

                {/* Section header 1 */}
                <div>
                  <h4 className="text-xs font-bold text-[#8C764D] uppercase tracking-wider mb-2.5 pb-1 border-b border-[#E3DEC3]">Key Demographics</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-550 mb-1">Student Name *</label>
                      <input 
                        type="text"
                        required
                        value={newStudent.studentName}
                        onChange={(e) => setNewStudent(prev => ({ ...prev, studentName: e.target.value }))}
                        placeholder="e.g. Midhat Altaf"
                        className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-hidden focus:border-[#5A7060]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-550 mb-1">Registration No *</label>
                      <input 
                        type="text"
                        required
                        value={newStudent.regNo}
                        onChange={(e) => setNewStudent(prev => ({ ...prev, regNo: e.target.value }))}
                        placeholder="e.g. 23156886"
                        className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold font-mono focus:bg-white outline-hidden focus:border-[#5A7060]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-550 mb-1">Center</label>
                      <input 
                        type="text"
                        value={newStudent.center}
                        onChange={(e) => setNewStudent(prev => ({ ...prev, center: e.target.value }))}
                        placeholder="e.g. Anantnag Vidyapeeth"
                        className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-hidden focus:border-[#5A7060]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-550 mb-1">Building</label>
                      <input 
                        type="text"
                        value={newStudent.building}
                        onChange={(e) => setNewStudent(prev => ({ ...prev, building: e.target.value }))}
                        placeholder="e.g. Anantnag Vidyapeeth"
                        className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-hidden focus:border-[#5A7060]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-550 mb-1">Batch Name</label>
                      <input 
                        type="text"
                        value={newStudent.batchName}
                        onChange={(prev) => setNewStudent(p => ({ ...p, batchName: prev.target.value }))}
                        placeholder="e.g. 90-UF101ES"
                        className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold font-mono focus:bg-white outline-hidden focus:border-[#5A7060]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-550 mb-1">Class</label>
                      <input 
                        type="text"
                        value={newStudent.class}
                        onChange={(e) => setNewStudent(prev => ({ ...prev, class: e.target.value }))}
                        placeholder="e.g. 10th"
                        className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-hidden focus:border-[#5A7060]"
                      />
                    </div>
                  </div>
                </div>

                {/* Section header 2 */}
                <div>
                  <h4 className="text-xs font-bold text-[#8C764D] uppercase tracking-wider mb-2.5 pb-1 border-b border-[#E3DEC3]">Scholarship and Mentor Assignment</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-550 mb-1">Initial Scholarship Tier</label>
                      <select
                        value={newStudent.scholarship}
                        onChange={(e) => setNewStudent(prev => ({ ...prev, scholarship: e.target.value }))}
                        className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 cursor-pointer outline-hidden focus:border-[#5A7060]"
                      >
                        {SCHOLARSHIPS_LIST.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-550 mb-1">Mentor Name</label>
                      <input 
                        type="text"
                        value={newStudent.mentor}
                        onChange={(e) => setNewStudent(prev => ({ ...prev, mentor: e.target.value }))}
                        placeholder="e.g. Umar Sir"
                        className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-hidden focus:border-[#5A7060]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-550 mb-1">PWID Code</label>
                      <input 
                        type="text"
                        value={newStudent.pwid}
                        onChange={(e) => setNewStudent(prev => ({ ...prev, pwid: e.target.value }))}
                        placeholder="e.g. pw30917"
                        className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-hidden focus:border-[#5A7060]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-550 mb-1">Mentor Mailid</label>
                      <input 
                        type="email"
                        value={newStudent.mentorMailid}
                        onChange={(e) => setNewStudent(prev => ({ ...prev, mentorMailid: e.target.value }))}
                        placeholder="e.g. umar.lone@pw.live"
                        className="w-full bg-[#FAF8F5] border border-[#E3DEC3] rounded-xl px-3 py-2 text-xs font-semibold focus:bg-white outline-hidden focus:border-[#5A7060]"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit row button */}
                <div className="flex gap-3 pt-4 border-t border-[#E3DEC3] flex-row">
                  <button 
                    type="button" 
                    onClick={() => setIsAddOpen(false)}
                    className="flex-1 bg-[#FAF8F5] border border-[#E3DEC3] hover:bg-[#F2EDDF] text-stone-750 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Discard Draft
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 bg-[#5A7060] hover:bg-[#4E6052] text-white py-2.5 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    Register Student Profile
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Clean Confirmation Overlay Modal */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs select-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-2 border-[#E3DEC3] rounded-2xl shadow-xl max-w-sm w-full p-5 text-stone-800"
            >
              <div className="flex items-center gap-3 text-[#A25A38] mb-3">
                <AlertTriangle className="size-5 shrink-0" />
                <h3 className="font-sans font-bold text-sm tracking-tight text-[#425246]">{confirmModal.title}</h3>
              </div>
              <p className="text-xs text-stone-650 leading-relaxed font-semibold mb-5 bg-[#FAF8F5] border border-[#E3DEC3] p-3 rounded-xl">
                {confirmModal.message}
              </p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 bg-stone-100 hover:bg-[#F2EDDF] border border-stone-200 text-stone-700 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmModal.onConfirm}
                  className="flex-1 bg-[#A25A38] hover:bg-[#8F4E30] text-white py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                >
                  Confirm Action
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dynamic Data Import Modal */}
      <AnimatePresence>
        {isImportOpen && (
          <ImportModal
            isOpen={isImportOpen}
            onClose={() => setIsImportOpen(false)}
            onImport={handleImportData}
            userRole={userRole}
          />
        )}
      </AnimatePresence>

      {/* Audit & Activity Logs Modal */}
      <AnimatePresence>
        {isLogsOpen && (
          <AuditLogsModal
            isOpen={isLogsOpen}
            onClose={() => setIsLogsOpen(false)}
            logs={logs}
            onClearLogs={() => {
              setLogs([]);
              clearLogsInFirestore().catch(err => console.error("Wiping cloud logs failed:", err));
            }}
          />
        )}
      </AnimatePresence>

      {/* Role & Permissions Configuration Modal */}
      <AnimatePresence>
        {isRoleModalOpen && (
          <RolePermissionModal
            isOpen={isRoleModalOpen}
            onClose={() => setIsRoleModalOpen(false)}
            activeEmail={activeEmail}
            setActiveEmail={setActiveEmail}
            availableRegions={availableRegions}
            availableCenters={availableCenters}
            availableMentors={availableMentors}
            triggerBanner={triggerBanner}
            onRolesUpdated={loadUserRoles}
          />
        )}
      </AnimatePresence>

      {/* Exclusive Admin Sandbox & Simulation Panel */}
      {(activeEmail.toLowerCase().trim() === 'devansh.sharma@pw.live' || activeEmail.toLowerCase().trim() === 'bipin.yadav@pw.live') && (
        <div className="mx-6 mb-6">
          <div className="bg-[#FAF0E4] border-2 border-[#E3DEC3] rounded-3xl shadow-md overflow-hidden transition-all duration-300">
            {/* Panel Header */}
            <div className="flex justify-between items-center bg-[#F4EADA] px-5 py-3 border-b border-[#E3DEC3] select-none">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#A25A38]" />
                <h3 className="font-serif font-bold text-xs text-[#5C4D3C] tracking-tight">
                  Admin Sandbox & Simulation Control Console
                </h3>
                {isSandboxMode ? (
                  <span className="text-[9px] bg-amber-500 text-white font-extrabold px-2 py-0.5 rounded-full animate-pulse uppercase tracking-wider">
                    Simulation Active
                  </span>
                ) : (
                  <span className="text-[9px] bg-stone-200 text-stone-600 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Actual Admin view
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isSandboxMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsSandboxMode(false);
                      triggerBanner('Sandbox simulator disabled. Restored actual master credentials.', 'info');
                    }}
                    className="text-[10px] text-[#A25A38] hover:text-[#8F4E30] font-extrabold flex items-center gap-1 bg-[#FAF0E4] border border-[#E3DEC3] px-2.5 py-1 rounded-xl transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset View
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsSandboxExpanded(!isSandboxExpanded)}
                  className="text-stone-500 hover:text-stone-800 p-1 rounded-lg hover:bg-stone-200/50 transition cursor-pointer"
                >
                  {isSandboxExpanded ? (
                    <ChevronLeft className="w-4 h-4 rotate-90" />
                  ) : (
                    <ChevronLeft className="w-4 h-4 -rotate-90" />
                  )}
                </button>
              </div>
            </div>

            {/* Panel Body */}
            <AnimatePresence>
              {isSandboxExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="p-5 overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                    {/* Role Toggles */}
                    <div className="bg-white/70 border border-[#E3DEC3] rounded-2xl p-4 space-y-3">
                      <h4 className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider flex items-center gap-1">
                        <Fingerprint className="w-3.5 h-3.5 text-[#A25A38]" /> 1. Simulate Role
                      </h4>
                      <p className="text-[10px] text-stone-500 font-semibold leading-relaxed">
                        Instantly test quota rules, tab visibility, and editable fields from any role.
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(['Central', 'RAH', 'RFH', 'CH', 'FH', 'Mentor', 'Counselor'] as const).map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => {
                              setIsSandboxMode(true);
                              setUserRole(role);
                              triggerBanner(`Sandbox: Role updated to ${role}.`, 'info');
                            }}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-xl transition cursor-pointer ${
                              userRole === role && isSandboxMode
                                ? 'bg-[#A25A38] text-white shadow-xs'
                                : 'bg-[#FAF8F5] text-stone-600 hover:bg-[#F2EDDF] border border-stone-200'
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dimension Override Selectors */}
                    <div className="bg-white/70 border border-[#E3DEC3] rounded-2xl p-4 space-y-3 md:col-span-2">
                      <h4 className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-[#A25A38]" /> 2. Simulate Dimensions (Region / Center / Mentor)
                      </h4>
                      <p className="text-[10px] text-stone-500 font-semibold leading-relaxed">
                        Select custom region/center parameters to check row-level and quota filtering behaviors in real-time.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        {/* Region Selector */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-500 block uppercase">Region</label>
                          <select
                            value={simulatedRegion}
                            onChange={(e) => {
                              setIsSandboxMode(true);
                              setSimulatedRegion(e.target.value);
                              triggerBanner(`Sandbox: Simulated Region changed to ${e.target.value}`, 'info');
                            }}
                            className="w-full text-[10px] font-bold bg-[#FAF8F5] border border-stone-200 rounded-lg px-2 py-1.5 outline-hidden focus:ring-1 focus:ring-[#A25A38]/35"
                          >
                            {availableRegions.map(reg => (
                              <option key={reg} value={reg}>{reg}</option>
                            ))}
                          </select>
                        </div>

                        {/* Center Selector */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-500 block uppercase">Center</label>
                          <select
                            value={simulatedCenter}
                            onChange={(e) => {
                              setIsSandboxMode(true);
                              setSimulatedCenter(e.target.value);
                              triggerBanner(`Sandbox: Simulated Center changed to ${e.target.value}`, 'info');
                            }}
                            className="w-full text-[10px] font-bold bg-[#FAF8F5] border border-stone-200 rounded-lg px-2 py-1.5 outline-hidden focus:ring-1 focus:ring-[#A25A38]/35"
                          >
                            {availableCenters.map(cen => (
                              <option key={cen} value={cen}>{cen}</option>
                            ))}
                          </select>
                        </div>

                        {/* Mentor Selector */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-stone-500 block uppercase">Mentor</label>
                          <select
                            value={simulatedMentor}
                            onChange={(e) => {
                              setIsSandboxMode(true);
                              setSimulatedMentor(e.target.value);
                              triggerBanner(`Sandbox: Simulated Mentor changed to ${e.target.value}`, 'info');
                            }}
                            className="w-full text-[10px] font-bold bg-[#FAF8F5] border border-stone-200 rounded-lg px-2 py-1.5 outline-hidden focus:ring-1 focus:ring-[#A25A38]/35"
                          >
                            {availableMentors.map(men => (
                              <option key={men} value={men}>{men}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Pre-configured Mapped User Profiles list */}
                    <div className="bg-white/70 border border-[#E3DEC3] rounded-2xl p-4 space-y-3">
                      <h4 className="text-[10px] font-extrabold text-stone-500 uppercase tracking-wider flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-[#A25A38]" /> 3. Fast-Impersonate Registered User
                      </h4>
                      <p className="text-[10px] text-stone-500 font-semibold leading-relaxed">
                        Pick any registered user from your Firestore permissions schema to impersonate their complete identity.
                      </p>
                      <div className="pt-1">
                        <select
                          onChange={(e) => {
                            const emailSelected = e.target.value;
                            if (!emailSelected) return;

                            // Find mapping
                            const mapping = userRolesList.find(m => 
                              m.rahMailid?.toLowerCase() === emailSelected.toLowerCase() ||
                              m.rfhMailid?.toLowerCase() === emailSelected.toLowerCase() ||
                              m.chMailid?.toLowerCase() === emailSelected.toLowerCase() ||
                              m.fhMailid?.toLowerCase() === emailSelected.toLowerCase() ||
                              m.mentorId?.toLowerCase() === emailSelected.toLowerCase() ||
                              m.counselorId?.toLowerCase() === emailSelected.toLowerCase()
                            );

                            if (mapping) {
                              setIsSandboxMode(true);
                              let mappedRole: 'Central' | 'RAH' | 'RFH' | 'CH' | 'FH' | 'Mentor' | 'Counselor' = 'Central';
                              let r = mapping.region || 'PB + J&K';
                              let c = mapping.center || 'Anantnag Vidyapeeth';
                              let m = mapping.mentorId || 'Umar Sir';

                              if (mapping.rahMailid?.toLowerCase() === emailSelected.toLowerCase()) {
                                mappedRole = 'RAH';
                              } else if (mapping.rfhMailid?.toLowerCase() === emailSelected.toLowerCase()) {
                                mappedRole = 'RFH';
                              } else if (mapping.chMailid?.toLowerCase() === emailSelected.toLowerCase()) {
                                mappedRole = 'CH';
                              } else if (mapping.fhMailid?.toLowerCase() === emailSelected.toLowerCase()) {
                                mappedRole = 'FH';
                              } else if (mapping.mentorId?.toLowerCase() === emailSelected.toLowerCase()) {
                                mappedRole = 'Mentor';
                              } else if (mapping.counselorId?.toLowerCase() === emailSelected.toLowerCase()) {
                                mappedRole = 'Counselor';
                              }

                              setUserRole(mappedRole);
                              setSimulatedRegion(r);
                              setSimulatedCenter(c);
                              setSimulatedMentor(m);
                              triggerBanner(`Sandbox: Impersonating ${emailSelected} (${mappedRole})`, 'success');
                            }
                          }}
                          className="w-full text-[10px] font-bold bg-[#FAF8F5] border border-stone-200 rounded-lg px-2 py-1.5 outline-hidden focus:ring-1 focus:ring-[#A25A38]/35"
                          defaultValue=""
                        >
                          <option value="" disabled>-- Select Profile --</option>
                          {userRolesList.map((mapping, mIdx) => {
                            const items = [
                              { email: mapping.rahMailid, role: 'RAH' },
                              { email: mapping.rfhMailid, role: 'RFH' },
                              { email: mapping.chMailid, role: 'CH' },
                              { email: mapping.fhMailid, role: 'FH' },
                              { email: mapping.mentorId, role: 'Mentor' },
                              { email: mapping.counselorId, role: 'Counselor' },
                            ].filter(i => i.email && i.email.trim() !== '');

                            return items.map((item, iIdx) => (
                              <option key={`${mIdx}-${iIdx}`} value={item.email}>
                                {item.email} ({item.role})
                              </option>
                            ));
                          })}
                        </select>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Humble Footer */}
      <footer className="py-4 px-6 border-t border-[#E3DEC3] bg-[#FAF8F5] text-center text-[10px] text-stone-500 hover:text-stone-700 select-none transition mt-auto shrink-0 font-medium font-mono">
        PW Foundation Scholarship Retention System • Designed and crafted specifically for FY2026 Academic Planning • Clean client-side local cache storage.
      </footer>
    </div>
  );
}
