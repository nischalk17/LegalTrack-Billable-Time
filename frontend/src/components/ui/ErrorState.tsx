import { AlertCircle, RefreshCw } from 'lucide-react';

export default function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-state">
      <AlertCircle size={16} />
      <span>{message}</span>
      {retry && (
        <button onClick={retry} className="error-state-retry">
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
}
