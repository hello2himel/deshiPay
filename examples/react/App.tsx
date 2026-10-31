/**
 * Typed React wrapper for the `<deshiqr-pay>` web component.
 *
 * This file is an example, not a published package: copy it into your app (or turn it into
 * one). It shows how to:
 *
 *   1. declare the custom element for JSX (`<deshiqr-pay …>`),
 *   2. pass attributes down and use the element's imperative API through a ref,
 *   3. subscribe to the `deshiqr-ready` / `deshiqr-change` / `deshiqr-error` events.
 *
 * The component itself ships zero dependencies; this wrapper only depends on `react`.
 * Run `pnpm build:libs` and load `deshiqr-element` (or its global bundle) before rendering.
 *
 * Demo payload below is synthetic — see docs/demo-payloads.md. Never commit a real payload.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DeshiQrReadyDetail {
  payload: string;
  amount: number | null;
  reference: string | null;
}

export interface DeshiQrChangeDetail {
  amount: number | null;
  payload: string;
  reference: string | null;
}

export interface DeshiQrErrorDetail {
  code: string;
  message: string;
}

export interface DeshiQrPayHandle {
  /** Re-derive the payload/QR from the current attributes. */
  refresh(): void;
  /** Programmatically set (or clear) the amount. */
  setAmount(amount: number | null): void;
  /** The current dynamic/static payload. */
  getPayload(): string;
  /** The current QR as a standalone SVG string. */
  getSvg(): string;
  /** Download the current QR as a PNG. */
  downloadPng(filename?: string): Promise<void>;
  /** Escape hatch: the underlying DOM element. */
  readonly element: HTMLElement | null;
}

export interface DeshiQrPayProps {
  /** Static base payload from the merchant's QR (required unless `configUrl` is used). */
  payload?: string;
  /** Optional JSON config URL: `{ base_payload, title, note, presets, ref_prefix, ref_len }`. */
  configUrl?: string;
  amount?: number | string;
  lockAmount?: boolean;
  reference?: string;
  refPrefix?: string;
  refLength?: number;
  title?: string;
  note?: string;
  /** Comma-separated amount presets, e.g. `"100,500,1000"`. */
  presets?: string;
  theme?: "auto" | "light" | "dark";
  size?: number;
  bare?: boolean;
  className?: string;
  style?: CSSProperties;
  onReady?: (detail: DeshiQrReadyDetail) => void;
  onChange?: (detail: DeshiQrChangeDetail) => void;
  onError?: (detail: DeshiQrErrorDetail) => void;
}

// ---------------------------------------------------------------------------
// JSX typing for the custom element
// ---------------------------------------------------------------------------

/** Attributes accepted on `<deshiqr-pay>`. React serialises unknown lowercase props as attributes. */
export interface DeshiQrPayIntrinsicProps {
  payload?: string;
  "config-url"?: string;
  amount?: number | string;
  "lock-amount"?: boolean | "";
  reference?: string;
  "ref-prefix"?: string;
  "ref-length"?: number | string;
  title?: string;
  note?: string;
  presets?: string;
  theme?: "auto" | "light" | "dark";
  size?: number | string;
  bare?: boolean | "";
  class?: string;
  className?: string;
  style?: CSSProperties;
  children?: never;
}

// React 19 ships JSX inside the React namespace; older React versions use the global one.
// Declaring both keeps this example compiling on either.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "deshiqr-pay": DeshiQrPayIntrinsicProps;
    }
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "deshiqr-pay": DeshiQrPayIntrinsicProps;
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Canonical synthetic static payload from docs/demo-payloads.md (demo only). */
export const DEMO_STATIC_PAYLOAD =
  "00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D";

type DeshiQrElement = HTMLElement & {
  refresh(): void;
  setAmount(amount: number | null): void;
  getPayload(): string;
  getSvg(): string;
  downloadPng(filename?: string): Promise<void>;
};

export const DeshiQrPay = forwardRef<DeshiQrPayHandle, DeshiQrPayProps>(function DeshiQrPay(props, ref) {
  const elementRef = useRef<DeshiQrElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      refresh: () => elementRef.current?.refresh(),
      setAmount: (amount) => elementRef.current?.setAmount(amount),
      getPayload: () => elementRef.current?.getPayload() ?? "",
      getSvg: () => elementRef.current?.getSvg() ?? "",
      downloadPng: (filename) => elementRef.current?.downloadPng(filename) ?? Promise.resolve(),
      get element() {
        return elementRef.current;
      },
    }),
    [],
  );

  // The component dispatches bubbling, composed CustomEvents. React does not wire unknown
  // `on*` props to custom-element events, so subscribe explicitly.
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    const handleReady = (event: Event) => {
      props.onReady?.((event as CustomEvent<DeshiQrReadyDetail>).detail);
    };
    const handleChange = (event: Event) => {
      props.onChange?.((event as CustomEvent<DeshiQrChangeDetail>).detail);
    };
    const handleError = (event: Event) => {
      props.onError?.((event as CustomEvent<DeshiQrErrorDetail>).detail);
    };

    element.addEventListener("deshiqr-ready", handleReady);
    element.addEventListener("deshiqr-change", handleChange);
    element.addEventListener("deshiqr-error", handleError);
    return () => {
      element.removeEventListener("deshiqr-ready", handleReady);
      element.removeEventListener("deshiqr-change", handleChange);
      element.removeEventListener("deshiqr-error", handleError);
    };
  }, [props.onReady, props.onChange, props.onError]);

  return (
    <deshiqr-pay
      ref={elementRef as unknown as Ref<HTMLElement>}
      payload={props.payload}
      config-url={props.configUrl}
      amount={props.amount}
      lock-amount={props.lockAmount ? "" : undefined}
      reference={props.reference}
      ref-prefix={props.refPrefix}
      ref-length={props.refLength}
      title={props.title}
      note={props.note}
      presets={props.presets}
      theme={props.theme}
      size={props.size}
      bare={props.bare ? "" : undefined}
      className={props.className}
      style={props.style}
    />
  );
});

// ---------------------------------------------------------------------------
// Demo app
// ---------------------------------------------------------------------------

export default function App() {
  const payRef = useRef<DeshiQrPayHandle>(null);
  const [payload, setPayload] = useState(DEMO_STATIC_PAYLOAD);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>deshiQR — React example</h1>
      <p>
        Synthetic demo payload only. Never commit a real merchant payload — see{" "}
        <code>docs/demo-payloads.md</code>.
      </p>

      <DeshiQrPay
        ref={payRef}
        payload={payload}
        title="DEMO STORE"
        note="Synthetic demo shop — payments are fake."
        presets="100,500,1000"
        refPrefix="DEMO"
        refLength={25}
        onReady={(detail) => console.log("ready", detail)}
        onChange={(detail) => {
          setPayload(detail.payload);
          console.log("change", detail);
        }}
        onError={(detail) => console.error("deshiqr-error", detail)}
      />

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button type="button" onClick={() => payRef.current?.setAmount(500)}>
          Set ৳500
        </button>
        <button type="button" onClick={() => payRef.current?.refresh()}>
          Refresh
        </button>
        <button
          type="button"
          onClick={() => {
            const svg = payRef.current?.getSvg();
            if (svg) console.log(svg);
          }}
        >
          Log SVG
        </button>
      </div>
      <pre style={{ marginTop: 16, overflowX: "auto" }}>{payload}</pre>
    </main>
  );
}
