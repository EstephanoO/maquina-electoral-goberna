/**
 * GOBERNA — UI Components Index
 * Re-export all UI components.
 */

// ── Custom components ────────────────────────────────────────
export { Spinner } from "./spinner";
export { StatusBadge } from "./status-badge";
export { Avatar } from "./avatar";
export { SlideOver } from "./slide-over";
export { EmptyState, CheckCircleIcon, UsersIcon } from "./empty-state";
export { Card, StatCard } from "./card";
export { Button, buttonVariants } from "./button";
export type { ButtonProps } from "./button";
export { TextInput, SelectInput, TextAreaInput, ColorPicker, FieldWrapper } from "./form-field";
export { PhotoUpload } from "./photo-upload";
export { Tabs } from "./tabs";
export { Alert } from "./alert";
export { PageHeader } from "./page-header";
export { Skeleton, SkeletonCard, SkeletonTable, SkeletonList } from "./skeleton";

// ── shadcn/ui components ────────────────────────────────────
export {
  Dialog, DialogClose, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogOverlay, DialogPortal,
  DialogTitle, DialogTrigger,
} from "./dialog";
export {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuShortcut, DropdownMenuTrigger, DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuPortal,
} from "./dropdown-menu";
export {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "./tooltip";
export { Badge, badgeVariants } from "./badge";
export {
  Table, TableBody, TableCaption, TableCell, TableFooter,
  TableHead, TableHeader, TableRow,
} from "./table";
export { Toaster } from "./sonner";

// ── Legacy icon aliases (prefer lucide-react directly) ──────
export {
  IconUsers,
  IconUserPlus,
  IconCheck,
  IconX,
  IconChevronDown,
  IconChevronRight,
  IconPhone,
  IconMapPin,
  IconKey,
  IconShield,
  IconTarget,
  IconBarChart,
  IconBriefcase,
  IconFlag,
  IconMap,
  IconClock,
  IconTrash,
  IconStar,
  IconWhatsApp,
  IconCrown,
  IconAward,
  IconCompass,
  IconMonitor,
  IconLink,
  IconCopy,
} from "./icons";
