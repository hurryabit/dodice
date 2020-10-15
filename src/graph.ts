/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import deepEqual from 'deep-equal';

export interface GraphReader {
    get_value(layer: string, file: string): unknown;
}

type Rule = (reader: GraphReader, file: string) => unknown

export type GraphSpec = {[layer: string]: Rule | null}

type Time = number

type NodeId = {
    layer: string;
    file: string;
}

interface Node {
    value: unknown;
    change_at: Time;
}
type InputNode = Node
type RuleNode = Node & {
    dependencies: NodeId[];
    updated_at: Time;
}

type InputLayer = {
    nodes: Map<string, InputNode>; // string is a file
}
type RuleLayer = {
    nodes: Map<string, RuleNode>; // string is a file
    rule: Rule;
}

export class Graph implements GraphReader {
    private now: Time;
    private input_layers: Map<string, InputLayer>; // string is layer name
    private rule_layers: Map<string, RuleLayer>; // string is layer name

    constructor(spec: GraphSpec) {
        this.now = 0;
        this.input_layers = new Map<string, InputLayer>();
        this.rule_layers = new Map<string, RuleLayer>();
        for (const layer in spec) {
            const rule = spec[layer];
            if (rule === null) {
                this.input_layers.set(layer, {nodes: new Map<string, InputNode>()});
            } else {
                this.rule_layers.set(layer, {rule, nodes: new Map<string, RuleNode>()});
            }
        }
    }

    set_input(layer: string, file: string, value: unknown): void {
        const {nodes} = this.input_layers.get(layer)!;
        if (!nodes.has(file)) {
            this.now += 1;
            nodes.set(file, {
                value,
                change_at: this.now,
            });
        }
        const node = nodes.get(file)!;
        if (deepEqual(node.value, value)) {
            return;
        }
        this.now += 1;
        node.value = value;
        node.change_at = this.now;
    }

    get_value(layer: string, file: string): unknown {
        return this.update_node(layer, file).value;
    }

    private update_node(layer: string, file: string): Node {
        if (this.input_layers.has(layer)) {
            const {nodes} = this.input_layers.get(layer)!;
            if (!nodes.has(file)) {
                throw Error(`Accessing unset input node ${layer}(${file})`);
            }
            return nodes.get(file)!;
        }

        const {rule, nodes} = this.rule_layers.get(layer)!;
        if (!nodes.has(file)) {
            const reader = this.get_traced_reader();
            const value = rule(reader, file);
            const node: RuleNode = {
                value,
                change_at: this.now,
                dependencies: reader.trace,
                updated_at: this.now,
            };
            nodes.set(file, node);
            return node;
        }

        const node = nodes.get(file)!;
        if (node.updated_at === this.now) {
            return node;
        }

        let dependencies_changed = false;
        for (const dep of node.dependencies) {
            if (this.update_node(dep.layer, dep.file).change_at > node.updated_at) {
                dependencies_changed = true;
                break;
            }
        }

        if (!dependencies_changed) {
            node.updated_at = this.now;
            return node;
        }

        const reader = this.get_traced_reader();
        const value = rule(reader, file);
        if (!deepEqual(node.value, value)) {
            node.value = value;
            node.change_at = this.now;
        }
        node.dependencies = reader.trace;
        node.updated_at = this.now;
        return node;
    }

    private get_traced_reader(): GraphReader & {trace: NodeId[]} {
        const trace: NodeId[] = [];
        const get_value = (layer: string, file: string): unknown => {
            trace.push({layer, file});
            return this.get_value(layer, file);
        };
        return {get_value, trace};
    }
}
