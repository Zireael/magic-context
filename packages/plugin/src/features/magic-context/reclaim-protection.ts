import {
    DEFAULT_PROTECTED_TOOLS,
    mergeProtectedTools,
    normalizeProtectedToolName,
} from "../../shared/protected-tools-policy";

export {
    DEFAULT_PROTECTED_TOOLS,
    mergeProtectedTools,
    normalizeProtectedToolName,
} from "../../shared/protected-tools-policy";
/** Default exemplar count, retained for fixtures that describe shipped policy. */
export const CTX_REDUCE_KEEP = DEFAULT_PROTECTED_TOOLS.ctx_reduce;

/** Snapshot once per selection, before any lane mutates status. Inactive results
 * never occupy the window, and tag ordinals make rotation deterministic. */
export function protectedToolTagNumbers(
    tags: readonly { tagNumber: number; toolName: string | null; status?: string; type?: string }[],
    protectedTools?: Readonly<Record<string, number>>,
): Set<number> {
    const counts = mergeProtectedTools(protectedTools);
    const protectedTags = new Set<number>();
    for (const tag of [...tags].sort((left, right) => right.tagNumber - left.tagNumber)) {
        if (tag.status !== undefined && tag.status !== "active") continue;
        if (tag.type !== undefined && tag.type !== "tool") continue;
        const name = normalizeProtectedToolName(tag.toolName);
        if (!Object.hasOwn(counts, name) || counts[name] <= 0) continue;
        protectedTags.add(tag.tagNumber);
        counts[name] -= 1;
    }
    return protectedTags;
}
