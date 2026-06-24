'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { DomainStep } from '@/components/onboarding/DomainStep';
import { CampaignStep } from '@/components/onboarding/CampaignStep';
import { SnippetStep } from '@/components/onboarding/SnippetStep';

export default function OnboardingPage() {
  const router = useRouter();
  const { update, status } = useSession();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [domain, setDomain] = useState<string>('');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Redirect to login (with return URL) if session expires while on this page
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=%2Fonboarding');
    }
  }, [status, router]);

  // Check if user already completed onboarding
  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    setIsLoading(true);
    try {
      const [domainRes, campaignsRes] = await Promise.all([
        fetch('/api/domain'),
        fetch('/api/campaigns'),
      ]);

      if (domainRes.ok) {
        const domainData = await domainRes.json();
        if (domainData.domain) {
          setDomain(domainData.domain);

          // If campaigns also exist, restore to step 3
          if (campaignsRes.ok) {
            const campaignsData = await campaignsRes.json();
            const existing = campaignsData.campaigns || [];
            if (existing.length > 0) {
              setCampaigns(existing);
              setCurrentStep(3);
            } else {
              setCurrentStep(2);
            }
          } else {
            setCurrentStep(2);
          }
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

  const handleOnboardingComplete = async () => {
    setIsRedirecting(true);
    try {
      // Mark onboarding as complete in the database
      const res = await fetch('/api/user/complete-onboarding', {
        method: 'POST'
      });

      if (!res.ok) {
        console.error('Failed to mark onboarding complete');
      }

      // Refresh the JWT so the middleware sees onboardingCompleted: true
      // Without this, the middleware reads the stale token and bounces back here
      await update({ onboardingCompleted: true });

      router.push('/dashboard');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      setIsRedirecting(false);
    }
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-3xl mx-auto">
            {/* Progress indicator skeleton */}
            <div className="mb-8">
              <div className="relative flex items-center justify-between mb-2">
                <div className="absolute inset-x-5 top-5 h-1 bg-gray-300 animate-pulse" />
                {[1, 2, 3].map((step) => (
                  <div key={step} className="relative z-10">
                    <div className="w-10 h-10 rounded-full bg-gray-300 animate-pulse" />
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
      {isRedirecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-12 h-12 rounded-full border-4 border-white border-t-transparent animate-spin" />
        </div>
      )}
      <div className="container mx-auto px-4 py-12">
        {/* Progress indicator */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="relative flex items-center justify-between">
            {/* Full-width background track */}
            <div className="absolute inset-x-5 top-5 h-1 bg-gray-300" />
            {/* Filled progress track */}
            <div
              className="absolute top-5 h-1 bg-blue-600 transition-all duration-300"
              style={{
                left: '20px',
                width: currentStep === 1 ? '0%' : currentStep === 2 ? 'calc(50% - 20px)' : 'calc(100% - 40px)',
              }}
            />
            {[1, 2, 3].map((step) => (
              <div key={step} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                    currentStep >= step
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}
                >
                  {step}
                </div>
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