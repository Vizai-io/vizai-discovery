import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, LucideIcon } from "lucide-react";

interface ScoreCardProps {
  title: string;
  score: number;
  trend?: number;
  icon: LucideIcon;
  description?: string;
  className?: string;
}

export function ScoreCard({ title, score, trend, icon: Icon, description, className }: ScoreCardProps) {
  const isPositive = trend && trend > 0;

  return (
    <Card className={cn("overflow-hidden border-none shadow-sm bg-white", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
        <div className="p-2 rounded-lg bg-primary/5 text-primary">
            <Icon className="w-4 h-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <div className="text-3xl font-bold text-primary">{score.toFixed(1)}</div>
          {trend !== undefined && (
            <div className={cn(
              "text-xs font-bold flex items-center mb-1",
              isPositive ? "text-green-600" : "text-red-600"
            )}>
              {isPositive ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-2">{description}</p>}
      </CardContent>
    </Card>
  );
}
