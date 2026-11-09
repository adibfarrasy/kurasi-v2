#version 460 core
#include <flutter/runtime_effect.glsl>

// Keys out the backend's turntable background colour (pure green), so the
// video can sit on the tone gradients. Distance from the key, not green
// dominance, so green garments survive unless they are near-pure green.
uniform vec2 u_size;
uniform sampler2D u_input;

out vec4 frag_color;

const vec3 KEY = vec3(0.0, 1.0, 0.0);

float keyness(vec2 uv) {
  return 1.0 - smoothstep(0.40, 0.65, distance(texture(u_input, uv).rgb, KEY));
}

void main() {
  vec2 uv = FlutterFragCoord().xy / u_size;
  vec4 c = texture(u_input, uv);
  float a = 1.0 - keyness(uv);

  // 4:2:0 video smears the key's colour a pixel or two into the figure's
  // outline. Only pixels bordering the key get their green pulled down, so
  // green garments away from the edge keep their colour.
  vec2 px = 2.0 / u_size;
  float edge = max(
      max(max(keyness(uv + vec2(px.x, 0.0)), keyness(uv - vec2(px.x, 0.0))),
          max(keyness(uv + vec2(0.0, px.y)), keyness(uv - vec2(0.0, px.y)))),
      max(max(keyness(uv + px), keyness(uv - px)),
          max(keyness(uv + vec2(px.x, -px.y)), keyness(uv + vec2(-px.x, px.y)))));
  vec3 rgb = c.rgb;
  rgb.g = mix(rgb.g, min(rgb.g, max(rgb.r, rgb.b)), max(edge, 1.0 - a));
  frag_color = vec4(rgb * a, a);
}
