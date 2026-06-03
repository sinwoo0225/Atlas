import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  value: string;
  title?: string;
  className?: string;
}

// 이메일·연락처 등 짧은 값을 클립보드로 복사하는 인라인 버튼.
// navigator.clipboard 실패(비보안 컨텍스트 등) 시 execCommand 폴백.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 폴백으로 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ value, title, className = '' }: Props) {
  const { t } = useTranslation();
  const label = title ?? t('common:copy');
  const [copied, setCopied] = useState(false);
  const disabled = !value.trim();

  const handleCopy = async () => {
    if (disabled) return;
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      toast.success(t('common:copied'));
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error(t('common:copyFailed'));
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      title={disabled ? undefined : label}
      aria-label={label}
      className={`shrink-0 p-2 rounded-md border border-default text-muted transition-colors hover:text-primary hover:border-strong disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  );
}
