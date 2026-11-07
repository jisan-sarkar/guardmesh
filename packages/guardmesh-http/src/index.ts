import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { getOrCreateCorrelationId } from "@guardmesh/observability";

type HttpResponse = Readonly<{
  status: (code: number) => HttpResponse;
  send: (body: unknown) => void;
}>;

type HttpRequest = Readonly<{
  headers?: Readonly<Record<string, string | string[] | undefined>>;
}>;

function errorCode(status: number): string {
  if (status === 400) return "INPUT_INVALID";
  if (status === 401) return "AUTHENTICATION_REQUIRED";
  if (status === 403) return "ACCESS_DENIED";
  if (status === 404) return "RESOURCE_NOT_FOUND";
  if (status === 409) return "IDEMPOTENCY_KEY_REUSED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "DEPENDENCY_UNAVAILABLE";
  return "INTERNAL_ERROR";
}

function safeMessage(status: number, exception: unknown): string {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === "string") return response;
    if (typeof response === "object" && response !== null && "message" in response) {
      const message = (response as { message?: unknown }).message;
      if (typeof message === "string") return message;
      if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
        return message.join(", ");
      }
    }
  }
  return status >= 500 ? "internal server error" : "request could not be completed";
}

@Catch()
export class GuardMeshExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<HttpRequest>();
    const response = context.getResponse<HttpResponse>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const header = request.headers?.["x-request-id"];
    const requestId = getOrCreateCorrelationId(typeof header === "string" ? header : undefined);
    response.status(status).send({
      error: {
        code: errorCode(status),
        message: safeMessage(status, exception),
        request_id: requestId,
      },
    });
  }
}
