import type { ReactNode } from 'react';
import { ModalFrame } from './Dialog';

interface SheetProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onRequestClose: () => void;
  closeLabel?: string;
  className?: string;
}

export function Sheet({
  title,
  description,
  children,
  onRequestClose,
  closeLabel = 'Close settings',
  className,
}: SheetProps) {
  return (
    <ModalFrame
      kind="sheet"
      title={title}
      description={description}
      onRequestClose={onRequestClose}
      closeLabel={closeLabel}
      closeOnEscape
      closeOnBackdrop
      className={className}
    >
      {children}
    </ModalFrame>
  );
}
