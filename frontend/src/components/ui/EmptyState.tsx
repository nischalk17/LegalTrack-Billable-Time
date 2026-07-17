import { LucideIcon } from 'lucide-react';

export default function EmptyState({ icon: Icon, title, message }: { icon: LucideIcon; title: string; message?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Icon size={22} /></div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
    </div>
  );
}
