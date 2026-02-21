import type { BudgetCategory, ReserveItem, ChartOfAccountsEntry, Unit } from '@/types/financial';

export const seedBudgetCategories: BudgetCategory[] = [
  { id:'cat1', name:'Maintenance & Repairs', budgeted:8000, expenses:[
    {id:'exp1',date:'2026-01-15',description:'Plumbing repair - Unit 204',amount:450,vendor:'Quick Fix Plumbing',invoice:'INV-1001'},
    {id:'exp2',date:'2026-01-22',description:'HVAC filter replacement',amount:280,vendor:'Cool Air Services',invoice:'INV-1002'},
    {id:'exp3',date:'2026-02-03',description:'Emergency roof leak repair',amount:1200,vendor:'Apex Roofing',invoice:'INV-1003'},
  ]},
  { id:'cat2', name:'Utilities', budgeted:5000, expenses:[
    {id:'exp4',date:'2026-01-10',description:'Electricity - January',amount:1250,vendor:'City Power & Light',invoice:'INV-2001'},
    {id:'exp5',date:'2026-01-10',description:'Water & Sewer - January',amount:850,vendor:'City Water Dept',invoice:'INV-2002'},
    {id:'exp6',date:'2026-02-01',description:'Gas - January',amount:425,vendor:'Metro Gas Company',invoice:'INV-2003'},
  ]},
  { id:'cat3', name:'Landscaping', budgeted:3000, expenses:[
    {id:'exp7',date:'2026-01-20',description:'Monthly lawn service',amount:650,vendor:'Green Thumb Landscaping',invoice:'INV-3001'},
    {id:'exp8',date:'2026-02-05',description:'Tree trimming',amount:380,vendor:'Tree Masters LLC',invoice:'INV-3002'},
  ]},
  { id:'cat4', name:'Insurance', budgeted:5500, expenses:[
    {id:'exp9',date:'2026-01-01',description:'Property insurance premium Q1',amount:4500,vendor:'Secure Home Insurance',invoice:'INV-4001'},
  ]},
  { id:'cat5', name:'Management Fees', budgeted:2500, expenses:[
    {id:'exp10',date:'2026-01-31',description:'Property management - January',amount:1200,vendor:'Premier Property Mgmt',invoice:'INV-5001'},
    {id:'exp11',date:'2026-02-01',description:'Property management - February',amount:1200,vendor:'Premier Property Mgmt',invoice:'INV-5002'},
  ]},
  { id:'cat6', name:'Legal & Professional', budgeted:1500, expenses:[
    {id:'exp12',date:'2026-01-28',description:'HOA legal consultation',amount:450,vendor:'Smith & Associates Law',invoice:'INV-6001'},
    {id:'exp13',date:'2026-02-08',description:'Annual audit services',amount:350,vendor:'CPA Solutions Inc',invoice:'INV-6002'},
  ]},
];

export const seedReserveItems: ReserveItem[] = [
  {id:'res1',name:'Roof Replacement',estimatedCost:85000,currentFunding:45000,usefulLife:25,lastReplaced:'2003',yearsRemaining:2.3,isContingency:false},
  {id:'res2',name:'HVAC System',estimatedCost:95000,currentFunding:50000,usefulLife:20,lastReplaced:'2007',yearsRemaining:1.8,isContingency:false},
  {id:'res3',name:'Elevator Modernization',estimatedCost:75000,currentFunding:0,usefulLife:25,lastReplaced:'2005',yearsRemaining:4.1,isContingency:false},
  {id:'res4',name:'Parking Lot Resurfacing',estimatedCost:45000,currentFunding:0,usefulLife:15,lastReplaced:'2014',yearsRemaining:3.6,isContingency:false},
  {id:'res5',name:'Contingency Fund',estimatedCost:30000,currentFunding:30000,usefulLife:0,lastReplaced:'N/A',yearsRemaining:0,isContingency:true},
];

