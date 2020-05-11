var vertShader =
`#version 300 es
#line 4
layout(location=0) in vec3 pos;
uniform mat4 proj_view;
uniform vec3 eye_pos;
uniform vec3 volume_scale;

out vec3 vray_dir;
flat out vec3 transformed_eye;

void main(void) {
	// TODO: For non-uniform size volumes we need to transform them differently as well
	// to center them properly
	vec3 volume_translation = vec3(0.5) - volume_scale * 0.5;
	gl_Position = proj_view * vec4(pos * volume_scale + volume_translation, 1);
	transformed_eye = (eye_pos - volume_translation) / volume_scale;
	vray_dir = pos - transformed_eye;
}`;

var fragShader =
`#version 300 es
#line 24
precision highp int;
precision highp float;
uniform highp sampler3D volume;
uniform highp sampler2D colormap;
uniform highp sampler2D depth;
uniform ivec3 volume_dims;
uniform float dt_scale;
uniform ivec2 canvas_dims;
uniform vec3 volume_scale;
uniform mat4 inv_view;
uniform mat4 inv_proj;

in vec3 vray_dir;
flat in vec3 transformed_eye;
out vec4 color;

vec2 intersect_box(vec3 orig, vec3 dir) {
	const vec3 box_min = vec3(0);
	const vec3 box_max = vec3(1);
	vec3 inv_dir = 1.0 / dir;
	vec3 tmin_tmp = (box_min - orig) * inv_dir;
	vec3 tmax_tmp = (box_max - orig) * inv_dir;
	vec3 tmin = min(tmin_tmp, tmax_tmp);
	vec3 tmax = max(tmin_tmp, tmax_tmp);
	float t0 = max(tmin.x, max(tmin.y, tmin.z));
	float t1 = min(tmax.x, min(tmax.y, tmax.z));
	return vec2(t0, t1);
}

// Pseudo-random number gen from
// http://www.reedbeta.com/blog/quick-and-easy-gpu-random-numbers-in-d3d11/
// with some tweaks for the range of values
float wang_hash(int seed) {
	seed = (seed ^ 61) ^ (seed >> 16);
	seed *= 9;
	seed = seed ^ (seed >> 4);
	seed *= 0x27d4eb2d;
	seed = seed ^ (seed >> 15);
	return float(seed % 2147483647) / float(2147483647);
}

// Linearize the depth value passed in
float linearize(float d) {
	float near = 0.0;
	float far = 1.0;
	return (2.f * d - near - far) / (far - near);
}

// Reconstruct the view-space position
vec4 compute_view_pos(float z) {
	// TODO: We don't really care about the full view position here
	vec4 pos = vec4(gl_FragCoord.xy / vec2(canvas_dims) * 2.f - 1.f, z, 1.f);
	pos = inv_proj * pos;
	return pos / pos.w;
}

void main(void) {
	vec3 ray_dir = normalize(vray_dir);
	vec2 t_hit = intersect_box(transformed_eye, ray_dir);
	if (t_hit.x > t_hit.y) {
		discard;
	}
	t_hit.x = max(t_hit.x, 0.0);

	vec3 dt_vec = 1.0 / (vec3(volume_dims) * abs(ray_dir));
	float dt = dt_scale * min(dt_vec.x, min(dt_vec.y, dt_vec.z));
	float dt_correction = dt_scale;
	float offset = wang_hash(int(gl_FragCoord.x + float(canvas_dims.x) * gl_FragCoord.y));

	// Composite with the rendered geometry
	float z = linearize(texelFetch(depth, ivec2(gl_FragCoord), 0).x);
	if (z < 1.0) {
		vec3 volume_translation = vec3(0.5) - volume_scale * 0.5;
		vec3 geom_pos = (inv_view * compute_view_pos(z)).xyz;
		geom_pos = (geom_pos - volume_translation) / volume_scale;
		float geom_t = length(geom_pos - transformed_eye);

		// We want to adjust the sampling rate to still take a reasonable
		// number of samples in the volume up to the surface
		float samples = 1.f / dt;
		float newdt = (geom_t - t_hit.x) / samples;
		dt_correction = dt_scale * newdt / dt;
		dt = newdt;
		t_hit.y = geom_t;
	}

	vec3 p = transformed_eye + (t_hit.x + offset * dt) * ray_dir;
	float t;
	for (t = t_hit.x; t < t_hit.y; t += dt) {
		float val = texture(volume, p).r;
		vec4 val_color = vec4(texture(colormap, vec2(val, 0.5)).rgb, val);
		// Opacity correction
		val_color.a = 1.0 - pow(1.0 - val_color.a, dt_correction);
		color.rgb += (1.0 - color.a) * val_color.a * val_color.rgb;
		color.a += (1.0 - color.a) * val_color.a;
		if (color.a >= 0.99) {
			break;
		}
		p += ray_dir * dt;
	}
	// If we have the surface, take a final sample at the surface point
	if (z < 1.f) {
		p = transformed_eye + t_hit.y * ray_dir;
		float val = texture(volume, p).r;
		vec4 val_color = vec4(texture(colormap, vec2(val, 0.5)).rgb, val);
		// Opacity correction
		val_color.a = 1.0 - pow(1.0 - val_color.a, (t_hit.y - t) * dt_scale);
		color.rgb += (1.0 - color.a) * val_color.a * val_color.rgb;
		color.a += (1.0 - color.a) * val_color.a;
	}
}`;

