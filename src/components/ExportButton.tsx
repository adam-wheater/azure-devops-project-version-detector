import * as React from "react";
import { DetectedProject } from "../models/types";
import { exportToCsv, downloadCsv } from "../utils/csvExport";
import { formatLocalIsoDate } from "../utils/dates";
import { Button, IconDownload } from "./ui";

interface ExportButtonProps {
  filteredProjects: DetectedProject[];
}

export function ExportButton({ filteredProjects }: ExportButtonProps) {
  const handleExport = () => {
    const csv = exportToCsv(filteredProjects);
    downloadCsv(csv, `version-report-${formatLocalIsoDate()}.csv`);
  };

  return (
    <Button
      icon={<IconDownload />}
      onClick={handleExport}
      title="Export the projects currently shown to CSV"
    >
      Export CSV
    </Button>
  );
}
