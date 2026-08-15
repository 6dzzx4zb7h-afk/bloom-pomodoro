interface SystemSwitchProps {
  nativeId: string;
  checked: boolean;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * PLAN 13.4a introduced this wrapper so iOS could hand each boolean to a real
 * `UISwitch`. PLAN 13.14 took that back out: every switch here lives in a DOM
 * scroll container (the Settings sheet, the foundations dialog), and a native
 * view positioned from JavaScript-measured rects cannot follow WKWebView
 * scrolling — the scroll composites off the main thread while the new frame
 * arrives a frame or more later, so each switch visibly drifted out of its row.
 * One accessible web switch now ships on every platform. `nativeId` is kept as
 * the stable control identity for 13.4b, which puts these back in UIKit hands
 * by presenting Settings as a native sheet rather than overlaying a web page.
 */
export function SystemSwitch({
  checked,
  label,
  ariaLabel = label,
  disabled = false,
  onChange,
}: SystemSwitchProps) {
  return (
    <button
      type="button"
      className={`switch${checked ? ' on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}
