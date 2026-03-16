/**
 * Format NPR amounts: 15000 -> "Rs. 15,000", 1500000 -> "Rs. 15L"
 */
export function formatNPR(amount: number): string {
  if (amount >= 10000000) {
    return `Rs. ${(amount / 10000000).toFixed(1)}Cr`;
  }
  if (amount >= 100000) {
    return `Rs. ${(amount / 100000).toFixed(1)}L`;
  }
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
    maximumFractionDigits: 0,
  }).format(amount).replace('NPR', 'Rs.');
}

/**
 * Format minutes to "2h 30m"
 */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Format hour number to "9am", "2pm"
 */
export function formatHour(hour: number): string {
  const h = hour % 24;
  const ampm = h >= 12 ? 'pm' : 'am';
  const displayHour = h % 12 || 12;
  return `${displayHour}${ampm}`;
}

/**
 * Category key to human label
 */
export function categoryLabel(key: string): string {
  const mapping: Record<string, string> = {
    legal_research: 'Legal Research',
    drafting: 'Drafting',
    document_review: 'Document Review',
    client_communication: 'Client Communication',
    client_meeting: 'Client Meeting',
    court_filing: 'Court Filing',
    general_work: 'General Work',
    research: 'Research',
  };
  return mapping[key] || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Fill missing dates in trend data with 0 values
 */
export function fillDateGaps(
  data: { date: string; amount_npr: number; hours: number }[],
  days: number
): { date: string; amount_npr: number; hours: number }[] {
  const result = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    
    const existing = data.find(item => item.date === dateStr);
    if (existing) {
      result.push(existing);
    } else {
      result.push({ date: dateStr, amount_npr: 0, hours: 0 });
    }
  }
  
  return result;
}
