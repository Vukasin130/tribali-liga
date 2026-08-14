import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: false
    }
  }
});
