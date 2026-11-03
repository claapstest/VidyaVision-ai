import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Check,
  X,
  Edit3,
  Trash2,
  AlertCircle,
  Loader2,
  Mail,
  CheckCircle2,
  Search,
  ArrowLeft,
  PhoneCall,
  Lock,
  Eye,
  EyeOff,
  Power,
  RotateCcw,
  Sparkles,
  FileSpreadsheet
} from 'lucide-react';

const PERMISSION_CONFIG = [
  {
    key: 'canViewReports',
    label: 'View Dashboard & Lead Reports',
    shortLabel: 'View Reports',
    description: 'Access the analytics dashboard, lead breakdown charts, and status metrics.',
    adminDefault: true,
    counselorDefault: true,
  },
  {
    key: 'canViewTranscripts',
    label: 'Listen to Audio & View Transcripts',
    shortLabel: 'Audio & Transcripts',
    description: 'Listen to call voice recordings and read full AI-transcribed conversations.',
    adminDefault: true,
    counselorDefault: true,
  },
  {
    key: 'canAddNotes',
    label: 'Add Counselor Notes & Follow-ups',
    shortLabel: 'Notes & Follow-ups',
    description: 'Save counselor interest notes, assign next call dates, and log student follow-ups.',
    adminDefault: true,
    counselorDefault: true,
  },
  {
    key: 'canStartStopCampaigns',
    label: 'Start / Pause / Cancel Calling Campaigns',
    shortLabel: 'Start/Stop Dialing',
    description: 'Initiate sequential AI batch dialing, split queues, pause or stop active runs.',
    adminDefault: true,
    counselorDefault: false,
  },
  {
    key: 'canUploadLeads',
    label: 'Upload Lead Excel / CSV Files',
    shortLabel: 'Upload Lead Sheets',
    description: 'Import new student contact spreadsheets (.xlsx, .csv) into the calling queues.',
    adminDefault: true,
    counselorDefault: false,
  },
  {
    key: 'canManageColleges',
    label: 'Add / Edit / Delete Universities & Bots',
    shortLabel: 'Manage Colleges & Bots',
    description: 'Create target institutions, configure courses, and modify university agents.',
    adminDefault: true,
    counselorDefault: false,
  },
  {
    key: 'canExportData',
    label: 'Export Student Database to Excel/CSV',
    shortLabel: 'Export Student Data',
    description: 'Download contact telephone records, call duration sheets, and filtered outcomes.',
    adminDefault: true,
    counselorDefault: false,
  },
];

const PRESETS = {
  standard: {
    id: 'standard',
    title: 'Standard Counselor (Recommended)',
    subtitle: 'View reports, audio transcripts & notes. Dialing, uploads & exports blocked.',
    permissions: {
      canViewReports: true,
      canViewTranscripts: true,
      canAddNotes: true,
      canStartStopCampaigns: false,
      canUploadLeads: false,
      canManageColleges: false,
      canExportData: false,
    }
  },
  senior: {
    id: 'senior',
    title: 'Senior Counselor / Queue Lead',
    subtitle: 'Standard counselor privileges + ability to upload student lead spreadsheets.',
    permissions: {
      canViewReports: true,
      canViewTranscripts: true,
      canAddNotes: true,
      canStartStopCampaigns: false,
      canUploadLeads: true,
      canManageColleges: false,
      canExportData: false,
    }
  },
  admin: {
    id: 'admin',
    title: 'Full Administrator',
    subtitle: 'Unrestricted enterprise access across all dialing, bot management & exports.',
    permissions: {
      canViewReports: true,
      canViewTranscripts: true,
      canAddNotes: true,
      canStartStopCampaigns: true,
      canUploadLeads: true,
      canManageColleges: true,
      canExportData: true,
    }
  }
};

const DEFAULT_COUNSELOR_PERMISSIONS = PRESETS.standard.permissions;
const DEFAULT_ADMIN_PERMISSIONS = PRESETS.admin.permissions;

