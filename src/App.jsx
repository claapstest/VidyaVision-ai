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
  AlertTriangle
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
  const [tempInputMode, setTempInputMode] = useState(''); // 'manual' | 'bulk' | 'excel'
  const [selectedUniversity, setSelectedUniversity] = useState('vidyavision');
  const [uniSearchDialer, setUniSearchDialer] = useState('');
  const [uniSearchDashboard, setUniSearchDashboard] = useState('');
  const [showLogs, setShowLogs] = useState(false);

  const DEFAULT_COLLEGES = [
    {
      id: 'vidyavision',
      name: 'Vidyavision AI Assistant',
      place: 'Hyderabad, Telangana',
      agentId: 257941,
      languages: 'Telugu, English, Hindi, Tamil, Malayalam',
      status: 'active',
      websiteUrl: 'https://vidyavision.com/admissions',
      description: 'Multilingual south-region admission outreach.'
    },
    {
      id: 'gitam',
      name: 'GITAM University',
      place: 'Visakhapatnam & Hyderabad',
      agentId: 257941,
      languages: 'English, Hindi',
      status: 'active',
      websiteUrl: 'https://applications.gitam.edu',
      description: 'GITAM admission queries and course catalog details.'
    },
    {
      id: 'kl',
      name: 'KL University',
      place: 'Vijayawada & Hyderabad',
      agentId: 257941,
      languages: 'English, Hindi',
      status: 'active',
      websiteUrl: 'https://kluniversity.in/admissions',
      description: 'KL University admission inquiries and course selection.'
    },
    {
      id: 'icfai',
      name: 'ICFAI Foundation for Higher Education',
      place: 'Hyderabad, Telangana',
      agentId: 257941,
      languages: 'English, Hindi',
      status: 'active',
      websiteUrl: 'https://ifheindia.org/admissions',
      description: 'ICFAI IFHE Hyderabad admissions wing.'
    },
    {
      id: 'mnr',
      name: 'MNR University',
      place: 'Sangareddy, Telangana',
      agentId: 257941,
      languages: 'Telugu, English, Hindi',
      status: 'active',
      websiteUrl: 'https://mnrindia.org/admissions',
      description: 'MNR University medical, engineering & general admissions.'
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
  const [showManageColleges, setShowManageColleges] = useState(true);
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
    agentId: '257941',
    languages: 'English, Hindi, Telugu'
  });

  const getInitialColleges = () => {
    try {
      const cached = localStorage.getItem('vv_colleges_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_COLLEGES;
  };

  const [universities, setUniversities] = useState(getInitialColleges);

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
      } catch (e) {}
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
      agentId: '257941',
      languages: 'English, Hindi, Telugu'
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
      agentId: String(college.agentId || 257941),
      languages: college.languages || 'English, Hindi, Telugu'
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
          agentId: Number(collegeForm.agentId) || 257941,
          languages: (collegeForm.languages || '').trim() || 'English, Hindi, Telugu'
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

        const headers = jsonData[0].map(h => String(h || '').trim().toLowerCase());

        let phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('number') || h.includes('contact'));
        let nameIdx = headers.findIndex(h => h.includes('name') || h.includes('student') || h.includes('person') || h.includes('user'));

        if (phoneIdx === -1) phoneIdx = 0;
        if (nameIdx === -1 && headers.length > 1) nameIdx = phoneIdx === 0 ? 1 : 0;

        const parsedContacts = [];

        for (let i = (headers.length > 0 && phoneIdx !== -1 && isNaN(jsonData[0][phoneIdx]) ? 1 : 0); i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;

          const rawPhone = row[phoneIdx] !== undefined ? String(row[phoneIdx]) : '';
          const rawName = nameIdx !== -1 && row[nameIdx] !== undefined ? String(row[nameIdx]) : '';

          const formatted = validatePhone(rawPhone);
          if (formatted) {
            parsedContacts.push({
              id: `excel-${Date.now()}-${i}`,
              phone: rawPhone.replace(/\D/g, ''),
              formattedPhone: formatted,
              name: rawName.trim(),
              hasName: Boolean(rawName.trim())
            });
          }
        }

        if (parsedContacts.length === 0) {
          addToast('Could not extract any valid 10-digit numbers from Excel sheet.', 'error');
        } else {
          setTempContacts(parsedContacts);
          setTempInputMode('excel');
          setUploadedFileInfo({
            fileName: file.name,
            fileSize: (file.size / 1024).toFixed(1) + ' KB',
            count: parsedContacts.length,
            uploadedAt: new Date().toLocaleTimeString()
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

  // Remove Uploaded Excel File
  const handleRemoveUploadedFile = () => {
    setUploadedFileInfo(null);
    setTempContacts([]);
    setStagedContacts([]);
    setCallDelay('');
    addToast('Uploaded file and contacts cleared.', 'info');
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

    const enrichedContacts = tempContacts.map(c => ({
      ...c,
      universityId: uni.id,
      universityName: uni.name,
      agentId: uni.agentId
    }));

    setStagedContacts(prev => [...prev, ...enrichedContacts]);
    setTempContacts([]);
    setTempInputMode('');
    addToast(`Successfully staged ${tempContacts.length} contacts for ${uni.name}!`, 'success');
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

    try {
      const res = await fetch('/api/queue/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: stagedContacts.map(c => ({ phone: c.phone, name: c.name })),
          delaySeconds: callDelay !== '' ? callDelay : 2,
          agentId: uni.agentId,
          universityId: uni.id,
          universityName: uni.name,
          collegePlace: uni.place || uni.location || '',
          applicationUrl: uni.websiteUrl || uni.applicationUrl || uni.admissionLink || ''
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast(`Campaign Started! Dialing ${data.totalCount} contacts sequentially using ${uni.name}...`, 'success');
        setStagedContacts([]);
        setShowLogs(true); // Auto-expand logs terminal
      } else {
        addToast(data.error || 'Failed to start campaign', 'error');
      }
    } catch (err) {
      addToast('Network error starting campaign', 'error');
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

  // Helper to format a call record for clean Excel presentation with Primary Final Outcome
  const formatCallForExcel = (call, idx) => {
    const uniId = getCallUniversityId(call);
    const uniDisplayName = getUniversityName(uniId);
    const primaryStatus = resolveCallFinalStatus(call);
    const statusInfo = getStatusDisplay(primaryStatus);
    const counselorReq = isCounselorFollowupRequired(call) ? 'Yes' : 'No';
    const callbackTime = getCallbackTime(call) || (String(call.callbackRequired || '').toLowerCase().includes('yes') ? 'Requested' : '—');
    const rawDuration = call.callDuration || call.duration || (call.rawFields && call.rawFields.call_duration_in_seconds) || '—';

    return {
      'S.No': idx + 1,
      'Student Name': call.studentName || '—',
      'Contact Number': call.contactNumber || '—',
      'Email': call.email || '—',
      'University': uniDisplayName,
      'Final Status': statusInfo.label, // Exactly one of: Interested, Callback, Not Interested, Already Joined, Already Applied, Wrong Number / Invalid, Calls Not Answered
      'Interest Level': call.interestLevel || 'PENDING',
      'Counselor Follow-up': counselorReq,
      'Callback Time': callbackTime,
      'Call Date & Time': call.callDate !== '—' && !isNaN(new Date(call.callDate).getTime()) ? new Date(call.callDate).toLocaleString() : call.callDate || '—',
      'Call Duration': formatDuration(rawDuration),
      'Program': call.program || '—',
      'Course': call.course || '—',
      'Preferred State': call.preferredState || '—',
      'Preferred City': call.preferredCity || '—',
      'Call Outcome Details': call.callOutcome || '—',
      'Sentiment': call.sentiment || 'Neutral',
      'Summary / Call Notes': call.summary || '—'
    };
  };

  // Helper to dynamically calculate custom column widths based on content lengths
  const calculateColWidths = (dataRowArray) => {
    if (!dataRowArray || dataRowArray.length === 0) return [];
    const keys = Object.keys(dataRowArray[0]);
    return keys.map(key => {
      let maxLen = key.length;
      dataRowArray.forEach(row => {
        const val = String(row[key] || '');
        if (val.length > maxLen) maxLen = val.length;
      });
      return { wch: Math.min(maxLen + 4, 60) };
    });
  };

  // Export Filtered Records to Excel (respects active university scope and dashboard filters)
  const handleExportFilteredCsv = () => {
    const workbook = XLSX.utils.book_new();
    const activeScopeName = uniScopeLabel;

    // Scoped calls based on university and date filter
    const scopedCalls = dateFilteredCalls;

    // 1. Current Filtered View Sheet (exactly what user sees in table)
    const activeData = finalDashboardList.map((c, i) => formatCallForExcel(c, i));
    const wsActive = XLSX.utils.json_to_sheet(activeData.length > 0 ? activeData : [{ 'Status': 'No call records match the active filters.' }]);
    if (activeData.length > 0) wsActive['!cols'] = calculateColWidths(activeData);
    XLSX.utils.book_append_sheet(workbook, wsActive, "Active Filtered Calls");

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
        'Wrong Number / Invalid': wn,
        'Counselor Follow-up': cf,
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

    // Helper to safely append an outcome sheet
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
    appendOutcomeSheet("Wrong Number or Invalid", scopedCalls.filter(isWrongNumber), "No wrong-number records.");
    appendOutcomeSheet("Calls Not Answered", scopedCalls.filter(isUnanswered), "No unanswered calls recorded.");

    // Save workbook
    const cleanScopeName = activeScopeName.replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.writeFile(workbook, `${cleanScopeName}_Leads_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    addToast(`Exported ${activeScopeName} Excel report with final status categorization!`, 'success');
  };

  // Open Detailed Call View
  const openCallModal = (callItem) => {
    setSelectedCall(callItem);
  };

  // Merge Google Sheets data with live outbound call logs from OmniDimension.
  // Omni records carry the REAL transcript/status/duration/recording, so map them
  // directly (plus the staged name + exact campaign college from the dial queue)
  // instead of placeholder rows.
  const mergedCalls = React.useMemo(() => {
    const list = [...sheetsCalls];
    const existingIds = new Set(sheetsCalls.map(c => String(c.id || '').trim()).filter(Boolean));
    const existingPhones = new Set(sheetsCalls.map(c => {
      const p = String(c.contactNumber || '').replace(/\D/g, '');
      return p.length === 10 ? p : p.slice(-10);
    }).filter(Boolean));

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

      const isAlreadyInSheets = (callId && existingIds.has(callId)) || (cleanPhone && existingPhones.has(cleanPhone));
      if (isAlreadyInSheets) return;

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
    });

    return list;
  }, [sheetsCalls, calls, activeQueue]);

  // Dynamic Call University ID Helper: checks against configured universities array.
  // Exact staged/transcript college wins; fuzzy scan checks specific colleges
  // before the generic Vidyavision fallback (its name appears in every note).
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
      if ((prefUni && prefUni === uname) || (discussed && discussed === uname)) return u.id;
    }

    // 2. Fuzzy scan: specific colleges first, generic fallback last
    const ordered = [...universities].sort((a, b) => {
      const aGen = a.id === 'vidyavision' || /vidyavision|vision/.test(a.id) ? 1 : 0;
      const bGen = b.id === 'vidyavision' || /vidyavision|vision/.test(b.id) ? 1 : 0;
      return aGen - bGen;
    });
    for (const u of ordered) {
      const uName = u.name.toLowerCase().replace('university', '').trim();
      const uId = u.id.toLowerCase();
      if ((uId.length >= 3 && combined.includes(uId)) || (uName.length >= 3 && combined.includes(uName))) {
        return u.id;
      }
    }
    return 'vidyavision';
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

  // Filter by selected KPI card / Chart Segment
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
                    🎓 Saved College Bots ({universities.length})
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Select a college for sequence calling or click <b>Delete</b> to remove unwanted colleges.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className={`btn ${showManageColleges ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                    onClick={() => setShowManageColleges(prev => !prev)}
                  >
                    <Trash2 size={15} /> {showManageColleges ? 'Hide Delete Grid' : 'Manage & Delete Colleges'}
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
                    Click <b style={{ color: '#ef4444' }}>DELETE</b> on any card to permanently remove a college:
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem' }}>
                    {universities.map(uni => {
                      const isSelected = selectedUniversity === uni.id;
                      return (
                        <div
                          key={uni.id}
                          style={{
                            backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-card)',
                            border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
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
                              {isSelected && (
                                <span style={{ fontSize: '0.65rem', backgroundColor: 'var(--accent)', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 'bold' }}>
                                  SELECTED
                                </span>
                              )}
                            </div>

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

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid var(--border)', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                              onClick={() => {
                                setSelectedUniversity(uni.id);
                                addToast(`Selected ${uni.name} for sequence calling.`, 'info');
                              }}
                            >
                              {isSelected ? '✓ Selected Bot' : 'Select Bot'}
                            </button>

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
                                  {uploadedFileInfo ? uploadedFileInfo.fileName : 'Excel File'}
                                </h4>
                                <span className="status-pill completed" style={{ fontSize: '0.7rem' }}>
                                  <CheckCircle2 size={12} /> DATA IMPORTED
                                </span>
                              </div>

                              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Extracted: <b style={{ color: '#818cf8' }}>{tempContacts.length || (uploadedFileInfo && uploadedFileInfo.count) || 0} Contacts</b>
                                {uploadedFileInfo && ` • Size: ${uploadedFileInfo.fileSize} • Uploaded at ${uploadedFileInfo.uploadedAt}`}
                              </p>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                                onClick={() => fileInputRef.current?.click()}
                              >
                                <Upload size={14} /> Replace File
                              </button>

                              <button
                                type="button"
                                className="btn btn-danger-outline"
                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                                onClick={handleRemoveUploadedFile}
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
                            const picked = universities.find(u => u.id === e.target.value);
                            if (picked) addToast(`Selected ${picked.name} for sequence calling.`, 'info');
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
                              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>🗣️ {sel.languages || 'English, Hindi, Telugu'} • 🤖 Agent #{sel.agentId || 257941}</p>
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

                    {/* Stage Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleStageTempContacts}
                        disabled={(universities.find(u => u.id === selectedUniversity)?.status === 'inactive') || (tempInputMode !== 'manual' && callDelay === '')}
                      >
                        <CheckCircle size={16} /> Stage Contacts for Calling
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
                              <th>University ID</th>
                              <th>Staged Status</th>
                              <th style={{ textAlign: 'center' }}>Remove</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stagedContacts.map((c, idx) => (
                              <tr key={c.id}>
                                <td>{idx + 1}</td>
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
                                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.85rem' }}>
                                  #{c.agentId || 'N/A'}
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
                        Dialing sequential list using <b>{campaignState.universityName || 'Selected Bot'}</b> (Agent ID: <b>#{campaignState.agentId || 'N/A'}</b>)
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
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
                              <td>{idx + 1}</td>
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
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
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

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button onClick={handleExportFilteredCsv} className="btn btn-primary" style={{ backgroundColor: '#059669', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', fontWeight: '700' }}>
                  <Download size={16} /> Download Excel Report (.xlsx)
                </button>
              </div>
            </div>

            {/* Sync Error Notice */}
            {sheetsSyncError && (
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem 1.25rem', borderRadius: '8px', marginBottom: '1.25rem', color: '#f87171', fontSize: '0.85rem' }}>
                ⚠️ {sheetsSyncError}
              </div>
            )}

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
                    style={{ padding: '0.55rem 0.9rem', fontSize: '0.82rem' }}
                    onClick={() => setDashboardUniversityFilter(['ALL'])}
                  >
                    🌐 All ({uniStats.ALL.total})
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

              {/* Selected scope summary */}
              <div style={{ marginTop: '0.75rem', fontSize: '0.83rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <GraduationCap size={15} style={{ color: 'var(--accent)' }} />
                {isAllUniScope ? (
                  <span>Showing aggregate metrics across <b>{universities.length}</b> colleges • <b>{uniStats.ALL.total}</b> total calls</span>
                ) : dashboardUniversityFilter.length === 1 ? (() => {
                  const sel = universities.find(u => u.id === dashboardUniversityFilter[0]);
                  const count = (uniStats[dashboardUniversityFilter[0]] || { total: 0 }).total;
                  if (!sel) return <span>Unknown scope</span>;
                  return <span>Showing <b>{sel.name}</b>{sel.place ? ` (${sel.place})` : ''} • <b>{count}</b> calls • 🗣️ {sel.languages || 'English, Hindi, Telugu'}</span>;
                })() : (
                  <span>Showing combined analytics for <b>{dashboardUniversityFilter.length} colleges</b> • <b>{totalDispatchedCount}</b> calls in scope</span>
                )}
              </div>
            </div>

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

              {/* 1. Admission Conversion Funnel & Pipeline Card (Dynamic Title & 9 Mutually Exclusive Steps) */}
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h2 className="card-title" style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={18} style={{ color: 'var(--accent)' }} />
                    {isAllUniScope
                      ? 'Admission Conversion Funnel & Pipeline'
                      : `${uniScopeLabel} Admission Conversion Funnel & Pipeline`}
                  </h2>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Click any step to filter</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>

                  {/* Step 1: Total Dispatched */}
                  <div
                    onClick={() => setDashboardFilter('ALL')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === 'ALL' ? 'rgba(129, 140, 248, 0.08)' : 'transparent'
                    }}
                  >
                    <div style={{ width: '150px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '700' }}>
                      1. Total Dispatched
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ width: '100%', backgroundColor: 'rgba(129, 140, 248, 0.35)', height: '100%' }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {totalDispatchedCount} leads (100%)
                      </span>
                    </div>
                  </div>

                  {/* Step 2: Calls Answered */}
                  <div
                    onClick={() => setDashboardFilter('ANSWERED')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === 'ANSWERED' ? 'rgba(45, 212, 191, 0.08)' : 'transparent'
                    }}
                  >
                    <div style={{ width: '150px', fontSize: '0.8rem', color: '#2dd4bf', fontWeight: '700' }}>
                      2. Calls Answered
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        width: `${totalDispatchedCount > 0 ? (answeredCount / totalDispatchedCount) * 100 : 0}%`,
                        backgroundColor: 'rgba(45, 212, 191, 0.35)',
                        height: '100%'
                      }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {answeredCount} leads {totalDispatchedCount > 0 && `(${Math.round((answeredCount / totalDispatchedCount) * 100)}% of Dispatched)`}
                      </span>
                    </div>
                  </div>

                  {/* Step 3: Calls Not Answered */}
                  <div
                    onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.NOT_ANSWERED)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.NOT_ANSWERED ? 'rgba(244, 63, 94, 0.08)' : 'transparent'
                    }}
                  >
                    <div style={{ width: '150px', fontSize: '0.8rem', color: '#fb7185', fontWeight: '700' }}>
                      3. Calls Not Answered
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        width: `${totalDispatchedCount > 0 ? (unansweredCount / totalDispatchedCount) * 100 : 0}%`,
                        backgroundColor: 'rgba(244, 63, 94, 0.35)',
                        height: '100%'
                      }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {unansweredCount} leads {totalDispatchedCount > 0 && `(${Math.round((unansweredCount / totalDispatchedCount) * 100)}% of Dispatched)`}
                      </span>
                    </div>
                  </div>

                  {/* Step 4: Interested */}
                  <div
                    onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.INTERESTED)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.INTERESTED ? 'rgba(74, 222, 128, 0.08)' : 'transparent'
                    }}
                  >
                    <div style={{ width: '150px', fontSize: '0.8rem', color: '#4ade80', fontWeight: '700' }}>
                      4. Interested
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        width: `${answeredCount > 0 ? (interestedCount / answeredCount) * 100 : 0}%`,
                        backgroundColor: 'rgba(74, 222, 128, 0.35)',
                        height: '100%'
                      }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {interestedCount} leads {answeredCount > 0 && `(${Math.round((interestedCount / answeredCount) * 100)}% of Answered)`}
                      </span>
                    </div>
                  </div>

                  {/* Step 5: Callback */}
                  <div
                    onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.CALLBACK)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.CALLBACK ? 'rgba(245, 158, 11, 0.08)' : 'transparent'
                    }}
                  >
                    <div style={{ width: '150px', fontSize: '0.8rem', color: '#fbbf24', fontWeight: '700' }}>
                      5. Callback
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        width: `${answeredCount > 0 ? (callbackCount / answeredCount) * 100 : 0}%`,
                        backgroundColor: 'rgba(245, 158, 11, 0.35)',
                        height: '100%'
                      }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {callbackCount} leads {answeredCount > 0 && `(${Math.round((callbackCount / answeredCount) * 100)}% of Answered)`}
                      </span>
                    </div>
                  </div>

                  {/* Step 6: Already Applied */}
                  <div
                    onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.ALREADY_APPLIED)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_APPLIED ? 'rgba(56, 189, 248, 0.08)' : 'transparent'
                    }}
                  >
                    <div style={{ width: '150px', fontSize: '0.8rem', color: '#38bdf8', fontWeight: '700' }}>
                      6. Already Applied
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        width: `${answeredCount > 0 ? (alreadyAppliedCount / answeredCount) * 100 : 0}%`,
                        backgroundColor: 'rgba(56, 189, 248, 0.35)',
                        height: '100%'
                      }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {alreadyAppliedCount} leads {answeredCount > 0 && `(${Math.round((alreadyAppliedCount / answeredCount) * 100)}% of Answered)`}
                      </span>
                    </div>
                  </div>

                  {/* Step 7: Already Joined */}
                  <div
                    onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.ALREADY_JOINED)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.ALREADY_JOINED ? 'rgba(168, 85, 247, 0.08)' : 'transparent'
                    }}
                  >
                    <div style={{ width: '150px', fontSize: '0.8rem', color: '#a855f7', fontWeight: '700' }}>
                      7. Already Joined
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        width: `${answeredCount > 0 ? (alreadyJoinedCount / answeredCount) * 100 : 0}%`,
                        backgroundColor: 'rgba(168, 85, 247, 0.35)',
                        height: '100%'
                      }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {alreadyJoinedCount} leads {answeredCount > 0 && `(${Math.round((alreadyJoinedCount / answeredCount) * 100)}% of Answered)`}
                      </span>
                    </div>
                  </div>

                  {/* Step 8: Not Interested */}
                  <div
                    onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.NOT_INTERESTED)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.NOT_INTERESTED ? 'rgba(239, 68, 68, 0.08)' : 'transparent'
                    }}
                  >
                    <div style={{ width: '150px', fontSize: '0.8rem', color: '#f87171', fontWeight: '700' }}>
                      8. Not Interested
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        width: `${answeredCount > 0 ? (notInterestedCount / answeredCount) * 100 : 0}%`,
                        backgroundColor: 'rgba(239, 68, 68, 0.35)',
                        height: '100%'
                      }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {notInterestedCount} leads {answeredCount > 0 && `(${Math.round((notInterestedCount / answeredCount) * 100)}% of Answered)`}
                      </span>
                    </div>
                  </div>

                  {/* Step 9: Wrong Number / Invalid */}
                  <div
                    onClick={() => setDashboardFilter(CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      backgroundColor: dashboardFilter === CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID ? 'rgba(251, 146, 60, 0.08)' : 'transparent'
                    }}
                  >
                    <div style={{ width: '150px', fontSize: '0.8rem', color: '#fb923c', fontWeight: '700' }}>
                      9. Wrong / Invalid
                    </div>
                    <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', height: '26px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        width: `${answeredCount > 0 ? (wrongNumberCount / answeredCount) * 100 : 0}%`,
                        backgroundColor: 'rgba(251, 146, 60, 0.35)',
                        height: '100%'
                      }}></div>
                      <span style={{ position: 'absolute', left: '10px', top: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#ffffff' }}>
                        {wrongNumberCount} leads {answeredCount > 0 && `(${Math.round((wrongNumberCount / answeredCount) * 100)}% of Answered)`}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Secondary Action: Counsellor Follow-up (Decoupled from primary status) */}
                <div
                  onClick={() => setDashboardFilter(dashboardFilter === 'COUNSELOR_FOLLOWUP' ? 'ALL' : 'COUNSELOR_FOLLOWUP')}
                  style={{
                    marginTop: '1rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: dashboardFilter === 'COUNSELOR_FOLLOWUP' ? 'rgba(45, 212, 191, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    border: dashboardFilter === 'COUNSELOR_FOLLOWUP' ? '1px solid #2dd4bf' : '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>☎️</span>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                        Secondary Metric: Counsellor Follow-up
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        {interestedCount > 0
                          ? `${counselorFollowupCount} of ${interestedCount} interested leads require counsellor follow-up (${Math.round((counselorFollowupCount / interestedCount) * 100)}%)`
                          : `${counselorFollowupCount} leads flagged for counsellor follow-up`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#2dd4bf', fontFamily: 'var(--mono)' }}>
                      {counselorFollowupCount}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {dashboardFilter === 'COUNSELOR_FOLLOWUP' ? 'Showing' : 'Filter'}
                    </span>
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

            {/* University-Wise Performance & Outcome Breakdown Matrix (Dynamically Configured) */}
            <div className="card" style={{ marginTop: '1.25rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h2 className="card-title" style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <GraduationCap size={18} style={{ color: 'var(--accent)' }} /> University-Wise Call Outcome Breakdown
                </h2>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Click any university row to toggle scope filter
                </span>
              </div>

              <div className="calls-table-container">
                <table className="calls-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>University</th>
                      <th style={{ textAlign: 'center' }}>Total</th>
                      <th style={{ textAlign: 'center', color: '#2dd4bf' }}>Answered</th>
                      <th style={{ textAlign: 'center', color: '#4ade80' }}>Interested</th>
                      <th style={{ textAlign: 'center', color: '#06b6d4' }}>App Sent</th>
                      <th style={{ textAlign: 'center', color: '#fbbf24' }}>Callback</th>
                      <th style={{ textAlign: 'center', color: '#38bdf8' }}>Already Applied</th>
                      <th style={{ textAlign: 'center', color: '#a855f7' }}>Already Joined</th>
                      <th style={{ textAlign: 'center', color: '#f87171' }}>Not Interested</th>
                      <th style={{ textAlign: 'center', color: '#fb923c' }}>Wrong / Invalid</th>
                      <th style={{ textAlign: 'center', color: '#fb7185' }}>Not Answered</th>
                      <th style={{ textAlign: 'center' }}>Conversion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {universities.map(u => {
                      const isSelected = !isAllUniScope && dashboardUniversityFilter.includes(u.id);
                      const data = uniStats[u.id] || {
                        total: 0,
                        answered: 0,
                        interested: 0,
                        applicationSent: 0,
                        callback: 0,
                        alreadyApplied: 0,
                        alreadyJoined: 0,
                        notInterested: 0,
                        wrongNumber: 0,
                        unanswered: 0
                      };
                      const convRate = data.total > 0 ? Math.round((data.interested / data.total) * 100) : 0;
                      return (
                        <tr
                          key={u.id}
                          onClick={() => toggleUniScope(u.id)}
                          title="Click to add/remove this college from the analytics scope"
                          style={{
                            cursor: 'pointer',
                            backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.08)' : undefined,
                            borderLeft: isSelected ? '4px solid var(--accent)' : '4px solid transparent'
                          }}
                        >
                          <td style={{ fontWeight: '700' }}>
                            🏫 {u.name} {isSelected && <span style={{ fontSize: '0.72rem', color: 'var(--accent)', marginLeft: '0.4rem' }}>(Active Scope)</span>}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: '700' }}>{data.total}</td>
                          <td style={{ textAlign: 'center', color: '#2dd4bf', fontWeight: '600' }}>{data.answered}</td>
                          <td style={{ textAlign: 'center', color: '#4ade80', fontWeight: '700' }}>{data.interested}</td>
                          <td style={{ textAlign: 'center', color: '#06b6d4', fontWeight: '700' }}>{data.applicationSent || 0}</td>
                          <td style={{ textAlign: 'center', color: '#fbbf24', fontWeight: '700' }}>{data.callback}</td>
                          <td style={{ textAlign: 'center', color: '#38bdf8', fontWeight: '600' }}>{data.alreadyApplied}</td>
                          <td style={{ textAlign: 'center', color: '#a855f7', fontWeight: '600' }}>{data.alreadyJoined}</td>
                          <td style={{ textAlign: 'center', color: '#f87171', fontWeight: '600' }}>{data.notInterested}</td>
                          <td style={{ textAlign: 'center', color: '#fb923c', fontWeight: '600' }}>{data.wrongNumber}</td>
                          <td style={{ textAlign: 'center', color: '#fb7185', fontWeight: '600' }}>{data.unanswered}</td>
                          <td style={{ textAlign: 'center', fontWeight: '700' }}>
                            <span className="status-pill completed" style={{ fontSize: '0.75rem' }}>{convRate}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                        <th>Application Status</th>
                        <th>Interest Level</th>
                        <th>Counsellor Follow-up</th>
                        <th>Academic Preferences</th>
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
                              {call.email && call.email !== '—' && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{call.email}</div>
                              )}
                            </td>

                            {/* 2. University (Product-level Dynamic Mapping) */}
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

                            {/* 3. Call Date/Time & Duration */}
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

                            {/* 4. Application Status (WhatsApp admission link state) */}
                            <td>
                              {primaryStatus === CALL_OUTCOME_STATUS.APPLICATION_SENT ? (
                                <span
                                  style={{
                                    fontSize: '0.74rem',
                                    fontWeight: '800',
                                    width: 'fit-content',
                                    backgroundColor: 'rgba(6, 182, 212, 0.15)',
                                    color: '#06b6d4',
                                    border: '1px solid rgba(6, 182, 212, 0.25)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.25rem 0.65rem',
                                    borderRadius: '6px'
                                  }}
                                >
                                  <span>📩</span>
                                  <span>Submitted</span>
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: '0.74rem',
                                    fontWeight: '800',
                                    width: 'fit-content',
                                    backgroundColor: 'rgba(148, 163, 184, 0.15)',
                                    color: '#94a3b8',
                                    border: '1px solid rgba(148, 163, 184, 0.25)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.25rem 0.65rem',
                                    borderRadius: '6px'
                                  }}
                                >
                                  <span>⏳</span>
                                  <span>Pending</span>
                                </span>
                              )}
                            </td>

                            {/* 5. Interest Level (pure transcript verdict) */}
                            <td>
                              <span style={{
                                fontSize: '0.82rem',
                                fontWeight: '700',
                                color: isInterestedLead(call) ? '#4ade80' : '#f87171'
                              }}>
                                {isInterestedLead(call) ? 'Interested' : 'Not Interested'}
                              </span>
                            </td>

                            {/* 6. Counsellor Follow-up (Secondary Metric) */}
                            <td>
                              {isCounselorReq ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontSize: '0.74rem',
                                  fontWeight: '700',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '4px',
                                  backgroundColor: 'rgba(45, 212, 191, 0.15)',
                                  color: '#2dd4bf',
                                  border: '1px solid rgba(45, 212, 191, 0.3)'
                                }}>
                                  ✓ Required
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No</span>
                              )}
                            </td>

                            {/* 7. Academic Preferences */}
                            <td>
                              <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>{call.program || '—'}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {[call.course, call.preferredState || call.preferredCity].filter(Boolean).join(' • ') || '—'}
                              </div>
                            </td>

                            {/* 8. Actions */}
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
