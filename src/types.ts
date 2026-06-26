export const SCHOLARSHIPS_LIST = [
  'Flat 10k',
  'Flat 15k',
  '100% on Tuition Fees',
  '85% on Tuition Fees',
  '70% on Tuition Fees',
  '55% on Tuition Fees',
  '45% on Tuition Fees',
  '40% on Tuition Fees',
  '35% on Tuition Fees',
  '30% on Tuition Fees'
];

export interface StudentScholarshipRow {
  id: string; // Unique local identifier
  region: string;
  center: string;
  building: string;
  studentName: string;
  regNo: string;
  batchName: string;
  class: string;
  scholarship: string;
  mentor: string;
  mentorMailid: string; // Storing matching value
  pwid: string; // Storing matching value
  whatsappIntimation: boolean; // Is intimated
  ptmStatus: string;
  parentRemarks: string;
  paymentDate: string;
  discontinueReason: string;
  retentionProbability: 'Low' | 'Medium' | 'High' | '';
  proposedScholarship: string;
  extraScholarshipDemand: boolean; // Checkbox representation
  extraScholarshipStatus: 'Pending' | 'Approved' | 'Rejected' | 'InProgress' | '';
  rahStatus?: 'Pending' | 'Approved' | 'Rejected' | 'InProgress' | '';
  finalRetentionStatus: string;
  finalScholarship: string; // New column added
  counselorName: string;
  counselorPwid: string;
  newRegno: string;
  counselorStatus?: string;
}

export type ViewTab = 'all' | 'pending-remarks' | 'approved' | 'retention-risk';

export interface ActivityLog {
  id: string;
  timestamp: string;
  userRole: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'RESET';
  details: string;
  target?: string;
}

export interface UserRoleMapping {
  region: string;
  center: string;
  building: string;
  regno: string;
  rahMailid: string; // RAH Mailid
  rfhMailid: string; // RFH MailID
  chMailid: string;  // CH Mailid
  fhMailid: string;  // FH MailId
  mentorId: string;  // Mentor ID
  counselorId: string; // Councellor ID
}

