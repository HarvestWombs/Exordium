/**
 * Whether a mod's realm can be reached: a TCP connection to its gateway, closed as soon as it opens.
 * Nothing is sent, so this says the server is listening, not that it is a realm or that it would log
 * the player in. 6112 is Battle.net's own port, which a realm's gateway listens on by default.
 */

export const REALM_PORT = 6112;

const TIMEOUT_MS = 5000;

export interface RealmCheck {
  address: string;
  reachable: boolean;
  /** How long the connection took to open; null when it did not. */
  milliseconds: number | null;
  error: string | null;
  checkedAt: string;
}

/** A gateway as written (`host`, or `host:port`, which wins) and its port field, as a place to connect. */
export function realmAddress(gateway: string, port: string | null): { hostname: string; port: number } | null {
  const written = /^([^:\s]+):(\d+)$/.exec(gateway.trim());
  const hostname = written?.[1] ?? gateway.trim();
  const number = Number(written?.[2] ?? (port?.trim() || REALM_PORT));
  if (!hostname || /\s/.test(hostname) || !Number.isInteger(number) || number < 1 || number > 65535) return null;
  return { hostname, port: number };
}

export async function checkRealm(
  place: { hostname: string; port: number },
  timeoutMs = TIMEOUT_MS,
): Promise<RealmCheck> {
  const address = `${place.hostname}:${place.port}`;
  const started = performance.now();
  const opening = Deno.connect({ ...place, transport: "tcp" });
  let timer: number | undefined;
  try {
    const connection = await Promise.race([
      opening,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`No answer in ${timeoutMs / 1000} seconds.`)), timeoutMs);
      }),
    ]);
    connection.close();
    return {
      address,
      reachable: true,
      milliseconds: Math.round(performance.now() - started),
      error: null,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    // A connection that opens after the timeout still has to be closed.
    opening.then((connection) => connection.close()).catch(() => {});
    return {
      address,
      reachable: false,
      milliseconds: null,
      error: (error as Error).message,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}
