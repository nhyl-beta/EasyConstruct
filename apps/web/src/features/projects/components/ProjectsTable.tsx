import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Project } from "../types/project.types";
import { STATUS_TONE_CLASS, RISK_CLASS } from "../constants/project-status";
import { formatContractValue, formatDue } from "../lib/project-format";
import { StageProgressStrip } from "./StageProgressStrip";

export const ProjectsTable: React.FC<{ projects: Project[] }> = ({ projects }) => {
  const navigate = useNavigate();

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-overline font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2.5">Project</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Stage</th>
                <th className="px-3 py-2.5">Progress</th>
                <th className="px-3 py-2.5">Budget</th>
                <th className="px-3 py-2.5">Workforce</th>
                <th className="px-3 py-2.5">Due</th>
                <th className="px-3 py-2.5">Risk</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.code}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/projects/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium leading-tight hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.deliveryType === "Design" && (
                      <Badge variant="outline" className="ml-2 rounded-md border-transparent bg-ai-soft px-1.5 text-overline font-medium text-ai">
                        Design
                      </Badge>
                    )}
                    <div className="text-xs text-muted-foreground">{p.code} · {p.client}</div>
                    {p.contractValue != null && (
                      <div className="text-xs text-muted-foreground">{formatContractValue(p.contractValue, p.currency)} contract</div>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-overline font-medium ${STATUS_TONE_CLASS[p.statusTone]}`}>{p.status}</Badge>
                  </td>
                  <td className="px-3 py-3.5">
                    <StageProgressStrip status={p.status} statusTone={p.statusTone} deliveryType={p.deliveryType} />
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <Progress value={p.progress} className="h-1.5 w-24" />
                      <span className="w-9 text-xs tabular-nums text-muted-foreground">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className={p.budget > 100 ? "text-sm font-medium tabular-nums text-destructive-strong" : "text-sm tabular-nums"}>{p.budget}%</span>
                  </td>
                  <td className="px-3 py-3.5 text-sm tabular-nums">{p.workforce}</td>
                  <td className="px-3 py-3.5 text-sm tabular-nums text-muted-foreground">{formatDue(p.due)}</td>
                  <td className="px-3 py-3.5">
                    <span className={`text-xs font-medium ${RISK_CLASS[p.risk]}`}>{p.risk}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/projects/${p.id}`}>Open <ChevronRight className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
