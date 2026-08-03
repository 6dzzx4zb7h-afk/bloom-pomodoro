import { useEffect, useRef, useState } from 'react';
import {
  configureNativeIOSAuxiliaryControl,
  hideNativeIOSAuxiliaryControl,
  isNativeControlSlotVisible,
  isNativeIOSTabsPlatform,
  listenForNativeIOSAuxiliaryControlActivation,
  observeNativeControlFrame,
  type NativeControlFrame,
} from '../native/iosTabs';

interface SystemSwitchProps {
  nativeId: string;
  checked: boolean;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * PLAN 13.4a — an accessible web switch everywhere, with its measured slot
 * handed to a real UISwitch inside the iOS wrapper. React still owns the value
 * and reducer mutation; UIKit owns native touch and VoiceOver semantics.
 */
export function SystemSwitch({
  nativeId,
  checked,
  label,
  ariaLabel = label,
  disabled = false,
  onChange,
}: SystemSwitchProps) {
  const slotRef = useRef<HTMLButtonElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [frame, setFrame] = useState<NativeControlFrame | null>(null);
  const [nativeReady, setNativeReady] = useState(false);
  const nativeIOS = isNativeIOSTabsPlatform();

  useEffect(() => {
    if (!nativeIOS || !slotRef.current) return;
    return observeNativeControlFrame(slotRef.current, setFrame);
  }, [nativeIOS, nativeId]);

  useEffect(() => {
    if (!nativeIOS) return;
    let disposed = false;
    let handle: { remove: () => Promise<void> } | undefined;
    void listenForNativeIOSAuxiliaryControlActivation((event) => {
      if (
        event.id === nativeId &&
        typeof event.value === 'boolean' &&
        !disabled
      ) {
        onChangeRef.current(event.value);
      }
    }).then((nextHandle) => {
      if (disposed) void nextHandle.remove();
      else handle = nextHandle;
    });

    return () => {
      disposed = true;
      void handle?.remove();
      void hideNativeIOSAuxiliaryControl(nativeId);
    };
  }, [disabled, nativeIOS, nativeId]);

  useEffect(() => {
    const element = slotRef.current;
    if (!nativeIOS || !frame || !element) return;
    let cancelled = false;
    void configureNativeIOSAuxiliaryControl({
      id: nativeId,
      kind: 'switch',
      label,
      enabled: !disabled,
      visible: isNativeControlSlotVisible(element, frame),
      checked,
      frame,
    })
      .then(({ active }) => {
        if (!cancelled) setNativeReady(active);
      })
      .catch(() => {
        void hideNativeIOSAuxiliaryControl(nativeId);
        if (!cancelled) setNativeReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checked, disabled, frame, label, nativeIOS, nativeId]);

  return (
    <button
      ref={slotRef}
      type="button"
      className={`switch${checked ? ' on' : ''}${
        nativeReady ? ' native-control-slot-ready' : ''
      }`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-hidden={nativeReady || undefined}
      tabIndex={nativeReady ? -1 : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}
