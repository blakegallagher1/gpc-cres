export function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function isClosedControllerError(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes("Controller is already closed");
}

export function createSseWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
) {
  let closed = false;

  return {
    enqueue(data: Record<string, unknown>): boolean {
      if (closed) {
        return false;
      }

      try {
        controller.enqueue(encoder.encode(sseEvent(data)));
        return true;
      } catch (error) {
        if (isClosedControllerError(error)) {
          closed = true;
          return false;
        }
        throw error;
      }
    },
    close() {
      if (closed) {
        return;
      }

      try {
        controller.close();
      } catch (error) {
        if (!isClosedControllerError(error)) {
          throw error;
        }
      } finally {
        closed = true;
      }
    },
    markClosed() {
      closed = true;
    },
    isClosed() {
      return closed;
    },
  };
}
