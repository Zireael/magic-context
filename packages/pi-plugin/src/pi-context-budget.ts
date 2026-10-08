/**
 * Oh My Pi (OMP) 18.8.6 stops waiting after 30s without cancelling the context handler.
 * Finish by 25s (5s host margin); stop normal work at 21s (4s for replay/refusal).
 * Writer admission retains the shared helper's 16.5s ceiling but reserves 2s of mandatory work:
 * the measured non-wait maximum was 0.822s, so this reserve is over twice that.
 * Plain Pi has no handler deadline; these internal deadlines bound our work there too.
 * These are initial engineering budgets, not Windows latency percentiles.
 */
export const PI_CONTEXT_BUDGET = {
	outcomeMs: 25_000,
	workMs: 21_000,
	writerMs: 16_500,
	completionReserveMs: 2_000,
	searchMs: 3_000,
} as const;

export class PiContextDeadlineError extends Error {}

/** One clock shared by preparation, admission, normal work and recovery. */
export class PiContextBudget {
	sideTurn = false;
	stage = "entry";
	recovery = "not attempted";
	abandoned = false;
	assertOwner: () => void = () => {};
	constructor(
		readonly startedAt = performance.now(),
		private readonly now = () => performance.now(),
	) {}
	elapsed(): number {
		return this.now() - this.startedAt;
	}
	remainingWork(): number {
		return Math.max(0, PI_CONTEXT_BUDGET.workMs - this.elapsed());
	}
	writerAllowance(): number {
		return Math.max(
			0,
			Math.min(
				PI_CONTEXT_BUDGET.writerMs,
				this.remainingWork() - PI_CONTEXT_BUDGET.completionReserveMs,
			),
		);
	}
	assertOutcome = (): void => {
		this.assertOwner();
		if (this.abandoned || this.elapsed() >= PI_CONTEXT_BUDGET.outcomeMs)
			throw new PiContextDeadlineError(this.diagnostic());
	};
	assert = (): void => {
		this.assertOutcome();
		if (this.elapsed() >= PI_CONTEXT_BUDGET.workMs)
			throw new PiContextDeadlineError(this.diagnostic());
	};
	diagnostic(): string {
		return `stage=${this.stage} elapsed=${Math.round(this.elapsed())}ms recovery=${this.recovery}`;
	}
	wait = async <T>(pending: Promise<T>): Promise<T> => {
		this.assert();
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				pending,
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new PiContextDeadlineError(this.diagnostic())),
						this.remainingWork(),
					);
				}),
			]);
		} finally {
			clearTimeout(timer);
			this.assert();
		}
	};
}