export const seedChartOfAccounts: ChartOfAccountsEntry[] = [
  // ASSETS
  {num:'1000',name:'Assets',type:'asset',sub:'header',parent:null},
  {num:'1010',name:'Operating Checking',type:'asset',sub:'bank',parent:'1000'},
  {num:'1020',name:'Reserve Savings',type:'asset',sub:'bank',parent:'1000'},
  {num:'1030',name:'Petty Cash',type:'asset',sub:'bank',parent:'1000'},
  {num:'1100',name:'Accounts Receivable',type:'asset',sub:'receivable',parent:'1000'},
  {num:'1110',name:'Assessments Receivable',type:'asset',sub:'receivable',parent:'1100'},
  {num:'1120',name:'Special Assessments Receivable',type:'asset',sub:'receivable',parent:'1100'},
  {num:'1130',name:'Late Fees Receivable',type:'asset',sub:'receivable',parent:'1100'},
  {num:'1140',name:'Insurance Claims Receivable',type:'asset',sub:'receivable',parent:'1100'},
  {num:'1200',name:'Prepaid Expenses',type:'asset',sub:'prepaid',parent:'1000'},
  // LIABILITIES
  {num:'2000',name:'Liabilities',type:'liability',sub:'header',parent:null},
  {num:'2010',name:'Accounts Payable',type:'liability',sub:'payable',parent:'2000'},
  {num:'2020',name:'Prepaid Assessments',type:'liability',sub:'deferred',parent:'2000'},
  {num:'2030',name:'Security Deposits Held',type:'liability',sub:'deposit',parent:'2000'},
  {num:'2040',name:'Accrued Expenses',type:'liability',sub:'accrued',parent:'2000'},
  // EQUITY
  {num:'3000',name:'Equity',type:'equity',sub:'header',parent:null},
  {num:'3010',name:'Operating Fund Balance',type:'equity',sub:'fund',parent:'3000'},
  {num:'3020',name:'Reserve Fund Balance',type:'equity',sub:'fund',parent:'3000'},
  {num:'3030',name:'Retained Surplus / (Deficit)',type:'equity',sub:'retained',parent:'3000'},
  // INCOME
  {num:'4000',name:'Income',type:'income',sub:'header',parent:null},
  {num:'4010',name:'Regular Assessments',type:'income',sub:'assessment',parent:'4000'},
  {num:'4020',name:'Special Assessments',type:'income',sub:'assessment',parent:'4000'},
  {num:'4030',name:'Late Fees',type:'income',sub:'fee',parent:'4000'},
  {num:'4040',name:'Interest Income',type:'income',sub:'interest',parent:'4000'},
  {num:'4050',name:'Move-In/Move-Out Fees',type:'income',sub:'fee',parent:'4000'},
  {num:'4060',name:'Amenity Rental Income',type:'income',sub:'fee',parent:'4000'},
  {num:'4070',name:'Fines & Penalties',type:'income',sub:'fee',parent:'4000'},
  {num:'4080',name:'Insurance Proceeds',type:'income',sub:'other',parent:'4000'},
  {num:'4090',name:'Other Income',type:'income',sub:'other',parent:'4000'},
  // OPERATING EXPENSES
  {num:'5000',name:'Operating Expenses',type:'expense',sub:'header',parent:null},
  {num:'5010',name:'Maintenance & Repairs',type:'expense',sub:'operating',parent:'5000',budgetCat:'cat1'},
  {num:'5020',name:'Utilities',type:'expense',sub:'operating',parent:'5000',budgetCat:'cat2'},
  {num:'5030',name:'Landscaping',type:'expense',sub:'operating',parent:'5000',budgetCat:'cat3'},
  {num:'5040',name:'Insurance',type:'expense',sub:'operating',parent:'5000',budgetCat:'cat4'},
  {num:'5050',name:'Management Fees',type:'expense',sub:'operating',parent:'5000',budgetCat:'cat5'},
  {num:'5060',name:'Legal & Professional',type:'expense',sub:'operating',parent:'5000',budgetCat:'cat6'},
  {num:'5070',name:'Administrative',type:'expense',sub:'operating',parent:'5000'},
  {num:'5080',name:'Security',type:'expense',sub:'operating',parent:'5000'},
  {num:'5090',name:'Cleaning & Janitorial',type:'expense',sub:'operating',parent:'5000'},
  {num:'5100',name:'Pest Control',type:'expense',sub:'operating',parent:'5000'},
  // RESERVE EXPENSES
  {num:'6000',name:'Reserve Expenses',type:'expense',sub:'header',parent:null},
  {num:'6010',name:'Roof Replacement',type:'expense',sub:'reserve',parent:'6000',reserveItem:'res1'},
  {num:'6020',name:'HVAC System',type:'expense',sub:'reserve',parent:'6000',reserveItem:'res2'},
  {num:'6030',name:'Elevator Modernization',type:'expense',sub:'reserve',parent:'6000',reserveItem:'res3'},
  {num:'6040',name:'Parking Lot Resurfacing',type:'expense',sub:'reserve',parent:'6000',reserveItem:'res4'},
  {num:'6050',name:'Contingency',type:'expense',sub:'reserve',parent:'6000',reserveItem:'res5'},
];

