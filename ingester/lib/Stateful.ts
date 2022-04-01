export function isStateful(obj: any): obj is Stateful {
	return typeof(obj.isEnabled) === 'boolean';
}

export interface Stateful {
	readonly isEnabled: boolean;

	enable(): Promise<void>;

	disable(): Promise<void>;
}
