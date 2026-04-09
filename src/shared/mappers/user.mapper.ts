/**
 * src/shared/mappers/user.mapper.ts
 *
 * Maps Supabase DB row → UserProfile domain model.
 */

import type { Database } from "@/types/supabase";
import type { UserProfile } from "@/types/domain";

type DbUserRow = Database["public"]["Tables"]["users"]["Row"];

export function toUserProfile(row: DbUserRow): UserProfile {
  return {
    id: row.id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
