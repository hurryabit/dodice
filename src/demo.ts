/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { Graph, GraphReader, GraphSpec, INPUT, RULE } from './graph';

/*
PROBLEM DESCRIPTION:

We have files looking like

*.lst: foo.dat,bar.dat
*.dat: 13

Running a *.lst file means going into all the listed *.dat files,
getting the number in there, and summing them up.
*/

const FILE_CONTENTS = "FILE_CONTENTS"; // string
const PARSE_LST = "PARSE_LST"; // string[]
const PARSE_DAT = "PARSE_DAT"; // number
const EVALUATE_LST = "EVALUATE_LST"; // number

const files : {[k : string] : string} = {};

const spec: GraphSpec = {
    [FILE_CONTENTS]: {kind: INPUT, fn : (file : string) => {
        return files[file];
    }},
    [PARSE_LST]:  {kind: RULE, fn : (g: GraphReader, file: string): string[] => {
        const contents = g.get_value(FILE_CONTENTS, file) as string;
        console.log(`${PARSE_LST}(${file})`);
        return contents.split(",");
    }},
    [PARSE_DAT]: {kind: RULE, fn: (g: GraphReader, file: string): number => {
        const contents = g.get_value(FILE_CONTENTS, file) as string;
        console.log(`${PARSE_DAT}(${file})`);
        return Number.parseInt(contents.trim());
    }},
    [EVALUATE_LST]: {kind: RULE, fn: (g: GraphReader, file: string): number => {
        const list = g.get_value(PARSE_LST, file) as string[];
        const numbers = list.map(item => g.get_value(PARSE_DAT, item) as number);
        console.log(`${EVALUATE_LST}(${file})`);
        return numbers.reduce((x, y) => x + y, 0);
    },
}};

const g = new Graph(spec);

files["main.lst"] = "foo.dat,bar.dat";
files["foo.dat"] = "13";
files["bar.dat"] = "42";
console.log(`=> ${g.get_value(EVALUATE_LST, "main.lst")}`);
// expected output:
// PARSE_LST(main.lst)
// PARSE_DAT(foo.dat)
// PARSE_DAT(bar.dat)
// EVALUATE_LST(main.lst)
// => 55

files["bar.dat"] = "24";
console.log(`=> ${g.get_value(EVALUATE_LST, "main.lst")}`);
// expected output:
// PARSE_DAT(bar.dat)
// EVALUATE_LST(main.lst)
// => 37

files["bar.dat"] = "  24  ";
console.log(`=> ${g.get_value(EVALUATE_LST, "main.lst")}`);
// expected output:
// PARSE_DAT(bar.dat)
// => 37

console.log(`=> ${g.get_value(EVALUATE_LST, "main.lst")}`);
// expected output:
// => 37
files["main.lst"] = "foo.dat,baz.dat";
files["foo.dat"] = "13";
files["baz.dat"] = "0";
console.log(`=> ${g.get_value(EVALUATE_LST, "main.lst")}`);
// expected output:
// PARSE_LST(main.lst)
// PARSE_DAT(baz.dat)
// EVALUATE_LST(main.lst)
// => 13
