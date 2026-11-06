/**
 * A zip read from memory, so a caller can take only the members it needs without unpacking the rest
 * to disk. Stored and deflated members only; no Zip64, no encryption (release.ts's zips are neither).
 */

export class ZipError extends Error {
  override name = "ZipError";
}

export interface ZipMember {
  path: string;
  size: number;
  read(): Promise<Uint8Array<ArrayBuffer>>;
}

const END = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** The zip's files by path (forward slashes); folders are left out. */
export function zipMembers(bytes: Uint8Array<ArrayBuffer>): Map<string, ZipMember> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError("Not a zip file.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (count === 0xffff || at === 0xffffffff) throw new ZipError("Zip64 archives are not supported.");

  const names = new TextDecoder();
  const members = new Map<string, ZipMember>();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) throw new ZipError("The zip is damaged.");
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const path = names.decode(bytes.subarray(at + 46, at + 46 + nameLength)).replace(/\\/g, "/");
    at += 46 + nameLength + extraLength + commentLength;
    if (path.endsWith("/")) continue;
    if (flags & 1) throw new ZipError(`${path} is encrypted.`);
    if (method !== 0 && method !== 8) throw new ZipError(`${path} uses an unsupported compression (${method}).`);
    members.set(path, {
      path,
      size,
      async read() {
        if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL) {
          throw new ZipError(`${path} is damaged.`);
        }
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        if (start + packed > bytes.length) throw new ZipError(`${path} is cut short.`);
        const data = bytes.slice(start, start + packed);
        const out = method === 0 ? data : new Uint8Array(
          await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")))
            .arrayBuffer(),
        );
        if (out.length !== size) throw new ZipError(`${path} unpacks to the wrong size.`);
        return out;
      },
    });
  }
  return members;
}
