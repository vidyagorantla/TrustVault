
import { useEffect, useState } from 'react'
import './App.css'


const API_URL = 'https://trustvault-kny4.onrender.com'


function App() {
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [user, setUser] = useState(() => {
    try {
      const token = sessionStorage.getItem('trustvault_token')
      const savedUser = sessionStorage.getItem('trustvault_user')
      return token && savedUser ? JSON.parse(savedUser) : null
    } catch {
      return null
    }
  })

  const [documents, setDocuments] = useState([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [auditDocumentId, setAuditDocumentId] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')
  
const [recipientDocumentId, setRecipientDocumentId] = useState('');
const [recipients, setRecipients] = useState([]);
const [recipientsLoading, setRecipientsLoading] = useState(false);
const [recipientsError, setRecipientsError] = useState('');
const [revokingRecipient, setRevokingRecipient] = useState('');


  async function apiRequest(path, options = {}) {
    const token = sessionStorage.getItem('trustvault_token')

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })

    if (response.status === 401) {
      throw new Error('Your session may have expired. Please sign in again.')
    }

    return response
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !password) {
      setError('Please enter your email and password.')
      return
    }

    if (!isLogin && password.length < 8) {
      setError('Password must contain at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `${API_URL}/${isLogin ? 'login' : 'register'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: normalizedEmail,
            password,
          }),
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || `Request failed (${response.status})`)
      }

      if (isLogin) {
        if (!data.token || !data.user) {
          throw new Error('Login response did not contain a token and user.')
        }

        sessionStorage.setItem('trustvault_token', data.token)
        sessionStorage.setItem('trustvault_user', JSON.stringify(data.user))
        setUser(data.user)
        setPassword('')
        setSuccess('')
      } else {
        setSuccess('Account created successfully. You can now sign in.')
        setIsLogin(true)
        setPassword('')
      }
    } catch (err) {
      setError(
        err.message === 'Failed to fetch'
          ? 'Cannot connect to the backend. Check that server.js is running.'
          : err.message
      )
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    sessionStorage.removeItem('trustvault_token')
    sessionStorage.removeItem('trustvault_user')
    setUser(null)
    setEmail('')
    setPassword('')
    setDocuments([])
    setAuditLogs([])
    setAuditDocumentId(null)
    setError('')
    setSuccess('')
  }

  async function loadDocuments() {
    setDocumentsLoading(true)
    setDocumentsError('')

    try {
      const response = await apiRequest('/api/documents')
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || 'Could not load documents.')
      }

      const list = Array.isArray(data) ? data : data.documents

      if (!Array.isArray(list)) {
        throw new Error('Unexpected response from the documents API.')
      }

      setDocuments(list)
    } catch (err) {
      setDocumentsError(err.message)
    } finally {
      setDocumentsLoading(false)
    }
  }

  useEffect(() => {
    if (user) loadDocuments()
  }, [user])

  async function handleUpload(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!uploadFile) {
      setError('Please choose a PDF file first.')
      return
    }

    if (
      uploadFile.type !== 'application/pdf' &&
      !uploadFile.name.toLowerCase().endsWith('.pdf')
    ) {
      setError('Only PDF files are allowed.')
      return
    }

    if (uploadFile.size > 5 * 1024 * 1024) {
      setError('The PDF must be 5 MB or smaller.')
      return
    }

    const formData = new FormData()
    formData.append('document', uploadFile)

    setUploading(true)

    try {
      const response = await apiRequest('/api/documents', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || 'Upload failed.')
      }

      setSuccess(data.message || 'Document uploaded successfully.')
      setUploadFile(null)

      const fileInput = document.getElementById('pdf-upload')
      if (fileInput) fileInput.value = ''

      await loadDocuments()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function downloadDocument(doc) {
    setError('')
    setSuccess('')

    try {
      const response = await apiRequest(
        `/api/documents/${doc.id}/download`
      )

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Download failed.')
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = objectUrl
      link.download = doc.filename || `document-${doc.id}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)

      setSuccess('Download started.')
    } catch (err) {
      setError(err.message)
    }
  }
  
async function viewDocument(doc) {
  try {
    setError('');

    const response = await apiRequest(
      `/api/documents/${doc.id}/view`
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Could not open PDF.');
    }

    const pdfBlob = await response.blob();
    const pdfUrl = URL.createObjectURL(pdfBlob);

    const pdfWindow = window.open(pdfUrl, '_blank');

    if (!pdfWindow) {
      URL.revokeObjectURL(pdfUrl);
      throw new Error('Allow pop-ups to open the PDF.');
    }

    pdfWindow.addEventListener('beforeunload', () => {
      URL.revokeObjectURL(pdfUrl);
    }, { once: true });
  } catch (err) {
    setError(err.message || 'Could not open PDF.');
  }
}


  async function viewAuditLogs(doc) {
    setAuditDocumentId(doc.id)
    setAuditLogs([])
    setAuditError('')
    setAuditLoading(true)

    try {
      const response = await apiRequest(
        `/api/documents/${doc.id}/audit-logs`
      )
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || 'Could not retrieve audit logs.')
      }

      const logs = Array.isArray(data)
        ? data
        : data.logs || data.auditLogs || data.audit_logs

      if (!Array.isArray(logs)) {
        throw new Error('Unexpected response from the audit-log API.')
      }

      setAuditLogs(logs)
    } catch (err) {
      setAuditError(err.message)
    } finally {
      setAuditLoading(false)
    }
  }


  async function revokeAccess(documentId, recipientEmail) {
    const confirmed = window.confirm(
      `Revoke all access for ${recipientEmail} to this document?`
    )

    if (!confirmed) return

    setError('')
    setSuccess('')

    try {
      const response = await apiRequest(
        `/api/documents/${documentId}/permissions`,
        {
          method: 'DELETE',
          body: JSON.stringify({ email: recipientEmail.trim().toLowerCase() }),
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || 'Could not revoke access.')
      }

      setSuccess(data.message || 'Access revoked successfully.')
      await loadDocuments()
    } catch (err) {
      setError(err.message)
    }
  }


async function loadRecipients(documentId) {
  setRecipientDocumentId(String(documentId));
  setRecipients([]);
  setRecipientsError('');
  setRecipientsLoading(true);

  try {
    const response = await apiRequest(
      `/api/documents/${documentId}/permissions`
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Could not load recipients.');
    }

    setRecipients(Array.isArray(data.recipients) ? data.recipients : []);
  } catch (err) {
    setRecipientsError(err.message);
  } finally {
    setRecipientsLoading(false);
  }
}

async function handleRevokeRecipient(recipient) {
  const documentId = Number(recipientDocumentId);

  if (!documentId || !recipient.recipient_email) return;

  if (
    !window.confirm(
      `Revoke all access for ${recipient.recipient_email} to this document?`
    )
  ) {
    return;
  }

  const revokeKey = `${documentId}:${recipient.user_id}`;
  setRevokingRecipient(revokeKey);
  setError('');
  setSuccess('');
  setRecipientsError('');

  try {
    const response = await apiRequest(
      `/api/documents/${documentId}/permissions`,
      {
        method: 'DELETE',
        body: JSON.stringify({ email: recipient.recipient_email }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Could not revoke access.');
    }

    setSuccess(data.message || 'Recipient access revoked successfully.');

    await loadRecipients(documentId);
    await loadDocuments();
  } catch (err) {
    setError(err.message);
  } finally {
    setRevokingRecipient('');
  }
}


  if (user) {
  return (
    <main className="app-shell tv-dashboard">
      <header className="topbar">
        <a className="brand" href="#dashboard">
          <span className="brand-icon">T</span>
          TrustVault
        </a>

        <span className="topbar-note">
          <span className="status-dot" /> Secure workspace
        </span>

        <button className="secondary-button" onClick={logout}>
          Sign out
        </button>
      </header>

      <div className="tv-layout">
        <aside className="tv-sidebar">
          <p className="tv-sidebar-label">WORKSPACE</p>

          <a className="tv-nav active" href="#dashboard">
            <span>▦</span> Overview
          </a>
          <a className="tv-nav" href="#documents">
            <span>▤</span> My documents
          </a>
          <a className="tv-nav" href="#sharing">
            <span>♧</span> Access control
          </a>
          <a className="tv-nav" href="#audit">
            <span>≋</span> Audit trail
          </a>

          <div className="tv-sidebar-bottom">
            <div className="tv-security-icon">✓</div>
            <strong>Security status</strong>
            <p>Your workspace is authenticated.</p>
            <span className="tv-secure-badge">● Session active</span>
          </div>
        </aside>

        <section className="tv-main" id="dashboard">
          <div className="tv-page-heading">
            <div>
              <span className="eyebrow">YOUR SECURE WORKSPACE</span>
              <h1>Welcome back</h1>
              <p>Manage your confidential documents in one place.</p>
            </div>
            <button
              className="secondary-button"
              onClick={loadDocuments}
              disabled={documentsLoading}
            >
              ↻ {documentsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="tv-account-strip">
            <span className="tv-avatar">
              {(user.email || 'U').charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{user.email}</strong>
              <p>Signed in to TrustVault</p>
            </div>
            <span className="tv-secure-badge">● Authenticated</span>
          </div>

          {error && (
            <div className="message error-message" role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className="message success-message" role="status">
              {success}
            </div>
          )}

          <div className="tv-stats-grid">
            <article className="tv-stat-card">
              <span className="tv-stat-icon">▤</span>
              <p>Total accessible documents</p>
              <strong>{documents.length}</strong>
              <span>Available to your account</span>
            </article>

            <article className="tv-stat-card">
              <span className="tv-stat-icon">♧</span>
              <p>Owned documents</p>
              <strong>
                {documents.filter(
                  (doc) => doc.access_type === 'owner'
                ).length}
              </strong>
              <span>Documents you control</span>
            </article>

            <article className="tv-stat-card">
              <span className="tv-stat-icon">◈</span>
              <p>Shared with you</p>
              <strong>
                {documents.filter(
                  (doc) => doc.access_type === 'shared'
                ).length}
              </strong>
              <span>Documents you can access</span>
            </article>
          </div>

          <section className="tv-panel" id="documents">
            <div className="tv-panel-heading">
              <div>
                <h2>My Documents</h2>
                <p>Your accessible files and document actions.</p>
              </div>
              <span className="tv-count">{documents.length} files</span>
            </div>

            <form className="tv-upload-form" onSubmit={handleUpload}>
              <div>
                <strong>Upload a secure document</strong>
                <p>PDF format · Maximum file size 5 MB</p>
                <input
                  id="pdf-upload"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) =>
                    setUploadFile(event.target.files?.[0] || null)
                  }
                />
              </div>
              <button className="submit-button" type="submit" disabled={uploading}>
                {uploading ? 'Uploading...' : '+ Upload PDF'}
              </button>
            </form>

            {documentsError && (
              <div className="message error-message" role="alert">
                {documentsError}
              </div>
            )}

            {documentsLoading && <p>Loading your documents...</p>}

            {!documentsLoading && !documentsError && documents.length === 0 && (
              <div className="tv-empty-state">
                <span>▤</span>
                <h3>No documents yet</h3>
                <p>Upload your first PDF to get started.</p>
              </div>
            )}

            {documents.length > 0 && (
              <div className="tv-table-wrap">
                <table className="tv-doc-table">
                  <thead>
                    <tr>
                      <th>DOCUMENT</th>
                      <th>ACCESS</th>
                      <th>DATE ADDED</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <div className="tv-file-cell">
                            <span className="tv-pdf-icon">PDF</span>
                            <div>
                              <strong>{doc.filename || `Document ${doc.id}`}</strong>
                              <small>ID: {doc.id}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="tv-access-label">
                            {doc.access_type === 'owner' ? 'Owner' : 'Shared'}
                          </span>
                        </td>
                        <td>
                          {doc.created_at
                            ? new Date(doc.created_at).toLocaleDateString()
                            : '—'}
                        </td>
                        <td>
                          <div className="tv-actions">
                            
<div className="tv-actions">
  <button
    className="secondary-button"
    onClick={() => viewDocument(doc)}
  >
    View
  </button>

  <button
    className="secondary-button"
    onClick={() => downloadDocument(doc)}
  >
    Download
  </button>

  {doc.access_type === 'owner' && (
    <button
      className="secondary-button"
      onClick={() => viewAuditLogs(doc)}
    >
      Audit
    </button>
  )}
</div>

                            
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="tv-panel" id="sharing">
            <div className="tv-panel-heading">
              <div>
                <h2>Access Control</h2>
                <p>Share a document with a registered TrustVault user.</p>
              </div>
            </div>

            <div className="tv-info-banner">
              <span>ⓘ</span>
              <p>
                Choose a document you own and assign the minimum permission
                the recipient needs. Only registered users can be selected
                by email.
              </p>
            </div>

            <form
              className="tv-share-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setError('');
                setSuccess('');

                const form = event.currentTarget;
                const formData = new FormData(form);
                const documentId = formData.get('documentId');
                const recipientEmail = formData.get('recipientEmail');
                const permission = formData.get('permission');

                try {
                  const response = await apiRequest(
                    `/api/documents/${documentId}/permissions`,
                    {
                      method: 'POST',
                      body: JSON.stringify({
                        email: recipientEmail,
                        permission,
                      }),
                    }
                  );

                  const data = await response.json().catch(() => ({}));
                  if (!response.ok) {
                    throw new Error(data.message || 'Could not share document.');
                  }

                  setSuccess(data.message || 'Permission granted successfully.');
                  form.reset();
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              <label htmlFor="share-document">Document</label>
              <select id="share-document" name="documentId" required defaultValue="">
                <option value="" disabled>Select a document you own</option>
                {documents
                  .filter((doc) => doc.access_type === 'owner')
                  .map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.filename || `Document ${doc.id}`}
                    </option>
                  ))}
              </select>

              <label htmlFor="recipient-email">Recipient email</label>
              <input
                id="recipient-email"
                name="recipientEmail"
                type="email"
                placeholder="recipient@example.com"
                required
              />

              <label htmlFor="share-permission">Permission</label>
              <select
                id="share-permission"
                name="permission"
                defaultValue="view"
                required
              >
                <option value="view">View</option>
                <option value="download">Download</option>
                <option value="edit">Edit</option>
              </select>

              <button className="submit-button" type="submit">
                Grant access →
              </button>
            </form>

            <div className="tv-revoke-divider" />

            <div className="tv-panel-heading">
              <div>
                <h2>Revoke Access</h2>
                <p>Remove a recipient's permissions for a document you own.</p>
              </div>
            </div>

            <form
              className="tv-share-form"
              onSubmit={async (event) => {
                event.preventDefault()
                setError('')
                setSuccess('')

                const form = event.currentTarget
                const formData = new FormData(form)
                const documentId = Number(formData.get('revokeDocumentId'))
                const recipientEmail = String(
                  formData.get('revokeEmail') || ''
                ).trim()

                if (!documentId || !recipientEmail) {
                  setError('Select a document and enter the recipient email.')
                  return
                }

                await revokeAccess(documentId, recipientEmail)
                form.reset()
              }}
            >
              <label htmlFor="revoke-document">Document</label>
              <select
                id="revoke-document"
                name="revokeDocumentId"
                required
                defaultValue=""
              >
                <option value="" disabled>Select a document you own</option>
                {documents
                  .filter((doc) => doc.access_type === 'owner')
                  .map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.filename || `Document ${doc.id}`}
                    </option>
                  ))}
              </select>

              <label htmlFor="revoke-email">Recipient email</label>
              <input
                id="revoke-email"
                name="revokeEmail"
                type="email"
                placeholder="recipient@example.com"
                required
              />

              <button className="tv-revoke-button" type="submit">
                Revoke access
              </button>
            </form>

            <p className="tv-muted-note">
              This removes all permissions for the entered recipient on the
              selected document. The action is recorded in the audit trail.
            </p>
          </section>
          
<div className="tv-recipient-manager">
  <h3>Authorized Recipients</h3>
  <p>Select a document to view its current recipients and permissions.</p>

  <label htmlFor="recipient-document">Your document</label>
  <select
    id="recipient-document"
    value={recipientDocumentId}
    onChange={(event) => {
      const id = event.target.value;

      if (id) {
        loadRecipients(id);
      } else {
        setRecipientDocumentId('');
        setRecipients([]);
        setRecipientsError('');
      }
    }}
  >
    <option value="">Select a document</option>
    {documents
      .filter((doc) => doc.access_type === 'owner')
      .map((doc) => (
        <option key={doc.id} value={String(doc.id)}>
          {doc.filename || `Document ${doc.id}`}
        </option>
      ))}
  </select>

  {recipientsLoading && <p>Loading recipients...</p>}

  {recipientsError && (
    <div className="message error-message" role="alert">
      {recipientsError}
    </div>
  )}

  {!recipientsLoading && !recipientsError && recipientDocumentId && (
    <div className="tv-recipient-list">
      {recipients.length === 0 ? (
        <p>No recipients currently have access to this document.</p>
      ) : (
        recipients.map((recipient) => {
          const revokeKey =
            `${recipientDocumentId}:${recipient.user_id}`;

          return (
            <article
              className="tv-recipient-row"
              key={recipient.user_id}
            >
              <span className="tv-recipient-avatar">
                {recipient.recipient_email.charAt(0).toUpperCase()}
              </span>

              <div className="tv-recipient-details">
                <strong>{recipient.recipient_email}</strong>
                <span>
                  Permissions:{' '}
                  {(recipient.permissions || []).join(', ') || 'None'}
                </span>
              </div>

              <button
                type="button"
                className="tv-revoke-button"
                disabled={revokingRecipient === revokeKey}
                onClick={() => handleRevokeRecipient(recipient)}
              >
                {revokingRecipient === revokeKey
                  ? 'Revoking...'
                  : 'Revoke'}
              </button>
            </article>
          );
        })
      )}
    </div>
  )}
</div>


          
{auditDocumentId !== null && (
  <section className="tv-panel tv-audit-panel" id="audit">
    <div className="tv-panel-heading">
      <div>
        <span className="tv-audit-eyebrow">SECURITY MONITORING</span>
        <h2>Audit Trail</h2>
        <p>
          A detailed history of activity for this document.
        </p>
      </div>

      <div className="tv-audit-header-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={auditLoading}
          onClick={() => {
            const doc = documents.find(
              (item) => Number(item.id) === Number(auditDocumentId)
            );
            if (doc) viewAuditLogs(doc);
          }}
        >
          {auditLoading ? 'Refreshing...' : '↻ Refresh'}
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setAuditDocumentId(null);
            setAuditLogs([]);
            setAuditError('');
          }}
        >
          Close
        </button>
      </div>
    </div>

    <div className="tv-audit-summary">
      <div className="tv-audit-summary-card">
        <span>Total events loaded</span>
        <strong>{auditLogs.length}</strong>
      </div>
      <div className="tv-audit-summary-card">
        <span>Latest activity</span>
        <strong>
          {auditLogs.length > 0 && auditLogs[0].created_at
            ? new Date(auditLogs[0].created_at).toLocaleDateString()
            : '—'}
        </strong>
      </div>
      <div className="tv-audit-summary-card">
        <span>Document ID</span>
        <strong>{auditDocumentId}</strong>
      </div>
    </div>

    {auditLoading && (
      <p className="tv-audit-message">Loading audit events...</p>
    )}

    {auditError && (
      <div className="message error-message" role="alert">
        {auditError}
      </div>
    )}

    {!auditLoading && !auditError && auditLogs.length === 0 && (
      <div className="tv-audit-empty">
        <span>◎</span>
        <strong>No audit events yet</strong>
        <p>
          Recorded activity for this document will appear here.
        </p>
      </div>
    )}

    {!auditError && auditLogs.length > 0 && (
      <div className="tv-audit-table-wrap">
        <table className="tv-audit-table">
          <thead>
            <tr>
              <th>Activity</th>
              <th>User</th>
              <th>Document</th>
              <th>Status</th>
              <th>IP address</th>
              <th>Date &amp; time</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log, index) => {
              const action = String(
                log.action || 'Document event'
              ).replace(/[_-]+/g, ' ');

              const status = String(
                log.status || 'Unknown'
              );

              const details =
                typeof log.details === 'string'
                  ? log.details
                  : log.details
                    ? JSON.stringify(log.details)
                    : '';

              return (
                <tr key={log.id ?? index}>
                  <td>
                    <span className="tv-audit-action">
                      <span className="tv-audit-dot" />
                      {action}
                    </span>
                    {details && (
                      <small className="tv-audit-details">
                        {details}
                      </small>
                    )}
                  </td>
                  <td>
                    <span className="tv-audit-user">
                      {log.user_email || (
                        log.user_id
                          ? `User ID: ${log.user_id}`
                          : 'Unknown user'
                      )}
                    </span>
                  </td>
                  <td>
                    {log.document_name || `Document ${log.document_id || auditDocumentId}`}
                  </td>
                  <td>
                    <span
                      className={`tv-audit-status ${
                        status.toLowerCase() === 'success'
                          ? 'is-success'
                          : status.toLowerCase() === 'failed' ||
                              status.toLowerCase() === 'failure'
                            ? 'is-failed'
                            : 'is-neutral'
                      }`}
                    >
                      {status}
                    </span>
                  </td>
                  <td>{log.ip_address || '—'}</td>
                  <td>
                    {log.created_at
                      ? new Date(log.created_at).toLocaleString()
                      : 'Time unavailable'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
    </section>
    ) }
    
          <footer className="tv-footer">
            <span>TrustVault</span> · Secure document sharing
            <span> Your access. Your control.</span>
          </footer>
        </section>
      </div>
    </main>
  );
}




  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">T</span>
          TrustVault
        </a>
        <span className="topbar-note">
          Secure document sharing
        </span>
      </header>

      <section className="auth-layout">
        <div className="intro-panel">
          <div className="intro-badge">
            <span className="status-dot" />
            SECURITY YOU CAN TRUST
          </div>

          <div className="shield-art" aria-hidden="true">
            <div className="shield-glow" />
            <div className="shield-shape">✓</div>
          </div>

          <h1>Your documents.<br />Your control.</h1>

          <p className="intro-copy">
            Share sensitive files securely, control who can access them,
            and keep a record of document activity.
          </p>

          <div className="feature-list">
            <div className="feature">
              <span className="feature-icon">⌑</span>
              <div>
                <strong>Protected access</strong>
                <span>Authenticated access to your workspace</span>
              </div>
            </div>

            <div className="feature">
              <span className="feature-icon">↗</span>
              <div>
                <strong>Controlled sharing</strong>
                <span>Manage document viewing permissions</span>
              </div>
            </div>

            <div className="feature">
              <span className="feature-icon">≋</span>
              <div>
                <strong>Activity trail</strong>
                <span>Keep track of document events</span>
              </div>
            </div>
          </div>

          <p className="privacy-note">
            <span>✳</span> Built for privacy and accountability
          </p>
        </div>

        <div className="form-panel">
          <div className="form-card">
            <div className="form-logo">T</div>

            <p className="form-eyebrow">
              {isLogin ? 'WELCOME BACK' : 'GET STARTED'}
            </p>

            <h2>
              {isLogin ? 'Sign in to TrustVault' : 'Create your account'}
            </h2>

            <p className="form-description">
              {isLogin
                ? 'Enter your details to access your secure workspace.'
                : 'Set up your account to manage documents securely.'}
            </p>

            <div className="auth-tabs">
              <button
                type="button"
                className={isLogin ? 'auth-tab active' : 'auth-tab'}
                onClick={() => {
                  setIsLogin(true)
                  setError('')
                  setSuccess('')
                }}
              >
                Sign in
              </button>

              <button
                type="button"
                className={!isLogin ? 'auth-tab active' : 'auth-tab'}
                onClick={() => {
                  setIsLogin(false)
                  setError('')
                  setSuccess('')
                }}
              >
                Register
              </button>
            </div>

            {error && (
              <div className="message error-message" role="alert">
                <span>!</span> {error}
              </div>
            )}

            {success && (
              <div className="message success-message" role="status">
                <span>✓</span> {success}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />

              <div className="password-label">
                <label htmlFor="password">Password</label>
                {isLogin && <span>Secure sign-in</span>}
              </div>

              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={
                    isLogin ? 'Enter your password' : 'At least 8 characters'
                  }
                  autoComplete={
                    isLogin ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={isLogin ? undefined : 8}
                  required
                />

                <button
                  type="button"
                  className="show-password"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <button
                className="submit-button"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? 'Please wait...'
                  : isLogin
                    ? 'Sign in securely →'
                    : 'Create account →'}
              </button>
            </form>

            <div className="form-footer">
              <span className="lock-icon">♧</span>
              Your connection is protected
            </div>
          </div>

          <p className="terms-note">
            TrustVault · Secure document sharing
          </p>
        </div>
      </section>
    </main>
  )
}

export default App
