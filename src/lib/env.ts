/** Strip all non-printable / non-ASCII characters from env vars */
export function cleanEnv(key: string): string {
  return (process.env[key] || "").replace(/[^\x20-\x7E]/g, "");
}
