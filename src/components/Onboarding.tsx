import { useState } from 'react';
import { PixelPal } from './PixelPal';
import type { useBloom } from '../store/useBloom';

/**
 * First-run screen: greets the user and asks what to call them. Shown by App
 * whenever no name is stored; submitting saves it to settings, which retires
 * this gate. The name is editable later from Settings.
 */
export function Onboarding({ bloom }: { bloom: ReturnType<typeof useBloom> }) {
  const [name, setName] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;

    // PLAN 8.8: a software keyboard can make the browser scroll the outer
    // overflow-hidden phone shell while bringing this form into view. Reset
    // that browser-owned scroll before onboarding unmounts, otherwise the
    // next Focus screen inherits the offset with its heading clipped.
    const form = e.currentTarget as HTMLFormElement;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && form.contains(focused)) focused.blur();
    const phone = form.closest<HTMLElement>('.phone');
    if (phone) {
      phone.scrollTop = 0;
      phone.scrollLeft = 0;
    }

    bloom.actions.patchSettings({ name: n });
  }

  return (
    <main className="screen onboard-bg" id="onboarding-screen" aria-labelledby="onboarding-heading">
      <div className="onboard">
        <div className="onboard-pal">
          <PixelPal sprite="bunny" mode="celebrate" scale={5} size={118} />
        </div>
        <h1 className="onboard-title" id="onboarding-heading">welcome to Bloom</h1>
        <div className="onboard-sub">a cozy little place to focus, one pomodoro at a time. what should we call you?</div>

        <form className="onboard-form" onSubmit={submit}>
          <label className="onboard-label" htmlFor="onboarding-name">Your name</label>
          <input
            id="onboarding-name"
            className="onboard-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
            maxLength={20}
          />
          <button className="onboard-go" type="submit" disabled={!name.trim()}>
            let's bloom&nbsp;&rarr;
          </button>
        </form>
      </div>
    </main>
  );
}
