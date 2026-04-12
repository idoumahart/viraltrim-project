import * as React from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import { DayPicker, DayFlag, SelectionState, UI } from "react-day-picker";
import "react-day-picker/style.css";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        [UI.Root]: "w-fit",
        [UI.Months]: "flex flex-col gap-4 sm:flex-row sm:gap-4",
        [UI.Month]: "flex flex-col gap-4",
        [UI.MonthCaption]: "flex justify-center pt-1 relative items-center min-h-8",
        [UI.CaptionLabel]: "text-sm font-medium",
        [UI.Nav]: "flex items-center gap-1",
        [UI.PreviousMonthButton]: cn(
          buttonVariants({ variant: "outline" }),
          "absolute left-1 h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100"
        ),
        [UI.NextMonthButton]: cn(
          buttonVariants({ variant: "outline" }),
          "absolute right-1 h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100"
        ),
        [UI.MonthGrid]: "w-full border-collapse",
        [UI.Weekdays]: "flex",
        [UI.Weekday]:
          "text-muted-foreground w-9 font-normal text-[0.8rem] flex items-center justify-center",
        [UI.Week]: "flex w-full mt-2",
        [UI.Day]: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
        [UI.DayButton]: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        [SelectionState.selected]:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md",
        [DayFlag.today]: "bg-accent text-accent-foreground rounded-md",
        [DayFlag.outside]: "text-muted-foreground opacity-50",
        [DayFlag.disabled]: "text-muted-foreground opacity-50",
        [DayFlag.hidden]: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClass }) => {
          const cls = cn("h-4 w-4", iconClass);
          if (orientation === "left") return <ChevronLeft className={cls} />;
          if (orientation === "right") return <ChevronRight className={cls} />;
          if (orientation === "up") return <ChevronUp className={cls} />;
          return <ChevronDown className={cls} />;
        },
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
