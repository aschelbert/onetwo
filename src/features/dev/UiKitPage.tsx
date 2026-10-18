import React, { useState } from 'react';
import DrawerShell from '@/components/ui/DrawerShell';
import QueueCard from '@/components/ui/QueueCard';
import RoleChip from '@/components/ui/RoleChip';
import SegmentedControl from '@/components/ui/SegmentedControl';
import InlineField from '@/components/ui/InlineField';
import ProofBadge from '@/components/ui/ProofBadge';
import UndoToastHost from '@/components/ui/UndoToast';
import { useUndoableAction } from '@/hooks/useUndoableAction';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-medium text-navy border-b border-ink-200 pb-2 mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function UiKitPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerWithRail, setDrawerWithRail] = useState(false);
  const [segValue, setSegValue] = useState<'all' | 'mine' | 'backstop'>('all');
  const { run } = useUndoableAction();

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <h1 className="font-display text-3xl text-navy mb-2">UI Kit</h1>
      <p className="text-sm text-ink-500 mb-8">
        Dev-only page. Verify every shared primitive in each state.
      </p>

      {/* DrawerShell */}
      <Section title="DrawerShell">
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => { setDrawerWithRail(false); setDrawerOpen(true); }}
            className="px-4 py-2 text-sm font-medium text-white bg-navy rounded-lg"
          >
            Open Drawer
          </button>
          <button
            onClick={() => { setDrawerWithRail(true); setDrawerOpen(true); }}
            className="px-4 py-2 text-sm font-medium text-white bg-navy rounded-lg"
          >
            Open Drawer with Rail
          </button>
        </div>
        <DrawerShell
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          breadcrumb={['Budget Season', 'Milestone 3', 'President']}
          title="Approve Annual Budget"
          legalRef="NRS 116.31151"
          whyLink={() => {}}
          step={drawerWithRail ? { current: 2, total: 4 } : undefined}
          footer={{
            primaryLabel: 'Approve',
            onPrimary: () => setDrawerOpen(false),
            secondaryLabel: 'Save Draft',
            onSecondary: () => {},
            tertiaryLink: { label: 'Skip this step', onClick: () => {} },
          }}
          rail={
            drawerWithRail ? (
              <div className="p-3">
                <p className="text-xs text-ink-500 font-medium uppercase mb-2">Thread</p>
                <div className="space-y-2">
                  <div className="text-xs text-ink-600 bg-ink-50 rounded p-2">
                    Treasurer reviewed the draft on Oct 10.
                  </div>
                  <div className="text-xs text-ink-600 bg-ink-50 rounded p-2">
                    Secretary added proof of notice.
                  </div>
                </div>
              </div>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              Review the budget below and confirm totals are correct.
            </p>
            <div className="bg-ink-50 rounded-lg p-4 text-sm text-ink-700">
              Total proposed: $245,000. Reserve allocation: $82,000.
            </div>
          </div>
        </DrawerShell>
      </Section>

      {/* QueueCard */}
      <Section title="QueueCard">
        <div className="space-y-3 max-w-md">
          {/* Insurance renewal card */}
          <QueueCard
            roleKey="treasurer"
            roleLabel="Treasurer"
            roleState="mine"
            containerLine="Budget Season - milestone 3"
            tag={{ label: 'Request', tone: 'request' }}
            title="Upload insurance renewal certificate"
            why="Due before the annual meeting per NRS 116."
            due={{ label: 'Due Oct 25', tone: 'soon' }}
            primary={{ label: 'Upload', onClick: () => {} }}
            onOpen={() => {}}
            emphasis
          />

          {/* Overdue card */}
          <QueueCard
            roleLabel="Secretary"
            roleState="other"
            containerLine="Case - step 3 of 6"
            tag={{ label: 'Case', tone: 'case' }}
            title="Post meeting minutes to portal"
            due={{ label: '3 days overdue', tone: 'overdue' }}
            primary={{ label: 'Open', onClick: () => {} }}
            secondary={[{ label: 'Reassign', onClick: () => {} }]}
            onOpen={() => {}}
          />

          {/* Normal card, dimmed */}
          <QueueCard
            roleLabel="President"
            roleState="backstop"
            title="Review vendor contract renewal"
            containerLine="Budget Season - milestone 1"
            tag={{ label: 'Vote', tone: 'vote' }}
            due={{ label: 'Due Nov 15', tone: 'normal' }}
            primary={{ label: 'Review', onClick: () => {} }}
            onOpen={() => {}}
            dimmed
          />
        </div>
      </Section>

      {/* RoleChip */}
      <Section title="RoleChip">
        <div className="flex flex-wrap gap-3">
          <RoleChip label="Treasurer" tone="default" />
          <RoleChip label="President" tone="teal" />
          <RoleChip label="Backstop" tone="amber" />
          <RoleChip label="Overdue" tone="red" />
        </div>
      </Section>

      {/* SegmentedControl */}
      <Section title="SegmentedControl">
        <div className="space-y-4">
          <SegmentedControl
            options={[
              { value: 'all', label: 'All' },
              { value: 'mine', label: 'My Tasks' },
              { value: 'backstop', label: 'Backstop' },
            ]}
            value={segValue}
            onChange={setSegValue}
          />
          <p className="text-xs text-ink-400">Selected: {segValue}</p>
          <SegmentedControl
            options={[
              { value: 'all', label: 'All' },
              { value: 'mine', label: 'Mine' },
            ]}
            value="all"
            onChange={() => {}}
            size="sm"
          />
        </div>
      </Section>

      {/* InlineField */}
      <Section title="InlineField">
        <div className="max-w-sm space-y-4">
          <InlineField label="Full Name" htmlFor="name-demo">
            <input
              id="name-demo"
              type="text"
              placeholder="Jane Smith"
              className="w-full px-3 py-2 text-sm border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
          </InlineField>
          <InlineField label="Email" htmlFor="email-demo" error="A valid email is required.">
            <input
              id="email-demo"
              type="email"
              placeholder="jane@example.com"
              className="w-full px-3 py-2 text-sm border border-brand-red rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red"
            />
          </InlineField>
        </div>
      </Section>

      {/* ProofBadge */}
      <Section title="ProofBadge">
        <div className="flex flex-wrap gap-4 items-center">
          <ProofBadge label="insurance_cert.pdf" onClick={() => {}} />
          <ProofBadge missing />
        </div>
      </Section>

      {/* UndoToast */}
      <Section title="UndoToast">
        <button
          onClick={() =>
            run({
              label: 'Case closed',
              undo: () => {},
              commit: () => {},
              ms: 10000,
            })
          }
          className="px-4 py-2 text-sm font-medium text-white bg-navy rounded-lg"
        >
          Trigger Undo Toast
        </button>
      </Section>

      <UndoToastHost />
    </div>
  );
}
