import { PASSWORD_RULES } from './PasswordRules';

function getStrength(pw: string): { level: number; label: string; color: string } {
  if (!pw) return { level: 0, label: '', color: 'var(--border2)' };

  const rulesMet = PASSWORD_RULES.filter(r => r.test(pw)).length;
  const lengthBonus = pw.length >= 12 ? 1 : 0;
  const score = rulesMet + lengthBonus;

  if (rulesMet < PASSWORD_RULES.length) {
    return { level: 1, label: 'Weak', color: 'var(--red)' };
  }
  if (score >= 5) {
    return { level: 3, label: 'Very strong', color: 'var(--green)' };
  }
  return { level: 2, label: 'Strong', color: 'var(--yellow)' };
}

export default function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { level, label, color } = getStrength(password);

  return (
    <div className="strength-meter">
      <div className="strength-bars">
        {[1, 2, 3].map(bar => (
          <div
            key={bar}
            className="strength-bar"
            style={{ backgroundColor: bar <= level ? color : undefined }}
          />
        ))}
      </div>
      {label && <div className="strength-label" style={{ color }}>{label}</div>}
    </div>
  );
}
