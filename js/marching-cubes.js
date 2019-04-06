
// Compute the vertex values of the cell given the ID of its bottom vertex
var computeVertexValues = function(volume, dims, cell, values) {
	for (var k = 0; k < 2; ++k) {
		for (var j = 0; j < 2; ++j) {
			for (var i = 0; i < 2; ++i) {
				var voxel = ((cell[2] + k) * dims[1] + cell[1] + j) * dims[0] + cell[0] + i;
				var x = volume[voxel];
				values[(k * 2 + j) * 2 + i ] = x / 255.0;
			}
		}
	}
	return values;
}

// Run the Marching Cubes algorithm on the volume to compute
// the isosurface at the desired value. The volume is assumed
// to be a Uint8Array, with one uint8 per-voxel.
// Dims should give the [x, y, z] dimensions of the volume
var marchingCubes = function(volume, dims, isovalue) {
	var triangles = [];
	var vertexValues = [0, 0, 0, 0, 0, 0, 0, 0];
	for (var k = 0; k < dims[2] - 1; ++k) {
		for (var j = 0; j < dims[1] - 1; ++j) {
			for (var i = 0; i < dims[0] - 1; ++i) {
				computeVertexValues(volume, dims, [i, j, k], vertexValues);
				var index = 0;
				for (var v = 0; v < vertexValues.length; ++v) {
					if (vertexValues[v] > isovalue) {
						index = index | (1 << v);
					}
				}
				// All vertices are above or below the isovalue
				if (index == 0 || (index & 255) == 255) {
					continue;
				} else {
					// NOTE: The vertex positions need to be placed on the dual grid,
					// since that's where the isosurface is computed and defined.
					// Testing: make a triangle for each voxel
					// that cuts it in half
					triangles.push(i); triangles.push(j); triangles.push(k);
					triangles.push(i + 1); triangles.push(j); triangles.push(k);
					triangles.push(i); triangles.push(j + 1); triangles.push(k + 1);
				}
			}
		}
	}
	return triangles;
}

