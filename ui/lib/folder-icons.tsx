/* eslint-disable react-refresh/only-export-components -- file exports constants and lookup for folder icons */
import {
  Folder,
  FolderOpen,
  BookOpen,
  Dumbbell,
  Code2,
  FileText,
  Home,
  Briefcase,
  MessageSquare,
  Sparkles,
  Target,
  GraduationCap,
  Palette,
  Music,
  Camera,
  UtensilsCrossed,
  Plane,
  Heart,
  ShoppingBag,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export const FOLDER_ICON_NAMES = [
  "Folder",
  "FolderOpen",
  "BookOpen",
  "Dumbbell",
  "Code2",
  "FileText",
  "Home",
  "Briefcase",
  "MessageSquare",
  "Sparkles",
  "Target",
  "GraduationCap",
  "Palette",
  "Music",
  "Camera",
  "UtensilsCrossed",
  "Plane",
  "Heart",
  "ShoppingBag",
  "Wallet",
] as const;

export type FolderIconName = (typeof FOLDER_ICON_NAMES)[number];

const ICON_MAP: Record<string, LucideIcon> = {
  Folder,
  FolderOpen,
  BookOpen,
  Dumbbell,
  Code2,
  FileText,
  Home,
  Briefcase,
  MessageSquare,
  Sparkles,
  Target,
  GraduationCap,
  Palette,
  Music,
  Camera,
  UtensilsCrossed,
  Plane,
  Heart,
  ShoppingBag,
  Wallet,
};

export const DEFAULT_FOLDER_ICON: FolderIconName = "Folder";

export function getFolderIconComponent(name: string): LucideIcon {
  return ICON_MAP[name] ?? Folder;
}

interface FolderIconRenderProps {
  name: string;
  color?: string;
  size?: number;
  className?: string;
}

export function FolderIconRender({ name, color, size = 14, className }: FolderIconRenderProps) {
  const Icon = ICON_MAP[name] ?? Folder;
  return <Icon size={size} color={color} className={className} />;
}

export const FOLDER_COLORS = [
  "#6b7280", // neutral
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
] as const;
