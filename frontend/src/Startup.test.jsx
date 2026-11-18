import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Startup } from './Startup.jsx';

describe('AquaRefresh startup', () => {
  it('F-T1 displays the AquaRefresh heading and wake-up message', () => {
    const connect = () => new Promise(() => {});
    render(<Startup connect={connect} startPortal={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'AquaRefresh' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('up to 90 seconds');
  });

  it('F-T2 retries the session request and opens the portal on a successful response', async () => {
    const session = { role: null, state: null };
    const connect = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(session);
    const startPortal = vi.fn();
    render(<Startup connect={connect} startPortal={startPortal} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(startPortal).toHaveBeenCalledWith(expect.any(HTMLElement), session));
    expect(connect).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('F-T3 explains a server connection error and offers recovery', async () => {
    const connect = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const startPortal = vi.fn();
    render(<Startup connect={connect} startPortal={startPortal} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t reach the station server');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(startPortal).not.toHaveBeenCalled();
  });
});
