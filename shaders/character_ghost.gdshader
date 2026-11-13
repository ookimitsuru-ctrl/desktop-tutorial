shader_type spatial;
// 残像用: 本体と同じ見た目を半透明で描く。深度は書いて、残像自身の手前の面だけが見えるようにする。
render_mode cull_back, depth_draw_always, blend_mix;

#define GHOST
#include "res://shaders/character_common.gdshaderinc"
