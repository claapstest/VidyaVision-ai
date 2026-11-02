import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  UserCheck,
  Check,
  X,
  Edit3,
  Trash2,
  AlertCircle,
  Loader2,
  Mail,
  CheckCircle2,
  Search
} from 'lucide-react';

const PERMISSION_CONFIG = [
  {
    key: 'canViewReports',
    label: 'Allow viewing call dashboard & reports',
    description: 'Access the main analytics dashboard, lead breakdown charts, and status metrics.',
    adminDefault: true,
    counselorDefault: true,
  },
  {
    key: 'canViewTranscripts',
    label: 'Allow listening to call audio & AI transcripts',
    description: 'Listen to call voice recordings and read full AI-transcribed conversations.',
    adminDefault: true,
    counselorDefault: true,
  },
  {
    key: 'canAddNotes',
    label: 'Allow adding manual counselor notes & follow-ups',
    description: 'Save interest notes, assign next call dates, and send WhatsApp admission links.',
    adminDefault: true,
    counselorDefault: true,
  },
  {
    key: 'canStartStopCampaigns',
    label: 'Allow starting & stopping calling campaigns',
    description: 'Initiate sequential AI dialing batches, split queues, pause or stop active runs.',
    adminDefault: true,
    counselorDefault: false,
  },
  {
    key: 'canUploadLeads',
    label: 'Allow uploading student lead Excel files',
    description: 'Import new student contact spreadsheets (.xlsx, .csv) into the calling queues.',
    adminDefault: true,
    counselorDefault: false,
  },
  {
    key: 'canManageColleges',
    label: 'Allow adding/editing universities and bots',
    description: 'Create new target institutions, configure courses, and modify university agents.',
    adminDefault: true,
    counselorDefault: false,
  },
  {
    key: 'canExportData',
    label: 'Allow exporting student database to CSV/Excel',
    description: 'Download contact telephone records, call duration sheets, and filtered outcomes.',
    adminDefault: true,
    counselorDefault: false,
  },
];

const DEFAULT_COUNSELOR_PERMISSIONS = {
  canViewReports: true,
  canViewTranscripts: true,
  canAddNotes: true,
  canStartStopCampaigns: false,
  canUploadLeads: false,
  canManageColleges: false,
  canExportData: false,
};

const DEFAULT_ADMIN_PERMISSIONS = {
  canViewReports: true,
  canViewTranscripts: true,
  canAddNotes: true,
  canStartStopCampaigns: true,
  canUploadLeads: true,
  canManageColleges: true,
  canExportData: true,
};

