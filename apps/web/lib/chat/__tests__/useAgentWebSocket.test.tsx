import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentWebSocket } from '../useAgentWebSocket';

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  static readonly CONNECTING = 0;

  static readonly OPEN = 1;

  static readonly CLOSING = 2;

  static readonly CLOSED = 3;

  readonly sent: string[] = [];

  readyState = MockWebSocket.CONNECTING;

  onopen: ((event: Event) => void) | null = null;

  onmessage: ((event: MessageEvent) => void) | null = null;

  onerror: ((event: Event) => void) | null = null;

  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitClose(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason } as CloseEvent);
  }

  emitError() {
    this.onerror?.(new Event('error'));
  }

  close(code = 1000, reason = '') {
    this.emitClose(code, reason);
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

describe('useAgentWebSocket', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.reset();
    vi.useFakeTimers();
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it('reconnects after an abnormal close', async () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useAgentWebSocket({
        token: 'token-1',
        conversationId: 'conv-1',
        onEvent,
        enabled: true,
      }),
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(result.current.status).toBe('connecting');

    await act(async () => {
      MockWebSocket.instances[0].open();
    });
    expect(result.current.status).toBe('connected');

    await act(async () => {
      MockWebSocket.instances[0].emitClose(1011, 'upstream crashed');
    });
    expect(result.current.status).toBe('error');

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(result.current.status).toBe('connecting');

    await act(async () => {
      MockWebSocket.instances[1].open();
    });
    expect(result.current.status).toBe('connected');
    expect(onEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Authentication failed. Please refresh the page.' }),
    );
  });

  it('does not reconnect after authentication rejection', async () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useAgentWebSocket({
        token: 'token-1',
        conversationId: 'conv-1',
        onEvent,
        enabled: true,
      }),
    );

    await act(async () => {
      MockWebSocket.instances[0].emitClose(4001, 'unauthorized');
      vi.advanceTimersByTime(2500);
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(result.current.status).toBe('disconnected');
    expect(onEvent).toHaveBeenCalledWith({
      type: 'error',
      message: 'Authentication failed. Please refresh the page.',
    });
  });

  it('does not reconnect after an intentional disconnect', async () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useAgentWebSocket({
        token: 'token-1',
        conversationId: 'conv-1',
        onEvent,
        enabled: true,
      }),
    );

    await act(async () => {
      result.current.disconnect();
      vi.advanceTimersByTime(2500);
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(result.current.status).toBe('disconnected');
    expect(onEvent).not.toHaveBeenCalled();
  });
});
