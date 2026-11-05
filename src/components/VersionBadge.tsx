import * as React from "react";
import { LifecycleStatus } from "../models/types";
import { Pill, Tone } from "./ui";

interface VersionBadgeProps {
  status: LifecycleStatus;
}

interface BadgeConfig {
  tone: Tone;
  label: string;
  tooltip: string;
}

/** Lifecycle status pill. The text label always carries the meaning; tone only reinforces it. */
export function getBadgeConfig(status: LifecycleStatus): BadgeConfig {
  switch (status) {
    case LifecycleStatus.EndOfLife:
      return {
        tone: "danger",
        label: "END OF LIFE",
        tooltip: "This framework version is no longer supported and should be upgraded immediately",
      };
    case LifecycleStatus.ExpiringSoon:
      return {
        tone: "warn",
        label: "EXPIRING SOON",
        tooltip: "Support for this framework version ends within 6 months",
      };
    case LifecycleStatus.Supported:
      return {
        tone: "success",
        label: "SUPPORTED",
        tooltip: "This framework version is currently supported",
      };
    case LifecycleStatus.Current:
      return {
        tone: "info",
        label: "CURRENT",
        tooltip: "This is the latest available version",
      };
    case LifecycleStatus.Preview:
      return {
        tone: "accent",
        label: "PREVIEW",
        tooltip: "This is a preview/pre-release version",
      };
    default:
      return {
        tone: "neutral",
        label: "UNKNOWN",
        tooltip: "Unable to determine lifecycle status",
      };
  }
}

export function VersionBadge({ status }: VersionBadgeProps) {
  const config = getBadgeConfig(status);
  return (
    <Pill tone={config.tone} title={config.tooltip}>
      {config.label}
    </Pill>
  );
}
