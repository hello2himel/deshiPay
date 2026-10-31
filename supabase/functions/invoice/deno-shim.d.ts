/**
 * Ambient declarations for the Deno globals this edge function uses.
 *
 * The function is deployed by the Supabase CLI and runs on Deno, but the repo typechecks
 * everything with plain `tsc` (no `@types/deno` dependency). Declaring only the members we
 * actually use keeps that setup honest: if the function starts using a new Deno global, this
 * file has to be updated deliberately.
 *
 * Not needed at runtime — the deployed bundle sees the real Deno namespace.
 */
declare namespace Deno {
  /** Address passed to `onListen` / returned by local servers. */
  interface ServeAddress {
    hostname: string;
    port: number;
  }

  interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
    onListen?: (address: ServeAddress) => void;
    onError?: (error: unknown) => Response | Promise<Response>;
  }

  interface Server {
    shutdown(): Promise<void>;
    finished: Promise<void>;
    ref(): void;
    unref(): void;
    readonly addr: ServeAddress;
  }

  /** Start an HTTP server on Deno / Supabase Edge Runtime. */
  function serve(handler: (request: Request) => Response | Promise<Response>, options?: ServeOptions): Server;

  function serve(
    options: ServeOptions & {
      handler: (request: Request) => Response | Promise<Response>;
    },
  ): Server;

  /** Environment variables. Supabase injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. */
  const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    has(key: string): boolean;
    delete(key: string): void;
    toObject(): Record<string, string>;
  };
}
