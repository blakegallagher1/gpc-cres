import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageList } from './MessageList';
import type { ChatMessage } from '@/lib/chat/types';

vi.mock('./MessageBubble', () => ({
  MessageBubble: ({ message }: { message: ChatMessage }) => <div>{message.content}</div>,
}));

const scrollIntoViewMock = vi.fn();

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: scrollIntoViewMock,
});

const baseMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'assistant',
    content: 'First message',
    createdAt: '2026-03-25T10:00:00.000Z',
  },
];

function getViewportElement(): HTMLDivElement {
  const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
  if (!(viewport instanceof HTMLDivElement)) {
    throw new Error('Expected scroll area viewport');
  }
  return viewport;
}

function setViewportMetrics({
  scrollTop,
  scrollHeight = 1000,
  clientHeight = 500,
}: {
  scrollTop: number;
  scrollHeight?: number;
  clientHeight?: number;
}) {
  const viewport = getViewportElement();
  Object.defineProperties(viewport, {
    scrollTop: { configurable: true, value: scrollTop, writable: true },
    scrollHeight: { configurable: true, value: scrollHeight },
    clientHeight: { configurable: true, value: clientHeight },
  });
}

describe('MessageList autoscroll behavior', () => {
  it('autoscrolls when user is at the bottom and new messages arrive', () => {
    const { rerender } = render(<MessageList messages={baseMessages} isStreaming={false} />);

    setViewportMetrics({ scrollTop: 500 });
    fireEvent.scroll(getViewportElement());
    scrollIntoViewMock.mockClear();

    rerender(
      <MessageList
        messages={[
          ...baseMessages,
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Newest update',
            createdAt: '2026-03-25T10:01:00.000Z',
          },
        ]}
        isStreaming={false}
      />,
    );

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it('does not force autoscroll when user is reviewing older messages', () => {
    const { rerender } = render(<MessageList messages={baseMessages} isStreaming={false} />);

    setViewportMetrics({ scrollTop: 200 });
    fireEvent.scroll(getViewportElement());
    scrollIntoViewMock.mockClear();

    rerender(
      <MessageList
        messages={[
          ...baseMessages,
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Incoming update while reviewing history',
            createdAt: '2026-03-25T10:01:00.000Z',
          },
        ]}
        isStreaming={true}
      />,
    );

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('shows jump button when away from bottom and scrolls on click', async () => {
    const { rerender } = render(<MessageList messages={baseMessages} isStreaming={false} />);

    setViewportMetrics({ scrollTop: 200 });
    fireEvent.scroll(getViewportElement());
    scrollIntoViewMock.mockClear();

    rerender(
      <MessageList
        messages={[
          ...baseMessages,
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Unread while scrolled up',
            createdAt: '2026-03-25T10:01:00.000Z',
          },
        ]}
        isStreaming={false}
      />,
    );

    const jumpButton = screen.getByRole('button', { name: 'Jump to latest' });
    expect(jumpButton).toBeInTheDocument();

    fireEvent.click(jumpButton);

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Jump to latest' })).not.toBeInTheDocument();
    });
  });
});
