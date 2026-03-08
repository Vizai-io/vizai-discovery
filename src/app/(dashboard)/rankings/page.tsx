
"use client";

import { useState, useEffect } from "react";
import { RankingService } from "@/lib/services/ranking-service";
import { RankingSnapshot, RankingEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Globe, 
  Building2, 
  Loader2,
  Medal,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export default function RankingsPage() {
  const [snapshot, setSnapshot] = useState<RankingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [industry, setIndustry] = useState("Third Party Logistics (3PL)");
  const [region, setRegion] = useState("Western Europe");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function loadRankings() {
      setLoading(true);
      const data = await RankingService.getLatestRankings(industry, region);
      setSnapshot(data);
      setLoading(false);
    }
    loadRankings();
  }, [industry, region]);

  const filteredEntries = snapshot?.entries.filter(entry => 
    entry.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-bold text-primary flex items-center gap-2">
            <Trophy className="w-8 h-8 text-accent" />
            Industry Leaderboards
          </h2>
          <p className="text-muted-foreground mt-1">
            Real-time AI Visibility rankings across global markets.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border shadow-sm">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger className="border-none bg-transparent focus:ring-0 w-[200px] h-8 p-0 font-medium">
                <SelectValue placeholder="Industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Third Party Logistics (3PL)">3PL Logistics</SelectItem>
                <SelectItem value="SaaS Logistics">SaaS Logistics</SelectItem>
                <SelectItem value="Retail & E-commerce">Retail & E-comm</SelectItem>
                <SelectItem value="Financial Services">FinTech</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border shadow-sm">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="border-none bg-transparent focus:ring-0 w-[150px] h-8 p-0 font-medium">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Western Europe">Western Europe</SelectItem>
                <SelectItem value="North America">North America</SelectItem>
                <SelectItem value="Asia Pacific">Asia Pacific</SelectItem>
                <SelectItem value="Global">Global</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Rankings Table */}
      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold text-primary">Top Performers</CardTitle>
            <CardDescription>
              Based on the latest aggregated AI scan scores for <strong>{industry}</strong> in <strong>{region}</strong>.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search companies..." 
              className="pl-9 h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="font-medium">Calculating visibility snapshots...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[80px] text-center font-bold uppercase text-[10px]">Rank</TableHead>
                    <TableHead className="font-bold uppercase text-[10px]">Company Name</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] text-center">Score</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] text-center">Trend</TableHead>
                    <TableHead className="font-bold uppercase text-[10px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.length > 0 ? (
                    filteredEntries.map((entry) => (
                      <TableRow key={entry.companyName} className="hover:bg-muted/20 transition-colors group">
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            {entry.rank <= 3 ? (
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-white font-bold",
                                entry.rank === 1 ? "bg-yellow-500" : entry.rank === 2 ? "bg-slate-400" : "bg-orange-400"
                              )}>
                                {entry.rank}
                              </div>
                            ) : (
                              <span className="text-sm font-bold text-muted-foreground">{entry.rank}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-primary group-hover:text-accent transition-colors">
                            {entry.companyName}
                            {entry.companyName === "Acme Logistics" && (
                              <Badge className="ml-2 bg-primary/10 text-primary border-none text-[8px] uppercase">You</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="text-lg font-bold text-primary">
                            {entry.score.toFixed(1)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            {entry.change > 0 ? (
                              <div className="flex items-center gap-1 text-green-600 font-bold text-xs bg-green-50 px-2 py-1 rounded-full border border-green-100">
                                <TrendingUp className="w-3 h-3" />
                                +{entry.change}
                              </div>
                            ) : entry.change < 0 ? (
                              <div className="flex items-center gap-1 text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded-full border border-red-100">
                                <TrendingDown className="w-3 h-3" />
                                {entry.change}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-muted-foreground font-bold text-xs bg-muted/50 px-2 py-1 rounded-full border border-transparent">
                                <Minus className="w-3 h-3" />
                                0
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                           <div className="flex items-center gap-2">
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                entry.score > 80 ? "bg-green-500" : entry.score > 60 ? "bg-yellow-500" : "bg-red-500"
                              )} />
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-tighter">
                                {entry.score > 80 ? "AI Leader" : entry.score > 60 ? "Stable" : "At Risk"}
                              </span>
                           </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic">
                        No companies found matching your search.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Insights */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm bg-accent/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-primary uppercase tracking-widest">Market Leader</CardTitle>
          </CardHeader>
          <CardContent>
             {!loading && snapshot?.entries[0] && (
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-primary">
                    <Medal className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-bold text-primary">{snapshot.entries[0].companyName}</div>
                    <div className="text-xs text-muted-foreground">Highest AI coverage in {region}</div>
                  </div>
               </div>
             )}
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-primary uppercase tracking-widest">Global Avg. Score</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-3xl font-bold text-primary">68.4</div>
             <p className="text-xs text-muted-foreground mt-1">Across all tracked regions</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-primary uppercase tracking-widest">Next Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-3xl font-bold text-primary">02:14:45</div>
             <p className="text-xs text-muted-foreground mt-1">Time remaining for recalculation</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
