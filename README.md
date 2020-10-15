# dodice

A Dynamic On-Demand Incremental Computation Engine inspired by
[Shake](https://shakebuild.com) and [Salsa](https://salsa-rs.github.io/salsa/).

The implementation of the computation engine lives in
[`src/graph.ts`](src/graph.ts). There is a demo in
[`src/demo.ts`](src/demo.ts), that can be run via
```sh
yarn demo
```
There is also a proper test suite in [`test/graph.test.ts`](test/graph.test.ts),
which can be invoked via
```sh
yarn test
```
