import {Graph, GraphReader, GraphSpec} from '../src/graph';

const FILE_CONTENTS = "FILE_CONTENTS"; // string
const EXTRACT_LIST = "EXTRACT_LIST"; // string[]
const EXTRACT_NUMBER = "EXTRACT_NUMBER"; // number
const AGGREGATE = "AGGREGATE"; // number

const spec: GraphSpec = {
    [FILE_CONTENTS]: null,
    [EXTRACT_LIST]: (g, file): string[] => {
        const file_contents = g.get_value(FILE_CONTENTS, file) as string;
        return file_contents.split(/\r?\n/).map(line => line.trim()).filter(line => line != "")
    },
    [EXTRACT_NUMBER]: (g, file): number => {
        const file_contents = g.get_value(FILE_CONTENTS, file) as string;
        return Number.parseInt(file_contents.trim());
    },
    [AGGREGATE]: (g, file): number => {
        const list = g.get_value(EXTRACT_LIST, file) as string[];
        const numbers = list.map(file => g.get_value(EXTRACT_NUMBER, file) as number);
        return numbers.reduce((x, y) => x + y, 0);
    },
};

type Query = [string, string]

class TracedGraph implements GraphReader {
    trace: Query[];
    private graph: Graph;

    constructor(spec: GraphSpec) {
        this.trace = [];

        const traced_spec: GraphSpec = {};
        for (const layer in spec) {
            const rule = spec[layer];
            if (rule === null) {
                traced_spec[layer] = null;
            } else {
                traced_spec[layer] = (g: GraphReader, file: string) => {
                    this.trace.push([layer, file]);
                    return rule(g, file);
                }
            }
        }
        this.graph = new Graph(traced_spec);
    }

    get_value(layer: string, file: string): unknown {
        return this.graph.get_value(layer, file);
    }

    set_input(layer: string, file:string, value: unknown): void {
        this.graph.set_input(layer, file, value);
    }
}


describe("inputs", function () {
    test("reading before setting throws", function () {
        const g = new TracedGraph(spec);

        expect(() => g.get_value(FILE_CONTENTS, "x.dat")).toThrow(/Accessing unset input node.*FILE_CONTENTS.*x.dat/);
    });

    test("first setting is persisted", function () {
        const g = new TracedGraph(spec);

        g.set_input(FILE_CONTENTS, "x.dat", "1");
        expect(g.get_value(FILE_CONTENTS, "x.dat")).toEqual("1");
    });

    test("re-setting is persistsed", function () {
        const g = new TracedGraph(spec);
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.get_value(FILE_CONTENTS, "x.dat");

        g.set_input(FILE_CONTENTS, "x.dat", "2");
        expect(g.get_value(FILE_CONTENTS, "x.dat")).toEqual("2");
    });

    test("first setting can be read by rule", function () {
        const g = new TracedGraph(spec);

        g.set_input(FILE_CONTENTS, "x.dat", "1");
        expect(g.get_value(EXTRACT_NUMBER, "x.dat")).toBe(1);
    });

    test("re-setting can be read by rule", function () {
        const g = new TracedGraph(spec);
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.get_value(EXTRACT_NUMBER, "x.dat");

        g.set_input(FILE_CONTENTS, "x.dat", "2");
        expect(g.get_value(EXTRACT_NUMBER, "x.dat")).toEqual(2);
    });

    test("re-setting increases time", function () {
        const g = new TracedGraph(spec);
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.get_value(EXTRACT_NUMBER, "x.dat");
        g.trace = [];

        g.set_input(FILE_CONTENTS, "x.dat", "2");
        expect(g.get_value(EXTRACT_NUMBER, "x.dat")).toBe(2);
        expect(g.trace).toEqual([[EXTRACT_NUMBER, "x.dat"]]);
    });

    test("re-setting to same value does not increase time", function () {
        const g = new TracedGraph(spec);
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.get_value(EXTRACT_NUMBER, "x.dat");
        g.trace = [];

        g.set_input(FILE_CONTENTS, "x.dat", "1");
        expect(g.get_value(EXTRACT_NUMBER, "x.dat")).toBe(1);
        // If we did not notice that the new value for
        // `[FILE_CONTENTS, "x.dat"]` matches the old value, we would
        // re-evaluate `[PARSE_NUMER, "x.dat"]`.
        expect(g.trace).toEqual([]);
    });

    test("re-setting back and forth increases time", function () {
        const g = new TracedGraph(spec);
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.get_value(EXTRACT_NUMBER, "x.dat");
        g.trace = [];

        g.set_input(FILE_CONTENTS, "x.dat", "2");
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        expect(g.get_value(EXTRACT_NUMBER, "x.dat")).toBe(1);
        expect(g.trace).toEqual([[EXTRACT_NUMBER, "x.dat"]]);
    });
});

