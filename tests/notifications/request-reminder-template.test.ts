import { describe, expect, it } from "vitest";
import {
  buildLeaveReminderTemplate,
  buildSwapReminderTemplate,
} from "../../supabase/functions/_shared/request-reminder-template";

describe("request reminder templates", () => {
  it("builds swap reminder with explicit who/what/which shift details", () => {
    const template = buildSwapReminderTemplate({
      recipientName: "Bruno Lima",
      reason: "awaiting_peer_decision",
      requestId: "swap-123",
      status: "pending_target",
      requesterName: "Ana Costa",
      requesterCode: "EMP-101",
      targetName: "Bruno Lima",
      targetCode: "EMP-202",
      requesterShiftLabel: "10/05/2026, 07:00-15:00",
      targetShiftLabel: "10/05/2026, 12:00-20:00",
      createdAt: "10/05/2026, 08:00",
      updatedAt: "10/05/2026, 08:30",
    });

    expect(template.subject).toContain("Lembrete de troca");
    expect(template.text).toContain("Mudança de turno (por quem e para quê)");
    expect(template.text).toContain("Pedido por: Ana Costa (EMP-101)");
    expect(template.text).toContain("Com: Bruno Lima (EMP-202)");
    expect(template.text).toContain("Turno do requerente: 10/05/2026, 07:00-15:00");
    expect(template.text).toContain("Turno do colega: 10/05/2026, 12:00-20:00");
    expect(template.html).toContain("Mudança de turno (por quem e para quê)");
    expect(template.html).toContain("Ana Costa");
    expect(template.html).toContain("Bruno Lima");
  });

  it("builds leave reminder with explicit who/what details", () => {
    const template = buildLeaveReminderTemplate({
      recipientName: "João Silva",
      reason: "awaiting_hr_decision",
      requestId: "leave-456",
      status: "submitted_to_hr",
      ownerName: "João Silva",
      ownerCode: "EMP-303",
      leaveType: "vacation",
      leavePeriod: "2026-06-01 até 2026-06-07",
      createdAt: "01/05/2026, 09:00",
      updatedAt: "02/05/2026, 10:15",
    });

    expect(template.subject).toContain("Lembrete de ausência");
    expect(template.text).toContain("Alteração solicitada (por quem e para quê)");
    expect(template.text).toContain("Pedido por: João Silva (EMP-303)");
    expect(template.text).toContain("Tipo: vacation");
    expect(template.text).toContain("Período: 2026-06-01 até 2026-06-07");
    expect(template.html).toContain("Alteração solicitada (por quem e para quê)");
    expect(template.html).toContain("João Silva");
    expect(template.html).toContain("vacation");
  });
});
