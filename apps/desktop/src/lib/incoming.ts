/**
 * Something on its way into the library, an import or a download. Its sidebar row, its card and its
 * page all read this, so both look and behave the same.
 */
export interface Incoming {
  kind: "import" | "download";
  key: string;
  title: string;
  subtitle: string;
  /** What it is doing, with its percentage when there is one. */
  status: string;
  /** Null while it can't be measured: a queued copy, or unpacking an unknown size. */
  percent: number | null;
  /** How far along, in bytes. */
  detail: string | null;
  /** False once it is being cancelled, and for the stages that can't be stopped. */
  cancellable: boolean;
  cancel: () => Promise<void>;
}
