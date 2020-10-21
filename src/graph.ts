/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import deepEqual from 'deep-equal';

export interface GraphReader {
    get_value(layer: string, file: string): unknown;
}

type Rule = (reader: GraphReader, file: string) => unknown

type Input = (file: string) => unknown

type LayerKind = string

type LayerSpec = {kind: LayerKind, fn: Input | Rule}

export type GraphSpec = {[layer: string]: LayerSpec}

export const INPUT : LayerKind = "INPUT";
export const RULE : LayerKind = "RULE";

type Time = number

type NodeId = {
    layer: string;
    file: string;
}

interface Node {
    value: unknown;
    change_at: Time;
    updated_at: Time;
}
type InputNode = Node
type RuleNode = Node & {
    dependencies: NodeId[];
    input_dependencies: NodeId[];
}

type InputLayer = {
    nodes: Map<string, InputNode>; // string is a file
    rule: Input
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
            const layerSpec = spec[layer];
            if (layerSpec.kind === INPUT) {
                this.input_layers.set(layer, {rule : <Input> layerSpec.fn, nodes: new Map<string, InputNode>()});
            } else {
                this.rule_layers.set(layer, {rule: <Rule> layerSpec.fn, nodes: new Map<string, RuleNode>()});
            }
        }
    }

    private set_input(layer: string, file: string): void {
        const {nodes, rule} = this.input_layers.get(layer)!;
        if (!nodes.has(file)) {
            nodes.set(file, {
                value: rule(file),
                change_at: this.now,
                updated_at: this.now,
            });
        }
        const node = nodes.get(file)!;
        const value = rule(file);
        node.updated_at = this.now;
        if (deepEqual(node.value, value)) {
            return;
        }
        node.value = value;
        node.change_at = this.now;
    }

    get_value(layer: string, file: string): unknown {
        this.now += 1;
        return this.update_node(layer, file).value;
    }

    private update_node(layer: string, file: string): Node {
        if (this.input_layers.has(layer)) {
            const {nodes} = this.input_layers.get(layer)!;
            if (!nodes.has(file) || nodes.get(file)!.updated_at < this.now)
                this.set_input(layer, file)
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
                input_dependencies: this.get_input_dependencies(reader.trace),
                updated_at: this.now,
            };
            nodes.set(file, node);
            return node;
        }

        const node = nodes.get(file)!;
        if (node.updated_at === this.now) {
            return node;
        }

        let input_dependencies_changed = false;
        for (const dep of node.input_dependencies) {
            if (this.update_node(dep.layer, dep.file).change_at > node.updated_at) {
                input_dependencies_changed = true;
                break;
            }
        }

        if (!input_dependencies_changed) {
            node.updated_at = this.now;
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
        node.input_dependencies = this.get_input_dependencies(reader.trace);
        node.updated_at = this.now;
        return node;
    }

    private get_input_dependencies(dependencies: NodeId[]) : NodeId[] {
        
        const input_dependency_map : {[layer: string] : {[file: string]: {}}} = {};
        for(const dep of dependencies) {
            if(this.input_layers.has(dep.layer)) {
                if (input_dependency_map[dep.layer] === undefined) input_dependency_map[dep.layer] = {};
                input_dependency_map[dep.layer][dep.file] = {};
            } else {
                for(const input_dep of this.rule_layers.get(dep.layer)!.nodes.get(dep.file)!.input_dependencies) {
                    if (input_dependency_map[input_dep.layer] === undefined) input_dependency_map[input_dep.layer] = {};
                    input_dependency_map[input_dep.layer][input_dep.file] = {};
                }
            }
        }

        const ret : NodeId[] = [];
        for(const layer in input_dependency_map)
            for (const file in input_dependency_map[layer])
                ret.push({layer, file});
        return ret;
    }

    private get_traced_reader(): GraphReader & {trace: NodeId[]} {
        const trace: NodeId[] = [];
        const get_value = (layer: string, file: string): unknown => {
            trace.push({layer, file});
            return this.update_node(layer, file).value;
        };

        return {get_value, trace};
    }
}
