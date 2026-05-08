export interface NegativeKeyword {
  keyword: string;
  matchType: string;
}

export function generateNegativeKeywordCSV(keywords: NegativeKeyword[]): string {
  // CSV header
  const header = 'Keyword,Match Type';
  
  // CSV rows
  const rows = keywords.map(k => {
    // Capitalize match type for Google Ads Editor
    const matchType = k.matchType.charAt(0).toUpperCase() + k.matchType.slice(1).toLowerCase();
    
    // Escape keyword if it contains commas
    const keyword = k.keyword.includes(',') ? `"${k.keyword}"` : k.keyword;
    
    return `${keyword},${matchType}`;
  });

  return [header, ...rows].join('\n');
}

export function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}