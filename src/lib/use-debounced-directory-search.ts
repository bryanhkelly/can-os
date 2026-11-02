import { useEffect, useState } from "react";
import { normalizeClientError } from "@/lib/client-error";

export function useDebouncedDirectorySearch<Row>(
  query: string,
  search: (query?: string) => Promise<Row[]>,
  errorMessage: string,
) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const handle = setTimeout(async () => {
      try {
        const result = await search(query.trim() || undefined);
        if (active) setRows(result);
      } catch (cause) {
        if (active) {
          setRows([]);
          setError(normalizeClientError(cause, errorMessage).message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, search, errorMessage, attempt]);

  return { rows, loading, error, retry: () => setAttempt(value => value + 1) };
}
