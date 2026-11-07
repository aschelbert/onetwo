import PropertyLogPage from '@/features/property-log/PropertyLogPage';
import { Card, Inner, SectionLabel } from '../../components';

/**
 * Community › Property log. Anyone in the building can log what they see
 * (a walkthrough, an incident, something that needs a look); the board, the
 * manager and staff edit entries and turn findings into tasks. The records
 * and the form are the production Property log, so the task links and the
 * insurance-claim hand-off keep working.
 */
export default function LogTab({ isBoard }: { isBoard: boolean }) {
  return (
    <Card aria-label="Property log">
      <SectionLabel>Property log · what people see around the building</SectionLabel>
      <Inner className="text-xs text-ux2-muted">
        {isBoard
          ? 'Owners and staff log what they notice; you and the manager turn findings into tasks, link a claim, and close them. Everyone sees the log.'
          : 'See something? Log it: a leak, a light out, a door that will not latch. The board and the manager pick it up from here and you can follow it.'}
      </Inner>
      <div className="ux2-legacy"><PropertyLogPage /></div>
    </Card>
  );
}