export const seedUnits: Unit[] = [
  {number:'101',owner:'Sarah Johnson',email:'sarah.j@example.com',phone:'202-555-0101',monthlyFee:450,votingPct:2.1,status:'OCCUPIED',balance:0,moveIn:'2019-06-15',sqft:850,bedrooms:1,parking:'P-101',payments:[{date:'2026-01-05',amount:450,method:'ACH',note:''},{date:'2026-02-03',amount:450,method:'ACH',note:''}],lateFees:[],specialAssessments:[]},
  {number:'102',owner:'Mike Davis',email:'mike.d@example.com',phone:'202-555-0102',monthlyFee:475,votingPct:2.2,status:'OCCUPIED',balance:0,moveIn:'2020-03-01',sqft:900,bedrooms:1,parking:'P-102',payments:[{date:'2026-01-04',amount:475,method:'check',note:'#4521'},{date:'2026-02-02',amount:475,method:'check',note:'#4589'}],lateFees:[],specialAssessments:[]},
  {number:'103',owner:'Vacant',email:'',phone:'',monthlyFee:450,votingPct:2.1,status:'VACANT',balance:0,moveIn:null,sqft:850,bedrooms:1,parking:'P-103',payments:[],lateFees:[],specialAssessments:[]},
  {number:'201',owner:'Lisa Chen',email:'lisa.c@example.com',phone:'202-555-0201',monthlyFee:500,votingPct:2.3,status:'OCCUPIED',balance:0,moveIn:'2018-09-01',sqft:1050,bedrooms:2,parking:'P-201',payments:[{date:'2026-01-03',amount:500,method:'ACH',note:''},{date:'2026-02-01',amount:500,method:'ACH',note:''}],lateFees:[],specialAssessments:[]},
  {number:'202',owner:'Tom Wilson',email:'tom.w@example.com',phone:'202-555-0202',monthlyFee:450,votingPct:2.1,status:'OCCUPIED',balance:0,moveIn:'2021-01-15',sqft:850,bedrooms:1,parking:null,payments:[{date:'2026-01-06',amount:450,method:'ACH',note:''},{date:'2026-02-05',amount:450,method:'ACH',note:''}],lateFees:[],specialAssessments:[]},
  {number:'203',owner:'Emma Stone',email:'emma.s@example.com',phone:'202-555-0203',monthlyFee:475,votingPct:2.2,status:'OCCUPIED',balance:450,moveIn:'2022-07-01',sqft:900,bedrooms:1,parking:'P-203',payments:[{date:'2026-01-08',amount:475,method:'check',note:'#1891'}],lateFees:[],specialAssessments:[]},
  {number:'301',owner:'John Smith (You)',email:'john@example.com',phone:'202-555-0301',monthlyFee:450,votingPct:2.1,status:'OCCUPIED',balance:925,moveIn:'2017-04-01',sqft:850,bedrooms:1,parking:'P-301',payments:[],lateFees:[{date:'2026-02-06',amount:25,reason:'Late payment — Jan 2026',waived:false}],specialAssessments:[{id:'sa-1',date:'2026-01-15',amount:500,reason:'Roof emergency repair assessment',paid:false,paidDate:null}]},
  {number:'302',owner:'Rachel Green',email:'rachel.g@example.com',phone:'202-555-0302',monthlyFee:450,votingPct:2.1,status:'OCCUPIED',balance:0,moveIn:'2023-11-01',sqft:850,bedrooms:1,parking:null,payments:[{date:'2026-01-01',amount:450,method:'ACH',note:''},{date:'2026-02-01',amount:450,method:'ACH',note:''}],lateFees:[],specialAssessments:[]},
  {number:'303',owner:'David Park',email:'david.p@example.com',phone:'202-555-0303',monthlyFee:475,votingPct:2.2,status:'OCCUPIED',balance:450,moveIn:'2020-08-15',sqft:900,bedrooms:1,parking:'P-303',payments:[{date:'2026-01-10',amount:475,method:'check',note:'#7823'}],lateFees:[],specialAssessments:[]},
  {number:'401',owner:'Amy Lee',email:'amy.l@example.com',phone:'202-555-0401',monthlyFee:500,votingPct:2.3,status:'OCCUPIED',balance:0,moveIn:'2019-02-01',sqft:1050,bedrooms:2,parking:'P-401',payments:[{date:'2026-01-02',amount:500,method:'ACH',note:''},{date:'2026-02-01',amount:500,method:'ACH',note:''}],lateFees:[],specialAssessments:[]},
  {number:'402',owner:'James Brown',email:'james.b@example.com',phone:'202-555-0402',monthlyFee:450,votingPct:2.1,status:'OCCUPIED',balance:0,moveIn:'2021-05-01',sqft:850,bedrooms:1,parking:null,payments:[{date:'2026-01-05',amount:450,method:'ACH',note:''},{date:'2026-02-04',amount:450,method:'ACH',note:''}],lateFees:[],specialAssessments:[]},
  {number:'403',owner:'Maria Garcia',email:'maria.g@example.com',phone:'202-555-0403',monthlyFee:475,votingPct:2.2,status:'OCCUPIED',balance:1200,moveIn:'2018-11-15',sqft:900,bedrooms:1,parking:'P-403',payments:[],lateFees:[{date:'2026-01-06',amount:25,reason:'Late payment — Dec 2025',waived:false},{date:'2026-02-06',amount:50,reason:'Late payment — Jan 2026 (2nd offense)',waived:false}],specialAssessments:[{id:'sa-2',date:'2026-01-15',amount:500,reason:'Roof emergency repair assessment',paid:false,paidDate:null}]},
  {number:'501',owner:'Chris Taylor',email:'chris.t@example.com',phone:'202-555-0501',monthlyFee:500,votingPct:2.3,status:'OCCUPIED',balance:0,moveIn:'2022-01-01',sqft:1200,bedrooms:2,parking:'P-501',payments:[{date:'2026-01-03',amount:500,method:'ACH',note:''},{date:'2026-02-02',amount:500,method:'ACH',note:''}],lateFees:[],specialAssessments:[]},
  {number:'502',owner:'Nicole White',email:'nicole.w@example.com',phone:'202-555-0502',monthlyFee:550,votingPct:2.5,status:'OCCUPIED',balance:550,moveIn:'2023-06-01',sqft:1350,bedrooms:3,parking:'P-502A, P-502B',payments:[{date:'2026-01-07',amount:550,method:'check',note:'#9901'}],lateFees:[],specialAssessments:[]},
];

