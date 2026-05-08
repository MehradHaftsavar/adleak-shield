'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
  onRangeChange: (start: string, end: string) => void;
}

export function DateRangePicker({ onRangeChange }: DateRangePickerProps) {
  const [selectedRange, setSelectedRange] = useState<'7d' | '30d' | '90d'>('7d');

  const handlePresetChange = (range: '7d' | '30d' | '90d') => {
    setSelectedRange(range);
    
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

  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-gray-500" />
      <div className="flex gap-2">
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
      </div>
    </div>
  );
}