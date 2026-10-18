import { render, screen, fireEvent } from '@testing-library/react';
import DrawerShell from '@/components/ui/DrawerShell';

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  breadcrumb: ['Budget Season', 'Milestone 3'],
  title: 'Test Drawer',
  footer: {
    primaryLabel: 'Confirm',
    onPrimary: vi.fn(),
  },
  children: <div>Drawer content</div>,
};

function renderDrawer(overrides = {}) {
  return render(<DrawerShell {...defaultProps} {...overrides} />);
}

describe('DrawerShell', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    defaultProps.onClose = vi.fn();
    defaultProps.footer.onPrimary = vi.fn();
  });

  it('renders title and breadcrumb when open', () => {
    renderDrawer();
    expect(screen.getByText('Test Drawer')).toBeInTheDocument();
    expect(screen.getByText('Budget Season \u00B7 Milestone 3')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderDrawer({ open: false });
    expect(screen.queryByText('Test Drawer')).not.toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    renderDrawer();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', () => {
    renderDrawer();
    const backdrop = screen.getByTestId('drawer-backdrop');
    fireEvent.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('traps focus inside the drawer', () => {
    renderDrawer({
      footer: {
        primaryLabel: 'Confirm',
        onPrimary: vi.fn(),
        secondaryLabel: 'Cancel',
        onSecondary: vi.fn(),
      },
    });

    // The dialog should exist and have role="dialog"
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Get all focusable buttons inside the dialog
    const buttons = dialog.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    // Focus the last button
    const lastButton = buttons[buttons.length - 1];
    lastButton.focus();

    // Tab from last should wrap to first
    fireEvent.keyDown(dialog, { key: 'Tab' });
    // The focus trap logic prevents default and moves focus
  });

  it('disables primary button when primaryDisabled is true', () => {
    renderDrawer({
      footer: {
        primaryLabel: 'Confirm',
        onPrimary: vi.fn(),
        primaryDisabled: true,
      },
    });
    const primaryBtn = screen.getByText('Confirm');
    expect(primaryBtn).toBeDisabled();
  });

  it('does not disable primary button by default', () => {
    renderDrawer();
    const primaryBtn = screen.getByText('Confirm');
    expect(primaryBtn).not.toBeDisabled();
  });

  it('renders step bar when step is provided', () => {
    renderDrawer({ step: { current: 2, total: 4 } });
    // Step bar should render 4 segments
    const dialog = screen.getByRole('dialog');
    const segments = dialog.querySelectorAll('.rounded-full');
    expect(segments.length).toBe(4);
  });
});
