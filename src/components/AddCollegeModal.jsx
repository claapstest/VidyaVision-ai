import React from 'react';
import { GraduationCap, PhoneForwarded, Trash2, Save } from 'lucide-react';

export default function AddCollegeModal({
  isOpen,
  onClose,
  collegeForm,
  setCollegeForm,
  editingCollegeId,
  isSavingCollege,
  handleSaveCollege,
  universities = [],
  deletingCollegeId,
  handleDeleteCollege
}) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 3500,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem'
      }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: '680px',
          width: '94%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(27, 59, 111, 0.05)',
          overflow: 'hidden',
          animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Branded Accent Bar */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, #F16522 0%, #ea580c 50%, #1b3b6f 100%)' }} />

        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            borderBottom: '1px solid #e2e8f0',
            background: 'linear-gradient(135deg, rgba(241, 101, 34, 0.04) 0%, rgba(27, 59, 111, 0.02) 100%)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: 'rgba(241, 101, 34, 0.1)',
                border: '1px solid rgba(241, 101, 34, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F16522',
                flexShrink: 0
              }}
            >
              <GraduationCap size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#1b3b6f', letterSpacing: '-0.01em' }}>
                {editingCollegeId ? 'Edit College Details' : 'Add New College'}
              </h3>
              <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginTop: '0.15rem' }}>
                Saved colleges appear in sequence calling, WhatsApp links, and analytics filters.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1.1rem',
              lineHeight: 1,
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#f1f5f9';
              e.currentTarget.style.color = '#1b3b6f';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.color = '#64748b';
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSaveCollege} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: 0 }}>
          <div
            style={{
              padding: '1.5rem 1.75rem',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}
          >
            {/* 1. College Basic Details Card */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                padding: '1.15rem 1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)'
              }}
            >
              <div style={{ fontSize: '0.74rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <GraduationCap size={15} style={{ color: '#F16522' }} />
                College Information
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: '700', color: '#1b3b6f', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    College Name *
                  </label>
                  <input
                    className="form-input"
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.7rem 0.9rem', fontSize: '0.9rem', color: '#1b3b6f' }}
                    value={collegeForm.name}
                    onChange={(e) => setCollegeForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. CBIT Hyderabad"
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: '700', color: '#1b3b6f', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Place / City
                  </label>
                  <input
                    className="form-input"
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.7rem 0.9rem', fontSize: '0.9rem', color: '#1b3b6f' }}
                    value={collegeForm.place}
                    onChange={(e) => setCollegeForm(prev => ({ ...prev, place: e.target.value }))}
                    placeholder="e.g. Gandipet, Hyderabad"
                  />
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: '700', color: '#1b3b6f', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Available Courses
                </label>
                <input
                  className="form-input"
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.7rem 0.9rem', fontSize: '0.9rem', color: '#1b3b6f' }}
                  value={collegeForm.courses}
                  onChange={(e) => setCollegeForm(prev => ({ ...prev, courses: e.target.value }))}
                  placeholder="e.g. B.Tech CSE, B.Tech ECE, MBA"
                />
                <span style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.2rem', display: 'block' }}>
                  Comma-separated — e.g. B.Tech CSE, MBA. Shown below the college name and selectable in Step 2.
                </span>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: '700', color: '#1b3b6f', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Application / Website Link
                </label>
                <input
                  className="form-input"
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.7rem 0.9rem', fontSize: '0.9rem', color: '#1b3b6f' }}
                  value={collegeForm.websiteUrl}
                  onChange={(e) => setCollegeForm(prev => ({ ...prev, websiteUrl: e.target.value }))}
                  placeholder="https://college.edu/admissions"
                />
              </div>
            </div>

            {/* 2. Counselor Live Call Transfer Card */}
            <div
              style={{
                border: '1px solid rgba(241, 101, 34, 0.28)',
                borderRadius: '12px',
                backgroundColor: 'rgba(241, 101, 34, 0.025)',
                padding: '1.15rem 1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                boxShadow: '0 2px 8px rgba(241, 101, 34, 0.04)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <label style={{ margin: 0, fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#1b3b6f', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <PhoneForwarded size={15} style={{ color: '#F16522' }} />
                  Default Admission Counselor Phone (Live Call Transfer)
                </label>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#059669', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.15rem 0.55rem', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                  Voice Agent Synced
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0 0.85rem',
                    backgroundColor: '#f8fafc',
                    borderRight: '1px solid #e2e8f0',
                    fontSize: '0.84rem',
                    fontWeight: '700',
                    color: '#1b3b6f',
                    userSelect: 'none'
                  }}
                >
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>🇮🇳</span>
                  <span style={{ color: '#475569', fontSize: '0.84rem' }}>+91</span>
                </div>
                <input
                  type="text"
                  className="form-input"
                  value={collegeForm.counselorPhone ? String(collegeForm.counselorPhone).replace(/^\+91\s*/, '') : ''}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d\s]/g, '');
                    setCollegeForm(prev => ({
                      ...prev,
                      counselorPhone: digits.trim() ? `+91 ${digits.replace(/^\+91\s*/, '').trim()}` : ''
                    }));
                  }}
                  placeholder="Enter mobile number (e.g. 98765 43210)"
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    borderRadius: 0,
                    padding: '0.7rem 0.95rem',
                    fontSize: '0.92rem',
                    fontWeight: '600',
                    color: '#1b3b6f',
                    backgroundColor: 'transparent',
                    boxShadow: 'none'
                  }}
                />
              </div>

              <span style={{ fontSize: '0.74rem', color: '#64748b', lineHeight: 1.4 }}>
                Synced with Voice Agent: When live transfer triggers for this college, incoming calls connect directly to this counselor.
              </span>
            </div>

            {/* 3. Outreach & Bot Notes Card */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                padding: '1.15rem 1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)'
              }}
            >
              <div style={{ fontSize: '0.74rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>
                Outreach & Bot Notes
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: '700', color: '#1b3b6f', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Languages
                </label>
                <input
                  className="form-input"
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.7rem 0.9rem', fontSize: '0.9rem', color: '#1b3b6f' }}
                  value={collegeForm.languages}
                  onChange={(e) => setCollegeForm(prev => ({ ...prev, languages: e.target.value }))}
                  placeholder="English, Hindi, Telugu"
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.76rem', fontWeight: '700', color: '#1b3b6f', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Description / Bot Notes
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.7rem 0.9rem', fontSize: '0.9rem', color: '#1b3b6f', resize: 'vertical' }}
                  value={collegeForm.description}
                  onChange={(e) => setCollegeForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Admissions outreach notes for this college bot"
                />
              </div>
            </div>

            {/* 4. Existing Saved Colleges Quick Delete Section */}
            {universities && universities.length > 0 && (
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  backgroundColor: '#f8fafc',
                  padding: '1rem 1.15rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <label style={{ fontSize: '0.76rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', margin: 0 }}>
                    Existing Saved Colleges ({universities.length})
                  </label>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Click Delete to remove</span>
                </div>

                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.45rem', paddingRight: '0.25rem' }}>
                  {universities.map(uni => (
                    <div
                      key={uni.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.55rem 0.85rem',
                        backgroundColor: '#ffffff',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.85rem', color: '#1b3b6f' }}>🎓 {uni.name}</strong>
                        {uni.place && <span style={{ fontSize: '0.76rem', color: '#4f46e5', marginLeft: '0.4rem', fontWeight: '600' }}>({uni.place})</span>}
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.1rem' }}>🕒 {uni.createdAt ? new Date(uni.createdAt).toLocaleString() : '—'}</div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger-outline"
                        style={{
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.74rem',
                          color: '#ef4444',
                          borderColor: 'rgba(239, 68, 68, 0.35)',
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          fontWeight: '700',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          cursor: 'pointer'
                        }}
                        disabled={deletingCollegeId === uni.id}
                        onClick={() => handleDeleteCollege(uni)}
                      >
                        <Trash2 size={12} /> {deletingCollegeId === uni.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: '1.1rem 1.75rem',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '0.75rem'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.55rem 1.25rem',
                fontSize: '0.86rem',
                fontWeight: '600',
                color: '#475569',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingCollege}
              style={{
                padding: '0.55rem 1.4rem',
                fontSize: '0.86rem',
                fontWeight: '700',
                color: '#ffffff',
                backgroundColor: '#F16522',
                border: 'none',
                borderRadius: '8px',
                boxShadow: '0 2px 6px rgba(241, 101, 34, 0.3)',
                cursor: isSavingCollege ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.15s ease'
              }}
            >
              <Save size={15} /> {isSavingCollege ? 'Saving...' : (editingCollegeId ? 'Update College' : 'Save College')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
