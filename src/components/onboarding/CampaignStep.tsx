'use client';

import { useState, useEffect } from 'react';
import { Target, Trash2, Plus, Pencil, Check, X } from 'lucide-react';

interface CampaignStepProps {
  domain: string;
  onComplete: (campaigns: any[]) => void;
  onBack: () => void;
}

export function CampaignStep({ domain, onComplete, onBack }: CampaignStepProps) {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [newCampaignId, setNewCampaignId] = useState('');
  const [newAvgCpc, setNewAvgCpc] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [editingCpcId, setEditingCpcId] = useState<string | null>(null);
  const [editingCpcValue, setEditingCpcValue] = useState('');
  const [cpcSaving, setCpcSaving] = useState(false);
  const [cpcError, setCpcError] = useState('');

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    setIsFetching(true);
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    } finally {
      setIsFetching(false);
    }
  };

  const handleAddCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validate CPC is provided and valid
    if (!newAvgCpc || parseFloat(newAvgCpc) <= 0) {
      setError('Please enter your average CPC (must be greater than £0)');
      return;
    }
    
    setIsLoading(true);

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleCampaignId: newCampaignId,
          avgCpc: parseFloat(newAvgCpc), // REQUIRED - no default
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to register campaign');
        setIsLoading(false);
        return;
      }

      // Add to list and reset form
      setCampaigns([...campaigns, data.campaign]);
      setNewCampaignId('');
      setNewAvgCpc(''); // Reset CPC field
      setIsLoading(false);
    } catch (err) {
      setError('Network error. Please try again.');
      setIsLoading(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setCampaigns(campaigns.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete campaign:', err);
    }
  };

  const handleUpdateCpc = async (campaignId: string) => {
    setCpcError('');
    const parsed = parseFloat(editingCpcValue);
    if (isNaN(parsed) || parsed < 0.01 || parsed > 1000) {
      setCpcError('Enter a valid CPC between £0.01 and £1000');
      return;
    }
    setCpcSaving(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, avgCpc: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCpcError(data.error || 'Failed to update CPC');
        return;
      }
      setCampaigns(campaigns.map(c =>
        c.id === campaignId ? { ...c, avgCpc: parsed } : c
      ));
      setEditingCpcId(null);
      setEditingCpcValue('');
    } catch {
      setCpcError('Network error. Please try again.');
    } finally {
      setCpcSaving(false);
    }
  };

  const handleContinue = () => {
    if (campaigns.length === 0) {
      setError('Please add at least 1 campaign to continue');
      return;
    }
    onComplete(campaigns);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 relative">
      {/* Loading overlay */}
      {(isFetching || isLoading) && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
          <div className="text-center">
            <svg className="animate-spin h-12 w-12 text-green-600 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-600 font-medium">
              {isFetching ? 'Loading campaigns...' : 'Adding campaign...'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
          <Target className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Add Your Campaigns</h2>
          <p className="text-gray-600 mt-1">
            Register up to 3 Google Ads Campaign IDs for {domain}
          </p>
        </div>
      </div>

      {/* Existing campaigns */}
      {campaigns.length > 0 && (
        <div className="mb-6 space-y-3">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="p-4 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">
                    Campaign {campaign.slotNumber}
                  </p>
                  <p className="text-sm text-gray-600">
                    Campaign ID: {campaign.googleCampaignId}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteCampaign(campaign.id)}
                  className="text-red-600 hover:text-red-700 p-2"
                  title="Remove campaign"
                  disabled={isFetching}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {/* CPC row */}
              {editingCpcId === campaign.id ? (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-2 text-gray-500 text-sm">£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="1000"
                        value={editingCpcValue}
                        onChange={(e) => setEditingCpcValue(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        autoFocus
                        disabled={cpcSaving}
                      />
                    </div>
                    <button
                      onClick={() => handleUpdateCpc(campaign.id)}
                      disabled={cpcSaving || !editingCpcValue}
                      className="p-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg"
                      title="Save"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setEditingCpcId(null); setEditingCpcValue(''); setCpcError(''); }}
                      disabled={cpcSaving}
                      className="p-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {cpcError && <p className="mt-1 text-xs text-red-600">{cpcError}</p>}
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    Avg. CPC: {campaign.avgCpc ? `£${campaign.avgCpc.toFixed(2)}` : 'Not set'}
                  </span>
                  <button
                    onClick={() => {
                      setEditingCpcId(campaign.id);
                      setEditingCpcValue(campaign.avgCpc ? campaign.avgCpc.toString() : '');
                      setCpcError('');
                    }}
                    className="text-blue-600 hover:text-blue-700 p-0.5"
                    title="Edit CPC"
                    disabled={isFetching}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new campaign form */}
      {campaigns.length < 3 && (
        <form onSubmit={handleAddCampaign} className="space-y-4 mb-6">
          <div>
            <label htmlFor="campaignId" className="block text-sm font-medium text-gray-700 mb-2">
              Google Ads Campaign ID <span className="text-red-500">*</span>
            </label>
            <input
              id="campaignId"
              type="text"
              value={newCampaignId}
              onChange={(e) => setNewCampaignId(e.target.value)}
              placeholder="e.g., 12345678"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
              disabled={isFetching || isLoading}
            />
          </div>

          {/* NEW: Average CPC input - REQUIRED */}
          <div>
            <label htmlFor="avgCpc" className="block text-sm font-medium text-gray-700 mb-2">
              Average CPC <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-500">£</span>
              <input
                id="avgCpc"
                type="number"
                step="0.01"
                min="0.01"
                max="1000"
                value={newAvgCpc}
                onChange={(e) => setNewAvgCpc(e.target.value)}
                placeholder="2.50"
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
                disabled={isFetching || isLoading}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              💡 Find this in Google Ads → Campaigns → "Avg. CPC" column. You can update this later if your CPC changes.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading || isFetching || !newCampaignId.trim() || !newAvgCpc}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Campaign
          </button>
        </form>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Help box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-900 font-semibold mb-2">
          Where to find your Campaign ID:
        </p>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Open Google Ads dashboard</li>
          <li>Click on "Campaigns" in the left menu</li>
          <li>Look for the numeric ID next to your campaign name</li>
          <li>Copy the full number (e.g., 12345678)</li>
        </ol>
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-4">
        <button
          onClick={onBack}
          disabled={isFetching}
          className="flex-1 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleContinue}
          disabled={campaigns.length === 0 || isFetching}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          Continue to Setup →
        </button>
      </div>

      {/* Counter */}
      <p className="text-center text-sm text-gray-600 mt-4">
        {campaigns.length} / 3 campaigns registered
      </p>
    </div>
  );
}