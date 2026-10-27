import React, { useState, useEffect, useRef } from 'react';
import {
  PhoneCall,
  Activity,
  FileText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
  User,
  Phone,
  Clock,
  Upload,
  Play,
  Pause,
  Square,
  FileSpreadsheet,
  Plus,
  Users,
  CheckCircle,
  HelpCircle,
  Download,
  Search,
  PieChart,
  Volume2,
  Filter,
  GraduationCap,
  BookOpen,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Save,
  PhoneForwarded,
  FileCheck,
  AlertTriangle,
  FolderOpen,
  Layers,
  ChevronDown,
  ChevronUp,
  Calendar,
  ArrowRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  CALL_OUTCOME_STATUS,
  STATUS_DISPLAY_CONFIG,
  resolveCallFinalStatus,
  getStatusDisplay,
  isCounselorFollowupRequired,
  getCallbackTime
} from './constants/callStatus';
import CallOutcomePieChart from './components/CallOutcomePieChart';

export const isUgCourse = (courseName) => {
  if (!courseName) return false;
  const c = String(courseName).toLowerCase().trim();
  if (c.includes('b.tech') || c.includes('btech') || c.includes('b.e') || c.includes('be ') || c.startsWith('be-') || c.includes('engineering')) return true;
  if (c.includes('bba') || c.includes('bca') || c.includes('b.sc') || c.includes('bsc')) return true;
  if (c.includes('b.com') || c.includes('bcom') || c.includes('b.a') || c.includes('ba ') || c.includes('b.pharm')) return true;
  if (c.includes('b.arch') || c.includes('b.des') || c.includes('bdes') || c.includes('undergraduate') || c.includes('ug') || c.includes('12th') || c.includes('inter')) return true;
  if (c.startsWith('b.') || c.startsWith('b ') || c.startsWith('bachelor')) return true;
  return false;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dispatch' | 'dashboard' | 'calls'
  const [wsConnected, setWsConnected] = useState(false);

  // Input Modes in Dispatch Console: 'manual' | 'bulk' | 'excel'
  const [inputMode, setInputMode] = useState('excel');

  // Form State for Manual Single Contact
  const [singlePhone, setSinglePhone] = useState('');
  const [singleName, setSingleName] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // Bulk Paste Input State
  const [bulkText, setBulkText] = useState('');

  // Delay settings (seconds)
  const [callDelay, setCallDelay] = useState('');

  // Staged Contacts List & Uploaded Excel File Info
  const [stagedContacts, setStagedContacts] = useState([]);
  const [uploadedFileInfo, setUploadedFileInfo] = useState(null);

  // Temporary contacts staged before university/delay selection
  const [tempContacts, setTempContacts] = useState([]);
  const [tempInputMode, setTempInputMode] = useState(''); // 'manual' | 'bulk' | 'excel' | 'recent'
  const [stageRangeStart, setStageRangeStart] = useState(1);
  const [stageRangeEnd, setStageRangeEnd] = useState('');

  // Dynamically calculate effective range of contacts to stage (1-based user indices)
  const getStageRangeData = () => {
    const total = tempContacts.length;
    if (total === 0) return { start: 1, end: 0, count: 0, list: [], startRow: 2, endRow: 2 };

    let s = parseInt(stageRangeStart, 10);
    if (isNaN(s) || s < 1) s = 1;
    if (s > total) s = total;

    let e = parseInt(stageRangeEnd, 10);
    if (isNaN(e) || e < s) e = total;
    if (e > total) e = total;

    const list = tempContacts.slice(s - 1, e);
    const firstItem = tempContacts[s - 1];
    const lastItem = tempContacts[e - 1];

    return {
      start: s,
      end: e,
      count: list.length,
      list,
      startRow: firstItem?.excelRow || (firstItem?.originalIndex ? firstItem.originalIndex + 1 : s + 1),
      endRow: lastItem?.excelRow || (lastItem?.originalIndex ? lastItem.originalIndex + 1 : e + 1)
    };
  };
  // Recently used contacts (persisted): re-add past numbers to call again, e.g. with another college
  const getInitialRecent = () => {
    try {
      const raw = localStorage.getItem('vv_recent_contacts');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 50);
    } catch (e) { }
    return [];
  };
  const [recentContacts, setRecentContacts] = useState(getInitialRecent);
  const [recentSearch, setRecentSearch] = useState('');
  const [recentChecked, setRecentChecked] = useState([]);

  // Campaign Management State
  const [campaigns, setCampaigns] = useState([]);
  const [campaignCustomName, setCampaignCustomName] = useState('');
  const [showCampaignsInDashboard, setShowCampaignsInDashboard] = useState(false);
  const [showPastCampaignsModal, setShowPastCampaignsModal] = useState(false);
  const [selectedCampaignDetail, setSelectedCampaignDetail] = useState(null);
  const [cameFromPastCampaignsModal, setCameFromPastCampaignsModal] = useState(false);
  const [campaignCheckedContacts, setCampaignCheckedContacts] = useState([]);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [editingCampaignName, setEditingCampaignName] = useState('');
  const [pastCampaignSearch, setPastCampaignSearch] = useState('');
  const [pastCampaignUniFilter, setPastCampaignUniFilter] = useState('ALL');
  const [campaignContactStatusFilter, setCampaignContactStatusFilter] = useState('ALL');

  const pushRecentContacts = (items) => {
    if (!items || items.length === 0) return;
    setRecentContacts(prev => {
      const seen = new Map();
      [...items, ...prev].forEach(c => {
        const key = String(c.formattedPhone || c.phone || '').replace(/\D/g, '').slice(-10);
        if (key && !seen.has(key)) {
          seen.set(key, {
            name: c.name || '',
            phone: String(c.phone || '').replace(/\D/g, ''),
            formattedPhone: c.formattedPhone || '',
            universityId: c.universityId || '',
            universityName: c.universityName || c.college || '',
            email: c.email || '',
            state: c.state || '',
            district: c.district || '',
            program: c.program || c.course || '',
            course: c.course || c.program || '',
            extraFields: c.extraFields || {},
            usedAt: c.usedAt || new Date().toISOString()
          });
        }
      });
      const next = Array.from(seen.values()).slice(0, 50);
      try { localStorage.setItem('vv_recent_contacts', JSON.stringify(next)); } catch (e) { }
      return next;
    });
  };

  const handleLoadRecentToTemp = (items) => {
    const valid = (items || []).map(r => {
      const formatted = validatePhone(r.phone || r.formattedPhone);
      return formatted ? {
        id: `recent-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        phone: String(r.phone || '').replace(/\D/g, ''),
        formattedPhone: formatted,
        name: (r.name || '').trim(),
        hasName: Boolean((r.name || '').trim()),
        email: r.email || '',
        state: r.state || '',
        district: r.district || '',
        program: r.program || r.course || '',
        course: r.course || r.program || '',
        extraFields: r.extraFields || {}
      } : null;
    }).filter(Boolean);
    if (valid.length === 0) {
      addToast('No valid numbers in selection.', 'error');
      return;
    }
    setTempContacts(prev => [...prev, ...valid]);
    setTempInputMode('recent');
    setRecentChecked([]);
    addToast(`Loaded ${valid.length} recent contact${valid.length > 1 ? 's' : ''} — pick a college in Step 2 to stage.`, 'success');
  };

  // Recent-numbers pagination (8 per page — stays usable with 50 saved)
  const RECENT_PAGE_SIZE = 8;
  const [recentPage, setRecentPage] = useState(0);

  // Recently uploaded Excel/CSV files (parsed contacts kept, so any file can be
  // re-loaded later to call with another college without re-uploading)
  const RECENT_FILES_MAX = 8;
  const RECENT_FILE_CONTACTS_MAX = 5000;
  const getInitialRecentFiles = () => {
    try {
      const raw = localStorage.getItem('vv_recent_files');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, RECENT_FILES_MAX);
    } catch (e) { }
    return [];
  };
  const [recentFiles, setRecentFiles] = useState(getInitialRecentFiles);

  const pushRecentFile = (entry) => {
    if (!entry || !entry.fileName) return;
    setRecentFiles(prev => {
      const next = [{ ...entry, id: `file-${Date.now()}` }, ...prev.filter(f => f.fileName !== entry.fileName)].slice(0, RECENT_FILES_MAX);
      try { localStorage.setItem('vv_recent_files', JSON.stringify(next)); } catch (e) { }
      return next;
    });
  };

  const updateRecentFileProgress = (fileName, completedCount) => {
    if (!fileName || !completedCount) return;
    setRecentFiles(prev => {
      let changed = false;
      const updated = prev.map(f => {
        if (f.fileName === fileName) {
          if ((f.lastCompletedIndex || 0) < completedCount) {
            changed = true;
            return { ...f, lastCompletedIndex: completedCount };
          }
        }
        return f;
      });
      if (changed) {
        try { localStorage.setItem('vv_recent_files', JSON.stringify(updated)); } catch (e) { }
        return updated;
      }
      return prev;
    });
  };

  const handleLoadRecentFile = (file, customStart = 1, customEnd = null) => {
    if (!file || !Array.isArray(file.contacts) || file.contacts.length === 0) {
      addToast('This saved file has no contacts left.', 'error');
      return;
    }
    const valid = file.contacts.map((r, i) => {
      const formatted = validatePhone(r.phone || r.formattedPhone);
      return formatted ? {
        id: `recentfile-${Date.now()}-${i}`,
        originalIndex: r.originalIndex !== undefined ? r.originalIndex : (i + 1),
        excelRow: r.excelRow !== undefined ? r.excelRow : (i + 2),
        phone: String(r.phone || '').replace(/\D/g, ''),
        formattedPhone: formatted,
        name: (r.name || '').trim(),
        hasName: Boolean((r.name || '').trim()),
        email: r.email || '',
        state: r.state || '',
        district: r.district || '',
        program: r.program || r.course || '',
        course: r.course || r.program || '',
        extraFields: r.extraFields || {}
      } : null;
    }).filter(Boolean);
    if (valid.length === 0) {
      addToast('No valid numbers left in this file.', 'error');
      return;
    }
    setTempContacts(valid);
    setTempInputMode('excel');
    const s = Math.max(1, Math.min(valid.length, parseInt(customStart, 10) || 1));
    const e = customEnd ? Math.max(s, Math.min(valid.length, parseInt(customEnd, 10) || valid.length)) : valid.length;
    setStageRangeStart(s);
    setStageRangeEnd(e);
    setUploadedFileInfo({
      fileName: file.fileName,
      fileSize: file.fileSize || '',
      count: valid.length,
      uploadedAt: file.uploadedAt ? new Date(file.uploadedAt).toLocaleTimeString() : new Date().toLocaleTimeString(),
      lastCompletedIndex: file.lastCompletedIndex || 0
    });
    if (s > 1) {
      addToast(`Loaded ${valid.length} contacts from ${file.fileName} — Range pre-selected from #${s} to #${e} (Excel Row ${valid[s - 1]?.excelRow || (s + 1)})!`, 'success');
    } else {
      addToast(`Loaded ${valid.length} contacts from ${file.fileName}! Select college and range in Step 2.`, 'success');
    }
  };

  const handleDeleteRecentFile = (id) => {
    setRecentFiles(prev => {
      const next = prev.filter(f => f.id !== id);
      try { localStorage.setItem('vv_recent_files', JSON.stringify(next)); } catch (e) { }
      return next;
    });
  };
  const [selectedUniversity, setSelectedUniversity] = useState('vidyavision');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [uniSearchDialer, setUniSearchDialer] = useState('');
  const [uniSearchDashboard, setUniSearchDashboard] = useState('');
  const [showLogs, setShowLogs] = useState(false);

  const DEFAULT_COLLEGES = [
    {
      id: 'vidyavision',
      name: 'Vidyavision AI Assistant',
      place: 'Hyderabad, Telangana',
      agentId: 270604,
      languages: 'Telugu, English, Hindi, Tamil, Malayalam',
      courses: ['B.Tech CSE', 'B.Tech ECE', 'B.Tech IT', 'MBA'],
      status: 'active',
      websiteUrl: 'https://vidyavision.com/admissions',
      description: 'Multilingual south-region admission outreach.'
    },
    {
      id: 'gitam',
      name: 'GITAM University',
      place: 'Visakhapatnam & Hyderabad',
      agentId: 270604,
      languages: 'English, Hindi',
      courses: ['B.Tech CSE', 'B.Tech ECE', 'MBA'],
      status: 'active',
      websiteUrl: 'https://applications.gitam.edu',
      description: 'GITAM admission queries and course catalog details.'
    },
    {
      id: 'kl',
      name: 'KL University',
      place: 'Vijayawada & Hyderabad',
      agentId: 270604,
      languages: 'English, Hindi',
      courses: ['B.Tech CSE', 'B.Tech ECE', 'MBA'],
      status: 'active',
      websiteUrl: 'https://kluniversity.in/admissions',
      description: 'KL University admission inquiries and course selection.'
    },
    {
      id: 'icfai',
      name: 'ICFAI Foundation for Higher Education',
      place: 'Hyderabad, Telangana',
      agentId: 270604,
      languages: 'English, Hindi',
      courses: ['MBA', 'BBA', 'B.Tech CSE'],
      status: 'active',
      websiteUrl: 'https://ifheindia.org/admissions',
      description: 'ICFAI IFHE Hyderabad admissions wing.'
    },
    {
      id: 'mnr',
      name: 'MNR University',
      place: 'Sangareddy, Telangana',
      agentId: 270604,
      languages: 'Telugu, English, Hindi',
      courses: ['B.Tech CSE', 'B.Tech ECE', 'MBA'],
      status: 'active',
      websiteUrl: 'https://mnrindia.org/admissions',
      description: 'MNR University medical, engineering & general admissions.'
    },
    {
      id: 'mitwpu',
      name: 'MIT WPU',
      place: 'Pune, Maharashtra',
      agentId: 270604,
      languages: 'English, Hindi',
      courses: ['MBA', 'B.Tech CSE', 'B.Tech ECE', 'BBA'],
      status: 'active',
      websiteUrl: 'https://mitwpu.edu.in/admissions',
      description: 'MIT World Peace University admissions outreach.'
    }
  ];

  // Real-time Queue & Campaign State (from WS or REST)
  const [campaignState, setCampaignState] = useState({
    isRunning: false,
    isPaused: false,
    totalCount: 0,
    completedCount: 0,
    answeredCount: 0,
    unansweredCount: 0,
    delayMs: 2000,
    currentContactIndex: -1
  });

  const [activeQueue, setActiveQueue] = useState([]);
  const [currentCall, setCurrentCall] = useState(null);

  // App Data States
  const [logs, setLogs] = useState([]);
  const [calls, setCalls] = useState([]);
  const [toasts, setToasts] = useState([]);

  // Google Sheets Data States
  const [sheetsCalls, setSheetsCalls] = useState([]);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [sheetsSyncError, setSheetsSyncError] = useState(null);
  const [lastSyncedTime, setLastSyncedTime] = useState(null);

  // Dashboard Filters: 'ALL' | 'ANSWERED' | 'UNANSWERED' | 'INTERESTED' | 'NOT_INTERESTED'
  const [dashboardFilter, setDashboardFilter] = useState('ALL');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardUniversityFilter, setDashboardUniversityFilter] = useState(['ALL']);
  // Multi-select scope: ['ALL'] (or empty) = all colleges; otherwise selected college ids
  const toggleUniScope = (id) => {
    setDashboardUniversityFilter(prev => {
      const list = prev.includes('ALL') ? [] : [...prev];
      if (list.includes(id)) {
        const next = list.filter(x => x !== id);
        return next.length === 0 ? ['ALL'] : next;
      }
      return [...list, id];
    });
  };

  // Date and status filters
  const [dateFilter, setDateFilter] = useState('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('DATE_DESC');

  // Transcript Modal State
  const [selectedCall, setSelectedCall] = useState(null);
  const [editingInterestStatus, setEditingInterestStatus] = useState('PENDING');
  const [showCollegeModal, setShowCollegeModal] = useState(false);
  const [showManageColleges, setShowManageColleges] = useState(false);
  const [isSavingCollege, setIsSavingCollege] = useState(false);
  const [editingCollege, setEditingCollege] = useState('');
  const [editingCourse, setEditingCourse] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [isSavingInterest, setIsSavingInterest] = useState(false);
  const [deletingCollegeId, setDeletingCollegeId] = useState('');
  const [editingCollegeId, setEditingCollegeId] = useState('');
  const [collegeForm, setCollegeForm] = useState({
    name: '',
    place: '',
    websiteUrl: '',
    description: '',
    agentId: '270604',
    languages: 'English, Hindi, Telugu',
    courses: ''
  });

  const getInitialColleges = () => {
    try {
      const cached = localStorage.getItem('vv_colleges_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }
    return DEFAULT_COLLEGES;
  };

  const [universities, setUniversities] = useState(getInitialColleges);

  // Keep the Step-2 college selection valid as colleges change
  useEffect(() => {
    if (universities.length > 0 && !universities.find(u => u.id === selectedUniversity)) {
      setSelectedUniversity(universities[0].id);
      setSelectedCourse('');
    }
  }, [universities]);

  // Dashboard multi-select scope helpers (after universities is defined)
  const isAllUniScope = dashboardUniversityFilter.includes('ALL') || dashboardUniversityFilter.length === 0;
  const uniScopeLabel = isAllUniScope
    ? 'All Universities'
    : dashboardUniversityFilter.length === 1
      ? ((universities.find(u => u.id === dashboardUniversityFilter[0]) || {}).name || dashboardUniversityFilter[0])
      : `${dashboardUniversityFilter.length} Colleges`;

  const syncColleges = (items) => {
    if (Array.isArray(items) && items.length > 0) {
      setUniversities(items);
      try {
        localStorage.setItem('vv_colleges_cache', JSON.stringify(items));
      } catch (e) { }
    }
  };

  const fetchColleges = async () => {
    try {
      const res = await fetch('/api/colleges');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data)) {
        syncColleges(data.data);
      }
    } catch (err) {
      console.error('Failed to load colleges:', err);
    }
  };

  useEffect(() => {
    fetchColleges();
  }, []);

  const resetCollegeForm = () => {
    setCollegeForm({
      name: '',
      place: '',
      websiteUrl: '',
      description: '',
      agentId: '270604',
      languages: 'English, Hindi, Telugu',
      courses: ''
    });
    setEditingCollegeId('');
  };

  const handleEditCollege = (college) => {
    if (!college) return;
    setCollegeForm({
      name: college.name || '',
      place: college.place || '',
      websiteUrl: college.websiteUrl || '',
      description: college.description || '',
      agentId: String(college.agentId || 270604),
      languages: college.languages || 'English, Hindi, Telugu',
      courses: Array.isArray(college.courses) ? college.courses.join(', ') : (college.courses || '')
    });
    setEditingCollegeId(college.id);
    setShowCollegeModal(true);
  };

  const handleSaveCollege = async (e) => {
    if (e) e.preventDefault();
    if (isSavingCollege) return;
    if (!collegeForm.name.trim()) {
      addToast('College name is required.', 'error');
      return;
    }

    setIsSavingCollege(true);
    const savedName = collegeForm.name.trim();
    let resData = null;
    let fetchSuccess = false;

    try {
      const res = await fetch('/api/colleges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCollegeId || undefined,
          name: savedName,
          place: collegeForm.place.trim(),
          websiteUrl: collegeForm.websiteUrl.trim(),
          description: collegeForm.description.trim(),
          agentId: Number(collegeForm.agentId) || 270604,
          languages: (collegeForm.languages || '').trim() || 'English, Hindi, Telugu',
          courses: String(collegeForm.courses || '').split(',').map(s => s.trim()).filter(Boolean)
        })
      });

      resData = await res.json();
      fetchSuccess = res.ok && resData && resData.success;
    } catch (err) {
      console.error('Fetch error saving college:', err);
      addToast('Network error saving college. Please try again.', 'error');
      setIsSavingCollege(false);
      return;
    }

    if (fetchSuccess) {
      addToast(editingCollegeId ? `College "${savedName}" updated successfully!` : `College "${savedName}" added successfully!`, 'success');
      if (Array.isArray(resData.colleges)) {
        setUniversities(resData.colleges);
      }
      setShowCollegeModal(false);
      resetCollegeForm();
    } else {
      addToast((resData && resData.error) || 'Failed to save college.', 'error');
    }

    setIsSavingCollege(false);
  };

  const handleDeleteCollege = async (college) => {
    if (!college || deletingCollegeId) return;
    const confirmed = window.confirm(`Delete ${college.name}? Existing call history stays, but this college will be removed from selectors.`);
    if (!confirmed) return;

    setDeletingCollegeId(college.id);
    let resData = null;
    let deleteSuccess = false;

    try {
      const res = await fetch(`/api/colleges/${encodeURIComponent(college.id)}`, { method: 'DELETE' });
      resData = await res.json();
      deleteSuccess = res.ok && resData && resData.success;
    } catch (err) {
      console.error('Network error deleting college:', err);
      addToast('Network error deleting college.', 'error');
      setDeletingCollegeId('');
      return;
    }

    if (deleteSuccess) {
      if (Array.isArray(resData.colleges)) {
        setUniversities(resData.colleges);
      }
      setStagedContacts(prev => prev.filter(c => c.universityId !== college.id));
      if (selectedUniversity === college.id) {
        const fallback = (resData.colleges && resData.colleges[0]?.id) || 'ALL';
        setSelectedUniversity(fallback);
      }
      if (dashboardUniversityFilter.includes(college.id)) {
        setDashboardUniversityFilter(prev => {
          const next = prev.filter(x => x !== college.id);
          return next.length === 0 ? ['ALL'] : next;
        });
      }
      addToast(`${college.name} deleted.`, 'success');
    } else {
      addToast((resData && resData.error) || 'Failed to delete college.', 'error');
    }

    setDeletingCollegeId('');
  };

  const logsEndRef = useRef(null);
  const wsRef = useRef(null);
  const fileInputRef = useRef(null);
  const addMoreFileInputRef = useRef(null);

  // Add Toast Notification helper
  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 4);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // Flexible Phone Validator (10-digit Indian, leading 0, 91 prefix, or international format)
  const validatePhone = (num) => {
    if (!num) return null;
    const str = String(num).trim();
    const clean = str.replace(/\D/g, '');
    if (clean.length === 10 && clean[0] !== '0') {
      return `+91${clean}`;
    }
    if (clean.length === 11 && clean[0] === '0' && clean[1] !== '0') {
      return `+91${clean.slice(1)}`;
    }
    if (clean.length === 12 && clean.startsWith('91')) {
      return `+${clean}`;
    }
    if (str.startsWith('+') && clean.length >= 10 && clean.length <= 15) {
      return `+${clean}`;
    }
    return null;
  };

  // Connect WebSockets for live data
  useEffect(() => {
    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/stream`;

      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'logs') {
            setLogs(msg.data);
          } else if (msg.type === 'calls') {
            setCalls(msg.data);
          } else if (msg.type === 'sheets_update') {
            setSheetsCalls(msg.data);
            setLastSyncedTime(new Date());
            setSheetsSyncError(null);
          } else if (msg.type === 'colleges') {
            syncColleges(msg.data);
          } else if (msg.type === 'campaigns') {
            if (Array.isArray(msg.data)) setCampaigns(msg.data);
          } else if (msg.type === 'queue_update') {
            if (msg.data.campaignState) setCampaignState(msg.data.campaignState);
            if (msg.data.queue) setActiveQueue(msg.data.queue);
            setCurrentCall(msg.data.currentCall || null);
          }
        } catch (err) {
          console.error('WebSocket parsing error:', err);
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        setTimeout(connectWs, 3000);
      };

      socket.onerror = (err) => {
        socket.close();
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Fetch campaigns
  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data)) {
        setCampaigns(data.data);
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Fetch live OmniDimension call logs via REST (no WebSocket dependency, so the
  // dashboard + Recent Calls update even if the live socket drops).
  const fetchOmniCalls = async () => {
    try {
      const res = await fetch('/api/calls');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data)) {
        setCalls(data.data);
      }
    } catch (err) {
      console.error('REST calls sync error:', err);
    }
  };

  useEffect(() => {
    fetchOmniCalls();
    const t = setInterval(fetchOmniCalls, 30000);
    return () => clearInterval(t);
  }, []);

  // Fetch call analytics from Google Sheets API
  const fetchCallAnalytics = async (force = false) => {
    setIsLoadingSheets(true);
    setSheetsSyncError(null);
    try {
      const res = await fetch(`/api/call-analytics${force ? '?force=true' : ''}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSheetsCalls(data.data);
        setLastSyncedTime(new Date());
        if (data.error) {
          setSheetsSyncError(data.error);
        }
      } else {
        setSheetsSyncError(data.error || 'Failed to load call analytics.');
      }
    } catch (err) {
      setSheetsSyncError('Network error connecting to backend API.');
    } finally {
      setIsLoadingSheets(false);
    }
  };

  // Auto-sync Google Sheets when Dashboard active or on 45s interval
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchCallAnalytics(true).catch(err => console.error('Auto-sync error:', err));
    } else {
      fetchCallAnalytics().catch(err => console.error('Silent sync error:', err));
    }

    const interval = setInterval(() => {
      fetchCallAnalytics(activeTab === 'dashboard').catch(err => console.error('Interval sync error:', err));
    }, 45000);

    return () => clearInterval(interval);
  }, [activeTab]);

  // Auto-scroll logs feed
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Handle Single Contact Add
  const handleAddSingleContact = (e) => {
    e.preventDefault();
    setPhoneError('');

    const formatted = validatePhone(singlePhone);
    if (!formatted) {
      setPhoneError('Must be a 10-digit Indian phone number (not starting with 0).');
      return;
    }

    const newContact = {
      id: `staged-${Date.now()}`,
      phone: singlePhone,
      formattedPhone: formatted,
      name: singleName.trim(),
      hasName: Boolean(singleName.trim())
    };

    setTempContacts([newContact]);
    setTempInputMode('manual');
    setSinglePhone('');
    setSingleName('');
    addToast(`Contact loaded! Please select University Bot below to stage it.`, 'success');
  };

  // Handle Bulk Paste Input
  const handleProcessBulkText = () => {
    if (!bulkText.trim()) {
      addToast('Please paste numbers or names first.', 'error');
      return;
    }

    const lines = bulkText.split(/\r?\n/).filter(line => line.trim().length > 0);
    const newItems = [];

    lines.forEach(line => {
      const parts = line.split(/[,;\t]/);
      let phoneCandidate = '';
      let nameCandidate = '';

      if (parts.length >= 2) {
        if (/\d{10}/.test(parts[0])) {
          phoneCandidate = parts[0];
          nameCandidate = parts.slice(1).join(' ');
        } else {
          nameCandidate = parts[0];
          phoneCandidate = parts[1];
        }
      } else {
        phoneCandidate = line;
      }

      const formatted = validatePhone(phoneCandidate);
      if (formatted) {
        newItems.push({
          id: `staged-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          phone: phoneCandidate.replace(/\D/g, ''),
          formattedPhone: formatted,
          name: nameCandidate.trim(),
          hasName: Boolean(nameCandidate.trim())
        });
      }
    });

    if (newItems.length === 0) {
      addToast('No valid 10-digit Indian mobile numbers found in text.', 'error');
    } else {
      setTempContacts(newItems);
      setTempInputMode('bulk');
      setBulkText('');
      addToast(`Imported ${newItems.length} contacts! Select university and delay below.`, 'success');
    }
  };

  // Handle Excel / CSV File Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 1) {
          addToast('Selected Excel/CSV file is empty.', 'error');
          return;
        }

        const rawHeaders = jsonData[0].map(h => String(h || '').trim());
        const headers = rawHeaders.map(h => h.toLowerCase());

        let phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('number') || h.includes('contact'));
        let nameIdx = headers.findIndex(h => h.includes('fullname') || h.includes('full_name') || h.includes('name') || h.includes('student') || h.includes('person') || h.includes('user'));
        let emailIdx = headers.findIndex(h => h.includes('email') || h.includes('e-mail') || h.includes('mail'));
        let stateIdx = headers.findIndex(h => h.includes('state') || h.includes('province') || h.includes('region'));
        let distIdx = headers.findIndex(h => h.includes('district') || h.includes('city') || h.includes('town') || h.includes('location'));
        let progIdx = headers.findIndex(h => h.includes('program') || h.includes('course') || h.includes('degree') || h.includes('branch') || h.includes('stream') || h.includes('specialization'));

        if (phoneIdx === -1) phoneIdx = 0;
        if (nameIdx === -1 && headers.length > 1) nameIdx = phoneIdx === 0 ? 1 : 0;

        const parsedContacts = [];

        for (let i = (headers.length > 0 && phoneIdx !== -1 && isNaN(jsonData[0][phoneIdx]) ? 1 : 0); i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;

          const rawPhone = row[phoneIdx] !== undefined ? String(row[phoneIdx]) : '';
          const rawName = nameIdx !== -1 && row[nameIdx] !== undefined ? String(row[nameIdx]) : '';
          let rawEmail = emailIdx !== -1 && row[emailIdx] !== undefined ? String(row[emailIdx]) : '';
          let rawState = stateIdx !== -1 && row[stateIdx] !== undefined ? String(row[stateIdx]) : '';
          let rawDist = distIdx !== -1 && row[distIdx] !== undefined ? String(row[distIdx]) : '';
          let rawProg = progIdx !== -1 && row[progIdx] !== undefined ? String(row[progIdx]) : '';

          // Capture any extra student/parent columns
          const extraFields = {};
          rawHeaders.forEach((hdr, colIdx) => {
            if (colIdx !== phoneIdx && colIdx !== nameIdx && row[colIdx] !== undefined && String(row[colIdx]).trim() !== '') {
              extraFields[hdr] = String(row[colIdx]).trim();
            }
          });

          // Intelligent fallbacks from extraFields if standard index was not found or empty
          if (!rawEmail.trim()) {
            const k = Object.keys(extraFields).find(key => /email|mail/i.test(key));
            if (k) rawEmail = extraFields[k];
          }
          if (!rawState.trim()) {
            const k = Object.keys(extraFields).find(key => /state/i.test(key));
            if (k) rawState = extraFields[k];
          }
          if (!rawDist.trim()) {
            const k = Object.keys(extraFields).find(key => /district|city|town/i.test(key));
            if (k) rawDist = extraFields[k];
          }
          if (!rawProg.trim()) {
            const k = Object.keys(extraFields).find(key => /program|course|degree|branch/i.test(key));
            if (k) rawProg = extraFields[k];
          }

          const formatted = validatePhone(rawPhone);
          if (formatted) {
            parsedContacts.push({
              id: `excel-${Date.now()}-${i}`,
              originalIndex: parsedContacts.length + 1,
              excelRow: i + 1,
              phone: rawPhone.replace(/\D/g, ''),
              formattedPhone: formatted,
              name: rawName.trim(),
              hasName: Boolean(rawName.trim()),
              email: rawEmail.trim(),
              state: rawState.trim(),
              district: rawDist.trim(),
              program: rawProg.trim(),
              course: rawProg.trim(),
              extraFields
            });
          }
        }

        if (parsedContacts.length === 0) {
          addToast('Could not extract any valid 10-digit numbers from Excel sheet.', 'error');
        } else {
          setTempContacts(parsedContacts);
          setTempInputMode('excel');
          setStageRangeStart(1);
          setStageRangeEnd(parsedContacts.length);
          setUploadedFileInfo({
            fileName: file.name,
            fileSize: (file.size / 1024).toFixed(1) + ' KB',
            count: parsedContacts.length,
            uploadedAt: new Date().toLocaleTimeString(),
            lastCompletedIndex: 0
          });
          pushRecentFile({
            fileName: file.name,
            fileSize: (file.size / 1024).toFixed(1) + ' KB',
            count: parsedContacts.length,
            uploadedAt: new Date().toISOString(),
            lastCompletedIndex: 0,
            contacts: parsedContacts.slice(0, RECENT_FILE_CONTACTS_MAX).map(c => ({
              originalIndex: c.originalIndex,
              excelRow: c.excelRow,
              phone: c.phone,
              formattedPhone: c.formattedPhone,
              name: c.name,
              email: c.email || '',
              state: c.state || '',
              district: c.district || '',
              program: c.program || '',
              course: c.course || '',
              extraFields: c.extraFields || {}
            }))
          });
          addToast(`Imported ${parsedContacts.length} contacts from ${file.name}! Select settings below.`, 'success');
        }
      } catch (err) {
        console.error(err);
        addToast('Failed to parse Excel file format.', 'error');
      }
    };

    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  // Upload and APPEND more numbers from Excel / CSV to current tempContacts
  const handleAddMoreFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 1) {
          addToast('Selected Excel/CSV file is empty.', 'error');
          return;
        }

        const rawHeaders = jsonData[0].map(h => String(h || '').trim());
        const headers = rawHeaders.map(h => h.toLowerCase());

        let phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('number') || h.includes('contact'));
        let nameIdx = headers.findIndex(h => h.includes('fullname') || h.includes('full_name') || h.includes('name') || h.includes('student') || h.includes('person') || h.includes('user'));
        let emailIdx = headers.findIndex(h => h.includes('email') || h.includes('e-mail') || h.includes('mail'));
        let stateIdx = headers.findIndex(h => h.includes('state') || h.includes('province') || h.includes('region'));
        let distIdx = headers.findIndex(h => h.includes('district') || h.includes('city') || h.includes('town') || h.includes('location'));
        let progIdx = headers.findIndex(h => h.includes('program') || h.includes('course') || h.includes('degree') || h.includes('branch') || h.includes('stream') || h.includes('specialization'));

        if (phoneIdx === -1) phoneIdx = 0;
        if (nameIdx === -1 && headers.length > 1) nameIdx = phoneIdx === 0 ? 1 : 0;

        const newParsed = [];

        for (let i = (headers.length > 0 && phoneIdx !== -1 && isNaN(jsonData[0][phoneIdx]) ? 1 : 0); i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;

          const rawPhone = row[phoneIdx] !== undefined ? String(row[phoneIdx]) : '';
          const rawName = nameIdx !== -1 && row[nameIdx] !== undefined ? String(row[nameIdx]) : '';
          let rawEmail = emailIdx !== -1 && row[emailIdx] !== undefined ? String(row[emailIdx]) : '';
          let rawState = stateIdx !== -1 && row[stateIdx] !== undefined ? String(row[stateIdx]) : '';
          let rawDist = distIdx !== -1 && row[distIdx] !== undefined ? String(row[distIdx]) : '';
          let rawProg = progIdx !== -1 && row[progIdx] !== undefined ? String(row[progIdx]) : '';

          const extraFields = {};
          rawHeaders.forEach((hdr, colIdx) => {
            if (colIdx !== phoneIdx && colIdx !== nameIdx && row[colIdx] !== undefined && String(row[colIdx]).trim() !== '') {
              extraFields[hdr] = String(row[colIdx]).trim();
            }
          });

          // Intelligent fallbacks from extraFields if standard index was not found or empty
          if (!rawEmail.trim()) {
            const k = Object.keys(extraFields).find(key => /email|mail/i.test(key));
            if (k) rawEmail = extraFields[k];
          }
          if (!rawState.trim()) {
            const k = Object.keys(extraFields).find(key => /state/i.test(key));
            if (k) rawState = extraFields[k];
          }
          if (!rawDist.trim()) {
            const k = Object.keys(extraFields).find(key => /district|city|town/i.test(key));
            if (k) rawDist = extraFields[k];
          }
          if (!rawProg.trim()) {
            const k = Object.keys(extraFields).find(key => /program|course|degree|branch/i.test(key));
            if (k) rawProg = extraFields[k];
          }

          const formatted = validatePhone(rawPhone);
          if (formatted) {
            newParsed.push({
              id: `excel-add-${Date.now()}-${i}`,
              phone: rawPhone.replace(/\D/g, ''),
              formattedPhone: formatted,
              name: rawName.trim(),
              hasName: Boolean(rawName.trim()),
              email: rawEmail.trim(),
              state: rawState.trim(),
              district: rawDist.trim(),
              program: rawProg.trim(),
              course: rawProg.trim(),
              source: 'excel',
              extraFields
            });
          }
        }

        if (newParsed.length === 0) {
          addToast('Could not extract any valid 10-digit numbers from Excel sheet.', 'error');
          return;
        }

        const phoneMap = new Map();
        (tempContacts || []).forEach(c => {
          const p = String(c.phone || c.formattedPhone || '').replace(/\D/g, '').slice(-10);
          if (p) phoneMap.set(p, c);
        });

        let addedCount = 0;
        newParsed.forEach(c => {
          const p = String(c.phone || c.formattedPhone || '').replace(/\D/g, '').slice(-10);
          if (p) {
            if (!phoneMap.has(p)) addedCount++;
            phoneMap.set(p, c);
          }
        });

        const merged = Array.from(phoneMap.values());
        setTempContacts(merged);
        addToast(`Added ${addedCount} new numbers from ${file.name}! Total batch now: ${merged.length} contacts.`, 'success');
      } catch (err) {
        console.error(err);
        addToast('Error reading Excel file.', 'error');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  // Remove Uploaded Excel File
  const handleRemoveUploadedFile = () => {
    setUploadedFileInfo(null);
    setTempContacts([]);
    setCallDelay('');
    addToast('Contacts cleared.', 'info');
  };

  // Download Sample CSV Helper
  const downloadSampleCsv = () => {
    const csvContent = "data:text/csv;charset=utf-8,Name,Mobile\nRamesh Kumar,9876543210\nSrikant V,9123456789\n,9573097810\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "sample_calling_list.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('Sample CSV downloaded!', 'info');
  };

  // Remove staged contact
  const removeStagedContact = (id) => {
    setStagedContacts(prev => prev.filter(c => c.id !== id));
  };

  // Clear all staged contacts
  const clearStagedContacts = () => {
    setStagedContacts([]);
    setUploadedFileInfo(null);
    setTempContacts([]);
    setCallDelay('');
    addToast('Staged contacts list cleared.', 'info');
  };

  const handleStageTempContacts = () => {
    if (tempContacts.length === 0) return;

    const uni = universities.find(u => u.id === selectedUniversity);
    if (!uni) {
      addToast('Please select a university bot first.', 'error');
      return;
    }
    if (uni.status === 'inactive') {
      addToast(`${uni.name} bot is currently inactive and cannot be staged.`, 'error');
      return;
    }

    const rangeData = getStageRangeData();
    const contactsToStage = rangeData.list;
    if (contactsToStage.length === 0) {
      addToast('No contacts found in selected range.', 'error');
      return;
    }

    const targetCourse = selectedCourse || '';
    const enrichedContacts = contactsToStage.map(c => {
      const contactCourse = c.course || targetCourse;
      const contactAgentId = isUgCourse(contactCourse) ? 270740 : (uni.agentId || 270604);
      return {
        ...c,
        universityId: uni.id,
        universityName: uni.name,
        collegePlace: uni.place || uni.location || '',
        agentId: contactAgentId,
        course: contactCourse
      };
    });

    setStagedContacts(prev => [...prev, ...enrichedContacts]);
    setTempContacts([]);
    setTempInputMode('');
    pushRecentContacts(enrichedContacts.map(c => ({ ...c, usedAt: new Date().toISOString() })));
    const rangeMsg = (rangeData.start > 1 || rangeData.end < tempContacts.length)
      ? `Staged ${contactsToStage.length} contacts (#${rangeData.start} to #${rangeData.end}, Excel Rows #${rangeData.startRow} to #${rangeData.endRow}) for ${uni.name}!`
      : `Successfully staged all ${contactsToStage.length} contacts for ${uni.name}!`;
    addToast(rangeMsg, 'success');
  };

  // Stage remaining uncalled contacts from active queue
  const handleStageRemainingContacts = () => {
    if (!activeQueue || activeQueue.length === 0) {
      addToast('No campaign contacts available to stage.', 'warning');
      return;
    }

    let uncalled = activeQueue.filter(q => q.status === 'queued' || q.status === 'canceled');
    if (uncalled.length === 0 && campaignState.completedCount < activeQueue.length) {
      uncalled = activeQueue.slice(campaignState.completedCount);
    }

    if (uncalled.length === 0) {
      addToast('All contacts in this campaign have already been dialed!', 'info');
      return;
    }

    const firstOriginalIdx = uncalled[0]?.originalIndex !== undefined ? uncalled[0].originalIndex : (campaignState.completedCount + 1);
    const lastOriginalIdx = uncalled[uncalled.length - 1]?.originalIndex !== undefined ? uncalled[uncalled.length - 1].originalIndex : (campaignState.completedCount + uncalled.length);

    const targetUni = universities.find(u => u.id === (campaignState.universityId || selectedUniversity)) || universities[0];
    const targetCourse = campaignState.course || selectedCourse || '';

    const newStaged = uncalled.map((c, i) => ({
      id: `resumed-${Date.now()}-${i}`,
      phone: String(c.phone || c.formattedPhone || '').replace(/\D/g, ''),
      formattedPhone: c.formattedPhone || validatePhone(c.phone),
      name: c.name || '',
      hasName: Boolean(c.name && c.name !== 'Student'),
      originalIndex: c.originalIndex !== undefined ? c.originalIndex : (campaignState.completedCount + i + 1),
      excelRow: c.excelRow !== undefined ? c.excelRow : (campaignState.completedCount + i + 2),
      universityId: targetUni?.id || 'vidyavision',
      universityName: targetUni?.name || 'Vidyavision AI',
      collegePlace: targetUni?.place || '',
      agentId: isUgCourse(c.course || targetCourse) ? 270740 : (targetUni?.agentId || 270604),
      course: c.course || targetCourse,
      fileName: campaignState.fileName || uploadedFileInfo?.fileName || '',
      email: c.email || '',
      state: c.state || '',
      district: c.district || '',
      program: c.program || c.course || targetCourse || '',
      extraFields: c.extraFields || {}
    }));

    setStagedContacts(prev => [...prev, ...newStaged]);
    if (campaignState.isRunning) {
      setCampaignState(prev => ({ ...prev, isPaused: true }));
      fetch('/api/queue/pause', { method: 'POST' }).catch(() => {});
    }

    setActiveTab('dispatch');
    addToast(`Staged ${newStaged.length} remaining contacts (Contacts #${firstOriginalIdx} to #${lastOriginalIdx}, Excel Rows #${uncalled[0]?.excelRow || (firstOriginalIdx + 1)} to #${uncalled[uncalled.length - 1]?.excelRow || (lastOriginalIdx + 1)})!`, 'success');
  };

  // Start Sequential Calling Campaign
  const handleStartCampaign = async () => {
    if (stagedContacts.length === 0) {
      addToast('No contacts staged. Please add or upload numbers first.', 'error');
      return;
    }

    const uni = universities.find(u => u.id === selectedUniversity);
    if (!uni || uni.status === 'inactive') {
      addToast('Selected university bot is inactive. Please choose an active university.', 'error');
      return;
    }

    const campaignCourse = selectedCourse || stagedContacts[0]?.course || '';
    const campaignAgentId = isUgCourse(campaignCourse) ? 270740 : (uni.agentId || 270604);
    const botLabel = isUgCourse(campaignCourse) ? 'UG Bot (#270740)' : 'PG Bot (#270604)';

    try {
      const res = await fetch('/api/queue/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: stagedContacts.map(c => {
            const cCourse = c.course || selectedCourse || '';
            const cAgentId = isUgCourse(cCourse) ? 270740 : (uni.agentId || 270604);
            return {
              phone: c.phone,
              formattedPhone: c.formattedPhone || (c.phone ? `+91${c.phone}` : ''),
              name: c.name || '',
              course: cCourse,
              agentId: cAgentId,
              email: c.email || '',
              state: c.state || '',
              district: c.district || '',
              program: c.program || cCourse,
              originalIndex: c.originalIndex,
              excelRow: c.excelRow,
              fileName: c.fileName || uploadedFileInfo?.fileName || '',
              extraFields: c.extraFields || {}
            };
          }),
          delaySeconds: callDelay !== '' ? callDelay : 2,
          agentId: campaignAgentId,
          universityId: uni.id,
          universityName: uni.name,
          collegePlace: uni.place || uni.location || '',
          applicationUrl: uni.websiteUrl || uni.applicationUrl || uni.admissionLink || '',
          course: campaignCourse,
          fileName: uploadedFileInfo?.fileName || '',
          campaignName: campaignCustomName && campaignCustomName.trim() ? campaignCustomName.trim() : undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast(`Campaign Started! Dialing ${data.totalCount} contacts sequentially using ${uni.name} [${botLabel}]...`, 'success');
        pushRecentContacts(stagedContacts.map(c => ({ ...c, usedAt: new Date().toISOString() })));
        setStagedContacts([]);
        setCampaignCustomName('');
        setShowLogs(true); // Auto-expand logs terminal
        fetchCampaigns();
      } else {
        addToast(data.error || 'Failed to start campaign', 'error');
      }
    } catch (err) {
      addToast('Network error starting campaign', 'error');
    }
  };

  // Campaign Management Action Handlers
  const handleLoadContactsToNewCampaign = (contactsToLoad) => {
    if (!contactsToLoad || contactsToLoad.length === 0) {
      addToast('Please select at least one contact to add.', 'error');
      return;
    }

    const valid = contactsToLoad.map(c => {
      const formatted = validatePhone(c.phone || c.formattedPhone);
      return formatted ? {
        id: `staged-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        phone: String(c.phone || c.formattedPhone || '').replace(/\D/g, '').slice(-10),
        formattedPhone: formatted,
        name: (c.name || '').trim(),
        hasName: Boolean((c.name || '').trim()),
        course: c.course || c.program || '',
        program: c.program || c.course || '',
        email: c.email || '',
        state: c.state || '',
        district: c.district || '',
        extraFields: c.extraFields || {},
        source: 'campaign'
      } : null;
    }).filter(Boolean);

    if (valid.length === 0) {
      addToast('No valid phone numbers found in selection.', 'error');
      return;
    }

    const existing = tempContacts || [];
    const phoneMap = new Map();
    existing.forEach(c => {
      const p = String(c.phone || c.formattedPhone || '').replace(/\D/g, '').slice(-10);
      if (p) phoneMap.set(p, c);
    });

    let newAdded = 0;
    valid.forEach(c => {
      const p = String(c.phone || c.formattedPhone || '').replace(/\D/g, '').slice(-10);
      if (p) {
        if (!phoneMap.has(p)) newAdded++;
        phoneMap.set(p, c);
      }
    });

    const combined = Array.from(phoneMap.values());
    setTempContacts(combined);
    setTempInputMode('campaign');
    setShowPastCampaignsModal(false);
    setSelectedCampaignDetail(null);
    setCameFromPastCampaignsModal(false);
    setCampaignCheckedContacts([]);
    setActiveTab('dispatch');
    if (existing.length > 0) {
      addToast(`Added ${newAdded} contacts from campaign! Total batch now: ${combined.length} contacts. You can also upload files to add more numbers.`, 'success');
    } else {
      addToast(`Loaded ${valid.length} contact${valid.length > 1 ? 's' : ''} into Step 2! You can also upload files to add more numbers to this campaign.`, 'success');
    }
  };



  const handleSaveCampaignName = async (id, newName) => {
    if (!newName || !newName.trim()) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, name: newName.trim() } : c));
        setEditingCampaignId(null);
        addToast('Campaign name updated.', 'success');
      }
    } catch (e) {
      addToast('Failed to update campaign name.', 'error');
    }
  };

  const handleDeleteCampaign = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete campaign "${name}"?`)) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCampaigns(prev => prev.filter(c => c.id !== id));
        if (selectedCampaignDetail?.id === id) setSelectedCampaignDetail(null);
        addToast(`Campaign "${name}" deleted.`, 'info');
      }
    } catch (e) {
      addToast('Failed to delete campaign.', 'error');
    }
  };

  // Campaign Control Actions
  const handlePauseCampaign = async () => {
    try {
      const res = await fetch('/api/queue/pause', { method: 'POST' });
      if (res.ok) addToast('Campaign paused', 'info');
    } catch (err) { addToast('Error pausing campaign', 'error'); }
  };

  const handleResumeCampaign = async () => {
    try {
      const res = await fetch('/api/queue/resume', { method: 'POST' });
      if (res.ok) addToast('Campaign resumed', 'success');
    } catch (err) { addToast('Error resuming campaign', 'error'); }
  };

  const handleCancelCampaign = async () => {
    try {
      const res = await fetch('/api/queue/cancel', { method: 'POST' });
      if (res.ok) addToast('Campaign cancelled', 'info');
    } catch (err) { addToast('Error cancelling campaign', 'error'); }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/logs/clear', { method: 'POST' });
      if (res.ok) addToast('Logs cleared', 'success');
    } catch (err) { addToast('Failed to clear logs', 'error'); }
  };

  const triggerReloadCalls = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'reload_calls' }));
      addToast('Refreshing call records...', 'info');
    }
  };

  // Helper to format duration to a readable MM:SS layout
  const formatDuration = (durationStr) => {
    if (!durationStr || durationStr === '—' || durationStr === '0') return '—';
    if (typeof durationStr === 'number' || (!String(durationStr).includes(':') && !isNaN(Number(durationStr)))) {
      const totalSec = Math.floor(Number(durationStr));
      if (totalSec <= 0) return '0:00';
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }
    const parts = String(durationStr).split(':');
    if (parts.length >= 2) {
      const min = Math.floor(parseFloat(parts[parts.length - 2]));
      const sec = Math.floor(parseFloat(parts[parts.length - 1]));
      return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }
    return durationStr;
  };

  // Helper to extract full transcript text as a string
  const getTranscriptText = (call) => {
    if (!call) return '';

    // 1. If call_conversation is an array of objects (user_query / bot_response turns)
    if (Array.isArray(call.call_conversation)) {
      return call.call_conversation.map(turn => {
        let lines = [];
        if (turn.user_query && String(turn.user_query).trim()) {
          lines.push(`User: ${String(turn.user_query).trim()}`);
        }
        if (turn.bot_response && String(turn.bot_response).trim()) {
          lines.push(`Bot: ${String(turn.bot_response).trim()}`);
        }
        return lines.join('\n');
      }).filter(Boolean).join('\n');
    }

    // 1b. OmniDimension returns call_conversation as a "<br/>"-separated string
    if (typeof call.call_conversation === 'string' && call.call_conversation.trim()) {
      return call.call_conversation;
    }

    // 1c. Fall back to interactions array (per-turn user_query / bot_response)
    if (Array.isArray(call.interactions) && call.interactions.length > 0) {
      return call.interactions.map(turn => {
        let lines = [];
        if (turn.user_query && String(turn.user_query).trim()) {
          lines.push(`User: ${String(turn.user_query).trim()}`);
        }
        if (turn.bot_response && String(turn.bot_response).trim()) {
          lines.push(`Bot: ${String(turn.bot_response).trim()}`);
        }
        return lines.join('\n');
      }).filter(Boolean).join('\n');
    }

    // 2. Otherwise extract from string fields
    const rawText = call.full_conversation ||
      call.transcript ||
      call.conversation ||
      (call.rawFields && call.rawFields.full_conversation) ||
      '';

    return String(rawText).replace(/\s*\|\s*/g, '\n').trim();
  };

  // Render Transcript dialogue
  const renderTranscript = (text) => {
    if (!text) return <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>No transcript dialogue recorded for this call.</p>;
    const cleanText = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    const lines = cleanText.split('\n').filter(line => line.trim().length > 0);

    return (
      <div className="transcript-box">
        {lines.map((line, idx) => {
          const match = line.match(/^([^:]+):(.*)$/);
          if (match) {
            const speaker = match[1].trim();
            const content = match[2].trim();
            const lowerSpeaker = speaker.toLowerCase();
            const isAgent = lowerSpeaker.includes('agent') || lowerSpeaker.includes('assistant') || lowerSpeaker.includes('llm') || lowerSpeaker.includes('bot');

            return (
              <div key={idx} className="transcript-message">
                <div className={`transcript-speaker ${isAgent ? 'speaker-agent' : 'speaker-user'}`}>
                  {isAgent ? '🤖' : '👤'} {speaker}
                </div>
                <div className="transcript-text">{content}</div>
              </div>
            );
          }
          return (
            <div key={idx} className="transcript-message">
              <div className="transcript-text">{line}</div>
            </div>
          );
        })}
      </div>
    );
  };

  // Helper to find matching call log from OmniDimension by phone number
  const findMatchedCallLog = (item) => {
    const rawNum = item.formattedPhone || item.to_number || item.phone_number || item.to || item.phone || '';
    const cleanNum = String(rawNum).replace(/\D/g, '');
    if (!cleanNum) return null;

    return calls.find(c => {
      const cNum = String(c.to_number || c.phone_number || c.to || '').replace(/\D/g, '');
      return cNum === cleanNum || (cleanNum.length >= 10 && cNum.endsWith(cleanNum.slice(-10)));
    });
  };

  // Combine active queue contacts, current dialing call, and OmniDimension call records into single source
  const allCallRecords = (() => {
    const mapByPhone = new Map();

    // 1. Add historical call records from OmniDimension API
    calls.forEach(c => {
      const phone = c.to_number || c.phone_number || c.to || c.formattedPhone || c.phone || '';
      const cleanPhone = String(phone).replace(/\D/g, '');
      if (cleanPhone) {
        mapByPhone.set(cleanPhone.slice(-10), c);
      }
    });

    // 2. Add activeQueue items (overlaying queue info onto historical if matching)
    activeQueue.forEach(q => {
      const cleanPhone = String(q.formattedPhone || q.phone || '').replace(/\D/g, '');
      if (cleanPhone) {
        const key = cleanPhone.slice(-10);
        const existingCall = mapByPhone.get(key);
        if (existingCall) {
          const isCompleted = (existingCall.call_status || existingCall.status) === 'completed' || Boolean(existingCall.call_conversation || existingCall.transcript);
          mapByPhone.set(key, {
            ...existingCall,
            ...q,
            status: isCompleted ? existingCall.call_status || existingCall.status : q.status,
            call_conversation: existingCall.call_conversation || existingCall.transcript || q.call_conversation
          });
        } else {
          mapByPhone.set(key, q);
        }
      }
    });

    // 3. Always include currentCall if a call is actively dialing right now
    if (currentCall) {
      const cleanPhone = String(currentCall.formattedPhone || currentCall.phone || '').replace(/\D/g, '');
      if (cleanPhone) {
        const key = cleanPhone.slice(-10);
        const existing = mapByPhone.get(key);
        const isCompleted = existing && ((existing.call_status || existing.status) === 'completed' || Boolean(existing.call_conversation || existing.transcript));

        if (!isCompleted) {
          mapByPhone.set(key, {
            ...(existing || {}),
            ...currentCall,
            status: 'in-progress',
            call_status: 'in-progress'
          });
        }
      }
    }

    return Array.from(mapByPhone.values());
  })();

  // Helper to extract interest, college, course, details strictly from real call transcript
  const getCallInterestInfo = (c) => {
    const matched = findMatchedCallLog(c) || c;
    const phone = matched.formattedPhone || matched.to_number || matched.phone_number || matched.to || matched.phone || c.formattedPhone || c.phone || '';
    const name = matched.name || matched.fullName || matched.student_name || c.name || (phone ? `Recipient (${phone})` : 'Recipient');
    const status = (matched.call_status || matched.status || c.status || '').toLowerCase();

    // Extract transcript & conversation text from all possible properties
    const rawTranscript = String(matched.call_conversation || matched.transcript || matched.conversation || c.call_conversation || c.transcript || c.conversation || matched.summary || matched.call_summary || '').trim();
    const hasTranscript = rawTranscript.length > 0;

    // 1. If NO transcript is recorded yet:
    if (!hasTranscript) {
      if (['failed', 'canceled', 'busy', 'no-answer', 'no_answer', 'timeout'].includes(status)) {
        return {
          interestStatus: 'NO_ANSWER',
          college: '—',
          course: '—',
          details: `${name} did not answer call.`
        };
      }
      return {
        interestStatus: 'PENDING',
        college: '—',
        course: '—',
        details: `${name} call pending / no conversation recorded.`
      };
    }

    // 2. Specific outcome keywords for mutually exclusive classification
    const transcriptLower = rawTranscript.toLowerCase();

    const wrongNumberKeywords = [
      'wrong number', 'wrong person', 'invalid number', 'not the right person',
      'wrong contact', 'not my number', 'mistaken number', 'incorrect number', 'does not belong'
    ];

    const alreadyJoinedKeywords = [
      'already joined', 'already enrolled', 'already taken admission', 'already admitted',
      'already taken', 'joined another college', 'joined college', 'joined university',
      'currently studying in another college', 'enrolled in another'
    ];

    const alreadyAppliedKeywords = [
      'already applied', 'applied already', 'application submitted', 'submitted application',
      'already submitted form', 'form already submitted', 'already filled application',
      'filled application', 'applied online', 'application pending'
    ];

    const callbackKeywords = [
      'callback', 'call back', 'call later', 'call me later', 'call tomorrow',
      'reach out later', 'talk later', 'busy right now call later', 'contact later',
      'call again', 'schedule a call', 'call after'
    ];

    const notInterestedKeywords = [
      'not interested', 'no interest', 'dont call', "don't call", 'do not call',
      'no thanks', 'not looking', 'reject', 'cancel', 'not planning', 'no need',
      'doing a job', 'doing job', 'working', 'already working', 'doing work',
      'im working', "i'm working", 'im doing a job', "i'm doing a job", 'employed',
      'not required', 'bad timing', 'stop calling'
    ];

    const interestedKeywords = [
      'interested in college', 'looking for college', 'want admission', 'want to join',
      'tell me fees', 'send details', 'fee structure', 'which college', 'which course',
      'b.tech', 'btech', 'cse', 'ece', 'mba', 'computer science', 'information technology'
    ];

    const isKwWrongNumber = wrongNumberKeywords.some(kw => transcriptLower.includes(kw));
    const isKwAlreadyJoined = alreadyJoinedKeywords.some(kw => transcriptLower.includes(kw));
    const isKwAlreadyApplied = alreadyAppliedKeywords.some(kw => transcriptLower.includes(kw));
    const isKwCallback = callbackKeywords.some(kw => transcriptLower.includes(kw));
    const isKwNotInterested = notInterestedKeywords.some(kw => transcriptLower.includes(kw));

    let finalStatus = 'PENDING';
    let college = 'Not Mentioned in Call';
    let course = 'Not Mentioned in Call';
    let detailsStr = '';

    if (isKwWrongNumber) {
      finalStatus = 'WRONG_NUMBER';
      college = 'Invalid Contact';
      course = 'Invalid Contact';
      detailsStr = `${name} flagged as wrong or invalid phone number.`;
    } else if (isKwAlreadyJoined) {
      finalStatus = 'ALREADY_JOINED';
      college = 'Already Enrolled';
      course = 'Already Enrolled';
      detailsStr = `${name} stated already joined another college / enrolled.`;
    } else if (isKwAlreadyApplied) {
      finalStatus = 'ALREADY_APPLIED';
      college = 'Already Applied';
      course = 'Already Applied';
      detailsStr = `${name} stated already submitted admission application.`;
    } else if (isKwCallback) {
      finalStatus = 'CALLBACK';
      detailsStr = `${name} requested a callback to discuss admission details later.`;
    } else if (isKwNotInterested) {
      finalStatus = 'NOT_INTERESTED';
      college = 'Not Interested';
      course = 'Not Interested';

      if (transcriptLower.includes('doing a job') || transcriptLower.includes('doing job') || transcriptLower.includes('working') || transcriptLower.includes('employed') || transcriptLower.includes('doing work')) {
        detailsStr = `${name} stated currently working / doing a job (Not looking for college).`;
      } else {
        detailsStr = `${name} stated NOT interested in college admissions during call.`;
      }
    } else {
      // Extract College ONLY if mentioned in transcript
      if (transcriptLower.includes('vit') || transcriptLower.includes('vellore')) college = 'VIT Vellore';
      else if (transcriptLower.includes('srm')) college = 'SRM University';
      else if (transcriptLower.includes('iit')) college = 'IIT Hyderabad';
      else if (transcriptLower.includes('cbit') || transcriptLower.includes('chaitanya')) college = 'CBIT Hyderabad';
      else if (transcriptLower.includes('bits') || transcriptLower.includes('pilani')) college = 'BITS Pilani';
      else if (transcriptLower.includes('jntu')) college = 'JNTU Hyderabad';
      else if (transcriptLower.includes('amrita')) college = 'Amrita University';
      else if (transcriptLower.includes('vasavi')) college = 'Vasavi Eng College';
      else if (transcriptLower.includes('vnr') || transcriptLower.includes('vjiet')) college = 'VNR VJIET';
      else if (transcriptLower.includes('griet') || transcriptLower.includes('gokaraju')) college = 'GRIET Hyderabad';
      else if (transcriptLower.includes('kl university') || transcriptLower.includes('klu')) college = 'KL University';
      else if (transcriptLower.includes('gitam')) college = 'Gitam University';
      else if (transcriptLower.includes('manipal')) college = 'Manipal University';

      // Extract Course ONLY if mentioned in transcript
      if (transcriptLower.includes('cse') || transcriptLower.includes('computer science')) course = 'B.Tech CSE';
      else if (transcriptLower.includes('ai') || transcriptLower.includes('data science') || transcriptLower.includes('machine learning') || transcriptLower.includes('aiml')) course = 'AI & Data Science';
      else if (transcriptLower.includes('ece') || transcriptLower.includes('electronics')) course = 'B.Tech ECE';
      else if (transcriptLower.includes('mba') || transcriptLower.includes('management')) course = 'MBA';
      else if (transcriptLower.includes('it') || transcriptLower.includes('information technology')) course = 'B.Tech IT';
      else if (transcriptLower.includes('mech') || transcriptLower.includes('mechanical')) course = 'B.Tech Mech';
      else if (transcriptLower.includes('civil')) course = 'B.Tech Civil';

      const isExplicitlyInterested = interestedKeywords.some(kw => transcriptLower.includes(kw));

      if (isExplicitlyInterested || status === 'completed') {
        finalStatus = 'INTERESTED';
        if (college !== 'Not Mentioned in Call' && course !== 'Not Mentioned in Call') {
          detailsStr = `${name} expressed interest in ${course} at ${college} during call.`;
        } else if (college !== 'Not Mentioned in Call') {
          detailsStr = `${name} expressed interest in admission at ${college} during call.`;
        } else if (course !== 'Not Mentioned in Call') {
          detailsStr = `${name} expressed interest in ${course} during call.`;
        } else {
          detailsStr = `${name} confirmed interest in college admission during call.`;
        }
      } else {
        finalStatus = 'PENDING';
        detailsStr = `${name} call completed.`;
      }
    }

    return {
      interestStatus: finalStatus,
      college,
      course,
      details: detailsStr
    };
  };

  // Product-Level Centralized Call Outcome Resolver:
  // Strictly partitions each call into ONE primary outcome to guarantee zero double-counting.
  const getPrimaryCallStatus = (item) => resolveCallFinalStatus(item);

  // Mutually exclusive predicate helpers to guarantee zero double counting
  const isInterested = (item) => resolveCallFinalStatus(item) === CALL_OUTCOME_STATUS.INTERESTED;
  const isApplicationSent = (item) => resolveCallFinalStatus(item) === CALL_OUTCOME_STATUS.APPLICATION_SENT;
  // Transcript verdict: showed interest in the call (or got the application link) or not
  const isInterestedLead = (item) => isInterested(item) || isApplicationSent(item);
  const isCallback = (item) => resolveCallFinalStatus(item) === CALL_OUTCOME_STATUS.CALLBACK;
  const isNotInterested = (item) => resolveCallFinalStatus(item) === CALL_OUTCOME_STATUS.NOT_INTERESTED;
  const isAlreadyJoined = (item) => resolveCallFinalStatus(item) === CALL_OUTCOME_STATUS.ALREADY_JOINED;
  const isAlreadyApplied = (item) => resolveCallFinalStatus(item) === CALL_OUTCOME_STATUS.ALREADY_APPLIED;
  const isWrongNumber = (item) => resolveCallFinalStatus(item) === CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID;
  const isUnanswered = (item) => resolveCallFinalStatus(item) === CALL_OUTCOME_STATUS.NOT_ANSWERED;
  const isAnswered = (item) => resolveCallFinalStatus(item) !== CALL_OUTCOME_STATUS.NOT_ANSWERED;

  // Google Sheets filter operations
  const filterByDate = (list, filterType, startCustom, endCustom) => {
    if (filterType === 'ALL') return list;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    return list.filter(item => {
      if (!item.callDate || item.callDate === '—') return false;
      const callDate = new Date(item.callDate);
      if (isNaN(callDate.getTime())) return false;

      switch (filterType) {
        case 'TODAY':
          return callDate >= today;
        case 'YESTERDAY':
          return callDate >= yesterday && callDate < today;
        case 'LAST_7_DAYS': {
          const last7 = new Date(today);
          last7.setDate(last7.getDate() - 7);
          return callDate >= last7;
        }
        case 'LAST_30_DAYS': {
          const last30 = new Date(today);
          last30.setDate(last30.getDate() - 30);
          return callDate >= last30;
        }
        case 'CUSTOM': {
          const start = startCustom ? new Date(startCustom) : null;
          const end = endCustom ? new Date(endCustom) : null;
          if (end) end.setHours(23, 59, 59, 999);

          if (start && end) return callDate >= start && callDate <= end;
          if (start) return callDate >= start;
          if (end) return callDate <= end;
          return true;
        }
        default:
          return true;
      }
    });
  };

  const filterBySearch = (list, query) => {
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(item => {
      const fieldsToSearch = [
        item.studentName,
        item.contactNumber,
        item.email,
        item.course,
        item.program,
        item.preferredState,
        item.preferredCity,
        item.universitiesDiscussed,
        item.leadStatus,
        item.interestLevel,
        item.callOutcome,
        item.summary
      ];
      return fieldsToSearch.some(f => String(f || '').toLowerCase().includes(q));
    });
  };

  const filterByStatus = (list, selectedStatus) => {
    if (selectedStatus === 'ALL') return list;
    return list.filter(item => {
      const primary = getPrimaryCallStatus(item);
      if (primary === selectedStatus) return true;
      if (selectedStatus === 'WRONG_NUMBER' && primary === CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID) return true;
      if (selectedStatus === 'UNANSWERED' && primary === CALL_OUTCOME_STATUS.NOT_ANSWERED) return true;
      const status = String(item.leadStatus || '').trim().toUpperCase();
      return status === selectedStatus.toUpperCase();
    });
  };

  const sortCalls = (list, method) => {
    const sorted = [...list];
    return sorted.sort((a, b) => {
      switch (method) {
        case 'DATE_DESC': {
          const dateA = new Date(a.callDate);
          const dateB = new Date(b.callDate);
          if (isNaN(dateA.getTime())) return 1;
          if (isNaN(dateB.getTime())) return -1;
          return dateB - dateA;
        }
        case 'DATE_ASC': {
          const dateA = new Date(a.callDate);
          const dateB = new Date(b.callDate);
          if (isNaN(dateA.getTime())) return 1;
          if (isNaN(dateB.getTime())) return -1;
          return dateA - dateB;
        }
        case 'NAME_ASC':
          return a.studentName.localeCompare(b.studentName);
        case 'NAME_DESC':
          return b.studentName.localeCompare(a.studentName);
        case 'INTEREST_DESC': {
          const levelA = a.interestLevel || '—';
          const levelB = b.interestLevel || '—';
          return levelB.localeCompare(levelA);
        }
        case 'STATUS_ASC':
          return (a.leadStatus || '').localeCompare(b.leadStatus || '');
        default:
          return 0;
      }
    });
  };

  // Helper to get university name by ID dynamically
  const getUniversityName = (uniId) => {
    if (uniId === 'ALL') return 'All Universities';
    const match = universities.find(u => u.id === uniId);
    return match ? match.name : uniId;
  };

  // Helper to format a call record for clean Excel presentation with exact required Google Sheets columns
  const formatCallForExcel = (call, idx) => {
    // 1. Name: taken from dashboard (crucial for unanswered calls where Google Sheet has null/Not provided)
    const isGenericName = (n) => !n || n === '—' || n === 'Student' || n === 'Not provided' || /^recipient\s*\(/i.test(String(n));
    let studentName = call.studentName;
    if (isGenericName(studentName)) {
      if (!isGenericName(call.name)) studentName = call.name;
      else if (!isGenericName(call.student_name)) studentName = call.student_name;
      else if (!isGenericName(call.fullName)) studentName = call.fullName;
      else if (call.rawFields && !isGenericName(call.rawFields.student_name)) studentName = call.rawFields.student_name;
      else if (call.rawFields && !isGenericName(call.rawFields['Student Name'])) studentName = call.rawFields['Student Name'];
      else if (call.rawFields && !isGenericName(call.rawFields.name)) studentName = call.rawFields.name;
      else {
        const cleanPhone = String(call.contactNumber || call.to_number || call.phone_number || '').replace(/\D/g, '').slice(-10);
        if (cleanPhone) {
          const q = activeQueue.find(item => String(item.formattedPhone || item.phone || '').replace(/\D/g, '').slice(-10) === cleanPhone);
          if (q && !isGenericName(q.name)) studentName = q.name;
        }
      }
    }
    if (!studentName || studentName === '—') studentName = call.studentName || 'Student';

    // 2. Phone Number (from Google Sheets raw fields or call record)
    const rawPhone = (call.rawFields && (call.rawFields.to_number || call.rawFields.phone_number))
      || call.contactNumber
      || call.to_number
      || call.phone_number
      || '—';
    const cleanDigits = String(rawPhone).replace(/\D/g, '');
    const phoneNumber = cleanDigits.length >= 10 ? (cleanDigits.length === 10 ? `+91${cleanDigits}` : `+${cleanDigits}`) : (rawPhone || '—');

    // 3. College Name (from Google Sheets college_name / college_interest or dashboard university)
    const uniId = getCallUniversityId(call);
    const uniDisplayName = getUniversityName(uniId);
    const collegeName = (call.rawFields && (call.rawFields.college_name || call.rawFields.college_interest))
      || call.college_name
      || call.preferredUniversity
      || (call.target_college && call.target_college !== 'Not Mentioned in Call' ? call.target_college : '')
      || (call.college && call.college !== 'Not Mentioned in Call' ? call.college : '')
      || uniDisplayName
      || 'MIT WPU';

    // 4. Calls Answered & Calls Not Answered
    const rawCallStatus = String(call.rawFields?.call_status || call.call_status || call.callOutcome || '').toLowerCase();
    const isAns = (rawCallStatus === 'completed' || rawCallStatus === 'answered' || isAnswered(call)) && rawCallStatus !== 'no-answer' && !isUnanswered(call);
    const callsAnswered = isAns ? 'Yes' : 'No';
    const callsNotAnswered = !isAns ? 'Yes' : 'No';

    // Google Sheets verdict flags (Interested, Application Sent, Callback, Already Applied, Already Joined, Not Interested, Wrong / Invalid, Counsellor Follow-up)
    const normalizeFlag = (sheetVal, dashboardFallbackBool) => {
      if (!isAns) return 'No'; // Unanswered calls never have positive outcome flags
      if (sheetVal !== undefined && sheetVal !== null && String(sheetVal).trim() !== '') {
        const s = String(sheetVal).trim().toLowerCase();
        if (s === 'yes' || s === 'true' || s === '1') return 'Yes';
        if (s === 'no' || s === 'false' || s === '0') return 'No';
      }
      return dashboardFallbackBool ? 'Yes' : 'No';
    };

    const rf = call.rawFields || {};

    // Determine clean consolidated Lead Status with visual color cue
    let leadStatusLabel = '❌ Not Answered';
    if (call.status === 'queued' || call.leadStatus === 'QUEUED' || call.final_status === 'QUEUED') {
      leadStatusLabel = '⏳ Queued';
    } else if (isInterested(call)) {
      leadStatusLabel = '🟢 Interested';
    } else if (isApplicationSent(call)) {
      leadStatusLabel = '📩 Application Sent';
    } else if (isCallback(call)) {
      leadStatusLabel = '📞 Callback';
    } else if (isAlreadyApplied(call)) {
      leadStatusLabel = '📝 Already Applied';
    } else if (isAlreadyJoined(call)) {
      leadStatusLabel = '🎓 Already Joined';
    } else if (isNotInterested(call)) {
      leadStatusLabel = '🔴 Not Interested';
    } else if (isWrongNumber(call)) {
      leadStatusLabel = '⚠️ Wrong / Invalid';
    } else if (isAns) {
      leadStatusLabel = '📞 Answered';
    }

    // Helper to test if a key represents one of the standard columns
    const isStandardKey = (key) => {
      const norm = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return ['name', 'fullname', 'studentname', 'student', 'phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact', 'contactnumber', 'email', 'emailid', 'mail', 'mailid', 'state', 'preferredstate', 'stateut', 'district', 'preferredcity', 'city', 'town', 'program', 'course', 'degree', 'branch', 'university', 'college', 'collegename', 'targetcollege', 'preferreduniversity'].includes(norm);
    };

    // Helper to find best matching value for a field from multiple object sources
    const resolveField = (sources, patterns) => {
      for (const src of sources) {
        if (!src || typeof src !== 'object') continue;
        for (const pat of patterns) {
          if (src[pat] !== undefined && src[pat] !== null) {
            const val = String(src[pat]).trim();
            if (val && val !== '—' && val.toLowerCase() !== 'null' && val.toLowerCase() !== 'undefined') return val;
          }
        }
        const srcKeys = Object.keys(src);
        for (const pat of patterns) {
          const cleanPat = pat.toLowerCase().replace(/[^a-z0-9]/g, '');
          for (const k of srcKeys) {
            if (k === 'extraFields' || k === 'rawFields') continue;
            const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanK === cleanPat || (cleanPat.length >= 4 && cleanK.includes(cleanPat))) {
              const val = String(src[k]).trim();
              if (val && val !== '—' && val.toLowerCase() !== 'null' && val.toLowerCase() !== 'undefined') return val;
            }
          }
        }
      }
      return '—';
    };

    // Student & Parent Metadata from Excel Sheet / Google Sheets
    const email = resolveField([call, call.extraFields, rf], ['email', 'email id', 'emailid', 'email address', 'mail', 'mail id', 'student email']);
    const state = resolveField([call, call.extraFields, rf], ['state', 'preferred state', 'preferredstate', 'state ut', 'region', 'province']);
    const district = resolveField([call, call.extraFields, rf], ['district', 'preferred city', 'preferredcity', 'city', 'town', 'location']);
    const program = resolveField([call, call.extraFields, rf], ['program', 'course', 'degree', 'branch', 'specialization', 'target_course']);

    // AI Extracted Intelligence (OmniDimension Variables)
    const graduationStatus = call.graduation_status || rf.graduation_status || call.educationStatus || '—';
    const admissionTimeline = call.admission_timeline || rf.admission_timeline || call.timeline || '—';
    const entranceExam = call.entrance_exam || rf.entrance_exam || call.entranceExam || '—';
    const counsellorFollowup = isCounselorFollowupRequired(call) ? 'Yes' : 'No';
    const liveTransferred = (String(call.call_transferred_status || rf.call_transfered_status || call.transferStatus || '').toLowerCase() === 'yes') ? 'Yes' : 'No';

    // Call Duration & Date
    const rawDur = call.callDuration || call.duration || (rf && rf.call_duration_in_seconds) || '';
    const formattedDuration = rawDur ? (Number(rawDur) > 0 ? `${rawDur}s` : String(rawDur)) : '—';
    const callDateTime = call.callDate || rf.call_date || rf.timestamp || call.timestamp || '—';
    // Call Recording Link
    const rawRec = call.recordingUrl || call.internal_recording_url || call.recording_url || rf.recording_url || call.recording;
    let recordingLink = '—';
    if (rawRec && typeof rawRec === 'string' && rawRec.trim() && rawRec !== 'false' && rawRec !== '—') {
      const trimmed = rawRec.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        recordingLink = trimmed;
      } else if (trimmed.startsWith('/')) {
        recordingLink = `https://backend.omnidim.io${trimmed}`;
      } else {
        recordingLink = trimmed;
      }
    }

    // Call Summary (from Google Sheets call_summary / summary or Omni sentiment_analysis_details)
    const callSummary = (call.sentiment_analysis_details && call.sentiment_analysis_details !== 'Not provided' && call.sentiment_analysis_details !== '—' ? call.sentiment_analysis_details : '')
      || (call.callSummary && call.callSummary !== 'Not provided' && call.callSummary !== '—' ? call.callSummary : '')
      || (rf.call_summary && rf.call_summary !== 'Not provided' && rf.call_summary !== '—' ? rf.call_summary : '')
      || (rf.summary && rf.summary !== 'Not provided' && rf.summary !== '—' ? rf.summary : '')
      || (call.call_summary && call.call_summary !== 'Not provided' && call.call_summary !== '—' ? call.call_summary : '')
      || (call.summary && call.summary !== 'Not provided' && call.summary !== '—' ? call.summary : '')
      || (call.interest_details && call.interest_details !== 'Not provided' && call.interest_details !== '—' ? call.interest_details : '')
      || '—';

    // Call Transcript / Full Conversation
    const rawTranscript = (typeof getTranscriptText === 'function' ? getTranscriptText(call) : '')
      || call.callTranscript
      || rf.full_conversation
      || rf.call_conversation
      || call.call_conversation
      || (Array.isArray(call.interactions) && call.interactions.length > 0
        ? call.interactions.map(it => `${it.user_query ? `User: ${it.user_query}` : ''}${it.user_query && it.bot_response ? ' | ' : ''}${it.bot_response ? `Bot: ${it.bot_response}` : ''}`).filter(Boolean).join('\n')
        : '');
    const callTranscript = rawTranscript ? String(rawTranscript).replace(/<br\s*\/?>/gi, '\n').trim() : '—';

    // Base ordered row object
    const rowObj = {
      'S.No': idx + 1,
      'Full Name': studentName,
      'Phone Number': phoneNumber,
      'Email ID': email,
      'State': state,
      'District': district
    };

    // Dynamically insert any other extra calling sheet columns (e.g. Father Name, Parent Phone, Remarks)
    if (call.extraFields && typeof call.extraFields === 'object') {
      Object.keys(call.extraFields).forEach(k => {
        if (!isStandardKey(k)) {
          const val = call.extraFields[k];
          rowObj[k] = (val !== undefined && val !== null && String(val).trim() !== '') ? String(val).trim() : '—';
        }
      });
    }

    rowObj['Program'] = program !== '—' ? program : (call.course || 'MBA');
    rowObj['University'] = collegeName;

    // Lead Status (Prominent Outcome Column)
    rowObj['Lead Status'] = leadStatusLabel;

    // AI Extracted Variables & Readiness Signals
    rowObj['Graduation Status'] = graduationStatus;
    rowObj['Admission Timeline'] = admissionTimeline;
    rowObj['Entrance Exam'] = entranceExam;
    rowObj['Counsellor Follow-up'] = counsellorFollowup;
    rowObj['Live Transferred'] = liveTransferred;
    rowObj['Call Duration'] = formattedDuration;
    rowObj['Call Date & Time'] = callDateTime;
    rowObj['Call Summary'] = callSummary;
    rowObj['Call Recording URL'] = recordingLink;
    rowObj['Call Transcript / Full Conversation'] = callTranscript;

    return rowObj;
  };

  // Helper to dynamically calculate custom column widths based on content lengths
  const calculateColWidths = (dataRowArray) => {
    if (!dataRowArray || dataRowArray.length === 0) return [];
    const keys = Object.keys(dataRowArray[0]);
    return keys.map(key => {
      let maxLen = String(key || '').length;
      dataRowArray.forEach(row => {
        const val = row[key];
        if (val !== undefined && val !== null) {
          const str = String(val);
          // Split by line to handle multi-line transcripts and summaries
          const lines = str.split(/\r?\n/);
          lines.forEach(line => {
            if (line.length > maxLen) maxLen = line.length;
          });
        }
      });
      const isLargeTextCol = /summary|transcript|conversation/i.test(key);
      const minWidth = Math.max(String(key || '').length + 4, 12);
      const calculatedWidth = maxLen + 3;

      if (isLargeTextCol) {
        // Generous readable width for summary and transcript, up to 120 chars
        return { wch: Math.max(minWidth, Math.min(calculatedWidth, 120)) };
      }
      // Exact dynamic fit for regular columns without truncation
      return { wch: Math.max(minWidth, Math.min(calculatedWidth, 60)) };
    });
  };

  // Export Filtered Records to Excel (respects active university scope and dashboard filters)
  const handleExportFilteredCsv = () => {
    const workbook = XLSX.utils.book_new();
    const activeScopeName = uniScopeLabel;

    // Scoped calls based on university and date filter
    const scopedCalls = dateFilteredCalls;

    // 1. Main Call Analytics Report Sheet (populated with exact required columns and dashboard-recovered names)
    const activeData = finalDashboardList.map((c, i) => formatCallForExcel(c, i));
    const wsActive = XLSX.utils.json_to_sheet(activeData.length > 0 ? activeData : [{ 'Status': 'No call records match the active filters.' }]);
    if (activeData.length > 0) wsActive['!cols'] = calculateColWidths(activeData);
    XLSX.utils.book_append_sheet(workbook, wsActive, "Call Analytics Report");

    // 2. Executive Metrics Summary Sheet
    const getUniSummaryRow = (name, list) => {
      const tot = list.length;
      const ans = list.filter(isAnswered).length;
      const int = list.filter(isInterested).length;
      const appSent = list.filter(isApplicationSent).length;
      const cb = list.filter(isCallback).length;
      const aa = list.filter(isAlreadyApplied).length;
      const aj = list.filter(isAlreadyJoined).length;
      const ni = list.filter(isNotInterested).length;
      const wn = list.filter(isWrongNumber).length;
      const una = list.filter(isUnanswered).length;
      const cf = list.filter(isCounselorFollowupRequired).length;
      const conv = tot > 0 ? `${Math.round((int / tot) * 100)}%` : '0%';

      return {
        'University / Scope': name,
        'Total Dispatched': tot,
        'Calls Answered': ans,
        'Calls Not Answered': una,
        'Interested': int,
        'Application Sent': appSent,
        'Callback': cb,
        'Already Applied': aa,
        'Already Joined': aj,
        'Not Interested': ni,
        'Wrong / Invalid': wn,
        'Counsellor Follow-up': cf,
        'Lead Conversion Rate': conv
      };
    };

    const summaryRows = [
      getUniSummaryRow(`Active Scope (${activeScopeName})`, scopedCalls)
    ];

    if (isAllUniScope) {
      universities.forEach(u => {
        summaryRows.push(getUniSummaryRow(u.name, scopedCalls.filter(c => getCallUniversityId(c) === u.id)));
      });
    } else {
      dashboardUniversityFilter.forEach(id => {
        const u = universities.find(x => x.id === id);
        if (u) summaryRows.push(getUniSummaryRow(u.name, scopedCalls.filter(c => getCallUniversityId(c) === u.id)));
      });
    }

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary['!cols'] = calculateColWidths(summaryRows);
    XLSX.utils.book_append_sheet(workbook, wsSummary, "Outcome Summary");

    // Helper to safely append an outcome sheet with dynamic widths
    const appendOutcomeSheet = (sheetTitle, callsList, emptyMessage) => {
      const data = callsList.map((c, i) => formatCallForExcel(c, i));
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ 'Status': emptyMessage }]);
      if (data.length > 0) {
        ws['!cols'] = calculateColWidths(data);
      }
      XLSX.utils.book_append_sheet(workbook, ws, sheetTitle);
    };

    // 3. Final Status Categories Sheets (strictly mutually exclusive)
    appendOutcomeSheet("Interested", scopedCalls.filter(isInterested), "No interested leads recorded.");
    appendOutcomeSheet("Application Sent", scopedCalls.filter(isApplicationSent), "No WhatsApp application links sent yet.");
    appendOutcomeSheet("Callback", scopedCalls.filter(isCallback), "No callback requests recorded.");
    appendOutcomeSheet("Already Applied", scopedCalls.filter(isAlreadyApplied), "No already-applied records.");
    appendOutcomeSheet("Already Joined", scopedCalls.filter(isAlreadyJoined), "No already-joined records.");
    appendOutcomeSheet("Not Interested", scopedCalls.filter(isNotInterested), "No not-interested records.");
    appendOutcomeSheet("Wrong or Invalid", scopedCalls.filter(isWrongNumber), "No wrong-number records.");
    appendOutcomeSheet("Calls Not Answered", scopedCalls.filter(isUnanswered), "No unanswered calls recorded.");

    // Save workbook
    const cleanScopeName = activeScopeName.replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.writeFile(workbook, `${cleanScopeName}_Call_Analytics_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    addToast(`Exported ${activeScopeName} Excel report with dynamically adjusted columns!`, 'success');
  };

  // Open Detailed Call View
  const openCallModal = (callItem) => {
    setSelectedCall(callItem);
  };

  // Merge Google Sheets data with live outbound call logs from OmniDimension.
  // The LIVE Omni record always wins for transcript/status/duration/recording:
  // if the number already has a Sheets row, the live data is merged OVER it
  // (Sheets keeps academic fields) so the dashboard updates the moment a call ends.
  const mergedCalls = React.useMemo(() => {
    const list = sheetsCalls.map(s => ({ ...s }));
    const idxById = new Map();
    const idxByPhone = new Map();
    list.forEach((r, i) => {
      const rid = String(r.id || '').trim();
      if (rid && !idxById.has(rid)) idxById.set(rid, i);
      const p = String(r.contactNumber || '').replace(/\D/g, '');
      const key = p.length === 10 ? p : p.slice(-10);
      if (key && !idxByPhone.has(key)) idxByPhone.set(key, i);
    });

    // Staged/campaign queue lookup by phone: staged name + exact college called with
    const queueByPhone = new Map();
    activeQueue.forEach(q => {
      const p = String(q.formattedPhone || q.phone || '').replace(/\D/g, '');
      const key = p.length === 10 ? p : p.slice(-10);
      if (key && !queueByPhone.has(key)) queueByPhone.set(key, q);
    });

    const cleanCourse = (v) => (!v || v === 'Not Mentioned in Call' || v === 'Invalid Contact' || v === 'Already Enrolled' || v === 'Already Applied' || v === 'Not Interested') ? '—' : v;
    const cleanCollege = (v) => (!v || v === 'Not Mentioned in Call' || v === 'Invalid Contact') ? '' : v;
    // Primary Status is the badge; Interest Level is the pure transcript verdict
    const levelForStatus = (s) => s === CALL_OUTCOME_STATUS.INTERESTED || s === CALL_OUTCOME_STATUS.APPLICATION_SENT
      ? 'Interested'
      : 'Not Interested';

    calls.forEach(c => {
      const callId = String(c.call_id || c.id || '').trim();
      const phone = String(c.to_number || c.phone_number || c.to || '').replace(/\D/g, '');
      const cleanPhone = phone.length === 10 ? phone : phone.slice(-10);
      if (!cleanPhone) return;

      const queueMatch = queueByPhone.get(cleanPhone) || null;
      const status = (c.call_status || c.status || '').toLowerCase();
      const isCompleted = status === 'completed';

      let outcome = 'No-Answer';
      if (status === 'completed') outcome = 'Answered';
      else if (status === 'busy') outcome = 'Busy';
      else if (status === 'failed') outcome = 'Failed';
      else if (status === 'canceled') outcome = 'Canceled';

      // Staged dialer name wins (Omni user_name is the account holder, not the student)
      const displayName = queueMatch?.name
        || (c.call_context && (c.call_context.student_name || c.call_context.name))
        || c.name || c.studentName || c.fullName
        || `Recipient (${c.to_number || c.phone_number || c.to || cleanPhone})`;

      // Exact college called with: staged campaign college first, then transcript analysis
      const displayCollege = queueMatch?.universityName
        || cleanCollege(c.target_college) || cleanCollege(c.college)
        || cleanCollege(c.preferredUniversity) || '';

      const finalStatus = c.final_status || c.finalStatus || c.interestStatus
        || (isCompleted ? CALL_OUTCOME_STATUS.NOT_INTERESTED : CALL_OUTCOME_STATUS.NOT_ANSWERED);

      const cbReq = c.extracted_variables?.callback_requested;
      const callbackRequired = (cbReq && !/not provided|no|—/i.test(String(cbReq))) ? 'Yes' : 'No';

      // Live overlay: always fresh from this call; academic/Sheets fields filled only if blank
      const liveOverlay = {
        call_conversation: c.call_conversation,
        interactions: c.interactions,
        callDuration: c.call_duration || c.duration || '—',
        duration: c.call_duration || c.duration || '—',
        callOutcome: outcome,
        final_status: finalStatus,
        finalStatus: finalStatus,
        interestStatus: finalStatus,
        leadStatus: finalStatus,
        interestLevel: levelForStatus(finalStatus),
        callbackRequired,
        callDate: c.time_of_call || c.call_date || c.callDate || new Date().toISOString(),
        summary: c.interest_details || c.sentiment_analysis_details || c.summary || '',
        notes: c.interest_details || 'Not provided',
        recordingUrl: c.recording_url || c.recordingUrl || '—',
        internal_recording_url: c.internal_recording_url || '',
        sentiment: c.sentiment_score || c.sentiment || 'Neutral',
        botName: c.bot_name || c.botName || '—'
      };

      // Same call only (matched by call id). Different calls to one recycled
      // number stay separate rows — otherwise another call's verdict would
      // clobber the sheet's curated outcome for its own call.
      const existingIdx = (callId && idxById.get(callId) !== undefined)
        ? idxById.get(callId)
        : undefined;

      if (existingIdx !== undefined) {
        // Sheets row exists: keep its academic fields, overwrite with live call data.
        // Name rule: the CURRENT call's staged/dispatch name always wins over a
        // stale Sheets name (same number can be re-called for different students).
        // Verdict rule: the sheet is the source of truth (OmniDimension writes its
        // own flags there), so on an id-matched merge the sheet's final status
        // always wins over re-guessing from the transcript.
        const prev = list[existingIdx];
        const isGenericName = (n) => !n || n === '—' || n === 'Student' || /^recipient\s*\(/i.test(String(n));
        const sheetVerdict = prev.final_status || prev.finalStatus;
        const keepSheetVerdict = Boolean(sheetVerdict);
        list[existingIdx] = {
          ...prev,
          ...liveOverlay,
          ...(keepSheetVerdict ? {
            final_status: sheetVerdict,
            finalStatus: sheetVerdict,
            interestStatus: sheetVerdict,
            leadStatus: sheetVerdict,
            interestLevel: levelForStatus(sheetVerdict)
          } : {}),
          studentName: !isGenericName(displayName) ? displayName : (!isGenericName(prev.studentName) ? prev.studentName : displayName),
          course: prev.course && prev.course !== '—' ? prev.course : cleanCourse(c.target_course || c.course),
          preferredUniversity: (prev.preferredUniversity && prev.preferredUniversity !== '—') ? prev.preferredUniversity : (displayCollege || '—'),
          universitiesDiscussed: (prev.universitiesDiscussed && prev.universitiesDiscussed !== '—') ? prev.universitiesDiscussed : (displayCollege || '—')
        };
      } else {
        list.push({
          ...c,
          id: callId || `omni-${Date.now()}-${cleanPhone}`,
          studentName: displayName,
          contactNumber: c.to_number || c.phone_number || c.to || `+91${cleanPhone}`,
          email: '—',
          program: '—',
          course: cleanCourse(c.target_course || c.course),
          preferredState: '—',
          preferredCity: '—',
          leadStatus: finalStatus,
          interestLevel: levelForStatus(finalStatus),
          final_status: finalStatus,
          finalStatus: finalStatus,
          counselorRequired: 'No',
          callbackRequired,
          callDate: c.time_of_call || c.call_date || c.callDate || new Date().toISOString(),
          callDuration: c.call_duration || c.duration || '—',
          duration: c.call_duration || c.duration || '—',
          callOutcome: outcome,
          summary: c.interest_details || c.sentiment_analysis_details || c.summary || '',
          notes: c.interest_details || 'Not provided',
          entranceExam: '—',
          educationStatus: '—',
          recordingUrl: c.recording_url || c.recordingUrl || '—',
          internal_recording_url: c.internal_recording_url || '',
          transferStatus: 'No',
          preferredUniversity: displayCollege || '—',
          universitiesDiscussed: displayCollege || '—',
          sentiment: c.sentiment_score || c.sentiment || 'Neutral',
          botName: c.bot_name || c.botName || '—'
        });
      }
    });

    return list;
  }, [sheetsCalls, calls, activeQueue]);

  // Dynamic Call University ID Helper: checks against configured universities array.
  // Exact staged/transcript college wins; fuzzy scan checks specific colleges
  // before the generic Vidyavision fallback (its name appears in every note).
  // All comparisons are punctuation-insensitive so sheet values like "MIT WPU"
  // still match a saved college named "MIT - WPU".
  const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const getCallUniversityId = (c) => {
    if (!c) return 'vidyavision';
    const bot = String(c.botName || c.bot_name || (c.rawFields && c.rawFields.bot_name) || '').toLowerCase();
    const prefUni = String(c.preferredUniversity || c.preferred_university || (c.rawFields && c.rawFields.preferred_university) || '').toLowerCase();
    const discussed = String(c.universitiesDiscussed || c.universities_discussed || (c.rawFields && c.rawFields.universities_discussed) || '').toLowerCase();
    const summary = String(c.summary || c.call_summary || '').toLowerCase();
    const notes = String(c.notes || c.additional_notes || '').toLowerCase();
    const combined = `${bot} ${prefUni} ${discussed} ${summary} ${notes}`;

    // 1. Exact college name match on the explicit fields
    for (const u of universities) {
      const uname = u.name.toLowerCase().trim();
      const unameKey = normKey(uname);
      if ((prefUni && (prefUni === uname || normKey(prefUni) === unameKey)) || (discussed && (discussed === uname || normKey(discussed) === unameKey))) return u.id;
    }

    // 2. Fuzzy scan: specific colleges first, generic fallback last
    const ordered = [...universities].sort((a, b) => {
      const aGen = a.id === 'vidyavision' || /vidyavision|vision/.test(a.id) ? 1 : 0;
      const bGen = b.id === 'vidyavision' || /vidyavision|vision/.test(b.id) ? 1 : 0;
      return aGen - bGen;
    });
    const normCombined = normKey(combined);
    for (const u of ordered) {
      const uName = normKey(u.name.toLowerCase().replace('university', '').trim());
      const uId = normKey(u.id);
      if ((uId.length >= 3 && normCombined.includes(uId)) || (uName.length >= 3 && normCombined.includes(uName))) {
        return u.id;
      }
    }
    return 'vidyavision';
  };

  // Format campaign contacts with all rich call intelligence, matching the exact columns of the Excel Analytics Report
  const formatCampaignContactsForExport = (camp) => {
    if (!camp || !Array.isArray(camp.contacts) || camp.contacts.length === 0) return [];
    const contacts = camp.contacts;

    // Helper to test if a key represents one of the standard columns
    const isStandardKey = (key) => {
      const norm = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return ['name', 'fullname', 'studentname', 'student', 'phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact', 'contactnumber', 'email', 'emailid', 'mail', 'mailid', 'state', 'preferredstate', 'stateut', 'district', 'preferredcity', 'city', 'town', 'program', 'course', 'degree', 'branch', 'university', 'college', 'collegename', 'targetcollege', 'preferreduniversity'].includes(norm);
    };

    // Collect all unique extra field keys across all contacts to maintain column alignment
    const extraFieldKeys = [];
    contacts.forEach(c => {
      if (c.extraFields && typeof c.extraFields === 'object') {
        Object.keys(c.extraFields).forEach(k => {
          if (!isStandardKey(k) && !extraFieldKeys.includes(k)) {
            extraFieldKeys.push(k);
          }
        });
      }
    });

    return contacts.map((c, i) => {
      const cleanPhone = String(c.formattedPhone || c.phone || '').replace(/\D/g, '').slice(-10);

      // Find matching call in mergedCalls, calls, or sheetsCalls
      let matchedCall = null;
      if (cleanPhone) {
        const candidateCalls = (mergedCalls || []).filter(call => {
          const p = String(call.contactNumber || call.to_number || call.phone_number || call.to || call.rawFields?.to_number || call.rawFields?.phone_number || '').replace(/\D/g, '').slice(-10);
          return p === cleanPhone;
        });

        if (candidateCalls.length === 1) {
          matchedCall = candidateCalls[0];
        } else if (candidateCalls.length > 1) {
          const campUni = String(camp.universityName || camp.universityId || '').toLowerCase();
          const uniMatch = candidateCalls.find(call => {
            const u = String(call.preferredUniversity || call.college_name || call.target_college || call.universitiesDiscussed || '').toLowerCase();
            return campUni && u && (campUni.includes(u) || u.includes(campUni));
          });

          if (uniMatch) {
            matchedCall = uniMatch;
          } else {
            const campTime = new Date(c.timestamp || camp.startedAt || 0).getTime();
            candidateCalls.sort((a, b) => {
              const tA = new Date(a.callDate || a.timestamp || 0).getTime();
              const tB = new Date(b.callDate || b.timestamp || 0).getTime();
              return Math.abs(tA - campTime) - Math.abs(tB - campTime);
            });
            matchedCall = candidateCalls[0];
          }
        }

        if (!matchedCall && Array.isArray(calls)) {
          matchedCall = calls.find(call => {
            const p = String(call.to_number || call.phone_number || call.to || '').replace(/\D/g, '').slice(-10);
            return p === cleanPhone;
          });
        }

        if (!matchedCall && Array.isArray(sheetsCalls)) {
          matchedCall = sheetsCalls.find(call => {
            const p = String(call.contactNumber || call.rawFields?.to_number || '').replace(/\D/g, '').slice(-10);
            return p === cleanPhone;
          });
        }
      }

      const isGenericName = (n) => !n || n === '—' || n === 'Student' || n === 'Not provided' || /^recipient\s*\(/i.test(String(n));
      const studentName = !isGenericName(c.name) ? c.name : (!isGenericName(matchedCall?.studentName) ? matchedCall.studentName : (matchedCall?.name || c.name || 'Student'));

      const cStatus = String(c.status || '').toLowerCase();
      const cOutcome = String(c.callOutcome || '').toLowerCase();
      const isContactUnanswered = cStatus === 'no-answer' || cStatus === 'unanswered' || cStatus === 'failed' || cStatus === 'busy' || cOutcome.includes('no answer') || cOutcome.includes('no-answer');

      const rf = matchedCall?.rawFields || {};
      const ev = matchedCall?.extracted_variables || {};

      let resolvedStatus = undefined;
      const cleanOutcomeUpper = String(c.callOutcome || '').toUpperCase().trim();
      if (cStatus === 'queued') {
        resolvedStatus = 'QUEUED';
      } else if (cleanOutcomeUpper === 'INTERESTED' || cleanOutcomeUpper.includes('INTEREST')) {
        resolvedStatus = CALL_OUTCOME_STATUS.INTERESTED;
      } else if (cleanOutcomeUpper === 'CALLBACK' || cleanOutcomeUpper.includes('CALLBACK')) {
        resolvedStatus = CALL_OUTCOME_STATUS.CALLBACK;
      } else if (cleanOutcomeUpper.includes('NOT INTERESTED')) {
        resolvedStatus = CALL_OUTCOME_STATUS.NOT_INTERESTED;
      } else if (cleanOutcomeUpper.includes('APPLICATION SENT')) {
        resolvedStatus = CALL_OUTCOME_STATUS.APPLICATION_SENT;
      } else if (cleanOutcomeUpper.includes('ALREADY JOINED')) {
        resolvedStatus = CALL_OUTCOME_STATUS.ALREADY_JOINED;
      } else if (cleanOutcomeUpper.includes('ALREADY APPLIED')) {
        resolvedStatus = CALL_OUTCOME_STATUS.ALREADY_APPLIED;
      } else if (cleanOutcomeUpper.includes('WRONG') || cleanOutcomeUpper.includes('INVALID')) {
        resolvedStatus = CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID;
      } else if (isContactUnanswered) {
        resolvedStatus = CALL_OUTCOME_STATUS.NOT_ANSWERED;
      }

      // Merge extra fields ensuring all discovered keys exist with default '—'
      const mergedExtraFields = {};
      extraFieldKeys.forEach(k => {
        const val = c.extraFields?.[k] || matchedCall?.extraFields?.[k] || rf?.[k];
        mergedExtraFields[k] = (val !== undefined && val !== null && String(val).trim() !== '') ? String(val).trim() : '—';
      });

      // Robust resolver for Call Recording URL
      const rawRec = c.recordingUrl || c.recording_url || matchedCall?.internal_recording_url || matchedCall?.recordingUrl || matchedCall?.recording_url || rf.recording_url || matchedCall?.recording;
      let resolvedRecordingUrl = '—';
      if (rawRec && typeof rawRec === 'string' && rawRec.trim() && rawRec !== 'false' && rawRec !== '—') {
        const trimmed = rawRec.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) resolvedRecordingUrl = trimmed;
        else if (trimmed.startsWith('/')) resolvedRecordingUrl = `https://backend.omnidim.io${trimmed}`;
        else resolvedRecordingUrl = trimmed;
      }

      // Robust resolver for Call Summary
      let resolvedSummary = c.callSummary || c.summary || '';
      if (!resolvedSummary || resolvedSummary === '—' || resolvedSummary === 'Completed' || resolvedSummary === 'Not provided') {
        resolvedSummary = matchedCall?.sentiment_analysis_details || rf.call_summary || rf.summary || matchedCall?.call_summary || matchedCall?.summary || matchedCall?.interest_details || '—';
        if (resolvedSummary === 'Not provided') resolvedSummary = '—';
      }

      // Robust resolver for Call Transcript
      let resolvedTranscript = c.callTranscript || c.call_conversation || c.transcript || '';
      if (!resolvedTranscript || resolvedTranscript === '—') {
        if (typeof matchedCall?.call_conversation === 'string' && matchedCall.call_conversation.trim()) {
          resolvedTranscript = matchedCall.call_conversation.replace(/<br\s*\/?>/gi, '\n').trim();
        } else if (Array.isArray(matchedCall?.call_conversation)) {
          resolvedTranscript = matchedCall.call_conversation.map(t => `${t.user_query ? `User: ${t.user_query}` : ''}${t.user_query && t.bot_response ? '\n' : ''}${t.bot_response ? `Bot: ${t.bot_response}` : ''}`).filter(Boolean).join('\n');
        } else if (Array.isArray(matchedCall?.interactions) && matchedCall.interactions.length > 0) {
          resolvedTranscript = matchedCall.interactions.map(t => `${t.user_query ? `User: ${t.user_query}` : ''}${t.user_query && t.bot_response ? '\n' : ''}${t.bot_response ? `Bot: ${t.bot_response}` : ''}`).filter(Boolean).join('\n');
        } else if (rf.full_conversation || rf.call_conversation) {
          resolvedTranscript = String(rf.full_conversation || rf.call_conversation).replace(/<br\s*\/?>/gi, '\n').replace(/\s*\|\s*/g, '\n').trim();
        }
      }

      const synthesizedCall = {
        ...(matchedCall || {}),
        studentName,
        name: studentName,
        fullName: studentName,
        contactNumber: c.formattedPhone || (cleanPhone ? (cleanPhone.length === 10 ? `+91${cleanPhone}` : `+${cleanPhone}`) : '') || matchedCall?.contactNumber || '—',
        to_number: c.formattedPhone || c.phone || matchedCall?.to_number,
        phone_number: c.phone || matchedCall?.phone_number,
        preferredUniversity: c.universityName || camp.universityName || matchedCall?.preferredUniversity || '—',
        college_name: c.universityName || camp.universityName || matchedCall?.college_name || rf.college_name || '—',
        target_college: c.universityName || camp.universityName || matchedCall?.target_college || '—',
        college: c.universityName || camp.universityName || matchedCall?.college || '—',
        program: c.program || c.course || camp.course || matchedCall?.program || matchedCall?.course || '—',
        course: c.course || c.program || camp.course || matchedCall?.course || matchedCall?.program || '—',
        email: c.email || matchedCall?.email || c.extraFields?.EmailID || c.extraFields?.Email || rf.EmailID || rf.Email || '—',
        preferredState: c.state || matchedCall?.preferredState || c.extraFields?.State || rf.State || '—',
        preferredCity: c.district || matchedCall?.preferredCity || c.extraFields?.District || rf.District || rf.City || '—',
        extraFields: mergedExtraFields,
        status: resolvedStatus === 'QUEUED' ? 'queued' : (isContactUnanswered ? 'no-answer' : (matchedCall?.status || c.status || 'completed')),
        call_status: resolvedStatus === 'QUEUED' ? 'queued' : (isContactUnanswered ? 'no-answer' : (matchedCall?.call_status || c.status || 'completed')),
        callOutcome: isContactUnanswered ? 'No Answer' : (matchedCall?.callOutcome || c.callOutcome || 'Completed'),
        final_status: resolvedStatus || (isContactUnanswered ? CALL_OUTCOME_STATUS.NOT_ANSWERED : (matchedCall?.final_status || matchedCall?.finalStatus)),
        finalStatus: resolvedStatus || (isContactUnanswered ? CALL_OUTCOME_STATUS.NOT_ANSWERED : (matchedCall?.final_status || matchedCall?.finalStatus)),
        leadStatus: resolvedStatus || (isContactUnanswered ? CALL_OUTCOME_STATUS.NOT_ANSWERED : (matchedCall?.leadStatus || matchedCall?.finalStatus)),
        graduation_status: c.graduationStatus || matchedCall?.graduation_status || rf.graduation_status || ev.graduation_status || matchedCall?.educationStatus || c.extraFields?.['Graduation Status'] || c.extraFields?.Graduation || '—',
        admission_timeline: c.admissionTimeline || matchedCall?.admission_timeline || rf.admission_timeline || ev.admission_timeline || matchedCall?.timeline || c.extraFields?.['Admission Timeline'] || '—',
        entrance_exam: c.entranceExam || matchedCall?.entrance_exam || rf.entrance_exam || ev.entrance_exam || matchedCall?.entranceExam || c.extraFields?.['Entrance Exam'] || '—',
        call_transferred_status: (c.transferStatus === 'Yes' || matchedCall?.call_transferred_status === 'Yes' || rf.call_transfered_status === 'Yes' || ev.call_transfered_status === 'Yes' || matchedCall?.transferStatus === 'Yes') ? 'Yes' : 'No',
        callDuration: (matchedCall?.callDuration && matchedCall.callDuration !== '—') ? matchedCall.callDuration : (c.callDuration || '—'),
        duration: (matchedCall?.duration && matchedCall.duration !== '—') ? matchedCall.duration : (c.callDuration || '—'),
        callDate: matchedCall?.callDate || matchedCall?.time_of_call || rf.call_date || c.timestamp || camp.startedAt || '—',
        summary: resolvedSummary,
        callSummary: resolvedSummary,
        sentiment_analysis_details: resolvedSummary,
        recordingUrl: resolvedRecordingUrl,
        internal_recording_url: resolvedRecordingUrl,
        recording_url: resolvedRecordingUrl,
        callTranscript: resolvedTranscript,
        call_conversation: resolvedTranscript,
        interactions: matchedCall?.interactions || c.interactions || []
      };

      const row = formatCallForExcel(synthesizedCall, i);
      if (cStatus === 'queued' || resolvedStatus === 'QUEUED') {
        row['Lead Status'] = '⏳ Queued';
      }
      return row;
    });
  };

  // Export full campaign contacts and results to formatted Excel workbook (.xlsx) with all rich analytics columns
  const handleDownloadCampaignExcel = (camp) => {
    if (!camp) return;
    try {
      const workbook = XLSX.utils.book_new();
      const contacts = camp.contacts || [];

      // 1. Leads Table Sheet (with full comprehensive columns identical to Excel Report)
      const rows = formatCampaignContactsForExport(camp);
      const wsContacts = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'Status': 'No contacts in campaign' }]);
      if (rows.length > 0) wsContacts['!cols'] = calculateColWidths(rows);
      XLSX.utils.book_append_sheet(workbook, wsContacts, "Campaign Leads");

      // 2. Overview Sheet
      const answeredCount = rows.filter(r => !String(r['Lead Status'] || '').includes('Not Answered') && !String(r['Lead Status'] || '').includes('Queued')).length;
      const interestedCount = rows.filter(r => String(r['Lead Status'] || '').includes('Interested')).length;
      const callbackCount = rows.filter(r => String(r['Lead Status'] || '').includes('Callback')).length;
      const unansweredCount = rows.filter(r => String(r['Lead Status'] || '').includes('Not Answered')).length;
      const queuedCount = rows.filter(r => String(r['Lead Status'] || '').includes('Queued')).length;

      const summaryRows = [
        { 'Metric': 'Campaign Name', 'Value': camp.name || 'Untitled Campaign' },
        { 'Metric': 'Target University', 'Value': camp.universityName || '—' },
        { 'Metric': 'Target Course', 'Value': camp.course || '—' },
        { 'Metric': 'Total Contacts', 'Value': contacts.length },
        { 'Metric': 'Status', 'Value': (camp.status || 'COMPLETED').toUpperCase() },
        { 'Metric': 'Started At', 'Value': camp.startedAt ? new Date(camp.startedAt).toLocaleString('en-IN') : '—' },
        { 'Metric': 'Completed At', 'Value': camp.completedAt ? new Date(camp.completedAt).toLocaleString('en-IN') : '—' },
        { 'Metric': 'Calls Answered', 'Value': answeredCount },
        { 'Metric': 'Calls Not Answered', 'Value': unansweredCount },
        { 'Metric': 'Interested Leads', 'Value': interestedCount },
        { 'Metric': 'Callbacks Requested', 'Value': callbackCount },
        { 'Metric': 'Queued / Pending', 'Value': queuedCount }
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 24 }, { wch: 38 }];
      XLSX.utils.book_append_sheet(workbook, wsSummary, "Overview");

      // 3. Category sheets for fast counselor follow-up
      const appendCategorySheet = (sheetTitle, filterFn) => {
        const catRows = rows.filter(filterFn);
        if (catRows.length > 0) {
          const ws = XLSX.utils.json_to_sheet(catRows);
          ws['!cols'] = calculateColWidths(catRows);
          XLSX.utils.book_append_sheet(workbook, ws, sheetTitle);
        }
      };

      appendCategorySheet("Interested", r => String(r['Lead Status'] || '').includes('Interested'));
      appendCategorySheet("Callback", r => String(r['Lead Status'] || '').includes('Callback'));
      appendCategorySheet("Application Sent", r => String(r['Lead Status'] || '').includes('Application Sent'));
      appendCategorySheet("Calls Not Answered", r => String(r['Lead Status'] || '').includes('Not Answered'));

      const safeName = (camp.name || 'campaign').replace(/[^a-zA-Z0-9_-]/g, '_');
      XLSX.writeFile(workbook, `${safeName}_Report.xlsx`);
      addToast(`Downloaded Excel report for "${camp.name}".`, 'success');
    } catch (err) {
      console.error('Failed to export campaign Excel:', err);
      handleDownloadCampaignCsv(camp);
    }
  };

  // Export campaign CSV with full columns identical to Excel
  const handleDownloadCampaignCsv = (campOrId, campaignName) => {
    let camp = null;
    if (typeof campOrId === 'object' && campOrId !== null) {
      camp = campOrId;
    } else {
      camp = campaigns.find(c => c.id === campOrId) || { id: campOrId, name: campaignName, contacts: [] };
    }

    const safeName = (camp.name || campaignName || 'campaign').replace(/[^a-zA-Z0-9_-]/g, '_');

    try {
      const rows = formatCampaignContactsForExport(camp);
      if (rows && rows.length > 0) {
        const ws = XLSX.utils.json_to_sheet(rows);
        const csvContent = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeName}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        addToast(`Downloaded CSV report for "${camp.name || campaignName || 'campaign'}".`, 'success');
        return;
      }
    } catch (err) {
      console.error('Failed to generate CSV client-side:', err);
    }

    // Fallback to server route if client generation could not run
    const link = document.createElement('a');
    link.href = `/api/campaigns/${camp.id || campOrId}/export`;
    link.download = `${safeName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast(`Downloading report for "${camp.name || campaignName || 'campaign'}"...`, 'info');
  };

  // Compute stats dynamically for every university in configured universities array
  const uniStats = React.useMemo(() => {
    const createBreakdown = () => ({
      total: 0,
      answered: 0,
      interested: 0,
      applicationSent: 0,
      callback: 0,
      notInterested: 0,
      alreadyJoined: 0,
      alreadyApplied: 0,
      wrongNumber: 0,
      unanswered: 0,
      counselorFollowup: 0
    });

    const stats = {
      ALL: createBreakdown()
    };
    universities.forEach(u => {
      stats[u.id] = createBreakdown();
    });

    mergedCalls.forEach(c => {
      const uid = getCallUniversityId(c);
      const outcome = resolveCallFinalStatus(c);
      const hasCounselor = isCounselorFollowupRequired(c);

      stats.ALL.total++;
      if (outcome === CALL_OUTCOME_STATUS.NOT_ANSWERED) stats.ALL.unanswered++;
      else stats.ALL.answered++;

      if (outcome === CALL_OUTCOME_STATUS.INTERESTED) stats.ALL.interested++;
      else if (outcome === CALL_OUTCOME_STATUS.APPLICATION_SENT) stats.ALL.applicationSent++;
      else if (outcome === CALL_OUTCOME_STATUS.CALLBACK) stats.ALL.callback++;
      else if (outcome === CALL_OUTCOME_STATUS.ALREADY_APPLIED) stats.ALL.alreadyApplied++;
      else if (outcome === CALL_OUTCOME_STATUS.ALREADY_JOINED) stats.ALL.alreadyJoined++;
      else if (outcome === CALL_OUTCOME_STATUS.NOT_INTERESTED) stats.ALL.notInterested++;
      else if (outcome === CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID) stats.ALL.wrongNumber++;

      if (hasCounselor) stats.ALL.counselorFollowup++;

      if (!stats[uid]) stats[uid] = createBreakdown();

      stats[uid].total++;
      if (outcome === CALL_OUTCOME_STATUS.NOT_ANSWERED) stats[uid].unanswered++;
      else stats[uid].answered++;

      if (outcome === CALL_OUTCOME_STATUS.INTERESTED) stats[uid].interested++;
      else if (outcome === CALL_OUTCOME_STATUS.APPLICATION_SENT) stats[uid].applicationSent++;
      else if (outcome === CALL_OUTCOME_STATUS.CALLBACK) stats[uid].callback++;
      else if (outcome === CALL_OUTCOME_STATUS.ALREADY_APPLIED) stats[uid].alreadyApplied++;
      else if (outcome === CALL_OUTCOME_STATUS.ALREADY_JOINED) stats[uid].alreadyJoined++;
      else if (outcome === CALL_OUTCOME_STATUS.NOT_INTERESTED) stats[uid].notInterested++;
      else if (outcome === CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID) stats[uid].wrongNumber++;

      if (hasCounselor) stats[uid].counselorFollowup++;
    });

    return stats;
  }, [mergedCalls, universities]);

  // Filter mergedCalls by selected universities (multi-select scope)
  const universityFilteredCalls = React.useMemo(() => {
    if (dashboardUniversityFilter.includes('ALL') || dashboardUniversityFilter.length === 0) return mergedCalls;
    return mergedCalls.filter(c => dashboardUniversityFilter.includes(getCallUniversityId(c)));
  }, [mergedCalls, dashboardUniversityFilter]);

  // Date Filtered Calls (Base subset for dashboard, using university-filtered base)
  const dateFilteredCalls = filterByDate(universityFilteredCalls, dateFilter, customStartDate, customEndDate);

  // Count metrics from date-filtered subset (strictly mutually exclusive per call!)
  const totalDispatchedCount = dateFilteredCalls.length;
  const answeredCount = dateFilteredCalls.filter(isAnswered).length;
  const unansweredCount = dateFilteredCalls.filter(isUnanswered).length;
  const interestedCount = dateFilteredCalls.filter(isInterested).length;
  const applicationSentCount = dateFilteredCalls.filter(isApplicationSent).length;
  const callbackCount = dateFilteredCalls.filter(isCallback).length;
  const alreadyAppliedCount = dateFilteredCalls.filter(isAlreadyApplied).length;
  const alreadyJoinedCount = dateFilteredCalls.filter(isAlreadyJoined).length;
  const notInterestedCount = dateFilteredCalls.filter(isNotInterested).length;
  const wrongNumberCount = dateFilteredCalls.filter(isWrongNumber).length;

  // Secondary metric: Counsellor Follow-up (separate action, does not affect primary counts)
  const counselorFollowupCount = dateFilteredCalls.filter(isCounselorFollowupRequired).length;

  // AI Extracted Student Profile Signals (OmniDimension Variables)
  const finalYearGradCount = dateFilteredCalls.filter(c => {
    const g = String(c.graduation_status || c.rawFeedback?.graduation_status || '').toLowerCase();
    return g.includes('final');
  }).length;
  const completedGradCount = dateFilteredCalls.filter(c => {
    const g = String(c.graduation_status || c.rawFeedback?.graduation_status || '').toLowerCase();
    return g.includes('complete');
  }).length;

  const immediateTimelineCount = dateFilteredCalls.filter(c => {
    const t = String(c.admission_timeline || c.rawFeedback?.admission_timeline || c.timeline || '').toLowerCase();
    return t.includes('immediate') || t.includes('2026') || t.includes('this');
  }).length;
  const nextYearTimelineCount = dateFilteredCalls.filter(c => {
    const t = String(c.admission_timeline || c.rawFeedback?.admission_timeline || c.timeline || '').toLowerCase();
    return t.includes('next') || t.includes('2027') || t.includes('future');
  }).length;

  const liveTransferredCount = dateFilteredCalls.filter(c => {
    const s = String(c.call_transfered_status || c.call_transferred_status || c.transferStatus || c.rawFeedback?.call_transfered_status || '').toLowerCase();
    return s === 'yes' || s === 'true' || s === 'transferred';
  }).length;

  const entranceExamCount = dateFilteredCalls.filter(c => {
    const e = String(c.entrance_exam || c.rawFeedback?.entrance_exam || '').trim().toLowerCase();
    return e && e !== 'na' && e !== '—' && e !== 'none' && e !== 'not provided';
  }).length;

  // Filter by selected KPI card / Chart Segment / AI Signal
  const getKpiFilteredCalls = () => {
    switch (dashboardFilter) {
      case CALL_OUTCOME_STATUS.INTERESTED:
        return dateFilteredCalls.filter(isInterested);
      case CALL_OUTCOME_STATUS.APPLICATION_SENT:
        return dateFilteredCalls.filter(isApplicationSent);
      case CALL_OUTCOME_STATUS.CALLBACK:
        return dateFilteredCalls.filter(isCallback);
      case CALL_OUTCOME_STATUS.ALREADY_APPLIED:
        return dateFilteredCalls.filter(isAlreadyApplied);
      case CALL_OUTCOME_STATUS.ALREADY_JOINED:
        return dateFilteredCalls.filter(isAlreadyJoined);
      case CALL_OUTCOME_STATUS.NOT_INTERESTED:
        return dateFilteredCalls.filter(isNotInterested);
      case CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID:
      case 'WRONG_NUMBER':
        return dateFilteredCalls.filter(isWrongNumber);
      case CALL_OUTCOME_STATUS.NOT_ANSWERED:
      case 'UNANSWERED':
        return dateFilteredCalls.filter(isUnanswered);
      case 'ANSWERED':
        return dateFilteredCalls.filter(isAnswered);
      case 'COUNSELOR_FOLLOWUP':
        return dateFilteredCalls.filter(isCounselorFollowupRequired);
      case 'GRAD_FINAL_YEAR':
        return dateFilteredCalls.filter(c => String(c.graduation_status || c.rawFeedback?.graduation_status || '').toLowerCase().includes('final'));
      case 'GRAD_COMPLETED':
        return dateFilteredCalls.filter(c => String(c.graduation_status || c.rawFeedback?.graduation_status || '').toLowerCase().includes('complete'));
      case 'TIMELINE_IMMEDIATE':
        return dateFilteredCalls.filter(c => {
          const t = String(c.admission_timeline || c.rawFeedback?.admission_timeline || c.timeline || '').toLowerCase();
          return t.includes('immediate') || t.includes('2026') || t.includes('this');
        });
      case 'TIMELINE_NEXT_YEAR':
        return dateFilteredCalls.filter(c => {
          const t = String(c.admission_timeline || c.rawFeedback?.admission_timeline || c.timeline || '').toLowerCase();
          return t.includes('next') || t.includes('2027') || t.includes('future');
        });
      case 'EXAM_MENTIONED':
        return dateFilteredCalls.filter(c => {
          const e = String(c.entrance_exam || c.rawFeedback?.entrance_exam || '').trim().toLowerCase();
          return e && e !== 'na' && e !== '—' && e !== 'none' && e !== 'not provided';
        });
      case 'LIVE_TRANSFERRED':
        return dateFilteredCalls.filter(c => {
          const s = String(c.call_transfered_status || c.call_transferred_status || c.transferStatus || c.rawFeedback?.call_transfered_status || '').toLowerCase();
          return s === 'yes' || s === 'true' || s === 'transferred';
        });
      case 'ALL':
      default:
        return dateFilteredCalls;
    }
  };

  const kpiFiltered = getKpiFilteredCalls();

  // Filter by Dropdown Lead Status
  const statusFiltered = filterByStatus(kpiFiltered, statusFilter);

  // Filter by Search Query
  const searchFiltered = filterBySearch(statusFiltered, dashboardSearch);

  // Sort the final list
  const finalDashboardList = sortCalls(searchFiltered, sortBy);

  // Extract unique statuses dynamically from mergedCalls
  const uniqueStatuses = Array.from(new Set(
    mergedCalls
      .map(item => String(item.leadStatus || '').trim())
      .filter(status => status && status !== '—' && status !== 'NA')
  ));

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="brand" onClick={() => setActiveTab('dashboard')}>
          <i className="brand-icon">◈</i>
          <span>VIDYA <b style={{ color: '#818cf8' }}>VISION</b></span>
        </div>

        <div className="nav-links">
          <button
            className={`nav-button ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <PieChart size={18} />
            Call Dashboard
          </button>

          <button
            className={`nav-button ${activeTab === 'dispatch' ? 'active' : ''}`}
            onClick={() => setActiveTab('dispatch')}
          >
            <PhoneCall size={18} />
            Call Dialer
          </button>

          <button
            className={`nav-button ${activeTab === 'calls' ? 'active' : ''}`}
            onClick={() => setActiveTab('calls')}
          >
            <FileText size={18} />
            Recent Calls
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content">

        {/* ========================================== */}
        {/* TAB 1: DISPATCH CONSOLE (Replaces Registration) */}
        {/* ========================================== */}
        {activeTab === 'dispatch' && (
          <div className="dialer-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', minHeight: 'calc(100vh - 120px)', position: 'relative', paddingBottom: '320px' }}>
            <div className="page-header">
              <h1>Sequential Voice Call Dispatcher</h1>
              <p>Upload a list of student contacts, select their target university bot, and set sequence call delays. The bots will call each student sequentially.</p>
            </div>

            {/* College Management & Delete Header Section */}
            <div className="card" style={{ borderLeft: '4px solid var(--accent)', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(241, 101, 34, 0.03) 100%)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                    🎓 Saved Colleges ({universities.length})
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Manage your colleges below — edit details and courses, or delete unwanted ones. College and course for calling are picked in Step 2.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '0.5rem 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    onClick={() => setShowManageColleges(prev => !prev)}
                    title={showManageColleges ? 'Collapse saved colleges' : 'Expand saved colleges'}
                  >
                    {showManageColleges ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {showManageColleges ? 'Hide Colleges' : `Show Colleges (${universities.length})`}
                  </button>

                  <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }} onClick={() => { resetCollegeForm(); setShowCollegeModal(true); }}>
                    <Plus size={15} /> Add New College
                  </button>
                </div>
              </div>

              {/* Saved Colleges Cards Grid with Delete Buttons */}
              {showManageColleges && (
                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>
                    Click <b>EDIT</b> to update details/courses, <b style={{ color: '#ef4444' }}>DELETE</b> to permanently remove a college:
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem' }}>
                    {universities.map(uni => {
                      return (
                        <div
                          key={uni.id}
                          style={{
                            backgroundColor: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            padding: '0.9rem',
                            display: 'flex',
                            flexDirection: 'column',
                            justify: 'space-between',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                              <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                🎓 {uni.name}
                              </h4>
                            </div>

                            {Array.isArray(uni.courses) && uni.courses.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', margin: '0.3rem 0' }}>
                                {uni.courses.map(course => (
                                  <span key={course} style={{ fontSize: '0.7rem', fontWeight: '700', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#818cf8', padding: '0.15rem 0.5rem', borderRadius: '20px', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                                    📚 {course}
                                  </span>
                                ))}
                              </div>
                            )}

                            {uni.place && (
                              <p style={{ fontSize: '0.78rem', color: '#818cf8', margin: '0.15rem 0', fontWeight: '600' }}>
                                📍 {uni.place}
                              </p>
                            )}

                            {uni.websiteUrl && (
                              <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.2rem' }}>
                                🔗 {uni.websiteUrl}
                              </p>
                            )}

                            {uni.description && (
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                "{uni.description}"
                              </p>
                            )}

                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                              🕒 Created: {uni.createdAt ? new Date(uni.createdAt).toLocaleString() : '—'}
                            </p>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid var(--border)', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem', fontWeight: '700' }}
                                onClick={() => handleEditCollege(uni)}
                                title={`Edit ${uni.name} details and link`}
                              >
                                ✏️ Edit
                              </button>

                              <button
                                type="button"
                                className="btn btn-danger-outline"
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.3rem 0.65rem',
                                  color: '#ef4444',
                                  borderColor: 'rgba(239, 68, 68, 0.5)',
                                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                  fontWeight: '700'
                                }}
                                disabled={deletingCollegeId === uni.id}
                                onClick={() => handleDeleteCollege(uni)}
                                title={`Delete ${uni.name}`}
                              >
                                <Trash2 size={13} /> {deletingCollegeId === uni.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* If campaign is NOT running, show the progressive setup steps */}
            {!campaignState.isRunning && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* STEP 1: UPLOAD DATA CARD */}
                <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--accent)', color: 'white', width: '24px', height: '24px', borderRadius: '50%', fontSize: '0.85rem', fontWeight: 'bold' }}>1</span>
                    Upload calling data / recipient list
                  </h3>

                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                    <button
                      className={`btn ${inputMode === 'excel' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                      onClick={() => setInputMode('excel')}
                    >
                      <FileSpreadsheet size={16} />
                      Excel / CSV Upload
                    </button>

                    <button
                      className={`btn ${inputMode === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                      onClick={() => setInputMode('manual')}
                    >
                      <User size={16} />
                      Single Number Input
                    </button>

                    <button
                      className={`btn ${inputMode === 'bulk' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                      onClick={() => setInputMode('bulk')}
                    >
                      <Users size={16} />
                      Bulk Paste Text
                    </button>
                  </div>

                  {/* Mode 1: Excel Upload */}
                  {inputMode === 'excel' && (
                    <div>
                      {uploadedFileInfo || tempContacts.length > 0 ? (
                        <div className="uploaded-file-card">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <div className="file-icon-badge">
                              <FileSpreadsheet size={26} style={{ color: '#2dd4bf' }} />
                            </div>

                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                                <h4 style={{ fontSize: '0.98rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                  {uploadedFileInfo ? uploadedFileInfo.fileName : (tempContacts.some(c => c.source === 'campaign') ? 'Contacts from Campaign & Uploads' : 'Imported Contacts')}
                                </h4>
                                <span className="status-pill completed" style={{ fontSize: '0.7rem' }}>
                                  <CheckCircle2 size={12} /> DATA IMPORTED
                                </span>
                              </div>

                              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Extracted: <b style={{ color: '#818cf8' }}>{tempContacts.length} Total Contacts</b>
                                {uploadedFileInfo && ` • Size: ${uploadedFileInfo.fileSize} • Uploaded at ${uploadedFileInfo.uploadedAt}`}
                              </p>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#059669', borderColor: '#10b981' }}
                                onClick={() => addMoreFileInputRef.current?.click()}
                                title="Upload an Excel or CSV file to append more numbers to this batch"
                              >
                                <Plus size={14} /> Add Numbers from Excel
                              </button>

                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                                onClick={() => fileInputRef.current?.click()}
                                title="Replace existing list with a fresh file"
                              >
                                <Upload size={14} /> Replace File
                              </button>

                              <button
                                type="button"
                                className="btn btn-danger-outline"
                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                                onClick={handleRemoveUploadedFile}
                                title="Clear contacts"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept=".xlsx, .xls, .csv"
                            style={{ display: 'none' }}
                          />
                          <input
                            type="file"
                            ref={addMoreFileInputRef}
                            onChange={handleAddMoreFileUpload}
                            accept=".xlsx, .xls, .csv"
                            style={{ display: 'none' }}
                          />
                        </div>
                      ) : (
                        <div className="dropzone" onClick={() => fileInputRef.current?.click()}>
                          <Upload size={32} style={{ color: 'var(--accent)', marginBottom: '0.5rem' }} />
                          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.25rem' }}>Upload Excel (.xlsx, .xls) or CSV file</h3>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Auto-detects phone & name columns. Optional names are handled seamlessly.</p>
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept=".xlsx, .xls, .csv"
                            style={{ display: 'none' }}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                        <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }} onClick={downloadSampleCsv}>
                          <Download size={14} /> Download Sample CSV Template
                        </button>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Name is optional. Phone requires 10-digits.
                        </span>
                      </div>

                      {recentFiles.length > 0 && (
                        <div style={{ marginTop: '1.25rem', padding: '0.85rem 1rem', borderRadius: '10px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <RotateCcw size={14} style={{ color: '#818cf8' }} /> Recent Excel Uploads & Resume Calling
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{recentFiles.length} file{recentFiles.length > 1 ? 's' : ''} saved</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {recentFiles.map(rf => (
                              <div key={rf.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderRadius: '8px', backgroundColor: 'rgba(99, 102, 241, 0.04)', border: '1px solid rgba(99, 102, 241, 0.15)', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div>
                                  <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>📄 {rf.fileName}</div>
                                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                    {rf.totalContacts} contacts • Last called: Contact #{rf.lastCompletedIndex || 0}
                                    {rf.lastCompletedIndex > 0 && rf.lastCompletedIndex < rf.totalContacts && (
                                      <span style={{ color: '#059669', fontWeight: '700', marginLeft: '0.4rem' }}>
                                        ({rf.totalContacts - rf.lastCompletedIndex} remaining)
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  {rf.lastCompletedIndex > 0 && rf.lastCompletedIndex < rf.totalContacts ? (
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem', backgroundColor: '#059669', borderColor: '#10b981' }}
                                      onClick={() => handleLoadRecentFile(rf, rf.lastCompletedIndex + 1)}
                                      title={`Resume calling remaining contacts from #${rf.lastCompletedIndex + 1} to #${rf.totalContacts}`}
                                    >
                                      Resume from #{rf.lastCompletedIndex + 1}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                                    onClick={() => handleLoadRecentFile(rf, 1)}
                                  >
                                    Load All ({rf.totalContacts})
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                  {/* Mode 2: Manual Single Contact */}
                  {inputMode === 'manual' && (
                    <form onSubmit={handleAddSingleContact}>
                      <div className="form-grid">
                        <div className="form-group">
                          <label className="form-label">Phone Number (Required) *</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="text"
                              placeholder="9876543210 (10 digits)"
                              value={singlePhone}
                              onChange={(e) => setSinglePhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                              className="form-input"
                              style={{ paddingLeft: '2.5rem' }}
                              maxLength={10}
                            />
                            <Phone size={16} style={{ position: 'absolute', left: '0.9rem', top: '0.85rem', color: 'var(--text-muted)' }} />
                          </div>
                          {phoneError && <span style={{ color: 'var(--error)', fontSize: '0.78rem', marginTop: '0.2rem', display: 'block' }}>{phoneError}</span>}
                        </div>

                        <div className="form-group">
                          <label className="form-label">Recipient Name (Optional)</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="text"
                              placeholder="e.g. Ramesh (Optional)"
                              value={singleName}
                              onChange={(e) => setSingleName(e.target.value)}
                              className="form-input"
                              style={{ paddingLeft: '2.5rem' }}
                            />
                            <User size={16} style={{ position: 'absolute', left: '0.9rem', top: '0.85rem', color: 'var(--text-muted)' }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>If provided, bot addresses person by name.</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <button type="submit" className="btn btn-primary">
                          <Plus size={16} /> Import Contact
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Mode 3: Bulk Paste Text */}
                  {inputMode === 'bulk' && (
                    <div>
                      <label className="form-label">Paste Phone Numbers (Optional Name after comma/tab):</label>
                      <textarea
                        className="form-input"
                        rows={4}
                        placeholder={"9876543210, Ramesh Kumar\n9123456789, Priya\n9988776655"}
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        style={{ fontFamily: 'var(--mono)', fontSize: '0.85rem' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Format: Number, Name OR line by line numbers</span>
                        <button className="btn btn-primary" onClick={handleProcessBulkText}>
                          Process & Import Numbers
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CHOOSE OR ADD FROM EXISTING CAMPAIGNS */}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '1.25rem', paddingTop: '1.25rem' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      padding: '1.1rem 1.25rem',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(99, 102, 241, 0.05)',
                      border: '1px dashed rgba(99, 102, 241, 0.4)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '10px',
                          backgroundColor: 'rgba(99, 102, 241, 0.15)',
                          color: '#818cf8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.25rem',
                          flexShrink: 0
                        }}>
                          📁
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                            Choose or Add from Existing Campaigns
                          </h4>
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Re-target or build a new campaign using student contacts from any previously run campaign.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.86rem', padding: '0.55rem 1.15rem' }}
                        onClick={() => setShowPastCampaignsModal(true)}
                      >
                        <FolderOpen size={16} /> Choose from Existing Campaigns ({campaigns.length})
                      </button>
                    </div>
                  </div>
                </div>

                {/* STEP 2 & 3: SELECT UNIVERSITY & DELAY (SHOWN IF TEMP CONTACTS ARE LOADED) */}
                {tempContacts.length > 0 && (
                  <div className="card" style={{ borderLeft: '4px solid #818cf8', animation: 'fadeIn 0.25s ease-out' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#818cf8', color: 'white', width: '24px', height: '24px', borderRadius: '50%', fontSize: '0.85rem', fontWeight: 'bold' }}>2</span>
                        Configure Calling Settings for {tempContacts.length} Contacts
                      </h3>
                      <button className="btn btn-danger-outline" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setTempContacts([])}>
                        Cancel
                      </button>
                    </div>

                    {/* Active Contacts summary banner with Add More Files button */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1.25rem', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.88rem', color: '#1b3b6f', fontWeight: '700' }}>
                          👥 Current Staging Batch: {tempContacts.length} contacts
                        </span>
                        {tempContacts.some(c => c.source === 'campaign') && (
                          <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', fontWeight: '700', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                            Includes Past Campaign Contacts
                          </span>
                        )}
                        {tempContacts.some(c => c.source === 'excel') && (
                          <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#047857', fontWeight: '700', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                            Includes Uploaded Excel Contacts
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#ffffff', borderColor: '#cbd5e1', fontWeight: '600' }}
                          onClick={() => addMoreFileInputRef.current?.click()}
                          title="Upload an Excel or CSV file to add numbers to this campaign"
                        >
                          <FileSpreadsheet size={15} style={{ color: '#059669' }} />
                          + Upload Excel/CSV to Add More Numbers
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#ffffff', borderColor: '#cbd5e1', fontWeight: '600' }}
                          onClick={() => setShowPastCampaignsModal(true)}
                          title="Pick more students from existing campaigns"
                        >
                          <FolderOpen size={15} style={{ color: '#818cf8' }} />
                          + Add More from Existing Campaigns
                        </button>
                      </div>
                    </div>

                    {/* Campaign Name Input */}
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: '10px', backgroundColor: 'rgba(99, 102, 241, 0.04)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                      <label className="form-label" style={{ marginBottom: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>🏷️ Campaign Name (Optional):</span>
                        {campaignCustomName && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }}
                            onClick={() => setCampaignCustomName('')}
                          >
                            Reset Default Name
                          </button>
                        )}
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder={
                          selectedUniversity && universities.find(u => u.id === selectedUniversity)
                            ? `${universities.find(u => u.id === selectedUniversity).name} - ${selectedCourse || 'Admissions'} Campaign (${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`
                            : 'e.g. MBA Outreach 2026 Phase 1'
                        }
                        value={campaignCustomName}
                        onChange={(e) => setCampaignCustomName(e.target.value)}
                        style={{ fontSize: '0.92rem', fontWeight: '600' }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
                        Leave blank to auto-generate from college name & date, or enter your own custom campaign name.
                      </span>
                    </div>

                    {/* University Selector (searchable dropdown — scales to many colleges) */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <label className="form-label" style={{ marginBottom: '0.75rem', display: 'block' }}>Select Target University ({universities.length}):</label>
                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px', maxWidth: '420px' }}>
                          <Search size={15} style={{ position: 'absolute', left: '0.8rem', top: '0.8rem', color: 'var(--text-muted)' }} />
                          <input
                            className="form-input"
                            value={uniSearchDialer}
                            onChange={(e) => setUniSearchDialer(e.target.value)}
                            placeholder={`Search ${universities.length} colleges...`}
                            style={{ paddingLeft: '2.3rem' }}
                          />
                        </div>
                        <select
                          className="form-input"
                          value={selectedUniversity}
                          onChange={(e) => {
                            setSelectedUniversity(e.target.value);
                            setSelectedCourse('');
                            const picked = universities.find(u => u.id === e.target.value);
                            if (picked) addToast(`Selected ${picked.name} for sequence calling.`, 'success');
                          }}
                          style={{ flex: '2 1 280px', minWidth: '220px', padding: '0.65rem 0.9rem', fontSize: '0.92rem', fontWeight: '600', cursor: 'pointer' }}
                        >
                          {universities
                            .filter(u => {
                              const q = uniSearchDialer.trim().toLowerCase();
                              if (!q) return true;
                              return `${u.name} ${u.place || ''} ${u.languages || ''}`.toLowerCase().includes(q);
                            })
                            .map((uni) => (
                              <option key={uni.id} value={uni.id}>
                                🎓 {uni.name}{uni.place ? ` — ${uni.place}` : ''}{uni.status === 'inactive' ? ' (inactive)' : ''}
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* Selected college summary */}
                      {(() => {
                        const sel = universities.find(u => u.id === selectedUniversity);
                        if (!sel) return <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>No college matches your search. Clear search or add a new college above.</p>;
                        return (
                          <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', border: sel.status === 'inactive' ? '1px solid rgba(244,63,94,0.4)' : '1px solid var(--border)', backgroundColor: 'var(--bg-card)', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <GraduationCap size={22} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '0.15rem' }} />
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '0.95rem' }}>{sel.name}</strong>
                                <span className={`status-badge-mini ${sel.status || 'active'}`}>{(sel.status || 'active').toUpperCase()}</span>
                              </div>
                              {sel.place && <p style={{ fontSize: '0.8rem', color: '#818cf8', margin: '0.15rem 0', fontWeight: '600' }}>📍 {sel.place}</p>}
                              {sel.websiteUrl && <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0.1rem 0' }}>🔗 {sel.websiteUrl}</p>}
                              {sel.description && <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontStyle: 'italic' }}>"{sel.description}"</p>}
                              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>🗣️ {sel.languages || 'English, Hindi, Telugu'} • 🤖 Agent #{sel.agentId || 270604}</p>
                              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.15rem 0 0' }}>🕒 Created: {sel.createdAt ? new Date(sel.createdAt).toLocaleString() : '—'}</p>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Inactive University warning message */}
                      {(() => {
                        const sel = universities.find(u => u.id === selectedUniversity);
                        if (sel && sel.status === 'inactive') {
                          return (
                            <div style={{ marginTop: '1rem', backgroundColor: 'var(--error-glow)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '0.75rem 1rem', borderRadius: '8px', color: '#fb7185', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                              <AlertCircle size={16} />
                              <span><b>{sel.name}</b> is currently offline/inactive. Please select an active university to proceed with staging.</span>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Course picker (courses added on the college) */}
                      {(() => {
                        const sel = universities.find(u => u.id === selectedUniversity);
                        const courses = sel && Array.isArray(sel.courses) ? sel.courses : [];
                        return (
                          <div style={{ marginTop: '1rem' }}>
                            <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                              Select Course {courses.length > 0 ? `(${courses.length} available)` : ''}:
                            </label>
                            <select
                              className="form-input"
                              value={selectedCourse}
                              onChange={(e) => setSelectedCourse(e.target.value)}
                              style={{ maxWidth: '420px', padding: '0.6rem 0.9rem', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' }}
                            >
                              <option value="">📚 General — no specific course (agent asks caller)</option>
                              {courses.map(course => (
                                <option key={course} value={course}>📚 {course}</option>
                              ))}
                            </select>

                            {/* Dynamic Voice Bot Route indicator */}
                            <div style={{
                              marginTop: '0.65rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.45rem 0.85rem',
                              borderRadius: '8px',
                              fontSize: '0.82rem',
                              fontWeight: '600',
                              backgroundColor: isUgCourse(selectedCourse) ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                              color: isUgCourse(selectedCourse) ? '#059669' : '#6366f1',
                              border: isUgCourse(selectedCourse) ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)'
                            }}>
                              <span>🤖 <b>Voice Bot Assigned:</b> {isUgCourse(selectedCourse) ? 'UG Admission Assistant (#270740)' : 'PG Admission Assistant (#270604)'}</span>
                              <span style={{
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                backgroundColor: isUgCourse(selectedCourse) ? '#10b981' : '#6366f1',
                                color: '#fff',
                                textTransform: 'uppercase',
                                letterSpacing: '0.03em'
                              }}>
                                {isUgCourse(selectedCourse) ? 'UG Bot' : 'PG Bot'}
                              </span>
                            </div>

                            {courses.length === 0 && (
                              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                                No courses added for {sel ? sel.name : 'this college'} yet — add them via Edit on its card. The agent will ask the caller instead.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Step 3: Call Buffer Delay - Hide for Single Number input */}
                    {tempInputMode !== 'manual' && (
                      <div style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#818cf8', color: 'white', width: '24px', height: '24px', borderRadius: '50%', fontSize: '0.85rem', fontWeight: 'bold' }}>3</span>
                          <label className="form-label" style={{ margin: 0 }}>Select Call Buffer Delay between calls:</label>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0.75rem 2rem' }}>
                          Wait delay between dialing sequential contacts to allow telephony line cooldown.
                        </p>
                        <div style={{ marginLeft: '2rem' }}>
                          <select
                            className="form-input"
                            style={{ padding: '0.5rem 1rem', width: '200px', fontSize: '0.9rem' }}
                            value={callDelay}
                            onChange={(e) => setCallDelay(e.target.value === '' ? '' : Number(e.target.value))}
                          >
                            <option value="">Select delay...</option>
                            <option value={0}>0 seconds (Instant)</option>
                            <option value={2}>2 seconds</option>
                            <option value={3}>3 seconds</option>
                            <option value={5}>5 seconds</option>
                            <option value={10}>10 seconds</option>
                          </select>
                          {callDelay === '' && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--error)', marginLeft: '1rem' }}>
                              * Delay selection required
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Range Selector / Resume Calling (e.g. 201 to remaining) */}
                    {tempContacts.length > 1 && (
                      <div style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                          <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '700' }}>
                            <Sliders size={16} style={{ color: '#818cf8' }} /> Select Contact Range to Call (Resume Calling):
                          </label>
                          <span style={{ fontSize: '0.82rem', color: '#6366f1', fontWeight: '700' }}>
                            Staging {getStageRangeData().selectedCount} of {tempContacts.length} contacts
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>From Contact #</span>
                            <input
                              type="number"
                              min={1}
                              max={tempContacts.length}
                              value={stageRangeStart}
                              onChange={(e) => setStageRangeStart(e.target.value)}
                              className="form-input"
                              style={{ width: '90px', padding: '0.4rem 0.6rem', fontWeight: '700', textAlign: 'center' }}
                            />
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>To Contact #</span>
                            <input
                              type="number"
                              min={1}
                              max={tempContacts.length}
                              placeholder={`End (${tempContacts.length})`}
                              value={stageRangeEnd}
                              onChange={(e) => setStageRangeEnd(e.target.value)}
                              className="form-input"
                              style={{ width: '100px', padding: '0.4rem 0.6rem', fontWeight: '700', textAlign: 'center' }}
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(blank = to end)</span>
                          </div>

                          {/* Quick Presets */}
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: '0.76rem', padding: '0.3rem 0.65rem' }}
                              onClick={() => { setStageRangeStart('1'); setStageRangeEnd(''); }}
                            >
                              All (1–{tempContacts.length})
                            </button>
                            {tempContacts.length > 100 && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.76rem', padding: '0.3rem 0.65rem' }}
                                onClick={() => { setStageRangeStart('1'); setStageRangeEnd('100'); }}
                              >
                                First 100
                              </button>
                            )}
                            {tempContacts.length > 200 && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.76rem', padding: '0.3rem 0.65rem' }}
                                onClick={() => { setStageRangeStart('201'); setStageRangeEnd(''); }}
                                title="Resume calling from contact 201 to end"
                              >
                                201 to End
                              </button>
                            )}
                            {(() => {
                              const matched = uploadedFileInfo?.fileName ? recentFiles.find(f => f.fileName === uploadedFileInfo.fileName) : null;
                              if (matched && matched.lastCompletedIndex > 0 && matched.lastCompletedIndex < tempContacts.length) {
                                const nextIdx = matched.lastCompletedIndex + 1;
                                return (
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ fontSize: '0.76rem', padding: '0.3rem 0.65rem', backgroundColor: '#059669', borderColor: '#10b981' }}
                                    onClick={() => { setStageRangeStart(String(nextIdx)); setStageRangeEnd(''); }}
                                  >
                                    Resume from #{nextIdx}
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.4rem 0 0 0.5rem' }}>
                          💡 Pro-tip: To resume dialing an Excel sheet (e.g. 500 contacts where 200 were completed), enter <b>201</b> in "From Contact #" to dial remaining contacts. Excel row numbers will align automatically!
                        </p>
                      </div>
                    )}

                    {/* Stage Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleStageTempContacts}
                        disabled={(universities.find(u => u.id === selectedUniversity)?.status === 'inactive') || (tempInputMode !== 'manual' && callDelay === '')}
                      >
                        <CheckCircle size={16} /> Stage {tempContacts.length > 1 ? `${getStageRangeData().selectedCount} ` : ''}Contacts for Calling
                      </button>
                    </div>

                  </div>
                )}

                {/* STAGED QUEUE CARD - SHOWING BIGGER & WIDER */}
                <div className="card" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Users size={22} style={{ color: 'var(--accent)' }} />
                      <h2 style={{ fontSize: '1.3rem', fontWeight: '700', margin: 0 }}>
                        Staged Calling Queue ({stagedContacts.length})
                      </h2>
                    </div>

                    {stagedContacts.length > 0 && (
                      <button className="btn btn-danger-outline" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={clearStagedContacts}>
                        <Trash2 size={14} /> Clear Queue
                      </button>
                    )}
                  </div>

                  {stagedContacts.length === 0 ? (
                    <div className="empty-state" style={{ padding: '3.5rem 1rem' }}>
                      <AlertCircle size={36} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
                      <h4 style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--text-primary)' }}>Staging Queue is Empty</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Use Step 1 above to upload an Excel file, paste text, or input a single number, then configure and stage it.</p>
                    </div>
                  ) : (
                    <div>
                      <div className="staged-table-container" style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                        <table className="calls-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Mobile Number</th>
                              <th>Student Name</th>
                              <th>Target University</th>
                              <th>Course</th>
                              <th>University ID</th>
                              <th>Staged Status</th>
                              <th style={{ textAlign: 'center' }}>Remove</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stagedContacts.map((c, idx) => (
                              <tr key={c.id}>
                                <td>
                                  <span style={{ fontWeight: '700' }}>{idx + 1}</span>
                                  {c.originalIndex && (
                                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#6366f1', fontWeight: '600' }} title="Contact number in original uploaded file">
                                      #{c.originalIndex} (Row {c.excelRow || (c.originalIndex + 1)})
                                    </span>
                                  )}
                                </td>
                                <td style={{ fontFamily: 'var(--mono)', fontWeight: '700', fontSize: '0.92rem' }}>{c.formattedPhone}</td>
                                <td style={{ fontWeight: '500' }}>
                                  {c.hasName || c.name ? (
                                    <span>👤 {c.name}</span>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                      Generic Recipient
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <span className="college-badge">
                                    🎓 {c.universityName || 'Vidyavision'}
                                  </span>
                                </td>
                                <td style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                                  {c.course ? `📚 ${c.course}` : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>General</span>}
                                </td>
                                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.85rem' }}>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem',
                                    fontWeight: '600',
                                    backgroundColor: isUgCourse(c.course) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                                    color: isUgCourse(c.course) ? '#059669' : '#6366f1',
                                    border: isUgCourse(c.course) ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(99, 102, 241, 0.25)'
                                  }}>
                                    🤖 #{isUgCourse(c.course) ? '270740' : (c.agentId || '270604')}
                                    <span style={{ fontSize: '0.7rem' }}>({isUgCourse(c.course) ? 'UG' : 'PG'})</span>
                                  </span>
                                </td>
                                <td>
                                  <span className="status-pill completed" style={{ fontSize: '0.72rem' }}>
                                    Staged
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button
                                    className="btn btn-danger-outline"
                                    style={{ padding: '0.2rem 0.5rem', borderRadius: '4px' }}
                                    onClick={() => removeStagedContact(c.id)}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Start Campaign Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(27, 59, 111, 0.03)', padding: '1rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Selected University: <b>{universities.find(u => u.id === selectedUniversity)?.name || 'Vidyavision'}</b>
                          </span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Course: <b>{selectedCourse || stagedContacts[0]?.course || 'General'}</b>
                          </span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Assigned Voice Bot: <b style={{ color: isUgCourse(selectedCourse || stagedContacts[0]?.course) ? '#059669' : '#6366f1' }}>
                              {isUgCourse(selectedCourse || stagedContacts[0]?.course) ? '🤖 UG Admission Bot (#270740)' : '🤖 PG Admission Bot (#270604)'}
                            </b>
                          </span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Call Buffer Delay: <b>{callDelay !== '' ? `${callDelay} seconds` : '2 seconds (Default)'}</b>
                          </span>
                        </div>

                        <button
                          className="btn btn-primary"
                          style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
                          onClick={handleStartCampaign}
                        >
                          <Play size={18} /> Start Sequential Calling Campaign ({stagedContacts.length})
                        </button>
                      </div>

                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Banner to resume remaining contacts if campaign stopped/incomplete */}
            {!campaignState.isRunning && activeQueue.length > 0 && campaignState.completedCount < activeQueue.length && (
              <div className="card" style={{ borderLeft: '4px solid #f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <RotateCcw size={22} style={{ color: '#d97706' }} />
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                      Incomplete Campaign: {activeQueue.length - campaignState.completedCount} Uncalled Contacts Remaining
                    </h4>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Completed {campaignState.completedCount} of {activeQueue.length} contacts. You can resume calling uncalled contacts (#{campaignState.completedCount + 1} to #{activeQueue.length}).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', backgroundColor: '#059669', borderColor: '#10b981' }}
                  onClick={handleStageRemainingContacts}
                  title="Stage remaining uncalled contacts into dialer"
                >
                  <RotateCcw size={15} /> Stage Remaining (#{campaignState.completedCount + 1} to #{activeQueue.length})
                </button>
              </div>
            )}

            {/* ACTIVE CAMPAIGN DASHBOARD - Displays when calling campaign is active */}
            {campaignState.isRunning && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* Active Campaign Info Header Panel */}
                <div className="card" style={{ borderLeft: '5px solid var(--accent)', background: 'linear-gradient(135deg, rgba(241, 101, 34, 0.04) 0%, rgba(99, 102, 241, 0.04) 100%)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                      <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Volume2 size={22} className="animate-pulse" style={{ color: 'var(--accent)' }} />
                        Sequential Outbound Campaign Active
                      </h2>
                      <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Dialing sequential list using <b>{campaignState.universityName || 'Selected Bot'}</b> (Agent ID: <b>#{campaignState.agentId || 'N/A'}</b> • <span style={{ color: isUgCourse(campaignState.course) ? '#10b981' : '#818cf8', fontWeight: '700' }}>{isUgCourse(campaignState.course) ? 'UG Bot' : 'PG Bot'}</span>)
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      {campaignState.totalCount > campaignState.completedCount && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.82rem',
                            fontWeight: '700',
                            borderColor: '#818cf8',
                            color: '#4f46e5',
                            backgroundColor: 'rgba(99, 102, 241, 0.08)'
                          }}
                          onClick={handleStageRemainingContacts}
                          title="Stage remaining uncalled contacts into staging queue to re-dial or adjust settings"
                        >
                          <RotateCcw size={15} /> Stage Remaining (#{campaignState.completedCount + 1}–#{campaignState.totalCount})
                        </button>
                      )}

                      {campaignState.isPaused ? (
                        <button className="btn btn-primary" onClick={handleResumeCampaign}>
                          <Play size={16} /> Resume Campaign
                        </button>
                      ) : (
                        <button className="btn btn-secondary" onClick={handlePauseCampaign}>
                          <Pause size={16} /> Pause Campaign
                        </button>
                      )}

                      <button className="btn btn-danger-outline" onClick={handleCancelCampaign} style={{ padding: '0.5rem 1rem' }}>
                        <Square size={16} /> Stop Campaign Queue
                      </button>
                    </div>
                  </div>

                  {/* Progress Indicators */}
                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '180px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.35rem' }}>
                        <span>Calling Contact Progress:</span>
                        <span>{campaignState.completedCount} / {campaignState.totalCount} ({Math.round((campaignState.completedCount / campaignState.totalCount) * 100)}%)</span>
                      </div>
                      <div className="progress-bar-bg" style={{ height: '10px' }}>
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${Math.min(100, Math.round((campaignState.completedCount / campaignState.totalCount) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Campaign Stats Grid */}
                  <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '0.75rem 1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Answered</span>
                      <b style={{ fontSize: '1.5rem', color: '#2dd4bf' }}>{campaignState.answeredCount}</b>
                    </div>
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '0.75rem 1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>No Answer</span>
                      <b style={{ fontSize: '1.5rem', color: '#fb7185' }}>{campaignState.unansweredCount}</b>
                    </div>
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '0.75rem 1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Remaining</span>
                      <b style={{ fontSize: '1.5rem', color: 'var(--text-primary)' }}>{campaignState.totalCount - campaignState.completedCount}</b>
                    </div>
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '0.75rem 1rem', borderRadius: '8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Delay Set</span>
                      <b style={{ fontSize: '1.25rem', color: 'var(--accent)' }}>{campaignState.delayMs / 1000}s</b>
                    </div>
                  </div>
                </div>

                {/* CURRENT ACTIVE CALL CARD (IF A CALL IS CURRENTLY PLACING) */}
                {currentCall && (
                  <div className="card" style={{ borderLeft: '4px solid #2dd4bf', backgroundColor: 'rgba(45, 212, 191, 0.03)', animation: 'pulse 3s infinite' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0d9488' }}>
                      <span className="status-dot" style={{ backgroundColor: '#2dd4bf', boxShadow: '0 0 10px #2dd4bf' }} />
                      Actively Dialing Recipient Now
                    </h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <h4 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                          {currentCall.name || 'Generic Student'}
                        </h4>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                          📞 {currentCall.formattedPhone}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="status-pill in-progress">
                          DIALING...
                        </span>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          Awaiting call pick up / outcome...
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* LIVE CAMPAIGN QUEUE TABLE */}
                <div className="card" style={{ width: '100%' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                    Dialing Queue Contacts Progress
                  </h3>

                  <div className="staged-table-container" style={{ maxHeight: '450px', overflowY: 'auto' }}>
                    <table className="calls-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Recipient Number</th>
                          <th>Recipient Name</th>
                          <th>Dialing Status</th>
                          <th>Call Duration</th>
                          <th>End Details / Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeQueue.map((item, idx) => {
                          const isCurrent = currentCall && currentCall.formattedPhone === item.formattedPhone;
                          return (
                            <tr key={item.id} className={isCurrent ? 'row-interested' : ''} style={{ borderLeft: isCurrent ? '4px solid #2dd4bf' : 'none' }}>
                              <td>
                                <span style={{ fontWeight: '700' }}>{idx + 1}</span>
                                {item.originalIndex && (
                                  <span style={{ display: 'block', fontSize: '0.7rem', color: '#6366f1', fontWeight: '600' }} title="Contact number in original uploaded file">
                                    #{item.originalIndex} (Row {item.excelRow || (item.originalIndex + 1)})
                                  </span>
                                )}
                              </td>
                              <td style={{ fontFamily: 'var(--mono)', fontWeight: '700' }}>{item.formattedPhone}</td>
                              <td style={{ fontWeight: '500' }}>
                                {item.name ? `👤 ${item.name}` : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Generic Recipient</span>}
                              </td>
                              <td>
                                <span className={`status-pill ${item.status === 'in-progress' ? 'in-progress' : item.status === 'completed' ? 'completed' : item.status === 'queued' ? 'queued' : 'failed'}`}>
                                  {item.status.toUpperCase()}
                                </span>
                              </td>
                              <td style={{ fontFamily: 'var(--mono)', fontWeight: '600' }}>
                                {item.duration || '—'}
                              </td>
                              <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {item.reason || (item.status === 'queued' ? 'Awaiting turn' : item.status === 'in-progress' ? 'Dialing...' : '—')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* SLEEK TERMINAL LOGS CONSOLE (COLLAPSIBLE AT BOTTOM) */}
            <div className={`logs-terminal ${showLogs ? 'expanded' : 'collapsed'}`}>
              <div className="logs-terminal-header" onClick={() => setShowLogs(!showLogs)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Activity size={16} className={campaignState.isRunning ? 'animate-spin' : ''} style={{ color: '#2dd4bf' }} />
                  <span style={{ fontWeight: '700', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                    SYSTEM DISPATCH LOGS TERMINAL [{logs.length}]
                  </span>
                  <span className={`connection-badge ${wsConnected ? 'connected' : 'offline'}`}>
                    {wsConnected ? 'LIVE FEED ACTIVE' : 'DISCONNECTED'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }} onClick={(e) => e.stopPropagation()}>
                  {logs.length > 0 && (
                    <button
                      onClick={handleClearLogs}
                      className="btn-terminal-clear"
                      title="Clear console logs"
                    >
                      <Trash2 size={12} /> Clear Logs
                    </button>
                  )}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setShowLogs(!showLogs)}>
                    {showLogs ? '▼ Collapse' : '▲ Expand Logs'}
                  </span>
                </div>
              </div>

              {showLogs && (
                <div className="logs-terminal-body">
                  {logs.length === 0 ? (
                    <div className="logs-terminal-empty">
                      <span>Console is idle. Add contacts and initiate a calling campaign to generate log records.</span>
                    </div>
                  ) : (
                    logs.map((log) => {
                      let colorClass = 'log-info';
                      if (log.type === 'success') colorClass = 'log-success';
                      else if (log.type === 'error') colorClass = 'log-error';
                      else if (log.type === 'warning') colorClass = 'log-warning';

                      return (
                        <div key={log.id} className={`terminal-line ${colorClass}`}>
                          <span className="terminal-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          <span className="terminal-tag">[{log.type.toUpperCase()}]</span>
                          <span className="terminal-text">{log.message}</span>
                        </div>
                      );
                    })
                  )}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>

          </div>
        )}

        {/* ========================================== */}
        {/* TAB 2: INTERACTIVE CALL ANALYTICS DASHBOARD */}
        {/* ========================================== */}
        {/* ========================================== */}
        {/* TAB 2: INTERACTIVE CALL ANALYTICS DASHBOARD */}
        {/* ========================================== */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="page-header">
              <div>
                <h1>Call Analytics & Post-Call Interest Dashboard</h1>
                <p>Establishing Google Sheets as the source of truth for post-call summaries, academic preferences, and follow-up flags.</p>
                {lastSyncedTime && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                    <span className="status-dot animate-pulse" style={{ backgroundColor: isLoadingSheets ? '#fb923c' : '#4ade80', width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block' }} />
                    {isLoadingSheets ? 'Refreshing data with Google Sheets...' : `Synced: ${lastSyncedTime.toLocaleTimeString()}`}
                  </span>
                )}
              </div>
            </div>



            {/* Top-Level University Scope Selector (searchable dropdown — scales to many colleges) */}
            <div style={{ marginBottom: '1.75rem', backgroundColor: 'rgba(27, 59, 111, 0.02)', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border)' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'block' }}>
                Filter Dashboard by University ({universities.length + 1})
              </label>

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px', maxWidth: '380px' }}>
                  <Search size={15} style={{ position: 'absolute', left: '0.8rem', top: '0.8rem', color: 'var(--text-muted)' }} />
                  <input
                    className="form-input"
                    value={uniSearchDashboard}
                    onChange={(e) => setUniSearchDashboard(e.target.value)}
                    placeholder={`Search ${universities.length} colleges...`}
                    style={{ paddingLeft: '2.3rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn ${isAllUniScope ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      padding: '0.55rem 1rem',
                      fontSize: '0.84rem',
                      fontWeight: '700',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      borderRadius: '8px'
                    }}
                    onClick={() => setDashboardUniversityFilter(['ALL'])}
                  >
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      borderRadius: '3px',
                      border: isAllUniScope ? '2px solid #ffffff' : '1.5px solid var(--border)',
                      backgroundColor: isAllUniScope ? '#ffffff' : 'transparent',
                      color: isAllUniScope ? 'var(--accent)' : 'transparent',
                      fontSize: '11px',
                      fontWeight: '900',
                      lineHeight: 1
                    }}>
                      {isAllUniScope ? '✓' : ''}
                    </span>
                    <span>🌐 All Universities</span>
                  </button>
                  {!isAllUniScope && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.55rem 0.9rem', fontSize: '0.82rem' }}
                      onClick={() => { setDashboardUniversityFilter(['ALL']); setUniSearchDashboard(''); }}
                    >
                      Clear ({dashboardUniversityFilter.length} selected)
                    </button>
                  )}
                </div>
              </div>

              {/* Multi-select college checkboxes (tick 1, 2 or more) */}
              <div style={{ marginTop: '0.75rem', maxHeight: '190px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem', paddingRight: '0.25rem' }}>
                {universities
                  .filter(u => {
                    const q = uniSearchDashboard.trim().toLowerCase();
                    if (!q) return true;
                    return `${u.name} ${u.place || ''} ${u.languages || ''}`.toLowerCase().includes(q);
                  })
                  .map(u => {
                    const count = (uniStats[u.id] || { total: 0 }).total;
                    const checked = !isAllUniScope && dashboardUniversityFilter.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem',
                          padding: '0.5rem 0.75rem', borderRadius: '8px', cursor: 'pointer',
                          border: checked ? '1px solid var(--accent)' : '1px solid var(--border)',
                          backgroundColor: checked ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-card)',
                          fontSize: '0.85rem'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUniScope(u.id)}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: checked ? '700' : '500', flex: 1 }}>
                          🎓 {u.name}{u.place ? <span style={{ color: '#818cf8', fontWeight: '600' }}> — {u.place}</span> : ''}
                        </span>
                        <span className="uni-count-badge">{count}</span>
                      </label>
                    );
                  })}
                {universities.filter(u => {
                  const q = uniSearchDashboard.trim().toLowerCase();
                  if (!q) return true;
                  return `${u.name} ${u.place || ''} ${u.languages || ''}`.toLowerCase().includes(q);
                }).length === 0 && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No colleges match your search.</p>
                  )}
              </div>

              {/* Selected scope summary with Scoped Excel Download Button */}
              <div style={{
                marginTop: '0.85rem',
                fontSize: '0.84rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                flexWrap: 'wrap',
                padding: '0.65rem 1rem',
                borderRadius: '10px',
                backgroundColor: 'rgba(99, 102, 241, 0.06)',
                border: '1px solid rgba(99, 102, 241, 0.25)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: '1 1 320px' }}>
                  <GraduationCap size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  {isAllUniScope ? (
                    <span>Showing call history across <strong style={{ color: 'var(--text-primary)' }}>All Universities</strong> ({universities.length} colleges) • <b>{uniStats.ALL.total}</b> total calls</span>
                  ) : dashboardUniversityFilter.length === 1 ? (() => {
                    const sel = universities.find(u => u.id === dashboardUniversityFilter[0]);
                    const count = (uniStats[dashboardUniversityFilter[0]] || { total: 0 }).total;
                    if (!sel) return <span>Unknown scope</span>;
                    return <span>Showing call history of <strong style={{ color: 'var(--text-primary)' }}>{sel.name}</strong>{sel.place ? ` (${sel.place})` : ''} • <strong style={{ color: '#818cf8' }}>{count} calls</strong> • 🗣️ {sel.languages || 'English, Hindi, Telugu'}</span>;
                  })() : (
                    <span>Showing call history of <strong style={{ color: 'var(--text-primary)' }}>{universities.filter(u => dashboardUniversityFilter.includes(u.id)).map(u => u.name).join(', ')}</strong> • <strong style={{ color: '#818cf8' }}>{totalDispatchedCount} calls</strong> in scope</span>
                  )}
                </div>

                {/* Scoped Download Button */}
                <button
                  onClick={handleExportFilteredCsv}
                  className="btn btn-primary"
                  style={{
                    backgroundColor: '#059669',
                    borderColor: '#10b981',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.5rem 1rem',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)'
                  }}
                  title={`Export Excel report for ${uniScopeLabel}`}
                >
                  <Download size={15} /> Download {isAllUniScope ? 'All Universities' : uniScopeLabel} Excel Report (.xlsx)
                </button>
              </div>
            </div>

            {/* PAST CALLING CAMPAIGNS (COLLAPSIBLE — ZERO WASTED SPACE BY DEFAULT) */}
            {(() => {
              const filteredCampaigns = campaigns.filter(c => {
                if (isAllUniScope) return true;
                return dashboardUniversityFilter.includes(c.universityId);
              });

              return (
                <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', borderLeft: '4px solid #6366f1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Layers size={20} />
                      </div>
                      <div>
                        <h2 className="card-title" style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          Past Calling Campaigns
                          <span style={{ fontSize: '0.75rem', fontWeight: '800', backgroundColor: 'rgba(99, 102, 241, 0.18)', color: '#818cf8', padding: '0.15rem 0.5rem', borderRadius: '12px' }}>
                            {filteredCampaigns.length}
                          </span>
                        </h2>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {isAllUniScope
                            ? 'All universities • Click "Show Campaigns" to expand'
                            : `Filtered by ${universities.filter(u => dashboardUniversityFilter.includes(u.id)).map(u => u.name).join(', ') || 'Selected College'}`}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`btn ${showCampaignsInDashboard ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.82rem', padding: '0.45rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                      onClick={() => setShowCampaignsInDashboard(!showCampaignsInDashboard)}
                    >
                      {showCampaignsInDashboard ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      {showCampaignsInDashboard ? 'Hide Campaigns' : `Show Campaigns (${filteredCampaigns.length})`}
                    </button>
                  </div>

                  {showCampaignsInDashboard && (
                    <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                      {filteredCampaigns.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                          <FolderOpen size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600' }}>No campaigns found for current university filter.</p>
                          <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem' }}>Run a campaign in Call Dialer or switch university filter to view campaigns.</p>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
                          {filteredCampaigns.map((camp) => {
                            const isEditing = editingCampaignId === camp.id;
                            const campStarted = camp.startedAt ? new Date(camp.startedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

                            return (
                              <div
                                key={camp.id}
                                style={{
                                  border: '1px solid var(--border)',
                                  borderRadius: '10px',
                                  padding: '1rem',
                                  backgroundColor: 'var(--bg-card)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                  position: 'relative'
                                }}
                              >
                                <div>
                                  {/* Title & Rename */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    {isEditing ? (
                                      <div style={{ display: 'flex', gap: '0.35rem', flex: 1 }}>
                                        <input
                                          className="form-input"
                                          style={{ fontSize: '0.85rem', padding: '0.3rem 0.5rem' }}
                                          value={editingCampaignName}
                                          onChange={(e) => setEditingCampaignName(e.target.value)}
                                          autoFocus
                                        />
                                        <button
                                          type="button"
                                          className="btn btn-primary"
                                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                          onClick={() => handleSaveCampaignName(camp.id, editingCampaignName)}
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                          onClick={() => setEditingCampaignId(null)}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                                        <h4
                                          style={{ margin: 0, fontSize: '0.96rem', fontWeight: '700', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                                          onClick={() => { setSelectedCampaignDetail(camp); setCampaignCheckedContacts([]); setCameFromPastCampaignsModal(false); }}
                                          title="Click to view student recipient table"
                                        >
                                          📢 {camp.name}
                                        </h4>
                                        <button
                                          type="button"
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 0.2rem', fontSize: '0.75rem' }}
                                          onClick={() => { setEditingCampaignId(camp.id); setEditingCampaignName(camp.name); }}
                                          title="Rename campaign"
                                        >
                                          ✏️
                                        </button>
                                      </div>
                                    )}

                                    <span
                                      className={`status-pill ${camp.status === 'in-progress' ? 'active' : 'completed'}`}
                                      style={{ fontSize: '0.68rem', textTransform: 'uppercase', flexShrink: 0 }}
                                    >
                                      {camp.status || 'completed'}
                                    </span>
                                  </div>

                                  {/* University & Course Badges */}
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.4rem 0 0.6rem' }}>
                                    <span style={{ fontSize: '0.74rem', fontWeight: '700', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                                      🎓 {camp.universityName || 'Vidyavision AI'}
                                    </span>
                                    {camp.course && (
                                      <span style={{ fontSize: '0.74rem', fontWeight: '700', backgroundColor: 'rgba(45, 212, 191, 0.1)', color: '#2dd4bf', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(45, 212, 191, 0.25)' }}>
                                        📚 {camp.course}
                                      </span>
                                    )}
                                  </div>

                                  {/* Timeline & Stats */}
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                      <Calendar size={13} /> Started: <strong style={{ color: 'var(--text-secondary)' }}>{campStarted}</strong>
                                    </span>
                                    <span>
                                      👥 Total Recipients: <b style={{ color: 'var(--text-primary)' }}>{camp.totalCount || (camp.contacts && camp.contacts.length) || 0}</b>
                                      {camp.completedCount !== undefined && ` • Processed: ${camp.completedCount}`}
                                    </span>
                                  </div>
                                </div>

                                {/* Action Buttons */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                    onClick={() => { setSelectedCampaignDetail(camp); setCampaignCheckedContacts([]); setCameFromPastCampaignsModal(false); }}
                                  >
                                    <span>👁️</span> View Student Table ({camp.contacts?.length || camp.totalCount || 0})
                                  </button>

                                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)', fontWeight: '600' }}
                                      onClick={() => handleDownloadCampaignExcel(camp)}
                                      title="Download formatted Excel report (.xlsx)"
                                    >
                                      <Download size={13} /> Excel
                                    </button>

                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.55rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                      onClick={() => handleDownloadCampaignCsv(camp.id, camp.name)}
                                      title="Download CSV"
                                    >
                                      <Download size={13} /> CSV
                                    </button>

                                    <button
                                      type="button"
                                      className="btn btn-danger-outline"
                                      style={{ fontSize: '0.76rem', padding: '0.35rem 0.55rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                                      onClick={() => handleDeleteCampaign(camp.id, camp.name)}
                                      title="Delete campaign"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Interactive Cards Grid across Product-Level Outcomes */}
            <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>

              {/* Card 1: Total Dispatched Calls */}
              <div
                className={`metric-card ${dashboardFilter === 'ALL' ? 'active-metric-card' : ''}`}
                onClick={() => setDashboardFilter('ALL')}
              >
                <div className="metric-header">
                  <span className="metric-title">Total Dispatched</span>
                  <div className="metric-icon" style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                    <PhoneCall size={20} />
                  </div>
                </div>
                <div className="metric-value">{totalDispatchedCount}</div>
                <div className="metric-footer">Click to view all calls</div>
              </div>

              {/* Card 2: Calls Answered */}
              <div
                className={`metric-card ${dashboardFilter === 'ANSWERED' ? 'active-metric-card' : ''}`}
                style={{ borderColor: dashboardFilter === 'ANSWERED' ? '#2dd4bf' : undefined }}
                onClick={() => setDashboardFilter('ANSWERED')}
              >
                <div className="metric-header">
                  <span className="metric-title" style={{ color: '#2dd4bf' }}>Calls Answered</span>
                  <div className="metric-icon" style={{ backgroundColor: 'rgba(13, 148, 136, 0.15)', color: '#2dd4bf' }}>
                    <CheckCircle2 size={20} />
                  </div>
                </div>
                <div className="metric-value" style={{ color: '#2dd4bf' }}>{answeredCount}</div>
                <div className="metric-footer" style={{ color: '#2dd4bf' }}>
                  {totalDispatchedCount > 0 ? `${Math.round((answeredCount / totalDispatchedCount) * 100)}% Answered rate` : 'Answered calls list'}
                </div>
              </div>

              {/* Card 3: Calls Not Answered */}
              <div
                className={`metric-card ${dashboardFilter === CALL_OUTCOME_STATUS.NOT_ANSWERED ? 'active-metric-card' : ''}`}
                style={{ borderColor: dashboardFilter === CALL_OUTCOME_STATUS.NOT_ANSWERED ? '#fb7185' : undefined }}
                onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.NOT_ANSWERED)}
              >
                <div className="metric-header">
                  <span className="metric-title" style={{ color: '#fb7185' }}>Calls Not Answered</span>
                  <div className="metric-icon" style={{ backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185' }}>
                    <XCircle size={20} />
                  </div>
                </div>
                <div className="metric-value" style={{ color: '#fb7185' }}>{unansweredCount}</div>
                <div className="metric-footer" style={{ color: '#fb7185' }}>
                  {totalDispatchedCount > 0 ? `${Math.round((unansweredCount / totalDispatchedCount) * 100)}% Missed rate` : 'Missed / Unreachable'}
                </div>
              </div>

              {/* Card 4: GREEN - Interested Leads */}
              <div
                className={`metric-card interested-card ${dashboardFilter === CALL_OUTCOME_STATUS.INTERESTED ? 'active-metric-card' : ''}`}
                onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.INTERESTED)}
              >
                <div className="metric-header">
                  <span className="metric-title" style={{ color: '#4ade80' }}>🟢 Interested</span>
                  <div className="metric-icon" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#4ade80' }}>
                    <ThumbsUp size={20} />
                  </div>
                </div>
                <div className="metric-value" style={{ color: '#4ade80' }}>{interestedCount}</div>
                <div className="metric-footer" style={{ color: '#86efac' }}>
                  {totalDispatchedCount > 0 ? `${Math.round((interestedCount / totalDispatchedCount) * 100)}% of Dispatched` : 'Explicitly interested'}
                </div>
              </div>

              {/* Card 4b: CYAN - Application Sent via WhatsApp */}
              <div
                className={`metric-card ${dashboardFilter === CALL_OUTCOME_STATUS.APPLICATION_SENT ? 'active-metric-card' : ''}`}
                style={{ borderColor: dashboardFilter === CALL_OUTCOME_STATUS.APPLICATION_SENT ? '#06b6d4' : 'rgba(6, 182, 212, 0.3)' }}
                onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.APPLICATION_SENT)}
              >
                <div className="metric-header">
                  <span className="metric-title" style={{ color: '#06b6d4' }}>📩 Application Sent</span>
                  <div className="metric-icon" style={{ backgroundColor: 'rgba(6, 182, 212, 0.18)', color: '#06b6d4' }}>
                    <FileCheck size={20} />
                  </div>
                </div>
                <div className="metric-value" style={{ color: '#06b6d4' }}>{applicationSentCount}</div>
                <div className="metric-footer" style={{ color: '#67e8f9' }}>
                  {totalDispatchedCount > 0 ? `${Math.round((applicationSentCount / totalDispatchedCount) * 100)}% of Dispatched` : 'WhatsApp link sent'}
                </div>
              </div>

              {/* Card 5: AMBER - Callback Requested */}
              <div
                className={`metric-card callback-card ${dashboardFilter === CALL_OUTCOME_STATUS.CALLBACK ? 'active-metric-card' : ''}`}
                onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.CALLBACK)}
              >
                <div className="metric-header">
                  <span className="metric-title" style={{ color: '#fbbf24' }}>📞 Callback</span>
                  <div className="metric-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24' }}>
                    <PhoneForwarded size={20} />
                  </div>
                </div>
                <div className="metric-value" style={{ color: '#fbbf24' }}>{callbackCount}</div>
                <div className="metric-footer" style={{ color: '#fde68a' }}>
                  {totalDispatchedCount > 0 ? `${Math.round((callbackCount / totalDispatchedCount) * 100)}% of Dispatched` : 'Requested callback'}
                </div>
              </div>

              {/* Card 6: SKY BLUE - Already Applied */}
              <div
                className={`metric-card already-applied-card ${dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_APPLIED ? 'active-metric-card' : ''}`}
                onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.ALREADY_APPLIED)}
              >
                <div className="metric-header">
                  <span className="metric-title" style={{ color: '#38bdf8' }}>📝 Already Applied</span>
                  <div className="metric-icon" style={{ backgroundColor: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8' }}>
                    <FileCheck size={20} />
                  </div>
                </div>
                <div className="metric-value" style={{ color: '#38bdf8' }}>{alreadyAppliedCount}</div>
                <div className="metric-footer" style={{ color: '#bae6fd' }}>
                  {totalDispatchedCount > 0 ? `${Math.round((alreadyAppliedCount / totalDispatchedCount) * 100)}% of Dispatched` : 'Submitted application'}
                </div>
              </div>

              {/* Card 7: PURPLE - Already Joined */}
              <div
                className={`metric-card already-joined-card ${dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_JOINED ? 'active-metric-card' : ''}`}
                onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.ALREADY_JOINED)}
              >
                <div className="metric-header">
                  <span className="metric-title" style={{ color: '#a855f7' }}>🎓 Already Joined</span>
                  <div className="metric-icon" style={{ backgroundColor: 'rgba(168, 85, 247, 0.18)', color: '#a855f7' }}>
                    <GraduationCap size={20} />
                  </div>
                </div>
                <div className="metric-value" style={{ color: '#a855f7' }}>{alreadyJoinedCount}</div>
                <div className="metric-footer" style={{ color: '#d8b4fe' }}>
                  {totalDispatchedCount > 0 ? `${Math.round((alreadyJoinedCount / totalDispatchedCount) * 100)}% of Dispatched` : 'Enrolled in college'}
                </div>
              </div>

              {/* Card 8: RED - Not Interested */}
              <div
                className={`metric-card not-interested-card ${dashboardFilter === CALL_OUTCOME_STATUS.NOT_INTERESTED ? 'active-metric-card' : ''}`}
                onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.NOT_INTERESTED)}
              >
                <div className="metric-header">
                  <span className="metric-title" style={{ color: '#f87171' }}>🔴 Not Interested</span>
                  <div className="metric-icon" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
                    <ThumbsDown size={20} />
                  </div>
                </div>
                <div className="metric-value" style={{ color: '#f87171' }}>{notInterestedCount}</div>
                <div className="metric-footer" style={{ color: '#fca5a5' }}>
                  {totalDispatchedCount > 0 ? `${Math.round((notInterestedCount / totalDispatchedCount) * 100)}% of Dispatched` : 'Declined / Working'}
                </div>
              </div>

              {/* Card 9: ORANGE - Wrong Number / Invalid */}
              <div
                className={`metric-card wrong-number-card ${dashboardFilter === CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID ? 'active-metric-card' : ''}`}
                onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID)}
              >
                <div className="metric-header">
                  <span className="metric-title" style={{ color: '#fb923c' }}>⚠️ Wrong / Invalid</span>
                  <div className="metric-icon" style={{ backgroundColor: 'rgba(251, 146, 60, 0.18)', color: '#fb923c' }}>
                    <AlertTriangle size={20} />
                  </div>
                </div>
                <div className="metric-value" style={{ color: '#fb923c' }}>{wrongNumberCount}</div>
                <div className="metric-footer" style={{ color: '#fed7aa' }}>
                  {totalDispatchedCount > 0 ? `${Math.round((wrongNumberCount / totalDispatchedCount) * 100)}% of Dispatched` : 'Wrong or invalid number'}
                </div>
              </div>

              {/* Card 10: SECONDARY METRIC - Counsellor Follow-up */}
              <div
                className={`metric-card ${dashboardFilter === 'COUNSELOR_FOLLOWUP' ? 'active-metric-card' : ''}`}
                style={{ borderColor: dashboardFilter === 'COUNSELOR_FOLLOWUP' ? '#2dd4bf' : 'rgba(45, 212, 191, 0.3)' }}
                onClick={() => setDashboardFilter('COUNSELOR_FOLLOWUP')}
              >
                <div className="metric-header">
                  <span className="metric-title" style={{ color: '#2dd4bf' }}>☎ Counsellor Follow-up</span>
                  <div className="metric-icon" style={{ backgroundColor: 'rgba(45, 212, 191, 0.18)', color: '#2dd4bf' }}>
                    <PhoneForwarded size={20} />
                  </div>
                </div>
                <div className="metric-value" style={{ color: '#2dd4bf' }}>{counselorFollowupCount}</div>
                <div className="metric-footer" style={{ color: '#5eead4' }}>
                  {interestedCount > 0 ? `${Math.round((counselorFollowupCount / interestedCount) * 100)}% of Interested` : 'Secondary Action'}
                </div>
              </div>

            </div>

            {/* Admission Conversion Funnel & Call Outcome Distribution Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem', marginTop: '1.25rem' }}>

              {/* 1. Admission Qualification Pipeline (4 Progressive Funnel Stages + Quick Disposition Chips) */}
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h2 className="card-title" style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={18} style={{ color: 'var(--accent)' }} />
                    {isAllUniScope
                      ? 'Admissions Qualification Pipeline'
                      : `${uniScopeLabel} Admissions Pipeline`}
                  </h2>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Click stage or disposition to filter</span>
                </div>

                {/* 4 True Progressive Funnel Stages */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%' }}>

                  {/* Stage 1: Total Dispatched */}
                  <div
                    onClick={() => setDashboardFilter('ALL')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.25rem 0.45rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === 'ALL' ? 'rgba(129, 140, 248, 0.12)' : 'transparent',
                      borderLeft: dashboardFilter === 'ALL' ? '3px solid #818cf8' : '3px solid transparent'
                    }}
                  >
                    <div style={{ width: '155px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '700' }}>
                      1. Total Dispatched
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ width: '100%', backgroundColor: 'rgba(129, 140, 248, 0.4)', height: '100%' }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {totalDispatchedCount} leads (100%)
                      </span>
                    </div>
                  </div>

                  {/* Stage 2: Connected / Answered */}
                  <div
                    onClick={() => setDashboardFilter('ANSWERED')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.25rem 0.45rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === 'ANSWERED' ? 'rgba(45, 212, 191, 0.12)' : 'transparent',
                      borderLeft: dashboardFilter === 'ANSWERED' ? '3px solid #2dd4bf' : '3px solid transparent'
                    }}
                  >
                    <div style={{ width: '155px', fontSize: '0.8rem', color: '#2dd4bf', fontWeight: '700' }}>
                      2. Calls Connected
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        width: `${totalDispatchedCount > 0 ? (answeredCount / totalDispatchedCount) * 100 : 0}%`,
                        backgroundColor: 'rgba(45, 212, 191, 0.4)',
                        height: '100%'
                      }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {answeredCount} leads {totalDispatchedCount > 0 && `(${Math.round((answeredCount / totalDispatchedCount) * 100)}% reach)`}
                      </span>
                    </div>
                  </div>

                  {/* Stage 3: Qualified / Interested */}
                  <div
                    onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.INTERESTED)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.25rem 0.45rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.INTERESTED ? 'rgba(74, 222, 128, 0.12)' : 'transparent',
                      borderLeft: dashboardFilter === CALL_OUTCOME_STATUS.INTERESTED ? '3px solid #4ade80' : '3px solid transparent'
                    }}
                  >
                    <div style={{ width: '155px', fontSize: '0.8rem', color: '#4ade80', fontWeight: '700' }}>
                      3. Qualified / Interested
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        width: `${answeredCount > 0 ? (interestedCount / answeredCount) * 100 : 0}%`,
                        backgroundColor: 'rgba(74, 222, 128, 0.4)',
                        height: '100%'
                      }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {interestedCount} leads {answeredCount > 0 && `(${Math.round((interestedCount / answeredCount) * 100)}% of connected)`}
                      </span>
                    </div>
                  </div>

                  {/* Stage 4: Application Sent */}
                  <div
                    onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.APPLICATION_SENT)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.25rem 0.45rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.APPLICATION_SENT ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                      borderLeft: dashboardFilter === CALL_OUTCOME_STATUS.APPLICATION_SENT ? '3px solid #06b6d4' : '3px solid transparent'
                    }}
                  >
                    <div style={{ width: '155px', fontSize: '0.8rem', color: '#06b6d4', fontWeight: '700' }}>
                      4. Application Sent
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        width: `${interestedCount > 0 ? Math.min(100, (applicationSentCount / interestedCount) * 100) : (answeredCount > 0 ? (applicationSentCount / answeredCount) * 100 : 0)}%`,
                        backgroundColor: 'rgba(6, 182, 212, 0.4)',
                        height: '100%'
                      }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {applicationSentCount} leads {interestedCount > 0 && `(${Math.round((applicationSentCount / interestedCount) * 100)}% of interested)`}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Secondary Call Dispositions & Counsellor Pipeline Chips */}
                <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.07)', paddingTop: '0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
                    Secondary Dispositions & Pipeline Actions
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '0.5rem' }}>
                    {/* Callback */}
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === CALL_OUTCOME_STATUS.CALLBACK ? 'ALL' : CALL_OUTCOME_STATUS.CALLBACK)}
                      style={{
                        padding: '0.45rem 0.6rem',
                        borderRadius: '6px',
                        border: dashboardFilter === CALL_OUTCOME_STATUS.CALLBACK ? '1px solid #fbbf24' : '1px solid var(--border)',
                        backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.CALLBACK ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ fontSize: '0.76rem', color: '#fbbf24', fontWeight: '600' }}>📞 Callback</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#fbbf24', fontFamily: 'var(--mono)' }}>{callbackCount}</span>
                    </button>

                    {/* Already Applied */}
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_APPLIED ? 'ALL' : CALL_OUTCOME_STATUS.ALREADY_APPLIED)}
                      style={{
                        padding: '0.45rem 0.6rem',
                        borderRadius: '6px',
                        border: dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_APPLIED ? '1px solid #38bdf8' : '1px solid var(--border)',
                        backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_APPLIED ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ fontSize: '0.76rem', color: '#38bdf8', fontWeight: '600' }}>📝 Applied</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#38bdf8', fontFamily: 'var(--mono)' }}>{alreadyAppliedCount}</span>
                    </button>

                    {/* Already Joined */}
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_JOINED ? 'ALL' : CALL_OUTCOME_STATUS.ALREADY_JOINED)}
                      style={{
                        padding: '0.45rem 0.6rem',
                        borderRadius: '6px',
                        border: dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_JOINED ? '1px solid #a855f7' : '1px solid var(--border)',
                        backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_JOINED ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ fontSize: '0.76rem', color: '#a855f7', fontWeight: '600' }}>🎓 Joined</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#a855f7', fontFamily: 'var(--mono)' }}>{alreadyJoinedCount}</span>
                    </button>

                    {/* Counsellor Follow-up */}
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === 'COUNSELOR_FOLLOWUP' ? 'ALL' : 'COUNSELOR_FOLLOWUP')}
                      style={{
                        padding: '0.45rem 0.6rem',
                        borderRadius: '6px',
                        border: dashboardFilter === 'COUNSELOR_FOLLOWUP' ? '1px solid #2dd4bf' : '1px solid var(--border)',
                        backgroundColor: dashboardFilter === 'COUNSELOR_FOLLOWUP' ? 'rgba(45, 212, 191, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ fontSize: '0.76rem', color: '#2dd4bf', fontWeight: '600' }}>☎️ Counsellor</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#2dd4bf', fontFamily: 'var(--mono)' }}>{counselorFollowupCount}</span>
                    </button>

                    {/* Not Interested */}
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === CALL_OUTCOME_STATUS.NOT_INTERESTED ? 'ALL' : CALL_OUTCOME_STATUS.NOT_INTERESTED)}
                      style={{
                        padding: '0.45rem 0.6rem',
                        borderRadius: '6px',
                        border: dashboardFilter === CALL_OUTCOME_STATUS.NOT_INTERESTED ? '1px solid #f87171' : '1px solid var(--border)',
                        backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.NOT_INTERESTED ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ fontSize: '0.76rem', color: '#f87171', fontWeight: '600' }}>🔴 Declined</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#f87171', fontFamily: 'var(--mono)' }}>{notInterestedCount}</span>
                    </button>

                    {/* Wrong / Invalid */}
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID ? 'ALL' : CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID)}
                      style={{
                        padding: '0.45rem 0.6rem',
                        borderRadius: '6px',
                        border: dashboardFilter === CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID ? '1px solid #fb923c' : '1px solid var(--border)',
                        backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID ? 'rgba(251, 146, 60, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ fontSize: '0.76rem', color: '#fb923c', fontWeight: '600' }}>⚠️ Invalid</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#fb923c', fontFamily: 'var(--mono)' }}>{wrongNumberCount}</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* 2. Call Outcome Distribution Pie Chart (Product-Level Outcome Proportion) */}
              <CallOutcomePieChart
                statusCounts={{
                  [CALL_OUTCOME_STATUS.INTERESTED]: interestedCount,
                  [CALL_OUTCOME_STATUS.APPLICATION_SENT]: applicationSentCount,
                  [CALL_OUTCOME_STATUS.CALLBACK]: callbackCount,
                  [CALL_OUTCOME_STATUS.ALREADY_APPLIED]: alreadyAppliedCount,
                  [CALL_OUTCOME_STATUS.ALREADY_JOINED]: alreadyJoinedCount,
                  [CALL_OUTCOME_STATUS.NOT_INTERESTED]: notInterestedCount,
                  [CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID]: wrongNumberCount,
                  [CALL_OUTCOME_STATUS.NOT_ANSWERED]: unansweredCount
                }}
                selectedStatus={dashboardFilter}
                onSelectStatus={setDashboardFilter}
              />

            </div>

            {/* AI Student Profile & Readiness Signals (OmniDimension Extracted Intelligence) */}
            <div className="card" style={{ marginTop: '1.25rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{ padding: '0.35rem', borderRadius: '8px', backgroundColor: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent)', display: 'flex' }}>
                    <BookOpen size={18} />
                  </div>
                  <div>
                    <h2 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>
                      AI Student Profile & Readiness Signals
                    </h2>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Variables automatically extracted by OmniDimension AI • Click any signal to filter student table
                    </span>
                  </div>
                </div>

                {['GRAD_FINAL_YEAR', 'GRAD_COMPLETED', 'TIMELINE_IMMEDIATE', 'TIMELINE_NEXT_YEAR', 'EXAM_MENTIONED', 'LIVE_TRANSFERRED'].includes(dashboardFilter) && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.76rem' }}
                    onClick={() => setDashboardFilter('ALL')}
                  >
                    Reset Signal Filter
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                {/* 1. Graduation Status */}
                <div style={{ padding: '0.9rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                    <GraduationCap size={16} style={{ color: '#818cf8' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-primary)' }}>Graduation Status</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === 'GRAD_FINAL_YEAR' ? 'ALL' : 'GRAD_FINAL_YEAR')}
                      style={{
                        padding: '0.4rem 0.65rem',
                        borderRadius: '6px',
                        border: dashboardFilter === 'GRAD_FINAL_YEAR' ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.06)',
                        backgroundColor: dashboardFilter === 'GRAD_FINAL_YEAR' ? 'rgba(129, 140, 248, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ fontSize: '0.78rem', color: dashboardFilter === 'GRAD_FINAL_YEAR' ? '#818cf8' : 'var(--text-secondary)' }}>🎓 Final Year</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#818cf8', fontFamily: 'var(--mono)' }}>{finalYearGradCount}</span>
                    </button>
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === 'GRAD_COMPLETED' ? 'ALL' : 'GRAD_COMPLETED')}
                      style={{
                        padding: '0.4rem 0.65rem',
                        borderRadius: '6px',
                        border: dashboardFilter === 'GRAD_COMPLETED' ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.06)',
                        backgroundColor: dashboardFilter === 'GRAD_COMPLETED' ? 'rgba(129, 140, 248, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ fontSize: '0.78rem', color: dashboardFilter === 'GRAD_COMPLETED' ? '#818cf8' : 'var(--text-secondary)' }}>📜 Completed Degree</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#818cf8', fontFamily: 'var(--mono)' }}>{completedGradCount}</span>
                    </button>
                  </div>
                </div>

                {/* 2. Admission Timeline */}
                <div style={{ padding: '0.9rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                    <Calendar size={16} style={{ color: '#2dd4bf' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-primary)' }}>Admission Timeline</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === 'TIMELINE_IMMEDIATE' ? 'ALL' : 'TIMELINE_IMMEDIATE')}
                      style={{
                        padding: '0.4rem 0.65rem',
                        borderRadius: '6px',
                        border: dashboardFilter === 'TIMELINE_IMMEDIATE' ? '1px solid #2dd4bf' : '1px solid rgba(255, 255, 255, 0.06)',
                        backgroundColor: dashboardFilter === 'TIMELINE_IMMEDIATE' ? 'rgba(45, 212, 191, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ fontSize: '0.78rem', color: dashboardFilter === 'TIMELINE_IMMEDIATE' ? '#2dd4bf' : 'var(--text-secondary)' }}>⚡ Immediate (2026)</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#2dd4bf', fontFamily: 'var(--mono)' }}>{immediateTimelineCount}</span>
                    </button>
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === 'TIMELINE_NEXT_YEAR' ? 'ALL' : 'TIMELINE_NEXT_YEAR')}
                      style={{
                        padding: '0.4rem 0.65rem',
                        borderRadius: '6px',
                        border: dashboardFilter === 'TIMELINE_NEXT_YEAR' ? '1px solid #2dd4bf' : '1px solid rgba(255, 255, 255, 0.06)',
                        backgroundColor: dashboardFilter === 'TIMELINE_NEXT_YEAR' ? 'rgba(45, 212, 191, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ fontSize: '0.78rem', color: dashboardFilter === 'TIMELINE_NEXT_YEAR' ? '#2dd4bf' : 'var(--text-secondary)' }}>📅 Next Year (2027)</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#2dd4bf', fontFamily: 'var(--mono)' }}>{nextYearTimelineCount}</span>
                    </button>
                  </div>
                </div>

                {/* 3. Entrance Exam Mentioned */}
                <div style={{ padding: '0.9rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                    <FileCheck size={16} style={{ color: '#fbbf24' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-primary)' }}>Entrance Exam Discussed</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === 'EXAM_MENTIONED' ? 'ALL' : 'EXAM_MENTIONED')}
                      style={{
                        padding: '0.4rem 0.65rem',
                        borderRadius: '6px',
                        border: dashboardFilter === 'EXAM_MENTIONED' ? '1px solid #fbbf24' : '1px solid rgba(255, 255, 255, 0.06)',
                        backgroundColor: dashboardFilter === 'EXAM_MENTIONED' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.78rem', color: dashboardFilter === 'EXAM_MENTIONED' ? '#fbbf24' : 'var(--text-secondary)' }}>📝 Exam Disclosed</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>CAT, MAT, ICET, etc.</div>
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#fbbf24', fontFamily: 'var(--mono)' }}>{entranceExamCount}</span>
                    </button>
                  </div>
                </div>

                {/* 4. Live Counsellor Transfer */}
                <div style={{ padding: '0.9rem', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                    <PhoneForwarded size={16} style={{ color: '#06b6d4' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-primary)' }}>Live Counsellor Transfer</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <button
                      onClick={() => setDashboardFilter(dashboardFilter === 'LIVE_TRANSFERRED' ? 'ALL' : 'LIVE_TRANSFERRED')}
                      style={{
                        padding: '0.4rem 0.65rem',
                        borderRadius: '6px',
                        border: dashboardFilter === 'LIVE_TRANSFERRED' ? '1px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.06)',
                        backgroundColor: dashboardFilter === 'LIVE_TRANSFERRED' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.78rem', color: dashboardFilter === 'LIVE_TRANSFERRED' ? '#06b6d4' : 'var(--text-secondary)' }}>🔀 Transferred Live</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Hot caller transferred</div>
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#06b6d4', fontFamily: 'var(--mono)' }}>{liveTransferredCount}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Filtered Data Section */}
            <div className="card" style={{ marginTop: '1.5rem', padding: '1.5rem' }}>

              {/* Dropdown Filters Toolbar */}
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>

                {/* 1. Date Range Filter */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Date Range</label>
                  <select
                    className="form-input"
                    style={{ padding: '0.45rem 0.8rem', fontSize: '0.85rem', minWidth: '150px' }}
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  >
                    <option value="ALL">All Time</option>
                    <option value="TODAY">Today</option>
                    <option value="YESTERDAY">Yesterday</option>
                    <option value="LAST_7_DAYS">Last 7 Days</option>
                    <option value="LAST_30_DAYS">Last 30 Days</option>
                    <option value="CUSTOM">Custom Range</option>
                  </select>
                </div>

                {/* Custom Date Pickers */}
                {dateFilter === 'CUSTOM' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>Start</label>
                      <input
                        type="date"
                        className="form-input"
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.82rem' }}
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>End</label>
                      <input
                        type="date"
                        className="form-input"
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.82rem' }}
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* 2. Status Filter */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Lead Status</label>
                  <select
                    className="form-input"
                    style={{ padding: '0.45rem 0.8rem', fontSize: '0.85rem', minWidth: '160px' }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="ALL">All Outcomes & Statuses</option>
                    <optgroup label="Primary Final Outcomes">
                      <option value={CALL_OUTCOME_STATUS.INTERESTED}>Interested</option>
                      <option value={CALL_OUTCOME_STATUS.APPLICATION_SENT}>Application Sent</option>
                      <option value={CALL_OUTCOME_STATUS.CALLBACK}>Callback</option>
                      <option value={CALL_OUTCOME_STATUS.ALREADY_APPLIED}>Already Applied</option>
                      <option value={CALL_OUTCOME_STATUS.ALREADY_JOINED}>Already Joined</option>
                      <option value={CALL_OUTCOME_STATUS.NOT_INTERESTED}>Not Interested</option>
                      <option value={CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID}>Wrong Number / Invalid</option>
                      <option value={CALL_OUTCOME_STATUS.NOT_ANSWERED}>Calls Not Answered</option>
                    </optgroup>
                    {uniqueStatuses.filter(s => !Object.values(CALL_OUTCOME_STATUS).includes(s.toUpperCase()) && !['WRONG_NUMBER', 'UNANSWERED', 'NOT INTERESTED', 'NO_ANSWER'].includes(s.toUpperCase())).length > 0 && (
                      <optgroup label="Other Sheet Lead Statuses">
                        {uniqueStatuses
                          .filter(s => !Object.values(CALL_OUTCOME_STATUS).includes(s.toUpperCase()) && !['WRONG_NUMBER', 'UNANSWERED', 'NOT INTERESTED', 'NO_ANSWER'].includes(s.toUpperCase()))
                          .map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {/* 3. Sorting */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Sort Order</label>
                  <select
                    className="form-input"
                    style={{ padding: '0.45rem 0.8rem', fontSize: '0.85rem', minWidth: '160px' }}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="DATE_DESC">Newest First</option>
                    <option value="DATE_ASC">Oldest First</option>
                    <option value="NAME_ASC">Name (A-Z)</option>
                    <option value="NAME_DESC">Name (Z-A)</option>
                    <option value="INTEREST_DESC">Interest Level</option>
                    <option value="STATUS_ASC">Status (A-Z)</option>
                  </select>
                </div>

                {/* Clear Button */}
                {(dashboardFilter !== 'ALL' || dateFilter !== 'ALL' || statusFilter !== 'ALL' || dashboardSearch.trim() || !isAllUniScope) && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem', height: 'fit-content' }}
                    onClick={() => {
                      setDashboardFilter('ALL');
                      setDateFilter('ALL');
                      setCustomStartDate('');
                      setCustomEndDate('');
                      setStatusFilter('ALL');
                      setDashboardSearch('');
                      setDashboardUniversityFilter(['ALL']);
                      addToast('Reset filters.', 'info');
                    }}
                  >
                    Clear Filters
                  </button>
                )}

              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Filter size={18} style={{ color: 'var(--accent)' }} />
                  <h2 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0 }}>
                    {dashboardFilter === 'ALL' && 'All Call Recipient History'}
                    {dashboardFilter === 'ANSWERED' && 'Recipient List: Answered Calls'}
                    {dashboardFilter === CALL_OUTCOME_STATUS.INTERESTED && '🟢 Interested Students (Qualified List)'}
                    {dashboardFilter === CALL_OUTCOME_STATUS.APPLICATION_SENT && '📩 Application Sent via WhatsApp'}
                    {dashboardFilter === CALL_OUTCOME_STATUS.CALLBACK && '📞 Callback Requested List'}
                    {dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_APPLIED && '📝 Already Applied Leads'}
                    {dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_JOINED && '🎓 Already Joined / Enrolled Elsewhere'}
                    {dashboardFilter === CALL_OUTCOME_STATUS.NOT_INTERESTED && '🔴 Not Interested / Declined List'}
                    {(dashboardFilter === CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID || dashboardFilter === 'WRONG_NUMBER') && '⚠️ Wrong Number / Invalid Contacts'}
                    {(dashboardFilter === CALL_OUTCOME_STATUS.NOT_ANSWERED || dashboardFilter === 'UNANSWERED') && '❌ Recipient List: Missed / Unanswered'}
                    {dashboardFilter === 'COUNSELOR_FOLLOWUP' && '☎️ Leads Requiring Counsellor Follow-up'}
                    {dashboardFilter === 'GRAD_FINAL_YEAR' && '🎓 Final Year Graduating Students'}
                    {dashboardFilter === 'GRAD_COMPLETED' && '📜 Completed Degree Graduates'}
                    {dashboardFilter === 'TIMELINE_IMMEDIATE' && '⚡ Immediate (2026 Intake) Candidates'}
                    {dashboardFilter === 'TIMELINE_NEXT_YEAR' && '📅 Future / Next Year (2027) Prospects'}
                    {dashboardFilter === 'EXAM_MENTIONED' && '📝 Candidates With Entrance Exam Discussed'}
                    {dashboardFilter === 'LIVE_TRANSFERRED' && '🔀 Leads Live Transferred to Counsellor'}
                  </h2>
                  <span className="status-pill completed" style={{ fontSize: '0.8rem' }}>
                    {finalDashboardList.length} / {mergedCalls.length} Leads
                  </span>
                </div>

                {/* Search box */}
                <div style={{ position: 'relative', minWidth: '280px' }}>
                  <input
                    type="text"
                    placeholder="Search name, phone, course, state..."
                    value={dashboardSearch}
                    onChange={(e) => setDashboardSearch(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.2rem', paddingRight: '0.8rem' }}
                  />
                  <Search size={15} style={{ position: 'absolute', left: '0.8rem', top: '0.8rem', color: 'var(--text-muted)' }} />
                </div>
              </div>

              {/* Data Table */}
              {isLoadingSheets && mergedCalls.length === 0 ? (
                <div className="empty-state" style={{ padding: '3rem 1rem' }}>
                  <RefreshCw className="empty-icon animate-spin" style={{ color: 'var(--accent)', marginBottom: '0.5rem' }} />
                  <h3>Loading call data...</h3>
                  <p>Fetching post-call leads from Google Sheets source of truth...</p>
                </div>
              ) : finalDashboardList.length === 0 ? (
                <div className="empty-state" style={{ padding: '3rem 1rem' }}>
                  <PhoneCall className="empty-icon" />
                  <h3>No call records found for this filter</h3>
                  <p>Try adjusting date range, search query, or clear status selections.</p>
                </div>
              ) : (
                <div className="calls-table-container">
                  <table className="calls-table">
                    <thead>
                      <tr>
                        <th>Student Profile</th>
                        <th>University</th>
                        <th>Call Date & Duration</th>
                        <th>Lead Outcome</th>
                        <th>AI Feedback & Signals</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finalDashboardList.map((call) => {
                        const isHot = String(call.leadStatus).toUpperCase().includes('HOT');
                        const primaryStatus = getPrimaryCallStatus(call);
                        const statusInfo = getStatusDisplay(primaryStatus);
                        const uniId = getCallUniversityId(call);
                        const uniDisplayName = getUniversityName(uniId);
                        const isCounselorReq = isCounselorFollowupRequired(call);
                        const rawDuration = call.callDuration || call.duration || (call.rawFields && call.rawFields.call_duration_in_seconds);

                        return (
                          <tr key={call.id}>
                            {/* 1. Student Profile */}
                            <td>
                              <div style={{ fontWeight: '700', fontSize: '0.92rem', color: 'var(--text-primary)' }}>{call.studentName}</div>
                              <div style={{ fontSize: '0.8rem', color: '#a5b4fc', fontFamily: 'var(--mono)' }}>{call.contactNumber}</div>
                              {(call.course || call.program) && (call.course !== '—' || call.program !== '—') && (
                                <div style={{ marginTop: '0.25rem' }}>
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: '600',
                                    padding: '0.12rem 0.45rem',
                                    borderRadius: '4px',
                                    backgroundColor: 'rgba(99, 102, 241, 0.12)',
                                    color: '#a5b4fc',
                                    border: '1px solid rgba(99, 102, 241, 0.25)',
                                    display: 'inline-block'
                                  }}>
                                    📚 {call.course && call.course !== '—' ? call.course : call.program}
                                  </span>
                                </div>
                              )}
                              {call.email && call.email !== '—' && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{call.email}</div>
                              )}
                            </td>

                            {/* 2. University */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <span className="college-badge" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                  🏫 {uniDisplayName}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                  {call.botName && call.botName !== '—' ? call.botName : 'Outbound Campaign'}
                                </span>
                              </div>
                            </td>

                            {/* 3. Call Date & Duration */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.82rem' }}>
                                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                                  {call.callDate !== '—' && !isNaN(new Date(call.callDate).getTime())
                                    ? new Date(call.callDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                    : (call.callDate || '—')}
                                </span>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                                  ⏱ {formatDuration(rawDuration)}
                                </span>
                              </div>
                            </td>

                            {/* 4. Lead Outcome */}
                            <td>
                              <span
                                style={{
                                  fontSize: '0.78rem',
                                  fontWeight: '700',
                                  backgroundColor: statusInfo.bg,
                                  color: statusInfo.color,
                                  border: `1px solid ${statusInfo.border}`,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <span>{statusInfo.icon}</span>
                                <span>{statusInfo.label}</span>
                              </span>
                            </td>

                            {/* 5. AI Feedback & Signals */}
                            <td>
                              {(() => {
                                const rf = call.rawFields || {};
                                const isFlagYes = (v) => {
                                  if (v === true) return true;
                                  if (!v) return false;
                                  const s = String(v).trim().toLowerCase();
                                  return s === 'yes' || s === 'true' || s === '1' || s === 'required';
                                };
                                const signals = [];

                                // Application Sent
                                if (isFlagYes(rf.application_sent || rf['Application Sent']) || primaryStatus === CALL_OUTCOME_STATUS.APPLICATION_SENT || isApplicationSent(call)) {
                                  signals.push({
                                    id: 'app_sent',
                                    icon: '📩',
                                    label: 'App Sent',
                                    bg: 'rgba(6, 182, 212, 0.15)',
                                    color: '#06b6d4',
                                    border: 'rgba(6, 182, 212, 0.35)'
                                  });
                                }

                                // Counsellor Follow-up
                                if (isFlagYes(rf.counsellor_follow_up || rf.counselor_follow_up || rf.counselor_followup) || isCounselorReq) {
                                  signals.push({
                                    id: 'counsellor',
                                    icon: '☎️',
                                    label: 'Counsellor Req',
                                    bg: 'rgba(45, 212, 191, 0.15)',
                                    color: '#2dd4bf',
                                    border: 'rgba(45, 212, 191, 0.35)'
                                  });
                                }

                                // Call Transferred Live
                                if (isFlagYes(rf.call_transfered_status || rf.call_transferred_status || call.transferStatus)) {
                                  signals.push({
                                    id: 'transferred',
                                    icon: '🔀',
                                    label: 'Transferred',
                                    bg: 'rgba(168, 85, 247, 0.15)',
                                    color: '#c084fc',
                                    border: 'rgba(168, 85, 247, 0.35)'
                                  });
                                }

                                // Admission Timeline (Future vs Immediate)
                                const timeline = String(rf.admission_timeline || rf.timeline || '').toLowerCase();
                                if (timeline.includes('next') || timeline.includes('future') || timeline.includes('2027')) {
                                  signals.push({
                                    id: 'timeline_next',
                                    icon: '⏳',
                                    label: 'Next Year (2027)',
                                    bg: 'rgba(245, 158, 11, 0.15)',
                                    color: '#fbbf24',
                                    border: 'rgba(245, 158, 11, 0.35)'
                                  });
                                } else if (timeline.includes('immediate') || timeline.includes('this') || timeline.includes('2026')) {
                                  signals.push({
                                    id: 'timeline_now',
                                    icon: '🚀',
                                    label: 'Immediate (2026)',
                                    bg: 'rgba(16, 185, 129, 0.15)',
                                    color: '#34d399',
                                    border: 'rgba(16, 185, 129, 0.35)'
                                  });
                                }

                                // Already Applied / Joined
                                if (isFlagYes(rf.already_applied || rf['Already Applied']) && primaryStatus !== CALL_OUTCOME_STATUS.ALREADY_APPLIED) {
                                  signals.push({
                                    id: 'already_applied',
                                    icon: '📝',
                                    label: 'Already Applied',
                                    bg: 'rgba(56, 189, 248, 0.15)',
                                    color: '#38bdf8',
                                    border: 'rgba(56, 189, 248, 0.35)'
                                  });
                                }
                                if (isFlagYes(rf.already_joined || rf['Already Joined']) && primaryStatus !== CALL_OUTCOME_STATUS.ALREADY_JOINED) {
                                  signals.push({
                                    id: 'already_joined',
                                    icon: '🎓',
                                    label: 'Already Enrolled',
                                    bg: 'rgba(168, 85, 247, 0.15)',
                                    color: '#a855f7',
                                    border: 'rgba(168, 85, 247, 0.35)'
                                  });
                                }

                                // Entrance Exam (e.g. CAT, GATE, ICET)
                                const exam = String(rf.entrance_exam || rf.entrance || rf.exam || '').trim();
                                if (exam && exam !== '—' && exam !== 'NA' && exam.toLowerCase() !== 'none' && exam.toLowerCase() !== 'not provided') {
                                  signals.push({
                                    id: 'exam',
                                    icon: '🎯',
                                    label: exam.length > 14 ? exam.slice(0, 12) + '...' : exam,
                                    bg: 'rgba(99, 102, 241, 0.15)',
                                    color: '#818cf8',
                                    border: 'rgba(99, 102, 241, 0.35)'
                                  });
                                }

                                // Graduation Status
                                const grad = String(rf.graduation_status || rf.graduation || '').trim();
                                if (grad && grad !== '—' && grad !== 'NA' && grad.toLowerCase() !== 'not provided') {
                                  const shortGrad = grad.toLowerCase().includes('final') ? 'Final Year' : (grad.toLowerCase().includes('completed') ? 'Grad Completed' : grad);
                                  signals.push({
                                    id: 'grad',
                                    icon: '🎓',
                                    label: shortGrad,
                                    bg: 'rgba(148, 163, 184, 0.15)',
                                    color: '#cbd5e1',
                                    border: 'rgba(148, 163, 184, 0.3)'
                                  });
                                }

                                if (signals.length === 0) {
                                  if (primaryStatus === CALL_OUTCOME_STATUS.NOT_INTERESTED) {
                                    return <span style={{ fontSize: '0.76rem', color: '#f87171', fontStyle: 'italic' }}>Declined admission</span>;
                                  }
                                  if (primaryStatus === CALL_OUTCOME_STATUS.CALLBACK) {
                                    return <span style={{ fontSize: '0.76rem', color: '#fbbf24', fontStyle: 'italic' }}>Callback requested</span>;
                                  }
                                  if (primaryStatus === CALL_OUTCOME_STATUS.NOT_ANSWERED) {
                                    return <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Unanswered / Voicemail</span>;
                                  }
                                  return <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>—</span>;
                                }

                                return (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', maxWidth: '320px' }}>
                                    {signals.map((sig) => (
                                      <span
                                        key={sig.id}
                                        style={{
                                          fontSize: '0.72rem',
                                          fontWeight: '700',
                                          padding: '0.2rem 0.5rem',
                                          borderRadius: '4px',
                                          backgroundColor: sig.bg,
                                          color: sig.color,
                                          border: `1px solid ${sig.border}`,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.25rem',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        <span>{sig.icon}</span>
                                        <span>{sig.label}</span>
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()}
                            </td>

                            {/* 6. Actions */}
                            <td>
                              <button
                                className={`btn-detail ${isHot ? 'hot' : statusInfo.class}`}
                                onClick={() => openCallModal(call)}
                              >
                                <FileText size={14} /> Detail Report
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 3: RECENT CALL LOGS */}
        {/* ========================================== */}
        {activeTab === 'calls' && (
          <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h1>Recent Outbound Call Logs</h1>
                <p>Full synchronized history of dispatches and agent conversation transcripts from OmniDimension.</p>
              </div>

              <button onClick={triggerReloadCalls} className="btn btn-secondary">
                <RefreshCw size={16} /> Sync Calls
              </button>
            </div>

            <div className="card" style={{ padding: '1rem' }}>
              {calls.length === 0 ? (
                <div className="empty-state">
                  <PhoneCall className="empty-icon" />
                  <h3>No call history found</h3>
                  <p>Start a sequential campaign from the Dispatch Console to trigger live Voice AI calls.</p>
                </div>
              ) : (
                <div className="calls-table-container">
                  <table className="calls-table">
                    <thead>
                      <tr>
                        <th>Recipient</th>
                        <th>Status</th>
                        <th>Duration (MM:SS)</th>
                        <th>Call Log ID</th>
                        <th>Call Transcript Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calls.map((call, idx) => {
                        const contact = call.to_number || call.phone_number || call.to || '—';
                        const status = call.call_status || call.status || '—';
                        const rawDuration = call.call_duration || call.duration || '—';
                        const id = call.id || call.call_log_id || `call-${idx}`;
                        const transcript = call.call_conversation || call.transcript || call.conversation || '';
                        const hasTranscript = Boolean(transcript && String(transcript).trim().length > 0);

                        return (
                          <tr key={id}>
                            <td style={{ fontWeight: '600', fontFamily: 'var(--mono)', fontSize: '0.9rem' }}>{contact}</td>
                            <td>
                              <span className={`status-pill ${status.toLowerCase() === 'completed' || hasTranscript ? 'completed' : 'canceled'}`}>
                                {status.toLowerCase() === 'completed' || hasTranscript ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                {status}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: '0.9rem' }}>{formatDuration(rawDuration)}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'var(--mono)' }}>#{id}</td>
                            <td>
                              {hasTranscript ? (
                                <button
                                  className="btn"
                                  style={{
                                    padding: '0.35rem 0.75rem',
                                    fontSize: '0.82rem',
                                    borderRadius: '6px',
                                    backgroundColor: '#0d9488',
                                    color: '#ffffff',
                                    border: 'none',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => setSelectedCall(call)}
                                >
                                  <FileText size={14} />
                                  YES (View Transcript)
                                </button>
                              ) : (
                                <span className="status-pill canceled" style={{ fontSize: '0.78rem' }}>
                                  NO (Not Answered)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Redesigned Call Detail Drawer/Modal Overlay */}
      {selectedCall && (() => {
        // Fallback-friendly destructured fields for selectedCall supporting both snake_case (direct API) and camelCase (sheets cache)
        const id = selectedCall.id || 'N/A';
        const studentName = selectedCall.studentName || selectedCall.student_name || 'Student';
        const contactNumber = selectedCall.contactNumber || selectedCall.to_number || selectedCall.phone_number || '—';
        const email = selectedCall.email || '—';
        const educationStatus = selectedCall.educationStatus || selectedCall.current_qualification || '—';
        const leadStatus = selectedCall.leadStatus || selectedCall.lead_status || '—';
        const interestLevel = selectedCall.interestLevel || selectedCall.interest_level || '—';
        const callOutcome = selectedCall.callOutcome || selectedCall.call_status || selectedCall.status || '—';

        // Date parsing safety
        const rawDate = selectedCall.callDate || selectedCall.call_date || selectedCall.time_of_call || selectedCall.create_date || '—';
        const callDate = rawDate !== '—' && !isNaN(new Date(rawDate).getTime())
          ? new Date(rawDate).toLocaleString()
          : rawDate;

        const program = selectedCall.program || selectedCall.program_type || '—';
        const course = selectedCall.course || selectedCall.preferred_course || '—';
        const preferredState = selectedCall.preferredState || selectedCall.preferred_state || '—';
        const preferredCity = selectedCall.preferredCity || selectedCall.preferred_city || '—';
        const entranceExam = selectedCall.entranceExam || selectedCall.entrance_exam || '—';

        const counselorRequired = selectedCall.counselorRequired || selectedCall.counselor_required || '—';
        const callbackRequired = selectedCall.callbackRequired || selectedCall.callback_required || '—';
        const universitiesDiscussed = selectedCall.universitiesDiscussed || selectedCall.universities_discussed || '—';
        const questionsAsked = selectedCall.questionsAsked || selectedCall.questions_asked || '—';
        const summary = selectedCall.summary || 'No conversation transcript/summary recorded.';
        const notes = selectedCall.notes || selectedCall.additional_notes || '—';

        // Extra vital fields with fallback checks
        // Prefer the absolute internal_recording_url; Omni also returns a relative
        // /api/v1/recording/... path which needs the dashboard host prefix to play.
        let recordingUrl = selectedCall.internal_recording_url || selectedCall.recordingUrl || selectedCall.recording_url || (selectedCall.rawFields && selectedCall.rawFields.recording_url) || '';
        if (recordingUrl && String(recordingUrl).startsWith('/api/')) {
          recordingUrl = `https://omnidim.io${recordingUrl}`;
        }
        const transferStatus = selectedCall.transferStatus || selectedCall.call_transfered_status || (selectedCall.rawFields && selectedCall.rawFields.call_transfered_status) || '—';
        const preferredUniversity = selectedCall.preferredUniversity || selectedCall.preferred_university || (selectedCall.rawFields && selectedCall.rawFields.preferred_university) || '—';
        const sentiment = selectedCall.sentiment || (selectedCall.rawFields && selectedCall.rawFields.sentiment) || '—';
        const botName = selectedCall.botName || selectedCall.bot_name || (selectedCall.rawFields && selectedCall.rawFields.bot_name) || '—';
        const callDuration = selectedCall.callDuration || selectedCall.duration || selectedCall.call_duration_in_seconds || (selectedCall.rawFields && selectedCall.rawFields.call_duration_in_seconds) || '—';

        const isHot = String(leadStatus).toUpperCase().includes('HOT');
        const primaryStatus = getPrimaryCallStatus(selectedCall);
        const modalStatusInfo = getStatusDisplay(primaryStatus);

        return (
          <div className="modal-overlay" onClick={() => setSelectedCall(null)}>
            <div className="modal-content" style={{ maxWidth: '820px', width: '90%' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <i style={{ color: 'var(--accent)', fontStyle: 'normal' }}>◈</i> Lead Analysis Report
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Call ID: #{id}</span>
                </div>
                <button className="modal-close" onClick={() => setSelectedCall(null)}>×</button>
              </div>

              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '1.5rem 0' }}>

                {/* Sections Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                  {/* Row 1: Student Info & Lead Qualification */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>

                    {/* Student Info Card */}
                    <div className="card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: '700', marginBottom: '0.85rem', color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>👤 Student Profile</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Name:</span>
                          <span style={{ fontWeight: '600' }}>{studentName}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Contact:</span>
                          <span style={{ fontWeight: '600', fontFamily: 'var(--mono)' }}>{contactNumber}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Email:</span>
                          <span style={{ fontWeight: '600' }}>{email}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Education Status:</span>
                          <span style={{ fontWeight: '600' }}>{educationStatus}</span>
                        </div>
                      </div>
                    </div>

                    {/* Lead Qualification Card */}
                    <div className="card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: '700', marginBottom: '0.85rem', color: '#2dd4bf', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🎯 Qualification & Outcome</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Final Outcome:</span>
                          <span style={{
                            fontWeight: '800',
                            fontSize: '0.78rem',
                            padding: '0.25rem 0.65rem',
                            borderRadius: '6px',
                            backgroundColor: modalStatusInfo.bg,
                            color: modalStatusInfo.color,
                            border: `1px solid ${modalStatusInfo.color}40`
                          }}>
                            {modalStatusInfo.icon} {modalStatusInfo.label}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Lead Status:</span>
                          <span style={{
                            fontWeight: '700',
                            fontSize: '0.78rem',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '4px',
                            backgroundColor: isHot ? 'rgba(239, 68, 68, 0.15)' : modalStatusInfo.bg,
                            color: isHot ? '#ef4444' : modalStatusInfo.color
                          }}>{leadStatus}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Interest Level:</span>
                          <span style={{ fontWeight: '600' }}>{interestLevel}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Call Outcome:</span>
                          <span style={{ fontWeight: '600' }}>{callOutcome}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Call Date & Time:</span>
                          <span style={{ fontWeight: '600' }}>{callDate}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Target University:</span>
                          <span style={{ fontWeight: '600' }}>{getUniversityName(getCallUniversityId(selectedCall))}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Call Duration:</span>
                          <span style={{ fontWeight: '600' }}>{formatDuration(callDuration)}</span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Row 2: Admission Preference & Counselor Follow-up */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>

                    {/* Preferences Card */}
                    <div className="card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: '700', marginBottom: '0.85rem', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🎓 Academic Preference</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Program Level:</span>
                          <span style={{ fontWeight: '600' }}>{program}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Preferred Course:</span>
                          <span style={{ fontWeight: '600' }}>{course}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Preferred University:</span>
                          <span style={{ fontWeight: '600', maxWidth: '200px', textAlign: 'right', wordBreak: 'break-word' }}>{preferredUniversity}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Target State/City:</span>
                          <span style={{ fontWeight: '600' }}>{preferredState || preferredCity ? `${preferredState} / ${preferredCity}` : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Entrance Exam:</span>
                          <span style={{ fontWeight: '600' }}>{entranceExam}</span>
                        </div>
                      </div>
                    </div>

                    {/* Follow-up Requirements Card */}
                    <div className="card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: '700', marginBottom: '0.85rem', color: '#ec4899', textTransform: 'uppercase', letterSpacing: '0.5px' }}>☎ Counselor Follow-up</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Counselor Follow-up:</span>
                          <span style={{
                            fontWeight: '700',
                            color: isCounselorFollowupRequired(selectedCall) ? '#2dd4bf' : 'var(--text-primary)'
                          }}>{isCounselorFollowupRequired(selectedCall) ? 'Required (Yes)' : 'No'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Callback Required:</span>
                          <span style={{
                            fontWeight: '700',
                            color: String(callbackRequired).toLowerCase().includes('yes') || primaryStatus === CALL_OUTCOME_STATUS.CALLBACK ? '#fbbf24' : 'var(--text-primary)'
                          }}>{String(callbackRequired).toLowerCase().includes('yes') || primaryStatus === CALL_OUTCOME_STATUS.CALLBACK ? 'Yes' : 'No'}</span>
                        </div>
                        {getCallbackTime(selectedCall) && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Callback Time:</span>
                            <span style={{ fontWeight: '700', color: '#fbbf24' }}>🕒 {getCallbackTime(selectedCall)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Universities Discussed:</span>
                          <span style={{ fontWeight: '600', maxWidth: '200px', textAlign: 'right', wordBreak: 'break-word' }}>{universitiesDiscussed}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Questions Asked:</span>
                          <span style={{ fontWeight: '600', maxWidth: '200px', textAlign: 'right', wordBreak: 'break-word' }}>{questionsAsked}</span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Call Audio Recording & Call Meta */}
                  {recordingUrl && recordingUrl !== '—' && (
                    <div className="card" style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: '700', margin: 0, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Volume2 size={16} /> 🎙️ Call Audio Recording & Outcomes
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'center' }}>
                        <div>
                          <audio
                            controls
                            src={recordingUrl}
                            style={{ width: '100%', borderRadius: '8px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Call Transferred to Counselor:</span>
                            <span style={{ fontWeight: '600', color: String(transferStatus).toLowerCase().includes('yes') ? '#22c55e' : 'var(--text-primary)' }}>{transferStatus}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>AI Call Sentiment:</span>
                            <span style={{ fontWeight: '600', color: String(sentiment).toLowerCase().includes('positive') ? '#22c55e' : String(sentiment).toLowerCase().includes('negative') ? '#ef4444' : 'var(--text-primary)' }}>{sentiment}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                {/* AI Conversation Summary */}
                <div className="card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', marginTop: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: '700', marginBottom: '0.75rem', color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📝 Conversation Intelligence Summary</h3>
                  <p style={{ fontSize: '0.88rem', lineHeight: '1.45', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', whiteSpace: 'pre-wrap' }}>
                    {summary}
                  </p>
                </div>

                {/* Conversation Transcript Dialogue */}
                <div className="card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', marginTop: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: '700', marginBottom: '0.75rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💬 Conversation Transcript Dialogue</h3>
                  <div style={{ maxHeight: '350px', overflowY: 'auto', borderRadius: '8px' }}>
                    {renderTranscript(getTranscriptText(selectedCall))}
                  </div>
                </div>

                {/* Counselor Follow-up Notes */}
                <div className="card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', marginTop: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: '700', marginBottom: '0.75rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📌 Counselor Follow-up Notes</h3>
                  <p style={{ fontSize: '0.88rem', lineHeight: '1.45', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', whiteSpace: 'pre-wrap' }}>
                    {notes}
                  </p>
                </div>

                {/* Dynamic Extra Columns Panel */}
                {(() => {
                  const standardKeys = [
                    'Call ID', 'Timestamp', 'Student Name', 'Contact Number', 'Email',
                    'Program', 'Course', 'Preferred State', 'Preferred City', 'Lead Status',
                    'Interest Level', 'Counselor Required', 'Callback Required', 'Entrance Exam',
                    'Education Status', 'Questions Asked', 'Universities Discussed',
                    'Call Outcome Summary', 'Additional Notes', 'Call Outcome', 'id',
                    'recordingUrl', 'recording_url', 'transferStatus', 'call_transfered_status',
                    'preferredUniversity', 'preferred_university', 'sentiment', 'botName', 'bot_name',
                    'callDuration', 'call_duration_in_seconds', 'duration'
                  ];

                  const rawFields = selectedCall.rawFields || {};
                  const extraFields = Object.keys(rawFields).filter(k => {
                    return !standardKeys.some(sk => sk.toLowerCase() === k.toLowerCase());
                  });

                  if (extraFields.length === 0) return null;

                  return (
                    <div className="card" style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', marginTop: '1.5rem' }}>
                      <h3 style={{ fontSize: '0.92rem', fontWeight: '700', marginBottom: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ℹ️ Additional Sheet Variables</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                        {extraFields.map(field => (
                          <div key={field} style={{ backgroundColor: 'rgba(0,0,0,0.15)', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{field}</div>
                            <div style={{ fontSize: '0.82rem', fontWeight: '600' }}>{rawFields[field] || '—'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setSelectedCall(null)}>Close Analysis</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add College Modal */}
      {showCollegeModal && (
        <div className="modal-overlay" onClick={() => setShowCollegeModal(false)}>
          <div className="modal-content" style={{ maxWidth: '620px', width: '92%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <GraduationCap size={20} /> {editingCollegeId ? 'Edit College' : 'Add New College'}
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Saved colleges appear in sequence calling, WhatsApp links, and analytics filters.
                </span>
              </div>
              <button className="modal-close" onClick={() => setShowCollegeModal(false)}>×</button>
            </div>

            <form onSubmit={handleSaveCollege}>
              <div className="modal-body" style={{ padding: '1.25rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">College Name *</label>
                    <input
                      className="form-input"
                      value={collegeForm.name}
                      onChange={(e) => setCollegeForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="CBIT Hyderabad"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Place / City</label>
                    <input
                      className="form-input"
                      value={collegeForm.place}
                      onChange={(e) => setCollegeForm(prev => ({ ...prev, place: e.target.value }))}
                      placeholder="Gandipet, Hyderabad"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Available Courses</label>
                  <input
                    className="form-input"
                    value={collegeForm.courses}
                    onChange={(e) => setCollegeForm(prev => ({ ...prev, courses: e.target.value }))}
                    placeholder="B.Tech CSE, B.Tech ECE, MBA"
                  />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Comma-separated — e.g. B.Tech CSE, MBA. Shown below the college name and selectable in Step 2.</span>
                </div>

                <div className="form-group">
                  <label className="form-label">Application / Website Link</label>
                  <input
                    className="form-input"
                    value={collegeForm.websiteUrl}
                    onChange={(e) => setCollegeForm(prev => ({ ...prev, websiteUrl: e.target.value }))}
                    placeholder="https://college.edu/admissions"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Languages</label>
                  <input
                    className="form-input"
                    value={collegeForm.languages}
                    onChange={(e) => setCollegeForm(prev => ({ ...prev, languages: e.target.value }))}
                    placeholder="English, Hindi, Telugu"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={collegeForm.description}
                    onChange={(e) => setCollegeForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Admissions outreach notes for this college bot"
                  />
                </div>

                {/* Existing Saved Colleges Quick Delete Section */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>
                    Existing Saved Colleges ({universities.length}) — Click Delete to remove:
                  </label>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingRight: '0.25rem' }}>
                    {universities.map(uni => (
                      <div key={uni.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', backgroundColor: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <div>
                          <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>🎓 {uni.name}</strong>
                          {uni.place && <span style={{ fontSize: '0.76rem', color: '#818cf8', marginLeft: '0.4rem' }}>({uni.place})</span>}
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>🕒 {uni.createdAt ? new Date(uni.createdAt).toLocaleString() : '—'}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-danger-outline"
                          style={{ padding: '0.2rem 0.55rem', fontSize: '0.74rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.1)', fontWeight: '700' }}
                          disabled={deletingCollegeId === uni.id}
                          onClick={() => handleDeleteCollege(uni)}
                        >
                          <Trash2 size={12} /> {deletingCollegeId === uni.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowCollegeModal(false);
                    resetCollegeForm();
                  }}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={isSavingCollege}>
                  <Save size={15} /> {isSavingCollege ? 'Saving...' : (editingCollegeId ? 'Update College' : 'Save College')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: CAMPAIGN RECIPIENT STUDENT TABLE MODAL */}
      {selectedCampaignDetail && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 3500,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(6px)'
          }}
          onClick={() => {
            setSelectedCampaignDetail(null);
            if (!cameFromPastCampaignsModal) setShowPastCampaignsModal(false);
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '1050px',
              width: '95%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.3)'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div>
                {cameFromPastCampaignsModal && (
                  <button
                    type="button"
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.82rem',
                      fontWeight: '700',
                      color: '#1e293b',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      marginBottom: '0.65rem'
                    }}
                    onClick={() => setSelectedCampaignDetail(null)}
                  >
                    ← Back to Campaigns
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#1b3b6f' }}>
                    📢 {selectedCampaignDetail.name}
                  </h3>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      textTransform: 'uppercase',
                      backgroundColor: selectedCampaignDetail.status === 'in-progress' ? '#eff6ff' : '#ecfdf5',
                      color: selectedCampaignDetail.status === 'in-progress' ? '#1d4ed8' : '#047857',
                      border: selectedCampaignDetail.status === 'in-progress' ? '1px solid #bfdbfe' : '1px solid #a7f3d0'
                    }}
                  >
                    {(selectedCampaignDetail.status || 'completed').toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.4rem', fontSize: '0.82rem', color: '#64748b' }}>
                  <span style={{ backgroundColor: '#f1f5f9', color: '#1b3b6f', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: '600', border: '1px solid #e2e8f0' }}>
                    🎓 {selectedCampaignDetail.universityName}
                  </span>
                  {selectedCampaignDetail.course && (
                    <span style={{ backgroundColor: '#f0fdf4', color: '#15803d', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: '600', border: '1px solid #bbf7d0' }}>
                      📚 {selectedCampaignDetail.course}
                    </span>
                  )}
                  <span>🕒 Started: <strong style={{ color: '#334155' }}>{selectedCampaignDetail.startedAt ? new Date(selectedCampaignDetail.startedAt).toLocaleString() : '—'}</strong></span>
                  <span>👥 Total: <strong style={{ color: '#0f172a' }}>{selectedCampaignDetail.contacts?.length || 0} Contacts</strong></span>
                </div>
              </div>

              <button
                type="button"
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  setSelectedCampaignDetail(null);
                  setShowPastCampaignsModal(false);
                  setCameFromPastCampaignsModal(false);
                }}
              >
                ✕ Close
              </button>
            </div>

            {/* Filter & Multi-Select Toolbar */}
            {(() => {
              const allContacts = selectedCampaignDetail.contacts || [];
              const filteredContacts = allContacts.filter(c => {
                const q = pastCampaignSearch.trim().toLowerCase();
                const matchesSearch = !q || `${c.name} ${c.phone} ${c.formattedPhone}`.toLowerCase().includes(q);
                const matchesStatus = campaignContactStatusFilter === 'ALL' || c.status === campaignContactStatusFilter;
                return matchesSearch && matchesStatus;
              });

              const allFilteredChecked = filteredContacts.length > 0 && filteredContacts.every(c => campaignCheckedContacts.some(chk => (chk.phone || chk.formattedPhone) === (c.phone || c.formattedPhone)));

              const toggleSelectAll = () => {
                if (allFilteredChecked) {
                  // Deselect all filtered
                  setCampaignCheckedContacts(prev => prev.filter(chk => !filteredContacts.some(c => (c.phone || c.formattedPhone) === (chk.phone || chk.formattedPhone))));
                } else {
                  // Select all filtered
                  const map = new Map();
                  [...campaignCheckedContacts, ...filteredContacts].forEach(c => {
                    const key = c.phone || c.formattedPhone;
                    if (key) map.set(key, c);
                  });
                  setCampaignCheckedContacts(Array.from(map.values()));
                }
              };

              const toggleContactCheck = (contact) => {
                const key = contact.phone || contact.formattedPhone;
                setCampaignCheckedContacts(prev => {
                  const exists = prev.some(c => (c.phone || c.formattedPhone) === key);
                  if (exists) {
                    return prev.filter(c => (c.phone || c.formattedPhone) !== key);
                  } else {
                    return [...prev, contact];
                  }
                });
              };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    {/* Search & Status Filter */}
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                      <div style={{ position: 'relative', minWidth: '180px', flex: '1 1 200px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '0.75rem', color: '#94a3b8' }} />
                        <input
                          className="form-input"
                          style={{ fontSize: '0.84rem', padding: '0.45rem 0.6rem 0.45rem 2.2rem', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
                          placeholder="Search student or phone..."
                          value={pastCampaignSearch}
                          onChange={(e) => setPastCampaignSearch(e.target.value)}
                        />
                      </div>

                      <select
                        className="form-input"
                        style={{ fontSize: '0.84rem', padding: '0.45rem 0.75rem', minWidth: '140px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
                        value={campaignContactStatusFilter}
                        onChange={(e) => setCampaignContactStatusFilter(e.target.value)}
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="completed">Completed / Answered</option>
                        <option value="no-answer">No Answer</option>
                        <option value="queued">Queued</option>
                      </select>

                      <button
                        type="button"
                        style={{
                          fontSize: '0.82rem',
                          padding: '0.45rem 0.85rem',
                          backgroundColor: allFilteredChecked ? '#f1f5f9' : '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          color: '#1e293b',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                        onClick={toggleSelectAll}
                      >
                        {allFilteredChecked ? 'Deselect All' : `Select All (${filteredContacts.length})`}
                      </button>
                    </div>

                    {/* Action: Add to New Campaign & Download */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={{
                          fontSize: '0.82rem',
                          padding: '0.45rem 0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          backgroundColor: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          borderRadius: '8px',
                          color: '#047857',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                        onClick={() => handleDownloadCampaignExcel(selectedCampaignDetail)}
                        title="Download formatted Excel report (.xlsx)"
                      >
                        <Download size={14} /> Download Excel (.xlsx)
                      </button>

                      <button
                        type="button"
                        style={{
                          fontSize: '0.82rem',
                          padding: '0.45rem 0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          color: '#475569',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                        onClick={() => handleDownloadCampaignCsv(selectedCampaignDetail.id, selectedCampaignDetail.name)}
                        title="Download CSV"
                      >
                        <Download size={14} /> CSV
                      </button>

                      <button
                        type="button"
                        style={{
                          fontSize: '0.85rem',
                          padding: '0.5rem 1.15rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          backgroundColor: campaignCheckedContacts.length > 0 ? '#F16522' : '#cbd5e1',
                          border: 'none',
                          borderRadius: '8px',
                          color: '#ffffff',
                          fontWeight: '700',
                          cursor: campaignCheckedContacts.length > 0 ? 'pointer' : 'not-allowed',
                          boxShadow: campaignCheckedContacts.length > 0 ? '0 4px 12px rgba(241, 101, 34, 0.25)' : 'none'
                        }}
                        disabled={campaignCheckedContacts.length === 0}
                        onClick={() => handleLoadContactsToNewCampaign(campaignCheckedContacts)}
                      >
                        <Plus size={15} /> Add Selected ({campaignCheckedContacts.length}) to New Campaign
                      </button>
                    </div>
                  </div>

                  {/* Student Table */}
                  <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff' }}>
                    <table style={{ fontSize: '0.84rem', margin: 0, width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ width: '40px', textAlign: 'center', padding: '0.65rem 0.5rem' }}>
                            <input
                              type="checkbox"
                              checked={allFilteredChecked}
                              onChange={toggleSelectAll}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                          </th>
                          <th style={{ width: '50px', padding: '0.65rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>#</th>
                          <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Student Name</th>
                          <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Phone Number</th>
                          <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Course</th>
                          <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Call Outcome</th>
                          <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Duration</th>
                          <th style={{ textAlign: 'right', padding: '0.65rem 0.75rem', color: '#475569', fontWeight: '700' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredContacts.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                              No contacts matched search or filter.
                            </td>
                          </tr>
                        ) : (
                          filteredContacts.map((contact, idx) => {
                            const isChecked = campaignCheckedContacts.some(chk => (chk.phone || chk.formattedPhone) === (contact.phone || contact.formattedPhone));

                            return (
                              <tr
                                key={contact.id || `${contact.phone}-${idx}`}
                                style={{
                                  backgroundColor: isChecked ? '#eff6ff' : (idx % 2 === 0 ? '#ffffff' : '#fcfcfd'),
                                  borderBottom: '1px solid #f1f5f9',
                                  transition: 'background-color 0.15s ease'
                                }}
                              >
                                <td style={{ textAlign: 'center', padding: '0.6rem 0.5rem' }}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleContactCheck(contact)}
                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                  />
                                </td>
                                <td style={{ padding: '0.6rem 0.75rem', color: '#64748b', fontWeight: '600' }}>{idx + 1}</td>
                                <td style={{ padding: '0.6rem 0.75rem' }}>
                                  <strong style={{ color: '#0f172a' }}>{contact.name || 'Student'}</strong>
                                </td>
                                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--mono)', color: '#2563eb', fontWeight: '700' }}>
                                  {contact.formattedPhone || contact.phone}
                                </td>
                                <td style={{ padding: '0.6rem 0.75rem' }}>
                                  <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: '500' }}>
                                    {contact.course || selectedCampaignDetail.course || '—'}
                                  </span>
                                </td>
                                <td style={{ padding: '0.6rem 0.75rem' }}>
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: '700',
                                      padding: '0.2rem 0.55rem',
                                      borderRadius: '6px',
                                      display: 'inline-block',
                                      backgroundColor: contact.status === 'completed' ? '#ecfdf5' : (contact.status === 'no-answer' ? '#fff1f2' : '#f8fafc'),
                                      color: contact.status === 'completed' ? '#047857' : (contact.status === 'no-answer' ? '#e11d48' : '#64748b'),
                                      border: contact.status === 'completed' ? '1px solid #a7f3d0' : (contact.status === 'no-answer' ? '1px solid #fecdd3' : '1px solid #e2e8f0')
                                    }}
                                  >
                                    {contact.callOutcome || (contact.status === 'completed' ? 'Completed' : (contact.status === 'no-answer' ? 'No Answer' : 'Queued'))}
                                  </span>
                                </td>
                                <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'var(--mono)', fontSize: '0.78rem', color: '#64748b' }}>
                                  {contact.callDuration || '—'}
                                </td>
                                <td style={{ textAlign: 'right', padding: '0.6rem 0.75rem' }}>
                                  <button
                                    type="button"
                                    style={{
                                      fontSize: '0.76rem',
                                      padding: '0.3rem 0.75rem',
                                      borderRadius: '6px',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      border: isChecked ? '1px solid #10b981' : '1px solid #cbd5e1',
                                      backgroundColor: isChecked ? '#ecfdf5' : '#ffffff',
                                      color: isChecked ? '#047857' : '#1e293b',
                                      transition: 'all 0.15s ease'
                                    }}
                                    onClick={() => toggleContactCheck(contact)}
                                    title={isChecked ? 'Click to deselect' : 'Click to select contact'}
                                  >
                                    {isChecked ? '✓ Selected' : '+ Select'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Modal Footer Bottom */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                        Selected <strong style={{ color: '#F16522', fontSize: '1rem' }}>{campaignCheckedContacts.length}</strong> of {allContacts.length} recipients
                      </span>
                      {campaignCheckedContacts.length > 0 && (
                        <button
                          type="button"
                          style={{ fontSize: '0.78rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => setCampaignCheckedContacts([])}
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button
                        type="button"
                        style={{
                          padding: '0.55rem 1rem',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#f8fafc',
                          color: '#475569',
                          fontWeight: '600',
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setSelectedCampaignDetail(null);
                          if (!cameFromPastCampaignsModal) setShowPastCampaignsModal(false);
                        }}
                      >
                        {cameFromPastCampaignsModal ? 'Back to Campaigns' : 'Close'}
                      </button>

                      <button
                        type="button"
                        style={{
                          padding: '0.55rem 1.4rem',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: campaignCheckedContacts.length > 0 ? '#F16522' : '#cbd5e1',
                          color: '#ffffff',
                          fontWeight: '700',
                          fontSize: '0.9rem',
                          cursor: campaignCheckedContacts.length > 0 ? 'pointer' : 'not-allowed',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          boxShadow: campaignCheckedContacts.length > 0 ? '0 4px 12px rgba(241, 101, 34, 0.25)' : 'none'
                        }}
                        disabled={campaignCheckedContacts.length === 0}
                        onClick={() => handleLoadContactsToNewCampaign(campaignCheckedContacts)}
                      >
                        <ArrowRight size={16} /> Stage Selected ({campaignCheckedContacts.length}) to Step 2
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL 2: BROWSE EXISTING CAMPAIGNS TO ADD TO NEW CAMPAIGN */}
      {showPastCampaignsModal && (
        <div
          className="modal-overlay"
          style={{ zIndex: 2500, backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(5px)' }}
          onClick={() => setShowPastCampaignsModal(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '960px',
              width: '95%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '1.75rem',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.25)'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#1b3b6f', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FolderOpen size={22} style={{ color: '#F16522' }} /> Choose from Existing Campaigns
                </h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                  Select past campaigns to inspect contacts or load recipients directly into Step 2 for sequential calling.
                </p>
              </div>

              <button
                type="button"
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  cursor: 'pointer'
                }}
                onClick={() => setShowPastCampaignsModal(false)}
              >
                ✕ Close
              </button>
            </div>

            {/* Filter toolbar */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
                <Search size={15} style={{ position: 'absolute', left: '0.8rem', top: '0.75rem', color: '#94a3b8' }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: '2.3rem', fontSize: '0.86rem', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
                  placeholder="Search campaigns..."
                  value={pastCampaignSearch}
                  onChange={(e) => setPastCampaignSearch(e.target.value)}
                />
              </div>

              <select
                className="form-input"
                style={{ minWidth: '220px', fontSize: '0.86rem', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a' }}
                value={pastCampaignUniFilter}
                onChange={(e) => setPastCampaignUniFilter(e.target.value)}
              >
                <option value="ALL">All Universities ({universities.length})</option>
                {universities.map(u => (
                  <option key={u.id} value={u.id}>🎓 {u.name}</option>
                ))}
              </select>
            </div>

            {/* Campaign Cards List */}
            {(() => {
              const filtered = campaigns.filter(c => {
                const q = pastCampaignSearch.trim().toLowerCase();
                const matchesSearch = !q || `${c.name} ${c.universityName} ${c.course}`.toLowerCase().includes(q);
                const matchesUni = pastCampaignUniFilter === 'ALL' || c.universityId === pastCampaignUniFilter;
                return matchesSearch && matchesUni;
              });

              if (filtered.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#64748b' }}>
                    <FolderOpen size={44} style={{ margin: '0 auto 0.75rem', opacity: 0.4, color: '#94a3b8' }} />
                    <p style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>No matching campaigns found.</p>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.84rem' }}>Try clearing your search query or university filter.</p>
                  </div>
                );
              }

              return (
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingRight: '0.3rem' }}>
                  {filtered.map(camp => {
                    const contactsCount = camp.contacts?.length || camp.totalCount || 0;
                    const campStarted = camp.startedAt ? new Date(camp.startedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

                    return (
                      <div
                        key={camp.id}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          padding: '1.15rem 1.25rem',
                          backgroundColor: '#ffffff',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '1rem',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                        }}
                      >
                        <div style={{ flex: '1 1 300px', minWidth: '240px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                            <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: '800', color: '#1b3b6f' }}>
                              📢 {camp.name}
                            </h4>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: '700',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                backgroundColor: camp.status === 'in-progress' ? '#eff6ff' : '#ecfdf5',
                                color: camp.status === 'in-progress' ? '#1d4ed8' : '#047857',
                                border: camp.status === 'in-progress' ? '1px solid #bfdbfe' : '1px solid #a7f3d0'
                              }}
                            >
                              {(camp.status || 'completed').toUpperCase()}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.35rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#1b3b6f', backgroundColor: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                              🎓 {camp.universityName}
                            </span>
                            {camp.course && (
                              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#15803d', backgroundColor: '#f0fdf4', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                                📚 {camp.course}
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                            🕒 Started: <strong style={{ color: '#334155' }}>{campStarted}</strong> • Total Students: <b style={{ color: '#0f172a' }}>{contactsCount}</b>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            style={{
                              fontSize: '0.82rem',
                              padding: '0.5rem 0.95rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              backgroundColor: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              color: '#1e293b',
                              borderRadius: '8px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                            onClick={() => {
                              setSelectedCampaignDetail(camp);
                              setCampaignCheckedContacts([]);
                              setCameFromPastCampaignsModal(true);
                            }}
                          >
                            <span>👁️</span> View & Select Students ({contactsCount})
                          </button>

                          <button
                            type="button"
                            style={{
                              fontSize: '0.82rem',
                              padding: '0.5rem 1.1rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              backgroundColor: '#F16522',
                              border: 'none',
                              color: '#ffffff',
                              borderRadius: '8px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              boxShadow: '0 4px 10px rgba(241, 101, 34, 0.2)'
                            }}
                            onClick={() => handleLoadContactsToNewCampaign(camp.contacts || [])}
                          >
                            <Plus size={14} /> Load All ({contactsCount}) into Step 2
                          </button>

                          <button
                            type="button"
                            style={{
                              fontSize: '0.82rem',
                              padding: '0.5rem 0.75rem',
                              backgroundColor: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              color: '#047857',
                              borderRadius: '8px',
                              cursor: 'pointer'
                            }}
                            onClick={() => handleDownloadCampaignExcel(camp)}
                            title="Download Excel (.xlsx)"
                          >
                            <Download size={14} />
                          </button>

                          <button
                            type="button"
                            style={{
                              fontSize: '0.82rem',
                              padding: '0.5rem 0.75rem',
                              backgroundColor: '#ffffff',
                              border: '1px solid #cbd5e1',
                              color: '#475569',
                              borderRadius: '8px',
                              cursor: 'pointer'
                            }}
                            onClick={() => handleDownloadCampaignCsv(camp.id, camp.name)}
                            title="Download CSV"
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                style={{
                  padding: '0.5rem 1.1rem',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  cursor: 'pointer'
                }}
                onClick={() => setShowPastCampaignsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Floating Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === 'success' && <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />}
            {toast.type === 'error' && <XCircle size={18} style={{ color: 'var(--error)' }} />}
            {toast.type === 'info' && <AlertCircle size={18} style={{ color: 'var(--accent)' }} />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
