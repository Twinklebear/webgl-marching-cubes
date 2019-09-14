import init, {MarchingCubes} from "../pkg/marching_cubes.js";

var cubeStrip = [
	1, 1, 0,
	0, 1, 0,
	1, 1, 1,
	0, 1, 1,
	0, 0, 1,
	0, 1, 0,
	0, 0, 0,
	1, 1, 0,
	1, 0, 0,
	1, 1, 1,
	1, 0, 1,
	0, 0, 1,
	1, 0, 0,
	0, 0, 0
];

var canvas = null;
var gl = null;
var marchingCubes = null;
var isosurfaceInfo = null;

var volumeShader = null;
var volumeVao = null;
var volumeTexture = null;
var volDims = null;
var volScale = null;
var colormapTex = null;
var volumeData = null;

var isovalue = null;
var showVolume = null;
var useWebASM = null;
var currentIsovalue = -1.0;
var surfaceShader = null;
var surfaceVao = null;
var surfaceVbo = null;
var surfaceShader = null;
var isosurfaceNumVerts = 0;

var renderTargets = null;
var depthColorFbo = null
var colorFbo = null;
var blitImageShader = null;

var fileRegex = /.*\/(\w+)_(\d+)x(\d+)x(\d+)_(\w+)\.*/;
var proj = null;
var invProj = null;
var camera = null;
var projView = null;
var invView = null;
var invProj = null;

var tabFocused = true;
var newVolumeUpload = true;
var targetFrameTime = 32;
var samplingRate = 0.5;
var WIDTH = 640;
var HEIGHT = 480;

const defaultEye = vec3.set(vec3.create(), 0.5, 0.5, 1.5);
const center = vec3.set(vec3.create(), 0.5, 0.5, 0.5);
const up = vec3.set(vec3.create(), 0.0, 1.0, 0.0);

var volumes = {
	"Fuel": "7d87jcsh0qodk78/fuel_64x64x64_uint8.raw",
	"Neghip": "zgocya7h33nltu9/neghip_64x64x64_uint8.raw",
	"Hydrogen Atom": "jwbav8s3wmmxd5x/hydrogen_atom_128x128x128_uint8.raw",
	"Boston Teapot": "w4y88hlf2nbduiv/boston_teapot_256x256x178_uint8.raw",
	"Engine": "ld2sqwwd3vaq4zf/engine_256x256x128_uint8.raw",
	"Bonsai": "rdnhdxmxtfxe0sa/bonsai_256x256x256_uint8.raw",
	"Foot": "ic0mik3qv4vqacm/foot_256x256x256_uint8.raw",
	"Skull": "5rfjobn0lvb7tmo/skull_256x256x256_uint8.raw",
	"Aneurysm": "3ykigaiym8uiwbp/aneurism_256x256x256_uint8.raw",
};

var colormaps = {
	"Cool Warm": "colormaps/cool-warm-paraview.png",
	"Matplotlib Plasma": "colormaps/matplotlib-plasma.png",
	"Matplotlib Virdis": "colormaps/matplotlib-virdis.png",
	"Rainbow": "colormaps/rainbow.png",
	"Samsel Linear Green": "colormaps/samsel-linear-green.png",
	"Samsel Linear YGB 1211G": "colormaps/samsel-linear-ygb-1211g.png",
};

var loadVolume = function(file, onload) {
	var m = file.match(fileRegex);
	var volDims = [parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];
	
	var url = "https://www.dl.dropboxusercontent.com/s/" + file + "?dl=1";
	var req = new XMLHttpRequest();
	var loadingProgressText = document.getElementById("loadingText");
	var loadingProgressBar = document.getElementById("loadingProgressBar");

	loadingProgressText.innerHTML = "Loading Volume";
	loadingProgressBar.setAttribute("style", "width: 0%");

	req.open("GET", url, true);
	req.responseType = "arraybuffer";
	req.onprogress = function(evt) {
		var vol_size = volDims[0] * volDims[1] * volDims[2];
		var percent = evt.loaded / vol_size * 100;
		loadingProgressBar.setAttribute("style", "width: " + percent.toFixed(2) + "%");
	};
	req.onerror = function(evt) {
		loadingProgressText.innerHTML = "Error Loading Volume";
		loadingProgressBar.setAttribute("style", "width: 0%");
	};
	req.onload = function(evt) {
		loadingProgressText.innerHTML = "Loaded Volume";
		loadingProgressBar.setAttribute("style", "width: 100%");
		var respBuf = req.response;
		if (respBuf) {
            // TODO: We then need to copy the buffer into webasm memory space,
            // and use that buffer for the rest of the code, instead of copying it
            // in/out every call
			var dataBuffer = new Uint8Array(respBuf);
			onload(file, dataBuffer);
		} else {
			alert("Unable to load buffer properly from volume?");
			console.log("no buffer?");
		}
	};
	req.send();
}

