/**
 * Shadow DOM styles for `<deshiqr-pay>`.
 *
 * Theming is entirely through CSS custom properties so hosts can restyle the
 * panel without piercing the shadow root. Dark mode follows
 * `prefers-color-scheme` unless `theme="light"|"dark"` is set explicitly.
 */
export const styles = /* css */ `
:host {
  --dq-accent: #7c3aed;
  --dq-accent-2: #db2777;
  --dq-accent-soft: #f3edff;
  --dq-surface: #ffffff;
  --dq-surface-2: #f8f6ff;
  --dq-text: #17131f;
  --dq-muted: #6b6478;
  --dq-border: #e8e2f4;
  --dq-danger: #b3261e;
  --dq-danger-soft: #fdeceb;
  --dq-ok: #0f7b52;
  --dq-radius: 20px;
  --dq-font: "Figtree", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, "Noto Sans Bengali", sans-serif;
  --dq-qr-size: 280px;
  display: block;
  container-type: inline-size;
  color: var(--dq-text);
  font-family: var(--dq-font);
  font-size: 16px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  color-scheme: light;
}

:host([theme="dark"]) {
  --dq-accent: #a78bfa;
  --dq-accent-2: #f472b6;
  --dq-accent-soft: #2a2140;
  --dq-surface: #17131f;
  --dq-surface-2: #211b30;
  --dq-text: #f7f3ff;
  --dq-muted: #b5acc7;
  --dq-border: #352c49;
  --dq-danger: #ffb4ab;
  --dq-danger-soft: #3b1d1b;
  --dq-ok: #6ee7b7;
  color-scheme: dark;
}

@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"])) {
    --dq-accent: #a78bfa;
    --dq-accent-2: #f472b6;
    --dq-accent-soft: #2a2140;
    --dq-surface: #17131f;
    --dq-surface-2: #211b30;
    --dq-text: #f7f3ff;
    --dq-muted: #b5acc7;
    --dq-border: #352c49;
    --dq-danger: #ffb4ab;
    --dq-danger-soft: #3b1d1b;
    --dq-ok: #6ee7b7;
    color-scheme: dark;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

[hidden] {
  display: none !important;
}

:host(:focus-visible),
button:focus-visible,
input:focus-visible {
  outline: 3px solid var(--dq-accent);
  outline-offset: 2px;
}

.card {
  position: relative;
  overflow: hidden;
  background: var(--dq-surface);
  border: 1px solid var(--dq-border);
  border-radius: var(--dq-radius);
  box-shadow:
    0 1px 2px rgb(23 19 31 / 0.05),
    0 24px 48px -32px rgb(23 19 31 / 0.35);
}

.card.bare {
  overflow: visible;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

/* ---------------------------------------------------------------- states */

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 36px 24px;
  color: var(--dq-muted);
  text-align: center;
}

.state-text {
  margin: 0;
  max-width: 34ch;
  font-size: 0.9375rem;
}

.state-retry {
  appearance: none;
  border: 1px solid var(--dq-border);
  background: var(--dq-surface-2);
  color: var(--dq-text);
  border-radius: 999px;
  padding: 8px 16px;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.state-retry:hover {
  border-color: var(--dq-accent);
  color: var(--dq-accent);
}

.spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid var(--dq-border);
  border-top-color: var(--dq-accent);
  animation: dq-spin 700ms linear infinite;
}

@keyframes dq-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------------------------------------------------------------- header */

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 0;
}

.identity {
  min-width: 0;
}

.title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}

.note {
  margin: 4px 0 0;
  color: var(--dq-muted);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--dq-accent-soft);
  color: var(--dq-accent);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.badge::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--dq-accent), var(--dq-accent-2));
}

/* ------------------------------------------------------------------ body */

.body {
  display: grid;
  grid-template-columns: var(--dq-qr-size) minmax(180px, 1fr);
  gap: 22px;
  align-items: center;
  padding: 18px 22px 22px;
}

.qr-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.qr {
  width: var(--dq-qr-size);
  max-width: 100%;
  aspect-ratio: 1 / 1;
  display: grid;
  place-items: center;
  padding: 12px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid var(--dq-border);
  box-shadow: inset 0 0 0 1px rgb(23 19 31 / 0.02);
}

.qr svg {
  display: block;
  width: 100%;
  height: auto;
}

.qr-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #8b8598;
  font-size: 0.8125rem;
  text-align: center;
}

.qr-caption {
  margin: 0;
  color: var(--dq-muted);
  font-size: 0.75rem;
  text-align: center;
}

.pay-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--dq-muted);
  letter-spacing: 0.01em;
}

.amount-field {
  position: relative;
  display: flex;
  align-items: center;
}

.taka {
  position: absolute;
  left: 14px;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--dq-muted);
  pointer-events: none;
}

.amount-input {
  width: 100%;
  padding: 12px 14px 12px 40px;
  border: 1.5px solid var(--dq-border);
  border-radius: 14px;
  background: var(--dq-surface-2);
  color: var(--dq-text);
  font: inherit;
  font-size: 1.625rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.amount-input::placeholder {
  color: var(--dq-muted);
  opacity: 0.55;
  font-weight: 500;
}

.amount-input:hover:not([readonly]) {
  border-color: color-mix(in srgb, var(--dq-accent) 45%, var(--dq-border));
}

.amount-input:focus {
  border-color: var(--dq-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--dq-accent) 16%, transparent);
  outline: none;
}

.amount-input[readonly] {
  cursor: default;
  background: transparent;
  border-style: dashed;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset {
  appearance: none;
  cursor: pointer;
  border: 1px solid var(--dq-border);
  background: var(--dq-surface);
  color: var(--dq-text);
  border-radius: 999px;
  padding: 7px 13px;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease,
    transform 140ms ease;
}

.preset:hover {
  border-color: var(--dq-accent);
  color: var(--dq-accent);
  transform: translateY(-1px);
}

.preset[aria-pressed="true"] {
  border-color: transparent;
  background: linear-gradient(135deg, var(--dq-accent), var(--dq-accent-2));
  color: #ffffff;
}

.ref {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin: 2px 0 0;
  color: var(--dq-muted);
  font-size: 0.75rem;
}

.ref code {
  padding: 2px 7px;
  border-radius: 7px;
  background: var(--dq-surface-2);
  border: 1px dashed var(--dq-border);
  color: var(--dq-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.75rem;
  overflow-wrap: anywhere;
}

.save {
  appearance: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 2px;
  padding: 12px 18px;
  border: 0;
  border-radius: 13px;
  background: linear-gradient(135deg, var(--dq-accent), var(--dq-accent-2));
  color: #ffffff;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 10px 20px -12px color-mix(in srgb, var(--dq-accent) 70%, transparent);
  transition: transform 140ms ease, filter 140ms ease, opacity 140ms ease;
}

.save:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.06);
}

.save:active:not(:disabled) {
  transform: translateY(0);
}

.save:disabled {
  cursor: progress;
  opacity: 0.65;
}

.save svg {
  width: 16px;
  height: 16px;
  flex: none;
}

.help {
  margin: 0;
  color: var(--dq-muted);
  font-size: 0.75rem;
}

.error {
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--dq-danger-soft);
  color: var(--dq-danger);
  font-size: 0.8125rem;
  font-weight: 500;
}

/* ---------------------------------------------------------------- footer */

.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 12px 22px;
  border-top: 1px dashed var(--dq-border);
  color: var(--dq-muted);
  font-size: 0.6875rem;
  letter-spacing: 0.01em;
}

.foot-main {
  font-weight: 600;
}

/* ------------------------------------------------------------ responsive */

@media (max-width: 560px) {
  .body {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    padding: 16px 16px 18px;
  }

  .head {
    padding: 16px 16px 0;
  }

  .qr {
    width: 100%;
    max-width: var(--dq-qr-size);
    margin-inline: auto;
  }

  .foot {
    padding: 10px 16px;
    justify-content: flex-start;
  }
}

/* Hosts narrower than the QR + form (e.g. a narrow sidebar) stack instead of
   overflowing. Container queries keep the component independent of viewport. */
@container (max-width: 560px) {
  .body {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    padding: 16px 16px 18px;
  }

  .head {
    padding: 16px 16px 0;
  }

  .qr {
    width: 100%;
    max-width: var(--dq-qr-size);
    margin-inline: auto;
  }

  .foot {
    padding: 10px 16px;
    justify-content: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}

@media print {
  .card {
    border: 0;
    box-shadow: none;
  }

  .presets,
  .save,
  .help,
  .amount-field {
    display: none !important;
  }
}
`;