var isosurfaceVertShader =
`#version 300 es
#line 119
layout(location=0) in vec3 pos;
uniform mat4 proj_view;
uniform vec3 eye_pos;
uniform vec3 volume_scale;
uniform ivec3 volume_dims;

out vec3 vpos;

void main(void) {
	vec3 volume_translation = vec3(0.5) - volume_scale * 0.5;
	// The isosurface vertices are in the volume grid space, so transform to [0, 1] first,
	// then apply the volume transform to line up with the volume
	// TODO: This should still be fine for computing the normal right?
	vpos = pos / vec3(volume_dims) * volume_scale + volume_translation;
	gl_Position = proj_view * vec4(vpos, 1.f);
}`;

var isosurfaceFragShader =
`#version 300 es
#line 139
precision highp int;
precision highp float;
uniform highp sampler2D colormap;
uniform float isovalue;
uniform vec3 eye_pos;

in vec3 vpos;

out vec4 color;

void main(void) {
	vec3 v = -normalize(vpos - eye_pos);
	//vec3 light_dir = normalize(v + vec3(0.5, 0.5, 0.5));
	vec3 light_dir = v;
	vec3 n = normalize(cross(dFdx(vpos), dFdy(vpos)));
	//vec3 base_color = (n + 1.f) * 0.5f;
	vec3 base_color = texture(colormap, vec2(isovalue, 0.5)).xyz;
	vec3 h = normalize(v + light_dir);
	// Just some Blinn-Phong shading
	color.xyz = base_color * 0.2f;
	color.xyz += 0.6 * clamp(dot(light_dir, n), 0.f, 1.f) * base_color;
	color.xyz += 0.4 * pow(clamp(dot(n, h), 0.f, 1.f), 25.f);

	color.a = 1.0;
}`;

var quadVertShader =
`#version 300 es
#line 162
const vec4 pos[4] = vec4[4](
	vec4(-1, 1, 0.5, 1),
	vec4(-1, -1, 0.5, 1),
	vec4(1, 1, 0.5, 1),
	vec4(1, -1, 0.5, 1)
);
void main(void){
	gl_Position = pos[gl_VertexID];
}`;

var quadFragShader =
`#version 300 es
#line 175
precision highp int;
precision highp float;

uniform sampler2D colors;
out vec4 color;

float linear_to_srgb(float x) {
	if (x <= 0.0031308f) {
		return 12.92f * x;
	}
	return 1.055f * pow(x, 1.f / 2.4f) - 0.055f;
}

void main(void){ 
	ivec2 uv = ivec2(gl_FragCoord.xy);
	color = texelFetch(colors, uv, 0);
    color.r = linear_to_srgb(color.r);
    color.g = linear_to_srgb(color.g);
    color.b = linear_to_srgb(color.b);
}`;

