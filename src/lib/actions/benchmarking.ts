import { stepsFrom, type ActionKind } from './types';

/** The District's yearly energy and water benchmarking report, for a covered building. */
export interface BenchmarkingData {
  /** The calendar year reported on. */
  year: number;
  covered: '' | 'yes' | 'no';
  coveredNote: string;
  /** Kept up to date from Building › Care › Utilities: meters, and how many are missing months. */
  meters: number;
  metersMissing: number;
  sqft: number;
  occupants: number;
  hours: string;
  detailsOn: string;
  downloadedOn: string;
  submittedOn: string;
  confirmation: string;
}

/** The report for a year is due April 1 of the next. */
export const benchmarkDue = (year: number) => `${year + 1}-04-01`;

export const BENCHMARKING: ActionKind<BenchmarkingData> = {
  kind: 'benchmarking', runbookId: 'energy-benchmarking', name: 'Energy benchmarking',
  trigger: 'January 1, for a building the District covers', blurb: "The yearly energy and water report: check twelve months of every meter, download the file, record the submission.",
  catId: 'legal', role: 'Vice President', visibility: 'board',
  stepTitles: [['covered', 'Confirm the building is covered'], ['months', 'Twelve months of every meter'], ['details', 'Building details'], ['submit', 'Download the file and submit it'], ['record', 'Record the submission']],
  how: {
    covered: 'Ticks itself when someone confirms whether the building is covered; one that is not closes here',
    months: 'Ticks itself when every meter under Building › Care › Utilities has all twelve months of the year',
    details: 'Ticks itself when floor area, occupants and operating hours are confirmed',
    submit: 'Ticks itself when the date it was submitted in Portfolio Manager is entered',
    record: 'Ticks itself when the confirmation is recorded; fills in the record under Building › Obligations',
  },
  blank: () => ({ year: 0, covered: '', coveredNote: '', meters: 0, metersMissing: 0, sqft: 0, occupants: 0, hours: 'Residential, all hours', detailsOn: '', downloadedOn: '', submittedOn: '', confirmation: '' }),
  steps: (r) => {
    const d = r.data;
    if (d.covered === 'no') return stepsFrom(BENCHMARKING, { covered: [true, `Not covered${d.coveredNote ? `: ${d.coveredNote}` : ''}`], months: [true, 'Not needed'], details: [true, 'Not needed'], submit: [true, 'Not needed'], record: [true, 'Nothing to file'] });
    const ready = d.meters > 0 && d.metersMissing === 0;
    return stepsFrom(BENCHMARKING, {
      covered: [d.covered === 'yes', d.covered ? `Covered${d.coveredNote ? ` · ${d.coveredNote}` : ''}` : ''],
      months: [ready, d.meters ? (ready ? `All ${d.meters} meters complete` : `${d.metersMissing} of ${d.meters} meters missing months`) : 'No meters entered yet', ready ? '' : `the ${d.year} bills being entered under Building › Care › Utilities`],
      details: [!!d.detailsOn, d.detailsOn ? `${d.sqft.toLocaleString('en-US')} sq ft · ${d.occupants} occupants · ${d.hours}` : ''],
      submit: [!!d.submittedOn, d.submittedOn ? `Submitted ${d.submittedOn}` : d.downloadedOn ? `File downloaded ${d.downloadedOn}` : '', !ready ? 'twelve months of every meter' : !d.detailsOn ? 'the building details' : ''],
      record: [!!d.confirmation.trim() && !!d.submittedOn, d.confirmation ? `Confirmation ${d.confirmation}` : '', !d.submittedOn ? 'the submission' : ''],
    });
  },
};
