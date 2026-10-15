export type Role =
  | "super_admin"
  | "general_manager"
  | "head_admin"
  | "admin"
  | "hr"
  | "qc"
  | "teacher"
  | "parent"
  | "student"
  | "finance"
  | "sales_marketing"
  | "social_media";

export type AppView =
  | "overview"
  | "schedule"
  | "families"
  | "leads"
  | "finance"
  | "payroll"
  | "people"
  | "curriculum"
  | "learning"
  | "reports"
  | "settings";

export type LessonStatus =
  | "scheduled"
  | "teacher_done"
  | "completed"
  | "missed"
  | "cancelled"
  | "rescheduled";

export type LeadStatus =
  | "new"
  | "contacted"
  | "callback"
  | "trial_requested"
  | "trial_booked"
  | "trial_verified"
  | "converted"
  | "nursery"
  | "winback";

export type Currency = string;

export interface Student {
  id: string;
  name: string;
  dob: string;
  parentName: string;
  parentEmail: string;
  instrument: string;
  teacherName: string;
  adminName: string;
  timezone: string;
  consent: boolean;
  rank: "Novice" | "Beginner" | "Amateur" | "Master";
  songsDone: string[];
  songsToDo: string[];
  status: "active" | "paused" | "inactive";
  admissionStatus?: "pending_review" | "approved" | "rejected";
  lessonDuration?: string;
  extraTimeNotes?: string;
  preferredDays?: string;
  gender?: string;
  experience?: string;
  hasInstrument?: string;
  learningGoals?: string;
  specialNeeds?: string;
  notes?: string;
  monthlyLessons: number;
  lessonsTaken: number;
}

export interface Lesson {
  id: string;
  studentId: string;
  studentName: string;
  teacherName: string;
  adminName: string;
  title: string;
  instrument: string;
  startsAt: string;
  studentTimezone: string;
  durationMinutes?: number;
  durationReason?: string;
  status: LessonStatus;
  kind: "standard" | "trial" | "cover";
  notes: string;
  nextTopics: string;
  requestedSlots?: string[];
  classroomProvider?: "inbuilt" | "google_meet";
  meetUrl?: string;
  verification?: { teacher: string; admin: string; at: string };
}



export interface Lead {
  id: string;
  parentName: string;
  email: string;
  phone: string;
  childName: string;
  instrument: string;
  source: string;
  status: LeadStatus;
  arrivedAt: string;
  firstResponseAt?: string;
  callbackAt?: string;
  owner: string;
  notes: string;
  referralFrom?: string;
  preferredSlots?: string[];
  teacherName?: string;
  adminName?: string;
}

export interface Payment {
  id: string;
  parentName: string;
  studentName: string;
  amount: number;
  currency: Currency;
  dueDate: string;
  status: "due" | "receipt_uploaded" | "paid";
  terms: "upfront" | "after_service";
  referralDiscount: number;
  receiptName?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: Role;
  department: string;
  status: "active" | "on_leave" | "paused" | "restricted" | "applicant";
  email: string;
  timezone: string;
  baseRate: number;
  currency: Currency;
  quota?: number;
  parentCount?: number;
}

export interface PayrollItem {
  id: string;
  staffName: string;
  role: string;
  period: string;
  currency: Currency;
  base: number;
  standardLessons: number;
  trialLessons: number;
  coverLessons: number;
  bonus: number;
  deduction: number;
  deductionReason?: string;
  status: "draft" | "pending_approval" | "approved" | "paid";
}

export interface Resource {
  id: string;
  title: string;
  type: "song" | "guide" | "exercise" | "video";
  instrument: string;
  level: string;
  summary: string;
}

export interface HomeworkItem {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  dueDate: string;
  status: "assigned" | "submitted" | "reviewed";
  teacherName: string;
  note: string;
  mediaName?: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: Currency;
  date: string;
  category: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  record: string;
  actor: string;
  at: string;
  detail: string;
}

export interface AcademyData {
  students: Student[];
  lessons: Lesson[];
  leads: Lead[];
  payments: Payment[];
  staff: StaffMember[];
  payroll: PayrollItem[];
  resources: Resource[];
  homework: HomeworkItem[];
  expenses: Expense[];
  audit: AuditEntry[];
  billingStudents?: { id: string; parentId: string; name: string; parentName: string }[];
}
