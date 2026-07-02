import { useState } from 'react';
import { PixelPal } from './PixelPal';
import { StatusBar } from './StatusBar';
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
    if (n) bloom.actions.patchSettings({ name: n });
  }

  return (
    <div className="screen onboard-bg">
      <div className="island" />
      <StatusBar />

      <div className="onboard">
        <div className="onboard-pal">
          <PixelPal sprite="bunny" mode="celebrate" scale={5} size={118} />
        </div>
        <div className="onboard-title">welcome to Bloom</div>
        <div className="onboard-sub">a cozy little place to focus, one pomodoro at a time. what should we call you?</div>

        <form className="onboard-form" onSubmit={submit}>
          <input
            autoFocus
            className="onboard-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
            maxLength={20}
            aria-label="Your name"
          />
          <button className="onboard-go" type="submit" disabled={!name.trim()}>
            let's bloom&nbsp;&rarr;
          </button>
        </form>
      </div>
    </div>
  );
}
