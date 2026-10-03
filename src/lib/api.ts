import { ZodError } from "zod";
import { getEnv } from "@/lib/env";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== getEnv().APP_ORIGIN) {
    throw new ApiError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
  }
}

export async function parseJson<T>(request: Request, schema: { parse(value: unknown): T }) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body must be valid JSON.");
  }
  return schema.parse(body);
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request failed validation.",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }
  console.error("Unhandled API error", error);
  return json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}

export function withApiErrors<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>,
) {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}
