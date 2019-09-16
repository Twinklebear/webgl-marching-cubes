# WebGL Marching Cubes

This is a WebGL + WebASM implementation of the classic [Marching Cubes](https://en.wikipedia.org/wiki/Marching_cubes)
algorithm for extracting [isosurfaces](https://en.wikipedia.org/wiki/Isosurface) from 3D volume data.
An isosurface is a surface which represents points in the 3D data which all have the same value
(e.g., pressure, temperature). The isosurface extraction code is implemented in Rust and compiled
to WebAssembly to accelerate extraction of the surface. Depending on your browser,
when compared to the pure Javascript version the WebASM version is 10-50x faster!
The surface is rendered as a triangle mesh and combined with the
volume during the volume raycasting step, in a manner roughly similar to shadow mapping.
[Try it out online!](https://www.willusher.io/webgl-marching-cubes/)

To compile the WebAssembly version you'll need [Rust](https://www.rust-lang.org/) and wasm-pack.
After install Rust you can install wasm-pack with `cargo install wasm-pack`.
Then build the WASM code: `wasm-pack build -t web --release`, and
run a local webserver to serve the files.

# Images

![images](https://i.imgur.com/2tvnaYn.png)