export interface WorkOrder {
  id: string; title: string; vendor: string; description: string;
  acctNum: string; amount: number; status: 'draft' | 'approved' | 'invoiced' | 'paid';
  caseId: string | null; createdDate: string; approvedDate: string | null;
  invoiceNum: string | null; invoiceDate: string | null; paidDate: string | null;
  glEntryId: string | null; attachments: Array<{name:string;type:string;date:string;size:string}>;
}

export const seedWorkOrders: WorkOrder[] = [
  {id:'WO-101',title:'Emergency Roof Leak Repair',vendor:'Apex Roofing',description:'Water intrusion in unit 204 from roof membrane failure',acctNum:'5010',amount:1200,status:'paid',caseId:'c3',createdDate:'2026-01-28',approvedDate:'2026-01-29',invoiceNum:'INV-1003',invoiceDate:'2026-02-03',paidDate:'2026-02-03',glEntryId:'GL1017',attachments:[{name:'INV-1003-ApexRoofing.pdf',type:'invoice',date:'2026-02-03',size:'245 KB'}]},
  {id:'WO-102',title:'HVAC Filter Replacement - All Units',vendor:'Cool Air Services',description:'Quarterly HVAC filter replacement for common areas',acctNum:'5010',amount:280,status:'paid',caseId:null,createdDate:'2026-01-18',approvedDate:'2026-01-19',invoiceNum:'INV-1002',invoiceDate:'2026-01-22',paidDate:'2026-01-22',glEntryId:'GL1016',attachments:[{name:'INV-1002-CoolAir.pdf',type:'invoice',date:'2026-01-22',size:'128 KB'}]},
  {id:'WO-103',title:'Tree Trimming - Front Entrance',vendor:'Tree Masters LLC',description:'Annual trim of oak trees along main entrance',acctNum:'5030',amount:380,status:'invoiced',caseId:null,createdDate:'2026-02-01',approvedDate:'2026-02-02',invoiceNum:'INV-3002',invoiceDate:'2026-02-05',paidDate:null,glEntryId:null,attachments:[]},
  {id:'WO-104',title:'Elevator Annual Inspection',vendor:'Metro Elevator Co',description:'Annual state-required elevator inspection and certification',acctNum:'5010',amount:950,status:'approved',caseId:null,createdDate:'2026-02-10',approvedDate:'2026-02-12',invoiceNum:null,invoiceDate:null,paidDate:null,glEntryId:null,attachments:[]},
  {id:'WO-105',title:'Lobby Painting - Water Damage',vendor:'Pro Painters LLC',description:'Repaint lobby ceiling after water leak from unit 301',acctNum:'5010',amount:1800,status:'draft',caseId:null,createdDate:'2026-02-15',approvedDate:null,invoiceNum:null,invoiceDate:null,paidDate:null,glEntryId:null,attachments:[]},
];
