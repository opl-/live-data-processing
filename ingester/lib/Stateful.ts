export function isStateful(obj: any): obj is Stateful {
	return typeof(obj.isEnabled) === 'boolean';
}

export interface Stateful {
	get isEnabled(): boolean;

	enable(): Promise<void>;

	disable(): Promise<void>;
}