var renderLoop = function() {
	// Save them some battery if they're not viewing the tab
	if (document.hidden) {
		return;
	}
	gl.clearColor(1.0, 1.0, 1.0, 1.0);
	gl.clearDepth(1.0);

	// Reset the sampling rate and camera for new volumes
	if (newVolumeUpload) {
		camera = new ArcballCamera(defaultEye, center, up, 2, [WIDTH, HEIGHT]);
		samplingRate = 0.5;
	}
	projView = mat4.mul(projView, proj, camera.camera);
	invView = mat4.invert(invView, camera.camera);

	var eye = [camera.invCamera[12], camera.invCamera[13], camera.invCamera[14]];

	// Render the isosurface
	gl.bindFramebuffer(gl.FRAMEBUFFER, depthColorFbo);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	gl.enable(gl.DEPTH_TEST);

	if (currentIsovalue != isovalue.value || newVolumeUpload) {
		currentIsovalue = isovalue.value;

        var triangles;
        var computeTime;
        if (useWebASM.checked) {
            var t0 = performance.now();
            triangles = marchingCubes.marching_cubes(parseFloat(currentIsovalue));
            var t1 = performance.now();
            computeTime = t1 - t0;
        } else {
            var t0 = performance.now();
            triangles = marchingCubesJS(volumeData, volDims, currentIsovalue);
            var t1 = performance.now();
            computeTime = t1 - t0;
        }
		isosurfaceNumVerts = triangles.length / 3;
        isosurfaceInfo.innerHTML = "Isosurface contains " + isosurfaceNumVerts / 3 +
            " triangles, computed in " + computeTime + "ms";

		gl.bindBuffer(gl.ARRAY_BUFFER, surfaceVbo);
		gl.bufferData(gl.ARRAY_BUFFER, triangles, gl.DYNAMIC_DRAW);
	}

	var startTime = new Date();
	// Render the isosurface if we have  one
	if (isosurfaceNumVerts > 0) {
		surfaceShader.use(gl)
		gl.disable(gl.CULL_FACE);
		gl.uniform1f(surfaceShader.uniforms["isovalue"], currentIsovalue);
		gl.uniform3iv(surfaceShader.uniforms["volume_dims"], volDims);
		gl.uniform3fv(surfaceShader.uniforms["volume_scale"], volScale);
		gl.uniform3fv(surfaceShader.uniforms["eye_pos"], eye);
		gl.uniformMatrix4fv(surfaceShader.uniforms["proj_view"], false, projView);

		gl.disable(gl.CULL_FACE);
		gl.bindVertexArray(surfaceVao);
		gl.drawArrays(gl.TRIANGLES, 0, isosurfaceNumVerts);
		gl.enable(gl.CULL_FACE);
	}

	// Render the volume on top of the isosurface
	if (showVolume.checked) {
		gl.disable(gl.DEPTH_TEST);
		gl.cullFace(gl.FRONT);
		gl.bindFramebuffer(gl.FRAMEBUFFER, colorFbo);
		gl.bindVertexArray(volumeVao);
		volumeShader.use(gl);
		gl.uniform3iv(volumeShader.uniforms["volume_dims"], volDims);
		gl.uniform3fv(volumeShader.uniforms["volume_scale"], volScale);
		gl.uniform3fv(volumeShader.uniforms["eye_pos"], eye);
		gl.uniform1f(volumeShader.uniforms["dt_scale"], samplingRate);
		gl.uniformMatrix4fv(volumeShader.uniforms["proj_view"], false, projView);
		gl.uniformMatrix4fv(volumeShader.uniforms["inv_proj"], false, invProj);
		gl.uniformMatrix4fv(volumeShader.uniforms["inv_view"], false, invView);

		gl.bindVertexArray(volumeVao);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, cubeStrip.length / 3);
	}

	// Perform final blit to the actual framebuffer, as we can't do a
	// blit framebuffer if the image is multisampled
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	gl.disable(gl.BLEND);
	gl.disable(gl.CULL_FACE);
	blitImageShader.use(gl);
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	gl.enable(gl.CULL_FACE);
	gl.enable(gl.BLEND);

	// Wait for rendering to actually finish
	gl.finish();
	var endTime = new Date();
	var renderTime = endTime - startTime;
	var targetSamplingRate = renderTime / targetFrameTime;

	// If we're dropping frames, decrease the sampling rate
	if (!newVolumeUpload && targetSamplingRate > samplingRate) {
		samplingRate = 0.8 * samplingRate + 0.2 * targetSamplingRate;
	}

	newVolumeUpload = false;
	startTime = endTime;
}

