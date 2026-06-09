'use client';

import { useState } from 'react';
import { Calendar, X } from 'lucide-react';

interface DateRangePickerProps {
  onRangeChange: (start: string, end: string) => void;
}

export function DateRangePicker({ onRangeChange }: DateRangePickerProps) {
  const [selectedRange, setSelectedRange] = useState<'7d' | '30d' | '90d' | 'custom'>('7d');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const handlePresetChange = (range: '7d' | '30d' | '90d') => {
    setSelectedRange(range);
    setShowCustomPicker(false);
    
    const end = new Date();
    const start = new Date();
    
    switch (range) {
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
    }
    
    onRangeChange(start.toISOString(), end.toISOString());
  };

  const handleCustomClick = () => {
    setSelectedRange('custom');
    setShowCustomPicker(true);
    
    // Set default values (last 7 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    
    setCustomEnd(end.toISOString().split('T')[0]);
    setCustomStart(start.toISOString().split('T')[0]);
  };

  const handleCustomApply = () => {
    if (!customStart || !customEnd) return;
    
    const startDate = new Date(customStart);
    const endDate = new Date(customEnd);
    
    // Validate dates
    if (startDate > endDate) {
      alert('Start date must be before end date');
      return;
    }
    
    // Set end date to end of day
    endDate.setHours(23, 59, 59, 999);
    
    onRangeChange(startDate.toISOString(), endDate.toISOString());
    setShowCustomPicker(false);
  };

  const handleCustomCancel = () => {
    setShowCustomPicker(false);
    setSelectedRange('7d');
    handlePresetChange('7d');
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-5 h-5 text-gray-500 flex-shrink-0" />
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handlePresetChange('7d')}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              selectedRange === '7d'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Last 7 days
          </button>
          <button
            onClick={() => handlePresetChange('30d')}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              selectedRange === '30d'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Last 30 days
          </button>
          <button
            onClick={() => handlePresetChange('90d')}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              selectedRange === '90d'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Last 90 days
          </button>
          <button
            onClick={handleCustomClick}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              selectedRange === 'custom'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Custom Range
          </button>
        </div>
      </div>

      {/* Custom Date Picker Modal - MOBILE OPTIMIZED */}
      {showCustomPicker && (
        <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:translate-y-0 sm:mt-2 z-50 bg-white border border-gray-200 rounded-lg p-4 shadow-xl sm:min-w-[400px] max-w-md mx-auto sm:mx-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Custom Date Range</h3>
            <button
              onClick={handleCustomCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                max={customEnd || new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                min={customStart}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>

            <button
              onClick={handleCustomApply}
              disabled={!customStart || !customEnd}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors text-base"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}