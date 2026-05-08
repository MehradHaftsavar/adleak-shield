'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings as SettingsIcon } from 'lucide-react';
import { DomainStep } from '@/components/onboarding/DomainStep';
import { CampaignStep } from '@/components/onboarding/CampaignStep';
import { SnippetStep } from '@/components/onboarding/SnippetStep';

type SettingsTab = 'domain' | 'campaigns' | 'snippet';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('domain');
  const [domain, setDomain] = useState('');

  useEffect(() => {
    fetch('/api/domain')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.domain) setDomain(data.domain); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
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
            <button
              onClick={() => setActiveTab('domain')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'domain'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Domain
            </button>
            <button
              onClick={() => setActiveTab('campaigns')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'campaigns'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Campaigns
            </button>
            <button
              onClick={() => setActiveTab('snippet')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'snippet'
                  ? 'border-b-2 border-purple-600 text-purple-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Tracking Code
            </button>
          </div>
        </div>

        {/* Content */}
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
      </div>
    </div>
  );
}
