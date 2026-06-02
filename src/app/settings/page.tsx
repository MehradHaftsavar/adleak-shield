'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings as SettingsIcon, Trash2, AlertTriangle } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { DomainStep } from '@/components/onboarding/DomainStep';
import { CampaignStep } from '@/components/onboarding/CampaignStep';
import { SnippetStep } from '@/components/onboarding/SnippetStep';

type SettingsTab = 'domain' | 'campaigns' | 'snippet';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('domain');
  const [domain, setDomain] = useState('');

  // Delete account modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    fetch('/api/domain')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.domain) setDomain(data.domain); })
      .catch(() => {});
  }, []);

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error || 'Failed to delete account. Please try again.');
        setDeleting(false);
        return;
      }
      // Sign out and redirect to main site
      await signOut({ redirect: false });
      window.location.href = 'https://www.adleakshield.com';
    } catch {
      setDeleteError('Network error. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <>
    <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
            <SettingsIcon className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-1">Manage your tracking configuration</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200">
            {(['domain', 'campaigns', 'snippet'] as SettingsTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-colors capitalize ${
                  activeTab === tab
                    ? 'border-b-2 border-purple-600 text-purple-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab === 'snippet' ? 'Tracking Code' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'domain' && (
          <DomainStep
            onComplete={(updatedDomain) => {
              setDomain(updatedDomain);
              setActiveTab('campaigns');
            }}
            existingDomain={domain}
          />
        )}
        {activeTab === 'campaigns' && (
          <CampaignStep
            domain={domain}
            onComplete={() => setActiveTab('snippet')}
            onBack={() => setActiveTab('domain')}
          />
        )}
        {activeTab === 'snippet' && (
          <SnippetStep
            domain={domain}
            onComplete={() => router.push('/dashboard')}
            onBack={() => setActiveTab('campaigns')}
          />
        )}

        {/* Danger Zone */}
        <div className="mt-12 border border-red-200 rounded-lg bg-red-50">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
            </div>
            <p className="text-sm text-red-700 mb-4">
              Permanently delete your account and all associated data — campaigns, sessions,
              keyword data, and journey events. This action cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete My Account
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mx-auto mb-5">
              <Trash2 className="w-7 h-7 text-red-600" />
            </div>

            <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
              Delete your account?
            </h2>
            <p className="text-sm text-gray-600 text-center mb-6">
              This will permanently delete <strong>all</strong> your data — sessions,
              keywords, journey events, campaigns, and your account. Your Stripe
              subscription will also be cancelled immediately. This cannot be undone.
            </p>

            <p className="text-sm font-medium text-gray-700 mb-2">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
              autoFocus
            />

            {deleteError && (
              <p className="text-sm text-red-600 mb-4">{deleteError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setConfirmText(''); setDeleteError(''); }}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={confirmText !== 'DELETE' || deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {deleting && (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {deleting ? 'Deleting…' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
