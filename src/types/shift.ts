export interface ShiftData {
  id: string;
  week: number;
  date: Date;
  startTime: string;
  endTime: string;
  shiftType: "morning" | "afternoon" | "night" | "off" | "other";
  status: "active" | "modified" | "deleted";
  notes?: string;
  googleEventId?: string;
  // Extended fields for Concentrix format
  employeeName?: string;
  lob?: string;
  location?: string;
}

export interface EmployeeSchedule {
  employeeId: string;
  employeeName: string;
  company?: string;
  lob?: string;
  shiftType?: string;
  location?: string;
  shifts: ShiftData[];
}

export interface ParsedScheduleResult {
  employees: EmployeeSchedule[];
  format: "concentrix-wide" | "vodafone-airport" | "simple";
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  description?: string;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
}

export interface SyncSummary {
  create: number;
  update: number;
  delete: number;
}

export interface UserSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
}
