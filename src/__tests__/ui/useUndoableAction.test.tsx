import { render, screen, fireEvent, act } from '@testing-library/react';
import UndoToastHost, { undoToastStore } from '@/components/ui/UndoToast';
import { useUndoableAction } from '@/hooks/useUndoableAction';

function TestHarness({ undo, commit, ms }: { undo: () => void; commit: () => void; ms?: number }) {
  const { run } = useUndoableAction();
  return (
    <>
      <button
        onClick={() => run({ label: 'Item deleted', undo, commit, ms: ms ?? 5000 })}
      >
        Trigger
      </button>
      <UndoToastHost />
    </>
  );
}

describe('useUndoableAction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset the store state between tests
    undoToastStore.dismiss();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows toast and undo cancels commit', () => {
    const undo = vi.fn();
    const commit = vi.fn();

    render(<TestHarness undo={undo} commit={commit} />);

    // Trigger the action
    fireEvent.click(screen.getByText('Trigger'));

    // Toast should be visible
    expect(screen.getByTestId('undo-toast')).toBeInTheDocument();
    expect(screen.getByText('Item deleted')).toBeInTheDocument();

    // Click Undo
    fireEvent.click(screen.getByText('Undo'));

    // Undo should have been called, commit should not
    expect(undo).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();

    // Toast should be gone
    expect(screen.queryByTestId('undo-toast')).not.toBeInTheDocument();
  });

  it('commits when timer expires', () => {
    const undo = vi.fn();
    const commit = vi.fn();

    render(<TestHarness undo={undo} commit={commit} ms={3000} />);

    // Trigger
    fireEvent.click(screen.getByText('Trigger'));
    expect(screen.getByTestId('undo-toast')).toBeInTheDocument();

    // Advance time past the timer
    act(() => {
      vi.advanceTimersByTime(3500);
    });

    // Commit should have been called once
    expect(commit).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });

  it('does not double-commit after undo', () => {
    const undo = vi.fn();
    const commit = vi.fn();

    render(<TestHarness undo={undo} commit={commit} ms={2000} />);

    fireEvent.click(screen.getByText('Trigger'));
    fireEvent.click(screen.getByText('Undo'));

    // Advance timer -- should not fire commit
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(undo).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });
});
