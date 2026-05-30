'use client';

import { useState, useEffect } from 'react';
import { Globe, Trash2, Plus, AlertTriangle } from 'lucide-react';

interface DomainStepProps {
  onComplete: (domain: string) => void;
  existingDomain?: string;
}

export function DomainStep({ onComplete, existingDomain }: DomainStepProps) {
  const [domain, setDomain] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    const fetchDomain = async () => {
      setIsFetching(true);
      try {
        const res = await fetch('/api/domain');
        if (res.ok) {
          const data = await res.json();
          if (data.domain) {
            setDomain(data.domain);
          }
        }
      } catch (err) {
        console.error('Failed to fetch domain:', err);
      } finally {
        setIsFetching(false);
      }
    };
    fetchDomain();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to register domain');
        setIsLoading(false);
        return;
      }

      setDomain(data.domain);
      setNewDomain('');
      setIsLoading(false);
    } catch (err) {
      setError('Network error. Please try again.');
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteModal(false);
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/domain', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to delete domain');
        setIsLoading(false);
        return;
      }

      setDomain('');
      setIsLoading(false);
    } catch (err) {
      setError('Network error. Please try again.');
      setIsLoading(false);
    }
  };

  const handleContinue = () => {
    if (!domain) {
      setError('Please add a domain to continue');
      return;
    }
    onComplete(domain);
  };

  return (
    <>
    <div className="bg-white rounded-lg shadow-lg p-8 relative">
      {/* Loading overlay */}
      {(isFetching || isLoading) && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
          <div className="text-center">
            <svg className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-600 font-medium">
              {isFetching ? 'Loading...' : 'Saving...'}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
          <Globe className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Register Your Domain</h2>
          <p className="text-gray-600 mt-1">
            Enter the website domain you're running Google Ads for
          </p>
        </div>
      </div>

      {/* Existing domain */}
      {domain && (
        <div className="mb-6">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <p className="font-semibold text-gray-900">Your Domain</p>
              <p className="text-sm text-gray-600">{domain}</p>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="text-red-600 hover:text-red-700 p-2"
              title="Remove domain"
              disabled={isFetching || isLoading}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Add domain form - only show if no domain exists */}
      {!domain && (
        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div>
            <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-2">
              Website Domain <span className="text-red-500">*</span>
            </label>
            <input
              id="domain"
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="e.g., my-plumbing-site.co.uk"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={isFetching || isLoading}
            />
            <p className="mt-2 text-sm text-gray-500">
              Enter your domain without http:// or www. (e.g., example.co.uk)
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading || isFetching || !newDomain.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Domain
          </button>
        </form>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          <strong>Starter Plan:</strong> You can register 1 domain and up to 3 campaigns.
        </p>
      </div>

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={!domain || isFetching}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        Continue to Campaigns →
      </button>

      <p className="text-center text-sm text-gray-600 mt-4">
        {domain ? '1 / 1 domain registered' : '0 / 1 domain registered'}
      </p>
    </div>

    {/* Delete domain confirmation modal */}
    {showDeleteModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mx-auto mb-5">
            <AlertTriangle className="w-7 h-7 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
            Remove domain?
          </h2>
          <p className="text-sm text-gray-600 text-center mb-6">
            This will permanently delete <strong>{domain}</strong> and{' '}
            <strong>all campaigns and tracking data</strong> associated with it.
            This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Yes, remove it
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}