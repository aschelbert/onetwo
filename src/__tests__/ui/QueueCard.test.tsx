import { render, screen, fireEvent } from '@testing-library/react';
import QueueCard from '@/components/ui/QueueCard';

describe('QueueCard', () => {
  it('renders the title', () => {
    render(<QueueCard title="Upload insurance renewal" />);
    expect(screen.getByText('Upload insurance renewal')).toBeInTheDocument();
  });

  it('renders role chip with teal tone for mine state', () => {
    render(
      <QueueCard
        title="Some task"
        roleLabel="Treasurer"
        roleState="mine"
      />
    );
    const chip = screen.getByTestId('role-chip');
    expect(chip).toHaveTextContent('Treasurer');
    expect(chip.className).toContain('brand-teal');
  });

  it('renders role chip with amber tone for backstop state', () => {
    render(
      <QueueCard
        title="Some task"
        roleLabel="Backstop"
        roleState="backstop"
      />
    );
    const chip = screen.getByTestId('role-chip');
    expect(chip).toHaveTextContent('Backstop');
    expect(chip.className).toContain('amber');
  });

  it('renders due label with overdue tone', () => {
    render(
      <QueueCard
        title="Post minutes"
        due={{ label: '3 days overdue', tone: 'overdue' }}
      />
    );
    const due = screen.getByTestId('queue-card-due');
    expect(due).toHaveTextContent('3 days overdue');
    expect(due.className).toContain('brand-red');
  });

  it('renders due label with soon tone', () => {
    render(
      <QueueCard
        title="Post minutes"
        due={{ label: 'Due tomorrow', tone: 'soon' }}
      />
    );
    const due = screen.getByTestId('queue-card-due');
    expect(due).toHaveTextContent('Due tomorrow');
    expect(due.className).toContain('amber');
  });

  it('renders due label with normal tone', () => {
    render(
      <QueueCard
        title="Post minutes"
        due={{ label: 'Due Nov 15', tone: 'normal' }}
      />
    );
    const due = screen.getByTestId('queue-card-due');
    expect(due).toHaveTextContent('Due Nov 15');
    expect(due.className).toContain('ink-400');
  });

  it('calls onOpen when title is clicked', () => {
    const onOpen = vi.fn();
    render(<QueueCard title="Review contract" onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId('queue-card-title'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders primary action button', () => {
    const onClick = vi.fn();
    render(
      <QueueCard
        title="Some task"
        primary={{ label: 'Upload', onClick }}
      />
    );
    const btn = screen.getByText('Upload');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies emphasis class when emphasis is true', () => {
    const { container } = render(<QueueCard title="Emphasized" emphasis />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('border-brand-teal');
    expect(card.className).toContain('border-2');
  });

  it('applies dimmed class when dimmed is true', () => {
    const { container } = render(<QueueCard title="Dimmed" dimmed />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('opacity-50');
  });
});
