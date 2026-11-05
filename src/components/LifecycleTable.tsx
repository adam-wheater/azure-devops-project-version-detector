import * as React from "react";
import { getAllLifecycleData } from "../lifecycle/DotNetLifecycle";
import { FrameworkLifecycle } from "../models/types";
import { VersionBadge } from "./VersionBadge";
import { Card, Pill } from "./ui";

interface LifecycleTableProps {
  resolvedLifecycleData?: FrameworkLifecycle[] | null;
}

export function LtsPill({ isLts }: { isLts: boolean }) {
  return isLts ? (
    <Pill tone="success" title="Long-term support release">
      LTS
    </Pill>
  ) : (
    <Pill tone="neutral" title="Standard-term support release">
      STS
    </Pill>
  );
}

export function LifecycleTable({ resolvedLifecycleData }: LifecycleTableProps) {
  const data = React.useMemo(
    () => getAllLifecycleData(resolvedLifecycleData),
    [resolvedLifecycleData]
  );

  const grouped = React.useMemo(() => {
    const groups: Record<string, typeof data> = {};
    for (const entry of data) {
      const key = entry.framework;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }
    return groups;
  }, [data]);

  return (
    <div>
      <p className="ax-muted ax-section">
        Reference table showing .NET version lifecycle data. Dates are based on Microsoft&apos;s
        official support policies. .NET Framework versions follow the OS lifecycle where applicable.
      </p>

      {Object.entries(grouped).map(([framework, entries]) => (
        <Card key={framework} title={framework} flush>
          <div className="ax-table-wrap">
            <table className="ax-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>LTS</th>
                  <th>Release Date</th>
                  <th>End of Life</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={`${entry.framework}|${entry.version}`}>
                    <td>
                      <strong>{entry.displayName}</strong>
                    </td>
                    <td>
                      <LtsPill isLts={entry.isLts} />
                    </td>
                    <td className="ax-muted">{entry.releaseDate}</td>
                    <td className="ax-muted">{entry.endOfLifeDate || "OS lifecycle"}</td>
                    <td>
                      <VersionBadge status={entry.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
