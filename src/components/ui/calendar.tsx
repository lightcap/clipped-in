"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
  isToday,
} from "date-fns";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type CalendarProps = {
  mode?: "single" | "multiple" | "range";
  selected?: Date | Date[] | { from?: Date; to?: Date };
  onSelect?: (date: Date | undefined) => void;
  className?: string;
  disabled?: (date: Date) => boolean;
  initialFocus?: boolean;
};

function Calendar({
  className,
  selected,
  onSelect,
  disabled,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(
    selected instanceof Date ? selected : new Date()
  );

  const selectedDate = selected instanceof Date ? selected : undefined;

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const weeks: Date[][] = [];
  let days: Date[] = [];
  let day = startDate;

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      days.push(day);
      day = addDays(day, 1);
    }
    weeks.push(days);
    days = [];
  }

  const handlePreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handleDateClick = (date: Date) => {
    if (disabled && disabled(date)) return;
    onSelect?.(date);
  };

  return (
    <div className={cn("p-3", className)}>
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handlePreviousMonth}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handleNextMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-muted-foreground font-medium py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.map((week, weekIndex) =>
          week.map((date, dateIndex) => {
            const isSelected = selectedDate && isSameDay(date, selectedDate);
            const isCurrentMonth = isSameMonth(date, currentMonth);
            const isTodayDate = isToday(date);
            const isDisabled = disabled ? disabled(date) : false;

            return (
              <button
                key={`${weekIndex}-${dateIndex}`}
                onClick={() => handleDateClick(date)}
                disabled={isDisabled}
                className={cn(
                  "h-8 w-8 text-sm rounded-md transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  !isCurrentMonth && "text-muted-foreground opacity-50",
                  isSelected &&
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  isTodayDate && !isSelected && "bg-accent text-accent-foreground",
                  isDisabled && "pointer-events-none opacity-50"
                )}
              >
                {format(date, "d")}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
