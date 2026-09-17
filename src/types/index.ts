export type UserRole = 'admin' | 'manager' | 'officer';

export type UserStatus = 'active' | 'inactive';

export type DutySessionStatus = 'active' | 'ended' | 'submitted' | 'returned' | 'finalized';

export type DutyReportStatus = 'submitted' | 'under_review' | 'returned' | 'finalized';

export type OccurrenceStatus = 'recorded' | 'reviewed' | 'flagged';

export interface Profile {
  id: string;
  auth_user_id?: string;
  email: string;
  full_name: string;
  role: UserRole;
  staff_id?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  status: UserStatus;
  created_at?: string;
  updated_at?: string;
}

export interface Station {
  id: string;
  station_name: string;
  station_code: string;
  location: string;
  status: 'active' | 'inactive';
  manager_id?: string | null;
  manager?: Profile | null;
  officers?: Profile[];
  created_at?: string;
  updated_at?: string;
}

export interface StationOfficer {
  id: string;
  station_id: string;
  officer_id: string;
  active: boolean;
  assigned_at?: string;
  created_at?: string;
  officer?: Profile;
  station?: Station;
}

export interface DutySession {
  id: string;
  officer_id: string;
  station_id: string;
  manager_id?: string | null;
  duty_date: string;
  started_at: string;
  expected_end_at: string;
  closed_at?: string | null;
  status: DutySessionStatus;
  final_submitted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  officer?: Profile;
  station?: Station;
  manager?: Profile;
  occurrences_count?: number;
}

export interface OccurrenceEvidence {
  id: string;
  occurrence_id: string;
  storage_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  public_url?: string | null;
  created_at?: string;
}

export interface Occurrence {
  id: string;
  duty_session_id: string;
  officer_id: string;
  station_id: string;
  manager_id?: string | null;
  description: string;
  occurrence_time: string;
  status: OccurrenceStatus;
  created_at?: string;
  updated_at?: string;
  evidence?: OccurrenceEvidence[];
  officer?: Profile;
  station?: Station;
  manager?: Profile;
}

export interface DutyReport {
  id: string;
  duty_session_id: string;
  officer_id: string;
  station_id: string;
  manager_id?: string | null;
  officer_submitted_at: string;
  manager_reviewed_at?: string | null;
  manager_approved_at?: string | null;
  manager_submitted_at?: string | null;
  status: DutyReportStatus;
  manager_comments?: string | null;
  correction_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  session?: DutySession;
  officer?: Profile;
  station?: Station;
  manager?: Profile;
  occurrences?: Occurrence[];
}

export interface AppNotification {
  id: string;
  recipient_user_id: string;
  type: string;
  title: string;
  message: string;
  related_entity_id?: string | null;
  related_entity_type?: string | null;
  read_at?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
  actor?: Profile;
}
