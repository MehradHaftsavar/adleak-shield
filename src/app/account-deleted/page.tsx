import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

export default function AccountDeletedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">Account deleted</h1>
        <p className="text-gray-600 text-sm mb-2">
          Your account and all associated data have been permanently deleted in
          accordance with your right to erasure under UK GDPR.
        </p>
        <p className="text-gray-500 text-sm mb-8">
          If you had an active subscription, it has been cancelled and no further
          charges will be made.
        </p>

        <Link
          href="/auth/login"
          className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
