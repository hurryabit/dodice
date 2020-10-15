/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import deepEqual from 'deep-equal';

export interface GraphReader {
    get_value(layer: string, key: string): unknown;
}

type Rule = (reader: GraphReader, key: string) => unknown

export type GraphSpec = {[layer: string]: Rule | null}

export class Graph implements GraphReader {
    constructor(spec: GraphSpec) {
        // TODO.
    }

    get_value(layer: string, key: string): unknown {
        // TODO.
        return undefined;
    }

    set_input(layer_name: string, key: string, value: unknown): void {
        // TODO.
    }
}
