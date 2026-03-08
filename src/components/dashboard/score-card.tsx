import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, LucideIcon, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ScoreCardProps {
  title: string;
  score: number;
  trend?: number;
  icon: LucideIcon;
  description?: string;
  tooltip?: string;
  className?: string;
}

export function ScoreCard({ title, score, trend, icon: Icon, description, tooltip, className }: ScoreCardProps) {
  const isPositive = trend && trend > 0;

  return (
    <Card className={cn("overflow-hidden border-none shadow-sm bg-white hover:shadow-md transition-all group", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className={cn(
            "text-[10px] font-bold uppercase tracking-widest",
            className?.includes('bg-primary') ? "text-white/70" : "text-muted-foreground"
          )}>
            {title}
          </CardTitle>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className={cn(
                    "w-3 h-3 opacity-50 hover:opacity-100 transition-opacity",
                    className?.includes('bg-primary') ? "text-white" : "text-primary"
                  )} />
                </TooltipTrigger>
                <TooltipContent className="max-w-[200px] text-[10px] leading-relaxed">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className={cn(
          "p-2 rounded-lg transition-colors",
          className?.includes('bg-primary') ? "bg-white/10 text-white" : "bg-primary/5 text-primary group-hover:bg-primary group-hover:text-white"
        )}>
            <Icon className="w-4 h-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <div className={cn(
            "text-3xl font-headline font-bold",
            className?.includes('bg-primary') ? "text-white" : "text-primary"
          )}>
            {score.toFixed(1)}
          </div>
          {trend !== undefined && (
            <div className={cn(
              "text-[10px] font-bold flex items-center mb-1.5 px-1.5 py-0.5 rounded-full",
              isPositive 
                ? (className?.includes('bg-primary') ? "bg-white/20 text-white" : "bg-green-50 text-green-600") 
                : (className?.includes('bg-primary') ? "bg-white/20 text-white" : "bg-red-50 text-red-600")
            )}>
              {isPositive ? <ArrowUpRight className="w-2.5 h-2.5 mr-0.5" /> : <ArrowDownRight className="w-2.5 h-2.5 mr-0.5" />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        {description && (
          <p className={cn(
            "text-[10px] mt-2 font-medium",
            className?.includes('bg-primary') ? "text-white/60" : "text-muted-foreground"
          )}>
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
