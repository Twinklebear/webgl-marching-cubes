# WebGL Marching Cubes

An example of marching cubes in WebGL, using Rust + WebASM to compute the isosurface.
[Try it out online!](https://www.willusher.io/webgl-marching-cubes/)

To compile the WebAssembly version you'll need [Rust](https://www.rust-lang.org/) and wasm-pack.
After install Rust you can install wasm-pack with `cargo install wasm-pack`.
Then build the WASM code: `wasm-pack build -t web --release`, and
run a local webserver to serve the files.

# Images

![images](https://i.imgur.com/2tvnaYn.png)

