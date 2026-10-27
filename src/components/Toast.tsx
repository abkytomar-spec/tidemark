export function Toast({ message }: { message: string | null }) {
  return message ? <output className="toast" aria-live="polite">{message}</output> : null;
}
