import axios, { isAxiosError } from 'axios';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
});

/** Shape returned by the backend's centralized error handler. */
interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
}

export const isNotFoundError = (error: unknown): boolean =>
  isAxiosError(error) && error.response?.status === 404;

/** Turns any thrown value into a message that can be shown to the user. */
export function getErrorMessage(error: unknown): string {
  if (isAxiosError<ApiErrorBody>(error)) {
    if (error.response?.data?.message) return error.response.data.message;
    if (!error.response) return `Cannot reach the API at ${API_BASE_URL}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}