var selectVolume = function() {
	var selection = document.getElementById("volumeList").value;
	history.replaceState(history.state, "#" + selection, "#" + selection);

	loadVolume(volumes[selection], function(file, dataBuffer) {
		var m = file.match(fileRegex);
		volDims = [parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];

		var tex = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_3D, tex);
		gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, volDims[0], volDims[1], volDims[2]);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0,
			volDims[0], volDims[1], volDims[2],
			gl.RED, gl.UNSIGNED_BYTE, dataBuffer);

		var longestAxis = Math.max(volDims[0], Math.max(volDims[1], volDims[2]));
		volScale = [volDims[0] / longestAxis, volDims[1] / longestAxis,
			volDims[2] / longestAxis];

        marchingCubes.set_volume(dataBuffer, volDims[0], volDims[1], volDims[2]);

		volumeData = dataBuffer;
		newVolumeUpload = true;
		if (!volumeTexture) {
			volumeTexture = tex;
			setInterval(renderLoop, targetFrameTime);
		} else {
			gl.deleteTexture(volumeTexture);
			volumeTexture = tex;
		}
	});
}

var selectColormap = function() {
	var selection = document.getElementById("colormapList").value;
	var colormapImage = new Image();
	colormapImage.onload = function() {
		gl.activeTexture(gl.TEXTURE1);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 180, 1,
			gl.RGBA, gl.UNSIGNED_BYTE, colormapImage);
	};
	colormapImage.src = colormaps[selection];
}