export default function TeamManagementModal({ currentUser, onClose, onUserCountChange }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  // Modal for Create / Edit Counselor
  const [showEditor, setShowEditor] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = new user mode
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('counselor');
  const [formPermissions, setFormPermissions] = useState({ ...DEFAULT_COUNSELOR_PERMISSIONS });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Fetch users on mount
  const fetchUsers = async () => {
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
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showToast = (text, type = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('counselor');
    setFormPermissions({ ...DEFAULT_COUNSELOR_PERMISSIONS });
    setFormError('');
    setShowEditor(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormName(user.name || '');
    setFormEmail(user.email || '');
    setFormPassword(''); // blank means do not update
    setFormRole(user.role || 'counselor');
    setFormPermissions({
      ...(user.role === 'admin' ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_COUNSELOR_PERMISSIONS),
      ...(user.permissions || {})
    });
    setFormError('');
    setShowEditor(true);
  };

  const handlePermissionToggle = (key) => {
    if (formRole === 'admin') return; // Admins permanently have all permissions
    setFormPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleRoleChange = (newRole) => {
    setFormRole(newRole);
    if (newRole === 'admin') {
      setFormPermissions({ ...DEFAULT_ADMIN_PERMISSIONS });
    } else {
      setFormPermissions({ ...DEFAULT_COUNSELOR_PERMISSIONS });
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formName.trim()) {
      setFormError('Please enter the counselor\'s full name.');
      return;
    }
    if (!formEmail.trim()) {
      setFormError('Please enter a valid work email.');
      return;
    }
    if (!editingUser && (!formPassword || formPassword.length < 6)) {
      setFormError('Temporary password must be at least 6 characters.');
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
        permissions: formPermissions
      };

      if (formPassword.trim()) {
        payload.password = formPassword.trim();
      }

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
        setFormError(data.error || 'Failed to save account.');
        return;
      }

      showToast(editingUser ? `Updated ${payload.name} successfully!` : `Created account for ${payload.name}!`, 'success');
      setShowEditor(false);
      fetchUsers();
    } catch (err) {
      console.error('Error saving user:', err);
      setFormError('Failed to communicate with server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.email === 'admin@vidyavision.com') {
      alert('The primary Super Admin account cannot be deleted.');
      return;
    }
    if (currentUser && currentUser.id === user.id) {
      alert('You cannot delete your own logged-in administrator account.');
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to remove ${user.name} (${user.email}) from VidyaVision?`);
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('vv_auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Removed ${user.name} from team.`, 'success');
        fetchUsers();
      } else {
        alert(data.error || 'Failed to remove user account.');
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Network error while deleting account.');
    }
  };

  const filteredUsers = users.filter(u =>
    (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1.25rem'
    }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '960px',
          width: '100%',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(27, 59, 111, 0.25)',
          border: '1px solid rgba(27, 59, 111, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: 'rgba(27, 59, 111, 0.08)',
              color: '#1b3b6f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Users size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontWeight: '800',
                  color: '#1b3b6f',
                  fontFamily: "'Outfit', sans-serif"
                }}>
                  Team & Counselor RBAC Management
                </h2>
                <span style={{
                  backgroundColor: '#1b3b6f',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  padding: '0.15rem 0.6rem',
                  borderRadius: '9999px'
                }}>
                  {users.length} Members
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                Manage counselor access, custom permissions, and account credentials for the VidyaVision telephony team.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={handleOpenCreate}
              style={{
                backgroundColor: '#F16522',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                fontWeight: '700',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(241, 101, 34, 0.25)'
              }}
            >
              <UserPlus size={16} /> Add New Counselor
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                lineHeight: 1,
                color: '#64748b',
                cursor: 'pointer',
                padding: '0.35rem'
              }}
              title="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Toast Alert */}
        {toastMessage && (
          <div style={{
            padding: '0.65rem 1.75rem',
            backgroundColor: toastMessage.type === 'error' ? '#fee2e2' : '#dcfce7',
            color: toastMessage.type === 'error' ? '#991b1b' : '#166534',
            fontSize: '0.84rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            {toastMessage.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {toastMessage.text}
          </div>
        )}

        {/* Modal Controls Bar */}
        <div style={{
          padding: '0.85rem 1.75rem',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          backgroundColor: '#ffffff'
        }}>
          <div style={{ position: 'relative', width: '320px' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Filter by counselor name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem 0.45rem 2rem',
                fontSize: '0.82rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Showing <b>{filteredUsers.length}</b> of <b>{users.length}</b> team accounts
          </div>
        </div>

        {/* Users Table / List */}
        <div style={{ padding: '1rem 1.75rem', overflowY: 'auto', flex: 1, backgroundColor: '#f8fafc' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: '#64748b' }}>
              <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 0.75rem auto', color: '#1b3b6f' }} />
              <p style={{ fontSize: '0.9rem' }}>Loading team accounts...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: '#64748b', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <Users size={36} style={{ color: '#94a3b8', margin: '0 auto 0.5rem auto' }} />
              <p style={{ fontWeight: '600', color: '#1b3b6f' }}>No matching accounts found</p>
              <p style={{ fontSize: '0.82rem', color: '#64748b' }}>Try adjusting your search filter or add a new counselor.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredUsers.map((u) => {
                const isSuperAdmin = u.email === 'admin@vidyavision.com';
                const isCurrentLoggedIn = currentUser && currentUser.id === u.id;

                return (
                  <div
                    key={u.id}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      transition: 'border-color 0.2s ease'
                    }}
                  >
                    {/* User Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        backgroundColor: u.role === 'admin' ? 'rgba(27, 59, 111, 0.1)' : 'rgba(241, 101, 34, 0.1)',
                        color: u.role === 'admin' ? '#1b3b6f' : '#F16522',
                        fontWeight: '700',
                        fontSize: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '700', color: '#1b3b6f', fontSize: '0.94rem' }}>
                            {u.name}
                          </span>
                          {isCurrentLoggedIn && (
                            <span style={{
                              backgroundColor: 'rgba(16, 185, 129, 0.12)',
                              color: '#059669',
                              fontSize: '0.68rem',
                              fontWeight: '700',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '4px'
                            }}>
                              You
                            </span>
                          )}
                          <span style={{
                            backgroundColor: u.role === 'admin' ? 'rgba(27, 59, 111, 0.1)' : 'rgba(241, 101, 34, 0.1)',
                            color: u.role === 'admin' ? '#1b3b6f' : '#d9531e',
                            fontSize: '0.7rem',
                            fontWeight: '700',
                            padding: '0.15rem 0.55rem',
                            borderRadius: '9999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}>
                            {u.role === 'admin' ? <Shield size={11} /> : <UserCheck size={11} />}
                            {u.role === 'admin' ? 'Administrator' : 'Admission Counselor'}
                          </span>
                          {isSuperAdmin && (
                            <span style={{
                              backgroundColor: '#fef3c7',
                              color: '#b45309',
                              fontSize: '0.68rem',
                              fontWeight: '700',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '4px'
                            }}>
                              Primary Super Admin
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Mail size={13} /> {u.email}
                        </div>

                        {/* Permissions Summary Badges */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.45rem' }}>
                          {PERMISSION_CONFIG.map(p => {
                            const isAllowed = u.role === 'admin' ? true : !!(u.permissions && u.permissions[p.key]);
                            return (
                              <span
                                key={p.key}
                                title={`${p.label}: ${isAllowed ? 'Allowed' : 'Restricted'}`}
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: '600',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '4px',
                                  backgroundColor: isAllowed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.12)',
                                  color: isAllowed ? '#047857' : '#94a3b8',
                                  border: `1px solid ${isAllowed ? 'rgba(16, 185, 129, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                              >
                                {isAllowed ? <Check size={10} style={{ strokeWidth: 3 }} /> : <X size={10} />}
                                {p.key.replace(/^can/, '')}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      <button
                        onClick={() => handleOpenEdit(u)}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          color: '#1b3b6f',
                          padding: '0.45rem 0.75rem',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          cursor: 'pointer'
                        }}
                        title="Edit counselor permissions and credentials"
                      >
                        <Edit3 size={14} /> Edit
                      </button>

                      {!isSuperAdmin && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          disabled={isCurrentLoggedIn}
                          style={{
                            backgroundColor: '#fff1f2',
                            border: '1px solid #fecdd3',
                            color: isCurrentLoggedIn ? '#cbd5e1' : '#e11d48',
                            padding: '0.45rem 0.65rem',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            cursor: isCurrentLoggedIn ? 'not-allowed' : 'pointer',
                            opacity: isCurrentLoggedIn ? 0.5 : 1
                          }}
                          title={isCurrentLoggedIn ? 'Cannot delete your own account' : 'Remove counselor account'}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '1rem 1.75rem',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Role-Based Access Control (RBAC) securely enforced at API route & UI layers.
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#e2e8f0',
              color: '#334155',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* SUB-MODAL: Create / Edit Counselor Form */}
      {showEditor && (
        <div
          className="modal-overlay"
          onClick={() => setShowEditor(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1.25rem'
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '680px',
              width: '100%',
              maxHeight: '92vh',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(27, 59, 111, 0.3)',
              border: '1px solid rgba(27, 59, 111, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Sub-Modal Header */}
            <div style={{
              padding: '1.25rem 1.75rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}>
              <div>
                <h3 style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontWeight: '800',
                  color: '#1b3b6f',
                  fontFamily: "'Outfit', sans-serif",
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {editingUser ? <Edit3 size={18} style={{ color: '#F16522' }} /> : <UserPlus size={18} style={{ color: '#F16522' }} />}
                  {editingUser ? `Edit Account: ${editingUser.name}` : 'Add New Admission Counselor'}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {editingUser ? 'Modify counselor credentials and granular access permissions.' : 'Create credentials and assign custom feature permissions.'}
                </span>
              </div>
              <button
                onClick={() => setShowEditor(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0.25rem' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Sub-Modal Body */}
            <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.75rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {formError && (
                  <div style={{
                    backgroundColor: '#fee2e2',
                    border: '1px solid #fecdd3',
                    borderRadius: '8px',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.82rem',
                    color: '#991b1b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <AlertCircle size={16} />
                    {formError}
                  </div>
                )}

                {/* Name & Email Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#1b3b6f', marginBottom: '0.35rem' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Priya Sharma"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        fontSize: '0.86rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#1b3b6f', marginBottom: '0.35rem' }}>
                      Work Email *
                    </label>
                    <input
                      type="email"
                      required
                      disabled={editingUser && (editingUser.email === 'admin@vidyavision.com')}
                      placeholder="priya@vidyavision.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        fontSize: '0.86rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        outline: 'none',
                        boxSizing: 'border-box',
                        backgroundColor: editingUser && editingUser.email === 'admin@vidyavision.com' ? '#f1f5f9' : '#ffffff'
                      }}
                    />
                  </div>
                </div>

                {/* Password & Role Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#1b3b6f', marginBottom: '0.35rem' }}>
                      {editingUser ? 'Reset Password (leave blank to keep current)' : 'Temporary Password *'}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder={editingUser ? 'Enter new password or leave blank' : 'Min. 6 characters'}
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.75rem',
                          fontSize: '0.86rem',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#1b3b6f', marginBottom: '0.35rem' }}>
                      Account Role
                    </label>
                    <select
                      value={formRole}
                      disabled={editingUser && (editingUser.email === 'admin@vidyavision.com')}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        fontSize: '0.86rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        outline: 'none',
                        backgroundColor: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="counselor">Admission Counselor (Custom RBAC)</option>
                      <option value="admin">Administrator (All Permissions)</option>
                    </select>
                  </div>
                </div>

                {/* Granular Permissions Matrix Section */}
                <div style={{ marginTop: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: '800', color: '#1b3b6f' }}>
                        Granular Permission Matrix
                      </h4>
                      <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                        {formRole === 'admin'
                          ? 'Administrators possess permanent access to all dashboard operations.'
                          : 'Customize exact dashboard actions permitted for this Admission Counselor:'}
                      </p>
                    </div>

                    {formRole !== 'admin' && (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={() => setFormPermissions({ ...DEFAULT_COUNSELOR_PERMISSIONS })}
                          style={{
                            background: 'none',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.72rem',
                            color: '#475569',
                            cursor: 'pointer'
                          }}
                        >
                          Counselor Defaults
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormPermissions({ ...DEFAULT_ADMIN_PERMISSIONS })}
                          style={{
                            background: 'none',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.72rem',
                            color: '#475569',
                            cursor: 'pointer'
                          }}
                        >
                          Check All
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {PERMISSION_CONFIG.map((perm) => {
                      const isChecked = formRole === 'admin' ? true : !!formPermissions[perm.key];

                      return (
                        <div
                          key={perm.key}
                          onClick={() => handlePermissionToggle(perm.key)}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.75rem',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            backgroundColor: isChecked ? 'rgba(16, 185, 129, 0.05)' : '#ffffff',
                            border: `1.5px solid ${isChecked ? '#10b981' : '#e2e8f0'}`,
                            cursor: formRole === 'admin' ? 'default' : 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {/* Checkbox */}
                          <div style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '5px',
                            backgroundColor: isChecked ? '#10b981' : '#ffffff',
                            border: `1.5px solid ${isChecked ? '#10b981' : '#cbd5e1'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            marginTop: '2px',
                            flexShrink: 0
                          }}>
                            {isChecked && <Check size={14} style={{ strokeWidth: 3 }} />}
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: isChecked ? '#065f46' : '#1e293b' }}>
                                {perm.label}
                              </span>
                              <code style={{ fontSize: '0.7rem', color: '#64748b', backgroundColor: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                                {perm.key}
                              </code>
                            </div>
                            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.35 }}>
                              {perm.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Sub-Modal Footer */}
              <div style={{
                padding: '1rem 1.75rem',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                backgroundColor: '#f8fafc'
              }}>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowEditor(false)}
                  style={{
                    padding: '0.55rem 1.25rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '0.55rem 1.5rem',
                    backgroundColor: '#1b3b6f',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    color: '#ffffff',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 2px 8px rgba(27, 59, 111, 0.25)'
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingUser ? 'Save Changes' : 'Create Account'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