export default function UserManagementPage({ currentUser, onBack, onUserCountChange }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'admin' | 'counselor'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'suspended'
  const [toastMessage, setToastMessage] = useState(null);

  // Modal / Drawer Editor State
  const [showEditor, setShowEditor] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = new user mode
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formRole, setFormRole] = useState('counselor');
  const [formStatus, setFormStatus] = useState('active');
  const [formPermissions, setFormPermissions] = useState({ ...DEFAULT_COUNSELOR_PERMISSIONS });
  const [activePreset, setActivePreset] = useState('standard');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete Confirmation Modal State
  const [deletingUser, setDeletingUser] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Status Toggle Loading tracking
  const [togglingUserId, setTogglingUserId] = useState(null);

  const showToast = useCallback((text, type = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Fetch users from API
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('vv_auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/users', {
        headers,
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.users)) {
        setUsers(data.users);
        if (onUserCountChange) onUserCountChange(data.users.length);
      } else {
        showToast(data.error || 'Failed to load team accounts', 'error');
      }
    } catch (err) {
      console.error('Error fetching team accounts:', err);
      showToast('Network error loading team members', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [onUserCountChange, showToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Determine which preset matches current permissions
  const detectMatchingPreset = (perms, role) => {
    if (role === 'admin') return 'admin';
    const keys = Object.keys(DEFAULT_ADMIN_PERMISSIONS);
    const matchesStandard = keys.every(k => perms[k] === PRESETS.standard.permissions[k]);
    if (matchesStandard) return 'standard';
    const matchesSenior = keys.every(k => perms[k] === PRESETS.senior.permissions[k]);
    if (matchesSenior) return 'senior';
    const matchesAdmin = keys.every(k => perms[k] === true);
    if (matchesAdmin) return 'admin';
    return 'custom';
  };

  const applyPreset = (presetKey) => {
    setActivePreset(presetKey);
    if (presetKey === 'admin') {
      setFormPermissions({ ...DEFAULT_ADMIN_PERMISSIONS });
    } else if (presetKey === 'senior') {
      setFormPermissions({ ...PRESETS.senior.permissions });
    } else if (presetKey === 'standard') {
      setFormPermissions({ ...PRESETS.standard.permissions });
    }
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setShowPassword(false);
    setFormRole('counselor');
    setFormStatus('active');
    setFormPermissions({ ...DEFAULT_COUNSELOR_PERMISSIONS });
    setActivePreset('standard');
    setFormError('');
    setShowEditor(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormName(user.name || '');
    setFormEmail(user.email || '');
    setFormPassword('');
    setShowPassword(false);
    setFormRole(user.role || 'counselor');
    setFormStatus(user.status || 'active');
    const userPerms = user.permissions || (user.role === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_COUNSELOR_PERMISSIONS);
    setFormPermissions({ ...userPerms });
    setActivePreset(detectMatchingPreset(userPerms, user.role));
    setFormError('');
    setShowEditor(true);
  };

  // Toggle single permission
  const handlePermissionToggle = (key) => {
    if (formRole === 'admin') return; // Admins permanently have all permissions
    setFormPermissions(prev => {
      const next = { ...prev, [key]: !prev[key] };
      setActivePreset(detectMatchingPreset(next, formRole));
      return next;
    });
  };

  // Save (Create or Update)
  const handleSaveUser = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formName.trim()) {
      setFormError('Please enter the team member\'s full name');
      return;
    }
    if (!formEmail.trim() || !formEmail.includes('@')) {
      setFormError('Please enter a valid work email address');
      return;
    }
    if (!editingUser && (!formPassword || formPassword.length < 6)) {
      setFormError('Temporary password must be at least 6 characters');
      return;
    }
    if (editingUser && formPassword && formPassword.length < 6) {
      setFormError('New password must be at least 6 characters if you wish to reset it');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('vv_auth_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      const payload = {
        name: formName.trim(),
        email: formEmail.trim().toLowerCase(),
        role: formRole,
        status: formStatus,
        permissions: formRole === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : formPermissions
      };
      if (formPassword) payload.password = formPassword;

      const url = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users';
      const method = editingUser ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setFormError(data.error || 'Failed to save team member details');
        setIsSubmitting(false);
        return;
      }

      showToast(editingUser ? `Account for ${payload.name} updated successfully` : `New team member ${payload.name} added!`);
      setShowEditor(false);
      fetchUsers();
    } catch (err) {
      console.error('Error saving user:', err);
      setFormError('Network communication error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Suspend / Active status directly from table
  const handleToggleStatus = async (user) => {
    if (user.email.toLowerCase() === 'admin@vidyavision.com' || user.id === 'admin_super_01') {
      showToast('The primary System Admin cannot be suspended.', 'error');
      return;
    }

    const newStatus = user.status === 'suspended' ? 'active' : 'suspended';
    setTogglingUserId(user.id);
    try {
      const token = localStorage.getItem('vv_auth_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Account for ${user.name} is now ${newStatus}.`);
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
      } else {
        showToast(data.error || 'Failed to update account status', 'error');
      }
    } catch (err) {
      showToast('Network error updating account status', 'error');
    } finally {
      setTogglingUserId(null);
    }
  };

  // Delete User Confirmation
  const handleDeleteConfirm = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      const token = localStorage.getItem('vv_auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/admin/users/${deletingUser.id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`User ${deletingUser.name} removed successfully.`);
        setDeletingUser(null);
        fetchUsers();
      } else {
        showToast(data.error || 'Failed to remove user', 'error');
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      showToast('Network error removing user', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered users calculation
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchSearch =
        !searchTerm ||
        (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchRole =
        roleFilter === 'all' ||
        (roleFilter === 'admin' && user.role === 'admin') ||
        (roleFilter === 'counselor' && user.role !== 'admin');

      const userStatus = user.status || 'active';
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && userStatus === 'active') ||
        (statusFilter === 'suspended' && userStatus === 'suspended');

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  // KPI Metrics Calculation
  const metrics = useMemo(() => {
    const total = users.length;
    const admins = users.filter(u => u.role === 'admin').length;
    const counselors = total - admins;
    const dialingSeats = users.filter(u => u.role === 'admin' || u.permissions?.canStartStopCampaigns).length;
    // Counselors with canExportData === false (protected student records)
    const protectedCounselors = users.filter(u => u.role !== 'admin' && !u.permissions?.canExportData).length;
    const activeCount = users.filter(u => (u.status || 'active') === 'active').length;
    const suspendedCount = total - activeCount;

    return {
      total,
      admins,
      counselors,
      dialingSeats,
      protectedCounselors,
      activeCount,
      suspendedCount
    };
  }, [users]);

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return '—';
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      padding: '0 0.5rem 3rem',
      minHeight: 'calc(100vh - 120px)',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Toast Feedback */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.75rem 1.25rem',
          borderRadius: '10px',
          backgroundColor: toastMessage.type === 'error' ? '#991b1b' : '#065f46',
          color: '#ffffff',
          fontWeight: '600',
          fontSize: '0.88rem',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.25)',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {toastMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* TOP NAVIGATION & ACTION BAR */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        padding: '1.25rem 1.5rem',
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        border: '1px solid rgba(27, 59, 111, 0.12)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <button
            onClick={onBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.55rem 0.95rem',
              borderRadius: '9px',
              backgroundColor: '#f1f5f9',
              color: '#1b3b6f',
              border: '1px solid rgba(27, 59, 111, 0.15)',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            title="Return to Dashboard"
          >
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(27, 59, 111, 0.1)',
                color: '#1b3b6f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Shield size={18} style={{ color: '#1b3b6f' }} />
              </div>
              <h1 style={{
                margin: 0,
                fontSize: '1.35rem',
                fontWeight: '800',
                color: '#1b3b6f',
                fontFamily: "'Outfit', 'Inter', sans-serif",
                letterSpacing: '-0.02em'
              }}>
                Team Accounts & Granular Access Control (RBAC)
              </h1>
            </div>
            <p style={{
              margin: '0.3rem 0 0 0',
              fontSize: '0.86rem',
              color: '#64748b',
              lineHeight: 1.4
            }}>
              Manage admission counselor accounts, assign dialing privileges, and enforce data leakage protection on student lead sheets.
            </p>
          </div>
        </div>

        {/* Primary Action Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={fetchUsers}
            disabled={isLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 0.95rem',
              borderRadius: '9px',
              backgroundColor: '#f8fafc',
              color: '#475569',
              border: '1px solid #cbd5e1',
              fontWeight: '600',
              fontSize: '0.84rem',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
            title="Reload team directory"
          >
            <RotateCcw size={15} className={isLoading ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>

          <button
            onClick={handleOpenCreate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.62rem 1.25rem',
              borderRadius: '9px',
              backgroundColor: '#F16522',
              color: '#ffffff',
              border: 'none',
              fontWeight: '700',
              fontSize: '0.88rem',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(241, 101, 34, 0.35)',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#d95316'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F16522'}
          >
            <UserPlus size={16} />
            <span>+ Add Team Member</span>
          </button>
        </div>
      </div>

      {/* EXECUTIVE METRICS SUMMARY (4 KPI CARDS) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1rem'
      }}>
        {/* Card 1: Total Team Members */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '1.2rem 1.4rem',
          border: '1px solid rgba(27, 59, 111, 0.1)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Team Members
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(27, 59, 111, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={16} style={{ color: '#1b3b6f' }} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#1b3b6f', lineHeight: 1.1 }}>
            {isLoading ? '—' : metrics.total}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontWeight: '700', color: '#1b3b6f' }}>{metrics.admins} Admins</span>
            <span>•</span>
            <span style={{ fontWeight: '700', color: '#F16522' }}>{metrics.counselors} Counselors</span>
          </div>
        </div>

        {/* Card 2: Active Dialing Seats */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '1.2rem 1.4rem',
          border: '1px solid rgba(241, 101, 34, 0.18)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Dialing Seats
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(241, 101, 34, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PhoneCall size={16} style={{ color: '#F16522' }} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#F16522', lineHeight: 1.1 }}>
            {isLoading ? '—' : metrics.dialingSeats}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Authorized to start/stop AI calling campaigns
          </div>
        </div>

        {/* Card 3: Data Leak Protection Shield */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '1.2rem 1.4rem',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Data Leak Protection
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={16} style={{ color: '#059669' }} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#059669', lineHeight: 1.1 }}>
            {isLoading ? '—' : `${metrics.protectedCounselors} / ${metrics.counselors}`}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '600' }}>
            🛡️ Counselors restricted from exporting leads
          </div>
        </div>

        {/* Card 4: Active Status */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '1.2rem 1.4rem',
          border: '1px solid rgba(27, 59, 111, 0.1)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Account Health
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(27, 59, 111, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCheck size={16} style={{ color: '#1b3b6f' }} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#1b3b6f', lineHeight: 1.1 }}>
            {isLoading ? '—' : `${metrics.activeCount} Active`}
          </div>
          <div style={{ fontSize: '0.78rem', color: metrics.suspendedCount > 0 ? '#b91c1c' : '#64748b', fontWeight: metrics.suspendedCount > 0 ? '700' : '500' }}>
            {metrics.suspendedCount > 0 ? `⚠️ ${metrics.suspendedCount} account(s) suspended` : 'All team accounts operational'}
          </div>
        </div>
      </div>

      {/* SEARCH & FILTER BAR */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '0.85rem 1.25rem',
        border: '1px solid rgba(27, 59, 111, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.85rem'
      }}>
        {/* Search Input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          padding: '0.45rem 0.85rem',
          border: '1px solid #e2e8f0',
          minWidth: '280px',
          flex: '1 1 300px'
        }}>
          <Search size={16} style={{ color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search team member by name or email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              fontSize: '0.86rem',
              width: '100%',
              color: '#1e293b'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                padding: '2px'
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Role Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748b' }}>Role:</span>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              style={{
                fontSize: '0.82rem',
                fontWeight: '600',
                padding: '0.45rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#1e293b',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Roles</option>
              <option value="admin">Admins Only</option>
              <option value="counselor">Counselors Only</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748b' }}>Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{
                fontSize: '0.82rem',
                fontWeight: '600',
                padding: '0.45rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#1e293b',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {(searchTerm || roleFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setRoleFilter('all');
                setStatusFilter('all');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.45rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}

          <div style={{
            fontSize: '0.8rem',
            color: '#64748b',
            fontWeight: '600',
            marginLeft: '0.5rem',
            paddingLeft: '0.75rem',
            borderLeft: '1px solid #e2e8f0'
          }}>
            Showing <strong style={{ color: '#1b3b6f' }}>{filteredUsers.length}</strong> of {users.length} members
          </div>
        </div>
      </div>

      {/* TEAM DIRECTORY & PERMISSION MATRIX TABLE */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        border: '1px solid rgba(27, 59, 111, 0.12)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        overflow: 'hidden'
      }}>
        {isLoading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 1rem',
            gap: '0.75rem',
            color: '#64748b'
          }}>
            <Loader2 size={32} className="animate-spin" style={{ color: '#1b3b6f' }} />
            <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Synchronizing team directory with PostgreSQL...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 1rem',
            gap: '0.75rem',
            color: '#64748b'
          }}>
            <Users size={38} style={{ color: '#cbd5e1' }} />
            <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.05rem', fontWeight: '700' }}>
              No team members found
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              {searchTerm || roleFilter !== 'all' || statusFilter !== 'all'
                ? 'Try broadening your search query or resetting filters.'
                : 'Click "+ Add Team Member" to invite an admission counselor.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.84rem'
            }}>
              <thead>
                <tr style={{
                  backgroundColor: '#f8fafc',
                  borderBottom: '1px solid rgba(27, 59, 111, 0.1)',
                  color: '#475569',
                  fontSize: '0.76rem',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  <th style={{ padding: '0.95rem 1.25rem', minWidth: '220px' }}>Team Member</th>
                  <th style={{ padding: '0.95rem 1rem', minWidth: '130px' }}>Role</th>
                  <th style={{ padding: '0.95rem 1rem', minWidth: '380px' }}>Granular Permission Matrix</th>
                  <th style={{ padding: '0.95rem 1rem', minWidth: '110px' }}>Status</th>
                  <th style={{ padding: '0.95rem 1.25rem', textAlign: 'right', minWidth: '170px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, idx) => {
                  const isCurrent = currentUser && (currentUser.id === user.id || currentUser.email === user.email);
                  const isSuperAdmin = user.email.toLowerCase() === 'admin@vidyavision.com' || user.id === 'admin_super_01';
                  const userStatus = user.status || 'active';
                  const isSuspended = userStatus === 'suspended';
                  const userPerms = user.permissions || (user.role === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_COUNSELOR_PERMISSIONS);

                  return (
                    <tr
                      key={user.id || idx}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: isSuspended ? '#fafafa' : '#ffffff',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = isSuspended ? '#f5f5f5' : '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = isSuspended ? '#fafafa' : '#ffffff'}
                    >
                      {/* Column 1: Member Info */}
                      <td style={{ padding: '0.95rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            backgroundColor: user.role === 'admin' ? 'rgba(27, 59, 111, 0.12)' : 'rgba(241, 101, 34, 0.12)',
                            color: user.role === 'admin' ? '#1b3b6f' : '#F16522',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '800',
                            fontSize: '0.85rem',
                            flexShrink: 0
                          }}>
                            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{
                                fontWeight: '700',
                                color: isSuspended ? '#64748b' : '#1b3b6f',
                                fontSize: '0.88rem'
                              }}>
                                {user.name}
                              </span>
                              {isCurrent && (
                                <span style={{
                                  fontSize: '0.65rem',
                                  fontWeight: '700',
                                  backgroundColor: '#dbeafe',
                                  color: '#1d4ed8',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '9999px',
                                  textTransform: 'uppercase'
                                }}>
                                  You
                                </span>
                              )}
                              {isSuperAdmin && (
                                <span style={{
                                  fontSize: '0.65rem',
                                  fontWeight: '700',
                                  backgroundColor: 'rgba(27, 59, 111, 0.1)',
                                  color: '#1b3b6f',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '9999px'
                                }}>
                                  Primary
                                </span>
                              )}
                            </div>

                            <span style={{
                              fontSize: '0.78rem',
                              color: '#64748b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}>
                              <Mail size={12} style={{ color: '#94a3b8' }} />
                              {user.email}
                            </span>

                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                              Joined {formatDate(user.createdAt)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Role */}
                      <td style={{ padding: '0.95rem 1rem' }}>
                        {user.role === 'admin' ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.3rem 0.65rem',
                            borderRadius: '9999px',
                            backgroundColor: 'rgba(27, 59, 111, 0.1)',
                            color: '#1b3b6f',
                            fontWeight: '700',
                            fontSize: '0.75rem',
                            letterSpacing: '0.02em'
                          }}>
                            <Shield size={12} />
                            Admin
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.3rem 0.65rem',
                            borderRadius: '9999px',
                            backgroundColor: 'rgba(241, 101, 34, 0.1)',
                            color: '#F16522',
                            fontWeight: '700',
                            fontSize: '0.75rem',
                            letterSpacing: '0.02em'
                          }}>
                            <Users size={12} />
                            Counselor
                          </span>
                        )}
                      </td>

                      {/* Column 3: Permission Matrix Chips */}
                      <td style={{ padding: '0.95rem 1rem' }}>
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.35rem',
                          maxWidth: '520px'
                        }}>
                          {PERMISSION_CONFIG.map(perm => {
                            const isAllowed = user.role === 'admin' || !!userPerms[perm.key];
                            return (
                              <span
                                key={perm.key}
                                title={`${perm.label}: ${perm.description} (${isAllowed ? 'Allowed' : 'Restricted'})`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: '600',
                                  backgroundColor: isAllowed ? '#ecfdf5' : '#f1f5f9',
                                  color: isAllowed ? '#047857' : '#94a3b8',
                                  border: isAllowed ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                                  cursor: 'help'
                                }}
                              >
                                {isAllowed ? (
                                  <Check size={11} style={{ strokeWidth: 3 }} />
                                ) : (
                                  <X size={11} style={{ strokeWidth: 2 }} />
                                )}
                                <span>{perm.shortLabel}</span>
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Column 4: Status */}
                      <td style={{ padding: '0.95rem 1rem' }}>
                        {isSuspended ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '9999px',
                            backgroundColor: '#fee2e2',
                            color: '#b91c1c',
                            fontWeight: '700',
                            fontSize: '0.74rem'
                          }}>
                            <Lock size={12} />
                            Suspended
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '9999px',
                            backgroundColor: '#dcfce7',
                            color: '#15803d',
                            fontWeight: '700',
                            fontSize: '0.74rem'
                          }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#15803d', display: 'inline-block' }} />
                            Active
                          </span>
                        )}
                      </td>

                      {/* Column 5: Actions */}
                      <td style={{ padding: '0.95rem 1.25rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                          {/* Edit Button */}
                          <button
                            onClick={() => handleOpenEdit(user)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.4rem 0.65rem',
                              borderRadius: '7px',
                              backgroundColor: '#ffffff',
                              border: '1px solid #cbd5e1',
                              color: '#1b3b6f',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                            title={`Edit details and permissions for ${user.name}`}
                          >
                            <Edit3 size={13} />
                            <span>Edit</span>
                          </button>

                          {/* Suspend / Activate Toggle */}
                          {!isSuperAdmin && (
                            <button
                              onClick={() => handleToggleStatus(user)}
                              disabled={togglingUserId === user.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.4rem 0.65rem',
                                borderRadius: '7px',
                                backgroundColor: isSuspended ? '#ecfdf5' : '#fff7ed',
                                border: isSuspended ? '1px solid #a7f3d0' : '1px solid #fed7aa',
                                color: isSuspended ? '#047857' : '#c2410c',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                cursor: togglingUserId === user.id ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title={isSuspended ? 'Reactivate account' : 'Suspend account'}
                            >
                              {togglingUserId === user.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Power size={13} />
                              )}
                              <span>{isSuspended ? 'Activate' : 'Suspend'}</span>
                            </button>
                          )}

                          {/* Delete Button */}
                          {!isSuperAdmin && !isCurrent && (
                            <button
                              onClick={() => setDeletingUser(user)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '30px',
                                height: '30px',
                                borderRadius: '7px',
                                backgroundColor: '#fff1f2',
                                border: '1px solid rgba(244, 63, 94, 0.25)',
                                color: '#e11d48',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#ffe4e6'}
                              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff1f2'}
                              title={`Delete account for ${user.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT MEMBER MODAL / DRAWER */}
      {showEditor && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(27, 59, 111, 0.15)',
            overflow: 'hidden',
            animation: 'modalSlideUp 0.2s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid #f1f5f9',
              backgroundColor: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: editingUser ? 'rgba(27, 59, 111, 0.1)' : 'rgba(241, 101, 34, 0.1)',
                  color: editingUser ? '#1b3b6f' : '#F16522',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {editingUser ? <Edit3 size={18} /> : <UserPlus size={18} />}
                </div>
                <div>
                  <h2 style={{
                    margin: 0,
                    fontSize: '1.15rem',
                    fontWeight: '800',
                    color: '#1b3b6f',
                    fontFamily: "'Outfit', 'Inter', sans-serif"
                  }}>
                    {editingUser ? `Edit Account: ${editingUser.name}` : 'Add New Team Member'}
                  </h2>
                  <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                    {editingUser ? 'Update role, custom permission flags, or reset credentials.' : 'Set up credentials and customize granular permissions for this counselor.'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowEditor(false)}
                disabled={isSubmitting}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveUser} style={{
              padding: '1.4rem 1.5rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}>
              {/* Form Error Banner */}
              {formError && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: '0.84rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{formError}</span>
                </div>
              )}

              {/* Basic Details: Name & Email */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Full Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sravanthi Reddy"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.86rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Work Email <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="counselor@vidyavision.com"
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    disabled={editingUser && (editingUser.email.toLowerCase() === 'admin@vidyavision.com' || editingUser.id === 'admin_super_01')}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.86rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: editingUser && editingUser.email.toLowerCase() === 'admin@vidyavision.com' ? '#f1f5f9' : '#ffffff'
                    }}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                  {editingUser ? 'Reset Password (Optional)' : 'Temporary Password *'}
                  <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: '500', marginLeft: '0.5rem' }}>
                    {editingUser ? '(Leave empty to keep current password)' : '(Minimum 6 characters)'}
                  </span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={editingUser ? '•••••••• (unchanged)' : 'Enter secure password'}
                    value={formPassword}
                    onChange={e => setFormPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem 2.5rem 0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.86rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Role & Status Selectors */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                {/* Role */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    Workspace Role
                  </label>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <label style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: formRole === 'counselor' ? '2px solid #F16522' : '1px solid #cbd5e1',
                      backgroundColor: formRole === 'counselor' ? 'rgba(241, 101, 34, 0.05)' : '#ffffff',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="formRole"
                        value="counselor"
                        checked={formRole === 'counselor'}
                        onChange={() => {
                          setFormRole('counselor');
                          applyPreset('standard');
                        }}
                        style={{ accentColor: '#F16522' }}
                      />
                      <span style={{ fontSize: '0.84rem', fontWeight: '700', color: '#1e293b' }}>
                        Admission Counselor
                      </span>
                    </label>

                    <label style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '8px',
                      border: formRole === 'admin' ? '2px solid #1b3b6f' : '1px solid #cbd5e1',
                      backgroundColor: formRole === 'admin' ? 'rgba(27, 59, 111, 0.05)' : '#ffffff',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="formRole"
                        value="admin"
                        checked={formRole === 'admin'}
                        onChange={() => {
                          setFormRole('admin');
                          applyPreset('admin');
                        }}
                        style={{ accentColor: '#1b3b6f' }}
                      />
                      <span style={{ fontSize: '0.84rem', fontWeight: '700', color: '#1b3b6f' }}>
                        System Admin
                      </span>
                    </label>
                  </div>
                </div>

                {/* Status (when editing) */}
                {editingUser && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                      Account Status
                    </label>
                    <select
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value)}
                      disabled={editingUser.email.toLowerCase() === 'admin@vidyavision.com'}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '0.86rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                        backgroundColor: '#ffffff',
                        fontWeight: '600'
                      }}
                    >
                      <option value="active">Active (Operational)</option>
                      <option value="suspended">Suspended (Access Revoked)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* PERMISSION PRESETS (1-Click Buttons) */}
              {formRole !== 'admin' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                      Permission Presets (1-Click Apply)
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Active: <strong style={{ color: '#F16522', textTransform: 'capitalize' }}>{activePreset}</strong>
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => applyPreset('standard')}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        border: activePreset === 'standard' ? '2px solid #F16522' : '1px solid #cbd5e1',
                        backgroundColor: activePreset === 'standard' ? 'rgba(241, 101, 34, 0.08)' : '#f8fafc',
                        color: activePreset === 'standard' ? '#F16522' : '#334155',
                        fontWeight: '700',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Sparkles size={13} />
                        <span>Standard Counselor</span>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '500', marginTop: '2px' }}>
                        Reports, Transcripts & Notes
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset('senior')}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        border: activePreset === 'senior' ? '2px solid #1b3b6f' : '1px solid #cbd5e1',
                        backgroundColor: activePreset === 'senior' ? 'rgba(27, 59, 111, 0.08)' : '#f8fafc',
                        color: activePreset === 'senior' ? '#1b3b6f' : '#334155',
                        fontWeight: '700',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <FileSpreadsheet size={13} />
                        <span>Senior Counselor</span>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '500', marginTop: '2px' }}>
                        Standard + Lead Sheet Uploads
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset('admin')}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        border: activePreset === 'admin' ? '2px solid #059669' : '1px solid #cbd5e1',
                        backgroundColor: activePreset === 'admin' ? 'rgba(16, 185, 129, 0.08)' : '#f8fafc',
                        color: activePreset === 'admin' ? '#059669' : '#334155',
                        fontWeight: '700',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Shield size={13} />
                        <span>Full Administrator</span>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '500', marginTop: '2px' }}>
                        All 7 privileges enabled
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* GRANULAR PERMISSION CHECKLIST */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                    Granular Permission Toggles (7 Matrix Items)
                  </label>
                  {formRole === 'admin' && (
                    <span style={{ fontSize: '0.72rem', color: '#1b3b6f', fontWeight: '700' }}>
                      ℹ️ Admins permanently possess all 7 permissions
                    </span>
                  )}
                </div>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                  backgroundColor: '#f8fafc',
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0'
                }}>
                  {PERMISSION_CONFIG.map(perm => {
                    const isChecked = formRole === 'admin' ? true : !!formPermissions[perm.key];
                    const isDisabled = formRole === 'admin';

                    return (
                      <label
                        key={perm.key}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.65rem',
                          padding: '0.55rem 0.65rem',
                          borderRadius: '8px',
                          backgroundColor: isChecked ? '#ffffff' : 'transparent',
                          border: isChecked ? '1px solid #cbd5e1' : '1px solid transparent',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          transition: 'all 0.1s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => handlePermissionToggle(perm.key)}
                          style={{
                            marginTop: '2px',
                            accentColor: '#F16522',
                            cursor: isDisabled ? 'not-allowed' : 'pointer'
                          }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{
                            fontSize: '0.82rem',
                            fontWeight: '700',
                            color: isChecked ? '#1e293b' : '#64748b'
                          }}>
                            {perm.label}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            {perm.description}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid #f1f5f9'
              }}>
                <button
                  type="button"
                  onClick={() => setShowEditor(false)}
                  disabled={isSubmitting}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    fontSize: '0.84rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.55rem 1.35rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#F16522',
                    color: '#ffffff',
                    fontSize: '0.86rem',
                    fontWeight: '700',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(241, 101, 34, 0.3)'
                  }}
                >
                  {isSubmitting && <Loader2 size={15} className="animate-spin" />}
                  <span>{editingUser ? 'Save Account Changes' : 'Create Team Account'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deletingUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '440px',
            padding: '1.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #fecaca',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#991b1b' }}>
                  Delete Counselor Account
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Permanent team member removal
                </span>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '0.86rem', color: '#334155', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong>{deletingUser.name}</strong> ({deletingUser.email})?
              They will immediately lose access to the VidyaVision workspace.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                disabled={isDeleting}
                style={{
                  padding: '0.5rem 0.95rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontWeight: '600',
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 1.1rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontWeight: '700',
                  fontSize: '0.82rem',
                  cursor: isDeleting ? 'not-allowed' : 'pointer'
                }}
              >
                {isDeleting && <Loader2 size={14} className="animate-spin" />}
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