var run = function(){
	fillVolumeSelector();
	fillcolormapSelector();

	isovalue = document.getElementById("isovalue");
	showVolume = document.getElementById("showVolume");
	showVolume.checked = true;

	useWebASM = document.getElementById("useWebASM");
	useWebASM.checked = true;

    isosurfaceInfo = document.getElementById("isosurfaceInfo");

	canvas = document.getElementById("glcanvas");
	gl = canvas.getContext("webgl2");
	if (!gl) {
		alert("Unable to initialize WebGL2. Your browser may not support it");
		return;
	}
	WIDTH = canvas.getAttribute("width");
	HEIGHT = canvas.getAttribute("height");

	proj = mat4.perspective(mat4.create(), 60 * Math.PI / 180.0,
		WIDTH / HEIGHT, 0.1, 100);
	invProj = mat4.invert(mat4.create(), proj);

	camera = new ArcballCamera(defaultEye, center, up, 2, [WIDTH, HEIGHT]);
	projView = mat4.create();
	invView = mat4.create();

	// Register mouse and touch listeners
	var controller = new Controller();
	controller.mousemove = function(prev, cur, evt) {
		if (evt.buttons == 1) {
			camera.rotate(prev, cur);

		} else if (evt.buttons == 2) {
			camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
		}
	};
	controller.wheel = function(amt) { camera.zoom(amt); };
	controller.pinch = controller.wheel;
	controller.twoFingerDrag = function(drag) { camera.pan(drag); };

	controller.registerForCanvas(canvas);

	// Setup VAO and VBO to render the cube to run the raymarching shader
	volumeVao = gl.createVertexArray();
	gl.bindVertexArray(volumeVao);

	var vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeStrip), gl.STATIC_DRAW);

	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

	volumeShader = new Shader(gl, vertShader, fragShader);
	volumeShader.use(gl);
	gl.uniform1i(volumeShader.uniforms["volume"], 0);
	gl.uniform1i(volumeShader.uniforms["colormap"], 1);
	gl.uniform1i(volumeShader.uniforms["depth"], 4);
	gl.uniform1f(volumeShader.uniforms["dt_scale"], 1.0);
	gl.uniform2iv(volumeShader.uniforms["canvas_dims"], [WIDTH, HEIGHT]);

	surfaceVao = gl.createVertexArray();
	surfaceVbo = gl.createBuffer();
	gl.bindVertexArray(surfaceVao);
	gl.bindBuffer(gl.ARRAY_BUFFER, surfaceVbo);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

	surfaceShader = new Shader(gl, isosurfaceVertShader, isosurfaceFragShader);
	surfaceShader.use(gl);
	gl.uniform1i(surfaceShader.uniforms["colormap"], 1);

	blitImageShader = new Shader(gl, quadVertShader, quadFragShader);
	blitImageShader.use(gl);
	// Final colors will be on texture unit 3
	gl.uniform1i(blitImageShader.uniforms["colors"], 3);

	// Setup required OpenGL state for drawing the back faces and
	// composting with the background color
	gl.enable(gl.CULL_FACE);
	gl.cullFace(gl.FRONT);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

	// See if we were linked to a datset
	if (window.location.hash) {
		var linkedDataset = decodeURI(window.location.hash.substr(1));
		if (linkedDataset in volumes) {
			document.getElementById("volumeList").value = linkedDataset;
		}
	}

	// Setup the framebuffers for opaque geometry pass and volume composite
	renderTargets = [gl.createTexture(), gl.createTexture()]
	gl.bindTexture(gl.TEXTURE_2D, renderTargets[0]);
	gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, WIDTH, HEIGHT);

	gl.bindTexture(gl.TEXTURE_2D, renderTargets[1]);
	gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, WIDTH, HEIGHT);

	for (var i = 0; i < 2; ++i) {
		gl.bindTexture(gl.TEXTURE_2D, renderTargets[i]);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	gl.activeTexture(gl.TEXTURE3);
	gl.bindTexture(gl.TEXTURE_2D, renderTargets[0]);
	gl.activeTexture(gl.TEXTURE4);
	gl.bindTexture(gl.TEXTURE_2D, renderTargets[1]);

	depthColorFbo = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, depthColorFbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D, renderTargets[0], 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
		gl.TEXTURE_2D, renderTargets[1], 0);
	gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

	colorFbo = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, colorFbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
		gl.TEXTURE_2D, renderTargets[0], 0);
	gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

	// Load the default colormap and upload it, after which we
	// load the default volume.
	var colormapImage = new Image();
	colormapImage.onload = function() {
		var colormap = gl.createTexture();
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, colormap);
		gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 180, 1);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 180, 1,
			gl.RGBA, gl.UNSIGNED_BYTE, colormapImage);

		selectVolume();
	};
	colormapImage.src = "colormaps/cool-warm-paraview.png";
}

var fillVolumeSelector = function() {
	var selector = document.getElementById("volumeList");
	for (var v in volumes) {
		var opt = document.createElement("option");
		opt.value = v;
		opt.innerHTML = v;
		selector.appendChild(opt);
	}
    selector.addEventListener("change", selectVolume);
}

var fillcolormapSelector = function() {
	var selector = document.getElementById("colormapList");
	for (var p in colormaps) {
		var opt = document.createElement("option");
		opt.value = p;
		opt.innerHTML = p;
		selector.appendChild(opt);
	}
    selector.addEventListener("change", selectColormap);
}

window.onload = function() {
    init("pkg/marching_cubes_bg.wasm").then(() => {
        marchingCubes = MarchingCubes.new();
        run();
    });
}

