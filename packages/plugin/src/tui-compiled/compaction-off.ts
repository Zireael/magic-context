// The compaction-off sidebar semantics moved into the shared host-neutral
// sidebar model (IMPL-008 / shared/sidebar-view.ts). This module stays as a
// stable import path for existing consumers (v2 fallback projection, tests).
export {
    type CompactionOffSidebarRow,
    compactionOffSidebarRows,
    nativeCompactionContextLabel,
} from "../shared/sidebar-view";
