'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DomainStep } from '@/components/onboarding/DomainStep';
import { CampaignStep } from '@/components/onboarding/CampaignStep';
import { SnippetStep } from '@/components/onboarding/SnippetStep';

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [domain, setDomain] = useState<string>('');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user already completed onboarding
  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/domain');
      if (res.ok) {
        const data = await res.json();
        if (data.domain) {
          setDomain(data.domain);
          // If domain exists, move to campaign step
          setCurrentStep(2);
        }
      }
    } catch (error) {
      console.error('Failed to check onboarding status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDomainComplete = (registeredDomain: string) => {
    setDomain(registeredDomain);
    setCurrentStep(2);
  };

  const handleCampaignsComplete = (registeredCampaigns: any[]) => {
    setCampaigns(registeredCampaigns);
    setCurrentStep(3);
  };

  const handleOnboardingComplete = () => {
    // Redirect to dashboard
    router.push('/dashboard');
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-3xl mx-auto">
            {/* Progress indicator skeleton */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                {[1, 2, 3].map((step) => (
                  <div key={step} className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-gray-300 animate-pulse" />
                    {step < 3 && <div className="w-24 h-1 mx-2 bg-gray-300 animate-pulse" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Content skeleton */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="animate-pulse space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-6 bg-gray-200 rounded w-1/3" />
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                  <div className="h-12 bg-gray-200 rounded" />
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                </div>
                <div className="h-12 bg-gray-200 rounded w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-12">
        {/* Progress indicator */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                    currentStep >= step
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}
                >
                  {step}
                </div>
                {step < 3 && (
                  <div
                    className={`w-24 h-1 mx-2 transition-colors ${
                      currentStep > step ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-sm text-gray-600">
            <span>Domain</span>
            <span>Campaigns</span>
            <span>Install Script</span>
          </div>
        </div>

        {/* Step content */}
        <div className="max-w-3xl mx-auto">
          {currentStep === 1 && (
            <DomainStep
              onComplete={handleDomainComplete}
              existingDomain={domain}
            />
          )}

          {currentStep === 2 && (
            <CampaignStep
              domain={domain}
              onComplete={handleCampaignsComplete}
              onBack={() => setCurrentStep(1)}
            />
          )}

          {currentStep === 3 && (
            <SnippetStep
              domain={domain}
              campaigns={campaigns}
              onComplete={handleOnboardingComplete}
              onBack={() => setCurrentStep(2)}
            />
          )}
        </div>
      </div>
    </div>
  );
}