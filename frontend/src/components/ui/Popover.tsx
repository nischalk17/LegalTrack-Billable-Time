'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Anchors a floating panel under a trigger element. Closes on outside click
 * or Escape. `trigger` receives an `open` toggle to attach to its own button.
 */
export default function Popover({
  trigger, children, align = 'left', open: controlledOpen, onOpenChange,
}: {
  trigger: (props: { onClick: () => void; open: boolean }) => React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  /** Omit for uncontrolled (internal) open state; pass both for controlled mode. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { onOpenChange?.(v); if (!isControlled) setInternalOpen(v); };
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {trigger({ onClick: () => setOpen(!open), open })}
      {open && (
        <div className="popover" style={{ top: '100%', marginTop: 4, ...(align === 'right' ? { right: 0 } : { left: 0 }) }}>
          {children}
        </div>
      )}
    </div>
  );
}
