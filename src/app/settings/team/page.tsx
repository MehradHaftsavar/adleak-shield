'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus, Trash2, Clock, Pencil, Check, X } from 'lucide-react';
import { PLAN_LIMITS } from '@/lib/planLimits';
import type { PlanType } from '@/types/auth';

interface Member {
  memberId:   string;
  email:      string;
  role:       string;
  addedAt:    string;
  acceptedAt: string | null;
  status:     'active' | 'pending';
  domains:    string;
  domainIds:  string[];
}

interface PendingInvite {
  invitationId: string;
  email:        string;
  role:         string;
  createdAt:    string;
  expiresAt:    string;
}

export default function TeamPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [members,     setMembers]     = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<PendingInvite[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  // Invite form
  const [inviteEmail,     setInviteEmail]     = useState('');
  const [inviteRole,      setInviteRole]      = useState<'editor' | 'visitor'>('editor');
  const [inviteDomainIds, setInviteDomainIds] = useState<string[]>([]); // empty = all
  const [inviting,        setInviting]        = useState(false);
  const [inviteMsg,       setInviteMsg]       = useState('');
  const [inviteError,     setInviteError]     = useState('');
  const [actionError,     setActionError]     = useState('');
  const [confirmRemove,   setConfirmRemove]   = useState<{ memberId: string; email: string } | null>(null);
  const [confirmCancel,   setConfirmCancel]   = useState<{ invitationId: string; email: string } | null>(null);

  // Inline edit state for active members
  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [editRole,        setEditRole]        = useState<'editor' | 'visitor'>('editor');
  const [editDomainIds,   setEditDomainIds]   = useState<string[]>([]);
  const [editSaving,      setEditSaving]      = useState(false);
  const [editError,       setEditError]       = useState('');

  // Owner's domains (for invite domain picker)
  const [ownerDomains, setOwnerDomains] = useState<{ domainId: string; domainName: string }[]>([]);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.tenantId) {
      loadTeam();
      fetch('/api/domain').then(r => r.ok ? r.json() : null).then(data => {
        if (data?.domains) setOwnerDomains(data.domains);
      });
    }
  }, [status, session]);

  async function loadTeam() {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/team/members');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load team');
      setMembers(data.members ?? []);
      setInvitations(data.pendingInvitations ?? []);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteMsg('');
    setInviteError('');

    try {
      const res  = await fetch('/api/team/invite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:     inviteEmail,
          role:      inviteRole,
          domainIds: inviteDomainIds.length > 0 ? inviteDomainIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || 'Failed to send invitation');
        return;
      }
      setInviteMsg(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      loadTeam();
    } catch {
      setInviteError('Network error. Please try again.');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(memberId: string, email: string) {
    setConfirmRemove({ memberId, email });
  }

  async function confirmRemoveMember() {
    if (!confirmRemove) return;
    setActionError('');
    try {
      const res = await fetch(`/api/team/members/${confirmRemove.memberId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        setActionError(d.error || 'Failed to remove member');
        return;
      }
      setConfirmRemove(null);
      loadTeam();
    } catch {
      setActionError('Network error. Please try again.');
    }
  }

  async function handleCancelInvite(invitationId: string, email: string) {
    setConfirmCancel({ invitationId, email });
  }

  async function confirmCancelInvite() {
    if (!confirmCancel) return;
    setActionError('');
    try {
      const res = await fetch(`/api/team/invite/${confirmCancel.invitationId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        setActionError(d.error || 'Failed to cancel invitation');
        return;
      }
      setConfirmCancel(null);
      loadTeam();
    } catch {
      setActionError('Network error. Please try again.');
    }
  }

  function startEditing(m: Member) {
    setEditingId(m.memberId);
    setEditRole(m.role as 'editor' | 'visitor');
    setEditDomainIds(m.domainIds);
    setEditError('');
  }

  async function saveEdit(memberId: string) {
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/team/members/${memberId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role: editRole, domainIds: editDomainIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'Failed to update member');
        return;
      }
      setEditingId(null);
      loadTeam();
    } catch {
      setEditError('Network error. Please try again.');
    } finally {
      setEditSaving(false);
    }
  }

  if (status === 'loading' || (status === 'authenticated' && !session?.user?.tenantId)) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-8 h-8 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const planType  = (session?.user?.planType ?? 'starter') as PlanType;
  const limits    = PLAN_LIMITS[planType];
  const usedSeats = 1 + members.filter(m => m.status === 'active').length + invitations.length;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
          <Users className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-600 text-sm">
            {usedSeats}/{limits.seats} seats used &bull; {limits.label} plan
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={loadTeam}
            className="flex-shrink-0 text-sm font-medium text-red-700 underline hover:text-red-900 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {actionError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <p className="text-sm text-red-700">{actionError}</p>
          <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600 ml-4 text-xs">Dismiss</button>
        </div>
      )}

      {/* Confirm remove member */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Remove team member?</h3>
            <p className="text-sm text-gray-600 mb-5">
              <strong>{confirmRemove.email}</strong> will lose access to your workspace immediately.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmRemove(null)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveMember}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm cancel invite */}
      {confirmCancel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Cancel invitation?</h3>
            <p className="text-sm text-gray-600 mb-5">
              The invitation for <strong>{confirmCancel.email}</strong> will be cancelled and the link will no longer work.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmCancel(null)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Keep
              </button>
              <button
                onClick={confirmCancelInvite}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Cancel invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite form */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-gray-500" />
          Invite a team member
        </h2>

        {usedSeats >= limits.seats ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Seat limit reached ({limits.seats} seats on {limits.label}). Upgrade your plan to add more members.
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'editor' | 'visitor')}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="editor">Editor</option>
                <option value="visitor">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={inviting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                {inviting ? 'Sending…' : 'Send invite'}
              </button>
            </div>

            {/* Domain access picker */}
            {ownerDomains.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-xs font-medium text-gray-700 mb-2">
                  Domain access
                  <span className="ml-1 font-normal text-gray-400">
                    {inviteDomainIds.length === 0 ? '(all domains)' : `(${inviteDomainIds.length} selected)`}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {ownerDomains.map(d => {
                    const checked = inviteDomainIds.length === 0 || inviteDomainIds.includes(d.domainId);
                    return (
                      <label key={d.domainId} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            if (inviteDomainIds.length === 0) {
                              // Was "all" — uncheck this one means select all others
                              setInviteDomainIds(ownerDomains.map(x => x.domainId).filter(id => id !== d.domainId));
                            } else if (inviteDomainIds.includes(d.domainId)) {
                              const next = inviteDomainIds.filter(id => id !== d.domainId);
                              // If none left selected, revert to "all"
                              setInviteDomainIds(next.length > 0 ? next : []);
                            } else {
                              const next = [...inviteDomainIds, d.domainId];
                              // If all selected, revert to "all"
                              setInviteDomainIds(next.length === ownerDomains.length ? [] : next);
                            }
                          }}
                          className="w-3.5 h-3.5 rounded accent-indigo-600"
                        />
                        <span className="text-xs text-gray-700">{d.domainName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </form>
        )}

        {inviteMsg   && (
          <div className="mt-3 space-y-1">
            <p className="text-sm text-green-700">{inviteMsg}</p>
            <p className="text-xs text-gray-500">📬 Ask them to check their spam folder if they don't see it within a few minutes.</p>
          </div>
        )}
        {inviteError && <p className="mt-3 text-sm text-red-600">{inviteError}</p>}

        <div className="mt-4 text-xs text-gray-500 space-y-1">
          <p><strong>Editor</strong> — can view data and manage campaigns (cannot change subscription or team)</p>
          <p><strong>Viewer</strong> — read-only access to data (no write operations)</p>
        </div>
      </div>

      {/* Members list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Members</h2>
        </div>

        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded" />)}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {/* Owner row */}
            <li className="px-6 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-indigo-600">
                    {(session?.user?.email ?? 'O')[0].toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{session?.user?.email}</p>
                  <p className="text-xs text-gray-500">Owner</p>
                </div>
              </div>
              <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                Owner
              </span>
            </li>

            {/* Active members */}
            {members.filter(m => m.status === 'active').map(m => (
              <li key={m.memberId} className="border-b border-gray-100 last:border-b-0">
                {/* Member row */}
                <div className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-gray-500">
                        {m.email[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.email}</p>
                      <p className="text-xs text-gray-500 truncate">{m.domains || 'All domains'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      m.role === 'editor' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {m.role === 'editor' ? 'Editor' : 'Viewer'}
                    </span>
                    <button
                      onClick={() => editingId === m.memberId ? setEditingId(null) : startEditing(m)}
                      className={`p-1.5 transition-colors rounded ${editingId === m.memberId ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-600'}`}
                      title="Edit access"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRemoveMember(m.memberId, m.email)}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors rounded"
                      title="Remove member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Inline edit panel */}
                {editingId === m.memberId && (
                  <div className="px-6 pb-5 pt-4 bg-indigo-50 border-t border-indigo-100">
                    <p className="text-xs font-semibold text-indigo-700 mb-4 uppercase tracking-wide">Edit access for {m.email}</p>

                    {/* Role */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                      <div className="flex gap-2">
                        {(['editor', 'visitor'] as const).map(r => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setEditRole(r)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              editRole === r
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                            }`}
                          >
                            {r === 'editor' ? 'Editor' : 'Viewer'}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {editRole === 'editor' ? 'Can view data and manage campaigns' : 'Read-only access to data'}
                      </p>
                    </div>

                    {/* Domain access */}
                    {ownerDomains.length > 0 && (
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Domain access
                          <span className="ml-1 font-normal text-gray-400">
                            {editDomainIds.length === ownerDomains.length ? '(all domains)' : editDomainIds.length === 0 ? '(none)' : `(${editDomainIds.length} selected)`}
                          </span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {ownerDomains.map(d => {
                            const checked = editDomainIds.includes(d.domainId);
                            return (
                              <label key={d.domainId} className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    if (checked) {
                                      setEditDomainIds(editDomainIds.filter(id => id !== d.domainId));
                                    } else {
                                      setEditDomainIds([...editDomainIds, d.domainId]);
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded accent-indigo-600"
                                />
                                <span className="text-xs text-gray-700">{d.domainName}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {editError && <p className="mb-2 text-xs text-red-600">{editError}</p>}

                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(m.memberId)}
                        disabled={editSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {editSaving ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        disabled={editSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium rounded-lg border border-gray-300 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}

            {/* Pending invitations */}
            {invitations.map(inv => (
              <li key={inv.invitationId} className="px-6 py-4 flex items-center justify-between gap-4 bg-gray-50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{inv.email}</p>
                    <p className="text-xs text-amber-600">Invite pending — expires {new Date(inv.expiresAt).toLocaleDateString('en-GB')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    inv.role === 'editor' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {inv.role === 'editor' ? 'Editor' : 'Viewer'}
                  </span>
                  <button
                    onClick={() => handleCancelInvite(inv.invitationId, inv.email)}
                    className="p-1.5 text-gray-400 hover:text-red-600 transition-colors rounded"
                    title="Cancel invitation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}

            {members.length === 0 && invitations.length === 0 && (
              <li className="px-6 py-8 text-center text-sm text-gray-500">
                No team members yet. Invite someone above to get started.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