describe("basic evaluation", function () {
    test("first evaluation", function () {
        const g = new TracedGraph(spec);

        g.set_input(FILE_CONTENTS, "list.txt", "x.dat\ny.dat");
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.set_input(FILE_CONTENTS, "y.dat", "2");
        expect(g.get_value(AGGREGATE, "list.txt")).toBe(3);
        expect(g.trace).toEqual([
            [AGGREGATE, "list.txt"],
            [EXTRACT_LIST, "list.txt"],
            [EXTRACT_NUMBER, "x.dat"],
            [EXTRACT_NUMBER, "y.dat"],
        ]);
    });

    test("re-evaluation on relevant change", () => {
        const g = new TracedGraph(spec);
        g.set_input(FILE_CONTENTS, "list.txt", "x.dat\ny.dat");
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.set_input(FILE_CONTENTS, "y.dat", "2");
        g.get_value(AGGREGATE, "list.txt");
        g.trace = [];

        g.set_input(FILE_CONTENTS, "y.dat", "3");
        expect(g.get_value(AGGREGATE, "list.txt")).toBe(4);
        expect(g.trace).toEqual([
            [EXTRACT_NUMBER, "y.dat"],
            [AGGREGATE, "list.txt"],
        ]);
    });

    test("no re-evaluation when no changes", function () {
        const g = new TracedGraph(spec);
        g.set_input(FILE_CONTENTS, "list.txt", "x.dat\ny.dat");
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.set_input(FILE_CONTENTS, "y.dat", "2");
        g.get_value(AGGREGATE, "list.txt");
        g.trace = [];

        expect(g.get_value(AGGREGATE, "list.txt")).toBe(3);
        expect(g.trace).toEqual([]);
    });

    test("no re-evaluation on irrelevant changes", function () {
        const g = new TracedGraph(spec);
        g.set_input(FILE_CONTENTS, "list.txt", "x.dat\ny.dat");
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.set_input(FILE_CONTENTS, "y.dat", "2");
        g.get_value(AGGREGATE, "list.txt");
        g.trace = [];

        g.set_input(FILE_CONTENTS, "z.dat", "3");
        expect(g.get_value(AGGREGATE, "list.txt")).toBe(3);
        expect(g.trace).toEqual([]);
    });
});

describe("evaluation optimizations", function() {
    test("dependencies are evaluated only once", function() {
        const g = new TracedGraph(spec);

        g.set_input(FILE_CONTENTS, "list.txt", "x.dat\nx.dat");
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        expect(g.get_value(AGGREGATE, "list.txt")).toBe(2);
        expect(g.trace).toEqual([
            [AGGREGATE, "list.txt"],
            [EXTRACT_LIST, "list.txt"],
            [EXTRACT_NUMBER, "x.dat"],
        ]);
    });

    test("early cutoff in evaluation", function() {
        const g = new TracedGraph(spec);
        g.set_input(FILE_CONTENTS, "list.txt", "x.dat\ny.dat");
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.set_input(FILE_CONTENTS, "y.dat", "2");
        g.get_value(AGGREGATE, "list.txt");
        g.trace = [];

        g.set_input(FILE_CONTENTS, "list.txt", "x.dat\n \ny.dat\n");
        g.set_input(FILE_CONTENTS, "x.dat", " 1 ");
        expect(g.get_value(AGGREGATE, "list.txt")).toBe(3);
        // If we did not recognize that the values of `[PARSE_LIST, "list.txt"]`
        // and `[PARSE_NUMBER, "x.dat"]` are unchanged, we would re-evaluate
        // `[SUM, "list.txt"]`.
        expect(g.trace).toEqual([
            [EXTRACT_LIST, "list.txt"],
            [EXTRACT_NUMBER, "x.dat"],
        ]);
    });

    test("early cutoff in dependency check", function() {
        const g = new TracedGraph(spec);
        g.set_input(FILE_CONTENTS, "list.txt", "x.dat\ny.dat");
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.set_input(FILE_CONTENTS, "y.dat", "2");
        g.get_value(AGGREGATE, "list.txt");
        g.trace = [];

        g.set_input(FILE_CONTENTS, "list.txt", "x.dat\nz.dat");
        g.set_input(FILE_CONTENTS, "y.dat", "3");
        g.set_input(FILE_CONTENTS, "z.dat", "4");
        expect(g.get_value(AGGREGATE, "list.txt")).toBe(5);
        // If we did not cut the dependency check off early, we would
        // re-evaluate `[PARSE_NUMBER, "y.dat"]` as part of the check.
        expect(g.trace).toEqual([
            [EXTRACT_LIST, "list.txt"],
            [AGGREGATE, "list.txt"],
            [EXTRACT_NUMBER, "z.dat"],
        ]);
    });

    test("update dependencies even when value unchanged", function() {
        const g = new TracedGraph(spec);
        g.set_input(FILE_CONTENTS, "list.txt", "x.dat\ny.dat");
        g.set_input(FILE_CONTENTS, "x.dat", "1");
        g.set_input(FILE_CONTENTS, "y.dat", "2");
        g.get_value(AGGREGATE, "list.txt");
        g.set_input(FILE_CONTENTS, "list.txt", "x.dat\nz.dat");
        g.set_input(FILE_CONTENTS, "z.dat", "2");
        g.get_value(AGGREGATE, "list.txt");
        g.trace = [];

        g.set_input(FILE_CONTENTS, "y.dat", "3");
        expect(g.get_value(AGGREGATE, "list.txt")).toBe(3);
        // If we did update the dependencies even when the value has not
        // changed, we would re-evaluate `[PARSE_NUMBER, "y.dat"]` as part of
        // the dependency check.
        expect(g.trace).toEqual([]);
    });
});
