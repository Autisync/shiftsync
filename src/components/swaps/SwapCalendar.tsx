import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { pt } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "@/components/swaps/swap-calendar-enterprise.css";
import { SwapCalendarEvent } from "@/components/swaps/SwapCalendarEvent";
import type { SwapCalendarEventItem } from "@/components/swaps/swap-calendar.types";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { "pt-PT": pt },
});

interface SwapCalendarProps {
  events: SwapCalendarEventItem[];
  view: View;
  date: Date;
  onViewChange: (view: View) => void;
  onNavigate: (date: Date) => void;
  onSelectEvent: (event: SwapCalendarEventItem) => void;
}

function eventStyleGetter(event: SwapCalendarEventItem) {
  const styles: Record<
    string,
    { backgroundColor: string; color: string; borderColor: string }
  > = {
    normal: {
      backgroundColor: "#dbeafe",
      color: "#1e3a8a",
      borderColor: "#93c5fd",
    },
    open: {
      backgroundColor: "#ffedd5",
      color: "#9a3412",
      borderColor: "#fdba74",
    },
    sent: {
      backgroundColor: "#ede9fe",
      color: "#5b21b6",
      borderColor: "#c4b5fd",
    },
    received: {
      backgroundColor: "#fef9c3",
      color: "#854d0e",
      borderColor: "#fde047",
    },
    approved: {
      backgroundColor: "#dcfce7",
      color: "#166534",
      borderColor: "#86efac",
    },
    rejected: {
      backgroundColor: "#f1f5f9",
      color: "#334155",
      borderColor: "#cbd5e1",
    },
    violation: {
      backgroundColor: "#ffe4e6",
      color: "#9f1239",
      borderColor: "#fda4af",
    },
    leave: {
      backgroundColor: "#ecfeff",
      color: "#155e75",
      borderColor: "#67e8f9",
    },
  };

  return {
    style: {
      ...styles[event.status],
      borderRadius: "6px",
      border: `1px solid ${styles[event.status].borderColor}`,
    },
  };
}

export function SwapCalendar({
  events,
  view,
  date,
  onViewChange,
  onNavigate,
  onSelectEvent,
}: SwapCalendarProps) {
  const messages = {
    allDay: "Todo o dia",
    previous: "Anterior",
    next: "Seguinte",
    today: "Hoje",
    month: "Mes",
    week: "Semana",
    day: "Dia",
    agenda: "Agenda",
    date: "Data",
    time: "Hora",
    event: "Evento",
    noEventsInRange: "Sem turnos neste intervalo.",
    showMore: (total: number) => `+${total} mais`,
  };

  return (
    <div className="swap-enterprise-calendar h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_30px_-22px_rgba(30,64,175,0.55)]">
      <Calendar
        localizer={localizer}
        culture="pt-PT"
        messages={messages}
        events={events}
        startAccessor="start"
        endAccessor="end"
        allDayAccessor="allDay"
        view={view}
        date={date}
        views={["month", "week", "day"]}
        toolbar
        popup
        eventPropGetter={(event) =>
          eventStyleGetter(event as SwapCalendarEventItem)
        }
        onView={(nextView) => onViewChange(nextView)}
        onNavigate={(nextDate) => onNavigate(nextDate)}
        onSelectEvent={(event) => onSelectEvent(event as SwapCalendarEventItem)}
        components={{
          event: ({ event }) => (
            <SwapCalendarEvent event={event as SwapCalendarEventItem} />
          ),
        }}
      />
    </div>
  );
}
