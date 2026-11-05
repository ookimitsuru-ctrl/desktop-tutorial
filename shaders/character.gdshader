shader_type spatial;
// キャラクター用シェーダー: 頂点カラーのパレット番号で色を決め、ラップライティング＋リムで読みやすく（不透明）。
render_mode cull_back, depth_draw_opaque;

#include "res://shaders/character_common.gdshaderinc"
