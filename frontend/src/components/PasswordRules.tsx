import { Check, X } from 'lucide-react';

export const PASSWORD_RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 && pw.length <= 72 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function isPasswordValid(pw: string): boolean {
  return PASSWORD_RULES.every(r => r.test(pw));
}

export default function PasswordRules({ password }: { password: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
      {PASSWORD_RULES.map(({ label, test }) => {
        const met = test(password);
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: met ? 'var(--green)' : 'var(--text3)' }}>
            {met ? <Check size={12} /> : <X size={12} />}
            {label}
          </div>
        );
      })}
    </div>
  );
}
